/**
 * SQLite driver abstraction.
 *
 * The platform is built against better-sqlite3 (fast, widely deployed). Some
 * sandboxes and locked-down build environments cannot compile native addons
 * (no access to node headers), which would otherwise make the whole platform
 * impossible to start. To keep the app runnable everywhere we:
 *
 *   1. use better-sqlite3 when it is installed and loadable, and
 *   2. fall back to Node's built-in `node:sqlite` (Node >= 22.5) otherwise.
 *
 * Both are exposed through one small, synchronous API:
 *
 *   db.prepare(sql) -> { run(params), get(params), all(params), iterate(params) }
 *   db.exec(sql)
 *   db.pragma(sql)
 *   db.transaction(fn) -> wrapped function
 *   db.close()
 *
 * Parameters may be passed as an array (positional `?` placeholders) or as
 * individual arguments, exactly like better-sqlite3. Values are normalised so
 * `undefined` becomes NULL and booleans become 1/0 (both drivers reject raw
 * booleans/undefined, which used to throw at runtime).
 */
'use strict';

/** Coerce a single bound value into something SQLite drivers accept. */
function normalizeValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value;
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array)) {
    // Plain objects are not bindable anywhere — store them as JSON instead of
    // throwing a cryptic driver error mid-request.
    return JSON.stringify(value);
  }
  return value;
}

/** Normalise a parameter list (array, single value, or named object). */
function normalizeParams(params) {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return params.map(normalizeValue);
  if (typeof params === 'object' && !(params instanceof Uint8Array)) {
    // Named parameters (better-sqlite3 style: { id: 1 }). The node:sqlite
    // fallback does not support these, so they are converted to a positional
    // list in key order — which works as long as the SQL uses `?`.
    const values = Object.values(params).map(normalizeValue);
    return values;
  }
  return [normalizeValue(params)];
}

/** Rows returned by node:sqlite have a null prototype — give them a normal one. */
function toPlainRow(row) {
  if (!row) return row;
  const out = {};
  for (const key of Object.keys(row)) out[key] = row[key];
  return out;
}

/** Wrap a better-sqlite3 database (behaviour is already what we want). */
function wrapBetterSqlite(db) {
  const prepared = new Map();
  const isNamedBag = (v) =>
    !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array) && !(v instanceof Date);

  const prepare = (sql) => {
    let stmt = prepared.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      prepared.set(sql, stmt);
    }
    return {
      run: (...args) => {
        // A single plain object means better-sqlite3 named parameters.
        const params = args.length === 1 && isNamedBag(args[0])
          ? args[0]
          : args.length === 1 ? normalizeParams(args[0]) : normalizeParams(args);
        return stmt.run(params);
      },
      get: (...args) => {
        const params = args.length === 0 ? [] : normalizeParams(args.length === 1 ? args[0] : args);
        return stmt.get(params);
      },
      all: (...args) => {
        const params = args.length === 0 ? [] : normalizeParams(args.length === 1 ? args[0] : args);
        return stmt.all(params);
      },
      iterate: (...args) => {
        const params = args.length === 0 ? [] : normalizeParams(args.length === 1 ? args[0] : args);
        return stmt.iterate(params);
      },
    };
  };

  return {
    driver: 'better-sqlite3',
    raw: db,
    prepare,
    exec: (sql) => db.exec(sql),
    pragma: (sql) => db.pragma(sql),
    transaction: (fn) => db.transaction(fn),
    close: () => db.close(),
  };
}

/** Wrap Node's built-in DatabaseSync (no native compilation required). */
function wrapNodeSqlite(db) {
  let depth = 0;

  const prepare = (sql) => {
    const stmt = db.prepare(sql);
    const bind = (args) => {
      // node:sqlite needs positional arguments spread out; a single array is
      // interpreted as a named-parameter bag and throws.
      if (args.length === 0) return [];
      if (args.length === 1 && Array.isArray(args[0])) return args[0].map(normalizeValue);
      if (args.length === 1 && args[0] && typeof args[0] === 'object' && !(args[0] instanceof Uint8Array)) {
        return Object.values(args[0]).map(normalizeValue);
      }
      return args.map(normalizeValue);
    };
    return {
      run: (...args) => {
        const result = stmt.run(...bind(args));
        return {
          changes: Number(result.changes),
          lastInsertRowid: Number(result.lastInsertRowid),
        };
      },
      get: (...args) => toPlainRow(stmt.get(...bind(args))),
      all: (...args) => stmt.all(...bind(args)).map(toPlainRow),
      *iterate(...args) {
        for (const row of stmt.iterate(...bind(args))) yield toPlainRow(row);
      },
    };
  };

  /** Savepoint-based transactions so nested tx() calls behave like better-sqlite3. */
  function transaction(fn) {
    return function wrapped(...args) {
      const name = `scp_tx_${depth}`;
      if (depth === 0) db.exec('BEGIN');
      else db.exec(`SAVEPOINT ${name}`);
      depth += 1;
      try {
        const result = fn(...args);
        depth -= 1;
        db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
        return result;
      } catch (err) {
        depth -= 1;
        try {
          db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}`);
          if (depth > 0) db.exec(`RELEASE ${name}`);
        } catch { /* rollback must not mask the original error */ }
        throw err;
      }
    };
  }

  return {
    driver: 'node:sqlite',
    raw: db,
    prepare,
    exec: (sql) => db.exec(sql),
    pragma: (sql) => {
      // node:sqlite has no pragma() helper; PRAGMA reads go through prepare().
      return db.exec(`PRAGMA ${sql}`);
    },
    transaction,
    close: () => db.close(),
  };
}

/**
 * Open a SQLite database, preferring better-sqlite3 and falling back to the
 * built-in driver. `driver` on the result tells you which one was used.
 */
function openDatabase(file, options = {}) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(file, options);
    // Touch the handle to be sure the native binding really works.
    db.prepare('SELECT 1 AS ok').get();
    return wrapBetterSqlite(db);
  } catch (err) {
    let DatabaseSync;
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch {
      throw new Error(
        'No SQLite driver available. Install better-sqlite3 (npm install) or run on Node >= 22.5, ' +
        'which ships the built-in node:sqlite driver. Original error: ' + err.message
      );
    }
    if (process.env.SUPPRESS_SQLITE_FALLBACK_WARNING !== 'true') {
      console.warn(
        `[db] better-sqlite3 unavailable (${err.message.split('\n')[0]}); ` +
        'falling back to the built-in node:sqlite driver.'
      );
    }
    return wrapNodeSqlite(new DatabaseSync(file));
  }
}

module.exports = { openDatabase, normalizeParams, normalizeValue };

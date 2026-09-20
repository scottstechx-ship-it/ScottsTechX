/**
 * Term calendar — the single source of truth for "which term is this?".
 *
 * Term windows are used in two places:
 *   - stamping each attendance mark with its term/year, so a term report is an
 *     exact lookup instead of a guess from dates;
 *   - reporting over older rows that were recorded before those columns
 *     existed (they are matched by date range).
 *
 * Defaults are the Ministry of Education & Sports calendar for 2026 (Term 1:
 * 2 Feb – 1 May, Term 2: 25 May – 22 Aug, Term 3: 14 Sep – 4 Dec). Schools on
 * a different calendar can override any year through Settings →
 * `school.termDates = { "2026": { "Term 1": { "start": "2026-02-02", "end": "2026-05-01" } } }`.
 * For a year nobody has defined, the window is null and the report says so
 * instead of inventing dates.
 */
const { readSettings } = require('./settingsService');

const TERM_NAMES = ['Term 1', 'Term 2', 'Term 3'];

const DEFAULT_TERM_DATES = {
  2026: {
    'Term 1': { start: '2026-02-02', end: '2026-05-01' },
    'Term 2': { start: '2026-05-25', end: '2026-08-22' },
    'Term 3': { start: '2026-09-14', end: '2026-12-04' },
  },
};

/** Normalise anything ("term 2", "Term2", 2) to a canonical term name. */
function normaliseTerm(input) {
  if (input === undefined || input === null || input === '') return null;
  const raw = String(input).trim().toLowerCase().replace(/[-_]/g, ' ');
  const m = raw.match(/([123])/);
  if (!m) return null;
  return `Term ${m[1]}`;
}

/** Overrides from Settings, merged over the built-in defaults. */
function termDates() {
  let custom = {};
  try {
    const settings = readSettings();
    const configured = settings && settings.school && settings.school.termDates;
    if (configured && typeof configured === 'object') custom = configured;
  } catch { /* settings not readable yet — fall back to the defaults */ }

  const merged = {};
  for (const [year, terms] of Object.entries(DEFAULT_TERM_DATES)) merged[year] = { ...terms };
  for (const [year, terms] of Object.entries(custom)) {
    if (!terms || typeof terms !== 'object') continue;
    merged[year] = { ...(merged[year] || {}) };
    for (const [name, range] of Object.entries(terms)) {
      const key = normaliseTerm(name);
      if (!key || !range) continue;
      const start = String(range.start || '').slice(0, 10);
      const end = String(range.end || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(start)) merged[year][key] = { start, end: /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : start };
    }
  }
  return merged;
}

/** { term, year, from, to } for one term, or null when the year has no calendar. */
function termWindow(term, year) {
  const key = normaliseTerm(term);
  const y = String(year || '').slice(0, 4);
  if (!key || !/^\d{4}$/.test(y)) return null;
  const range = (termDates()[y] || {})[key];
  return {
    term: key,
    year: y,
    from: range ? range.start : null,
    to: range ? range.end : null,
    configured: !!range,
  };
}

/** The term a given date falls in, from the calendar (falls back to the year). */
function currentTerm(date) {
  const day = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const year = day.slice(0, 4);
  const table = termDates()[year] || {};
  for (const name of TERM_NAMES) {
    const r = table[name];
    if (r && day >= r.start && day <= r.end) return { term: name, year };
  }
  // outside every window: nearest term by start date, so marks are still tagged
  let best = null;
  for (const name of TERM_NAMES) {
    const r = table[name];
    if (!r) continue;
    const diff = day < r.start ? (new Date(r.start) - new Date(day)) : (new Date(day) - new Date(r.end));
    if (!best || diff < best.diff) best = { term: name, year, diff };
  }
  return best ? { term: best.term, year } : { term: null, year };
}

/** All terms the school has a calendar for, newest first — for pickers. */
function availableTerms() {
  const table = termDates();
  const out = [];
  for (const year of Object.keys(table).sort().reverse()) {
    for (const name of TERM_NAMES) {
      const r = table[year][name];
      if (r) out.push({ term: name, year, from: r.start, to: r.end });
    }
  }
  return out;
}

module.exports = { TERM_NAMES, normaliseTerm, termDates, termWindow, currentTerm, availableTerms };

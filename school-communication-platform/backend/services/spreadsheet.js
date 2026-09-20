'use strict';
/**
 * Spreadsheet reading for the bulk-import feature (students / teachers / fees).
 *
 * This module replaces the abandoned `xlsx` package, which still carries two
 * unfixed high-severity advisories — prototype pollution
 * (GHSA-4r6h-8v6p-xvw6) and a regular-expression DoS during parsing
 * (GHSA-5pgg-2g8v-p4x9). CSV is parsed here with a small RFC 4180 reader and
 * `.xlsx` is read with `read-excel-file`, which has no known advisories.
 *
 * Legacy binary `.xls` (BIFF, Excel 97–2003) is deliberately NOT supported any
 * more: there is no dependency-free parser for it. Callers turn that into a
 * friendly "save as .xlsx or CSV" message.
 */

const fs = require('fs');
const readXlsxFile = require('read-excel-file/node');

const SUPPORTED_EXTENSIONS = ['csv', 'xlsx'];

/** Header names that would pollute a prototype if copied onto a plain object. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Parse CSV text into a matrix of cell strings (RFC 4180).
 *
 * Handles: quoted fields, `""` escapes, commas/newlines inside quotes, CRLF or
 * LF line endings, a UTF-8 BOM, and files whose last line has no terminator.
 * The delimiter is auto-detected (`,` `;` or tab) so spreadsheets exported by
 * Excel in European locales still import correctly.
 */
function parseCsv(text) {
  let src = String(text == null ? '' : text);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // strip BOM

  const firstBreak = src.search(/\r?\n/);
  const firstLine = firstBreak === -1 ? src : src.slice(0, firstBreak);
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  };
  let delimiter = ',';
  if (counts[','] === 0 && counts[';'] > 0) delimiter = ';';
  else if (counts[','] === 0 && counts['\t'] > 0) delimiter = '\t';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row); row = [];
      continue;
    }
    if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
      continue;
    }
    field += ch;
  }

  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  // drop trailing rows that are entirely empty (common from Excel exports)
  while (rows.length) {
    const last = rows[rows.length - 1];
    if (last.some((cell) => String(cell).trim() !== '')) break;
    rows.pop();
  }
  return rows;
}

/**
 * Normalise one spreadsheet cell to the string/number shapes the validators
 * expect. Dates become `YYYY-MM-DD` (so an Excel date column imports as a real
 * date instead of the raw serial number the old parser produced).
 */
function normalizeCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value).trim();
}

/** Turn a matrix of rows into header-keyed objects, skipping prototype keys. */
function rowsToObjects(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const headerRow = rows[0].map((h) => String(normalizeCell(h)).trim());
  const out = [];
  for (const raw of rows.slice(1)) {
    if (!Array.isArray(raw) || raw.every((cell) => String(normalizeCell(cell)).trim() === '')) continue;
    const row = {};
    headerRow.forEach((header, index) => {
      if (!header || DANGEROUS_KEYS.has(header.toLowerCase())) return;
      if (Object.prototype.hasOwnProperty.call(row, header)) return;
      row[header] = normalizeCell(raw[index]);
    });
    out.push(row);
  }
  return out;
}

/** Read `.xlsx` (first worksheet) into header-keyed row objects. */
async function readXlsx(filePath) {
  const sheets = await readXlsxFile(filePath);
  const first = Array.isArray(sheets) && sheets[0] && Array.isArray(sheets[0].data)
    ? sheets[0].data
    : sheets;
  return rowsToObjects(Array.isArray(first) ? first : []);
}

/**
 * Read an uploaded CSV or .xlsx file into header-keyed row objects.
 * Throws with a `.status` for the caller to surface when the file is unusable.
 */
async function readSpreadsheet(filePath, ext) {
  const kind = String(ext || '').toLowerCase().replace(/^\./, '');
  if (!SUPPORTED_EXTENSIONS.includes(kind)) {
    throw Object.assign(new Error('unsupported'), { status: 400 });
  }
  if (kind === 'csv') {
    return rowsToObjects(parseCsv(fs.readFileSync(filePath, 'utf8')));
  }
  return readXlsx(filePath);
}

module.exports = { parseCsv, rowsToObjects, normalizeCell, readSpreadsheet, SUPPORTED_EXTENSIONS, DANGEROUS_KEYS };

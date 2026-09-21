'use strict';
/**
 * Minimal, dependency-free ZIP support (built-in zlib only).
 *
 * The import pipeline needs both directions:
 *   - READ  a .zip of report cards (or any bulk upload) → the individual files
 *   - WRITE the "starter pack" of import templates → one download
 *
 * Writing uses the STORE method (no compression): a CSV of templates is tiny,
 * and stored entries cannot be corrupted by a compression bug. Reading handles
 * both STORE and DEFLATE (what every zip tool produces by default) and ignores
 * directories and unsupported methods instead of throwing, so a stray macOS
 * "__MACOSX/…" entry never breaks an import.
 */
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Entries we never want to import: directories, macOS resource forks, Office locks. */
function isJunkEntry(name) {
  const n = String(name || '');
  if (!n || n.endsWith('/') || n.endsWith('\\')) return true;
  if (n.startsWith('__MACOSX/') || n.includes('/__MACOSX/')) return true;
  if (n.startsWith('._') || n.includes('/._')) return true;
  const base = n.split(/[\\/]/).pop() || '';
  if (base === '.DS_Store' || base.startsWith('~$')) return true;
  return false;
}

/**
 * Read a zip buffer into [{ name, data, size }].
 * Scans for central-directory entries (0x02014b50) so entries written with a
 * data descriptor (streamed zips) still resolve correctly.
 */
function readZip(buffer, { maxEntries = 5000, maxTotalBytes = 200 * 1024 * 1024 } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const out = [];
  let total = 0;

  // locate the End Of Central Directory record (last 22 bytes + optional comment)
  let eocd = -1;
  const scanFrom = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= scanFrom; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw Object.assign(new Error('That file is not a valid zip archive.'), { status: 400 });

  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (entryCount > maxEntries) throw Object.assign(new Error(`That archive holds too many files (${entryCount}). Maximum is ${maxEntries}.`), { status: 400 });

  for (let n = 0; n < entryCount; n += 1) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
    offset += 46 + nameLen + extraLen + commentLen;

    if (isJunkEntry(name)) continue;
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) continue;

    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try { data = zlib.inflateRawSync(raw); }
      catch { continue; }                       // damaged entry: skip, never crash the import
    } else continue;                            // unsupported method (rare): skip

    if (uncompressedSize && data.length !== uncompressedSize) { /* tolerant: use what we got */ }
    total += data.length;
    if (total > maxTotalBytes) throw Object.assign(new Error('That archive is too large to unpack. Split it into smaller uploads.'), { status: 413 });
    out.push({ name, data, size: data.length });
  }
  return out;
}

/** Build a zip buffer from [{ name, data }] using STORE (no compression). */
function writeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(String(f.name), 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);             // version needed
    local.writeUInt16LE(0x0800, 6);         // UTF-8 filename flag
    local.writeUInt16LE(0, 8);              // STORE
    local.writeUInt16LE(0, 10);             // time
    local.writeUInt16LE(0x21, 12);          // date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

module.exports = { readZip, writeZip, crc32, isJunkEntry };

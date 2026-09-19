/**
 * PAGE ASSET INTEGRITY test — every page the server serves must actually
 * resolve every script, stylesheet and image it references.
 *
 * This catches the class of bug where a page points at a file that no longer
 * exists (e.g. a deleted '../js/' tree): the page loads, shows a blank screen
 * and silently does nothing, because every script 404s.
 *
 * Run: node tests/pages.test.js   (requires the server on :4000)
 */
const fs = require('fs');
const path = require('path');
const posix = path.posix;

const BASE = 'http://localhost:4000';
const FRONTEND = path.join(__dirname, '..', 'frontend');

function pageUrl(rel) {
  const p = rel.split(path.sep).join('/');
  return '/' + (p.endsWith('index.html') ? p.slice(0, -'index.html'.length) : p);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/** local refs only: skip external URLs, in-page anchors and data URIs */
function localRefs(html) {
  const refs = new Set();
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    if (!u || u.startsWith('http') || u.startsWith('//') || u.startsWith('#') ||
        u.startsWith('mailto:') || u.startsWith('tel:') || u.startsWith('data:') ||
        u.startsWith('/api')) continue;
    if (u.includes("' +") || u.includes('+ esc(')) continue; // built at runtime
    refs.add(u);
  }
  return [...refs];
}

async function status(url) {
  try {
    const res = await fetch(BASE + url, { method: 'GET' });
    return res.status;
  } catch (e) {
    return 'ERR';
  }
}

(async () => {
  const pages = walk(FRONTEND).sort();
  let failures = 0;
  let checked = 0;

  for (const file of pages) {
    const rel = path.relative(FRONTEND, file);
    const url = pageUrl(rel);
    const html = fs.readFileSync(file, 'utf8');
    // a trailing slash means the URL *is* the directory, not a file
    const base = url.endsWith('/') ? url : posix.dirname(url);
    const bad = [];

    for (const ref of localRefs(html)) {
      const full = ref.startsWith('/') ? ref : posix.normalize(posix.join(base, ref));
      const code = await status(full);
      checked++;
      if (code !== 200) bad.push(`${code} ${full}`);
    }

    if (bad.length) {
      failures++;
      console.log(`x ${url}`);
      for (const b of bad.slice(0, 10)) console.log(`    ${b}`);
      if (bad.length > 10) console.log(`    ... +${bad.length - 10} more`);
    }
  }

  console.log(`\n${checked} assets checked across ${pages.length} pages.`);
  console.log(failures === 0
    ? 'OK EVERY PAGE RESOLVES ALL OF ITS SCRIPTS, STYLES AND IMAGES'
    : `FAIL ${failures} page(s) reference missing assets`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('Harness error:', e); process.exit(1); });

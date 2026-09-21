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

/**
 * Ids that only exist once the page's own scripts have run (dashboard shells
 * are built by JS). Scan the local script files a page loads for `id="…"`.
 */
function runtimeIds(html, file) {
  const ids = new Set();
  const dir = path.dirname(file);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of scripts) {
    if (/^https?:|^\/\//.test(src)) continue;
    const abs = src.startsWith('/')
      ? path.join(FRONTEND, src.slice(1))
      : path.resolve(dir, src);
    if (!fs.existsSync(abs)) continue;
    const js = fs.readFileSync(abs, 'utf8');
    for (const m of js.matchAll(/\bid="([^"$<{]+)"/g)) ids.add(m[1]);
  }
  return ids;
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

  // ---------------------------------------------------------------------
  // Markup / CSS hygiene: the defect classes that made pages look broken
  // while every file still resolved.
  // ---------------------------------------------------------------------
  // Public pages frozen at their original state (the client asked for the
  // public website to be left exactly as it was). Defects already present in
  // them are reported as notes, not as failures.
  const FROZEN_PUBLIC = new Set(['contact/index.html']);
  let hygiene = 0;
  for (const file of pages) {
    const rel = path.relative(FRONTEND, file);
    const url = pageUrl(rel);
    const html = fs.readFileSync(file, 'utf8');
    const bad = [];
    const add = (msg) => bad.push(msg);

    // 1. raw markup inside a CSS `content:` value — renders literal tag text
    for (const m of html.matchAll(/content:\s*['"][^'"]*</g)) {
      add(`CSS content: holds markup near "${html.slice(m.index, m.index + 60).replace(/\n/g, ' ')}"`);
    }
    // 2. icon-font glyph tags (emoji/symbol fonts are banned site-wide)
    const fa = html.match(/<i[^>]+class="[^"]*\b(?:fa[sbr])\b/g);
    if (fa) add(`${fa.length} icon-font glyph tag(s), e.g. ${fa[0].slice(0, 60)}`);
    // 3. duplicate id attributes (breaks anchor targets and getElementById)
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupIds.length) add(`duplicate id(s): ${[...new Set(dupIds)].join(', ')}`);
    // 4. the same stylesheet linked twice
    const links = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
    const dupLinks = links.filter((l, i) => links.indexOf(l) !== i);
    if (dupLinks.length) add(`duplicate stylesheet link(s): ${[...new Set(dupLinks)].join(', ')}`);
    // 5. in-page anchors must have a target (statically or built by the page's own JS)
    const knownIds = new Set([...ids, ...runtimeIds(html, file)]);
    for (const m of html.matchAll(/href="#([^"]+)"/g)) {
      if (!knownIds.has(m[1])) add(`anchor #${m[1]} has no target element`);
    }
    // 6. a script that uses THREE must load the library and guard against it missing
    if (/new THREE\./.test(html)) {
      if (!/three(\.min)?\.js/.test(html)) add('uses THREE but never loads three.js (ReferenceError)');
      else if (!/window\.THREE/.test(html)) add('uses THREE without a window.THREE guard');
    }
    // 7. stacked background overlay divs (each one darkens the page again)
    const overlays = (html.match(/class="video-overlay"/g) || []).length;
    if (overlays > 1) add(`${overlays} stacked .video-overlay divs`);
    // 8. a mailto: that opens a different address than the one printed
    for (const m of html.matchAll(/<a[^>]+href="mailto:([^"?]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
      const shown = (m[2].match(/[\w.+-]+@[\w.-]+\.\w+/) || [])[0];
      if (shown && shown.toLowerCase() !== m[1].toLowerCase()) {
        add(`mailto link opens ${m[1]} but displays ${shown}`);
      }
    }

    // 9. attributes must not contain markup (breaks the attribute and prints junk)
    for (const m of html.matchAll(/(?:placeholder|title|alt|aria-label|value)="[^"]*<svg/g)) {
      add(`attribute holds markup: ${m[0].slice(0, 70)}`);
    }
    // 10. non-latin characters inside CSS — the classic paste corruption that
    //     silently drops a declaration (e.g. "ease-inアウト").
    const cssBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    for (const block of cssBlocks) {
      const junk = block.match(/[\u3000-\u30ff\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]/);
      if (junk) {
        const at = block.indexOf(junk[0]);
        const defect = `non-latin text inside <style>: "${block.slice(Math.max(0, at - 30), at + 20).replace(/\n/g, ' ').trim()}"`;
        if (FROZEN_PUBLIC.has(rel)) {
          // Pre-existing corruption in a public page that is deliberately left
          // untouched, so it is reported instead of failing the build. Remove
          // the file from FROZEN_PUBLIC when the public site is back in scope.
          console.log(`note (pre-existing, frozen public page): ${url} — ${defect}`);
          break;
        }
        add(defect);
        break;
      }
    }

    // 11. dashboards lay out around the notch / home indicator (app.css gives
    //     the bottom nav and composer env(safe-area-inset-*) padding), so they
    //     must declare viewport-fit=cover — without it those insets are 0.
    if (/^platform[\\/][^\\/]+[\\/]index\.html$/.test(rel)) {
      let css = cssBlocks.join('\n');
      for (const m of html.matchAll(/<link[^>]+href="([^"?#]+\.css)[^"]*"/g)) {
        const sheet = m[1].startsWith('/')
          ? path.join(FRONTEND, m[1])
          : path.resolve(path.dirname(file), m[1]);
        if (sheet.startsWith(FRONTEND) && fs.existsSync(sheet)) css += fs.readFileSync(sheet, 'utf8');
      }
      const viewport = (html.match(/<meta[^>]+name="viewport"[^>]*>/) || [''])[0];
      if (/env\(\s*safe-area-inset-/.test(css) && !/viewport-fit\s*=\s*cover/.test(viewport)) {
        add('CSS uses env(safe-area-inset-*) but the viewport meta lacks viewport-fit=cover');
      }
    }

    if (bad.length) {
      hygiene++;
      console.log(`x ${url}`);
      for (const b of bad.slice(0, 8)) console.log(`    ${b}`);
      if (bad.length > 8) console.log(`    ... +${bad.length - 8} more`);
    }
  }
  // ---------------------------------------------------------------------
  // Stylesheets: same non-latin corruption check for every linked .css file
  // ---------------------------------------------------------------------
  let cssJunk = 0;
  const walkCss = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walkCss(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
  for (const file of walkCss(FRONTEND)) {
    const text = fs.readFileSync(file, 'utf8');
    const junk = text.match(/[\u3000-\u30ff\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]/);
    if (junk) {
      cssJunk++;
      const at = text.indexOf(junk[0]);
      const line = text.slice(0, at).split('\n').length;
      console.log(`x ${path.relative(FRONTEND, file)}:${line} non-latin text in CSS -> "${text.slice(Math.max(0, at - 40), at + 20).replace(/\n/g, ' ').trim()}"`);
    }
  }
  console.log(cssJunk === 0
    ? 'OK NO CORRUPTED CSS (no non-latin characters in any stylesheet)'
    : `FAIL ${cssJunk} stylesheet(s) contain non-latin text`);

  console.log(hygiene === 0
    ? 'OK NO MARKUP/CSS DEFECTS (markup in content:, icon fonts, dup ids, dead anchors, unguarded THREE, stacked overlays, mismatched mailto, corrupted CSS)'
    : `FAIL ${hygiene} page(s) have markup/CSS defects`);

  // ---------------------------------------------------------------------
  // Literal markup handed to textContent — the browser prints the tags to the
  // user, who reads it as an error ("<svg class=...> Message sent"). Every
  // string that reaches the screen through textContent must be plain text.
  // ---------------------------------------------------------------------
  const MARKUP_TO_TEXT = /(?:textContent|innerText)\s*=\s*(?:(?!;)[\s\S]){0,120}?(['"`])\s*<[a-zA-Z/]/g;
  const walkJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['node_modules', 'vendor'].includes(entry.name) ? [] : walkJs(full);
    }
    return entry.name.endsWith('.js') ? [full] : [];
  });
  let textMarkup = 0;
  const sources = [...pages, ...walkJs(FRONTEND)];
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(MARKUP_TO_TEXT)) {
      textMarkup++;
      const line = text.slice(0, m.index).split('\n').length;
      console.log(`x ${path.relative(FRONTEND, file)}:${line} markup assigned to textContent -> "${m[0].replace(/\s+/g, ' ').slice(0, 90)}"`);
    }
  }
  console.log(textMarkup === 0
    ? 'OK NO MARKUP PRINTED AS TEXT (nothing assigns HTML to textContent/innerText)'
    : `FAIL ${textMarkup} place(s) print markup as text`);

  process.exit(failures === 0 && hygiene === 0 && cssJunk === 0 ? 0 : 1);
})().catch((e) => { console.error('Harness error:', e); process.exit(1); });

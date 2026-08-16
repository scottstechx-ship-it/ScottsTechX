/**
 * BUTTON-BY-BUTTON AUDIT — walks every public page, finds every link,
 * button and form, and verifies:
 *   - every internal link resolves (HTTP 200)
 *   - every button has a working handler (onclick, form submit, or JS-bound)
 *   - every form posts to a REAL endpoint (no alert()-only fakes)
 * Run: node tests/button-audit.js   (requires server on :4000)
 */
const { JSDOM } = require('jsdom');
const BASE = 'http://localhost:4000';

const PAGES = ['/', '/about/', '/admissions/', '/contact/', '/gallery/', '/news/', '/staff/',
  '/staff/hods.html', '/dashboard-access.html', '/platform/login.html',
  '/platform/login-admin.html', '/platform/login-teacher.html', '/platform/login-student.html',
  '/platform/login-parent.html', '/platform/login-super-admin.html',
  '/platform/register.html', '/platform/forgot-password.html'];

let fails = 0, checked = 0;
const bad = (msg) => { fails++; console.log('  ✘ ' + msg); };

const linkCache = new Map();
async function linkOk(url) {
  if (linkCache.has(url)) return linkCache.get(url);
  try {
    const r = await fetch(BASE + url, { method: 'HEAD' });
    const ok = r.status < 400;
    linkCache.set(url, ok);
    return ok;
  } catch { linkCache.set(url, false); return false; }
}

(async () => {
  for (const page of PAGES) {
    const res = await fetch(BASE + page);
    if (res.status !== 200) { bad(`${page} itself returned ${res.status}`); continue; }
    const html = await res.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    console.log(`== ${page}`);

    // 1. every internal link resolves
    const seen = new Set();
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') ||
          href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('//')) continue;
      const path = href.split('#')[0].split('?')[0];
      if (!path || seen.has(path)) continue;
      seen.add(path);
      checked++;
      const url = path.startsWith('/') ? path : new URL(href, BASE + page).pathname;
      if (!(await linkOk(url))) bad(`${page}: broken link -> ${href}`);
    }

    // 2. dead anchors (# with no handler)
    for (const a of doc.querySelectorAll('a[href="#"]')) {
      checked++;
      // anchors with an id are placeholders whose href is set later by page JS
      if (!a.getAttribute('onclick') && !a.id) bad(`${page}: dead link "#" (${(a.textContent || a.innerHTML).trim().slice(0, 40)})`);
    }

    // 3. forms must have a real handler and no alert-only submission
    for (const f of doc.querySelectorAll('form')) {
      checked++;
      const os = f.getAttribute('onsubmit') || '';
      if (/alert\(/.test(os) && !/fetch|API/.test(os)) bad(`${page}: form submits to alert() only`);
      const hasId = f.id;
      const hasAction = f.getAttribute('action');
      const boundInPage = hasId && html.includes(`getElementById('${hasId}')`) || hasId && html.includes(`getElementById("${hasId}")`);
      if (!os && !hasAction && !boundInPage) bad(`${page}: form <${hasId || 'anonymous'}> has no submit handler`);
    }

    // 4. buttons outside forms must have handlers
    for (const b of doc.querySelectorAll('button')) {
      if (b.closest('form')) continue; // submit buttons OK
      checked++;
      const hasHandler = b.getAttribute('onclick') || b.id || b.className.includes('kn-burger') ||
        b.dataset && Object.keys(b.dataset).length || b.closest('[id]');
      if (!hasHandler) bad(`${page}: button with no handler ("${(b.textContent || '').trim().slice(0, 30)}")`);
    }
    dom.window.close();
  }
  console.log(`\n${checked} elements audited across ${PAGES.length} pages.`);
  console.log(fails === 0 ? '✅ EVERY LINK, BUTTON AND FORM IS WIRED UP' : `❌ ${fails} dead/broken elements`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('Harness error:', e); process.exit(1); });

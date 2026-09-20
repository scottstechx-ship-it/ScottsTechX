/**
 * PUBLIC PAGE render test.
 *
 * Loads each public page from the running server into jsdom WITH its scripts
 * and stylesheets, then asserts the page really came alive:
 *   - no JS error was thrown
 *   - the unified navbar was injected
 *   - the page's own content rendered (for /news/ that means real story cards,
 *     not the loading skeletons it ships with)
 *   - the per-page background signature is wired up
 *
 * Run: node tests/public-pages.test.js   (requires the server on :4000)
 */
const { test, before } = require('node:test');
const assert = require('node:assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = 'http://localhost:4000';

async function serverUp() {
  try { const r = await fetch(BASE + '/api/health'); return r.ok; } catch { return false; }
}

/** Load a page fully (scripts + css) and give it time to run. */
async function loadPage(path, ms = 2600) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    // a missing optional resource is not a page failure
    if (/Could not load|not implemented/i.test(e.message)) return;
    errors.push(e.message);
  });
  vc.on('error', (...a) => errors.push(a.join(' ')));

  const dom = await JSDOM.fromURL(BASE + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    // jsdom ships no fetch; the pages' data loading needs it
    beforeParse(window) {
      window.fetch = (input, init) => {
        const url = typeof input === 'string'
          ? (input.startsWith('http') ? input : BASE + input)
          : String(input);
        return globalThis.fetch(url, init);
      };
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
    },
  });
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  await new Promise((r) => setTimeout(r, ms));
  return { dom, win: dom.window, doc: dom.window.document, errors };
}

before(async () => {
  if (!(await serverUp())) throw new Error(`Start the server first: npm start  (nothing on ${BASE})`);
});

const PAGES = [
  { path: '/', page: 'home', expect: '.hero .hero-fx .fx-aurora', label: 'home hero atmosphere layer' },
  { path: '/about/', page: 'about', expect: '.kn-nav', label: 'navbar' },
  { path: '/admissions/', page: 'admissions', expect: '.kn-nav', label: 'navbar' },
  { path: '/gallery/', page: 'gallery', expect: '.kn-nav', label: 'navbar' },
  { path: '/contact/', page: 'contact', expect: '.kn-nav', label: 'navbar' },
  { path: '/staff/', page: 'staff', expect: '.kn-nav', label: 'navbar' },
  // the portal gateway is deliberately standalone (no site navbar)
  { path: '/dashboard-access.html', page: 'portal', expect: '.grid .go', label: 'portal tiles' },
];

for (const p of PAGES) {
  test(`${p.path} renders with its ${p.label}`, async () => {
    const { doc, errors, win } = await loadPage(p.path);
    assert.deepStrictEqual(errors, [], `no JS errors on ${p.path}`);
    assert.strictEqual(doc.documentElement.getAttribute('data-page'), p.page,
      `${p.path} declares data-page="${p.page}"`);
    assert.ok(doc.querySelector('link[href*="page-bg.css"]'), `${p.path} loads page-bg.css`);
    assert.ok(doc.querySelector(p.expect), `${p.path} renders ${p.expect}`);
    win.close();
  });
}

test('/news/ has no background video and renders real stories', async () => {
  const { doc, errors, win } = await loadPage('/news/', 3200);
  assert.deepStrictEqual(errors, [], 'no JS errors on /news/');
  assert.strictEqual(doc.documentElement.getAttribute('data-page'), 'news', 'news declares data-page="news"');

  // the film script must not be on this page at all
  assert.ok(!doc.querySelector('script[src*="site-film"]'), 'the news page does not load site-film.js');
  assert.strictEqual(doc.querySelectorAll('video').length, 0, 'the news page has no <video>');

  // real content, not skeletons
  assert.strictEqual(doc.querySelectorAll('.skeleton').length, 0, 'loading skeletons are gone');
  const cards = doc.querySelectorAll('.news-card');
  const feature = doc.querySelector('.nr-feature');
  assert.ok(cards.length >= 1, `story cards rendered (${cards.length})`);
  assert.ok(feature && !feature.hidden, 'the featured story is shown');
  assert.ok(doc.querySelectorAll('.nr-chip').length >= 2, 'topic filter chips rendered');
  assert.ok(!doc.querySelector('#nrTicker').hidden, 'the headline ticker is running');
  assert.ok(doc.querySelector('#nrCount').textContent !== '—', 'the story count filled in');

  // no escaped markup leaking into the rendered list
  assert.ok(!/&lt;svg/.test(doc.querySelector('main').innerHTML), 'no escaped markup in the news list');
  win.close();
});

test('/news/ opens a story in the reader and filters by topic', async () => {
  const { doc, win } = await loadPage('/news/', 3200);

  const first = doc.querySelector('.news-card');
  assert.ok(first, 'there is a card to open');
  const wantedTitle = first.querySelector('h3').textContent.trim();
  first.click();
  await new Promise((r) => setTimeout(r, 400));

  const reader = doc.querySelector('#nrReader');
  assert.ok(reader.classList.contains('open'), 'the reader opened');
  assert.strictEqual(doc.querySelector('#nrReaderTitle').textContent.trim(), wantedTitle,
    'the reader shows the clicked story');
  assert.ok(doc.querySelector('.nr-reader .text').textContent.trim().length > 20,
    'the reader shows the story body');

  doc.querySelector('#nrReaderClose').click();
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(!reader.classList.contains('open'), 'the reader closed again');

  // topic filter narrows the list
  const before = doc.querySelectorAll('.news-card').length;
  const chips = [...doc.querySelectorAll('.nr-chip')];
  const specific = chips.find((c) => !/^All/.test(c.textContent));
  if (specific && before > 1) {
    specific.click();
    await new Promise((r) => setTimeout(r, 200));
    const after = doc.querySelectorAll('.news-card').length;
    assert.ok(after <= before, `filtering to "${specific.textContent}" narrowed the list (${before} -> ${after})`);
    chips.find((c) => /^All/.test(c.textContent)).click();
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(doc.querySelectorAll('.news-card').length, before, 'clearing the filter restores the list');
  }

  // timeline view
  doc.querySelector('#nrViewTime').click();
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(!doc.querySelector('#nrTimeline').hidden, 'the timeline view is shown');
  assert.ok(doc.querySelector('#nrTimeline').querySelectorAll('.nr-tl-item').length >= 1, 'timeline has entries');
  doc.querySelector('#nrViewGrid').click();
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(doc.querySelector('#nrTimeline').hidden, 'back to the grid view');

  win.close();
});

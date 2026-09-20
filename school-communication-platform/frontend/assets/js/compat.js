/* ============================================================
 * KALINABIRI SS — BROWSER COMPAT SHIM
 *
 * Loaded synchronously in <head> on the pages whose own inline scripts build
 * an IntersectionObserver while the document is still parsing (so a deferred
 * shim would arrive too late).
 *
 * Every current browser has IntersectionObserver. The ones that do not are
 * exactly the ones where an unguarded `new IntersectionObserver(...)` throws
 * — and because these observers drive the scroll-reveal system (which starts
 * elements at opacity:0), that throw used to leave whole sections of the page
 * permanently invisible.
 *
 * The shim below is deliberately dumb: it reports every observed element as
 * intersecting on the next tick, so reveals simply happen immediately. That
 * is the correct fallback — visible content always beats a clever animation.
 * ============================================================ */
(function () {
  'use strict';

  /* --- matchMedia ------------------------------------------------------ */
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = function (query) {
      return {
        media: String(query || ''),
        matches: false,
        onchange: null,
        addListener: function () {}, removeListener: function () {},
        addEventListener: function () {}, removeEventListener: function () {},
        dispatchEvent: function () { return false; },
      };
    };
  }

  /* --- IntersectionObserver ------------------------------------------- */
  if (typeof window.IntersectionObserver === 'function') return;

  function IntersectionObserverShim(callback) {
    this._cb = callback;
    this._targets = [];
  }
  IntersectionObserverShim.prototype.observe = function (el) {
    var self = this;
    this._targets.push(el);
    setTimeout(function () {
      try {
        self._cb([{ target: el, isIntersecting: true, intersectionRatio: 1,
          boundingClientRect: el.getBoundingClientRect ? el.getBoundingClientRect() : {},
          intersectionRect: {}, rootBounds: null, time: Date.now() }], self);
      } catch (e) { /* a bad callback must not break the page */ }
    }, 0);
  };
  IntersectionObserverShim.prototype.unobserve = function () {};
  IntersectionObserverShim.prototype.disconnect = function () { this._targets = []; };
  IntersectionObserverShim.prototype.takeRecords = function () { return []; };

  window.IntersectionObserver = IntersectionObserverShim;
})();

/**
 * theme-manager.js - Centralized theme, settings, and UI state for Kalinabiri SS
 * Provides: theme switching, language, density, font size, animation, accessibility
 */
(function() {
  'use strict';

  const STORAGE_KEY = 'kalinabiri_settings';
  const DEFAULTS = {
    theme: 'dark',           // dark | light | midnight | ocean | forest
    accent: 'green',         // green | gold | blue | purple | rose
    density: 'comfortable',   // compact | comfortable | spacious
    fontScale: 100,          // 90-150
    language: 'en',          // en | lug | sw
    animations: true,        // global animation toggle
    reducedMotion: false,
    highContrast: false,
    sidebarCollapsed: false,
    lastNotifCheck: null
  };

  let settings = load();

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Object.assign({}, DEFAULTS, stored);
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}
    apply();
    document.dispatchEvent(new CustomEvent('kalinabiri-settings-changed', { detail: settings }));
  }

  function apply() {
    const root = document.documentElement;
    if (!root) return;

    // Reset theme classes
    root.classList.remove('theme-dark', 'theme-light', 'theme-midnight', 'theme-ocean', 'theme-forest');
    root.classList.add('theme-' + settings.theme);

    // Accent color
    root.classList.remove('accent-green', 'accent-gold', 'accent-blue', 'accent-purple', 'accent-rose');
    root.classList.add('accent-' + settings.accent);

    // Density
    root.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
    root.classList.add('density-' + settings.density);

    // Font scale
    root.style.setProperty('--font-scale', (settings.fontScale / 100));

    // Animations
    if (!settings.animations) {
      root.classList.add('no-animations');
    } else {
      root.classList.remove('no-animations');
    }

    // Reduced motion (accessibility)
    if (settings.reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }

    // High contrast
    if (settings.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Language
    root.setAttribute('lang', settings.language);

    // Density affects actual spacing
    const densityPx = { compact: 0.85, comfortable: 1, spacious: 1.15 };
    root.style.setProperty('--density-scale', densityPx[settings.density] || 1);
  }

  // Public API
  window.KalibzSettings = {
    get: () => Object.assign({}, settings),
    set(key, value) {
      settings[key] = value;
      save();
    },
    setAll(newSettings) {
      Object.assign(settings, newSettings);
      save();
    },
    reset() {
      settings = Object.assign({}, DEFAULTS);
      save();
    },
    apply,
    DEFAULTS
  };

  // Apply on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
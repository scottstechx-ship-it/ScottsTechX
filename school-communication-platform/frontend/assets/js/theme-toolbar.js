/* =====================================================================
   Kalinabiri SS - Theme Toolbar + Settings UI
   Floating toolbar that lets users switch themes, accents, density, font
   ===================================================================== */
(function() {
  'use strict';

  function getSettings() {
    return window.KalibzSettings ? window.KalibzSettings.get() : {};
  }

  function setSetting(key, value) {
    if (window.KalibzSettings) {
      window.KalibzSettings.set(key, value);
    }
  }

  // Inject toolbar HTML
  function createToolbar() {
    if (document.getElementById('kalinabiri-toolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'kalinabiri-toolbar';
    toolbar.className = 'theme-toolbar';
    toolbar.innerHTML = `
      <button id="kbThemeBtn" title="Theme settings" aria-label="Open theme settings">
        <i class="fas fa-palette"></i>
      </button>
      <button id="kbFullscreenBtn" title="Toggle fullscreen" aria-label="Toggle fullscreen">
        <i class="fas fa-expand"></i>
      </button>
    `;
    document.body.appendChild(toolbar);

    const panel = document.createElement('div');
    panel.id = 'kalinabiri-panel';
    panel.className = 'theme-menu-panel';
    panel.innerHTML = `
      <div class="theme-section">
        <div class="theme-section-title">Theme</div>
        <div class="theme-options" id="kbThemeOptions">
          <button class="theme-option" data-theme="dark">Dark</button>
          <button class="theme-option" data-theme="light">Light</button>
          <button class="theme-option" data-theme="midnight">Midnight</button>
          <button class="theme-option" data-theme="ocean">Ocean</button>
          <button class="theme-option" data-theme="forest">Forest</button>
        </div>
      </div>

      <div class="theme-section">
        <div class="theme-section-title">Accent Color</div>
        <div class="theme-options" id="kbAccentOptions" style="grid-template-columns:repeat(5,1fr);gap:8px;">
          <button class="theme-accent-swatch" data-accent="green" style="background:#4ade80;" title="Green"></button>
          <button class="theme-accent-swatch" data-accent="gold" style="background:#f59e0b;" title="Gold"></button>
          <button class="theme-accent-swatch" data-accent="blue" style="background:#3b82f6;" title="Blue"></button>
          <button class="theme-accent-swatch" data-accent="purple" style="background:#a78bfa;" title="Purple"></button>
          <button class="theme-accent-swatch" data-accent="rose" style="background:#fb7185;" title="Rose"></button>
        </div>
      </div>

      <div class="theme-section">
        <div class="theme-section-title">Density</div>
        <div class="theme-options">
          <button class="theme-option" data-density="compact">Compact</button>
          <button class="theme-option" data-density="comfortable">Comfortable</button>
          <button class="theme-option" data-density="spacious">Spacious</button>
        </div>
      </div>

      <div class="theme-section">
        <div class="theme-section-title">Font Size</div>
        <div class="theme-slider-label">
          <span>90%</span>
          <span id="kbFontSizeLabel">100%</span>
          <span>150%</span>
        </div>
        <input type="range" class="theme-slider" id="kbFontSlider" min="90" max="150" step="5" value="100">
      </div>

      <div class="theme-section">
        <div class="theme-section-title">Preferences</div>
        <div class="theme-toggle">
          <span>Animations</span>
          <button class="theme-toggle-switch" id="kbAnimToggle" data-pref="animations"></button>
        </div>
        <div class="theme-toggle">
          <span>Reduced Motion</span>
          <button class="theme-toggle-switch" id="kbMotionToggle" data-pref="reducedMotion"></button>
        </div>
        <div class="theme-toggle">
          <span>High Contrast</span>
          <button class="theme-toggle-switch" id="kbContrastToggle" data-pref="highContrast"></button>
        </div>
      </div>

      <div class="theme-section">
        <button class="btn btn-secondary btn-block" id="kbResetBtn">
          <i class="fas fa-undo"></i> Reset to Defaults
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    bindToolbarEvents();
    syncUI();
  }

  function syncUI() {
    const s = getSettings();
    document.querySelectorAll('#kbThemeOptions .theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === s.theme);
    });
    document.querySelectorAll('#kbAccentOptions .theme-accent-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.accent === s.accent);
    });
    document.querySelectorAll('[data-density]').forEach(btn => {
      if (btn.classList.contains('theme-option')) {
        btn.classList.toggle('active', btn.dataset.density === s.density);
      }
    });
    const slider = document.getElementById('kbFontSlider');
    if (slider) slider.value = s.fontScale || 100;
    const label = document.getElementById('kbFontSizeLabel');
    if (label) label.textContent = (s.fontScale || 100) + '%';
    const animBtn = document.getElementById('kbAnimToggle');
    if (animBtn) animBtn.classList.toggle('on', !!s.animations);
    const motionBtn = document.getElementById('kbMotionToggle');
    if (motionBtn) motionBtn.classList.toggle('on', !!s.reducedMotion);
    const contrastBtn = document.getElementById('kbContrastToggle');
    if (contrastBtn) contrastBtn.classList.toggle('on', !!s.highContrast);
  }

  function bindToolbarEvents() {
    // Open/close panel
    const themeBtn = document.getElementById('kbThemeBtn');
    const panel = document.getElementById('kalinabiri-panel');

    if (themeBtn) {
      themeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('open');
      });
    }

    // Close panel on outside click
    document.addEventListener('click', (e) => {
      if (!panel) return;
      const inside = panel.contains(e.target) || themeBtn.contains(e.target);
      if (!inside) panel.classList.remove('open');
    });

    // Fullscreen
    const fsBtn = document.getElementById('kbFullscreenBtn');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Theme
    document.querySelectorAll('#kbThemeOptions .theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        setSetting('theme', btn.dataset.theme);
        syncUI();
        showToast('Theme updated', 'success');
      });
    });

    // Accent
    document.querySelectorAll('#kbAccentOptions .theme-accent-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        setSetting('accent', btn.dataset.accent);
        syncUI();
        showToast('Accent updated', 'success');
      });
    });

    // Density
    document.querySelectorAll('[data-density].theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        setSetting('density', btn.dataset.density);
        syncUI();
        showToast('Density updated', 'success');
      });
    });

    // Font slider
    const fontSlider = document.getElementById('kbFontSlider');
    if (fontSlider) {
      fontSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        setSetting('fontScale', value);
        document.getElementById('kbFontSizeLabel').textContent = value + '%';
      });
    }

    // Toggles
    ['animations', 'reducedMotion', 'highContrast'].forEach(pref => {
      const btn = document.querySelector(`[data-pref="${pref}"]`);
      if (btn) {
        btn.addEventListener('click', () => {
          const current = getSettings()[pref];
          setSetting(pref, !current);
          syncUI();
        });
      }
    });

    // Reset
    const resetBtn = document.getElementById('kbResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (window.KalibzSettings) window.KalibzSettings.reset();
        syncUI();
        showToast('Settings reset to defaults', 'success');
      });
    }

    // Listen for changes from other sources
    document.addEventListener('kalinabiri-settings-changed', syncUI);
  }

  function showToast(msg, type) {
    // Reuse existing toast if available
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
      return;
    }
    // Inline fallback
    const container = document.querySelector('.toast-container') || (() => {
      const c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
      return c;
    })();
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToolbar);
  } else {
    createToolbar();
  }
})();
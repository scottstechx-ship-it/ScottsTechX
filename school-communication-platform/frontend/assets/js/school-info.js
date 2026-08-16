/**
 * KalinabiriSS — School Info Module
 * Shared module for getting, saving, and applying school information
 * to the UI. Works with the existing KalinabiriAPI data layer.
 *
 * Usage:
 *   const info = getSchoolInfo();
 *   saveSchoolInfo({ schoolName: 'New Name', term: 'Term 2' });
 *   applySchoolInfo();  // updates all [data-school-info] elements in DOM
 */

const SCHOOL_INFO_KEY = 'KalinabiriSS_schoolInfo';

/**
 * Returns default school info structure.
 */
function _defaultSchoolInfo() {
  return {
    schoolName: 'Kalinabiri Secondary School',
    term: 'Term 1',
    year: 2026,
    email: 'admin@kalinabiriss.ac.ug',
    phone: '+256 700 123 456',
    address: 'Ntinda, Kampala, Uganda',
    motto: 'Education for Excellence',
    headteacher: '',
    deputyHeadteacher: '',
    website: '',
    established: ''
  };
}

/**
 * Retrieves school info from localStorage, falling back to defaults.
 * @returns {Object} School information object.
 */
function getSchoolInfo() {
  try {
    const stored = localStorage.getItem(SCHOOL_INFO_KEY);
    if (stored) {
      return { ..._defaultSchoolInfo(), ...JSON.parse(stored) };
    }
  } catch {}
  return _defaultSchoolInfo();
}

/**
 * Saves school info to localStorage (shallow merge with existing).
 * Also persists to the main KalinabiriAPI DB settings if API is available.
 * @param {Object} data - Partial or full school info object.
 */
function saveSchoolInfo(data) {
  const current = getSchoolInfo();
  const updated = { ...current, ...data };
  localStorage.setItem(SCHOOL_INFO_KEY, JSON.stringify(updated));

  // Sync to KalinabiriAPI settings if it exists
  if (typeof KalinabiriAPI !== 'undefined') {
    try {
      const api = new KalinabiriAPI();
      const settings = api.getSettings();
      api.saveSettings({ ...settings, ...updated });
    } catch {}
  }

  // Dispatch a custom event so other modules can react
  window.dispatchEvent(new CustomEvent('schoolInfoChanged', { detail: updated }));
}

/**
 * Applies school info to all DOM elements with data-school-info attribute.
 * Elements like: <span data-school-info="schoolName">, <a data-school-info="phone">
 *
 * Also updates <title>, favicon hint, and common meta tags.
 */
function applySchoolInfo() {
  const info = getSchoolInfo();

  // Apply to data-school-info elements
  document.querySelectorAll('[data-school-info]').forEach(el => {
    const key = el.getAttribute('data-school-info');
    if (info[key] !== undefined && info[key] !== null) {
      el.textContent = info[key];
    }
  });

  // Apply to data-school-info-* attributes (e.g. data-school-info-href, data-school-info-src)
  document.querySelectorAll('[data-school-info-href]').forEach(el => {
    const key = el.getAttribute('data-school-info-href');
    if (info[key] !== undefined) el.setAttribute('href', info[key]);
  });
  document.querySelectorAll('[data-school-info-src]').forEach(el => {
    const key = el.getAttribute('data-school-info-src');
    if (info[key] !== undefined) el.setAttribute('src', info[key]);
  });
  document.querySelectorAll('[data-school-info-placeholder]').forEach(el => {
    const key = el.getAttribute('data-school-info-placeholder');
    if (info[key] !== undefined) el.setAttribute('placeholder', info[key]);
  });

  // Update <title> if a [data-school-info-title] element exists or default title
  const titleEl = document.querySelector('[data-school-info-title]') ||
                  document.querySelector('title');
  if (titleEl) {
    titleEl.textContent = info.schoolName;
  }

  // Apply term/year suffix to common elements
  document.querySelectorAll('[data-school-info-term]').forEach(el => {
    el.textContent = `${info.term} ${info.year}`;
  });

  return info;
}

// Auto-apply on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applySchoolInfo);
} else {
  applySchoolInfo();
}

/**
 * localStorage wrapper with version-awareness.
 * Falls back to sessionStorage if localStorage is unavailable or blocked
 * (e.g. Safari private browsing, ITP, or quota exceeded).
 * @module storage
 */

const PREFIX = 'ai-toolkit:';

function _key(name) { return PREFIX + name; }

function _get(name) {
  const key = _key(name);
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch { /* localStorage blocked */ }
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function _set(name, value) {
  const key = _key(name);
  try { localStorage.setItem(key, value); } catch { /* private mode / quota */ }
  try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
}

/** @returns {string|null} Accepted terms version or null.
 *  Intentionally session-only: terms must be accepted on every new visit. */
export function getTermsAccepted() {
  try { return sessionStorage.getItem(_key('terms_accepted_version')); } catch { return null; }
}

/** @param {string} version */
export function setTermsAccepted(version) {
  try { sessionStorage.setItem(_key('terms_accepted_version'), version); } catch { /* ignore */ }
}

/** @returns {string|null} Completed onboarding version or null */
export function getOnboardingCompleted() {
  return _get('onboarding_completed_version');
}

/** @param {string} version */
export function setOnboardingCompleted(version) {
  _set('onboarding_completed_version', version);
}

/** @returns {'fast'|'quality'} */
export function getPreferredQuality() {
  return _get('preferred_quality') || 'fast';
}

/** @param {'fast'|'quality'} mode */
export function setPreferredQuality(mode) {
  _set('preferred_quality', mode);
}

/** @returns {string|null} */
export function getAdminToken() {
  return _get('admin_token');
}

/** @param {string} token */
export function setAdminToken(token) {
  _set('admin_token', token);
}

/** @returns {'dark'|'light'} */
export function getTheme() {
  return _get('theme') || 'dark';
}

/** @param {'dark'|'light'} theme */
export function setTheme(theme) {
  _set('theme', theme);
}

/** Clear all AI Toolkit localStorage entries (debugging/reset). */
export function clearAll() {
  [localStorage, sessionStorage].forEach(store => {
    try {
      Object.keys(store)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => store.removeItem(k));
    } catch { /* ignore */ }
  });
}

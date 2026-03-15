/**
 * Environment badge rendering and mode checks.
 * @module environment
 */

const LABELS = {
  production:  { label: 'Productie',  css: 'production'  },
  development: { label: 'Ontwikkeling', css: 'development' },
  sandbox:     { label: 'Sandbox',    css: 'sandbox'     },
};

/**
 * Render the environment badge into a given container element.
 * @param {HTMLElement} container
 * @param {string} mode
 */
export function renderEnvBadge(container, mode) {
  const info = LABELS[mode] || LABELS.production;
  container.innerHTML = `<span class="env-badge ${info.css}">${info.label}</span>`;
}

/**
 * Show or hide the sandbox warning banner.
 * @param {string} mode
 */
export function handleSandboxBanner(mode) {
  const banner = document.getElementById('sandbox-banner');
  if (!banner) return;
  if (mode === 'sandbox') {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

/** @param {string} mode @returns {boolean} */
export function isProduction(mode) { return mode === 'production'; }
/** @param {string} mode @returns {boolean} */
export function isSandbox(mode)    { return mode === 'sandbox'; }
/** @param {string} mode @returns {boolean} */
export function isDevelopment(mode){ return mode === 'development'; }

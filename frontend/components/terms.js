/**
 * Terms and conditions screen component.
 * Fetches content from /api/terms (config/terms.md) and renders it.
 * @module components/terms
 */

const _ICON_SVG = {
  '🔒': `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="9" width="10" height="8" rx="1.5"/>
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>
    </svg>`,
  '⚠️': `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M9.13 3.5 2.5 15.5a1 1 0 0 0 .87 1.5h13.26a1 1 0 0 0 .87-1.5L10.87 3.5a1 1 0 0 0-1.74 0z"/>
      <line x1="10" y1="8.5" x2="10" y2="12"/>
      <circle cx="10" cy="14.5" r=".75" fill="currentColor"/>
    </svg>`,
  '🤖': `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="7" width="14" height="10" rx="2"/>
      <path d="M7 7V5.5a3 3 0 0 1 6 0V7"/>
      <circle cx="7.5" cy="12" r="1" fill="currentColor"/>
      <circle cx="12.5" cy="12" r="1" fill="currentColor"/>
      <line x1="8" y1="15" x2="12" y2="15"/>
    </svg>`,
  '📋': `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="3" width="12" height="15" rx="1.5"/>
      <path d="M8 3a2 2 0 0 1 4 0"/>
      <line x1="7" y1="9"  x2="13" y2="9"/>
      <line x1="7" y1="12" x2="13" y2="12"/>
      <line x1="7" y1="15" x2="11" y2="15"/>
    </svg>`,
};

/** Replace a leading emoji with its styled SVG if known, else strip it. */
function _replaceEmoji(text) {
  for (const [emoji, svg] of Object.entries(_ICON_SVG)) {
    if (text.startsWith(emoji)) {
      const label = text.slice(emoji.length).trim();
      return `<span class="terms-icon" aria-hidden="true">${svg}</span>${label}`;
    }
  }
  return text;
}

/**
 * Minimal markdown → HTML converter for headings and paragraphs.
 * @param {string} md
 * @returns {string}
 */
function _mdToHtml(md) {
  return md
    .split(/\n{2,}/)
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const lines = trimmed.split('\n');
      const first = lines[0];
      const rest  = lines.slice(1).join(' ').trim();
      const h2 = first.match(/^##\s+(.+)/);
      if (h2) return `<h2>${h2[1]}</h2>${rest ? `<p>${rest}</p>` : ''}`;
      const h3 = first.match(/^###\s+(.+)/);
      if (h3) return `<h3 class="terms-heading">${_replaceEmoji(h3[1])}</h3>${rest ? `<p>${rest}</p>` : ''}`;
      const text = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return `<p>${text}</p>`;
    })
    .join('\n');
}

/**
 * @param {HTMLElement} container
 * @param {{ health: object, storage: object, api: object, onDone: () => void }} opts
 */
export async function renderTerms(container, { health, storage, api, onDone }) {
  const termsVersion = health?.terms_version || 'v1';

  // Show loader while fetching
  container.innerHTML = `
    <div class="terms-card">
      <div class="loading-row">
        <span class="spinner" aria-hidden="true"></span>
        <span>Gebruiksvoorwaarden laden…</span>
      </div>
    </div>
  `;

  let termsHtml = '';
  try {
    const md = await api.get('/terms');
    termsHtml = _mdToHtml(md);
  } catch {
    termsHtml = '<p>Gebruiksvoorwaarden konden niet worden geladen.</p>';
  }

  container.innerHTML = `
    <div class="terms-card">
      <div class="terms-content">
        ${termsHtml}
      </div>

      <hr class="divider">

      <label class="terms-accept-row" aria-label="Akkoord gaan met voorwaarden">
        <input type="checkbox" id="terms-checkbox" aria-required="true">
        <span>Ik heb de voorwaarden gelezen en ga akkoord</span>
      </label>

      <button id="terms-continue-btn" class="btn btn-primary btn-lg" disabled
              aria-label="Doorgaan naar de applicatie">
        Ga verder
      </button>
    </div>
  `;

  const checkbox = container.querySelector('#terms-checkbox');
  const btn = container.querySelector('#terms-continue-btn');

  checkbox.addEventListener('change', () => {
    btn.disabled = !checkbox.checked;
  });

  btn.addEventListener('click', () => {
    if (!checkbox.checked) return;
    btn.disabled = true;
    btn.textContent = 'Bezig...';
    storage.setTermsAccepted(termsVersion);
    onDone();
  });
}

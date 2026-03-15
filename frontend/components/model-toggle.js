/**
 * Reusable Snel ↔ Kwaliteit toggle component with RAM indicator.
 * @module components/model-toggle
 */

import * as storage from '../js/storage.js';

const POLL_INTERVAL_MS = 10_000;

/**
 * @typedef {Object} ToggleOpts
 * @property {HTMLElement} container - Element to render into
 * @property {object|null} health - Initial health data
 * @property {import('../js/api.js')} api - API module
 * @property {(mode: 'fast'|'quality') => void} [onChange] - Called when mode changes
 */

/**
 * @param {ToggleOpts} opts
 * @returns {{ getQualityMode: () => 'fast'|'quality', destroy: () => void }}
 */
export function createModelToggle({ container, health, api, onChange }) {
  let currentMode = storage.getPreferredQuality();
  let pollTimer = null;
  let latestHealth = health;

  function _ramClass(availGb) {
    if (availGb > 4) return 'green';
    if (availGb >= 2) return 'orange';
    return 'red';
  }

  function _ramPct(available, total) {
    if (!total) return 0;
    return Math.min(100, Math.round((available / total) * 100));
  }

  function _render() {
    const availGb = latestHealth?.system_ram_available_gb ?? null;
    const totalGb = latestHealth?.system_ram_total_gb ?? null;
    const qualityOk = latestHealth?.quality_mode_available !== false;
    const activeTasks = latestHealth?.active_tasks || {};
    const llmBusy = activeTasks.llm && activeTasks.llm !== null;

    const ramClass  = availGb !== null ? _ramClass(availGb) : 'green';
    const ramPct    = availGb !== null ? _ramPct(availGb, totalGb) : 50;
    const ramLabel  = availGb !== null ? `${availGb.toFixed(1)} GB vrij` : '–';

    const qualityDisabled = !qualityOk;
    const qualityTitle = qualityDisabled
      ? "Onvoldoende geheugen — sluit andere programma's"
      : llmBusy ? "Wachtrij — een andere taak is bezig" : "";

    const isFast    = currentMode === 'fast';
    const isQuality = currentMode === 'quality';

    const descFast    = "Kortere, snellere uitvoer — geschikt voor korte teksten";
    const descQuality = qualityDisabled
      ? "Niet beschikbaar: onvoldoende geheugen"
      : "Uitgebreidere uitvoer met meer context — voor langere teksten";

    const iconShort = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
        <line x1="3" y1="5" x2="17" y2="5"/>
        <line x1="3" y1="10" x2="11" y2="10"/>
        <line x1="3" y1="15" x2="8" y2="15"/>
      </svg>`;
    const iconExtended = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
        <line x1="3" y1="5" x2="17" y2="5"/>
        <line x1="3" y1="9" x2="17" y2="9"/>
        <line x1="3" y1="13" x2="17" y2="13"/>
        <line x1="3" y1="17" x2="13" y2="17"/>
      </svg>`;

    container.innerHTML = `
      <div class="model-toggle-wrap">
        <div class="toggle-track" role="group" aria-label="Uitvoermodus kiezen">
          <button class="toggle-option ${isFast ? 'active-fast' : ''}"
                  data-mode="fast"
                  aria-pressed="${isFast}"
                  aria-label="Korte uitvoer kiezen">
            ${iconShort} Kort
          </button>
          <button class="toggle-option ${isQuality ? 'active-quality' : ''}"
                  data-mode="quality"
                  aria-pressed="${isQuality}"
                  ${qualityDisabled ? 'disabled' : ''}
                  title="${qualityTitle}"
                  aria-label="Uitgebreide uitvoer kiezen">
            ${iconExtended} Uitgebreid
          </button>
        </div>
        <p class="toggle-description" aria-live="polite">
          ${isFast ? descFast : descQuality}
        </p>
        <div class="ram-indicator" aria-label="Beschikbaar geheugen">
          <div class="ram-bar-wrap" role="progressbar"
               aria-valuenow="${ramPct}" aria-valuemin="0" aria-valuemax="100">
            <div class="ram-bar ${ramClass}" style="width:${ramPct}%"></div>
          </div>
          <span style="color:var(--text-muted);font-size:0.78rem;">${ramLabel}</span>
        </div>
      </div>
    `;

    // Bind click events
    container.querySelectorAll('.toggle-option:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === currentMode) return;
        currentMode = mode;
        storage.setPreferredQuality(mode);
        _render();
        onChange?.(mode);
      });
    });
  }

  async function _pollHealth() {
    try {
      latestHealth = await api.get('/health');
    } catch { /* keep last known */ }
    _render();
  }

  _render();
  pollTimer = setInterval(_pollHealth, POLL_INTERVAL_MS);

  return {
    /** @returns {'fast'|'quality'} */
    getQualityMode() { return currentMode; },
    /** Stop polling. */
    destroy() { clearInterval(pollTimer); },
  };
}

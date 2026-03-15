/**
 * Summarize page component.
 * @module components/summarize
 */

import { createModelToggle } from './model-toggle.js';

function _saveText(text, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * @param {HTMLElement} container
 * @param {{ health: object, storage: object, api: object, sharedState: object }} opts
 */
export function renderSummarize(container, { health, storage, api, sharedState }) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Samenvatten</h2>
      <p>Vat tekst samen in de gewenste lengte en stijl</p>
    </div>

    <div id="toggle-wrap-summarize"></div>

    <div class="flex-col">
      <div>
        <div class="label">Tekst invoer</div>
        <div class="textarea-wrap">
          <textarea id="summarize-input" class="textarea large" rows="8"
                    placeholder="Plak hier je tekst…" aria-label="Tekst om samen te vatten"></textarea>
          <button class="clear-btn" id="summarize-clear" aria-label="Tekst wissen" title="Wissen">✕</button>
        </div>
        <div id="char-count" style="font-size:.78rem;color:var(--text-muted);text-align:right;margin-top:.25rem;"></div>
      </div>

      <div class="flex-row" style="flex-wrap:wrap;gap:.75rem;">
        <div>
          <div class="label" style="margin-bottom:.4rem;">Lengte</div>
          <div class="btn-group" role="group" aria-label="Samenvatting lengte">
            <button class="btn btn-sm" data-length="short"  aria-pressed="false">Kort</button>
            <button class="btn btn-sm active" data-length="medium" aria-pressed="true">Middel</button>
            <button class="btn btn-sm" data-length="long"   aria-pressed="false">Lang</button>
          </div>
        </div>
        <div>
          <div class="label" style="margin-bottom:.4rem;">Stijl</div>
          <div class="btn-group" role="group" aria-label="Samenvatting stijl">
            <button class="btn btn-sm active" data-style="prose"        aria-pressed="true">Lopende tekst</button>
            <button class="btn btn-sm" data-style="bullets"      aria-pressed="false">Opsomming</button>
            <button class="btn btn-sm" data-style="action_items" aria-pressed="false">Actiepunten</button>
          </div>
        </div>
      </div>

      <button id="summarize-btn" class="btn btn-primary btn-lg" aria-label="Tekst samenvatten">
        Samenvatten
      </button>
    </div>

    <div id="summarize-loading" class="loading-row hidden" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>Bezig met samenvatten…</span>
    </div>

    <div id="summarize-error" class="status-msg error hidden" role="alert"></div>

    <div id="summarize-result" class="result-card hidden">
      <div class="result-actions">
        <div class="card-title" style="margin-bottom:0;">Samenvatting</div>
        <div class="result-actions-btns">
          <button class="btn btn-sm btn-secondary" id="copy-summarize"
                  aria-label="Kopieer samenvatting naar klembord">📋 Kopiëren</button>
          <button class="btn btn-sm btn-secondary" id="save-summarize"
                  aria-label="Sla samenvatting op als tekstbestand">💾 Opslaan</button>
        </div>
      </div>
      <div id="summarize-output" class="result-text" aria-live="polite"></div>
      <div style="margin-top:.75rem;font-size:.78rem;color:var(--text-muted);"
           id="summarize-meta"></div>
    </div>
  `;

  const toggleWrap = container.querySelector('#toggle-wrap-summarize');
  const toggle = createModelToggle({ container: toggleWrap, health, api });

  const inputEl   = container.querySelector('#summarize-input');
  const clearBtn  = container.querySelector('#summarize-clear');
  const charCount = container.querySelector('#char-count');
  const btn       = container.querySelector('#summarize-btn');
  const loadingEl = container.querySelector('#summarize-loading');
  const errorEl   = container.querySelector('#summarize-error');
  const resultEl  = container.querySelector('#summarize-result');
  const outputEl  = container.querySelector('#summarize-output');
  const metaEl    = container.querySelector('#summarize-meta');

  let selectedLength = 'medium';
  let selectedStyle  = 'prose';

  // Pre-fill from transcribe handoff
  if (sharedState?.transcribeText) {
    inputEl.value = sharedState.transcribeText;
    sharedState.transcribeText = null;
  }

  // Character counter
  function _updateCharCount() {
    const mode = toggle.getQualityMode();
    const max = mode === 'quality' ? 50_000 : 8_000;
    const len = inputEl.value.length;
    const over = len > max;
    charCount.textContent = `${len.toLocaleString('nl-NL')} / ${max.toLocaleString('nl-NL')} tekens`;
    charCount.style.color = over ? 'var(--error)' : 'var(--text-muted)';
    btn.disabled = len === 0 || over;
  }

  function _updateClearBtn() {
    clearBtn.classList.toggle('visible', inputEl.value.length > 0);
  }

  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    _updateCharCount();
    _updateClearBtn();
    inputEl.focus();
  });

  inputEl.addEventListener('input', () => { _updateCharCount(); _updateClearBtn(); });
  toggle.onChange = _updateCharCount;
  _updateCharCount();
  _updateClearBtn();

  // Length / style btn groups
  container.querySelectorAll('[data-length]').forEach(b => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-length]').forEach(x => {
        x.classList.remove('active');
        x.setAttribute('aria-pressed', 'false');
      });
      b.classList.add('active');
      b.setAttribute('aria-pressed', 'true');
      selectedLength = b.dataset.length;
    });
  });
  container.querySelectorAll('[data-style]').forEach(b => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-style]').forEach(x => {
        x.classList.remove('active');
        x.setAttribute('aria-pressed', 'false');
      });
      b.classList.add('active');
      b.setAttribute('aria-pressed', 'true');
      selectedStyle = b.dataset.style;
    });
  });

  // Summarize
  btn.addEventListener('click', async () => {
    const text = inputEl.value.trim();
    if (!text) return;

    btn.disabled = true;
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    resultEl.classList.add('hidden');

    try {
      const result = await api.post('/summarize', {
        text,
        quality: toggle.getQualityMode(),
        length: selectedLength,
        style: selectedStyle,
      });
      outputEl.textContent = result.summary;
      metaEl.textContent = `Model: ${result.model_used} — ${(result.processing_time_ms / 1000).toFixed(1)}s`;
      resultEl.classList.remove('hidden');
    } catch (e) {
      errorEl.textContent = e.message || 'Samenvatten mislukt';
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      loadingEl.classList.add('hidden');
    }
  });

  container.querySelector('#copy-summarize').addEventListener('click', () => {
    navigator.clipboard.writeText(outputEl.textContent);
  });

  container.querySelector('#save-summarize').addEventListener('click', () => {
    _saveText(outputEl.textContent, 'samenvatting.txt');
  });
}

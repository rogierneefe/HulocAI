/**
 * Translation page component.
 * @module components/translate
 */

import { createModelToggle } from './model-toggle.js';

function _saveText(text, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const LANGUAGES = [
  ['', 'Auto-detectie'],
  ['nl', 'Nederlands'],
  ['en', 'Engels'],
  ['fr', 'Frans'],
  ['de', 'Duits'],
  ['es', 'Spaans'],
  ['it', 'Italiaans'],
  ['pt', 'Portugees'],
  ['pl', 'Pools'],
  ['tr', 'Turks'],
  ['ar', 'Arabisch'],
  ['zh', 'Chinees'],
  ['ja', 'Japans'],
];

function _langOptions(selected = '') {
  return LANGUAGES.map(([v, l]) =>
    `<option value="${v}" ${v === selected ? 'selected' : ''}>${l}</option>`
  ).join('');
}

/**
 * @param {HTMLElement} container
 * @param {{ health: object, storage: object, api: object, sharedState: object }} opts
 */
export function renderTranslate(container, { health, storage, api, sharedState }) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Vertalen</h2>
      <p>Vertaal tekst tussen talen met keuze voor formele of informele toon</p>
    </div>

    <div id="toggle-wrap-translate"></div>

    <div class="flex-row" style="margin-bottom:.5rem;">
      <div class="label" style="margin-bottom:0;">Toon:</div>
      <div class="btn-group" role="group" aria-label="Vertaaltoon kiezen">
        <button class="btn btn-sm active" data-tone="formal"   aria-pressed="true">Formeel</button>
        <button class="btn btn-sm"        data-tone="informal" aria-pressed="false">Informeel</button>
      </div>
    </div>

    <div class="translate-grid">
      <div class="flex-col">
        <select id="source-lang" class="input" aria-label="Brontaal selecteren">
          ${_langOptions('')}
        </select>
        <div class="textarea-wrap">
          <textarea id="source-text" class="textarea large" rows="10"
                    placeholder="Voer brontekst in…" aria-label="Brontekst invoer"></textarea>
          <button class="clear-btn" id="source-clear" aria-label="Brontekst wissen" title="Wissen">✕</button>
        </div>
        <div id="source-char-count" style="font-size:.78rem;color:var(--text-muted);text-align:right;"></div>
      </div>

      <button class="swap-btn" id="swap-btn" aria-label="Bron- en doeltaal omwisselen">⇄</button>

      <div class="flex-col">
        <select id="target-lang" class="input" aria-label="Doeltaal selecteren">
          ${_langOptions('en')}
        </select>
        <textarea id="target-text" class="textarea large" rows="10" readonly
                  placeholder="Vertaling verschijnt hier…" aria-label="Vertaling"></textarea>
        <div class="flex-row" style="justify-content:flex-end;gap:.4rem;">
          <button id="copy-translate" class="btn btn-sm btn-secondary hidden"
                  aria-label="Kopieer vertaling naar klembord">📋 Kopiëren</button>
          <button id="save-translate" class="btn btn-sm btn-secondary hidden"
                  aria-label="Sla vertaling op als tekstbestand">💾 Opslaan</button>
        </div>
      </div>
    </div>

    <button id="translate-btn" class="btn btn-primary btn-lg" aria-label="Tekst vertalen">
      Vertaal
    </button>

    <div id="translate-loading" class="loading-row hidden" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>Bezig met vertalen…</span>
    </div>

    <div id="translate-error" class="status-msg error hidden" role="alert"></div>
  `;

  const toggleWrap  = container.querySelector('#toggle-wrap-translate');
  const toggle      = createModelToggle({ container: toggleWrap, health, api });

  const sourceLang  = container.querySelector('#source-lang');
  const targetLang  = container.querySelector('#target-lang');
  const sourceText  = container.querySelector('#source-text');
  const targetText  = container.querySelector('#target-text');
  const charCount   = container.querySelector('#source-char-count');
  const translateBtn = container.querySelector('#translate-btn');
  const loadingEl   = container.querySelector('#translate-loading');
  const errorEl     = container.querySelector('#translate-error');
  const copyBtn     = container.querySelector('#copy-translate');
  const saveBtn     = container.querySelector('#save-translate');
  const clearBtn    = container.querySelector('#source-clear');
  const swapBtn     = container.querySelector('#swap-btn');

  let selectedTone = 'formal';

  // Tone buttons
  container.querySelectorAll('[data-tone]').forEach(b => {
    b.addEventListener('click', () => {
      container.querySelectorAll('[data-tone]').forEach(x => {
        x.classList.remove('active');
        x.setAttribute('aria-pressed', 'false');
      });
      b.classList.add('active');
      b.setAttribute('aria-pressed', 'true');
      selectedTone = b.dataset.tone;
    });
  });

  // Clear button
  function _updateClearBtn() {
    clearBtn.classList.toggle('visible', sourceText.value.length > 0);
  }
  clearBtn.addEventListener('click', () => {
    sourceText.value = '';
    targetText.value = '';
    copyBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');
    _updateCount();
    _updateClearBtn();
    sourceText.focus();
  });

  // Character counter
  function _updateCount() {
    const mode = toggle.getQualityMode();
    const max = mode === 'quality' ? 20_000 : 4_000;
    const len = sourceText.value.length;
    const over = len > max;
    charCount.textContent = `${len.toLocaleString('nl-NL')} / ${max.toLocaleString('nl-NL')} tekens`;
    charCount.style.color = over ? 'var(--error)' : 'var(--text-muted)';
    translateBtn.disabled = len === 0 || over;
  }
  sourceText.addEventListener('input', () => { _updateCount(); _updateClearBtn(); });
  _updateCount();
  _updateClearBtn();

  // Swap languages
  swapBtn.addEventListener('click', () => {
    const tmpLang = sourceLang.value;
    const tmpText = sourceText.value;
    sourceLang.value = targetLang.value;
    targetLang.value = tmpLang || 'nl';
    sourceText.value = targetText.value;
    targetText.value = tmpText;
    _updateCount();
  });

  // Translate
  translateBtn.addEventListener('click', async () => {
    const text = sourceText.value.trim();
    if (!text) return;

    translateBtn.disabled = true;
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    copyBtn.classList.add('hidden');
    targetText.value = '';

    try {
      const result = await api.post('/translate', {
        text,
        source_language: sourceLang.value || null,
        target_language: targetLang.value || 'en',
        quality: toggle.getQualityMode(),
        tone: selectedTone,
      });
      targetText.value = result.translation;
      copyBtn.classList.remove('hidden');
      saveBtn.classList.remove('hidden');
    } catch (e) {
      errorEl.textContent = e.message || 'Vertalen mislukt';
      errorEl.classList.remove('hidden');
    } finally {
      translateBtn.disabled = false;
      loadingEl.classList.add('hidden');
    }
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(targetText.value);
  });

  saveBtn.addEventListener('click', () => {
    const tgt = container.querySelector('#target-lang').value || 'en';
    _saveText(targetText.value, `vertaling-${tgt}.txt`);
  });
}

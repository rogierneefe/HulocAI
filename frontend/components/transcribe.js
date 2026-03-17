/**
 * Transcription page component.
 * @module components/transcribe
 */

import { createModelToggle } from './model-toggle.js';

function _saveText(text, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function _stemNaam(file) {
  if (!file) return 'transcriptie.txt';
  return file.name.replace(/\.[^.]+$/, '') + '.txt';
}

/**
 * @param {HTMLElement} container
 * @param {{ health: object, storage: object, api: object, sharedState: object }} opts
 */
export function renderTranscribe(container, { health, storage, api, sharedState }) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Transcriberen</h2>
      <p>Converteer spraak naar tekst — uploaden of microfoon opnemen</p>
    </div>

    <div id="toggle-wrap-transcribe"></div>

    <div class="card" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
      <span class="label" style="margin:0;">Taal</span>
      <div class="btn-group" role="group" aria-label="Taal voor transcriptie">
        <button class="btn btn-sm btn-group-item" data-lang="nl" aria-pressed="true">NL</button>
        <button class="btn btn-sm btn-group-item" data-lang="en" aria-pressed="false">EN</button>
        <button class="btn btn-sm btn-group-item" data-lang=""  aria-pressed="false">Auto</button>
      </div>
    </div>

    <div class="upload-zone" id="upload-zone" role="button" tabindex="0"
         aria-label="Klik om een audiobestand te uploaden of sleep hier naartoe">
      <input type="file" id="audio-file-input" accept=".wav,.mp3,.m4a,.ogg,.webm"
             aria-label="Audiobestand selecteren">
      <div class="upload-icon" aria-hidden="true" style="font-size:2rem;margin-bottom:.5rem;">🎵</div>
      <p>Sleep een audiobestand hierheen of <strong>klik om te uploaden</strong></p>
      <p style="font-size:.8rem;color:var(--text-muted);margin-top:.25rem;">
        Ondersteund: .wav .mp3 .m4a .ogg .webm — max 50 MB
      </p>
    </div>

    <div class="flex-row">
      <button id="mic-btn" class="btn btn-secondary" aria-label="Microfoon opname starten">
        🎙️ Opname starten
      </button>
      <span id="rec-indicator" style="color:var(--error);font-size:.85rem;" class="hidden"
            aria-live="assertive">⏺ Bezig met opnemen…</span>
    </div>

    <button id="transcribe-btn" class="btn btn-primary btn-lg" disabled
            aria-label="Transcribeer het audiobestand">
      Transcribeer
    </button>

    <div id="transcribe-loading" class="loading-row hidden" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>Bezig met transcriberen…</span>
    </div>

    <div id="transcribe-error" class="status-msg error hidden" role="alert"></div>

    <div id="transcribe-result" class="result-card hidden">
      <div class="result-actions">
        <div class="card-title" style="margin-bottom:0;">Transcriptie</div>
        <div class="result-actions-btns">
          <button class="btn btn-sm btn-secondary" id="copy-transcribe"
                  aria-label="Kopieer transcriptie naar klembord">📋 Kopiëren</button>
          <button class="btn btn-sm btn-secondary" id="save-transcribe"
                  aria-label="Sla transcriptie op als tekstbestand">💾 Opslaan</button>
        </div>
      </div>
      <div id="transcribe-output" class="result-text" aria-live="polite"></div>
      <div style="margin-top:.75rem;">
        <button id="use-in-summarize" class="btn btn-secondary btn-sm"
                aria-label="Gebruik transcriptie als invoer voor samenvatten">
          → Gebruik voor samenvatten
        </button>
      </div>
    </div>
  `;

  // Model toggle
  const toggleWrap = container.querySelector('#toggle-wrap-transcribe');
  const toggle = createModelToggle({ container: toggleWrap, health, api });

  // Taalknopjes — standaard NL
  let selectedLang = 'nl';
  container.querySelectorAll('.btn-group-item[data-lang]').forEach(btn => {
    if (btn.dataset.lang === selectedLang) btn.classList.add('active');
    btn.addEventListener('click', () => {
      container.querySelectorAll('.btn-group-item[data-lang]').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      selectedLang = btn.dataset.lang;
    });
  });

  // File state
  let selectedFile = null;
  let mediaRecorder = null;
  let recordedChunks = [];

  const uploadZone = container.querySelector('#upload-zone');
  const fileInput  = container.querySelector('#audio-file-input');
  const micBtn     = container.querySelector('#mic-btn');
  const recIndicator = container.querySelector('#rec-indicator');
  const transcribeBtn = container.querySelector('#transcribe-btn');
  const loadingEl  = container.querySelector('#transcribe-loading');
  const errorEl    = container.querySelector('#transcribe-error');
  const resultEl   = container.querySelector('#transcribe-result');
  const outputEl   = container.querySelector('#transcribe-output');

  function _setFile(file) {
    selectedFile = file;
    transcribeBtn.disabled = !file;
    uploadZone.querySelector('p').textContent = file ? `Geselecteerd: ${file.name}` : '';
    errorEl.classList.add('hidden');
  }

  // Upload zone click / drag
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) _setFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) _setFile(fileInput.files[0]); });

  // Microphone recording
  micBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        _setFile(new File([blob], 'opname.webm', { type: 'audio/webm' }));
        micBtn.textContent = '🎙️ Opname starten';
        recIndicator.classList.add('hidden');
      };
      mediaRecorder.start();
      micBtn.textContent = '⏹ Stop opname';
      recIndicator.classList.remove('hidden');
    } catch (e) {
      errorEl.textContent = 'Microfoon niet beschikbaar: ' + e.message;
      errorEl.classList.remove('hidden');
    }
  });

  // Transcribe
  transcribeBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    transcribeBtn.disabled = true;
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    resultEl.classList.add('hidden');

    const formData = new FormData();
    formData.append('audio', selectedFile);
    if (selectedLang) formData.append('language', selectedLang);
    formData.append('quality', toggle.getQualityMode());

    try {
      const result = await api.upload('/transcribe', formData);
      outputEl.textContent = result.text;
      resultEl.classList.remove('hidden');
    } catch (e) {
      errorEl.textContent = e.message || 'Transcriberen mislukt';
      errorEl.classList.remove('hidden');
    } finally {
      transcribeBtn.disabled = false;
      loadingEl.classList.add('hidden');
    }
  });

  // Copy button
  container.querySelector('#copy-transcribe').addEventListener('click', () => {
    navigator.clipboard.writeText(outputEl.textContent);
  });

  // Save button — bestandsnaam gebaseerd op geüploaded audiobestand
  container.querySelector('#save-transcribe').addEventListener('click', () => {
    _saveText(outputEl.textContent, _stemNaam(selectedFile));
  });

  // Use in summarize
  container.querySelector('#use-in-summarize').addEventListener('click', () => {
    sharedState.transcribeText = outputEl.textContent;
    location.hash = '#summarize';
  });
}

/**
 * Admin panel component.
 * @module components/admin-panel
 */

import * as apiModule from '../js/api.js';
import * as storage from '../js/storage.js';

/**
 * @param {HTMLElement} container
 * @param {{ health: object, storage: object, api: object }} opts
 */
export function renderAdminPanel(container, { health, api }) {
  const token = storage.getAdminToken();
  if (!token) {
    _renderLogin(container);
  } else {
    apiModule.setAdminToken(token);
    _renderPanel(container, api);
  }
}

function _renderLogin(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Admin</h2>
      <p>Beheer van modellen en configuratie</p>
    </div>
    <div class="card" style="max-width:400px;">
      <div class="label">Admin token</div>
      <div class="flex-row">
        <input type="password" id="admin-token-input" class="input"
               placeholder="Voer admin token in" aria-label="Admin token invoer">
        <button id="admin-login-btn" class="btn btn-primary">Inloggen</button>
      </div>
      <div id="admin-login-error" class="status-msg error hidden" role="alert" style="margin-top:.5rem;"></div>
    </div>
  `;

  const tokenInput = container.querySelector('#admin-token-input');
  const loginBtn   = container.querySelector('#admin-login-btn');
  const errorEl    = container.querySelector('#admin-login-error');

  loginBtn.addEventListener('click', async () => {
    const t = tokenInput.value.trim();
    if (!t) return;
    storage.setAdminToken(t);
    apiModule.setAdminToken(t);
    // Verify token
    try {
      await apiModule.get('/admin/config');
      container.dataset.rendered = '';  // force re-render
      _renderPanel(container, apiModule);
    } catch (e) {
      storage.setAdminToken('');
      apiModule.setAdminToken('');
      errorEl.textContent = 'Ongeldige token';
      errorEl.classList.remove('hidden');
    }
  });

  tokenInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn.click();
  });
}

function _renderPanel(container, api) {
  container.innerHTML = `
    <div class="page-header">
      <h2>Admin</h2>
      <p>Beheer van modellen, configuratie en audit log</p>
    </div>

    <div class="tab-bar" role="tablist">
      <button class="tab-btn active" data-tab="models"  role="tab" aria-selected="true">Modellen</button>
      <button class="tab-btn"        data-tab="config"  role="tab" aria-selected="false">Configuratie</button>
      <button class="tab-btn"        data-tab="audit"   role="tab" aria-selected="false">Audit log</button>
      <button class="tab-btn"        data-tab="system"  role="tab" aria-selected="false">Systeem</button>
    </div>

    <div id="tab-models"  class="tab-pane active"><div class="loading-row"><span class="spinner"></span> Laden…</div></div>
    <div id="tab-config"  class="tab-pane"></div>
    <div id="tab-audit"   class="tab-pane"></div>
    <div id="tab-system"  class="tab-pane"></div>

    <div style="margin-top:1.5rem;">
      <button id="admin-logout-btn" class="btn btn-danger btn-sm"
              aria-label="Uitloggen als admin">Uitloggen</button>
    </div>
  `;

  // Tab switching
  const tabBtns = container.querySelectorAll('.tab-btn');
  const tabPanes = container.querySelectorAll('.tab-pane');
  const loaded = new Set();

  async function _switchTab(name) {
    tabBtns.forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
    });
    tabPanes.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
    if (!loaded.has(name)) {
      loaded.add(name);
      await _loadTab(name);
    }
  }

  tabBtns.forEach(b => b.addEventListener('click', () => _switchTab(b.dataset.tab)));
  _loadTab('models');
  loaded.add('models');

  container.querySelector('#admin-logout-btn').addEventListener('click', () => {
    storage.setAdminToken('');
    apiModule.setAdminToken('');
    container.dataset.rendered = '';
    _renderLogin(container);
  });

  async function _loadTab(name) {
    const pane = container.querySelector(`#tab-${name}`);
    try {
      switch (name) {
        case 'models':  await _renderModels(pane, api);  break;
        case 'config':  await _renderConfig(pane, api);  break;
        case 'audit':   await _renderAudit(pane, api);   break;
        case 'system':  await _renderSystem(pane, api);  break;
      }
    } catch (e) {
      pane.innerHTML = `<div class="status-msg error">Laden mislukt: ${e.message}</div>`;
    }
  }
}

async function _renderModels(pane, api) {
  const data = await api.get('/admin/models');
  const models = data.models || [];

  pane.innerHTML = `
    <div class="flex-col">
      <div class="flex-row" style="flex-wrap:wrap;">
        <input type="text" id="pull-model-input" class="input" placeholder="bijv. qwen2.5:3b"
               aria-label="Modelnaam om te downloaden" style="max-width:280px;">
        <button id="pull-btn" class="btn btn-primary btn-sm">Download model</button>
      </div>
      <div id="pull-progress" class="status-msg hidden"></div>
      <table class="data-table">
        <thead><tr><th>Model</th><th>Actie</th></tr></thead>
        <tbody id="models-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = pane.querySelector('#models-tbody');
  models.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m}</td>
      <td><button class="btn btn-danger btn-sm del-btn" data-model="${m}"
                  aria-label="Verwijder model ${m}">Verwijder</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.del-btn').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm(`Model "${b.dataset.model}" verwijderen?`)) return;
      await api.del(`/admin/models/${encodeURIComponent(b.dataset.model)}`);
      b.closest('tr').remove();
    });
  });

  // Pull model
  const pullInput    = pane.querySelector('#pull-model-input');
  const pullBtn      = pane.querySelector('#pull-btn');
  const pullProgress = pane.querySelector('#pull-progress');

  pullBtn.addEventListener('click', async () => {
    const name = pullInput.value.trim();
    if (!name) return;
    pullBtn.disabled = true;
    pullProgress.className = 'status-msg warning';
    pullProgress.textContent = `Downloaden: ${name}…`;
    pullProgress.classList.remove('hidden');
    try {
      await api.post('/admin/models/pull', { name });
      pullProgress.className = 'status-msg success';
      pullProgress.textContent = `${name} gedownload!`;
      await _renderModels(pane, api);
    } catch (e) {
      pullProgress.className = 'status-msg error';
      pullProgress.textContent = 'Download mislukt: ' + e.message;
    } finally {
      pullBtn.disabled = false;
    }
  });
}

async function _renderConfig(pane, api) {
  const cfg = await api.get('/admin/config');
  pane.innerHTML = `
    <form id="config-form" class="flex-col" style="max-width:440px;">
      ${_cfgField('terms_version', 'Terms versie', cfg.terms_version)}
      ${_cfgField('onboarding_version', 'Onboarding versie', cfg.onboarding_version)}
      ${_cfgField('rate_limit_per_minute', 'Rate limit (per minuut)', cfg.rate_limit_per_minute)}
      ${_cfgField('max_upload_size_mb', 'Max upload grootte (MB)', cfg.max_upload_size_mb)}
      ${_cfgField('ram_headroom_gb', 'RAM headroom (GB)', cfg.ram_headroom_gb)}
      <button type="submit" class="btn btn-primary">Opslaan</button>
      <div id="config-status" class="status-msg hidden"></div>
    </form>
  `;
  pane.querySelector('#config-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const statusEl = pane.querySelector('#config-status');
    try {
      await api.put('/admin/config', body);
      statusEl.className = 'status-msg success';
      statusEl.textContent = 'Opgeslagen';
    } catch (err) {
      statusEl.className = 'status-msg error';
      statusEl.textContent = err.message;
    }
    statusEl.classList.remove('hidden');
  });
}

function _cfgField(name, label, value) {
  return `
    <div>
      <label class="label" for="cfg-${name}">${label}</label>
      <input id="cfg-${name}" name="${name}" class="input" value="${value ?? ''}"
             aria-label="${label}">
    </div>`;
}

async function _renderAudit(pane, api) {
  let page = 1;

  async function _load() {
    const data = await api.get(`/admin/audit?page=${page}&per_page=25`);
    pane.innerHTML = `
      <div class="card" style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tijdstip</th><th>Actie</th><th>Model</th>
              <th>Modus</th><th>In</th><th>Uit</th><th>ms</th><th>OK</th>
            </tr>
          </thead>
          <tbody>
            ${(data.items || []).map(r => `
              <tr>
                <td>${r.timestamp?.split('T').join(' ').slice(0, 19) ?? '–'}</td>
                <td>${r.action}</td>
                <td>${r.model_used ?? '–'}</td>
                <td>${r.quality_mode ?? '–'}</td>
                <td>${r.input_length ?? '–'}</td>
                <td>${r.output_length ?? '–'}</td>
                <td>${r.processing_time_ms ?? '–'}</td>
                <td>${r.success ? '✔' : '✘'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="flex-row" style="margin-top:.75rem;font-size:.82rem;color:var(--text-muted);">
          <span>Totaal: ${data.total}</span>
          <button id="prev-page" class="btn btn-secondary btn-sm" ${page <= 1 ? 'disabled' : ''}>‹</button>
          <span>Pagina ${page}</span>
          <button id="next-page" class="btn btn-secondary btn-sm"
            ${page * 25 >= data.total ? 'disabled' : ''}>›</button>
        </div>
      </div>
    `;
    pane.querySelector('#prev-page')?.addEventListener('click', () => { page--; _load(); });
    pane.querySelector('#next-page')?.addEventListener('click', () => { page++; _load(); });
  }
  await _load();
}

async function _renderSystem(pane, api) {
  const info = await api.get('/admin/system');
  pane.innerHTML = `
    <div class="flex-col">
      <div class="card">
        <div class="card-title">CPU</div>
        <p>${info.cpu_model} — ${info.cpu_count} cores — ${info.cpu_percent}% gebruik</p>
      </div>
      <div class="card">
        <div class="card-title">RAM</div>
        <p>${info.ram.available_gb} GB vrij van ${info.ram.total_gb} GB
          (${info.ram.used_pct}% gebruikt)</p>
      </div>
      <div class="card">
        <div class="card-title">Schijf</div>
        <p>${info.disk_free_gb} GB vrij van ${info.disk_total_gb} GB</p>
      </div>
      <div class="card">
        <div class="card-title">Services</div>
        <p>Ollama: ${info.ollama_connected ? '✔ verbonden' : '✘ niet bereikbaar'}</p>
        <p>Whisper: ${info.whisper_connected ? '✔ verbonden' : '✘ niet bereikbaar'}</p>
      </div>
    </div>
  `;
}

/**
 * SPA router and state machine.
 * States: TERMS → ONBOARDING → APP
 * @module app
 */

import * as api from './api.js';
import * as storage from './storage.js';
import { renderEnvBadge, handleSandboxBanner } from './environment.js';

import { renderTerms } from '../components/terms.js';
import { renderOnboarding } from '../components/onboarding.js';
import { renderTranscribe } from '../components/transcribe.js';
import { renderSummarize } from '../components/summarize.js';
import { renderTranslate } from '../components/translate.js';
import { renderChat } from '../components/chat.js';
import { renderAdminPanel } from '../components/admin-panel.js';

// ── State ──────────────────────────────────────────────────────────────────

let _healthData = null;
let _currentRoute = null;

// Shared state between pages (e.g., transcribe → summarize handoff)
export const sharedState = { transcribeText: null };

// ── Routing ────────────────────────────────────────────────────────────────

const ROUTES = {
  '#transcribe': { id: 'view-transcribe', render: renderTranscribe, label: 'Transcriberen' },
  '#summarize':  { id: 'view-summarize',  render: renderSummarize,  label: 'Samenvatten' },
  '#translate':  { id: 'view-translate',  render: renderTranslate,  label: 'Vertalen' },
  '#chat':       { id: 'view-chat',       render: renderChat,       label: 'Chat' },
  '#admin':      { id: 'view-admin',      render: renderAdminPanel, label: 'Admin' },
};

function _navigate(hash) {
  if (_currentRoute === hash) return;
  _currentRoute = hash;

  // Update nav active state
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === hash);
  });

  // Show/hide views
  const mainContent = document.getElementById('main-content');
  Object.entries(ROUTES).forEach(([h, cfg]) => {
    let view = document.getElementById(cfg.id);
    if (!view) {
      view = document.createElement('div');
      view.id = cfg.id;
      view.className = 'page-view';
      mainContent.appendChild(view);
    }
    view.classList.toggle('active', h === hash);
    if (h === hash && !view.dataset.rendered) {
      cfg.render(view, { health: _healthData, storage, api, sharedState });
      view.dataset.rendered = '1';
    }
  });

  // Transcribe → Summarize handoff: fill textarea even if already rendered
  if (hash === '#summarize' && sharedState.transcribeText) {
    const input = document.getElementById('summarize-input');
    if (input) {
      input.value = sharedState.transcribeText;
      sharedState.transcribeText = null;
      input.dispatchEvent(new Event('input'));
    }
  }
}

function _onHashChange() {
  const hash = location.hash || '#transcribe';
  _navigate(hash);
}

// ── Startup flow ───────────────────────────────────────────────────────────

async function _fetchHealth() {
  try {
    _healthData = await api.get('/health');
    return _healthData;
  } catch {
    return null;
  }
}

function _showOnboarding(health) {
  document.getElementById('screen-overlay').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  renderOnboarding(document.getElementById('screen-overlay'), {
    health,
    storage,
    api,
    onDone: () => _showTerms(health),
  });
}

function _showTerms(health) {
  document.getElementById('screen-overlay').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  renderTerms(document.getElementById('screen-overlay'), {
    health,
    storage,
    api,
    onDone: () => _showApp(health),
  });
}

function _showApp(health) {
  document.getElementById('screen-overlay').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  // Environment badge
  const mode = health?.environment || 'production';
  const envBadgeWrap = document.getElementById('env-badge-wrap');
  if (envBadgeWrap) renderEnvBadge(envBadgeWrap, mode);
  handleSandboxBanner(mode);

  // Show/hide admin nav item
  const adminNav = document.querySelector('.nav-item[data-route="#admin"]');
  if (adminNav) {
    const showAdmin = mode !== 'production' || storage.getAdminToken();
    adminNav.classList.toggle('hidden', !showAdmin);
  }

  // Nav click / keyboard handlers
  document.querySelectorAll('.nav-item[data-route]').forEach(item => {
    item.addEventListener('click', () => { location.hash = item.dataset.route; });
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        location.hash = item.dataset.route;
      }
    });
  });

  // Route
  window.addEventListener('hashchange', _onHashChange);
  _onHashChange();
}

// ── Theme ───────────────────────────────────────────────────────────────────

function _applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const moon = document.getElementById('theme-icon-moon');
  const sun  = document.getElementById('theme-icon-sun');
  if (moon) moon.style.display = theme === 'light' ? 'none' : 'block';
  if (sun)  sun.style.display  = theme === 'light' ? 'block' : 'none';
}

function _initTheme() {
  const theme = storage.getTheme();
  _applyTheme(theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = storage.getTheme() === 'dark' ? 'light' : 'dark';
      storage.setTheme(next);
      _applyTheme(next);
    });
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────

async function boot() {
  _initTheme();
  const health = await _fetchHealth();
  const termsVersion = health?.terms_version || 'v1';
  const onboardingVersion = health?.onboarding_version || 'v1';

  const termsAccepted = storage.getTermsAccepted();
  const onboardingDone = storage.getOnboardingCompleted();

  if (onboardingDone !== onboardingVersion) {
    _showOnboarding(health);
  } else if (termsAccepted !== termsVersion) {
    _showTerms(health);
  } else {
    _showApp(health);
  }
}

// Navigate to a specific route programmatically
export function navigateTo(hash) {
  location.hash = hash;
}

document.addEventListener('DOMContentLoaded', boot);

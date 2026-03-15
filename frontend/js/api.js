/**
 * API client: fetch wrapper, SSE helper, error handling.
 * @module api
 */

const API_BASE = '/api';
let _adminToken = null;

/** @param {string} token */
export function setAdminToken(token) { _adminToken = token; }

function _headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (_adminToken) h['Authorization'] = `Bearer ${_adminToken}`;
  return h;
}

/**
 * Parse a response; throw a user-friendly error on failure.
 * @param {Response} res
 */
async function _parse(res) {
  if (res.ok) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    detail = body.detail || detail;
  } catch { /* ignore */ }
  const err = new Error(detail);
  err.status = res.status;
  throw err;
}

/**
 * GET request.
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
export async function get(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: _headers({ 'Content-Type': undefined }),
  });
  return _parse(res);
}

/**
 * POST JSON request.
 * @param {string} endpoint
 * @param {object} data
 * @returns {Promise<any>}
 */
export async function post(endpoint, data) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: _headers(),
    body: JSON.stringify(data),
  });
  return _parse(res);
}

/**
 * PUT JSON request.
 * @param {string} endpoint
 * @param {object} data
 * @returns {Promise<any>}
 */
export async function put(endpoint, data) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PUT',
    headers: _headers(),
    body: JSON.stringify(data),
  });
  return _parse(res);
}

/**
 * DELETE request.
 * @param {string} endpoint
 * @returns {Promise<any>}
 */
export async function del(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'DELETE',
    headers: _headers({ 'Content-Type': undefined }),
  });
  return _parse(res);
}

/**
 * Multipart upload.
 * @param {string} endpoint
 * @param {FormData} formData
 * @returns {Promise<any>}
 */
export async function upload(endpoint, formData) {
  const headers = {};
  if (_adminToken) headers['Authorization'] = `Bearer ${_adminToken}`;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  return _parse(res);
}

/**
 * SSE streaming POST.
 * @param {string} endpoint
 * @param {object} data
 * @param {(token: string) => void} onToken - called per token
 * @param {(event: string, value: any) => void} [onEvent] - called for non-token events (e.g. thinking)
 * @returns {Promise<string>} full response text
 */
export async function stream(endpoint, data, onToken, onEvent = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (_adminToken) headers['Authorization'] = `Bearer ${_adminToken}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); detail = b.detail || detail; } catch { /* ignore */ }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.token) {
          fullText += parsed.token;
          onToken(parsed.token);
        }
        if (parsed.thinking !== undefined && onEvent) onEvent('thinking', parsed.thinking);
        if (parsed.done) return fullText;
      } catch (e) {
        if (e.message && !e.message.startsWith('JSON')) throw e;
      }
    }
  }
  return fullText;
}

'use strict';

// Thin fetch wrapper for the RPATS API.
//  - Same-origin credentials (session cookie) are always sent.
//  - The CSRF token (readable XSRF-TOKEN cookie) is echoed as a header on all
//    state-changing requests, satisfying the server's double-submit check.
//  - Non-2xx responses throw an ApiError carrying { status, message, details }.

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const headers = {};
  const opts = { method, credentials: 'same-origin', headers };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (!['GET', 'HEAD'].includes(method)) {
    const csrf = getCookie('XSRF-TOKEN');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch('/api' + path, opts);
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }

  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || 'Request failed';
    throw new ApiError(res.status, msg, data && data.details);
  }
  return data;
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};

// ---- Auth-specific helpers ----
const auth = {
  register: (payload) => api.post('/auth/register', payload),
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

window.api = api;
window.auth = auth;
window.ApiError = ApiError;

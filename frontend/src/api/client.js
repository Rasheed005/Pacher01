// Thin fetch wrapper for the Pacher API — same behavior as the original vanilla
// client, now importable as an ES module.
//  - Same-origin credentials (session cookie) are always sent.
//  - The readable XSRF-TOKEN cookie is echoed as X-CSRF-Token on state-changing
//    requests, satisfying the server's double-submit CSRF check.
//  - Non-2xx responses throw an ApiError carrying { status, message, details }.

export function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
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
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || 'Request failed';
    throw new ApiError(res.status, msg, data && data.details);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};

export const authApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  resend: (email) => api.post('/auth/resend', { email }),
  getInvitation: (token) => api.get('/auth/invitation?token=' + encodeURIComponent(token)),
  acceptInvite: (token, password, name) => api.post('/auth/accept-invite', { token, password, name }),
  requestReset: (email) => api.post('/auth/request-reset', { email }),
  resetPassword: (token, password) => api.post('/auth/reset', { token, password }),
};

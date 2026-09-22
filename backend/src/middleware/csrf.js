'use strict';

const crypto = require('crypto');
const config = require('../config/env');

// Integrity (CSRF defense), double-submit style:
//  - ensureCsrfToken() puts a random token in the session and mirrors it in a
//    readable (non-httpOnly) cookie the frontend can echo back.
//  - csrfProtection() requires that echoed token on all state-changing requests,
//    plus a same-origin check on Origin/Referer when present.
//  - rotateCsrf() issues a fresh token (used after session regeneration on login).

function setCsrfCookie(res, token) {
  res.cookie('XSRF-TOKEN', token, {
    httpOnly: false, // must be readable by frontend JS to echo it back
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
  });
}

function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  setCsrfCookie(res, req.session.csrfToken);
  next();
}

function rotateCsrf(req, res) {
  req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  setCsrfCookie(res, req.session.csrfToken);
  return req.session.csrfToken;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameOrigin(req) {
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return true; // no header to check (e.g. same-origin GET, curl)
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  if (!sameOrigin(req)) {
    return res.status(403).json({ error: 'Cross-origin request blocked' });
  }
  const token = req.get('x-csrf-token');
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}

module.exports = { ensureCsrfToken, csrfProtection, rotateCsrf };

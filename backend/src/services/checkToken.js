'use strict';

const crypto = require('crypto');
const config = require('../config/env');

// Integrity: a stateless, content-bound proof that the student actually ran the
// similarity check for the *exact* title+abstract they are submitting.
//
// The similarity-check endpoint returns sign(title, abstract); the submit endpoint
// requires a token that verify()s against the submitted text. Because it is an
// HMAC keyed by the server secret, the client cannot forge one without having
// called the check endpoint for that same text. Editing the title/abstract
// invalidates a previously issued token.

function normalize(str) {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function sign(title, abstract) {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(`${normalize(title)}|${normalize(abstract)}`)
    .digest('hex');
}

function verify(title, abstract, token) {
  if (!token || typeof token !== 'string') return false;
  const expected = sign(title, abstract);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  // Constant-time compare (avoid leaking match progress via timing).
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { sign, verify };

'use strict';

const config = require('../config/env');

// Resilient client for the standalone Python S-BERT service.
// Availability: every call has a timeout and is wrapped so a slow/down service
// can never hang or crash Node — callers get a clear "unavailable" result and
// the rest of the system carries on.

async function withTimeout(fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.sbert.timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// Compare `text` against candidates [{id, title, text}].
// Returns { status:'ok'|'unavailable', topScore, matches:[{id,title,score}] }.
async function checkSimilarity(text, candidates) {
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(`${config.sbert.url}/similarity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, candidates }),
        signal,
      });
      if (!res.ok) throw new Error(`S-BERT responded ${res.status}`);
      const data = await res.json();
      return { status: 'ok', topScore: data.topScore ?? 0, matches: data.matches || [] };
    });
  } catch (err) {
    console.warn('[sbert] unavailable:', err.message);
    return { status: 'unavailable', topScore: null, matches: [] };
  }
}

// Lightweight health probe for admin monitoring.
async function health() {
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(`${config.sbert.url}/health`, { signal });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      return { status: 'ok', model: data.model };
    });
  } catch (err) {
    return { status: 'down', error: err.message };
  }
}

// Map a top similarity score to a student-facing warning band.
function warningFor(topScore) {
  if (topScore === null || topScore === undefined) {
    return { level: 'unavailable', message: 'Similarity check is currently unavailable — your submission is unaffected.' };
  }
  if (topScore >= config.similarity.high) {
    return {
      level: 'high',
      message: 'This topic is very similar to an existing one and is likely to be rejected. Consider revising it before submitting.',
    };
  }
  if (topScore >= config.similarity.moderate) {
    return {
      level: 'moderate',
      message: 'This topic has moderate similarity to existing work and may be flagged for review. Check the closest matches below.',
    };
  }
  return { level: 'low', message: 'This topic looks sufficiently distinct from existing submissions.' };
}

module.exports = { checkSimilarity, health, warningFor, thresholds: config.similarity };

'use strict';

// Wrap async route handlers so rejected promises reach the error handler
// instead of crashing the process (Availability).
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Global error handler. Keeps responses consistent and never leaks stack traces
// to clients in production.
function errorHandler(err, req, res, _next) {
  // Duplicate key (e.g. email already exists)
  if (err && err.code === 11000) {
    return res.status(409).json({ error: 'A record with that value already exists', fields: err.keyValue });
  }
  // Mongoose validation
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }
  // Bad ObjectId etc.
  if (err && err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid identifier' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'Server error' });
}

module.exports = { asyncHandler, notFound, errorHandler };

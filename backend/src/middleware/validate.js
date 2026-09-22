'use strict';

const { validationResult } = require('express-validator');

// Integrity: reject any request that fails server-side validation before it
// reaches business logic. Used after express-validator check chains.
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

module.exports = { handleValidation };

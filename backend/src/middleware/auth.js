'use strict';

const User = require('../models/User');
const { asyncHandler } = require('./error');

// Confidentiality: require a valid session and load the current user onto req.user.
// We reload from the DB every request so role/assignment changes take effect
// immediately and a deleted/deactivated account can't keep acting.
const requireAuth = asyncHandler(async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await User.findById(req.session.userId);
  if (!user || !user.active) {
    return req.session.destroy(() => res.status(401).json({ error: 'Session invalid' }));
  }
  req.user = user;
  next();
});

// Confidentiality: restrict a route to one or more roles. Use after requireAuth.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };

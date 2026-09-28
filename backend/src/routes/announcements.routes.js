'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const Announcement = require('../models/Announcement');
const { asyncHandler } = require('../middleware/error');
const { handleValidation } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Confidentiality: every announcement route requires an authenticated user.
router.use(requireAuth);

// GET /api/announcements — announcements visible to the current user.
// Students see global posts + their own supervisor's; supervisors see global +
// their own; admins see everything. Scoping is enforced server-side.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    let filter;
    if (req.user.role === 'admin') {
      filter = {};
    } else if (req.user.role === 'supervisor') {
      filter = { $or: [{ scope: 'global' }, { scope: 'supervisor', supervisor: req.user._id }] };
    } else {
      // student — global plus their assigned supervisor's posts (if any)
      const clauses = [{ scope: 'global' }];
      if (req.user.supervisor) {
        clauses.push({ scope: 'supervisor', supervisor: req.user.supervisor });
      }
      filter = { $or: clauses };
    }
    const announcements = await Announcement.find(filter).sort('-createdAt').limit(50);
    res.json({ announcements });
  })
);

// POST /api/announcements — admins post global; supervisors post to their students.
router.post(
  '/',
  requireRole('admin', 'supervisor'),
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 140 }),
    body('body').trim().notEmpty().withMessage('Message is required').isLength({ max: 2000 }),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    // Integrity: scope + audience are derived from the author's role, never trusted
    // from the client — a supervisor can only ever post to their own students.
    const announcement = await Announcement.create({
      author: req.user._id,
      authorName: req.user.name,
      scope: isAdmin ? 'global' : 'supervisor',
      supervisor: isAdmin ? undefined : req.user._id,
      title: req.body.title,
      body: req.body.body,
    });
    res.status(201).json({ announcement });
  })
);

// DELETE /api/announcements/:id — the author, or any admin, may remove it.
router.delete(
  '/:id',
  [param('id').isMongoId()],
  handleValidation,
  asyncHandler(async (req, res) => {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    // Integrity: only the author or an admin can delete.
    if (req.user.role !== 'admin' && !announcement.author.equals(req.user._id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await announcement.deleteOne();
    res.json({ ok: true });
  })
);

module.exports = router;

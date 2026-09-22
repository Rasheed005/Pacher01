'use strict';

const express = require('express');
const { param, query } = require('express-validator');

const Notification = require('../models/Notification');
const { asyncHandler } = require('../middleware/error');
const { handleValidation } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Confidentiality: notifications are always scoped to the logged-in user.
router.use(requireAuth);

// GET /api/notifications?limit=&skip= — the current user's notifications (newest first).
// No params → the bell's default page (50). Always returns the true DB unread count
// and grand total so the client can paginate and badge accurately.
router.get(
  '/',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('skip').optional().isInt({ min: 0 }).toInt(),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const limit = req.query.limit || 50;
    const skip = req.query.skip || 0;
    const filter = { user: req.user._id };

    const [notifications, unreadCount, total] = await Promise.all([
      Notification.find(filter).sort('-createdAt').skip(skip).limit(limit),
      Notification.countDocuments({ ...filter, read: false }),
      Notification.countDocuments(filter),
    ]);
    res.json({ notifications, unreadCount, total });
  })
);

// POST /api/notifications/read — mark ALL of the user's notifications as read.
router.post(
  '/read',
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
    res.json({ ok: true, unreadCount: 0 });
  })
);

// POST /api/notifications/:id/read — mark a SINGLE notification as read.
router.post(
  '/:id/read',
  param('id').isMongoId(),
  handleValidation,
  asyncHandler(async (req, res) => {
    // Confidentiality: scope by user so one user can't flip another's notification.
    await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { read: true } });
    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ ok: true, unreadCount });
  })
);

module.exports = router;

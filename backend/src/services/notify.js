'use strict';

const Notification = require('../models/Notification');

// Fire-and-forget notification creation. Availability: a failure to write a
// notification must never break the primary request (review/submission), so
// errors are swallowed and logged rather than thrown.
// `type` categorises the notification for per-type icons/labels on the client.
async function notify(userId, message, link = '', type = 'system') {
  if (!userId) return null;
  try {
    return await Notification.create({ user: userId, message, link, type });
  } catch (err) {
    console.error('[notify] failed to create notification:', err.message);
    return null;
  }
}

module.exports = { notify };

'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Lightweight in-app notification. Each is addressed to a single user and
// carries an optional client-side link to jump to the relevant page.
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, required: true, maxlength: 500 },
    link: { type: String, default: '' },
    // Category for per-type icons/labels on the client (see notify()).
    type: {
      type: String,
      enum: ['system', 'topic', 'chapter', 'final', 'assignment'],
      default: 'system',
    },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Notification', notificationSchema);

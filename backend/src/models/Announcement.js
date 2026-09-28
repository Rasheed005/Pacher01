'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// A broadcast message shown on dashboards. Unlike Notification (addressed to a
// single user), an announcement targets an audience:
//   - scope 'global'     → every student (posted by an admin)
//   - scope 'supervisor' → only that supervisor's students (posted by a supervisor)
const announcementSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, maxlength: 120 },
    scope: { type: String, enum: ['global', 'supervisor'], required: true },
    // Set only when scope === 'supervisor': identifies whose students may see it.
    supervisor: { type: Schema.Types.ObjectId, ref: 'User' },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// Common lookup: newest-first within an audience.
announcementSchema.index({ scope: 1, supervisor: 1, createdAt: -1 });

announcementSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Announcement', announcementSchema);

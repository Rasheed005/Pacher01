'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// A pending account that has NOT yet earned a row in the `users` collection.
// Two flavours, distinguished by `type`:
//   - 'invite'  — an admin invited a supervisor; the real User is created when
//                 the invitee accepts and sets a password.
//   - 'signup'  — a student self-registered; the real User is created when they
//                 click the email-verification link.
// Confidentiality: unverified / unaccepted people never pollute core user data,
// and secrets (`passwordHash`, `token`) are select:false + stripped from JSON.
const invitationSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ['student', 'supervisor'], required: true },
    type: { type: String, enum: ['invite', 'signup'], required: true },

    // Optional profile captured up-front (signup) or on accept (invite).
    name: { type: String, trim: true, maxlength: 120 },
    department: { type: String, trim: true, maxlength: 120 },
    matricNumber: { type: String, trim: true, maxlength: 60 },

    // Confidentiality: present for signups (chosen at register time); never selected
    // by default, never serialized.
    passwordHash: { type: String, select: false },

    // Who sent an admin invite (absent for self-serve signups).
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // Single-use, expiring token (32 random bytes hex). select:false — never leaked.
    token: { type: String, select: false },
    tokenExpires: { type: Date },

    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
    acceptedAt: { type: Date },
  },
  { timestamps: true }
);

// Admin invitation lists query by status+role, newest first.
invitationSchema.index({ status: 1, role: 1, createdAt: -1 });

invitationSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.token;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Invitation', invitationSchema);

'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['student', 'supervisor', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Confidentiality: never selected by default, never serialized (see toJSON below).
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'student' },
    department: { type: String, trim: true, maxlength: 120 },

    // Student-only fields
    matricNumber: {
      type: String,
      trim: true,
      maxlength: 60,
      // Integrity: required for students only — supervisors/admins have none.
      required: function requiredForStudents() {
        return this.role === 'student';
      },
      // Unique across the collection; sparse so the docs without one don't collide.
      index: { unique: true, sparse: true },
    },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Email verification: students self-register and must verify before first login.
    // The seeded admin and admin-created supervisors are created already-verified.
    emailVerified: { type: Boolean, default: false },
    verifyToken: { type: String, select: false }, // Confidentiality: never selected by default
    verifyTokenExpires: { type: Date },

    // Password reset: a single-use, expiring token emailed on request.
    // Confidentiality: never selected by default, never serialized (see toJSON).
    resetToken: { type: String, select: false },
    resetTokenExpires: { type: Date },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Strip sensitive/internal fields from any JSON representation (API responses).
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.verifyToken;
    delete ret.verifyTokenExpires;
    delete ret.resetToken;
    delete ret.resetTokenExpires;
    delete ret.__v;
    return ret;
  },
});

// Integrity: hashing helpers live on the model so hashing is consistent everywhere.
userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  // Requires the doc to have been queried with .select('+passwordHash')
  return bcrypt.compare(plain, this.passwordHash);
};

const User = mongoose.model('User', userSchema);
User.ROLES = ROLES;

module.exports = User;

'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const config = require('../config/env');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const { asyncHandler } = require('../middleware/error');
const { handleValidation } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { rotateCsrf } = require('../middleware/csrf');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/mailer');

const router = express.Router();

// Availability + brute-force resistance: cap auth attempts per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // verify / invite / reset links expire after 24h

// Integrity: 32 random bytes → an unguessable, single-use token.
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Log the freshly-authenticated user into the session.
function establishSession(req, user) {
  req.session.userId = user._id.toString();
  req.session.role = user.role;
}

// Issue/refresh a pending student signup's verification token and email the link.
// The real User is not created until the link is clicked (see GET /verify).
async function issueSignupEmail(invitation) {
  invitation.token = newToken();
  invitation.tokenExpires = new Date(Date.now() + TOKEN_TTL_MS);
  await invitation.save();
  const link = `${config.appUrl}/api/auth/verify?token=${invitation.token}`;
  await sendVerificationEmail({ name: invitation.name, email: invitation.email }, link);
}

// POST /api/auth/register  — public student self-signup.
// Writes a *pending* Invitation (type 'signup'); no User (and no unverified row in
// the users collection) exists until the email is verified.
router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('department').optional().trim().isLength({ max: 120 }),
    body('matricNumber').trim().notEmpty().withMessage('Matric number is required').isLength({ max: 60 }),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { name, email, password, department, matricNumber } = req.body;

    // Integrity: no duplicate identities against the REAL users collection.
    if (await User.findOne({ email })) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    if (await User.findOne({ matricNumber })) {
      return res.status(409).json({ error: 'That matric number is already registered' });
    }
    // ...nor against a *different* pending signup already holding this matric.
    const matricHeld = await Invitation.findOne({
      matricNumber,
      type: 'signup',
      status: 'pending',
      email: { $ne: email },
    });
    if (matricHeld) {
      return res.status(409).json({ error: 'That matric number is already registered' });
    }

    const passwordHash = await User.hashPassword(password);

    // Re-registering the same email just refreshes the pending signup (and resends).
    let invitation = await Invitation.findOne({ email, type: 'signup', status: 'pending' });
    if (!invitation) invitation = new Invitation({ email, type: 'signup', role: 'student' });
    invitation.name = name;
    invitation.department = department;
    invitation.matricNumber = matricNumber;
    invitation.passwordHash = passwordHash;
    invitation.status = 'pending';

    await issueSignupEmail(invitation);
    res.json({ needsVerification: true, email });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Need +passwordHash for verification (select:false by default).
    const user = await User.findOne({ email }).select('+passwordHash');
    if (user) {
      // Same generic message whether email or password is wrong (no enumeration).
      if (!user.active || !(await user.verifyPassword(password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      // Legacy guard: real users are always verified now, but keep the check for any
      // pre-existing emailVerified:false rows.
      if (!user.emailVerified) {
        return res.status(403).json({ error: 'email_not_verified' });
      }
      // Prevent session fixation: issue a fresh session on login.
      return req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: 'Could not start session' });
        establishSession(req, user);
        rotateCsrf(req, res); // fresh CSRF token bound to the new session
        user.passwordHash = undefined;
        res.json({ user });
      });
    }

    // No real user yet. If a pending signup matches these exact credentials, tell the
    // client to verify (drives the Login "resend verification" UX) — this only fires
    // after a correct password, so it never reveals account existence to guessers.
    const pending = await Invitation.findOne({ email, type: 'signup', status: 'pending' }).select('+passwordHash');
    if (pending && pending.passwordHash && (await bcrypt.compare(password, pending.passwordHash))) {
      return res.status(403).json({ error: 'email_not_verified' });
    }
    return res.status(401).json({ error: 'Invalid email or password' });
  })
);

// GET /api/auth/verify?token=…  — click-through from the verification email.
// GET (not POST) so the emailed link works with no CSRF token and no JS. The pending
// signup is consumed atomically, then the real User is created (emailVerified:true).
router.get(
  '/verify',
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return res.redirect('/login?verifyError=1');

    const invitation = await Invitation.findOneAndUpdate(
      { token, type: 'signup', status: 'pending', tokenExpires: { $gt: new Date() } },
      { $set: { status: 'accepted', acceptedAt: new Date() }, $unset: { token: '', tokenExpires: '' } },
      { new: true }
    ).select('+passwordHash');
    if (!invitation) return res.redirect('/login?verifyError=1');

    try {
      // Idempotency / race safety: only create if the user doesn't already exist.
      const existing = await User.findOne({ email: invitation.email });
      if (!existing) {
        await User.create({
          name: invitation.name,
          email: invitation.email,
          passwordHash: invitation.passwordHash,
          role: 'student',
          department: invitation.department,
          matricNumber: invitation.matricNumber,
          emailVerified: true,
        });
      }
      return res.redirect('/login?verified=1');
    } catch (err) {
      console.error('[auth] verify → user creation failed:', err.message);
      return res.redirect('/login?verifyError=1');
    }
  })
);

// POST /api/auth/resend  — re-issue the verification email for a pending signup.
// Always responds 200 (no account enumeration); rate-limited like other auth routes.
router.post(
  '/resend',
  authLimiter,
  [body('email').isEmail().withMessage('Valid email required').normalizeEmail()],
  handleValidation,
  asyncHandler(async (req, res) => {
    const invitation = await Invitation.findOne({ email: req.body.email, type: 'signup', status: 'pending' });
    if (invitation) await issueSignupEmail(invitation);
    res.json({ ok: true });
  })
);

// GET /api/auth/invitation?token=…  — public: describe a pending supervisor invite so
// the accept page can greet the invitee. 400 for anything invalid/expired.
router.get(
  '/invitation',
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return res.status(400).json({ error: 'This invitation is invalid or has expired' });

    const invitation = await Invitation.findOne({
      token,
      type: 'invite',
      status: 'pending',
      tokenExpires: { $gt: new Date() },
    });
    if (!invitation) return res.status(400).json({ error: 'This invitation is invalid or has expired' });

    res.json({ invitation: { email: invitation.email, name: invitation.name || '', role: invitation.role } });
  })
);

// POST /api/auth/accept-invite  — public: complete a supervisor invite by setting a
// password. The role/email come from the stored invite, never from the client.
router.post(
  '/accept-invite',
  authLimiter,
  [
    body('token').isString().notEmpty().withMessage('Missing invitation token'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').optional().trim().isLength({ max: 120 }),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { token, password, name } = req.body;

    const invitation = await Invitation.findOneAndUpdate(
      { token, type: 'invite', status: 'pending', tokenExpires: { $gt: new Date() } },
      { $set: { status: 'accepted', acceptedAt: new Date() }, $unset: { token: '', tokenExpires: '' } },
      { new: true }
    );
    if (!invitation) return res.status(400).json({ error: 'This invitation is invalid or has expired' });

    // Idempotency: if the account already exists, treat as success.
    const existing = await User.findOne({ email: invitation.email });
    if (!existing) {
      try {
        await User.create({
          name: name || invitation.name || invitation.email,
          email: invitation.email,
          passwordHash: await User.hashPassword(password),
          role: invitation.role, // from the invite — never client-asserted
          department: invitation.department,
          emailVerified: true,
        });
      } catch (err) {
        console.error('[auth] accept-invite → user creation failed:', err.message);
        return res.status(400).json({ error: 'Could not complete registration' });
      }
    }
    res.json({ ok: true });
  })
);

// POST /api/auth/request-reset  — public: email a password-reset link.
// Always responds 200 (no account enumeration); rate-limited.
router.post(
  '/request-reset',
  authLimiter,
  [body('email').isEmail().withMessage('Valid email required').normalizeEmail()],
  handleValidation,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && user.active) {
      user.resetToken = newToken();
      user.resetTokenExpires = new Date(Date.now() + TOKEN_TTL_MS);
      await user.save();
      const link = `${config.appUrl}/reset-password?token=${user.resetToken}`;
      await sendPasswordResetEmail(user, link);
    }
    res.json({ ok: true });
  })
);

// POST /api/auth/reset  — public: set a new password from a valid reset token.
router.post(
  '/reset',
  authLimiter,
  [
    body('token').isString().notEmpty().withMessage('Missing reset token'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    const passwordHash = await User.hashPassword(password);

    // Atomic single-use consume: match an unexpired token, swap the hash, clear it.
    const user = await User.findOneAndUpdate(
      { resetToken: token, resetTokenExpires: { $gt: new Date() } },
      { $set: { passwordHash }, $unset: { resetToken: '', resetTokenExpires: '' } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired' });

    res.json({ ok: true });
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  })
);

// GET /api/auth/me  — current session user, or 401.
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

module.exports = router;

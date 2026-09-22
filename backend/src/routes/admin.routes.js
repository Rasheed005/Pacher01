'use strict';

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');

const config = require('../config/env');
const User = require('../models/User');
const Project = require('../models/Project');
const Invitation = require('../models/Invitation');
const sbert = require('../services/sbert.service');
const { notify } = require('../services/notify');
const { sendInvitationEmail } = require('../services/mailer');
const { asyncHandler } = require('../middleware/error');
const { handleValidation } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Confidentiality: every admin route requires an authenticated admin.
router.use(requireAuth, requireRole('admin'));

// Availability: bound admin user-search + bulk-assign traffic. Short window so a
// legit admin who briefly trips it recovers within a minute (search is also
// debounced client-side, so normal use never gets close).
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // invitation links expire after 24h

// Issue/refresh an invitation's single-use token and email the accept link.
async function issueInvitationEmail(invitation) {
  invitation.token = crypto.randomBytes(32).toString('hex');
  invitation.tokenExpires = new Date(Date.now() + INVITE_TTL_MS);
  await invitation.save();
  const link = `${config.appUrl}/accept-invite?token=${invitation.token}`;
  await sendInvitationEmail(invitation.email, invitation.name, link);
}

// POST /api/admin/invitations — invite a supervisor.
// Supervisors are onboarded ONLY through invitations (no direct create, no self-serve).
// A real User is created when the invitee accepts (see POST /api/auth/accept-invite).
router.post(
  '/invitations',
  [
    body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('name').optional().trim().isLength({ max: 120 }),
    body('department').optional().trim().isLength({ max: 120 }),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { email, name, department } = req.body;

    // Integrity: don't invite someone who already has an account…
    if (await User.findOne({ email })) {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    // …or who already has a live pending invite.
    if (await Invitation.findOne({ email, type: 'invite', status: 'pending' })) {
      return res.status(409).json({ error: 'That email already has a pending invitation' });
    }

    const invitation = new Invitation({
      email,
      name,
      department,
      role: 'supervisor',
      type: 'invite',
      invitedBy: req.user._id,
    });
    await issueInvitationEmail(invitation);
    res.status(201).json({ invitation });
  })
);

// GET /api/admin/invitations — supervisor invites, newest first.
router.get(
  '/invitations',
  asyncHandler(async (req, res) => {
    const invitations = await Invitation.find({ type: 'invite' }).sort('-createdAt');
    res.json({ invitations });
  })
);

// POST /api/admin/invitations/:id/resend — re-issue the token + email.
router.post(
  '/invitations/:id/resend',
  param('id').isMongoId(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const invitation = await Invitation.findOne({ _id: req.params.id, type: 'invite', status: 'pending' });
    if (!invitation) return res.status(404).json({ error: 'Pending invitation not found' });
    await issueInvitationEmail(invitation);
    res.json({ ok: true });
  })
);

// DELETE /api/admin/invitations/:id — revoke a pending invitation.
router.delete(
  '/invitations/:id',
  param('id').isMongoId(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const invitation = await Invitation.findOneAndUpdate(
      { _id: req.params.id, type: 'invite', status: 'pending' },
      { $set: { status: 'revoked' }, $unset: { token: '', tokenExpires: '' } },
      { new: true }
    );
    if (!invitation) return res.status(404).json({ error: 'Pending invitation not found' });
    res.json({ ok: true });
  })
);

// GET /api/admin/users?role=&q= — list users (optional role filter + name/email search).
router.get(
  '/users',
  adminLimiter,
  [
    query('role').optional().isIn(['student', 'supervisor', 'admin']),
    query('q').optional().trim().isLength({ max: 80 }),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const q = {};
    if (req.query.role) q.role = req.query.role;
    // Search by name OR email. Escape regex metacharacters so the term is matched
    // literally (no ReDoS, no injection) — case-insensitive substring match.
    if (req.query.q) {
      const safe = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      q.$or = [{ name: rx }, { email: rx }];
    }
    // Sort by matric number ascending (the admin's primary way to scan/assign
    // students). Group by role first so a mixed list stays tidy; students then
    // order by matricNumber ascending, and non-students (no matric) fall back to
    // name. Filtering to role=student therefore yields a pure matric-ascending list.
    const users = await User.find(q).populate('supervisor', 'name').sort('role matricNumber name');
    res.json({ users });
  })
);

// PATCH /api/admin/users/:id — activate/deactivate, reassign supervisor, edit department.
router.patch(
  '/users/:id',
  [
    param('id').isMongoId(),
    body('active').optional().isBoolean(),
    body('department').optional().trim().isLength({ max: 120 }),
    body('supervisorId').optional().isMongoId(),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (typeof req.body.active === 'boolean') {
      // Integrity: an admin can't lock themselves out of their own account.
      if (user._id.equals(req.user._id)) {
        return res.status(400).json({ error: 'You cannot change your own account status' });
      }
      user.active = req.body.active;
    }

    if (req.body.department !== undefined) user.department = req.body.department;

    if (req.body.supervisorId) {
      if (user.role !== 'student') {
        return res.status(400).json({ error: 'Only students can be assigned a supervisor' });
      }
      const sup = await User.findOne({ _id: req.body.supervisorId, role: 'supervisor', active: true });
      if (!sup) return res.status(400).json({ error: 'Invalid supervisor selected' });
      // Remember the previous supervisor so we only notify on a real change.
      const prevSup = user.supervisor ? user.supervisor.toString() : null;
      user.supervisor = sup._id;
      // Keep the student's project in sync so the new supervisor can see it.
      const proj = await Project.findOne({ student: user._id });
      if (proj) {
        proj.supervisor = sup._id;
        proj.timeline.push({ event: `Supervisor reassigned to ${sup.name}`, by: req.user._id });
        await proj.save();
      }
      // V2: notify the supervisor a student was assigned to them (only on change).
      if (prevSup !== sup._id.toString()) {
        await notify(sup._id, `${user.name} has been assigned to you.`, '/supervisor', 'assignment');
      }
    }

    await user.save();
    const populated = await user.populate('supervisor', 'name');
    res.json({ user: populated });
  })
);

// POST /api/admin/users/bulk-assign — assign many students to one supervisor at once.
// Mirrors the single-assign branch of PATCH /users/:id, batched: verify the supervisor,
// touch only real students, keep each project in sync, and notify the supervisor once.
router.post(
  '/users/bulk-assign',
  adminLimiter,
  [
    body('supervisorId').isMongoId(),
    body('studentIds').isArray({ min: 1, max: 200 }),
    body('studentIds.*').isMongoId(),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { supervisorId, studentIds } = req.body;

    const sup = await User.findOne({ _id: supervisorId, role: 'supervisor', active: true });
    if (!sup) return res.status(400).json({ error: 'Invalid supervisor selected' });

    // Integrity: only real students are ever touched; the role is enforced server-side,
    // never trusted from the client. Unknown / non-student ids are silently ignored.
    const students = await User.find({ _id: { $in: studentIds }, role: 'student' });
    if (students.length === 0) return res.status(400).json({ error: 'No valid students selected' });

    let assigned = 0;
    for (const student of students) {
      const prevSup = student.supervisor ? student.supervisor.toString() : null;
      if (prevSup === sup._id.toString()) continue; // already on this supervisor — skip, no re-notify
      student.supervisor = sup._id;
      await student.save();
      // Keep the student's project in sync so the new supervisor can see it.
      const proj = await Project.findOne({ student: student._id });
      if (proj) {
        proj.supervisor = sup._id;
        proj.timeline.push({ event: `Supervisor reassigned to ${sup.name}`, by: req.user._id });
        await proj.save();
      }
      assigned++;
    }

    // One summary notification (not one per student) keeps the bell quiet.
    if (assigned > 0) {
      await notify(
        sup._id,
        `${assigned} student${assigned === 1 ? '' : 's'} ${assigned === 1 ? 'has' : 'have'} been assigned to you.`,
        '/supervisor',
        'assignment'
      );
    }

    res.json({
      assigned,
      skipped: students.length - assigned,
      requested: studentIds.length,
      supervisor: { _id: sup._id, name: sup.name },
    });
  })
);

// GET /api/admin/reports — approval statistics + per-supervisor workload.
router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const [users, projects] = await Promise.all([
      User.find().select('role active'),
      Project.find().select('stage topic.status final.status supervisor').populate('supervisor', 'name'),
    ]);

    const usersByRole = { student: 0, supervisor: 0, admin: 0 };
    users.forEach((u) => {
      usersByRole[u.role] = (usersByRole[u.role] || 0) + 1;
    });

    const byStage = { topic: 0, chapters: 0, final: 0, completed: 0 };
    const byTopicStatus = { pending: 0, approved: 0, rejected: 0, revision: 0 };
    projects.forEach((p) => {
      byStage[p.stage] = (byStage[p.stage] || 0) + 1;
      byTopicStatus[p.topic.status] = (byTopicStatus[p.topic.status] || 0) + 1;
    });

    const loadMap = new Map();
    projects.forEach((p) => {
      if (!p.supervisor) return;
      const key = p.supervisor._id.toString();
      const entry = loadMap.get(key) || { name: p.supervisor.name, total: 0, completed: 0 };
      entry.total += 1;
      if (p.stage === 'completed') entry.completed += 1;
      loadMap.set(key, entry);
    });

    res.json({
      users: usersByRole,
      activeUsers: users.filter((u) => u.active).length,
      projects: { total: projects.length, byStage, byTopicStatus },
      supervisorLoad: Array.from(loadMap.values()).sort((a, b) => b.total - a.total),
    });
  })
);

// GET /api/admin/system — system monitoring: counts + S-BERT service health.
router.get(
  '/system',
  asyncHandler(async (req, res) => {
    const [students, supervisors, projects] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'supervisor' }),
      Project.countDocuments(),
    ]);
    const sbertHealth = await sbert.health();
    res.json({ counts: { students, supervisors, projects }, sbert: sbertHealth, thresholds: sbert.thresholds });
  })
);

module.exports = router;

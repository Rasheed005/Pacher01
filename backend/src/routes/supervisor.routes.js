'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const Project = require('../models/Project');
const { notify } = require('../services/notify');
const { asyncHandler } = require('../middleware/error');
const { handleValidation } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Confidentiality: every route requires an authenticated supervisor.
router.use(requireAuth, requireRole('supervisor'));

// Populate author names so the client can show "who said what" without extra calls.
const REVIEW_POPULATE = [
  { path: 'student', select: 'name matricNumber email department' },
  { path: 'topic.reviews.by', select: 'name' },
  { path: 'chapters.reviews.by', select: 'name' },
  { path: 'final.reviews.by', select: 'name' },
  { path: 'timeline.by', select: 'name' },
];

// ---- Ownership guard (the heart of the CIA "confidentiality" requirement) ----
// Loads the project by id and confirms THIS supervisor is the assigned one.
// Any other supervisor (or unassigned) gets 403 and never sees the data.
async function loadOwnedProject(req, res) {
  const project = await Project.findById(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  if (!project.supervisor || !project.supervisor.equals(req.user._id)) {
    res.status(403).json({ error: 'You are not assigned to supervise this project' });
    return null;
  }
  return project;
}

function reviewValidators(decisions) {
  return [
    body('decision').isIn(decisions).withMessage(`Decision must be one of: ${decisions.join(', ')}`),
    body('comment')
      .trim()
      .notEmpty()
      .withMessage('A comment is required for every review')
      .isLength({ max: 4000 })
      .withMessage('Comment is too long (max 4000 characters)'),
  ];
}

// Whether a project currently needs the supervisor's attention.
function needsReview(p) {
  if (p.topic.status === 'pending') return true;
  if (p.topic.status !== 'approved') return false;
  if (p.chapters.some((c) => c.status === 'submitted')) return true;
  const allChaptersApproved = p.chapters.every((c) => c.status === 'approved');
  return allChaptersApproved && p.final.status !== 'approved';
}

// GET /api/supervisor/students — projects of THIS supervisor's students only.
router.get(
  '/students',
  asyncHandler(async (req, res) => {
    // Confidentiality: hard filter by supervisor == req.user._id.
    const projects = await Project.find({ supervisor: req.user._id })
      .populate('student', 'name matricNumber email department')
      .sort('-updatedAt');

    const students = projects.map((p) => ({
      projectId: p._id,
      student: p.student,
      title: p.title,
      stage: p.stage,
      topicStatus: p.topic.status,
      finalStatus: p.final.status,
      similarity: { topScore: p.similarity?.topScore ?? null, warningLevel: p.similarity?.warningLevel || null },
      chaptersApproved: p.chapters.filter((c) => c.status === 'approved').length,
      chaptersSubmitted: p.chapters.filter((c) => c.status === 'submitted').length,
      needsReview: needsReview(p),
      updatedAt: p.updatedAt,
    }));

    res.json({ students });
  })
);

// GET /api/supervisor/activity — recent timeline events across THIS supervisor's
// students, flattened and prefixed with the student's name. Confidentiality: the
// query is hard-scoped to req.user._id so no other supervisor's data is visible.
router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const projects = await Project.find({ supervisor: req.user._id })
      .select('student timeline')
      .populate('student', 'name matricNumber')
      .populate('timeline.by', 'name')
      .sort('-updatedAt');

    const activity = [];
    projects.forEach((p) => {
      const who = p.student?.name || 'A student';
      (p.timeline || []).forEach((t) => {
        activity.push({ event: `${who}: ${t.event}`, at: t.at, byName: t.by?.name || '' });
      });
    });
    activity.sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json({ activity: activity.slice(0, 30) });
  })
);

// GET /api/supervisor/projects/:id — full project detail (ownership-checked).
router.get(
  '/projects/:id',
  param('id').isMongoId(),
  handleValidation,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res);
    if (!project) return;
    await project.populate(REVIEW_POPULATE);
    res.json({ project });
  })
);

// POST /api/supervisor/projects/:id/topic — review the topic.
router.post(
  '/projects/:id/topic',
  param('id').isMongoId(),
  reviewValidators(['approved', 'rejected', 'revision', 'note']),
  handleValidation,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res);
    if (!project) return;

    const { decision, comment } = req.body;
    project.topic.reviews.push({ by: req.user._id, comment, decision });

    if (decision === 'approved') {
      project.topic.status = 'approved';
      project.topic.decidedAt = new Date();
    } else if (decision === 'rejected') {
      project.topic.status = 'rejected';
      project.topic.decidedAt = new Date();
    } else if (decision === 'revision') {
      project.topic.status = 'revision';
      project.topic.decidedAt = new Date();
    }
    // 'note' leaves the status unchanged.

    project.timeline.push({ event: `Topic ${decision}`, by: req.user._id, note: comment });
    await project.save();

    await notify(
      project.student,
      `Your topic was ${decision === 'note' ? 'commented on' : decision} by your supervisor.`,
      '/student',
      'topic'
    );

    await project.populate(REVIEW_POPULATE);
    res.json({ project });
  })
);

// POST /api/supervisor/projects/:id/chapters/:number — review a chapter.
router.post(
  '/projects/:id/chapters/:number',
  param('id').isMongoId(),
  param('number').isInt({ min: 1, max: 5 }).toInt(),
  reviewValidators(['approved', 'revision', 'note']),
  handleValidation,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res);
    if (!project) return;

    if (project.topic.status !== 'approved') {
      return res.status(409).json({ error: 'The topic must be approved before reviewing chapters' });
    }

    const chapter = project.chapters.find((c) => c.number === req.params.number);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    if (chapter.status === 'not_submitted') {
      return res.status(409).json({ error: 'This chapter has not been submitted yet' });
    }

    const { decision, comment } = req.body;
    chapter.reviews.push({ by: req.user._id, comment, decision });
    chapter.reviewedAt = new Date();
    if (decision === 'approved') chapter.status = 'approved';
    else if (decision === 'revision') chapter.status = 'revision';
    else chapter.status = 'reviewed'; // 'note'

    project.timeline.push({
      event: `Chapter ${chapter.number} (${chapter.name}) ${decision}`,
      by: req.user._id,
      note: comment,
    });
    await project.save();

    await notify(
      project.student,
      `Chapter ${chapter.number} (${chapter.name}) was ${decision === 'note' ? 'commented on' : decision}.`,
      '/student/chapters',
      'chapter'
    );

    await project.populate(REVIEW_POPULATE);
    res.json({ project });
  })
);

// POST /api/supervisor/projects/:id/final — final project review / approval.
router.post(
  '/projects/:id/final',
  param('id').isMongoId(),
  reviewValidators(['approved', 'revision', 'note']),
  handleValidation,
  asyncHandler(async (req, res) => {
    const project = await loadOwnedProject(req, res);
    if (!project) return;

    const allApproved = project.chapters.length && project.chapters.every((c) => c.status === 'approved');
    const { decision, comment } = req.body;

    if (decision === 'approved' && !allApproved) {
      return res.status(409).json({ error: 'All chapters must be approved before final approval' });
    }

    project.final.reviews.push({ by: req.user._id, comment, decision });
    if (decision === 'approved') {
      project.final.status = 'approved';
      project.final.decidedAt = new Date();
    }

    project.timeline.push({
      event: decision === 'approved' ? 'Final project approved' : `Final review (${decision})`,
      by: req.user._id,
      note: comment,
    });
    await project.save();

    await notify(
      project.student,
      decision === 'approved'
        ? 'Congratulations — your final project has been approved!'
        : `Your final project received a ${decision}.`,
      '/student',
      'final'
    );

    await project.populate(REVIEW_POPULATE);
    res.json({ project });
  })
);

module.exports = router;

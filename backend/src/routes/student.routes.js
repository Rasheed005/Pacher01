'use strict';

const express = require('express');
const { body, param } = require('express-validator');

const User = require('../models/User');
const Project = require('../models/Project');
const similarity = require('../services/similarity');
const checkToken = require('../services/checkToken');
const { notify } = require('../services/notify');
const { asyncHandler } = require('../middleware/error');
const { handleValidation } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Confidentiality: every route here requires an authenticated student.
router.use(requireAuth, requireRole('student'));

// Populate supervisor + review/timeline author names for the student's own view.
const PROJECT_POPULATE = [
  { path: 'supervisor', select: 'name email department' },
  { path: 'topic.reviews.by', select: 'name' },
  { path: 'chapters.reviews.by', select: 'name' },
  { path: 'final.reviews.by', select: 'name' },
  { path: 'timeline.by', select: 'name' },
];

const topicValidators = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 300 }),
  body('abstract').trim().isLength({ min: 20, max: 5000 }).withMessage('Abstract must be 20–5000 characters'),
];

// GET /api/student/supervisors — minimal list for the supervisor picker.
router.get(
  '/supervisors',
  asyncHandler(async (req, res) => {
    const supervisors = await User.find({ role: 'supervisor', active: true })
      .select('name department')
      .sort('name');
    res.json({ supervisors });
  })
);

// GET /api/student/project — the current student's project (or null).
router.get(
  '/project',
  asyncHandler(async (req, res) => {
    const project = await Project.findOne({ student: req.user._id }).populate(PROJECT_POPULATE);
    res.json({ project });
  })
);

// POST /api/student/project/similarity-check — run S-BERT without saving.
// Lets the student see the warning band *before* committing to a submission.
router.post(
  '/project/similarity-check',
  topicValidators,
  handleValidation,
  asyncHandler(async (req, res) => {
    const sim = await similarity.evaluate({
      excludeStudentId: req.user._id,
      title: req.body.title,
      abstract: req.body.abstract,
    });
    // Hand back a content-bound token proving this exact text was checked. When
    // S-BERT is unavailable there is nothing to prove, so no token is issued.
    const token = sim.status === 'unavailable' ? null : checkToken.sign(req.body.title, req.body.abstract);
    res.json({ similarity: sim, checkToken: token });
  })
);

// POST /api/student/project — submit or resubmit the topic.
router.post(
  '/project',
  [
    ...topicValidators,
    body('supervisorId').isMongoId().withMessage('Please choose a supervisor'),
    body('checkToken').optional().isString().isLength({ max: 128 }),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const { title, abstract, supervisorId } = req.body;

    // Integrity: the chosen supervisor must actually be an active supervisor.
    const supervisor = await User.findOne({ _id: supervisorId, role: 'supervisor', active: true });
    if (!supervisor) return res.status(400).json({ error: 'Invalid supervisor selected' });

    let project = await Project.findOne({ student: req.user._id });
    const isNew = !project;

    // Once a topic is approved it is locked (can't be silently changed).
    if (project && project.topic.status === 'approved') {
      return res.status(409).json({ error: 'Your topic is already approved and can no longer be edited.' });
    }

    // Score against everyone else's topics and store the result for the report.
    const sim = await similarity.evaluate({ excludeStudentId: req.user._id, title, abstract });

    // Mandatory pre-submission check: unless S-BERT is unavailable, require proof
    // (a valid content-bound token) that the student ran the check for THIS text.
    if (sim.status !== 'unavailable' && !checkToken.verify(title, abstract, req.body.checkToken)) {
      return res.status(400).json({ error: 'Please run the similarity check before submitting your topic.' });
    }

    if (!project) project = new Project({ student: req.user._id });
    project.title = title;
    project.abstract = abstract;
    project.supervisor = supervisor._id;
    project.similarity = similarity.toStored(sim);
    project.topic.status = 'pending';
    project.topic.decidedAt = undefined;
    project.timeline.push({ event: isNew ? 'Topic submitted' : 'Topic resubmitted', by: req.user._id });

    await project.save();

    // Keep the student's assigned supervisor in sync for admin/user views.
    const supChanged = !req.user.supervisor || req.user.supervisor.toString() !== supervisor._id.toString();
    if (supChanged) {
      req.user.supervisor = supervisor._id;
      await req.user.save();
    }

    // V2: notify the supervisor when a student newly selects them.
    if (supChanged) {
      await notify(
        supervisor._id,
        `${req.user.name} has selected you as their supervisor.`,
        '/supervisor',
        'assignment'
      );
    }

    const populated = await project.populate(PROJECT_POPULATE);
    res.status(isNew ? 201 : 200).json({ project: populated, similarity: sim });
  })
);

// PUT /api/student/project/chapters/:number — submit or update a chapter link.
// Chapters unlock only after the topic is approved; an already-approved chapter
// is locked. Ownership is implicit (the student's own project).
router.put(
  '/project/chapters/:number',
  [
    param('number').isInt({ min: 1, max: 5 }).toInt(),
    body('link')
      .trim()
      .isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Please provide a valid http(s) link')
      .isLength({ max: 2000 })
      .withMessage('Link is too long'),
  ],
  handleValidation,
  asyncHandler(async (req, res) => {
    const project = await Project.findOne({ student: req.user._id });
    if (!project) return res.status(404).json({ error: 'Submit and get your topic approved first' });
    if (project.topic.status !== 'approved') {
      return res.status(403).json({ error: 'Your topic must be approved before submitting chapters' });
    }

    const chapter = project.chapters.find((c) => c.number === req.params.number);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    if (chapter.status === 'approved') {
      return res.status(409).json({ error: 'This chapter is already approved and can no longer be changed' });
    }

    const wasSubmitted = chapter.status !== 'not_submitted';
    // S1: keep an append-only history of submitted links for supervisor review.
    chapter.linkHistory.push({ link: req.body.link, at: new Date() });
    chapter.link = req.body.link;
    chapter.status = 'submitted';
    chapter.submittedAt = new Date();

    project.timeline.push({
      event: `Chapter ${chapter.number} (${chapter.name}) ${wasSubmitted ? 'resubmitted' : 'submitted'}`,
      by: req.user._id,
    });
    await project.save();

    await notify(
      project.supervisor,
      `${req.user.name} submitted Chapter ${chapter.number} (${chapter.name}) for review.`,
      `/supervisor/project/${project._id}`,
      'chapter'
    );

    const populated = await project.populate(PROJECT_POPULATE);
    res.json({ project: populated });
  })
);

module.exports = router;

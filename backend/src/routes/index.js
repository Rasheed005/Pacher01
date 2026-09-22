'use strict';

// Aggregates all /api routers. New milestones add one line here.
const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/student', require('./student.routes'));
router.use('/supervisor', require('./supervisor.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/announcements', require('./announcements.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;

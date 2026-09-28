'use strict';

const Project = require('../models/Project');
const sbert = require('./sbert.service');

// Gather all *other* projects' titles+abstracts and score the given text against
// them via the S-BERT service. Returns a normalized similarity result that can
// be shown to the student (warning band) and stored on the project.
async function evaluate({ excludeStudentId, title, abstract }) {
  const text = `${title}. ${abstract}`.trim();

  const filter = excludeStudentId ? { student: { $ne: excludeStudentId } } : {};
  const others = await Project.find(filter).select('title abstract').lean();

  const candidates = others.map((p) => ({
    id: p._id.toString(),
    title: p.title,
    text: `${p.title}. ${p.abstract || ''}`,
  }));

  const result = await sbert.checkSimilarity(text, candidates);
  const warning = sbert.warningFor(result.status === 'unavailable' ? null : result.topScore);

  return {
    status: result.status,
    topScore: result.status === 'unavailable' ? null : result.topScore,
    warningLevel: warning.level,
    message: warning.message,
    matches: result.matches, // [{ id, title, score }]
    checkedAt: new Date(),
    thresholds: sbert.thresholds,
  };
}

// Shape a similarity result for storage on project.similarity.
function toStored(sim) {
  return {
    topScore: sim.topScore,
    warningLevel: sim.warningLevel,
    status: sim.status,
    matches: (sim.matches || []).map((m) => ({ projectId: m.id, title: m.title, score: m.score })),
    checkedAt: sim.checkedAt,
  };
}

module.exports = { evaluate, toStored };

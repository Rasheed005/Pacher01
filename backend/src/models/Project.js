'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const CHAPTER_NAMES = [
  'Introduction',
  'Literature Review',
  'Methodology',
  'Results & Analysis',
  'Conclusion',
];

// A single supervisor review/comment. Kept in a list per reviewable item so the
// full history across revision rounds is preserved (Integrity: append-only).
const reviewSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String, required: true, trim: true, maxlength: 4000 },
    decision: { type: String, enum: ['approved', 'rejected', 'revision', 'note'], required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

// A closest-match entry from the similarity check (shown in the report).
const matchSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    title: String,
    score: Number,
  },
  { _id: false }
);

const chapterSchema = new Schema(
  {
    number: { type: Number, min: 1, max: 5, required: true },
    name: { type: String, required: true },
    link: { type: String, trim: true, default: '', maxlength: 2000 },
    // Append-only record of every link the student has submitted for this chapter,
    // so the supervisor can review earlier drafts. Newest is also mirrored in `link`.
    linkHistory: [
      {
        _id: false,
        link: { type: String, trim: true, maxlength: 2000 },
        at: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ['not_submitted', 'submitted', 'reviewed', 'approved', 'revision'],
      default: 'not_submitted',
    },
    submittedAt: Date,
    reviewedAt: Date,
    reviews: [reviewSchema],
  },
  { _id: true }
);

const timelineSchema = new Schema(
  {
    event: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
    note: String,
  },
  { _id: false }
);

function defaultChapters() {
  return CHAPTER_NAMES.map((name, i) => ({ number: i + 1, name, status: 'not_submitted', reviews: [] }));
}

const projectSchema = new Schema(
  {
    // One project per student (the central tracked entity).
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    supervisor: { type: Schema.Types.ObjectId, ref: 'User', index: true },

    title: { type: String, required: true, trim: true, maxlength: 300 },
    abstract: { type: String, required: true, trim: true, maxlength: 5000 },

    similarity: {
      topScore: { type: Number, default: null },
      warningLevel: String, // low | moderate | high | unavailable
      status: String, // ok | unavailable
      matches: [matchSchema],
      checkedAt: Date,
    },

    topic: {
      status: { type: String, enum: ['pending', 'approved', 'rejected', 'revision'], default: 'pending' },
      decidedAt: Date,
      reviews: [reviewSchema],
    },

    chapters: { type: [chapterSchema], default: defaultChapters },

    final: {
      status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
      decidedAt: Date,
      reviews: [reviewSchema],
    },

    // Derived on save from the statuses above.
    stage: { type: String, enum: ['topic', 'chapters', 'final', 'completed'], default: 'topic' },

    // Append-only progress/audit trail.
    timeline: [timelineSchema],
  },
  { timestamps: true }
);

// Keep `stage` consistent with the underlying statuses.
projectSchema.pre('save', function computeStage(next) {
  if (this.topic.status !== 'approved') {
    this.stage = 'topic';
  } else if (this.final.status === 'approved') {
    this.stage = 'completed';
  } else if (this.chapters.length && this.chapters.every((c) => c.status === 'approved')) {
    this.stage = 'final';
  } else {
    this.stage = 'chapters';
  }
  next();
});

projectSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Project = mongoose.model('Project', projectSchema);
Project.CHAPTER_NAMES = CHAPTER_NAMES;

module.exports = Project;

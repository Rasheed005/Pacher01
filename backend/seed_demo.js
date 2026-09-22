'use strict';

// TEMP demo seeder for local visual preview only (Atlas is unreachable in-sandbox).
// Drops and repopulates pacher_demo with all three roles + rich data.
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Project = require('./src/models/Project');
const Announcement = require('./src/models/Announcement');

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pacher_demo';

async function main() {
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();

  const pw = await User.hashPassword('Passw0rd!23');

  const admin = await User.create({
    name: 'Dr. Admin', email: 'admin@demo.test', passwordHash: pw,
    role: 'admin', emailVerified: true,
  });

  const ada = await User.create({
    name: 'Dr. Ada Bello', email: 'ada@demo.test', passwordHash: pw,
    role: 'supervisor', department: 'Computer Science', emailVerified: true,
  });
  const ben = await User.create({
    name: 'Dr. Ben Coker', email: 'ben@demo.test', passwordHash: pw,
    role: 'supervisor', department: 'Software Engineering', emailVerified: true,
  });

  const zoe = await User.create({
    name: 'Zoe Adeyemi', email: 'zoe@demo.test', passwordHash: pw,
    role: 'student', matricNumber: 'CSC/2021/001', supervisor: ada._id,
    emailVerified: true,
  });
  const tom = await User.create({
    name: 'Tom Okafor', email: 'tom@demo.test', passwordHash: pw,
    role: 'student', matricNumber: 'CSC/2021/002', supervisor: ben._id,
    emailVerified: true,
  });

  // Zoe: approved topic, chapters underway, timeline + low similarity.
  const zoeProj = new Project({
    student: zoe._id, supervisor: ada._id,
    title: 'A Semantic Similarity Approach to Detecting Duplicate Final-Year Project Topics',
    abstract:
      'This project investigates the use of sentence-transformer embeddings (S-BERT) to '
      + 'measure semantic overlap between proposed undergraduate project topics and a corpus '
      + 'of previously approved topics, flagging potential duplicates before approval.',
    similarity: {
      topScore: 0.18, warningLevel: 'low', status: 'ok',
      checkedAt: new Date(Date.now() - 86400000 * 6),
      matches: [
        { title: 'Plagiarism Detection in Student Reports Using TF-IDF', score: 0.18 },
        { title: 'Clustering Research Abstracts with Word2Vec', score: 0.14 },
      ],
    },
    topic: {
      status: 'approved', decidedAt: new Date(Date.now() - 86400000 * 5),
      reviews: [{ by: ada._id, comment: 'Strong, well-scoped topic. Approved.', decision: 'approved', at: new Date(Date.now() - 86400000 * 5) }],
    },
  });
  // Chapter 1 submitted + reviewed, chapter 2 submitted.
  zoeProj.chapters[0].status = 'approved';
  zoeProj.chapters[0].link = 'https://docs.example.com/zoe/ch1';
  zoeProj.chapters[0].submittedAt = new Date(Date.now() - 86400000 * 4);
  zoeProj.chapters[0].reviewedAt = new Date(Date.now() - 86400000 * 3);
  zoeProj.chapters[0].reviews = [{ by: ada._id, comment: 'Clear introduction. Approved.', decision: 'approved', at: new Date(Date.now() - 86400000 * 3) }];
  zoeProj.chapters[1].status = 'submitted';
  zoeProj.chapters[1].link = 'https://docs.example.com/zoe/ch2';
  zoeProj.chapters[1].submittedAt = new Date(Date.now() - 86400000 * 1);
  zoeProj.timeline = [
    { event: 'Topic submitted', by: zoe._id, at: new Date(Date.now() - 86400000 * 6) },
    { event: 'Similarity check passed (low)', by: zoe._id, at: new Date(Date.now() - 86400000 * 6), note: 'Top score 18%' },
    { event: 'Topic approved', by: ada._id, at: new Date(Date.now() - 86400000 * 5), note: 'By Dr. Ada Bello' },
    { event: 'Chapter 1 (Introduction) submitted', by: zoe._id, at: new Date(Date.now() - 86400000 * 4) },
    { event: 'Chapter 1 approved', by: ada._id, at: new Date(Date.now() - 86400000 * 3) },
    { event: 'Chapter 2 (Literature Review) submitted', by: zoe._id, at: new Date(Date.now() - 86400000 * 1) },
  ];
  await zoeProj.save();

  // Tom: pending topic (variety for Ben's dashboard).
  const tomProj = new Project({
    student: tom._id, supervisor: ben._id,
    title: 'An IoT-Based Smart Attendance System Using RFID',
    abstract: 'A low-cost RFID attendance solution with a web dashboard for lecturers.',
    similarity: { topScore: 0.42, warningLevel: 'moderate', status: 'ok', checkedAt: new Date(Date.now() - 86400000 * 2), matches: [{ title: 'RFID Attendance Management System', score: 0.42 }] },
    topic: { status: 'pending' },
    timeline: [
      { event: 'Topic submitted', by: tom._id, at: new Date(Date.now() - 86400000 * 2) },
      { event: 'Similarity check passed (moderate)', by: tom._id, at: new Date(Date.now() - 86400000 * 2), note: 'Top score 42%' },
    ],
  });
  await tomProj.save();

  // Announcements: one global (admin), one per supervisor (scoped).
  await Announcement.create({ author: admin._id, authorName: admin.name, scope: 'global', title: 'Project portal now open', body: 'Submit your topics for the 2025/2026 session. Deadline: end of October.' });
  await Announcement.create({ author: ada._id, authorName: ada.name, scope: 'supervisor', supervisor: ada._id, title: 'Group meeting Friday 2pm', body: 'All my students: bring your chapter drafts to the meeting in Lab 3.' });
  await Announcement.create({ author: ben._id, authorName: ben.name, scope: 'supervisor', supervisor: ben._id, title: 'Proposal template updated', body: 'Please use the new proposal template on the shared drive.' });

  console.log('Seeded pacher_demo. Logins (all password: Passw0rd!23):');
  console.log('  admin@demo.test        (admin)');
  console.log('  ada@demo.test          (supervisor, has Zoe)');
  console.log('  ben@demo.test          (supervisor, has Tom)');
  console.log('  zoe@demo.test          (student, approved topic + timeline)');
  console.log('  tom@demo.test          (student, pending topic)');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

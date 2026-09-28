'use strict';

// Creates the initial super-admin from .env (ADMIN_*). Idempotent: if an admin
// with that email already exists, it is left unchanged. Run with: npm run seed
const mongoose = require('mongoose');
const config = require('../config/env');
const { connectDB } = require('../config/db');
const User = require('../models/User');

async function seed() {
  await connectDB();

  const existing = await User.findOne({ email: config.admin.email });
  if (existing) {
    console.log(`[seed] Admin already exists: ${config.admin.email} (no change)`);
  } else {
    const passwordHash = await User.hashPassword(config.admin.password);
    await User.create({
      name: config.admin.name,
      email: config.admin.email,
      passwordHash,
      role: 'admin',
      emailVerified: true, // seeded admin doesn't self-register — no verification needed
    });
    console.log('[seed] Super-admin created:');
    console.log(`        email:    ${config.admin.email}`);
    console.log(`        password: ${config.admin.password}`);
    console.log('        (change these via .env before first run in production)');
  }

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});

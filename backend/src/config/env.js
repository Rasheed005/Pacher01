'use strict';

// Central place for all configuration. Reads from .env (see .env.example).
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/research_tracker',

  sessionSecret: process.env.SESSION_SECRET || 'change-this-to-a-long-random-secret',

  // Public base URL used to build links inside emails (e.g. the verify link).
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),

  // Outgoing email (Nodemailer/SMTP). When SMTP_HOST is unset we run in "console
  // mode": verification links are logged to the server console instead of sent.
  mail: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for port 465
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Pacher <no-reply@pacher.local>',
  },

  sbert: {
    url: process.env.SBERT_URL || 'http://127.0.0.1:8000',
    timeoutMs: parseInt(process.env.SBERT_TIMEOUT_MS || '4000', 10),
  },

  // Cosine-similarity thresholds used to build the student's warning band.
  similarity: {
    high: parseFloat(process.env.SIM_HIGH || '0.80'),
    moderate: parseFloat(process.env.SIM_MODERATE || '0.60'),
  },

  admin: {
    name: process.env.ADMIN_NAME || 'Super Admin',
    email: (process.env.ADMIN_EMAIL || 'admin@pacher.local').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin@12345',
  },
};

module.exports = config;

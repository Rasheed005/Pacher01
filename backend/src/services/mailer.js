'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');

// Outgoing email for account verification.
//
// Availability: when SMTP is not configured (config.mail.host is blank) we run
// in "console mode" — the verification link is printed to the server console so
// local demos and offline development still work. Either way, a mail failure is
// caught and logged: it must never break the registration request.

let transporter = null;

// Lazily build the SMTP transport once, only when SMTP is actually configured.
function getTransporter() {
  if (!config.mail.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    });
  }
  return transporter;
}

// Send the "verify your email" message. Returns true if handled (sent or logged).
async function sendVerificationEmail(user, link) {
  const subject = 'Verify your Pacher account';
  const text =
    `Hi ${user.name},\n\n` +
    `Welcome to Pacher. Please verify your email address to activate your account:\n\n` +
    `${link}\n\n` +
    `This link expires in 24 hours. If you did not create this account, you can ignore this email.`;

  return deliver(user.email, subject, text, link);
}

// Send a supervisor invitation. `name` may be blank (admin left it out).
async function sendInvitationEmail(email, name, link) {
  const subject = 'You have been invited to Pacher';
  const text =
    `Hi${name ? ' ' + name : ''},\n\n` +
    `You have been invited to join Pacher as a supervisor. ` +
    `Set your password to activate your account:\n\n` +
    `${link}\n\n` +
    `This link expires in 24 hours. If you were not expecting this, you can ignore this email.`;

  return deliver(email, subject, text, link);
}

// Send a password-reset link.
async function sendPasswordResetEmail(user, link) {
  const subject = 'Reset your Pacher password';
  const text =
    `Hi ${user.name},\n\n` +
    `We received a request to reset your Pacher password. ` +
    `Use the link below to choose a new one:\n\n` +
    `${link}\n\n` +
    `This link expires in 24 hours. If you did not request this, you can safely ignore this email — ` +
    `your password will not change.`;

  return deliver(user.email, subject, text, link);
}

// Shared delivery path: send via SMTP when configured, otherwise print to the
// console. Never throws — a mail failure must not break the primary request.
async function deliver(to, subject, text, link) {
  const tx = getTransporter();
  if (!tx) {
    // Console mode — no SMTP configured.
    console.log('\n[mailer] (console mode — SMTP not configured)');
    console.log(`[mailer] To: ${to}`);
    console.log(`[mailer] Subject: ${subject}`);
    console.log(`[mailer] Link: ${link}\n`);
    return true;
  }

  try {
    await tx.sendMail({ from: config.mail.from, to, subject, text });
    return true;
  } catch (err) {
    // Availability: never let a mail failure break the request. Log the link so
    // the action can still be completed manually.
    console.error('[mailer] failed to send email:', err.message);
    console.error(`[mailer] link for ${to}: ${link}`);
    return false;
  }
}

module.exports = { sendVerificationEmail, sendInvitationEmail, sendPasswordResetEmail };

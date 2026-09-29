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
      // Availability: cap a stalled SMTP connection so a black-holed outbound port
      // (common on free PaaS like Render) fails fast instead of hanging the request
      // until the upstream proxy 504s. deliver()'s catch then logs the link and the
      // registration/reset request still completes, honouring the contract above.
      connectionTimeout: 10000, // 10s to establish the TCP/TLS connection
      greetingTimeout: 10000, // 10s to receive the SMTP greeting
      socketTimeout: 15000, // 15s of socket inactivity before giving up
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

// Parse a MAIL_FROM value ("Pacher <no-reply@x.com>" or "no-reply@x.com") into
// Brevo's { name, email } sender shape. The email must be a *verified* sender in
// your Brevo account, or the API rejects the send with 400.
function parseFrom(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from || '');
  if (m) {
    const name = m[1].trim();
    return name ? { name, email: m[2].trim() } : { email: m[2].trim() };
  }
  return { email: (from || '').trim() };
}

// Send one transactional email via the Brevo HTTP API (HTTPS, port 443). Preferred
// over SMTP because free PaaS hosts (e.g. Render) commonly block outbound SMTP
// ports, which would otherwise hang the request. Throws on any non-2xx so the
// caller falls back to logging the link.
async function sendViaBrevo(to, subject, text) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.mail.brevoApiKey,
    },
    body: JSON.stringify({
      sender: parseFrom(config.mail.from),
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
    // Availability: bound the call so a slow/unreachable API can't hang the request.
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${body.slice(0, 200)}`);
  }
}

// Shared delivery path. Order of preference:
//   1. Brevo HTTP API (port 443) — works even where the host blocks outbound SMTP.
//   2. SMTP transport — when SMTP_* is configured.
//   3. Console mode — neither configured; log the link so the flow still works.
// Never throws — a mail failure must not break the primary request.
async function deliver(to, subject, text, link) {
  if (config.mail.brevoApiKey) {
    try {
      await sendViaBrevo(to, subject, text);
      return true;
    } catch (err) {
      // Availability: never let a mail failure break the request. Log the link so
      // the action can still be completed manually.
      console.error('[mailer] Brevo API send failed:', err.message);
      console.error(`[mailer] link for ${to}: ${link}`);
      return false;
    }
  }

  const tx = getTransporter();
  if (!tx) {
    // Console mode — no email provider configured.
    console.log('\n[mailer] (console mode — no email provider configured)');
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

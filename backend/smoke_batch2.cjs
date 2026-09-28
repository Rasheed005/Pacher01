// End-to-end smoke test for the batch-2 features. Node 22 global fetch + a tiny
// cookie jar + double-submit CSRF. Run against a locally-booted server.
const BASE = process.env.BASE || 'http://localhost:3021';
const API = BASE + '/api';
const fs = require('fs');

let cookies = {};
function setCookiesFrom(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    cookies[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
}
function cookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}
async function req(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method) && cookies['XSRF-TOKEN']) {
    headers['X-CSRF-Token'] = decodeURIComponent(cookies['XSRF-TOKEN']);
  }
  if (Object.keys(cookies).length) headers['Cookie'] = cookieHeader();
  const res = await fetch(API + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  setCookiesFrom(res);
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  return { status: res.status, data, location: res.headers.get('location') };
}
function freshJar() { cookies = {}; }

// Pull the newest console-mode mailer link out of the server log.
const LOG = process.env.LOG || '/tmp/pacher_smoke.log';
function latestMailLink(after = 0) {
  const log = fs.readFileSync(LOG, 'utf8');
  const lines = log.split('\n').filter((l) => l.includes('[mailer] Link:'));
  const links = lines.map((l) => l.split('[mailer] Link:')[1].trim());
  return links.slice(after);
}

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

async function bootstrapCsrf() {
  // GET /me issues the XSRF-TOKEN cookie (ensureCsrfToken runs on all routes).
  await req('GET', '/auth/me');
}

// Invite a supervisor (as admin), accept the emailed link, return the new user id.
async function inviteAndAccept(email, name) {
  freshJar(); await bootstrapCsrf();
  await req('POST', '/auth/login', { email: 'admin@smoke.test', password: 'Admin@1234567' });
  await req('POST', '/admin/invitations', { email, name });
  const links = latestMailLink(0);
  const url = [...links].reverse().find((l) => l.includes('/accept-invite?token='));
  const token = new URL(url).searchParams.get('token');
  freshJar(); await bootstrapCsrf();
  await req('POST', '/auth/accept-invite', { token, password: 'Passw0rd!23', name });
  freshJar(); await bootstrapCsrf();
  const r = await req('POST', '/auth/login', { email, password: 'Passw0rd!23' });
  return r.data.user?._id;
}

(async () => {
  console.log('\n=== Pacher batch-2 smoke test ===');

  // ---- Regression: unauth /me → 401 ----
  freshJar();
  await bootstrapCsrf();
  let r = await req('GET', '/auth/me');
  ok(r.status === 401, 'GET /auth/me unauthenticated → 401', r.status);

  // ---- Admin login ----
  freshJar();
  await bootstrapCsrf();
  r = await req('POST', '/auth/login', { email: 'admin@smoke.test', password: 'Admin@1234567' });
  ok(r.status === 200 && r.data.user?.role === 'admin', 'admin login', r.data);

  // ---- Regression: old POST /admin/supervisors removed → 404 ----
  r = await req('POST', '/admin/supervisors', { name: 'X', email: 'x@x.test', password: 'password123' });
  ok(r.status === 404, 'POST /admin/supervisors removed → 404', r.status);

  // ---- A2: invite a supervisor ----
  const supEmail = 'super1@smoke.test';
  r = await req('POST', '/admin/invitations', { email: supEmail, name: 'Dr Super', department: 'CS' });
  ok(r.status === 201 && r.data.invitation?.status === 'pending', 'invite supervisor → 201 pending', r.data);
  ok(r.data.invitation && r.data.invitation.token === undefined && r.data.invitation.passwordHash === undefined,
     'invitation response hides token + passwordHash', r.data.invitation);

  // duplicate invite → 409
  r = await req('POST', '/admin/invitations', { email: supEmail });
  ok(r.status === 409, 'duplicate pending invite → 409', r.status);

  // list invitations
  r = await req('GET', '/admin/invitations');
  ok(r.status === 200 && r.data.invitations?.length >= 1, 'GET /admin/invitations lists pending', r.data.invitations?.length);
  const invId = r.data.invitations[0]._id;

  // supervisor absent from users until accept
  r = await req('GET', '/admin/users?role=supervisor');
  const supInUsersBefore = (r.data.users || []).some((u) => u.email === supEmail);
  ok(!supInUsersBefore, 'invited supervisor NOT in users before accept');

  // resend works
  r = await req('POST', `/admin/invitations/${invId}/resend`);
  ok(r.status === 200, 'resend invitation → 200', r.status);

  // grab the accept link (newest mailer link)
  let links = latestMailLink(0);
  const acceptUrl = [...links].reverse().find((l) => l.includes('/accept-invite?token='));
  ok(!!acceptUrl, 'accept-invite link logged', acceptUrl);
  const acceptToken = acceptUrl && new URL(acceptUrl).searchParams.get('token');

  // ---- accept invite (public) ----
  freshJar();
  await bootstrapCsrf();
  r = await req('GET', '/auth/invitation?token=' + encodeURIComponent(acceptToken));
  ok(r.status === 200 && r.data.invitation?.email === supEmail && r.data.invitation?.role === 'supervisor',
     'GET /auth/invitation returns invite', r.data);
  r = await req('POST', '/auth/accept-invite', { token: acceptToken, password: 'Passw0rd!23', name: 'Dr Super' });
  ok(r.status === 200 && r.data.ok, 'accept-invite → 200', r.data);

  // token now single-use / consumed
  r = await req('GET', '/auth/invitation?token=' + encodeURIComponent(acceptToken));
  ok(r.status === 400, 'accept-invite token consumed (single-use)', r.status);

  // supervisor can now log in
  freshJar(); await bootstrapCsrf();
  r = await req('POST', '/auth/login', { email: supEmail, password: 'Passw0rd!23' });
  ok(r.status === 200 && r.data.user?.role === 'supervisor', 'invited supervisor can log in', r.data);
  const supId = r.data.user?._id;

  // ---- A/B: student self-register held in pending (NOT users) ----
  freshJar(); await bootstrapCsrf();
  const stuEmail = 'stud1@smoke.test';
  r = await req('POST', '/auth/register', { name: 'Zoe Stu', email: stuEmail, password: 'Passw0rd!23', department: 'CS', matricNumber: 'MAT/2024/001' });
  ok(r.status === 200 && r.data.needsVerification, 'student register → 200 needsVerification', r.data);

  // login before verify → 403 email_not_verified
  freshJar(); await bootstrapCsrf();
  r = await req('POST', '/auth/login', { email: stuEmail, password: 'Passw0rd!23' });
  ok(r.status === 403 && r.data.error === 'email_not_verified', 'login pre-verify → 403 email_not_verified', r.data);

  // duplicate matric (pending) → 409
  freshJar(); await bootstrapCsrf();
  r = await req('POST', '/auth/register', { name: 'Dup', email: 'dup@smoke.test', password: 'Passw0rd!23', department: 'CS', matricNumber: 'MAT/2024/001' });
  ok(r.status === 409, 'duplicate matric → 409', r.data);

  // verify via link
  links = latestMailLink(0);
  const verifyUrl = [...links].reverse().find((l) => l.includes('/auth/verify?token='));
  ok(!!verifyUrl, 'verify link logged', verifyUrl);
  const verifyToken = verifyUrl && new URL(verifyUrl).searchParams.get('token');
  freshJar(); await bootstrapCsrf();
  r = await req('GET', '/auth/verify?token=' + encodeURIComponent(verifyToken));
  ok(r.status === 302 && /verified=1/.test(r.location || ''), 'verify link → redirect /login?verified=1', { status: r.status, loc: r.location });

  // now login works
  freshJar(); await bootstrapCsrf();
  r = await req('POST', '/auth/login', { email: stuEmail, password: 'Passw0rd!23' });
  ok(r.status === 200 && r.data.user?.role === 'student', 'student can log in after verify', r.data);
  const stuId = r.data.user?._id;

  // ---- S1 + V1 + V2(self-select): topic → approve → chapters/linkHistory ----
  // Student logs in and submits the topic, choosing supA. This is the self-select
  // path in student.routes.js: it sets user.supervisor AND notifies the supervisor.
  freshJar(); await bootstrapCsrf();
  await req('POST', '/auth/login', { email: stuEmail, password: 'Passw0rd!23' });
  const topic = { title: 'A Study of Things', abstract: 'This project studies things in depth over time and space, thoroughly and carefully.' };
  // A content-bound check token is required only when S-BERT is up; unavailable → null.
  const sc = await req('POST', '/student/project/similarity-check', topic);
  r = await req('POST', '/student/project', { ...topic, supervisorId: supId, checkToken: sc.data?.checkToken || undefined });
  ok(r.status === 201 && r.data.project?.supervisor?._id === supId, 'student submits topic selecting supervisor', { s: r.status, sup: r.data.project?.supervisor?._id });

  // supA reviews/approves the topic so chapters unlock.
  freshJar(); await bootstrapCsrf();
  await req('POST', '/auth/login', { email: supEmail, password: 'Passw0rd!23' });
  r = await req('GET', '/supervisor/students');
  ok(r.status === 200 && r.data.students?.length === 1, 'supervisor sees exactly 1 student', r.data.students?.length);
  const projectId = r.data.students?.[0]?.projectId;
  ok(!!r.data.students?.[0]?.student?.matricNumber, 'student payload includes matricNumber (search)', r.data.students?.[0]?.student);
  r = await req('POST', `/supervisor/projects/${projectId}/topic`, { decision: 'approved', comment: 'Looks good, proceed.' });
  ok(r.status === 200 && r.data.project?.topic?.status === 'approved', 'supervisor approves topic', r.data.project?.topic?.status);

  // V2 (self-select): supA has exactly ONE assignment notification.
  r = await req('GET', '/notifications');
  const assignA = (r.data.notifications || []).filter((n) => n.type === 'assignment');
  ok(assignA.length === 1, 'supA has 1 assignment notif (student self-select)', assignA.length);

  // V1: supervisor activity endpoint, scoped to supA, events prefixed with student name.
  r = await req('GET', '/supervisor/activity');
  ok(r.status === 200 && Array.isArray(r.data.activity) && r.data.activity.length > 0, 'GET /supervisor/activity returns events', r.data.activity?.length);
  ok((r.data.activity?.[0]?.event || '').includes('Zoe Stu'), 'activity events prefixed with student name', r.data.activity?.[0]);

  // S1: student submits chapter 1 twice → linkHistory keeps both, current link = latest.
  freshJar(); await bootstrapCsrf();
  await req('POST', '/auth/login', { email: stuEmail, password: 'Passw0rd!23' });
  await req('PUT', '/student/project/chapters/1', { link: 'https://docs.example.com/v1' });
  r = await req('PUT', '/student/project/chapters/1', { link: 'https://docs.example.com/v2' });
  const ch1 = r.data.project?.chapters?.find((c) => c.number === 1);
  ok(ch1?.link === 'https://docs.example.com/v2', 'chapter current link updated to v2', ch1?.link);
  ok(Array.isArray(ch1?.linkHistory) && ch1.linkHistory.length === 2, 'linkHistory grew to 2 entries', ch1?.linkHistory?.length);

  // ---- S3: notifications pagination + single mark-read (as the student) ----
  r = await req('GET', '/notifications?limit=1&skip=0');
  ok(r.status === 200 && typeof r.data.unreadCount === 'number' && typeof r.data.total === 'number', 'notifications return unreadCount + total', { u: r.data.unreadCount, t: r.data.total });
  ok(r.data.notifications.length === 1, 'limit=1 returns a single notification', r.data.notifications.length);
  if (r.data.notifications[0] && !r.data.notifications[0].read) {
    const nid = r.data.notifications[0]._id;
    const before = r.data.unreadCount;
    const r2 = await req('POST', `/notifications/${nid}/read`);
    ok(r2.status === 200 && r2.data.unreadCount === before - 1, 'single mark-read decrements unreadCount', { before, after: r2.data.unreadCount });
  } else {
    ok(true, 'single mark-read (skipped — none unread)');
  }

  // ---- V2 (admin path): invite supB, reassign the student, assert supB notified once ----
  const supBId = await inviteAndAccept('super2@smoke.test', 'Dr Two');
  ok(!!supBId, 'second supervisor onboarded via invite', supBId);
  freshJar(); await bootstrapCsrf();
  await req('POST', '/auth/login', { email: 'admin@smoke.test', password: 'Admin@1234567' });
  r = await req('PATCH', `/admin/users/${stuId}`, { supervisorId: supBId });
  ok(r.status === 200, 'admin reassigns student to supB', r.status);
  // no-op re-save to the same supervisor → must NOT add a second notification.
  r = await req('PATCH', `/admin/users/${stuId}`, { supervisorId: supBId });
  ok(r.status === 200, 'admin re-saves supB (no-op)', r.status);
  freshJar(); await bootstrapCsrf();
  await req('POST', '/auth/login', { email: 'super2@smoke.test', password: 'Passw0rd!23' });
  r = await req('GET', '/notifications');
  const assignB = (r.data.notifications || []).filter((n) => n.type === 'assignment');
  ok(assignB.length === 1, 'supB has exactly 1 assignment notif (admin reassign; no dupe on no-op)', assignB.length);

  // ---- S2: forgot password ----
  // unknown email still 200 (no enumeration)
  freshJar(); await bootstrapCsrf();
  r = await req('POST', '/auth/request-reset', { email: 'nobody@smoke.test' });
  ok(r.status === 200, 'request-reset unknown email → 200 (no enumeration)', r.status);
  // known email → reset link
  r = await req('POST', '/auth/request-reset', { email: stuEmail });
  ok(r.status === 200, 'request-reset known email → 200', r.status);
  links = latestMailLink(0);
  const resetUrl = [...links].reverse().find((l) => l.includes('/reset-password?token='));
  ok(!!resetUrl, 'reset link logged', resetUrl);
  const resetToken = resetUrl && new URL(resetUrl).searchParams.get('token');
  r = await req('POST', '/auth/reset', { token: resetToken, password: 'NewPassw0rd!9' });
  ok(r.status === 200 && r.data.ok, 'reset password → 200', r.data);
  // old password fails, new works
  freshJar(); await bootstrapCsrf();
  r = await req('POST', '/auth/login', { email: stuEmail, password: 'Passw0rd!23' });
  ok(r.status === 401, 'old password rejected after reset', r.status);
  freshJar(); await bootstrapCsrf();
  r = await req('POST', '/auth/login', { email: stuEmail, password: 'NewPassw0rd!9' });
  ok(r.status === 200, 'new password works after reset', r.status);
  // reset token single-use
  freshJar(); await bootstrapCsrf();
  r = await req('POST', '/auth/reset', { token: resetToken, password: 'Another1!x' });
  ok(r.status === 400, 'reset token single-use (second use → 400)', r.status);

  // ---- Confidentiality: no secret fields leak in any user payload ----
  freshJar(); await bootstrapCsrf();
  await req('POST', '/auth/login', { email: stuEmail, password: 'NewPassw0rd!9' });
  r = await req('GET', '/auth/me');
  const u = r.data.user || {};
  ok(u.passwordHash === undefined && u.resetToken === undefined && u.verifyToken === undefined,
     'no passwordHash/resetToken/verifyToken in /me payload', Object.keys(u));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SMOKE ERROR', e); process.exit(2); });

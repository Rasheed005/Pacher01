'use strict';

// Shared UI helpers used across authenticated pages.

const DASHBOARDS = {
  student: '/student/dashboard.html',
  supervisor: '/supervisor/dashboard.html',
  admin: '/admin/dashboard.html',
};

function dashboardPath(role) {
  return DASHBOARDS[role] || '/';
}

// Page guard: ensure the visitor is authenticated and has an allowed role.
// Redirects to login (/) if not logged in, or to their own dashboard if the
// role isn't allowed on this page. Returns the user on success.
async function guardPage(allowedRoles) {
  let user;
  try {
    ({ user } = await auth.me());
  } catch (err) {
    window.location.replace('/');
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    window.location.replace(dashboardPath(user.role));
    return null;
  }
  return user;
}

// Renders the shared top bar into <div id="topbar"> and wires logout.
function renderTopbar(user, subtitle) {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  bar.className = 'topbar';
  bar.innerHTML = '';

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.append('RPATS ', Object.assign(document.createElement('span'), { textContent: subtitle || '' }));

  const box = document.createElement('div');
  box.className = 'user-box';

  const who = document.createElement('div');
  who.className = 'who';
  const nameEl = document.createElement('div');
  nameEl.textContent = user.name;
  const roleEl = document.createElement('div');
  roleEl.className = 'role';
  roleEl.textContent = user.role;
  who.append(nameEl, roleEl);

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn secondary small';
  logoutBtn.textContent = 'Log out';
  logoutBtn.addEventListener('click', async () => {
    try { await auth.logout(); } finally { window.location.replace('/'); }
  });

  box.append(who, logoutBtn);
  bar.append(brand, box);
}

// ---- Small DOM/format utilities ----

// Create an element with props and children (children set via textContent-safe append).
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v; // only ever called with trusted static strings
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return node;
}

function badge(status) {
  return el('span', { class: 'badge ' + status, text: String(status).replace(/_/g, ' ') });
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Show a message in an .alert element (by id). type: 'error' | 'success' | 'info'.
function showAlert(id, message, type = 'error') {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = message;
  node.className = 'alert ' + type;
}
function clearAlert(id) {
  const node = document.getElementById(id);
  if (node) node.className = 'alert hidden';
}

// ---- Similarity display (shared by submit page, dashboard, supervisor view) ----

function pct(score) {
  return score === null || score === undefined ? '—' : Math.round(score * 100) + '%';
}

const SIM_MESSAGES = {
  high: 'This topic is very similar to an existing one and is likely to be rejected. Consider revising it.',
  moderate: 'This topic has moderate similarity to existing work and may be flagged for review.',
  low: 'This topic looks sufficiently distinct from existing submissions.',
  unavailable: 'Similarity check is currently unavailable — submissions are unaffected.',
};

// Build a coloured warning band from a similarity result object:
// { status, topScore, warningLevel, message? }
function simBand(sim) {
  const level = sim.warningLevel || (sim.status === 'unavailable' ? 'unavailable' : 'low');
  const label = level === 'unavailable' ? 'Similarity check unavailable' : `Top similarity: ${pct(sim.topScore)}`;
  return el('div', { class: 'sim-band ' + level }, [
    el('div', { class: 'score', text: label }),
    el('div', { text: sim.message || SIM_MESSAGES[level] || '' }),
  ]);
}

// Build a list of closest matches: [{ title, score }]
function matchesList(matches) {
  if (!matches || !matches.length) {
    return el('p', { class: 'muted', text: 'No other topics to compare against yet.' });
  }
  const wrap = el('div', {}, [el('h3', { text: 'Closest existing topics' })]);
  matches.forEach((m) => {
    wrap.append(
      el('div', { class: 'match-row' }, [
        el('span', { text: m.title }),
        el('strong', { text: pct(m.score) }),
      ])
    );
  });
  return wrap;
}

// Render an append-only comment thread: [{ decision, comment, at, by|byName }].
// `by` may be a populated { name } object or absent. Returns null when empty.
function reviewsList(reviews, heading = 'Supervisor comments') {
  if (!reviews || !reviews.length) return null;
  const wrap = el('div', {}, [el('h3', { text: heading })]);
  reviews
    .slice()
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .forEach((r) => {
      const name = r.byName || (r.by && r.by.name) || '';
      wrap.append(
        el('div', { class: 'review' }, [
          el('div', { class: 'head' }, [
            badge(r.decision),
            el('span', { text: `${name ? name + ' · ' : ''}${fmtDate(r.at)}` }),
          ]),
          el('div', { class: 'body', text: r.comment }),
        ])
      );
    });
  return wrap;
}

// Append-only progress trail: [{ event, at, note, by|byName }]. Newest first.
function timelineList(timeline) {
  if (!timeline || !timeline.length) {
    return el('p', { class: 'muted', text: 'No activity yet.' });
  }
  const ul = el('ul', { class: 'timeline' });
  timeline
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .forEach((t) => {
      const name = t.byName || (t.by && t.by.name) || '';
      ul.append(
        el('li', {}, [
          el('div', { class: 'event', text: t.event }),
          el('div', { class: 'meta', text: `${name ? name + ' · ' : ''}${fmtDate(t.at)}` }),
        ])
      );
    });
  return ul;
}

// A safe external link (opens in a new tab, no referrer/opener leak).
function safeLink(url, label) {
  return el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: label || url });
}

// Horizontal progress tracker for a project's workflow stage.
function stageTracker(stage) {
  const steps = [
    { key: 'topic', label: 'Topic Approval' },
    { key: 'chapters', label: 'Chapters' },
    { key: 'final', label: 'Final Approval' },
  ];
  const order = { topic: 0, chapters: 1, final: 2, completed: 3 };
  const cur = order[stage] ?? 0;
  const wrap = el('div', { class: 'stages' });
  steps.forEach((s, i) => {
    let cls = 'step';
    if (i < cur) cls += ' done';
    else if (i === cur) cls += ' current';
    wrap.append(el('div', { class: cls }, [el('span', { class: 'n', text: `Step ${i + 1}` }), s.label]));
  });
  return wrap;
}

// Fetch and render the current user's notifications into a container element.
// Shows unread items highlighted with a "Mark all read" action.
async function renderNotifications(container) {
  const node = typeof container === 'string' ? document.getElementById(container) : container;
  if (!node) return;
  let data;
  try {
    data = await api.get('/notifications');
  } catch (_) {
    return; // notifications are non-critical; fail silently
  }
  node.innerHTML = '';
  const header = el('div', { class: 'flex-between' }, [
    el('h2', { text: `Notifications${data.unreadCount ? ` (${data.unreadCount} new)` : ''}` }),
  ]);
  if (data.unreadCount) {
    const btn = el('button', { class: 'btn secondary small', text: 'Mark all read' });
    btn.addEventListener('click', async () => {
      try {
        await api.post('/notifications/read', {});
        renderNotifications(node);
      } catch (_) {
        /* ignore */
      }
    });
    header.append(btn);
  }
  node.append(header);

  if (!data.notifications.length) {
    node.append(el('p', { class: 'muted', text: 'No notifications yet.' }));
    return;
  }
  data.notifications.forEach((n) => {
    const row = el('div', { class: 'notif' + (n.read ? '' : ' unread') }, [
      el('div', { class: 'notif-msg', text: n.message }),
      el('div', { class: 'meta', text: fmtDate(n.createdAt) }),
    ]);
    if (n.link) row.addEventListener('click', () => window.location.assign(n.link));
    node.append(row);
  });
}

window.dashboardPath = dashboardPath;
window.guardPage = guardPage;
window.renderTopbar = renderTopbar;
window.el = el;
window.badge = badge;
window.fmtDate = fmtDate;
window.showAlert = showAlert;
window.clearAlert = clearAlert;
window.simBand = simBand;
window.matchesList = matchesList;
window.reviewsList = reviewsList;
window.timelineList = timelineList;
window.safeLink = safeLink;
window.renderNotifications = renderNotifications;
window.stageTracker = stageTracker;
window.pct = pct;

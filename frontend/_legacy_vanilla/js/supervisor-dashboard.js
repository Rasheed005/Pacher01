'use strict';

// Supervisor dashboard: lists ONLY this supervisor's assigned students
// (server enforces supervisor == req.user._id) with a review-needed flag.
(async function initSupervisorDashboard() {
  const user = await guardPage(['supervisor']);
  if (!user) return;
  renderTopbar(user, 'Supervisor');
  document.getElementById('welcome').textContent = `Welcome, ${user.name}`;

  const content = document.getElementById('content');
  content.innerHTML = '';

  // Notifications first — these are the supervisor's action items.
  const notif = el('div', { class: 'card', id: 'notifications' });
  content.append(notif);
  renderNotifications(notif);

  let students = [];
  try {
    ({ students } = await api.get('/supervisor/students'));
  } catch (err) {
    content.append(el('div', { class: 'card' }, [el('p', { class: 'alert error', text: err.message || 'Failed to load students' })]));
    return;
  }

  const card = el('div', { class: 'card' }, [el('h2', { text: `My students (${students.length})` })]);

  if (!students.length) {
    card.append(el('p', { class: 'empty', text: 'No students have selected you as their supervisor yet.' }));
    content.append(card);
    return;
  }

  const table = el('table', { class: 'data' });
  table.append(
    el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'Student' }),
        el('th', { text: 'Project title' }),
        el('th', { text: 'Stage' }),
        el('th', { text: 'Topic' }),
        el('th', { text: 'Similarity' }),
        el('th', { text: 'Chapters' }),
        el('th', { text: '' }),
      ]),
    ])
  );

  const tbody = el('tbody');
  students
    .slice()
    .sort((a, b) => Number(b.needsReview) - Number(a.needsReview))
    .forEach((s) => {
      const who = el('td', {}, [
        el('div', { text: s.student ? s.student.name : '—' }),
        el('div', { class: 'muted', text: s.student && s.student.matricNumber ? s.student.matricNumber : '' }),
      ]);

      const sim = s.similarity || {};
      const simText = sim.topScore === null || sim.topScore === undefined ? '—' : pct(sim.topScore);
      const simCell = el('td', {}, [el('span', { class: 'sim-pill ' + (sim.warningLevel || 'low'), text: simText })]);

      const action = el('td', {}, [
        el('a', { class: 'btn small', href: `/supervisor/project.html?id=${s.projectId}`, text: 'Open' }),
      ]);

      const row = el('tr', {}, [
        who,
        el('td', { text: s.title || '—' }),
        el('td', {}, [badge(s.stage)]),
        el('td', {}, [badge(s.topicStatus), s.needsReview ? el('span', { class: 'needs-review', text: ' • action needed' }) : null]),
        simCell,
        el('td', { text: `${s.chaptersApproved}/5 approved${s.chaptersSubmitted ? ` · ${s.chaptersSubmitted} to review` : ''}` }),
        action,
      ]);
      tbody.append(row);
    });

  table.append(tbody);
  card.append(table);
  content.append(card);
})();

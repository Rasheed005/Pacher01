'use strict';

// Student dashboard: topic status + similarity report, chapter progress,
// final-approval status, notifications, and the activity timeline.
(async function initStudentDashboard() {
  const user = await guardPage(['student']);
  if (!user) return;
  renderTopbar(user, 'Student');
  document.getElementById('welcome').textContent = `Welcome, ${user.name}`;

  const content = document.getElementById('content');
  content.innerHTML = '';

  // Notifications.
  const notif = el('div', { class: 'card', id: 'notifications' });
  content.append(notif);
  renderNotifications(notif);

  let project = null;
  try {
    ({ project } = await api.get('/student/project'));
  } catch (_) {
    project = null;
  }

  // No project yet → call to action.
  if (!project) {
    content.append(
      el('div', { class: 'card' }, [
        el('h2', { text: 'Submit your project topic' }),
        el('p', {
          class: 'muted',
          text: 'Start by submitting your project title and abstract. You can run a similarity check first to see how close your idea is to existing topics.',
        }),
        el('a', { class: 'btn', href: '/student/submit-topic.html', text: 'Submit topic' }),
      ])
    );
    return;
  }

  // Progress tracker.
  content.append(stageTracker(project.stage));

  // ---- Topic card ----
  const status = project.topic.status;
  const canEdit = ['pending', 'revision', 'rejected'].includes(status);
  const supName = project.supervisor ? project.supervisor.name : 'Unassigned';

  const topicCard = el('div', { class: 'card' }, [
    el('div', { class: 'flex-between' }, [el('h2', { text: 'Project topic' }), badge(status)]),
    el('h3', { text: project.title }),
    el('p', { class: 'muted', text: project.abstract }),
    el('p', { class: 'muted', text: `Supervisor: ${supName}` }),
  ]);

  if (project.similarity) {
    topicCard.append(
      simBand({
        warningLevel: project.similarity.warningLevel,
        topScore: project.similarity.topScore,
        status: project.similarity.status,
      }),
      matchesList(project.similarity.matches)
    );
  }

  const topicReviews = reviewsList(project.topic.reviews);
  if (topicReviews) topicCard.append(topicReviews);

  if (canEdit) {
    topicCard.append(
      el('div', { class: 'spacer' }),
      el('a', {
        class: 'btn secondary',
        href: '/student/submit-topic.html',
        text: status === 'revision' ? 'Revise & resubmit' : 'Edit topic',
      })
    );
  }
  content.append(topicCard);

  // ---- Chapters summary (unlocked once the topic is approved) ----
  if (status === 'approved') {
    const chapCard = el('div', { class: 'card' }, [
      el('div', { class: 'flex-between' }, [
        el('h2', { text: 'Chapters' }),
        el('a', { class: 'btn small', href: '/student/chapters.html', text: 'Manage chapters' }),
      ]),
    ]);
    const table = el('table', { class: 'data' });
    table.append(
      el('thead', {}, [el('tr', {}, [el('th', { text: '#' }), el('th', { text: 'Chapter' }), el('th', { text: 'Status' }), el('th', { text: 'Link' })])])
    );
    const tbody = el('tbody');
    project.chapters
      .slice()
      .sort((a, b) => a.number - b.number)
      .forEach((ch) => {
        tbody.append(
          el('tr', {}, [
            el('td', { text: String(ch.number) }),
            el('td', { text: ch.name }),
            el('td', {}, [badge(ch.status)]),
            el('td', {}, [ch.link ? safeLink(ch.link, 'Open ↗') : el('span', { class: 'muted', text: '—' })]),
          ])
        );
      });
    table.append(tbody);
    chapCard.append(table);
    content.append(chapCard);

    // ---- Final approval card ----
    const finalCard = el('div', { class: 'card' }, [
      el('div', { class: 'flex-between' }, [el('h2', { text: 'Final approval' }), badge(project.final.status)]),
    ]);
    if (project.stage === 'completed') {
      finalCard.append(el('p', { class: 'alert success', text: '🎉 Your final project has been approved. Congratulations!' }));
    } else if (project.stage === 'final') {
      finalCard.append(el('p', { class: 'muted', text: 'All chapters approved — awaiting final approval from your supervisor.' }));
    } else {
      finalCard.append(el('p', { class: 'muted', text: 'Complete and get all five chapters approved to reach final approval.' }));
    }
    const finalReviews = reviewsList(project.final.reviews, 'Final comments');
    if (finalReviews) finalCard.append(finalReviews);
    content.append(finalCard);
  }

  // ---- Activity timeline ----
  content.append(el('div', { class: 'card' }, [el('h2', { text: 'Activity timeline' }), timelineList(project.timeline)]));
})();

'use strict';

// Supervisor project review page. Loads one project (server re-checks that this
// supervisor owns it → 403 otherwise) and lets the supervisor leave a comment +
// decision on the topic, each submitted chapter, and the final project. Every
// review is appended, so the full history stays visible.

const projectId = new URLSearchParams(location.search).get('id');

(async function initSupervisorProject() {
  const user = await guardPage(['supervisor']);
  if (!user) return;
  renderTopbar(user, 'Supervisor');
  if (!projectId) {
    showAlert('msg', 'No project was specified.');
    return;
  }
  await load();
})();

async function load() {
  let project;
  try {
    ({ project } = await api.get(`/supervisor/projects/${projectId}`));
  } catch (err) {
    document.getElementById('content').innerHTML = '';
    showAlert(
      'msg',
      err.status === 403
        ? 'You are not assigned to supervise this project, so you cannot view it.'
        : err.status === 404
        ? 'Project not found.'
        : err.message || 'Failed to load project'
    );
    return;
  }
  render(project);
}

function render(project) {
  clearAlert('msg');
  const content = document.getElementById('content');
  content.innerHTML = '';

  const student = project.student || {};
  document.getElementById('page-title').textContent = student.name ? `${student.name}'s project` : 'Project review';

  // Student info
  content.append(
    el('div', { class: 'card' }, [
      el('h2', { text: 'Student' }),
      el('p', { text: `${student.name || '—'}${student.matricNumber ? ' · ' + student.matricNumber : ''}` }),
      el('p', { class: 'muted', text: `${student.email || ''}${student.department ? ' · ' + student.department : ''}` }),
    ])
  );

  content.append(stageTracker(project.stage));
  content.append(topicCard(project));

  if (project.topic.status === 'approved') {
    content.append(chaptersCard(project));
    content.append(finalCard(project));
  } else {
    content.append(
      el('div', { class: 'card' }, [
        el('h2', { text: 'Chapters & final approval' }),
        el('p', { class: 'muted', text: 'These unlock once the topic is approved.' }),
      ])
    );
  }

  content.append(el('div', { class: 'card' }, [el('h2', { text: 'Activity timeline' }), timelineList(project.timeline)]));
}

function topicCard(project) {
  const card = el('div', { class: 'card' }, [
    el('div', { class: 'flex-between' }, [el('h2', { text: 'Topic' }), badge(project.topic.status)]),
    el('h3', { text: project.title }),
    el('p', { class: 'muted', text: project.abstract }),
  ]);

  if (project.similarity) {
    card.append(
      simBand({
        warningLevel: project.similarity.warningLevel,
        topScore: project.similarity.topScore,
        status: project.similarity.status,
      }),
      matchesList(project.similarity.matches)
    );
  }

  const hist = reviewsList(project.topic.reviews, 'Review history');
  if (hist) card.append(hist);

  if (project.topic.status === 'approved') {
    card.append(el('p', { class: 'locked', text: `Approved on ${fmtDate(project.topic.decidedAt)}.` }));
  } else {
    card.append(
      buildReviewForm({
        decisions: [
          ['approved', 'Approve topic'],
          ['revision', 'Request revision'],
          ['rejected', 'Reject'],
          ['note', 'Add note (no status change)'],
        ],
        submit: (decision, comment) => api.post(`/supervisor/projects/${projectId}/topic`, { decision, comment }),
      })
    );
  }
  return card;
}

function chaptersCard(project) {
  const card = el('div', { class: 'card' }, [el('h2', { text: 'Chapters' })]);
  project.chapters
    .slice()
    .sort((a, b) => a.number - b.number)
    .forEach((ch) => {
      const block = el('div', { class: 'chapter' });
      block.append(
        el('div', { class: 'chapter-head' }, [
          el('div', {}, [el('span', { class: 'chapter-num', text: `Chapter ${ch.number}` }), el('h3', { text: ch.name })]),
          badge(ch.status),
        ])
      );

      if (ch.link) block.append(el('p', {}, [safeLink(ch.link, 'Open submission ↗')]));

      const hist = reviewsList(ch.reviews, 'Comments');
      if (hist) block.append(hist);

      if (ch.status === 'approved') {
        block.append(el('p', { class: 'locked', text: `Approved on ${fmtDate(ch.reviewedAt)}.` }));
      } else if (ch.status === 'not_submitted') {
        block.append(el('p', { class: 'locked', text: 'Awaiting student submission.' }));
      } else {
        block.append(
          buildReviewForm({
            decisions: [
              ['approved', 'Approve chapter'],
              ['revision', 'Request revision'],
              ['note', 'Add note'],
            ],
            submit: (decision, comment) =>
              api.post(`/supervisor/projects/${projectId}/chapters/${ch.number}`, { decision, comment }),
          })
        );
      }
      card.append(block);
    });
  return card;
}

function finalCard(project) {
  const allApproved = project.chapters.length && project.chapters.every((c) => c.status === 'approved');
  const card = el('div', { class: 'card' }, [
    el('div', { class: 'flex-between' }, [el('h2', { text: 'Final approval' }), badge(project.final.status)]),
  ]);

  const hist = reviewsList(project.final.reviews, 'Final comments');
  if (hist) card.append(hist);

  if (project.final.status === 'approved') {
    card.append(el('p', { class: 'locked', text: `Approved on ${fmtDate(project.final.decidedAt)}.` }));
  } else if (!allApproved) {
    card.append(el('p', { class: 'locked', text: 'Available once all five chapters are approved.' }));
  } else {
    card.append(
      buildReviewForm({
        decisions: [
          ['approved', 'Approve final project'],
          ['revision', 'Request revision'],
          ['note', 'Add note'],
        ],
        submit: (decision, comment) => api.post(`/supervisor/projects/${projectId}/final`, { decision, comment }),
      })
    );
  }
  return card;
}

// Builds a decision + comment form. `submit(decision, comment)` must return the
// API promise resolving to { project }; on success the whole page re-renders.
function buildReviewForm({ decisions, submit }) {
  const form = el('form', { class: 'review-form' });
  const sel = el('select', { class: 'decision' });
  decisions.forEach(([val, label]) => sel.append(el('option', { value: val, text: label })));
  const ta = el('textarea', { rows: '3', placeholder: 'Add a comment (required)…', maxlength: '4000' });
  const btn = el('button', { class: 'btn', type: 'submit', text: 'Submit review' });

  form.append(
    el('div', { class: 'field' }, [el('label', { text: 'Decision' }), sel]),
    el('div', { class: 'field' }, [el('label', { text: 'Comment' }), ta]),
    btn
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const comment = ta.value.trim();
    if (!comment) return showAlert('msg', 'A comment is required for every review.');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const { project } = await submit(sel.value, comment);
      render(project);
      showAlert('msg', 'Review saved.', 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const detail = err.details && err.details[0] ? ` (${err.details[0].message})` : '';
      showAlert('msg', (err.message || 'Failed to submit review') + detail);
      btn.disabled = false;
      btn.textContent = 'Submit review';
    }
  });
  return form;
}

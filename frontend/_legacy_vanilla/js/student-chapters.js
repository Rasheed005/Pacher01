'use strict';

// Student chapters page: submit/update a link per chapter (only after the topic
// is approved), and see the supervisor's comment history for each. An approved
// chapter is locked.
(async function initChapters() {
  const user = await guardPage(['student']);
  if (!user) return;
  renderTopbar(user, 'Student');
  await load();
})();

async function load() {
  const content = document.getElementById('content');
  content.innerHTML = '';

  let project;
  try {
    ({ project } = await api.get('/student/project'));
  } catch (_) {
    project = null;
  }

  if (!project) {
    content.append(
      el('div', { class: 'card' }, [
        el('p', { text: 'You have not submitted a topic yet.' }),
        el('a', { class: 'btn', href: '/student/submit-topic.html', text: 'Submit topic' }),
      ])
    );
    return;
  }
  if (project.topic.status !== 'approved') {
    content.append(
      el('div', { class: 'card' }, [
        el('h2', { text: 'Chapters are locked' }),
        el('p', { class: 'muted', text: 'Your topic must be approved before you can submit chapters.' }),
        el('a', { class: 'btn secondary', href: '/student/dashboard.html', text: 'Back to dashboard' }),
      ])
    );
    return;
  }

  render(project);
}

function render(project) {
  const content = document.getElementById('content');
  content.innerHTML = '';
  content.append(stageTracker(project.stage));

  project.chapters
    .slice()
    .sort((a, b) => a.number - b.number)
    .forEach((ch) => content.append(chapterCard(ch)));
}

function chapterCard(ch) {
  const card = el('div', { class: 'chapter' });
  card.append(
    el('div', { class: 'chapter-head' }, [
      el('div', {}, [el('span', { class: 'chapter-num', text: `Chapter ${ch.number}` }), el('h3', { text: ch.name })]),
      badge(ch.status),
    ])
  );

  if (ch.link) card.append(el('p', {}, [el('span', { class: 'muted', text: 'Current: ' }), safeLink(ch.link, ch.link)]));

  const hist = reviewsList(ch.reviews, 'Supervisor comments');
  if (hist) card.append(hist);

  if (ch.status === 'approved') {
    card.append(el('p', { class: 'locked', text: 'This chapter is approved and locked.' }));
    return card;
  }

  // Submission / resubmission form.
  const form = el('form', { class: 'review-form' });
  const input = el('input', {
    type: 'url',
    placeholder: 'https://docs.google.com/…',
    value: ch.link || '',
    maxlength: '2000',
    required: 'required',
  });
  const btn = el('button', {
    class: 'btn',
    type: 'submit',
    text: ch.status === 'not_submitted' ? 'Submit chapter' : 'Update link',
  });
  form.append(el('div', { class: 'field' }, [el('label', { text: 'Chapter link' }), input]), btn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert('msg');
    const link = input.value.trim();
    if (!/^https?:\/\/.+/i.test(link)) return showAlert('msg', 'Please enter a valid http(s) link.');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const { project } = await api.put(`/student/project/chapters/${ch.number}`, { link });
      showAlert('msg', `Chapter ${ch.number} submitted for review.`, 'success');
      render(project);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const detail = err.details && err.details[0] ? ` (${err.details[0].message})` : '';
      showAlert('msg', (err.message || 'Failed to submit chapter') + detail);
      btn.disabled = false;
      btn.textContent = ch.status === 'not_submitted' ? 'Submit chapter' : 'Update link';
    }
  });
  card.append(form);
  return card;
}

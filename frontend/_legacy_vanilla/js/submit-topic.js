'use strict';

(async function initSubmitTopic() {
  const user = await guardPage(['student']);
  if (!user) return;
  renderTopbar(user, 'Student');

  const form = document.getElementById('topic-form');
  const supervisorSel = document.getElementById('supervisor');
  const simResult = document.getElementById('sim-result');
  const checkBtn = document.getElementById('check-btn');
  const submitBtn = document.getElementById('submit-btn');

  // Load supervisors for the picker.
  try {
    const { supervisors } = await api.get('/student/supervisors');
    supervisorSel.innerHTML = '';
    supervisorSel.append(el('option', { value: '', text: supervisors.length ? 'Select a supervisor…' : 'No supervisors available yet' }));
    supervisors.forEach((s) => {
      const label = s.department ? `${s.name} — ${s.department}` : s.name;
      supervisorSel.append(el('option', { value: s._id, text: label }));
    });
  } catch (err) {
    supervisorSel.innerHTML = '';
    supervisorSel.append(el('option', { value: '', text: 'Could not load supervisors' }));
  }

  // Prefill if a project already exists and is still editable.
  try {
    const { project } = await api.get('/student/project');
    if (project) {
      if (project.topic.status === 'approved') {
        showAlert('msg', 'Your topic is already approved and can no longer be edited.', 'info');
        form.querySelectorAll('input, textarea, select, button').forEach((n) => (n.disabled = true));
      } else {
        form.title.value = project.title;
        form.abstract.value = project.abstract;
        if (project.supervisor) supervisorSel.value = project.supervisor._id || project.supervisor;
        document.getElementById('subtitle').textContent =
          project.topic.status === 'revision'
            ? 'Revision requested — update your topic and resubmit.'
            : 'Update your submitted topic and resubmit.';
        submitBtn.textContent = 'Resubmit for approval';
      }
    }
  } catch (_) {
    /* no existing project */
  }

  function readInputs() {
    return { title: form.title.value.trim(), abstract: form.abstract.value.trim() };
  }
  function validLocally({ title, abstract }) {
    if (!title) return 'Please enter a project title.';
    if (abstract.length < 20) return 'Abstract must be at least 20 characters.';
    return null;
  }

  function renderSimilarity(sim) {
    simResult.innerHTML = '';
    simResult.append(simBand(sim), matchesList(sim.matches));
  }

  // Check similarity without saving.
  checkBtn.addEventListener('click', async () => {
    clearAlert('msg');
    const inputs = readInputs();
    const localErr = validLocally(inputs);
    if (localErr) return showAlert('msg', localErr);

    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';
    try {
      const { similarity: sim } = await api.post('/student/project/similarity-check', inputs);
      renderSimilarity(sim);
    } catch (err) {
      showAlert('msg', err.message || 'Similarity check failed');
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = 'Check similarity';
    }
  });

  // Submit / resubmit the topic.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert('msg');
    const inputs = readInputs();
    const localErr = validLocally(inputs);
    if (localErr) return showAlert('msg', localErr);
    if (!supervisorSel.value) return showAlert('msg', 'Please choose a supervisor.');

    submitBtn.disabled = true;
    try {
      const { similarity: sim } = await api.post('/student/project', {
        ...inputs,
        supervisorId: supervisorSel.value,
      });
      if (sim) renderSimilarity(sim);
      showAlert('msg', 'Topic submitted for approval. Redirecting to your dashboard…', 'success');
      setTimeout(() => window.location.assign('/student/dashboard.html'), 1200);
    } catch (err) {
      const detail = err.details && err.details[0] ? ` (${err.details[0].message})` : '';
      showAlert('msg', (err.message || 'Submission failed') + detail);
      submitBtn.disabled = false;
    }
  });
})();

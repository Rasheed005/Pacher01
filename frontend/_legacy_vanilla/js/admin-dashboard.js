'use strict';

// Milestone 1: authenticated shell. Supervisor creation (super-admin), user
// management/assignment, reports, and system monitoring are added in Milestone 4.
(async function initAdminDashboard() {
  const user = await guardPage(['admin']);
  if (!user) return;
  renderTopbar(user, 'Administrator');
  document.getElementById('welcome').textContent = `Welcome, ${user.name}`;

  const content = document.getElementById('content');
  content.append(
    el('div', { class: 'card' }, [
      el('h2', { text: 'Admin tools' }),
      el('p', { class: 'muted', text: 'Create supervisors, manage users, and monitor the system. Tools appear here in a later step.' }),
    ])
  );
})();

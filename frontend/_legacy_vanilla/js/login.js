'use strict';

(async function initLogin() {
  // Already signed in? Skip straight to the right dashboard.
  try {
    const { user } = await auth.me();
    window.location.replace(dashboardPath(user.role));
    return;
  } catch (_) {
    /* not logged in — show the form */
  }

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert('msg');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const { user } = await auth.login(form.email.value.trim(), form.password.value);
      window.location.replace(dashboardPath(user.role));
    } catch (err) {
      showAlert('msg', err.message || 'Login failed');
      btn.disabled = false;
    }
  });
})();

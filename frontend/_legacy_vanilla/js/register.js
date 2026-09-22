'use strict';

(async function initRegister() {
  // Already signed in? Go to dashboard.
  try {
    const { user } = await auth.me();
    window.location.replace(dashboardPath(user.role));
    return;
  } catch (_) {
    /* not logged in — show the form */
  }

  const form = document.getElementById('register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert('msg');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const { user } = await auth.register({
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        password: form.password.value,
        matricNumber: form.matricNumber.value.trim() || undefined,
        department: form.department.value.trim() || undefined,
      });
      window.location.replace(dashboardPath(user.role));
    } catch (err) {
      const detail = err.details && err.details[0] ? ` (${err.details[0].message})` : '';
      showAlert('msg', (err.message || 'Registration failed') + detail);
      btn.disabled = false;
    }
  });
})();

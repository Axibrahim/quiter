import { requireAuth, logout } from './modules/auth-state.js';
import { api } from './modules/api-client.js';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  const slot = document.getElementById('nav-auth-slot');
  if (slot) {
    slot.innerHTML = `
      <a href="dashboard.html" class="btn btn--text">Dashboard</a>
      <button class="btn btn--text" id="logout-btn" type="button">Logout</button>
    `;
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }

  document.getElementById('profile-display-name').value = user.display_name;
  document.getElementById('profile-email').value = user.email;

  if (!user.is_verified) {
    document.getElementById('verify-banner').style.display = 'flex';
    document.getElementById('resend-verify-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Sending…';
      try {
        await api.post('/auth/verify/resend', {});
        e.target.textContent = 'Sent!';
      } catch {
        e.target.textContent = 'Try again';
        e.target.disabled = false;
      }
    });
  }

  const form = document.getElementById('profile-form');
  const errorEl = document.getElementById('profile-error');
  const successEl = document.getElementById('profile-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    successEl.textContent = '';

    const newEmail = document.getElementById('profile-email').value.trim();
    const newPassword = document.getElementById('profile-new-password').value;
    const currentPassword = document.getElementById('profile-current-password').value;

    const payload = { current_password: currentPassword };
    if (newEmail && newEmail !== user.email) payload.email = newEmail;
    if (newPassword) payload.password = newPassword;

    if (!payload.email && !payload.password) {
      errorEl.textContent = 'Nothing to change — edit your email or set a new password first.';
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await api.patch('/auth/profile', payload);
      successEl.textContent = 'Saved. Check your inbox if you changed your email — it needs re-verifying.';
      document.getElementById('profile-new-password').value = '';
      document.getElementById('profile-current-password').value = '';
    } catch (err) {
      errorEl.textContent = err.message === 'invalid_credentials'
        ? 'Current password is incorrect.'
        : err.message === 'weak_password'
          ? 'New password must be at least 10 characters with a number and a letter.'
          : err.message === 'email_already_registered'
            ? 'That email is already in use by another account.'
            : "Couldn't save changes — try again.";
    } finally {
      submitBtn.disabled = false;
    }
  });
});

import { api } from './modules/api-client.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reset-form');
  const errorEl = document.getElementById('reset-error');
  const token = new URLSearchParams(window.location.search).get('token');

  if (!token) {
    errorEl.textContent = 'This link is missing a token — use the link from your email.';
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      await api.post('/auth/password/reset', {
        token,
        password: document.getElementById('reset-password').value,
      });
      form.style.display = 'none';
      document.getElementById('reset-success').style.display = 'block';
    } catch (err) {
      errorEl.textContent = err.message === 'weak_password'
        ? 'Password must be at least 10 characters with a number and a letter.'
        : 'That link has expired — request a new one from the login form.';
      submitBtn.disabled = false;
    }
  });
});

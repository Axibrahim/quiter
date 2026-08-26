import { api } from './modules/api-client.js';

document.addEventListener('DOMContentLoaded', async () => {
  const title = document.getElementById('verify-title');
  const body = document.getElementById('verify-body');
  const homeLink = document.getElementById('verify-home-link');

  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    title.textContent = 'Missing verification link';
    body.textContent = 'This page needs a token in the URL — use the link from your email.';
    homeLink.style.display = 'inline-flex';
    return;
  }

  try {
    await api.post('/auth/verify/confirm', { token });
    title.textContent = "You're verified! ✨";
    body.textContent = 'Your email is confirmed. You can head back to Quiter now.';
  } catch (err) {
    title.textContent = 'That link has expired';
    body.textContent = 'Verification links are valid for 48 hours. Request a new one from your profile page.';
  } finally {
    homeLink.style.display = 'inline-flex';
  }
});

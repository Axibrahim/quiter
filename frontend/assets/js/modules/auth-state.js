/**
 * Shared session/auth state, used by every page (index, dashboard,
 * profile, about). Calls GET /api/v1/auth/me once on load — if it
 * succeeds, the user is logged in and we update the nav + fire a
 * 'quiter:auth' event any page-specific script can listen for; if it
 * 401s, we treat the user as logged out.
 */
import { api } from './api-client.js';

let currentUser = null;

export async function initAuthState() {
  try {
    currentUser = await api.get('/auth/me');
  } catch {
    currentUser = null;
  }
  applyNavState();
  document.dispatchEvent(new CustomEvent('quiter:auth', { detail: { user: currentUser } }));
  return currentUser;
}

export function getCurrentUser() {
  return currentUser;
}

export async function logout() {
  try { await api.post('/auth/logout', {}); } catch { /* best-effort */ }
  currentUser = null;
  window.location.href = 'index.html';
}

/**
 * Swaps the nav's right-hand side between "Sign Up / Login" (logged out)
 * and "Dashboard / Profile / Logout" (logged in). Every page's nav must
 * share the same #nav-auth-slot container for this to find it.
 */
function applyNavState() {
  const slot = document.getElementById('nav-auth-slot');
  if (!slot) return;

  if (currentUser) {
    slot.innerHTML = `
      <a href="dashboard.html" class="btn btn--text">Dashboard</a>
      <a href="profile.html" class="liquid-glass btn btn--glass">${escapeHtml(currentUser.display_name)}</a>
      <button class="btn btn--text" id="nav-logout-btn" type="button">Logout</button>
    `;
    document.getElementById('nav-logout-btn')?.addEventListener('click', logout);
  } else {
    slot.innerHTML = `
      <button class="btn btn--text" id="signup-trigger" type="button">Sign Up</button>
      <button class="liquid-glass btn btn--glass" id="login-trigger" type="button">Login</button>
    `;
    // Re-dispatch so initAuth() (in main.js) can re-attach listeners to
    // these freshly-created buttons — it runs once at boot, before this
    // async check resolves, so the original elements it bound to may
    // already have been replaced by this innerHTML swap.
    document.dispatchEvent(new CustomEvent('quiter:nav-rendered'));
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Guards a page behind login — call at the top of dashboard.html/
 * profile.html's script. Redirects to the homepage with a return path if
 * no session is present.
 */
export async function requireAuth() {
  const user = await initAuthState();
  if (!user) {
    window.location.href = 'index.html?login=1';
    return null;
  }
  return user;
}

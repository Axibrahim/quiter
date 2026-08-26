import { requireAuth, logout } from './modules/auth-state.js';
import { api } from './modules/api-client.js';
import { BloomScene } from './three/bloom-scene.js';

function directionLabel(direction) {
  return direction === 'break' ? 'Break' : 'Build';
}

function renderPlanCard(plan) {
  const pctDone = Math.round((plan.day_number / plan.total_days) * 100);
  const disabled = plan.already_logged_today || plan.is_completed;

  const wrapper = document.createElement('div');
  wrapper.className = 'liquid-glass liquid-glass--panel bento-cell';
  wrapper.style.padding = 'var(--space-4)';
  wrapper.innerHTML = `
    <p class="today-card__day">Day ${plan.day_number} of ${plan.total_days} — ${plan.title} (${directionLabel(plan.direction)})</p>
    <h3 class="today-card__goal">${plan.micro_goal ? escapeHtml(plan.micro_goal) : 'Plan complete 🎉'}</h3>
    ${plan.identity_cue ? `<p class="today-card__cue">${escapeHtml(plan.identity_cue)}</p>` : ''}
    <div style="display:flex; gap: var(--space-3); margin: var(--space-2) 0; font-family: var(--font-mono); font-size:0.85rem; color: var(--ink-40);">
      <span>${plan.current_streak} day streak</span>
      <span>${plan.longest_streak} longest</span>
      <span>${pctDone}% through</span>
    </div>
    <div class="today-card__actions">
      <button class="btn btn--solid" data-checkin="completed" data-plan-id="${plan.user_plan_id}" ${disabled ? 'disabled' : ''} type="button">
        ${plan.already_logged_today ? 'Already checked in today' : 'Mark complete'}
      </button>
      <button class="liquid-glass btn btn--glass" data-checkin="missed" data-plan-id="${plan.user_plan_id}" ${disabled ? 'disabled' : ''} type="button">I slipped today</button>
    </div>
  `;
  return wrapper;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadPlans(bloomScene) {
  const loading = document.getElementById('plans-loading');
  const empty = document.getElementById('plans-empty');
  const list = document.getElementById('plans-list');

  list.innerHTML = '';
  loading.style.display = '';
  empty.style.display = 'none';

  try {
    const plans = await api.get('/plans/mine');
    loading.style.display = 'none';

    const active = plans.filter((p) => !p.is_abandoned);
    if (active.length === 0) {
      empty.style.display = '';
      return;
    }

    active.forEach((plan) => list.appendChild(renderPlanCard(plan)));
  } catch (err) {
    loading.textContent = `Couldn't load your plans (${err.message}).`;
  }
}

/**
 * Delegated click handler for check-in buttons, attached ONCE to the
 * stable #plans-list container rather than re-attached on every reload —
 * event delegation means newly-rendered cards are covered automatically
 * without ever stacking duplicate listeners.
 */
function initCheckinDelegation(bloomScene) {
  const list = document.getElementById('plans-list');
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-checkin]');
    if (!btn) return;
    const status = btn.dataset.checkin;
    const planId = btn.dataset.planId;
    btn.disabled = true;
    try {
      const result = await api.post(`/plans/${planId}/checkin`, { status });
      if (result.reward_tier > 0 && bloomScene) bloomScene.trigger(result.reward_tier);
      await loadPlans(bloomScene);
    } catch (err) {
      alert(`Couldn't save check-in: ${err.message}`);
      btn.disabled = false;
    }
  });
}

function initCustomPlanModal() {
  const overlay = document.getElementById('custom-modal-overlay');
  const openBtn = document.getElementById('open-custom-plan');
  const closeBtn = document.getElementById('custom-modal-close');
  const form = document.getElementById('custom-plan-form');
  const errorEl = document.getElementById('custom-error');
  if (!overlay || !form) return;

  const open = () => { overlay.classList.add('is-open'); document.body.style.overflow = 'hidden'; };
  const close = () => { overlay.classList.remove('is-open'); document.body.style.overflow = ''; errorEl.textContent = ''; form.reset(); };

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      await api.post('/plans/custom', {
        goal_text: document.getElementById('custom-goal').value.trim(),
        direction: form.querySelector('input[name="custom-direction"]:checked').value,
        length_days: parseInt(document.getElementById('custom-length').value, 10),
      });
      close();
      window.location.reload();
    } catch (err) {
      errorEl.textContent = err.message === 'invalid_goal_text'
        ? 'Please describe your goal in a few words (3–160 characters).'
        : "Couldn't create that plan — try again.";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function initSquadNudges() {
  document.querySelectorAll('[data-nudge]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        // No real squad_id wired yet (squad join/membership flow is a
        // follow-up feature) — this is left as a clearly-labeled no-op
        // rather than silently pretending to succeed.
        alert('Squad membership is coming soon — nudges will work once you can join a squad.');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return; // requireAuth() already redirected

  const slot = document.getElementById('nav-auth-slot');
  if (slot) {
    slot.innerHTML = `
      <a href="profile.html" class="liquid-glass btn btn--glass">${escapeHtml(user.display_name)}</a>
      <button class="btn btn--text" id="logout-btn" type="button">Logout</button>
    `;
    document.getElementById('logout-btn')?.addEventListener('click', logout);
  }

  let bloomScene = null;
  try {
    const canvas = document.getElementById('bloom-canvas');
    bloomScene = new BloomScene(canvas);
    bloomScene.start();
    window.addEventListener('pagehide', () => bloomScene.destroy());
  } catch (e) {
    console.error('[bloom scene init failed]', e);
  }

  await loadPlans(bloomScene);
  initCheckinDelegation(bloomScene);
  initCustomPlanModal();
  initSquadNudges();
});

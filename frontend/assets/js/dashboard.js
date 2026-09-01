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
  const goalInput = document.getElementById('custom-goal');
  const goalCount = document.getElementById('custom-goal-count');
  const lengthInput = document.getElementById('custom-length');
  const lengthOutput = document.getElementById('custom-length-output');
  const identityInput = document.getElementById('custom-identity');

  if (!overlay || !form) return;

  const updateGoalCount = () => {
    if (goalCount && goalInput) {
      goalCount.textContent = `${goalInput.value.length} / 160`;
    }
  };

  const updateLength = (value) => {
    const days = Math.min(365, Math.max(3, Number(value)));
    lengthInput.value = days;
    lengthOutput.textContent = `${days} day${days === 1 ? '' : 's'}`;

    const progress = ((days - 3) / (365 - 3)) * 100;
    lengthInput.style.setProperty(
      '--range-progress',
      `${progress}%`,
    );

    document.querySelectorAll('[data-plan-preset]').forEach((button) => {
      button.classList.toggle(
        'is-active',
        Number(button.dataset.planPreset) === days,
      );
    });
  };

  const updateReminderRows = () => {
    document.querySelectorAll('[data-reminder-row]').forEach((row) => {
      const toggle = row.querySelector('[data-reminder-toggle]');
      const timeInput = row.querySelector('[data-reminder-time]');

      if (!toggle || !timeInput) return;

      timeInput.disabled = !toggle.checked;
      row.classList.toggle('is-selected', toggle.checked);
    });
  };

  const open = () => {
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    updateGoalCount();
    updateLength(lengthInput.value);
    updateReminderRows();
  };

  const close = () => {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    errorEl.textContent = '';
    form.reset();

    if (identityInput) identityInput.value = '';

    updateGoalCount();
    updateLength(30);
    updateReminderRows();
  };

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  goalInput?.addEventListener('input', updateGoalCount);
  lengthInput?.addEventListener('input', () => {
    updateLength(lengthInput.value);
  });

  document.querySelectorAll('[data-plan-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      updateLength(button.dataset.planPreset);
    });
  });

  document.querySelectorAll('[data-reminder-row]').forEach((row) => {
    row.addEventListener('change', updateReminderRows);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const reminderTimes = [...document.querySelectorAll('[data-reminder-row]')]
      .filter((row) => row.querySelector('[data-reminder-toggle]')?.checked)
      .map((row) => row.querySelector('[data-reminder-time]')?.value)
      .filter(Boolean);

    let reminderTimezone = 'UTC';

    try {
      reminderTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      reminderTimezone = 'UTC';
    }

    try {
      await api.post('/plans/custom', {
        goal_text: goalInput.value.trim(),
        direction: form.querySelector(
          'input[name="custom-direction"]:checked',
        ).value,
        length_days: Number(lengthInput.value),
        identity_statement: identityInput.value.trim(),
        support_style: form.querySelector(
          'input[name="custom-support-style"]:checked',
        ).value,
        reminder_times: reminderTimes,
        reminder_timezone: reminderTimezone,
      });

      close();
      window.location.reload();
    } catch (err) {
      const messages = {
        invalid_goal_text:
          'Describe your goal in 3–160 characters.',
        invalid_length_days:
          'Choose a plan period between 3 and 365 days.',
        invalid_identity_statement:
          'Your identity statement must be 160 characters or fewer.',
        invalid_support_style:
          'Choose one of the available support styles.',
        invalid_reminder_times:
          'Choose up to three valid reminder times.',
        invalid_timezone:
          'We could not read your timezone. Please try again.',
      };

      errorEl.textContent =
        messages[err.message] ||
        "Couldn't create that plan — please try again.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  if (new URLSearchParams(window.location.search).get('custom') === '1') {
    open();
  }
}

function initBloomScene() {
  const canvas = document.getElementById('bloom-canvas');
  if (!canvas) return null;

  const scene = new BloomScene(canvas);
  scene.start();
  window.addEventListener('pagehide', () => scene.destroy());
  return scene;
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  const bloomScene = initBloomScene();

  initCheckinDelegation(bloomScene);
  initCustomPlanModal();

  await loadPlans(bloomScene);
});
import { requireAuth } from './modules/auth-state.js';
import { api } from './modules/api-client.js';

let editingId = null;
let uploadedPhotoUrl = '';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fieldsFromForm() {
  return {
    title: document.getElementById('tpl-title').value.trim(),
    slug: document.getElementById('tpl-slug').value.trim().toLowerCase(),
    identity_statement: document.getElementById('tpl-identity').value.trim(),
    direction: document.querySelector('input[name="tpl-direction"]:checked').value,
    category: document.getElementById('tpl-category').value.trim(),
    length_days: Number(document.getElementById('tpl-length').value),
    description: document.getElementById('tpl-description').value.trim(),
    photo_url: uploadedPhotoUrl || null,
    price_cents: document.getElementById('tpl-price').value
      ? Math.round(Number(document.getElementById('tpl-price').value) * 100)
      : null,
    trial_days: document.getElementById('tpl-trial').value
      ? Number(document.getElementById('tpl-trial').value)
      : null,
    is_active: document.getElementById('tpl-active').checked,
  };
}

function fillForm(template) {
  document.getElementById('tpl-title').value = template.title || '';
  document.getElementById('tpl-slug').value = template.slug || '';
  document.getElementById('tpl-identity').value = template.identity_statement || '';
  document.querySelector(`input[name="tpl-direction"][value="${template.direction}"]`).checked = true;
  document.getElementById('tpl-category').value = template.category || '';
  document.getElementById('tpl-length').value = template.length_days || 30;
  document.getElementById('tpl-description').value = template.description || '';
  document.getElementById('tpl-price').value = template.price_cents != null ? (template.price_cents / 100).toFixed(2) : '';
  document.getElementById('tpl-trial').value = template.trial_days != null ? template.trial_days : '';
  document.getElementById('tpl-active').checked = template.is_active !== false;

  uploadedPhotoUrl = template.photo_url || '';
  const preview = document.getElementById('tpl-photo-preview');
  const previewWrap = document.getElementById('tpl-photo-preview-wrap');
  if (uploadedPhotoUrl) {
    preview.src = uploadedPhotoUrl;
    previewWrap.style.display = '';
  } else {
    previewWrap.style.display = 'none';
  }
}

function resetForm() {
  document.getElementById('template-form').reset();
  uploadedPhotoUrl = '';
  document.getElementById('tpl-photo-preview-wrap').style.display = 'none';
  document.getElementById('tpl-photo-status').textContent = '';
  document.getElementById('tpl-error').textContent = '';
  editingId = null;
  document.getElementById('template-form-title').textContent = 'New plan';
}

function openForm(template) {
  resetForm();
  if (template) {
    editingId = template.id;
    fillForm(template);
    document.getElementById('template-form-title').textContent = `Edit — ${template.title}`;
  }
  document.getElementById('template-form-panel').style.display = '';
  document.getElementById('template-form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeForm() {
  document.getElementById('template-form-panel').style.display = 'none';
  resetForm();
}

function renderAdminCard(template) {
  const card = document.createElement('div');
  card.className = 'liquid-glass liquid-glass--panel plan-card';

  card.innerHTML = `
    <div class="plan-card__photo" style="${template.photo_url ? '' : `--plan-glow: rgba(141,124,255,0.35);`}">
      ${template.photo_url
        ? `<img src="${template.photo_url}" alt="" style="width:100%; height:100%; object-fit:cover;" />`
        : '🌱'}
    </div>
    <div class="plan-card__body">
      <span class="plan-card__direction plan-card__direction--${template.direction}">
        ${template.direction === 'break' ? 'Break' : 'Build'} · ${escapeHtml(template.category)}
      </span>
      <h3 class="plan-card__title">${escapeHtml(template.title)}</h3>
      <p class="plan-card__identity">"${escapeHtml(template.identity_statement)}"</p>
      <div class="plan-card__meta">
        <span>${template.length_days} days</span>
        <span>${template.is_active ? 'Active' : 'Hidden'}</span>
      </div>
      <div class="plan-card__meta">
        <span>${template.price_cents != null ? `$${(template.price_cents / 100).toFixed(2)}` : 'Free'}</span>
        <span>${template.trial_days ? `${template.trial_days}-day trial` : 'No trial'}</span>
      </div>
      <div style="display:flex; gap: 0.5rem; margin-top: 0.4rem;">
        <button class="liquid-glass btn btn--glass" data-edit style="flex:1;" type="button">Edit</button>
        <button class="liquid-glass btn btn--glass" data-delete style="flex:1;" type="button">${template.is_active ? 'Hide' : 'Hidden'}</button>
      </div>
    </div>
  `;

  card.querySelector('[data-edit]')?.addEventListener('click', () => openForm(template));
  card.querySelector('[data-delete]')?.addEventListener('click', () => handleDelete(template));
  return card;
}

async function loadTemplates() {
  const loading = document.getElementById('admin-loading');
  const grid = document.getElementById('admin-template-grid');
  loading.style.display = '';
  grid.innerHTML = '';

  try {
    const templates = await api.get('/admin/templates');
    loading.style.display = 'none';
    templates.forEach((t) => grid.appendChild(renderAdminCard(t)));
  } catch (err) {
    loading.textContent = `Couldn't load plan templates (${err.message}).`;
  }
}

async function handleDelete(template) {
  if (!template.is_active) return;
  if (!confirm(`Hide "${template.title}" from the public catalog?`)) return;

  try {
    await api.delete(`/admin/templates/${template.id}`);
    await loadTemplates();
  } catch (err) {
    alert(`Couldn't hide plan: ${err.message}`);
  }
}

async function handlePhotoUpload(file) {
  const status = document.getElementById('tpl-photo-status');
  status.textContent = 'Uploading…';

  const formData = new FormData();
  formData.append('photo', file);

  const res = await fetch('http://127.0.0.1:5000/api/v1/admin/upload-photo', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Quiter-Client': 'web' },
    body: formData,
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    status.textContent = `Upload failed: ${result.error || 'unknown error'}`;
    return;
  }

  uploadedPhotoUrl = result.photo_url;
  status.textContent = 'Uploaded.';
  const preview = document.getElementById('tpl-photo-preview');
  const previewWrap = document.getElementById('tpl-photo-preview-wrap');
  preview.src = uploadedPhotoUrl;
  previewWrap.style.display = '';
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  if (!user.is_admin) {
    alert("You don't have access to this page.");
    window.location.href = 'dashboard.html';
    return;
  }

  await loadTemplates();

  document.getElementById('new-template-btn')?.addEventListener('click', () => openForm(null));
  document.getElementById('tpl-cancel')?.addEventListener('click', closeForm);

  document.getElementById('tpl-photo-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handlePhotoUpload(file);
  });

  document.getElementById('template-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('tpl-error');
    const submitBtn = document.getElementById('tpl-submit');
    errorEl.textContent = '';
    submitBtn.disabled = true;

    const fields = fieldsFromForm();

    try {
      if (editingId) {
        await api.patch(`/admin/templates/${editingId}`, fields);
      } else {
        await api.post('/admin/templates', fields);
      }
      closeForm();
      await loadTemplates();
    } catch (err) {
      errorEl.textContent = `Couldn't save: ${err.message}`;
    } finally {
      submitBtn.disabled = false;
    }
  });
});
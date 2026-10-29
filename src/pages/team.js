/**
 * Project Mafia — Team & Staff Management (Admin Only)
 * Add, edit, or remove workers, set 4-digit PINs, and monitor workload
 */
import { getAll, add, update, remove, getWorkTasks } from '../db.js';
import { getCurrentUser, isAdmin } from '../auth.js';
import { showToast, showConfirm, formatDate } from '../utils.js';

let currentMembers = [];

export function renderTeamPage() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Team & Staff Management</h1>
        <p class="page-subtitle">Manage workshop technicians, assignment writers, roles, and PIN access</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-primary" id="btn-add-member">
          <span class="material-icons-round">person_add</span>
          <span>Add Team Member</span>
        </button>
      </div>
    </div>

    <!-- Team Members Table -->
    <div class="table-container">
      <div class="table-scroll">
        <table class="data-table" id="team-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Username</th>
              <th>Role</th>
              <th>Specialty</th>
              <th>Active Tasks</th>
              <th>Access PIN</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="team-tbody">
            <tr>
              <td colspan="8" style="text-align:center; padding:30px; color:var(--text-tertiary);">Loading team members...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function initTeamPage() {
  if (!isAdmin()) {
    showToast('Unauthorized: Admin access required', 'error');
    window.location.hash = '#tasks';
    return;
  }

  await loadTeamMembers();
  bindTeamEvents();
}

async function loadTeamMembers() {
  const [members, tasks] = await Promise.all([
    getAll('teamMembers'),
    getAll('workTasks')
  ]);
  currentMembers = members;

  const tbody = document.getElementById('team-tbody');
  if (!tbody) return;

  if (members.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:30px; color:var(--text-tertiary);">
          No team members found. Click "Add Team Member" to create one.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = members.map(m => {
    const isMemberAdmin = m.role === 'admin';
    const activeTasksCount = tasks.filter(t => t.assignedToId === m.id && t.status !== 'completed').length;
    const color = m.avatarColor || (isMemberAdmin ? '#8b5cf6' : '#3b82f6');

    return `
      <tr data-id="${m.id}">
        <td class="cell-name">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="staff-card-avatar" style="background:${color}; width:32px; height:32px; font-size:14px;">
              ${m.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-weight:600;">${m.name}</div>
              <div style="font-size:0.7rem; color:var(--text-tertiary);">ID #${m.id}</div>
            </div>
          </div>
        </td>
        <td><code>${m.username}</code></td>
        <td>
          <span class="staff-badge ${isMemberAdmin ? 'admin' : 'worker'}">
            ${isMemberAdmin ? '👑 Admin' : '🔧 Worker'}
          </span>
        </td>
        <td class="cell-secondary">${m.specialty || 'General'}</td>
        <td>
          <span class="badge ${activeTasksCount > 2 ? 'badge-urgent' : 'badge-type'}">
            ${activeTasksCount} active task${activeTasksCount !== 1 ? 's' : ''}
          </span>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="pin-display" data-pin="${m.pin}">••••</span>
            <button class="btn-icon-sm toggle-pin-visibility" title="Show/Hide PIN" style="color:var(--text-tertiary); padding:2px;">
              <span class="material-icons-round" style="font-size:15px;">visibility</span>
            </button>
          </div>
        </td>
        <td>
          <span class="status-badge ${m.active !== false ? 'delivered' : 'waiting'}">
            ${m.active !== false ? 'Active' : 'Disabled'}
          </span>
        </td>
        <td>
          <div class="row-actions">
            <button title="Edit Member" class="edit-member" data-id="${m.id}">
              <span class="material-icons-round">edit</span>
            </button>
            ${m.id !== 1 ? `
              <button title="Delete Member" class="delete delete-member" data-id="${m.id}">
                <span class="material-icons-round">delete</span>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function bindTeamEvents() {
  document.getElementById('btn-add-member')?.addEventListener('click', () => {
    openMemberModal();
  });

  document.getElementById('team-tbody')?.addEventListener('click', async (e) => {
    // Toggle PIN visibility
    const togglePin = e.target.closest('.toggle-pin-visibility');
    if (togglePin) {
      const tr = togglePin.closest('tr');
      const pinSpan = tr?.querySelector('.pin-display');
      if (pinSpan) {
        const isHidden = pinSpan.textContent === '••••';
        pinSpan.textContent = isHidden ? pinSpan.dataset.pin : '••••';
        togglePin.querySelector('span').textContent = isHidden ? 'visibility_off' : 'visibility';
      }
      return;
    }

    const editBtn = e.target.closest('.edit-member');
    const deleteBtn = e.target.closest('.delete-member');

    if (editBtn) {
      const id = parseInt(editBtn.dataset.id, 10);
      const member = currentMembers.find(m => m.id === id);
      if (member) openMemberModal(member);
      return;
    }

    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id, 10);
      const member = currentMembers.find(m => m.id === id);
      const confirmed = await showConfirm('Remove Staff Member', `Are you sure you want to remove ${member?.name || 'this member'}?`);
      if (confirmed) {
        await remove('teamMembers', id);
        showToast('Member removed', 'info');
        await loadTeamMembers();
      }
      return;
    }
  });
}

function openMemberModal(member = null) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const colors = ['#8b5cf6', '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#06b6d4'];

  container.innerHTML = `
    <div class="modal-header">
      <h2><span class="material-icons-round" style="color:var(--accent-primary-light); vertical-align:middle;">person</span> ${member ? 'Edit Team Member' : 'Add New Team Member'}</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <form id="team-member-form">
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input class="form-input" type="text" name="name" value="${member?.name || ''}" placeholder="e.g. Rahul Sharma" required />
          </div>

          <div class="form-group">
            <label class="form-label">Login Username *</label>
            <input class="form-input" type="text" name="username" value="${member?.username || ''}" placeholder="e.g. rahul" required />
          </div>

          <div class="form-group">
            <label class="form-label">Role</label>
            <select class="form-input" name="role">
              <option value="worker" ${member?.role === 'worker' ? 'selected' : ''}>Worker / Staff (Zero Financial Access)</option>
              <option value="admin" ${member?.role === 'admin' ? 'selected' : ''}>Admin / Owner (Full Access)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Specialty / Department</label>
            <input class="form-input" type="text" name="specialty" value="${member?.specialty || ''}" placeholder="e.g. Hardware & IoT, Academic Reports" />
          </div>

          <div class="form-group">
            <label class="form-label">4-Digit Access PIN *</label>
            <input class="form-input" type="password" name="pin" maxlength="6" inputmode="numeric" value="${member?.pin || '1234'}" placeholder="1234" required />
            <div style="font-size:0.7rem; color:var(--text-tertiary); margin-top:3px;">Used for 1-tap fast tablet/mobile sign-in.</div>
          </div>

          <div class="form-group">
            <label class="form-label">Avatar Badge Color</label>
            <select class="form-input" name="avatarColor">
              ${colors.map(c => `
                <option value="${c}" ${member?.avatarColor === c ? 'selected' : ''} style="color:${c};">
                  ● Color (${c})
                </option>
              `).join('')}
            </select>
          </div>

          <div class="form-group full-width">
            <label class="checkbox-label" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" name="active" ${member?.active !== false ? 'checked' : ''} />
              <span>Active Account (Permit sign-in)</span>
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn-primary">
          <span class="material-icons-round">save</span>
          <span>${member ? 'Save Changes' : 'Create Member'}</span>
        </button>
      </div>
    </form>
  `;

  overlay.classList.remove('hidden');

  const closeFn = () => overlay.classList.add('hidden');
  document.getElementById('modal-close')?.addEventListener('click', closeFn);
  document.getElementById('modal-cancel')?.addEventListener('click', closeFn);

  document.getElementById('team-member-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;

    const data = {
      name: form.name.value.trim(),
      username: form.username.value.trim().toLowerCase(),
      role: form.role.value,
      specialty: form.specialty.value.trim(),
      pin: form.pin.value.trim(),
      avatarColor: form.avatarColor.value,
      active: form.active.checked
    };

    try {
      if (member) {
        data.id = member.id;
        data.createdAt = member.createdAt || new Date().toISOString();
        await update('teamMembers', data);
        showToast('Team member updated!', 'success');
      } else {
        data.createdAt = new Date().toISOString();
        await add('teamMembers', data);
        showToast('New team member added!', 'success');
      }
      closeFn();
      await loadTeamMembers();
    } catch (err) {
      showToast('Error saving member: ' + err.message, 'error');
    }
  });
}

/**
 * Project Mafia — Work Portal (Tasks, Assignments & Workshop Delegation)
 * Worker Portal: Strict zero-financial interface focused purely on technical execution
 * Admin View: Dispatch, workload monitoring, and deliverable review handshake
 */
import {
  getWorkTasks, getTeamMembers, updateTaskStatus, addTaskComment,
  add, update, remove, getById, getAll
} from '../db.js';
import { getCurrentUser, isAdmin, isWorker } from '../auth.js';
import { formatDate, showToast, showConfirm, debounce } from '../utils.js';

let currentTasks = [];
let currentMembers = [];
let statusFilter = 'all';
let workerFilter = '';
let searchQuery = '';

export function renderWorkPortal() {
  const user = getCurrentUser();
  const adminMode = isAdmin();

  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">${adminMode ? 'Team Tasks & Work Dispatch' : 'My Work Portal'}</h1>
        <p class="page-subtitle">
          ${adminMode 
            ? 'Assign hardware builds, manage report assignments, and review worker deliverables' 
            : `Welcome, ${user?.name || 'Staff'}. Track your assigned builds, access schematics, and submit deliverables.`}
        </p>
      </div>
      <div class="page-header-actions">
        ${adminMode ? `
          <button class="btn-primary" id="btn-create-task">
            <span class="material-icons-round">add_task</span>
            <span>New Task</span>
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Task Stats -->
    <div class="stats-grid" id="task-stats-grid"></div>

    <!-- Toolbar Filters -->
    <div class="table-container" style="margin-bottom:20px; padding:16px;">
      <div class="table-toolbar" style="margin-bottom:0; flex-wrap:wrap; gap:12px;">
        <div class="table-search" style="min-width:240px; flex:1;">
          <span class="material-icons-round">search</span>
          <input type="text" id="task-search" placeholder="Search tasks, project, type..." />
        </div>
        <div class="table-filters" style="display:flex; gap:10px; flex-wrap:wrap;">
          ${adminMode ? `
            <select class="filter-select" id="task-worker-filter">
              <option value="">All Workers</option>
            </select>
          ` : ''}
          <select class="filter-select" id="task-status-filter">
            <option value="all">All Status</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="review">Ready for Review</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Task Cards Grid -->
    <div id="tasks-container" class="task-cards-grid">
      <div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-tertiary);">
        Loading assigned tasks...
      </div>
    </div>
  `;
}

export async function initWorkPortal() {
  const user = getCurrentUser();
  currentMembers = await getTeamMembers();

  // Populate worker filter for admin
  const workerFilterEl = document.getElementById('task-worker-filter');
  if (workerFilterEl && isAdmin()) {
    workerFilterEl.innerHTML = `<option value="">All Workers</option>` + 
      currentMembers.map(m => `<option value="${m.id}">${m.name} (${m.role})</option>`).join('');
    workerFilterEl.value = workerFilter;
  }

  await loadTasks();
  bindWorkEvents();
}

async function loadTasks() {
  const user = getCurrentUser();
  const filters = {
    search: searchQuery,
    status: statusFilter,
  };

  // If worker, force filter by their worker ID
  if (isWorker() && user) {
    filters.workerId = user.id;
  } else if (isAdmin() && workerFilter) {
    filters.workerId = workerFilter;
  }

  currentTasks = await getWorkTasks(filters);
  renderTaskStats();
  renderTaskCards();
}

function renderTaskStats() {
  const grid = document.getElementById('task-stats-grid');
  if (!grid) return;

  const total = currentTasks.length;
  const inProgress = currentTasks.filter(t => t.status === 'in_progress').length;
  const review = currentTasks.filter(t => t.status === 'review').length;
  const completed = currentTasks.filter(t => t.status === 'completed').length;
  const urgent = currentTasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length;

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon purple">
          <span class="material-icons-round">assignment</span>
        </div>
      </div>
      <div class="stat-card-label">Total Tasks</div>
      <div class="stat-card-value">${total}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon orange">
          <span class="material-icons-round">engineering</span>
        </div>
      </div>
      <div class="stat-card-label">In Progress</div>
      <div class="stat-card-value" style="color:var(--text-warning);">${inProgress}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon blue">
          <span class="material-icons-round">rate_review</span>
        </div>
      </div>
      <div class="stat-card-label">Ready for Review</div>
      <div class="stat-card-value" style="color:var(--accent-primary-light);">${review}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon red">
          <span class="material-icons-round">priority_high</span>
        </div>
      </div>
      <div class="stat-card-label">Urgent Priority</div>
      <div class="stat-card-value" style="color:var(--text-danger);">${urgent}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon green">
          <span class="material-icons-round">task_alt</span>
        </div>
      </div>
      <div class="stat-card-label">Completed</div>
      <div class="stat-card-value" style="color:var(--text-success);">${completed}</div>
    </div>
  `;
}

function renderTaskCards() {
  const container = document.getElementById('tasks-container');
  if (!container) return;

  if (currentTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-state-icon">
          <span class="material-icons-round">assignment_turned_in</span>
        </div>
        <h3>No tasks found</h3>
        <p>${isAdmin() ? 'Create a new task or assign orders from the Project Orders tab.' : 'You currently have no tasks assigned to you. Enjoy your day!'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = currentTasks.map(task => {
    const isUrgent = task.priority === 'urgent';
    const isReview = task.status === 'review';
    const isCompleted = task.status === 'completed';

    // Status label & color
    const statusMap = {
      assigned: { label: 'Assigned', class: 'pending' },
      in_progress: { label: 'In Progress', class: 'in-assembly' },
      review: { label: 'Ready for Review', class: 'completed' },
      completed: { label: 'Completed', class: 'delivered' }
    };
    const sInfo = statusMap[task.status] || { label: task.status, class: 'pending' };

    // Due date calculation
    let dueBadge = '';
    if (task.dueDate) {
      const dueTime = new Date(task.dueDate).getTime();
      const diffDays = Math.ceil((dueTime - Date.now()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 && !isCompleted) {
        dueBadge = `<span style="font-size:0.7rem; color:var(--text-danger); font-weight:700;">🚨 Overdue (${Math.abs(diffDays)}d)</span>`;
      } else if (diffDays === 0 && !isCompleted) {
        dueBadge = `<span style="font-size:0.7rem; color:var(--text-warning); font-weight:700;">⚡ Due Today</span>`;
      } else if (diffDays > 0) {
        dueBadge = `<span style="font-size:0.7rem; color:var(--text-secondary);">Due: ${formatDate(task.dueDate)}</span>`;
      }
    }

    return `
      <div class="task-card ${isReview ? 'review-card' : ''} ${isUrgent ? 'urgent-card' : ''}" data-id="${task.id}">
        <div class="task-card-header">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="status-badge ${sInfo.class}" style="font-size:0.72rem;">${sInfo.label}</span>
            <span class="badge ${isUrgent ? 'badge-urgent' : 'badge-type'}" style="font-size:0.68rem;">
              ${isUrgent ? '🔥 URGENT' : (task.type || 'Hardware')}
            </span>
            ${task.projectId ? `
              <span style="font-size:0.68rem; color:var(--accent-primary-light); font-weight:600;" title="Linked to Project Order #${task.projectId}">
                (Project #${task.projectId})
              </span>
            ` : ''}
          </div>

          ${isAdmin() ? `
            <div class="row-actions">
              <button title="Edit Task" class="btn-icon-sm edit-task" data-id="${task.id}">
                <span class="material-icons-round" style="font-size:16px;">edit</span>
              </button>
              <button title="Delete Task" class="btn-icon-sm delete-task" data-id="${task.id}" style="color:var(--text-danger);">
                <span class="material-icons-round" style="font-size:16px;">delete</span>
              </button>
            </div>
          ` : ''}
        </div>

        <h3 class="task-card-title">${task.title || 'Untitled Task'}</h3>

        ${isAdmin() ? `
          <div style="display:flex; align-items:center; gap:6px; margin: 8px 0; font-size:0.78rem; color:var(--text-secondary);">
            <span class="material-icons-round" style="font-size:15px; color:var(--accent-purple);">badge</span>
            <span>Assigned to: <strong>${task.assignedToName || 'Unassigned'}</strong></span>
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; margin: 6px 0;">
          ${dueBadge || '<span style="font-size:0.7rem; color:var(--text-tertiary);">No deadline set</span>'}
        </div>

        <!-- Description / Specs -->
        ${task.description ? `
          <div class="task-description">
            <strong style="display:block; font-size:0.72rem; color:var(--text-tertiary); margin-bottom:2px;">REQUIREMENTS / BRIEF:</strong>
            ${task.description}
          </div>
        ` : ''}

        <!-- Admin Technical Instructions -->
        ${task.adminNotes ? `
          <div class="task-admin-notes">
            <span class="material-icons-round" style="font-size:14px; vertical-align:middle; color:var(--accent-primary-light);">info</span>
            <span><strong>Admin Note:</strong> ${task.adminNotes}</span>
          </div>
        ` : ''}

        <!-- Reference Links from Admin -->
        ${Array.isArray(task.referenceLinks) && task.referenceLinks.length > 0 ? `
          <div style="margin: 10px 0;">
            <div style="font-size:0.72rem; color:var(--text-tertiary); font-weight:600; margin-bottom:4px;">REFERENCE SCHEMATICS & FILES:</div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              ${task.referenceLinks.map(link => {
                const url = typeof link === 'string' ? link : link.url;
                const label = typeof link === 'object' && link.label ? link.label : url;
                return `
                  <a href="${url}" target="_blank" rel="noopener noreferrer" class="task-link-pill">
                    <span class="material-icons-round" style="font-size:13px;">link</span>
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:280px;">${label}</span>
                  </a>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Worker Deliverables (If submitted) -->
        ${task.deliverableLink ? `
          <div class="task-deliverable-box">
            <div style="font-size:0.72rem; color:var(--accent-green); font-weight:700; margin-bottom:3px; display:flex; align-items:center; gap:4px;">
              <span class="material-icons-round" style="font-size:14px;">cloud_done</span>
              <span>SUBMITTED DELIVERABLE:</span>
            </div>
            <a href="${task.deliverableLink}" target="_blank" rel="noopener noreferrer" style="font-size:0.8rem; color:var(--accent-primary-light); text-decoration:underline; word-break:break-all;">
              ${task.deliverableLink}
            </a>
            ${task.workerNotes ? `<p style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">"${task.workerNotes}"</p>` : ''}
          </div>
        ` : ''}

        <!-- Actions / Workflow Buttons -->
        <div class="task-card-footer">
          <!-- Comments count button -->
          <button class="btn-ghost btn-sm view-comments-btn" data-id="${task.id}" style="color:var(--text-secondary); padding:4px 8px;">
            <span class="material-icons-round" style="font-size:15px;">chat_bubble_outline</span>
            <span>${Array.isArray(task.comments) ? task.comments.length : 0} notes</span>
          </button>

          <!-- Primary Workflow Action -->
          <div>
            ${isAdmin() && isReview ? `
              <div style="display:flex; gap:6px;">
                <button class="btn-secondary btn-sm admin-request-changes" data-id="${task.id}" style="border-color:var(--text-warning); color:var(--text-warning);">
                  <span>Revision</span>
                </button>
                <button class="btn-primary btn-sm admin-approve-task" data-id="${task.id}" style="background:var(--accent-green); border:none;">
                  <span class="material-icons-round" style="font-size:15px;">check</span>
                  <span>Approve</span>
                </button>
              </div>
            ` : `
              <button class="btn-primary btn-sm update-work-btn" data-id="${task.id}">
                <span class="material-icons-round" style="font-size:15px;">${isCompleted ? 'visibility' : 'upload_file'}</span>
                <span>${isCompleted ? 'View Work' : (isReview ? 'Update Submission' : 'Submit / Update')}</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function bindWorkEvents() {
  // Search
  document.getElementById('task-search')?.addEventListener('input', debounce((e) => {
    searchQuery = e.target.value;
    loadTasks();
  }, 250));

  // Status Filter
  document.getElementById('task-status-filter')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    loadTasks();
  });

  // Worker Filter (Admin)
  document.getElementById('task-worker-filter')?.addEventListener('change', (e) => {
    workerFilter = e.target.value;
    loadTasks();
  });

  // Admin Create Task
  document.getElementById('btn-create-task')?.addEventListener('click', () => {
    openTaskModal();
  });

  // Delegated Task Actions
  document.getElementById('tasks-container')?.addEventListener('click', async (e) => {
    const updateBtn = e.target.closest('.update-work-btn');
    const commentsBtn = e.target.closest('.view-comments-btn');
    const approveBtn = e.target.closest('.admin-approve-task');
    const revisionBtn = e.target.closest('.admin-request-changes');
    const editBtn = e.target.closest('.edit-task');
    const deleteBtn = e.target.closest('.delete-task');

    if (updateBtn) {
      const id = parseInt(updateBtn.dataset.id, 10);
      const task = currentTasks.find(t => t.id === id);
      if (task) openSubmitDeliverableModal(task);
      return;
    }

    if (commentsBtn) {
      const id = parseInt(commentsBtn.dataset.id, 10);
      const task = currentTasks.find(t => t.id === id);
      if (task) openCommentsModal(task);
      return;
    }

    if (approveBtn && isAdmin()) {
      const id = parseInt(approveBtn.dataset.id, 10);
      const confirmed = await showConfirm('Approve Task', 'Approve this work as Completed? If linked to a project order, this will mark the project ready.');
      if (confirmed) {
        await updateTaskStatus(id, 'completed');
        showToast('Task approved as Completed!', 'success');
        await loadTasks();
      }
      return;
    }

    if (revisionBtn && isAdmin()) {
      const id = parseInt(revisionBtn.dataset.id, 10);
      const note = prompt('Enter revision feedback for worker:');
      if (note) {
        const user = getCurrentUser();
        await addTaskComment(id, user?.name || 'Admin', `🚨 Revision requested: ${note}`);
        await updateTaskStatus(id, 'in_progress');
        showToast('Sent revision request to worker', 'info');
        await loadTasks();
      }
      return;
    }

    if (editBtn && isAdmin()) {
      const id = parseInt(editBtn.dataset.id, 10);
      const task = currentTasks.find(t => t.id === id);
      if (task) openTaskModal(task);
      return;
    }

    if (deleteBtn && isAdmin()) {
      const id = parseInt(deleteBtn.dataset.id, 10);
      const confirmed = await showConfirm('Delete Task', 'Are you sure you want to delete this task?');
      if (confirmed) {
        await remove('workTasks', id);
        showToast('Task deleted');
        await loadTasks();
      }
      return;
    }
  });
}

/**
 * Worker / Admin Submit Deliverable & Update Status Modal
 */
function openSubmitDeliverableModal(task) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  container.innerHTML = `
    <div class="modal-header">
      <h2><span class="material-icons-round" style="color:var(--accent-primary-light); vertical-align:middle;">upload_file</span> Update Task Deliverable</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <form id="submit-deliverable-form">
      <div class="modal-body">
        <div style="background:var(--bg-tertiary); padding:12px; border-radius:var(--radius-md); margin-bottom:16px;">
          <strong style="color:var(--text-primary); font-size:0.95rem; display:block;">${task.title}</strong>
          <span style="font-size:0.75rem; color:var(--text-secondary);">${task.type || 'Hardware'} • Assigned to ${task.assignedToName || 'You'}</span>
        </div>

        <div class="form-group" style="margin-bottom:14px;">
          <label class="form-label">Deliverable URL (Google Drive, GitHub repo, Video Demo)</label>
          <input class="form-input" type="url" name="deliverableLink" value="${task.deliverableLink || ''}" placeholder="https://drive.google.com/... or https://github.com/..." required />
          <div style="font-size:0.7rem; color:var(--text-tertiary); margin-top:3px;">
            Paste shareable link to completed code, CAD files, report documents, or testing videos.
          </div>
        </div>

        <div class="form-group" style="margin-bottom:14px;">
          <label class="form-label">Worker Notes / Assembly Summary</label>
          <textarea class="form-input" name="workerNotes" rows="3" placeholder="e.g. Code verified on breadboard. Sensors calibrated. Pin configuration attached.">${task.workerNotes || ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Task Status</label>
          <select class="form-input" name="status">
            <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>⚡ In Progress (Working on it)</option>
            <option value="review" ${task.status === 'review' || task.status === 'assigned' ? 'selected' : ''}>🚀 Ready for Review (Submit to Admin)</option>
            ${isAdmin() ? `<option value="completed" ${task.status === 'completed' ? 'selected' : ''}>✅ Completed & Approved</option>` : ''}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn-primary">
          <span class="material-icons-round">save</span>
          <span>Submit Update</span>
        </button>
      </div>
    </form>
  `;

  overlay.classList.remove('hidden');

  const closeFn = () => overlay.classList.add('hidden');
  document.getElementById('modal-close')?.addEventListener('click', closeFn);
  document.getElementById('modal-cancel')?.addEventListener('click', closeFn);

  document.getElementById('submit-deliverable-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const deliverableLink = form.deliverableLink.value.trim();
    const workerNotes = form.workerNotes.value.trim();
    const status = form.status.value;

    try {
      await updateTaskStatus(task.id, status, deliverableLink, workerNotes);
      showToast(status === 'review' ? 'Submitted for Admin Review!' : 'Work updated successfully!', 'success');
      closeFn();
      await loadTasks();
    } catch (err) {
      showToast('Error updating work: ' + err.message, 'error');
    }
  });
}

/**
 * Internal Notes & Chat Thread Modal
 */
function openCommentsModal(task) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const renderComments = () => {
    const comments = Array.isArray(task.comments) ? task.comments : [];
    if (comments.length === 0) {
      return `<div style="text-align:center; padding:20px; color:var(--text-tertiary); font-size:0.85rem;">No notes yet. Add the first instruction or question below.</div>`;
    }
    return comments.map(c => `
      <div style="background:var(--bg-tertiary); padding:10px 12px; border-radius:var(--radius-md); margin-bottom:8px; border:1px solid var(--border-primary);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="font-size:0.78rem; color:var(--accent-primary-light);">${c.author || 'User'}</strong>
          <span style="font-size:0.68rem; color:var(--text-tertiary);">${c.time ? formatDate(c.time) : ''}</span>
        </div>
        <p style="font-size:0.82rem; color:var(--text-primary); margin:0;">${c.text}</p>
      </div>
    `).join('');
  };

  container.innerHTML = `
    <div class="modal-header">
      <h2><span class="material-icons-round" style="color:var(--accent-purple); vertical-align:middle;">chat</span> Task Notes — ${task.title}</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <div class="modal-body">
      <div id="comments-list" style="max-height:280px; overflow-y:auto; margin-bottom:16px;">
        ${renderComments()}
      </div>

      <form id="add-comment-form">
        <div style="display:flex; gap:8px;">
          <input class="form-input" type="text" id="comment-input" placeholder="Type instructions, feedback or question..." style="flex:1;" required />
          <button type="submit" class="btn-primary" style="padding:0 16px;">
            <span class="material-icons-round">send</span>
          </button>
        </div>
      </form>
    </div>
  `;

  overlay.classList.remove('hidden');
  const closeFn = () => overlay.classList.add('hidden');
  document.getElementById('modal-close')?.addEventListener('click', closeFn);

  document.getElementById('add-comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('comment-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    const user = getCurrentUser();
    try {
      const updated = await addTaskComment(task.id, user?.name || 'Staff', text);
      task.comments = updated.comments;
      document.getElementById('comments-list').innerHTML = renderComments();
      input.value = '';
      input.focus();
    } catch (err) {
      showToast('Error adding note: ' + err.message, 'error');
    }
  });
}

/**
 * Admin Create / Edit Standalone Task Modal
 */
async function openTaskModal(task = null) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const members = await getTeamMembers();
  const allProjects = await getAll('projectOrders');

  container.innerHTML = `
    <div class="modal-header">
      <h2><span class="material-icons-round" style="color:var(--accent-primary-light); vertical-align:middle;">add_task</span> ${task ? 'Edit Task' : 'Create New Work Task'}</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <form id="admin-task-form">
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group full-width">
            <label class="form-label">Task Title / Assignment Name *</label>
            <input class="form-input" type="text" name="title" value="${task?.title || ''}" placeholder="e.g. Smart Irrigation ESP32 Assembly or Lab Report 4th Sem" required />
          </div>

          <div class="form-group">
            <label class="form-label">Assign To Worker *</label>
            <select class="form-input" name="assignedToId" required>
              <option value="">Select Worker</option>
              ${members.map(m => `
                <option value="${m.id}" ${task?.assignedToId === m.id ? 'selected' : ''}>
                  ${m.name} (${m.specialty || m.role})
                </option>
              `).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Work Type</label>
            <select class="form-input" name="type">
              <option value="Hardware & IoT" ${task?.type === 'Hardware & IoT' ? 'selected' : ''}>Hardware & IoT Assembly</option>
              <option value="Assignment / Report Writing" ${task?.type === 'Assignment / Report Writing' ? 'selected' : ''}>Assignment / Report Writing</option>
              <option value="Firmware / Coding" ${task?.type === 'Firmware / Coding' ? 'selected' : ''}>Firmware / Coding</option>
              <option value="General Assembly" ${task?.type === 'General Assembly' ? 'selected' : ''}>General Assembly & Testing</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Link to Project Order (Optional)</label>
            <select class="form-input" name="projectId">
              <option value="">None (Standalone Assignment / Task)</option>
              ${allProjects.map(p => `
                <option value="${p.id}" ${task?.projectId === p.id ? 'selected' : ''}>
                  #${p.id} — ${p.projectName || p.name}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Task Priority</label>
            <select class="form-input" name="priority">
              <option value="standard" ${task?.priority === 'standard' ? 'selected' : ''}>⚡ Standard (2-3 Days)</option>
              <option value="urgent" ${task?.priority === 'urgent' ? 'selected' : ''}>🔥 Urgent / Express (Deliver Today)</option>
              <option value="relaxed" ${task?.priority === 'relaxed' ? 'selected' : ''}>🌱 Relaxed</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Worker Due Date</label>
            <input class="form-input" type="date" name="dueDate" value="${task?.dueDate || ''}" />
          </div>

          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-input" name="status">
              <option value="assigned" ${task?.status === 'assigned' ? 'selected' : ''}>Assigned</option>
              <option value="in_progress" ${task?.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
              <option value="review" ${task?.status === 'review' ? 'selected' : ''}>Ready for Review</option>
              <option value="completed" ${task?.status === 'completed' ? 'selected' : ''}>Completed</option>
            </select>
          </div>

          <div class="form-group full-width">
            <label class="form-label">Reference Schematics / Files Link (Drive, GitHub, PDF)</label>
            <input class="form-input" type="url" name="referenceLink" value="${(task?.referenceLinks && task.referenceLinks[0]) || ''}" placeholder="https://drive.google.com/... or https://github.com/..." />
          </div>

          <div class="form-group full-width">
            <label class="form-label">Customer Requirements / Technical Specifications</label>
            <textarea class="form-input" name="description" rows="2" placeholder="Functional requirements for the worker (no financial details)...">${task?.description || ''}</textarea>
          </div>

          <div class="form-group full-width">
            <label class="form-label">Admin Special Instructions / Pinout Notes</label>
            <textarea class="form-input" name="adminNotes" rows="2" placeholder="e.g. Ensure pin D4 is used for relay, solder capacitor across VCC/GND">${task?.adminNotes || ''}</textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn-primary">
          <span class="material-icons-round">save</span>
          <span>${task ? 'Save Changes' : 'Create Task'}</span>
        </button>
      </div>
    </form>
  `;

  overlay.classList.remove('hidden');

  const closeFn = () => overlay.classList.add('hidden');
  document.getElementById('modal-close')?.addEventListener('click', closeFn);
  document.getElementById('modal-cancel')?.addEventListener('click', closeFn);

  document.getElementById('admin-task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const workerId = parseInt(form.assignedToId.value, 10);
    const worker = members.find(m => m.id === workerId);
    const projId = form.projectId.value ? parseInt(form.projectId.value, 10) : null;
    const refLink = form.referenceLink.value.trim();

    const taskData = {
      title: form.title.value.trim(),
      assignedToId: workerId,
      assignedToName: worker ? worker.name : 'Unknown',
      assignedBy: 'Admin',
      type: form.type.value,
      projectId: projId,
      priority: form.priority.value,
      dueDate: form.dueDate.value,
      status: form.status.value,
      description: form.description.value.trim(),
      adminNotes: form.adminNotes.value.trim(),
      referenceLinks: refLink ? [refLink] : [],
      updatedAt: new Date().toISOString()
    };

    try {
      if (task) {
        taskData.id = task.id;
        taskData.createdAt = task.createdAt || new Date().toISOString();
        taskData.deliverableLink = task.deliverableLink || '';
        taskData.workerNotes = task.workerNotes || '';
        taskData.comments = task.comments || [];
        await update('workTasks', taskData);
        showToast('Task updated successfully!', 'success');
      } else {
        taskData.createdAt = new Date().toISOString();
        taskData.deliverableLink = '';
        taskData.workerNotes = '';
        taskData.comments = [];
        await add('workTasks', taskData);
        showToast('Task created and assigned!', 'success');
      }
      closeFn();
      await loadTasks();
    } catch (err) {
      showToast('Error saving task: ' + err.message, 'error');
    }
  });
}

/**
 * Assignment & Creative Orders Page — CRUD for reports, black books, posters & handwritten assignments
 * Includes worker delegation, out-of-pocket printing costs, WhatsApp updates & aging alerts
 */
import {
  getAssignmentOrders, getAssignmentStats, add, update, remove, getAll,
  syncAssignmentTask, restoreFromTrash
} from '../db.js';
import {
  formatCurrency, formatDate, normalizeStatus, getStatusLabel,
  showToast, showConfirm, debounce, formatDateForInput,
  sanitizePhoneForWhatsApp, getPaymentAging, showUndoToast
} from '../utils.js';

let currentOrders = [];
let currentPage = 1;
const pageSize = 15;
let searchQuery = '';
let categoryFilter = 'all';
let statusFilter = 'all';

export function renderAssignments() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Assignment & Creative Orders</h1>
        <p class="page-subtitle">Track project reports, black books, synopsis, posters, banners, and handwritten lab journals</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-primary" id="btn-add-assignment">
          <span class="material-icons-round">add</span>
          <span>New Creative Order</span>
        </button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid" id="assignment-stats-grid"></div>

    <!-- Table Container -->
    <div class="table-container">
      <div class="table-toolbar">
        <div class="table-search">
          <span class="material-icons-round">search</span>
          <input type="text" id="assignment-search" placeholder="Search customer, topic, category, phone..." />
        </div>
        <div class="table-filters">
          <select class="filter-select" id="assignment-category-filter">
            <option value="all">All Categories</option>
            <option value="Project Report / Black Book / Synopsis">Project Report / Black Book</option>
            <option value="Handwritten Assignment / Journal">Handwritten Assignment / Journal</option>
            <option value="PPT Presentation & Slides">PPT Presentation & Slides</option>
            <option value="Poster / Banner / Graphic Design">Poster / Banner Design</option>
            <option value="3D Enclosure Printing & Laser Cutting">3D Printing & Enclosure</option>
            <option value="Custom Research Paper">Research Paper</option>
          </select>
          <select class="filter-select" id="assignment-status-filter">
            <option value="all">All Status</option>
            <option value="aging-7">⏰ Overdue (>7 Days)</option>
            <option value="aging-14">🚨 Critical (>14 Days)</option>
            <option value="pending">Pending</option>
            <option value="in_progress">Writing / Designing</option>
            <option value="printing">Printing / Binding</option>
            <option value="completed">Completed</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
      </div>

      <div class="table-scroll">
        <table class="data-table" id="assignment-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Topic / Title</th>
              <th>Category</th>
              <th>Pages / Specs</th>
              <th>Due Date</th>
              <th>Total</th>
              <th>Received</th>
              <th>Pending</th>
              <th>Print Cost</th>
              <th>Net Profit</th>
              <th>Assigned</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="assignment-tbody"></tbody>
        </table>
      </div>

      <div class="table-pagination" id="assignment-pagination"></div>
    </div>
  `;
}

export async function initAssignments() {
  await loadAssignmentOrders();
  renderAssignmentStats();
  bindAssignmentEvents();
}

async function loadAssignmentOrders() {
  const isAgingFilter = statusFilter === 'aging-7' || statusFilter === 'aging-14';
  const backendFilter = isAgingFilter ? 'all' : statusFilter;

  let orders = await getAssignmentOrders({
    search: searchQuery,
    category: categoryFilter,
    status: backendFilter
  });

  if (statusFilter === 'aging-7') {
    orders = orders.filter(o => !!getPaymentAging(o));
  } else if (statusFilter === 'aging-14') {
    orders = orders.filter(o => getPaymentAging(o)?.level === 'critical');
  }

  currentOrders = orders;
  renderAssignmentTable();
}

function renderAssignmentStats() {
  getAssignmentStats().then(stats => {
    const grid = document.getElementById('assignment-stats-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon purple">
            <span class="material-icons-round">draw</span>
          </div>
        </div>
        <div class="stat-card-label">Total Creative Orders</div>
        <div class="stat-card-value">${stats.totalOrders} <span style="font-size:0.75rem; color:var(--text-tertiary); font-weight:normal;">(${stats.activeCount} active)</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon green">
            <span class="material-icons-round">payments</span>
          </div>
        </div>
        <div class="stat-card-label">Total Billed Revenue</div>
        <div class="stat-card-value">${formatCurrency(stats.totalRevenue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon blue">
            <span class="material-icons-round">account_balance_wallet</span>
          </div>
        </div>
        <div class="stat-card-label">Advance Received</div>
        <div class="stat-card-value">${formatCurrency(stats.totalReceived)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon orange">
            <span class="material-icons-round">pending</span>
          </div>
        </div>
        <div class="stat-card-label">Pending Client Balance</div>
        <div class="stat-card-value" style="color:var(--text-warning);">${formatCurrency(stats.totalPending)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon red">
            <span class="material-icons-round">print</span>
          </div>
        </div>
        <div class="stat-card-label">Printing / Binding Cost</div>
        <div class="stat-card-value">${formatCurrency(stats.totalOutOfPocket)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon green">
            <span class="material-icons-round">trending_up</span>
          </div>
        </div>
        <div class="stat-card-label">Net Profit</div>
        <div class="stat-card-value" style="color:var(--text-success);">${formatCurrency(stats.totalProfit)}</div>
      </div>
    `;
  });
}

function renderAssignmentTable() {
  const tbody = document.getElementById('assignment-tbody');
  if (!tbody) return;

  const start = (currentPage - 1) * pageSize;
  const pageOrders = currentOrders.slice(start, start + pageSize);

  if (pageOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13">
          <div class="empty-state">
            <div class="empty-state-icon">
              <span class="material-icons-round">draw</span>
            </div>
            <h3>No assignment or creative orders found</h3>
            <p>Create your first project report, black book, or handwritten assignment order.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageOrders.map(order => {
    const status = normalizeStatus(order.status || 'pending');
    const price = parseFloat(order.totalPrice) || 0;
    const rec = parseFloat(order.received) || 0;
    const balance = parseFloat(order.balance !== undefined ? order.balance : (price - rec)) || 0;
    const printCost = parseFloat(order.outOfPocketCost) || 0;
    const profit = parseFloat(order.netProfit) || (price - printCost);

    const aging = getPaymentAging({ balance, orderDate: order.orderDate || order.createdAt });

    return `
      <tr data-id="${order.id}">
        <td class="cell-name">
          <div style="font-weight:600;">${order.customerName || '—'}</div>
          ${order.contactNo ? `<div style="font-size:0.75rem; color:var(--text-secondary);">${order.contactNo}</div>` : ''}
        </td>
        <td>
          <div style="font-weight:600; max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${order.title}">
            ${order.title || 'Untitled'}
          </div>
        </td>
        <td>
          <span class="badge badge-type" style="font-size:0.7rem;">${order.serviceCategory || 'Report'}</span>
        </td>
        <td style="font-size:0.78rem;">
          <div>${order.pageCount ? `<strong>${order.pageCount}</strong> pages/qty` : '—'}</div>
          <div style="font-size:0.7rem; color:var(--text-tertiary);">${order.bindingType || ''} ${order.paperType ? '• ' + order.paperType : ''}</div>
        </td>
        <td class="cell-secondary">${formatDate(order.dueDate)}</td>
        <td class="cell-money">${formatCurrency(price)}</td>
        <td class="cell-money positive">${formatCurrency(rec)}</td>
        <td class="cell-money ${balance > 0 ? 'negative' : ''}">
          <div>${formatCurrency(balance)}</div>
          ${aging ? `
            <div style="margin-top:2px;">
              <span style="font-size:0.65rem; padding:1px 5px; border-radius:4px; font-weight:700; background:${aging.level === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}; color:${aging.level === 'critical' ? 'var(--text-danger)' : 'var(--text-warning)'};">
                ${aging.label}
              </span>
            </div>
          ` : ''}
        </td>
        <td class="cell-money">${formatCurrency(printCost)}</td>
        <td class="cell-money ${profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(profit)}</td>
        <td>
          ${order.assignedWorkerName ? `
            <span class="badge" style="font-size:0.68rem; background:rgba(139,92,246,0.12); color:var(--accent-purple); border:1px solid rgba(139,92,246,0.25);">
              <span class="material-icons-round" style="font-size:11px;">person</span>
              <span>${order.assignedWorkerName}</span>
            </span>
          ` : '<span style="font-size:0.7rem; color:var(--text-tertiary);">Unassigned</span>'}
        </td>
        <td><span class="status-badge ${status}">${getStatusLabel(status)}</span></td>
        <td>
          <div class="row-actions">
            ${order.contactNo ? `
              <button title="WhatsApp Customer" class="whatsapp-assignment" data-id="${order.id}" style="color:#25D366">
                <span class="material-icons-round">chat</span>
              </button>
            ` : ''}
            <button title="Edit" class="edit-assignment" data-id="${order.id}">
              <span class="material-icons-round">edit</span>
            </button>
            <button title="Delete" class="delete delete-assignment" data-id="${order.id}">
              <span class="material-icons-round">delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderPagination();
}

function renderPagination() {
  const container = document.getElementById('assignment-pagination');
  if (!container) return;

  const totalPages = Math.ceil(currentOrders.length / pageSize);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, currentOrders.length);

  container.innerHTML = `
    <div class="pagination-info">
      Showing ${currentOrders.length > 0 ? start : 0}–${end} of ${currentOrders.length} orders
    </div>
    <div class="pagination-controls">
      <button ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">
        <span class="material-icons-round">chevron_left</span>
      </button>
      ${Array.from({ length: totalPages }, (_, i) => i + 1).map(p => `
        <button class="${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>
      `).join('')}
      <button ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">
        <span class="material-icons-round">chevron_right</span>
      </button>
    </div>
  `;

  container.querySelectorAll('.pagination-controls button').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (page && page >= 1 && page <= totalPages) {
        currentPage = page;
        renderAssignmentTable();
      }
    });
  });
}

function bindAssignmentEvents() {
  document.getElementById('assignment-search')?.addEventListener('input', debounce((e) => {
    searchQuery = e.target.value;
    currentPage = 1;
    loadAssignmentOrders();
  }, 250));

  document.getElementById('assignment-category-filter')?.addEventListener('change', (e) => {
    categoryFilter = e.target.value;
    currentPage = 1;
    loadAssignmentOrders();
  });

  document.getElementById('assignment-status-filter')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    currentPage = 1;
    loadAssignmentOrders();
  });

  document.getElementById('btn-add-assignment')?.addEventListener('click', () => {
    openAssignmentModal();
  });

  document.getElementById('assignment-tbody')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-assignment');
    const deleteBtn = e.target.closest('.delete-assignment');
    const whatsappBtn = e.target.closest('.whatsapp-assignment');

    if (whatsappBtn) {
      const id = parseInt(whatsappBtn.dataset.id, 10);
      const order = currentOrders.find(o => o.id === id);
      if (order) openAssignmentWhatsAppDialog(order);
      return;
    }

    if (editBtn) {
      const id = parseInt(editBtn.dataset.id, 10);
      const order = currentOrders.find(o => o.id === id);
      if (order) openAssignmentModal(order);
      return;
    }

    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id, 10);
      const order = currentOrders.find(o => o.id === id);
      const confirmed = await showConfirm('Delete Creative Order', `Are you sure you want to delete order #${id} (${order?.title || ''})?`);
      if (confirmed) {
        const res = await remove('assignmentOrders', id);
        showToast('Order deleted');
        await loadAssignmentOrders();
        renderAssignmentStats();

        showUndoToast(`Deleted assignment #${id} (${order?.title || ''})`, async () => {
          if (res?.trashRecordId) {
            await restoreFromTrash(res.trashRecordId);
            showToast(`Restored order #${id}!`, 'success');
            await loadAssignmentOrders();
            renderAssignmentStats();
          }
        });
      }
    }
  });
}

/**
 * 1-Click WhatsApp Client Dialog for Assignment Orders
 */
function openAssignmentWhatsAppDialog(order) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const cleanPhone = sanitizePhoneForWhatsApp(order.contactNo);
  const balance = parseFloat(order.balance) || 0;

  const msgReady = `Hi ${order.customerName}! Your file/assignment "${order.title}" has been completed, printed & bound! Ready for pickup. Remaining balance: ${formatCurrency(balance)}. Thanks, Project Mafia.`;
  const msgReminder = `Hi ${order.customerName}, payment reminder regarding your assignment/project documentation "${order.title}". Outstanding balance: ${formatCurrency(balance)}. Thanks!`;

  container.innerHTML = `
    <div class="modal-header">
      <h2><span class="material-icons-round" style="color:#25D366; vertical-align:middle;">chat</span> WhatsApp — ${order.customerName}</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <div class="modal-body">
      <p style="color:var(--text-secondary); margin-bottom:16px;">Send WhatsApp message to <strong>+${cleanPhone}</strong>:</p>
      
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="background:var(--bg-tertiary); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
          <strong style="color:var(--accent-green); display:block; margin-bottom:6px;">Option 1: Order Ready & Bound</strong>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:10px;">"${msgReady}"</p>
          <a href="https://wa.me/${cleanPhone}?text=${encodeURIComponent(msgReady)}" target="_blank" class="btn-primary" style="background:#25D366; border:none; color:white; display:inline-flex;">
            <span class="material-icons-round">send</span>
            <span>Send Order Ready</span>
          </a>
        </div>

        ${balance > 0 ? `
          <div style="background:var(--bg-tertiary); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
            <strong style="color:var(--text-warning); display:block; margin-bottom:6px;">Option 2: Payment Reminder (${formatCurrency(balance)})</strong>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:10px;">"${msgReminder}"</p>
            <a href="https://wa.me/${cleanPhone}?text=${encodeURIComponent(msgReminder)}" target="_blank" class="btn-primary" style="background:#25D366; border:none; color:white; display:inline-flex;">
              <span class="material-icons-round">send</span>
              <span>Send Payment Reminder</span>
            </a>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  overlay.classList.remove('hidden');
  document.getElementById('modal-close')?.addEventListener('click', () => overlay.classList.add('hidden'));
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
}

/**
 * Add / Edit Modal for Assignment & Creative Orders
 */
export async function openAssignmentModal(order = null) {
  const isEdit = !!order;
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const teamMembers = await getAll('teamMembers');

  container.innerHTML = `
    <div class="modal-header">
      <h2><span class="material-icons-round" style="color:var(--accent-primary-light); vertical-align:middle;">draw</span> ${isEdit ? 'Edit Creative Order' : 'New Assignment / Creative Order'}</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <form id="assignment-form">
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Customer Name *</label>
            <input class="form-input" type="text" name="customerName" value="${order?.customerName || ''}" placeholder="Student / Client Name" required />
          </div>

          <div class="form-group">
            <label class="form-label">Phone / WhatsApp *</label>
            <input class="form-input" type="text" name="contactNo" value="${order?.contactNo || ''}" placeholder="10-digit mobile" required />
          </div>

          <div class="form-group full-width">
            <label class="form-label">Order Title / Topic *</label>
            <input class="form-input" type="text" name="title" value="${order?.title || ''}" placeholder="e.g. Embedded Systems Lab Report 4th Sem or Smart City Poster A2" required />
          </div>

          <div class="form-group">
            <label class="form-label">Service Category</label>
            <select class="form-select" name="serviceCategory">
              <option value="Project Report / Black Book / Synopsis" ${order?.serviceCategory === 'Project Report / Black Book / Synopsis' ? 'selected' : ''}>Project Report / Black Book / Synopsis</option>
              <option value="Handwritten Assignment / Journal" ${order?.serviceCategory === 'Handwritten Assignment / Journal' ? 'selected' : ''}>Handwritten Assignment / Journal</option>
              <option value="PPT Presentation & Slides" ${order?.serviceCategory === 'PPT Presentation & Slides' ? 'selected' : ''}>PPT Presentation & Slides</option>
              <option value="Poster / Banner / Graphic Design" ${order?.serviceCategory === 'Poster / Banner / Graphic Design' ? 'selected' : ''}>Poster / Banner / Graphic Design</option>
              <option value="3D Enclosure Printing & Laser Cutting" ${order?.serviceCategory === '3D Enclosure Printing & Laser Cutting' ? 'selected' : ''}>3D Enclosure Printing & Laser Cutting</option>
              <option value="Custom Research Paper" ${order?.serviceCategory === 'Custom Research Paper' ? 'selected' : ''}>Custom Research Paper</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Page Count / Quantity</label>
            <input class="form-input" type="text" name="pageCount" value="${order?.pageCount || ''}" placeholder="e.g. 35 Pages, 2 Copies" />
          </div>

          <div class="form-group">
            <label class="form-label">Binding Type</label>
            <select class="form-select" name="bindingType">
              <option value="Spiral Binding" ${order?.bindingType === 'Spiral Binding' ? 'selected' : ''}>Spiral Binding</option>
              <option value="Hardbound Black Book (Golden Emboss)" ${order?.bindingType === 'Hardbound Black Book (Golden Emboss)' ? 'selected' : ''}>Hardbound Black Book (Golden Emboss)</option>
              <option value="Soft Stapled & Taped" ${order?.bindingType === 'Soft Stapled & Taped' ? 'selected' : ''}>Soft Stapled & Taped</option>
              <option value="Plastic File Folder" ${order?.bindingType === 'Plastic File Folder' ? 'selected' : ''}>Plastic File Folder</option>
              <option value="None / Digital Copy Only" ${order?.bindingType === 'None / Digital Copy Only' ? 'selected' : ''}>None / Digital Copy Only</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Paper Type / Material</label>
            <select class="form-select" name="paperType">
              <option value="A4 Plain 75 GSM" ${order?.paperType === 'A4 Plain 75 GSM' ? 'selected' : ''}>A4 Plain 75 GSM</option>
              <option value="A4 Executive Bond 85 GSM" ${order?.paperType === 'A4 Executive Bond 85 GSM' ? 'selected' : ''}>A4 Executive Bond 85 GSM</option>
              <option value="A4 Ruled Assignment Sheets" ${order?.paperType === 'A4 Ruled Assignment Sheets' ? 'selected' : ''}>A4 Ruled Assignment Sheets</option>
              <option value="Glossy Photo Paper 250 GSM" ${order?.paperType === 'Glossy Photo Paper 250 GSM' ? 'selected' : ''}>Glossy Photo Paper 250 GSM</option>
              <option value="Flex Vinyl (For Posters)" ${order?.paperType === 'Flex Vinyl (For Posters)' ? 'selected' : ''}>Flex Vinyl (For Posters)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Total Agreed Price (₹) *</label>
            <input class="form-input" type="number" step="0.01" name="totalPrice" id="assign-price" value="${order?.totalPrice || ''}" placeholder="Total client payment" required />
          </div>

          <div class="form-group">
            <label class="form-label">Advance Received (₹)</label>
            <input class="form-input" type="number" step="0.01" name="received" id="assign-received" value="${order?.received || ''}" placeholder="Amount paid" />
          </div>

          <div class="form-group">
            <label class="form-label">Printing / Binding / Direct Cost (₹)</label>
            <input class="form-input" type="number" step="0.01" name="outOfPocketCost" id="assign-cost" value="${order?.outOfPocketCost || ''}" placeholder="Printer shop charges / sheets cost" />
          </div>

          <div class="form-group">
            <label class="form-label">Order Due Date *</label>
            <input class="form-input" type="date" name="dueDate" value="${formatDateForInput(order?.dueDate) || new Date().toISOString().split('T')[0]}" required />
          </div>

          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" name="status">
              <option value="pending" ${order?.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="in_progress" ${order?.status === 'in_progress' ? 'selected' : ''}>Writing / Designing</option>
              <option value="printing" ${order?.status === 'printing' ? 'selected' : ''}>Printing / Binding</option>
              <option value="completed" ${order?.status === 'completed' ? 'selected' : ''}>Completed & Ready</option>
              <option value="delivered" ${order?.status === 'delivered' ? 'selected' : ''}>Delivered</option>
            </select>
          </div>

          <!-- WORKER / WRITER DELEGATION SECTION -->
          <div class="form-group full-width" style="background:var(--bg-tertiary); padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-primary); margin-top:8px;">
            <div style="font-weight:700; color:var(--text-primary); font-size:0.92rem; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
              <span class="material-icons-round" style="color:var(--accent-purple); font-size:20px;">edit_note</span>
              <span>Assign Writer / Designer (Delegation)</span>
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
              <div>
                <label class="form-label">Assign Worker / Writer</label>
                <select class="form-select" name="assignedWorkerId">
                  <option value="">— Unassigned (Admin or Self) —</option>
                  ${teamMembers.map(m => `
                    <option value="${m.id}" ${order?.assignedWorkerId === m.id ? 'selected' : ''}>
                      ${m.name} (${m.specialty || m.role})
                    </option>
                  `).join('')}
                </select>
              </div>

              <div>
                <label class="form-label">Worker Internal Deadline</label>
                <input class="form-input" type="date" name="workerDeadline" value="${formatDateForInput(order?.workerDeadline || order?.dueDate)}" />
              </div>

              <div>
                <label class="form-label">Priority</label>
                <select class="form-select" name="workerPriority">
                  <option value="standard" ${order?.workerPriority === 'standard' ? 'selected' : ''}>⚡ Standard (2-3 Days)</option>
                  <option value="urgent" ${order?.workerPriority === 'urgent' ? 'selected' : ''}>🔥 Urgent (Deliver Today)</option>
                  <option value="relaxed" ${order?.workerPriority === 'relaxed' ? 'selected' : ''}>🌱 Relaxed</option>
                </select>
              </div>
            </div>

            <div style="margin-top:12px;">
              <label class="form-label">Reference Prompt / Syllabus / Drive Link</label>
              <input class="form-input" type="url" name="referenceLinks" value="${order?.referenceLinks || ''}" placeholder="https://drive.google.com/... or assignment prompt link" />
            </div>

            <div style="margin-top:12px;">
              <label class="form-label">Writer Instructions & Formatting Guidelines (Zero Financials)</label>
              <textarea class="form-input" name="instructions" rows="2" placeholder="e.g. Include 4 references, IEEE format, times new roman 12pt, 1.5 line spacing...">${order?.instructions || ''}</textarea>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
        <button type="submit" class="btn-primary">
          <span class="material-icons-round">save</span>
          <span>${isEdit ? 'Save Changes' : 'Create Order'}</span>
        </button>
      </div>
    </form>
  `;

  overlay.classList.remove('hidden');
  const closeFn = () => overlay.classList.add('hidden');
  document.getElementById('modal-close')?.addEventListener('click', closeFn);
  document.getElementById('modal-cancel')?.addEventListener('click', closeFn);

  document.getElementById('assignment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    const price = parseFloat(data.totalPrice) || 0;
    const rec = parseFloat(data.received) || 0;
    const cost = parseFloat(data.outOfPocketCost) || 0;

    data.totalPrice = price;
    data.received = rec;
    data.outOfPocketCost = cost;
    data.balance = price - rec;
    data.netProfit = price - cost;

    const workerId = data.assignedWorkerId ? parseInt(data.assignedWorkerId, 10) : null;
    const assignedWorker = teamMembers.find(m => m.id === workerId);
    data.assignedWorkerId = workerId;
    data.assignedWorkerName = assignedWorker ? assignedWorker.name : '';

    try {
      let savedId;
      if (isEdit) {
        data.id = order.id;
        data.createdAt = order.createdAt;
        data.orderDate = order.orderDate || new Date().toISOString().split('T')[0];
        await update('assignmentOrders', data);
        savedId = order.id;
        showToast('Creative Order updated!', 'success');
      } else {
        data.orderDate = new Date().toISOString().split('T')[0];
        data.createdAt = new Date().toISOString();
        savedId = await add('assignmentOrders', data);
        data.id = savedId;
        showToast('New Creative Order added!', 'success');
      }

      // Sync delegation task for worker
      try {
        await syncAssignmentTask(data);
      } catch (err) {
        console.warn('Sync assignment task error:', err);
      }

      closeFn();
      await loadAssignmentOrders();
      renderAssignmentStats();
    } catch (err) {
      showToast('Error saving creative order: ' + err.message, 'error');
    }
  });
}

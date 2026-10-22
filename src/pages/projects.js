/**
 * Project Orders Page — CRUD for project orders
 * With Auto-sync wholesale material pricing, manual misc expenses, WhatsApp notifications, and box slips
 */
import { getProjectOrders, add, update, remove, getProjectStats, getAll, linkProjectToMaterial, resetProjectOrdersToSeed } from '../db.js';
import { seedProjectOrders } from '../seedData.js';
import {
  formatCurrency, formatDate, normalizeStatus, getStatusLabel,
  showToast, showConfirm, debounce, formatDateForInput
} from '../utils.js';

let currentOrders = [];
let currentPage = 1;
const pageSize = 15;
let searchQuery = '';
let statusFilter = '';
let sortBy = 'orderDate';
let sortDir = 'desc';

export function renderProjectOrders() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Project Orders</h1>
        <p class="page-subtitle">Manage customer project orders, wholesale procurement costs, payments, and delivery status</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-primary" id="btn-add-project">
          <span class="material-icons-round">add</span>
          <span>New Order</span>
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" id="project-stats-grid"></div>

    <!-- Table -->
    <div class="table-container">
      <div class="table-toolbar">
        <div class="table-search">
          <span class="material-icons-round">search</span>
          <input type="text" id="project-search" placeholder="Search by name, project, phone..." />
        </div>
        <div class="table-filters">
          <select class="filter-select" id="project-status-filter">
            <option value="">All Status</option>
            <option value="delivered">Delivered</option>
            <option value="completed">Completed</option>
            <option value="in-assembly">In Assembly</option>
            <option value="waiting">Waiting for Material</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      <div class="table-scroll">
        <table class="data-table" id="project-table">
          <thead>
            <tr>
              <th data-sort="name">Name <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="projectName">Project <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="payment">Payment <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="received">Received <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="pending">Pending <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="orderDate">Order Date <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="dueDate">Due Date <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="materialCost">Wholesale Cost <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="miscExpenses">Misc Exp <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="profit">Profit <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th data-sort="status">Status <span class="material-icons-round sort-icon">unfold_more</span></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="project-tbody"></tbody>
        </table>
      </div>

      <div class="table-pagination" id="project-pagination"></div>
    </div>
  `;
}

export async function initProjectOrders() {
  await loadProjectOrders();
  renderProjectStats();
  bindProjectEvents();
}

async function loadProjectOrders() {
  currentOrders = await getProjectOrders({
    search: searchQuery,
    status: statusFilter,
    sortBy,
    sortDir,
  });

  renderProjectTable();
}

function renderProjectStats() {
  getProjectStats().then(stats => {
    const grid = document.getElementById('project-stats-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon purple">
            <span class="material-icons-round">inventory_2</span>
          </div>
        </div>
        <div class="stat-card-label">Total Projects</div>
        <div class="stat-card-value">${stats.totalOrders}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon green">
            <span class="material-icons-round">payments</span>
          </div>
        </div>
        <div class="stat-card-label">Order Value</div>
        <div class="stat-card-value">${formatCurrency(stats.totalOrderValue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon blue">
            <span class="material-icons-round">account_balance_wallet</span>
          </div>
        </div>
        <div class="stat-card-label">Received</div>
        <div class="stat-card-value">${formatCurrency(stats.totalReceived)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon orange">
            <span class="material-icons-round">pending</span>
          </div>
        </div>
        <div class="stat-card-label">Pending Balance</div>
        <div class="stat-card-value" style="color: var(--text-warning)">${formatCurrency(stats.totalPending)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon red">
            <span class="material-icons-round">precision_manufacturing</span>
          </div>
        </div>
        <div class="stat-card-label">Material Cost</div>
        <div class="stat-card-value">${formatCurrency(stats.totalMaterialCost)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon orange">
            <span class="material-icons-round">receipt_long</span>
          </div>
        </div>
        <div class="stat-card-label">Misc Expenses</div>
        <div class="stat-card-value" style="color: var(--text-secondary)">${formatCurrency(stats.totalMiscExpenses)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon green">
            <span class="material-icons-round">trending_up</span>
          </div>
        </div>
        <div class="stat-card-label">Total Profit</div>
        <div class="stat-card-value" style="color: var(--text-success)">${formatCurrency(stats.totalProfit)}</div>
      </div>
    `;
  });
}

function renderProjectTable() {
  const tbody = document.getElementById('project-tbody');
  if (!tbody) return;

  const start = (currentPage - 1) * pageSize;
  const pageOrders = currentOrders.slice(start, start + pageSize);

  if (pageOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="empty-state">
            <div class="empty-state-icon">
              <span class="material-icons-round">inventory_2</span>
            </div>
            <h3>No project orders found</h3>
            <p>Add your first project order to get started!</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageOrders.map(order => {
    const status = normalizeStatus(order.status);
    const pending = parseFloat(order.pending) || 0;
    const profit = parseFloat(order.profit) || 0;
    const misc = parseFloat(order.miscExpenses) || 0;

    return `
      <tr data-id="${order.id}">
        <td class="cell-name">${order.name || '—'}</td>
        <td>
          <div style="font-weight:600;">${order.projectName || '—'}</div>
          ${order.materialOrderId ? `<span style="font-size:0.7rem; color:var(--accent-purple); display:flex; align-items:center; gap:3px;"><span class="material-icons-round" style="font-size:12px;">link</span> Wholesale Auto-Linked</span>` : ''}
        </td>
        <td class="cell-money">${formatCurrency(order.payment)}</td>
        <td class="cell-money positive">${formatCurrency(order.received)}</td>
        <td class="cell-money ${pending > 0 ? 'negative' : ''}">${formatCurrency(order.pending)}</td>
        <td class="cell-secondary">${formatDate(order.orderDate)}</td>
        <td class="cell-secondary">${formatDate(order.dueDate)}</td>
        <td class="cell-money">${formatCurrency(order.materialCost)}</td>
        <td class="cell-money" style="color:var(--text-tertiary)">${formatCurrency(misc)}</td>
        <td class="cell-money ${profit >= 0 ? 'positive' : 'negative'}"><strong>${formatCurrency(order.profit)}</strong></td>
        <td><span class="status-badge ${status}">${getStatusLabel(status)}</span></td>
        <td>
          <div class="row-actions">
            ${order.phone ? `
              <button title="WhatsApp Client Reminder" class="btn-whatsapp whatsapp-project" data-id="${order.id}">
                <span class="material-icons-round">chat</span>
              </button>
            ` : ''}
            <button title="Print Hardware Box Slip" class="btn-box-slip print-slip-project" data-id="${order.id}">
              <span class="material-icons-round">receipt</span>
            </button>
            <button title="Edit" class="edit-project" data-id="${order.id}">
              <span class="material-icons-round">edit</span>
            </button>
            <button title="Delete" class="delete delete-project" data-id="${order.id}">
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
  const container = document.getElementById('project-pagination');
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
        renderProjectTable();
      }
    });
  });
}

function bindProjectEvents() {
  // Search
  const searchInput = document.getElementById('project-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      searchQuery = e.target.value;
      currentPage = 1;
      loadProjectOrders();
    }, 250));
  }

  // Status filter
  const statusFilterEl = document.getElementById('project-status-filter');
  if (statusFilterEl) {
    statusFilterEl.addEventListener('change', (e) => {
      statusFilter = e.target.value;
      currentPage = 1;
      loadProjectOrders();
    });
  }

  // Add button
  document.getElementById('btn-add-project')?.addEventListener('click', () => {
    openProjectModal();
  });

  // Sort
  document.querySelectorAll('#project-table thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortBy === field) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortBy = field;
        sortDir = 'asc';
      }
      loadProjectOrders();
    });
  });

  // Delegate actions
  document.getElementById('project-tbody')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-project');
    const deleteBtn = e.target.closest('.delete-project');
    const whatsappBtn = e.target.closest('.whatsapp-project');
    const slipBtn = e.target.closest('.print-slip-project');

    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      const order = currentOrders.find(o => o.id === id);
      if (order) openProjectModal(order);
    }

    if (whatsappBtn) {
      const id = parseInt(whatsappBtn.dataset.id);
      const order = currentOrders.find(o => o.id === id);
      if (order) openWhatsAppDialog(order);
    }

    if (slipBtn) {
      const id = parseInt(slipBtn.dataset.id);
      const order = currentOrders.find(o => o.id === id);
      if (order) openHardwareBoxSlip(order);
    }

    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      const confirmed = await showConfirm('Delete Order', 'Are you sure you want to delete this project order? This action cannot be undone.');
      if (confirmed) {
        await remove('projectOrders', id);
        showToast('Order deleted successfully');
        await loadProjectOrders();
        renderProjectStats();
        updateBadges();
      }
    }
  });
}

/**
 * 1-Click WhatsApp Client Messenger
 */
function openWhatsAppDialog(order) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const cleanPhone = (order.phone || '').replace(/\D/g, '');
  const pending = parseFloat(order.pending) || 0;

  const msgReady = `Hi ${order.name}! Your project "${order.projectName}" is tested and ready for pickup! Remaining balance: ${formatCurrency(pending)}. Thanks, Project Mafia.`;
  const msgReminder = `Hi ${order.name}, reminder regarding your project "${order.projectName}". Outstanding balance: ${formatCurrency(pending)}. Please let us know if you need any adjustments.`;
  const msgWaiting = `Hi ${order.name}, components for your project "${order.projectName}" have been ordered from our wholesaler. Assembly will begin shortly!`;

  container.innerHTML = `
    <div class="modal-header">
      <h2><span class="material-icons-round" style="color:#25D366; vertical-align:middle;">chat</span> WhatsApp Message — ${order.name}</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <div class="modal-body">
      <p style="color:var(--text-secondary); margin-bottom:16px;">Send instant WhatsApp update to <strong>+91 ${order.phone}</strong>:</p>
      
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="background:var(--bg-tertiary); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
          <strong style="color:var(--accent-green); display:block; margin-bottom:6px;">Option 1: Project Ready for Pickup</strong>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:10px;">"${msgReady}"</p>
          <a href="https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msgReady)}" target="_blank" class="btn-primary" style="background:#25D366; border:none; color:white; display:inline-flex;">
            <span class="material-icons-round">send</span> Send Ready Update
          </a>
        </div>

        <div style="background:var(--bg-tertiary); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
          <strong style="color:var(--accent-orange); display:block; margin-bottom:6px;">Option 2: Pending Payment Reminder</strong>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:10px;">"${msgReminder}"</p>
          <a href="https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msgReminder)}" target="_blank" class="btn-secondary" style="display:inline-flex;">
            <span class="material-icons-round">send</span> Send Payment Reminder
          </a>
        </div>

        <div style="background:var(--bg-tertiary); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
          <strong style="color:var(--accent-blue); display:block; margin-bottom:6px;">Option 3: Component Sourcing Update</strong>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:10px;">"${msgWaiting}"</p>
          <a href="https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msgWaiting)}" target="_blank" class="btn-secondary" style="display:inline-flex;">
            <span class="material-icons-round">send</span> Send Sourcing Update
          </a>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel">Close</button>
    </div>
  `;

  overlay.classList.remove('hidden');
  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
}

/**
 * Printable Hardware Box Slip
 */
function openHardwareBoxSlip(order) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const pending = parseFloat(order.pending) || 0;

  container.innerHTML = `
    <div class="modal-header">
      <h2>Project Box / Hardware Slip</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <div class="modal-body" id="slip-print-area">
      <div style="background:white; color:#111; padding:24px; border-radius:8px; border:2px dashed #333; max-width:440px; margin:0 auto; font-family:sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">
          <div>
            <h2 style="margin:0; font-size:1.3rem; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#000;">PROJECT MAFIA</h2>
            <div style="font-size:0.75rem; color:#555;">Ready-Made Projects & Tech Solutions</div>
          </div>
          <div style="text-align:right;">
            <span style="display:inline-block; border:1px solid #000; padding:3px 8px; font-weight:700; font-size:0.8rem;">ORDER #${order.id}</span>
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-size:0.75rem; color:#666; text-transform:uppercase;">Project Title:</div>
          <div style="font-size:1.15rem; font-weight:800; color:#000;">${order.projectName}</div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:14px; font-size:0.85rem;">
          <div>
            <div style="color:#666; font-size:0.75rem;">CLIENT:</div>
            <strong style="color:#000;">${order.name}</strong>
          </div>
          <div>
            <div style="color:#666; font-size:0.75rem;">PHONE:</div>
            <strong style="color:#000;">${order.phone || '—'}</strong>
          </div>
          <div>
            <div style="color:#666; font-size:0.75rem;">DUE DATE:</div>
            <strong style="color:#000;">${formatDate(order.dueDate)}</strong>
          </div>
          <div>
            <div style="color:#666; font-size:0.75rem;">STATUS:</div>
            <strong style="color:#000; text-transform:uppercase;">${order.status}</strong>
          </div>
        </div>

        <div style="background:#f3f4f6; padding:12px; border-radius:6px; border:1px solid #ddd; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.85rem;">
            <span>Total Agreed Price:</span>
            <strong>${formatCurrency(order.payment)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.85rem; color:green;">
            <span>Advance Received:</span>
            <strong>${formatCurrency(order.received)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-top:1px solid #ccc; padding-top:6px; font-size:1.05rem; font-weight:800; color:${pending > 0 ? '#dc2626' : '#059669'};">
            <span>BALANCE DUE:</span>
            <span>${formatCurrency(pending)}</span>
          </div>
        </div>

        <div style="text-align:center; font-size:0.7rem; color:#777; border-top:1px dotted #aaa; padding-top:8px;">
          Attach this slip to the hardware enclosure before packaging.
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel">Close</button>
      <button class="btn-primary" id="btn-print-box-slip">
        <span class="material-icons-round">print</span> Print Slip
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');
  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  document.getElementById('btn-print-box-slip').onclick = () => {
    window.print();
  };
}

/**
 * Open Project Order Modal with Auto-Link Material Cost from Material Orders
 */
export async function openProjectModal(order = null) {
  const isEdit = !!order;
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  // Fetch all material orders to allow 1-click wholesale linking
  const materialOrders = await getAll('materialOrders');

  container.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'Edit Project Order' : 'New Project Order'}</h2>
      <button class="modal-close" id="modal-close">
        <span class="material-icons-round">close</span>
      </button>
    </div>
    <div class="modal-body">
      <form id="project-form" class="form-grid">
        
        <!-- AUTO-LINK MATERIAL ORDER (Auto-takes wholesale rate) -->
        <div class="form-group full-width" style="background:var(--bg-tertiary); padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
          <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
            <span><span class="material-icons-round" style="font-size:16px; vertical-align:middle; color:var(--accent-purple)">link</span> Auto-Link Material Order (Wholesale Rate)</span>
            <span style="font-size:0.75rem; color:var(--accent-green); font-weight:600;" id="link-status-badge">Auto-Calculates Material Cost</span>
          </label>
          <select class="form-select" id="linked-material-select" name="materialOrderId">
            <option value="">— Manual Material Cost (No Linked Material Order) —</option>
            ${materialOrders.map(m => {
              const wholesale = parseFloat(m.wholesaleTotal || m.wholesaleRate) || 0;
              const isSelected = order?.materialOrderId === m.id;
              const cleanItem = (m.materialItem || 'Item').replace(/[\r\n]+/g, ' ').substring(0, 42);
              return `
                <option value="${m.id}" data-wholesale="${wholesale}" data-customer="${m.customerName || ''}" data-item="${cleanItem}" ${isSelected ? 'selected' : ''}>
                  [Order #${m.id} | ${m.batchId || 'LOT'}] ${m.customerName || 'No Name'} — ${cleanItem}... (Wholesale: ₹${wholesale.toFixed(2)})
                </option>
              `;
            }).join('')}
          </select>
          <div style="font-size:0.75rem; color:var(--text-tertiary); margin-top:4px;">
            Selecting a material order will automatically pull its wholesale rate into Material Cost.
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Customer Name *</label>
          <input class="form-input" type="text" name="name" id="project-customer-name" value="${order?.name || ''}" required placeholder="Enter customer name" />
        </div>
        <div class="form-group">
          <label class="form-label">Project Name *</label>
          <input class="form-input" type="text" name="projectName" value="${order?.projectName || ''}" required placeholder="e.g. Smart Dustbin" />
        </div>
        <div class="form-group">
          <label class="form-label">Customer Payment (₹)</label>
          <input class="form-input" type="number" step="0.01" name="payment" id="input-payment" value="${order?.payment || ''}" placeholder="Total agreed price" />
        </div>
        <div class="form-group">
          <label class="form-label">Amount Received (₹)</label>
          <input class="form-input" type="number" step="0.01" name="received" id="input-received" value="${order?.received || ''}" placeholder="Advance or full amount" />
        </div>
        <div class="form-group">
          <label class="form-label">Order Date</label>
          <input class="form-input" type="date" name="orderDate" value="${formatDateForInput(order?.orderDate) || new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-group">
          <label class="form-label">Due Date</label>
          <input class="form-input" type="date" name="dueDate" value="${formatDateForInput(order?.dueDate)}" />
        </div>
        
        <div class="form-group">
          <label class="form-label" style="display:flex; justify-content:space-between;">
            <span>Wholesale Material Cost (₹)</span>
            <span id="cost-source-indicator" style="font-size:0.7rem; color:var(--accent-purple)">Linked</span>
          </label>
          <input class="form-input" type="number" step="0.01" name="materialCost" id="input-material-cost" value="${order?.materialCost || 0}" placeholder="Wholesale cost" />
        </div>
        
        <!-- MANUAL MISC CHARGES -->
        <div class="form-group">
          <label class="form-label">Misc Expenses (Manual ₹)</label>
          <input class="form-input" type="number" step="0.01" name="miscExpenses" id="input-misc-expenses" value="${order?.miscExpenses || 0}" placeholder="Acrylic, casing, glue, etc." />
          <div style="font-size:0.7rem; color:var(--text-tertiary); margin-top:2px;">Packaging, 3D printing, soldering, etc.</div>
        </div>

        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input class="form-input" type="text" name="phone" value="${order?.phone || ''}" placeholder="10-digit mobile number" />
        </div>
        <div class="form-group">
          <label class="form-label">Order Status</label>
          <select class="form-select" name="status">
            <option value="pending" ${order?.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in-assembly" ${order?.status === 'in-assembly' ? 'selected' : ''}>In Assembly</option>
            <option value="waiting" ${order?.status === 'waiting' ? 'selected' : ''}>Waiting for Material</option>
            <option value="completed" ${order?.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="delivered" ${order?.status === 'delivered' ? 'selected' : ''}>Delivered</option>
          </select>
        </div>

        <!-- LIVE PROFIT PREVIEW BOX -->
        <div class="form-group full-width" style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.25); border-radius:var(--radius-md); padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-tertiary); text-transform:uppercase; font-weight:600;">Live Profit Formula (Spreadsheet Standard)</div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
              Order Value (<span id="calc-payment">₹0</span>) − Material Cost (<span id="calc-material">₹0</span>) − Misc (<span id="calc-misc">₹0</span>)
            </div>
            <div style="font-size:0.75rem; color:var(--text-warning); margin-top:2px;">
              Advance: <span id="calc-received" style="font-weight:600; color:var(--text-success);">₹0</span> • Pending Balance: <span id="calc-pending" style="font-weight:600;">₹0.00</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:600;">NET PROJECT PROFIT</div>
            <div id="calc-profit" style="font-size:1.4rem; font-weight:800; color:var(--text-success)">₹0.00</div>
          </div>
        </div>

      </form>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-save">
        <span class="material-icons-round">${isEdit ? 'save' : 'add'}</span>
        <span>${isEdit ? 'Save Changes' : 'Add Order'}</span>
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');

  const form = document.getElementById('project-form');
  const paymentInput = document.getElementById('input-payment');
  const receivedInput = document.getElementById('input-received');
  const materialCostInput = document.getElementById('input-material-cost');
  const miscExpensesInput = document.getElementById('input-misc-expenses');
  const materialSelect = document.getElementById('linked-material-select');
  const customerNameInput = document.getElementById('project-customer-name');
  const costSourceIndicator = document.getElementById('cost-source-indicator');

  // Function to update live calculations
  function updateLiveCalc() {
    const payment = parseFloat(paymentInput.value) || 0;
    const received = parseFloat(receivedInput.value) || 0;
    const material = parseFloat(materialCostInput.value) || 0;
    const misc = parseFloat(miscExpensesInput.value) || 0;

    const pending = payment - received;
    const profit = payment - material - misc;

    const calcPay = document.getElementById('calc-payment');
    if (calcPay) calcPay.textContent = formatCurrency(payment);
    document.getElementById('calc-received').textContent = formatCurrency(received);
    document.getElementById('calc-material').textContent = formatCurrency(material);
    document.getElementById('calc-misc').textContent = formatCurrency(misc);
    document.getElementById('calc-pending').textContent = formatCurrency(pending);

    const profitEl = document.getElementById('calc-profit');
    profitEl.textContent = formatCurrency(profit);
    profitEl.style.color = profit >= 0 ? 'var(--text-success)' : 'var(--text-danger)';
  }

  // Material dropdown change handler
  materialSelect.addEventListener('change', () => {
    const selectedOption = materialSelect.options[materialSelect.selectedIndex];
    if (materialSelect.value) {
      const wholesale = parseFloat(selectedOption.dataset.wholesale) || 0;
      materialCostInput.value = wholesale;
      costSourceIndicator.textContent = 'Auto-Linked';
      costSourceIndicator.style.color = 'var(--accent-purple)';

      if (!customerNameInput.value && selectedOption.dataset.customer) {
        customerNameInput.value = selectedOption.dataset.customer;
      }
    } else {
      costSourceIndicator.textContent = 'Manual';
      costSourceIndicator.style.color = 'var(--text-tertiary)';
    }
    updateLiveCalc();
  });

  paymentInput.addEventListener('input', updateLiveCalc);
  receivedInput.addEventListener('input', updateLiveCalc);
  materialCostInput.addEventListener('input', updateLiveCalc);
  miscExpensesInput.addEventListener('input', updateLiveCalc);

  // Initial calculation
  updateLiveCalc();

  // Close handlers
  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  // Save handler
  document.getElementById('modal-save').onclick = async () => {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.name || !data.projectName) {
      showToast('Please fill in required fields', 'error');
      return;
    }

    const payment = parseFloat(data.payment) || 0;
    const received = parseFloat(data.received) || 0;
    const materialCost = parseFloat(data.materialCost) || 0;
    const miscExpenses = parseFloat(data.miscExpenses) || 0;

    data.payment = payment;
    data.received = received;
    data.materialCost = materialCost;
    data.miscExpenses = miscExpenses;
    data.pending = payment - received;
    data.profit = payment - materialCost - miscExpenses;

    if (data.materialOrderId) {
      data.materialOrderId = parseInt(data.materialOrderId);
    } else {
      delete data.materialOrderId;
    }

    try {
      let savedProjectId;
      if (isEdit) {
        data.id = order.id;
        data.createdAt = order.createdAt;
        await update('projectOrders', data);
        savedProjectId = order.id;
        showToast('Order updated successfully');
      } else {
        savedProjectId = await add('projectOrders', data);
        showToast('Order added successfully');
      }

      // Link in materialOrders if selected
      if (data.materialOrderId) {
        await linkProjectToMaterial(savedProjectId, data.materialOrderId, miscExpenses);
      }

      overlay.classList.add('hidden');
      await loadProjectOrders();
      renderProjectStats();
      updateBadges();
    } catch (err) {
      showToast('Error saving order: ' + err.message, 'error');
    }
  };
}

async function updateBadges() {
  const count = currentOrders.length;
  const badge = document.getElementById('badge-projects');
  if (badge) badge.textContent = count;
}

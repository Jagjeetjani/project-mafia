/**
 * Project Orders Page — CRUD for project orders
 * With Auto-sync wholesale material pricing, manual misc expenses, WhatsApp notifications, and box slips
 */
import {
  getProjectOrders, add, update, remove, getProjectStats, getAll,
  linkProjectToMaterial, getProjectTemplates, saveProjectTemplate,
  searchCatalog, autoCreateLinkedMaterialOrder
} from '../db.js';
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

  // Fetch material orders and project recipes
  const [materialOrders, recipes] = await Promise.all([
    getAll('materialOrders'),
    getProjectTemplates()
  ]);

  // Parse initial components if editing an existing order
  let bomItems = [];
  if (order?.materialItem) {
    const lines = order.materialItem.split(/[\n•\r]+/).filter(l => l.trim().length > 0);
    lines.forEach(l => {
      let qty = 1;
      let name = l.trim();
      const m = l.match(/\((\d+)\)/);
      if (m) {
        qty = parseInt(m[1], 10);
        name = l.replace(/\(\d+\)/, '').trim();
      }
      if (name) bomItems.push({ name, qty });
    });
  }

  container.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'Edit Project Order' : 'New Project Order'}</h2>
      <button class="modal-close" id="modal-close">
        <span class="material-icons-round">close</span>
      </button>
    </div>
    <div class="modal-body">
      <form id="project-form" class="form-grid">
        
        <!-- PROJECT RECIPE SELECTOR (AUTO-FILLS COMPONENTS) -->
        <div class="form-group full-width" style="background:linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%); padding:14px; border-radius:var(--radius-md); border:1px solid rgba(99,102,241,0.25);">
          <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
            <span><span class="material-icons-round" style="font-size:18px; vertical-align:middle; color:var(--accent-primary-light);">auto_fix_high</span> Choose Project Recipe (Auto-fills Components)</span>
            <span style="font-size:0.75rem; color:var(--accent-primary-light); font-weight:600;">${recipes.length} Blueprints Available</span>
          </label>
          <select class="form-select" id="recipe-select">
            <option value="">— Select a Pre-Built Project Recipe (or create custom below) —</option>
            ${recipes.map(r => `
              <option value="${r.id}" data-name="${r.name}" data-payment="${r.defaultPayment || ''}">
                ${r.name} (${r.category || 'General'})
              </option>
            `).join('')}
          </select>
          <div style="font-size:0.75rem; color:var(--text-tertiary); margin-top:4px;">
            Selecting a recipe automatically sets up all required parts. You can add or remove any component.
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Customer Name *</label>
          <input class="form-input" type="text" name="name" id="project-customer-name" value="${order?.name || ''}" required placeholder="Enter customer name" />
        </div>
        <div class="form-group">
          <label class="form-label">Project Name *</label>
          <input class="form-input" type="text" name="projectName" id="input-project-name" value="${order?.projectName || ''}" required placeholder="e.g. Smart Dustbin" />
        </div>

        <!-- COMPONENTS NEEDED / BILL OF MATERIALS (BOM) EDITOR -->
        <div class="form-group full-width">
          <div class="bom-container">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:var(--text-primary); font-size:0.95rem; display:flex; align-items:center; gap:6px;">
                  <span class="material-icons-round" style="font-size:18px; color:var(--accent-purple);">format_list_bulleted</span>
                  Components Needed for Project (<span id="bom-count">0</span> parts)
                </strong>
                <span style="font-size:0.75rem; color:var(--text-tertiary);">These components will be auto-transferred to your Wholesaler Procurement Order</span>
              </div>
              <button type="button" class="btn-secondary btn-xs" id="btn-save-as-recipe" title="Save this configuration as a permanent reusable recipe">
                <span class="material-icons-round" style="font-size:14px;">bookmark_add</span> Save as Recipe
              </button>
            </div>

            <!-- List of component rows -->
            <div id="bom-items-list" class="bom-items-list"></div>

            <!-- Search 518-item catalog to add components -->
            <div class="bom-add-box">
              <input type="text" id="bom-search-input" class="bom-add-input" placeholder="Search 518 catalog components or type custom item..." autocomplete="off" />
              <button type="button" class="btn-primary btn-sm" id="btn-add-bom-item">
                <span class="material-icons-round" style="font-size:16px;">add</span> Add
              </button>
              <div id="bom-catalog-dropdown" class="bom-catalog-dropdown hidden"></div>
            </div>
          </div>
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

        <!-- WHOLESALE MATERIAL COST & MISC -->
        <div class="form-group">
          <label class="form-label" style="display:flex; justify-content:space-between;">
            <span>Wholesale Material Cost (₹)</span>
            <span id="cost-source-indicator" style="font-size:0.7rem; color:var(--accent-purple)">Pending / Est</span>
          </label>
          <input class="form-input" type="number" step="0.01" name="materialCost" id="input-material-cost" value="${order?.materialCost || 0}" placeholder="Wholesale bill rate" />
          <div style="font-size:0.7rem; color:var(--text-tertiary); margin-top:2px;">Can be left 0 until wholesaler bill arrives</div>
        </div>

        <div class="form-group">
          <label class="form-label">Misc Expenses (Manual ₹)</label>
          <input class="form-input" type="number" step="0.01" name="miscExpenses" id="input-misc-expenses" value="${order?.miscExpenses || 0}" placeholder="Acrylic, casing, glue, etc." />
          <div style="font-size:0.7rem; color:var(--text-tertiary); margin-top:2px;">Packaging, 3D printing, soldering, etc.</div>
        </div>

        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input class="form-input" type="text" name="phone" id="project-phone" value="${order?.phone || ''}" placeholder="10-digit mobile number" />
        </div>

        <div class="form-group">
          <label class="form-label">Order Status</label>
          <select class="form-select" name="status">
            <option value="pending" ${order?.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="waiting" ${order?.status === 'waiting' || !order ? 'selected' : ''}>Waiting for Material</option>
            <option value="in-assembly" ${order?.status === 'in-assembly' ? 'selected' : ''}>In Assembly</option>
            <option value="completed" ${order?.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="delivered" ${order?.status === 'delivered' ? 'selected' : ''}>Delivered</option>
          </select>
        </div>

        <!-- AUTO-CREATE MATERIAL ORDER CHECKBOX -->
        <div class="form-group full-width" style="background:var(--bg-tertiary); padding:12px 14px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
          <label style="display:flex; align-items:center; gap:12px; cursor:pointer;">
            <input type="checkbox" id="check-auto-create-material" checked style="width:18px; height:18px; accent-color:var(--accent-primary);" />
            <div>
              <strong style="color:var(--text-primary); font-size:0.9rem;">Auto-create Material Order for Wholesaler Procurement</strong>
              <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">
                Automatically adds these components to a Material Order under this customer's name with their payment rate, ready for batching and wholesale ordering.
              </div>
            </div>
          </label>
        </div>

        <!-- LIVE PROFIT PREVIEW BOX -->
        <div class="form-group full-width" style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.25); border-radius:var(--radius-md); padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-tertiary); text-transform:uppercase; font-weight:600;">Live Profit Formula</div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
              Order Value (<span id="calc-payment">₹0</span>) − Material Cost (<span id="calc-material">₹0</span>) − Misc (<span id="calc-misc">₹0</span>)
            </div>
            <div style="font-size:0.75rem; color:var(--text-warning); margin-top:2px;">
              Advance: <span id="calc-received" style="font-weight:600; color:var(--text-success);">₹0</span> • Pending Balance: <span id="calc-pending" style="font-weight:600;">₹0.00</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:600;">EST. NET PROFIT</div>
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
  const projectNameInput = document.getElementById('input-project-name');
  const recipeSelect = document.getElementById('recipe-select');
  const bomListContainer = document.getElementById('bom-items-list');
  const bomCountEl = document.getElementById('bom-count');
  const bomSearchInput = document.getElementById('bom-search-input');
  const bomDropdown = document.getElementById('bom-catalog-dropdown');

  // Render BOM Component List
  function renderBomList() {
    bomCountEl.textContent = bomItems.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 1), 0);

    if (bomItems.length === 0) {
      bomListContainer.innerHTML = `
        <div style="text-align:center; padding:12px; color:var(--text-tertiary); font-size:0.85rem;">
          No components added yet. Select a project recipe above or search components below.
        </div>
      `;
      return;
    }

    bomListContainer.innerHTML = bomItems.map((item, idx) => `
      <div class="bom-item-row">
        <span class="bom-item-name" title="${item.name}">${item.name}</span>
        <div class="bom-item-controls">
          <button type="button" class="bom-qty-btn" data-action="dec" data-index="${idx}">−</button>
          <span class="bom-qty-val">${item.qty || 1}</span>
          <button type="button" class="bom-qty-btn" data-action="inc" data-index="${idx}">+</button>
          <button type="button" class="bom-remove-btn" data-action="del" data-index="${idx}" title="Remove item">
            <span class="material-icons-round" style="font-size:16px;">close</span>
          </button>
        </div>
      </div>
    `).join('');

    // Update estimated wholesale material cost from catalog if current cost is 0
    if (parseFloat(materialCostInput.value) === 0) {
      searchCatalog('').then(catalog => {
        let estCost = 0;
        bomItems.forEach(item => {
          const matched = catalog.find(c => c.name.toLowerCase() === item.name.toLowerCase());
          if (matched && matched.wholesale_unit_cost) {
            estCost += (matched.wholesale_unit_cost * (item.qty || 1));
          }
        });
        if (estCost > 0 && parseFloat(materialCostInput.value) === 0) {
          materialCostInput.value = estCost.toFixed(2);
          updateLiveCalc();
        }
      });
    }
  }

  // BOM list click delegations (+, -, delete)
  bomListContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = parseInt(btn.dataset.index, 10);
    if (isNaN(idx) || !bomItems[idx]) return;

    if (action === 'inc') {
      bomItems[idx].qty = (parseInt(bomItems[idx].qty, 10) || 1) + 1;
      renderBomList();
    } else if (action === 'dec') {
      if ((bomItems[idx].qty || 1) > 1) {
        bomItems[idx].qty = (parseInt(bomItems[idx].qty, 10) || 1) - 1;
        renderBomList();
      } else {
        bomItems.splice(idx, 1);
        renderBomList();
      }
    } else if (action === 'del') {
      bomItems.splice(idx, 1);
      renderBomList();
    }
  });

  // Recipe select change handler
  recipeSelect.addEventListener('change', () => {
    const recipeId = recipeSelect.value;
    if (!recipeId) return;
    const found = recipes.find(r => r.id === recipeId);
    if (!found) return;

    projectNameInput.value = found.name;
    if (!paymentInput.value && found.defaultPayment) {
      paymentInput.value = found.defaultPayment;
    }

    bomItems = JSON.parse(JSON.stringify(found.components || []));
    materialCostInput.value = 0;
    renderBomList();
    updateLiveCalc();
  });

  // Catalog search input handler
  bomSearchInput.addEventListener('input', async () => {
    const query = bomSearchInput.value.trim();
    if (query.length < 2) {
      bomDropdown.classList.add('hidden');
      return;
    }

    const matches = await searchCatalog(query, 12);
    if (matches.length === 0) {
      bomDropdown.innerHTML = `<div style="padding:10px; color:var(--text-tertiary); font-size:0.8rem;">No catalog match. Click "Add" to add as custom item.</div>`;
      bomDropdown.classList.remove('hidden');
      return;
    }

    bomDropdown.innerHTML = matches.map(m => `
      <div class="bom-catalog-item" data-name="${m.name}" data-cost="${m.wholesale_unit_cost || 0}">
        <div>
          <strong style="color:var(--text-primary); display:block;">${m.name}</strong>
          <span style="font-size:0.75rem; color:var(--text-tertiary);">${m.category}</span>
        </div>
        <div style="font-size:0.8rem; font-weight:600; color:var(--accent-purple);">
          ₹${(m.wholesale_unit_cost || 0).toFixed(2)}
        </div>
      </div>
    `).join('');

    bomDropdown.classList.remove('hidden');
  });

  // Dropdown item click
  bomDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.bom-catalog-item');
    if (!item) return;
    const name = item.dataset.name;
    if (name) {
      const existing = bomItems.find(i => i.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.qty = (parseInt(existing.qty, 10) || 1) + 1;
      } else {
        bomItems.push({ name, qty: 1 });
      }
      bomSearchInput.value = '';
      bomDropdown.classList.add('hidden');
      renderBomList();
    }
  });

  // Add BOM item button (adds custom item or selected item)
  document.getElementById('btn-add-bom-item')?.addEventListener('click', () => {
    const val = bomSearchInput.value.trim();
    if (!val) return;
    const existing = bomItems.find(i => i.name.toLowerCase() === val.toLowerCase());
    if (existing) {
      existing.qty = (parseInt(existing.qty, 10) || 1) + 1;
    } else {
      bomItems.push({ name: val, qty: 1 });
    }
    bomSearchInput.value = '';
    bomDropdown.classList.add('hidden');
    renderBomList();
  });

  // Save current BOM as custom Project Recipe
  document.getElementById('btn-save-as-recipe')?.addEventListener('click', async () => {
    const title = projectNameInput.value.trim() || prompt('Enter a name for this Project Recipe:');
    if (!title) return;
    if (bomItems.length === 0) {
      showToast('Please add at least one component before saving as recipe', 'error');
      return;
    }

    const newRecipe = {
      id: `recipe-${Date.now()}`,
      name: title,
      category: 'Custom Projects',
      defaultPayment: parseFloat(paymentInput.value) || 0,
      components: JSON.parse(JSON.stringify(bomItems))
    };

    await saveProjectTemplate(newRecipe);
    showToast(`Saved recipe "${title}" to Cloud!`, 'success');

    // Add to recipe dropdown
    const opt = document.createElement('option');
    opt.value = newRecipe.id;
    opt.textContent = `★ ${newRecipe.name} (Custom)`;
    opt.selected = true;
    recipeSelect.appendChild(opt);
  });

  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.bom-add-box')) {
      bomDropdown.classList.add('hidden');
    }
  });

  // Initial render of BOM items
  renderBomList();

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

    // Build materialItem formatted bulleted list
    if (bomItems.length > 0) {
      data.materialItem = bomItems.map(c => `• ${c.name} (${c.qty || 1})`).join('\n');
    }

    const shouldAutoCreateMaterial = document.getElementById('check-auto-create-material')?.checked;

    try {
      let savedProjectId;
      if (isEdit) {
        data.id = order.id;
        data.createdAt = order.createdAt;
        data.materialOrderId = order.materialOrderId;
        await update('projectOrders', data);
        savedProjectId = order.id;
        showToast('Project Order updated successfully', 'success');
      } else {
        savedProjectId = await add('projectOrders', data);
        data.id = savedProjectId;
        showToast('Project Order added successfully', 'success');
      }

      // Auto-create/update linked Material Order under customer's name
      if (shouldAutoCreateMaterial) {
        const linkedMat = await autoCreateLinkedMaterialOrder(data, bomItems);
        if (linkedMat) {
          showToast(`Linked Material Order #${linkedMat.id} synced for Wholesaler Procurement`, 'info');
        }
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

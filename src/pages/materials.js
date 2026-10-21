/**
 * Material Orders Page — CRUD for material/component orders
 */
import { getMaterialOrders, add, update, remove, getMaterialStats, getAll, resetMaterialOrdersToSeed } from '../db.js';
import { seedMaterialOrders } from '../seedData.js';
import {
  formatCurrency, formatDate, normalizeStatus, getStatusLabel,
  showToast, showConfirm, debounce, formatDateForInput
} from '../utils.js';

let currentOrders = [];
let currentPage = 1;
const pageSize = 15;
let searchQuery = '';
let typeFilter = '';
let statusFilter = '';

export function renderMaterialOrders() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Material Orders</h1>
        <p class="page-subtitle">Track material procurement, wholesale orders, and component sales</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-secondary" id="btn-sync-materials-data" title="Sync with Verified 40 Spreadsheet Orders">
          <span class="material-icons-round">sync</span>
          <span>Sync 40 Orders</span>
        </button>
        <button class="btn-primary" id="btn-add-material">
          <span class="material-icons-round">add</span>
          <span>New Material Order</span>
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" id="material-stats-grid"></div>

    <!-- Table -->
    <div class="table-container">
      <div class="table-toolbar">
        <div class="table-search">
          <span class="material-icons-round">search</span>
          <input type="text" id="material-search" placeholder="Search by customer, item, contact..." />
        </div>
        <div class="table-filters">
          <select class="filter-select" id="material-type-filter">
            <option value="">All Types</option>
            <option value="Component Order">Component</option>
            <option value="Original Order">Original</option>
          </select>
          <select class="filter-select" id="material-status-filter">
            <option value="">All Status</option>
            <option value="delivered">Delivered</option>
            <option value="completed">Completed</option>
            <option value="in-assembly">In Assembly</option>
            <option value="waiting">Waiting</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      <div class="table-scroll">
        <table class="data-table" id="material-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Type</th>
              <th>Date</th>
              <th>Material / Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
              <th>Balance</th>
              <th>Wholesale</th>
              <th>Porter</th>
              <th>Net Profit</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="material-tbody"></tbody>
        </table>
      </div>

      <div class="table-pagination" id="material-pagination"></div>
    </div>
  `;
}

export async function initMaterialOrders() {
  await loadMaterialOrders();
  renderMaterialStats();
  bindMaterialEvents();
}

async function loadMaterialOrders() {
  currentOrders = await getMaterialOrders({
    search: searchQuery,
    orderType: typeFilter,
    orderStatus: statusFilter,
  });

  renderMaterialTable();
}

function renderMaterialStats() {
  getMaterialStats().then(stats => {
    const grid = document.getElementById('material-stats-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon purple">
            <span class="material-icons-round">shopping_cart</span>
          </div>
        </div>
        <div class="stat-card-label">Total Orders</div>
        <div class="stat-card-value">${stats.totalOrders}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon green">
            <span class="material-icons-round">payments</span>
          </div>
        </div>
        <div class="stat-card-label">Total Revenue</div>
        <div class="stat-card-value">${formatCurrency(stats.totalRevenue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon blue">
            <span class="material-icons-round">account_balance_wallet</span>
          </div>
        </div>
        <div class="stat-card-label">Total Received</div>
        <div class="stat-card-value">${formatCurrency(stats.totalReceived)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon orange">
            <span class="material-icons-round">pending</span>
          </div>
        </div>
        <div class="stat-card-label">Total Pending</div>
        <div class="stat-card-value" style="color: var(--text-warning)">${formatCurrency(stats.totalPendingAmount)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon red">
            <span class="material-icons-round">precision_manufacturing</span>
          </div>
        </div>
        <div class="stat-card-label">Wholesale Cost</div>
        <div class="stat-card-value">${formatCurrency(stats.totalWholesaleCost)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon orange">
            <span class="material-icons-round">local_shipping</span>
          </div>
        </div>
        <div class="stat-card-label">Total Porter Cost</div>
        <div class="stat-card-value">${formatCurrency(stats.totalPorterCost)}</div>
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

function renderMaterialTable() {
  const tbody = document.getElementById('material-tbody');
  if (!tbody) return;

  const start = (currentPage - 1) * pageSize;
  const pageOrders = currentOrders.slice(start, start + pageSize);

  if (pageOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13">
          <div class="empty-state">
            <div class="empty-state-icon">
              <span class="material-icons-round">shopping_cart</span>
            </div>
            <h3>No material orders found</h3>
            <p>Add your first material order to get started!</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageOrders.map(order => {
    const status = normalizeStatus(order.orderStatus);
    const netProfit = parseFloat(order.netProfit) || 0;

    return `
      <tr data-id="${order.id}">
        <td class="cell-name">${order.customerName || '—'}</td>
        <td><span class="status-badge ${order.orderType === 'Component Order' ? 'completed' : 'pending'}" style="font-size:0.7rem">${order.orderType || '—'}</span></td>
        <td class="cell-secondary">${formatDate(order.orderDate)}</td>
        <td>${order.materialItem || '—'}</td>
        <td>${order.qty || '—'}</td>
        <td class="cell-money">${formatCurrency(order.unitPrice)}</td>
        <td class="cell-money">${formatCurrency(order.totalPrice)}</td>
        <td class="cell-money ${parseFloat(order.balance) > 0 ? 'negative' : ''}">${formatCurrency(order.balance)}</td>
        <td class="cell-money">${formatCurrency(order.wholesaleTotal)}</td>
        <td class="cell-money">${formatCurrency(order.porterCharge)}</td>
        <td class="cell-money ${netProfit >= 0 ? 'positive' : 'negative'}">${formatCurrency(order.netProfit)}</td>
        <td><span class="status-badge ${status}">${getStatusLabel(status)}</span></td>
        <td>
          <div class="row-actions">
            <button title="Edit" class="edit-material" data-id="${order.id}">
              <span class="material-icons-round">edit</span>
            </button>
            <button title="Delete" class="delete delete-material" data-id="${order.id}">
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
  const container = document.getElementById('material-pagination');
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
        renderMaterialTable();
      }
    });
  });
}

function bindMaterialEvents() {
  // Search
  const searchInput = document.getElementById('material-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      searchQuery = e.target.value;
      currentPage = 1;
      loadMaterialOrders();
    }, 250));
  }

  // Type filter
  document.getElementById('material-type-filter')?.addEventListener('change', (e) => {
    typeFilter = e.target.value;
    currentPage = 1;
    loadMaterialOrders();
  });

  // Status filter
  document.getElementById('material-status-filter')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    currentPage = 1;
    loadMaterialOrders();
  });

  // Add button
  document.getElementById('btn-add-material')?.addEventListener('click', () => {
    openMaterialModal();
  });

  // Sync 40 Orders button
  document.getElementById('btn-sync-materials-data')?.addEventListener('click', async () => {
    const confirmed = await showConfirm(
      'Sync 40 Orders from Sheet',
      'This will reload all 40 verified material orders and procurement items from the official spreadsheet tracker. Continue?'
    );
    if (confirmed) {
      await resetMaterialOrdersToSeed(seedMaterialOrders);
      localStorage.setItem('pm_verified_40_materials', 'true');
      showToast('All 40 material orders synchronized successfully!', 'success');
      currentPage = 1;
      await loadMaterialOrders();
      renderMaterialStats();
      updateBadges();
    }
  });

  // Delegate edit/delete
  document.getElementById('material-tbody')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-material');
    const deleteBtn = e.target.closest('.delete-material');

    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      const order = currentOrders.find(o => o.id === id);
      if (order) openMaterialModal(order);
    }

    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      const confirmed = await showConfirm('Delete Material Order', 'Are you sure you want to delete this material order?');
      if (confirmed) {
        await remove('materialOrders', id);
        showToast('Material order deleted');
        await loadMaterialOrders();
        renderMaterialStats();
        updateBadges();
      }
    }
  });
}

export function openMaterialModal(order = null) {
  const isEdit = !!order;
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');

  container.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'Edit Material Order' : 'New Material Order'}</h2>
      <button class="modal-close" id="modal-close">
        <span class="material-icons-round">close</span>
      </button>
    </div>
    <div class="modal-body">
      <form id="material-form" class="form-grid">
        <div class="form-group">
          <label class="form-label">Customer Name *</label>
          <input class="form-input" type="text" name="customerName" value="${order?.customerName || ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Order Type</label>
          <select class="form-select" name="orderType">
            <option value="Component Order" ${order?.orderType === 'Component Order' ? 'selected' : ''}>Component Order</option>
            <option value="Original Order" ${order?.orderType === 'Original Order' ? 'selected' : ''}>Original Order</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Order Date</label>
          <input class="form-input" type="date" name="orderDate" value="${formatDateForInput(order?.orderDate)}" />
        </div>
        <div class="form-group full-width">
          <label class="form-label">Material / Item *</label>
          <input class="form-input" type="text" name="materialItem" value="${order?.materialItem || ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input class="form-input" type="number" name="qty" value="${order?.qty || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Unit Price (₹)</label>
          <input class="form-input" type="number" step="0.01" name="unitPrice" value="${order?.unitPrice || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Total Price (₹)</label>
          <input class="form-input" type="number" step="0.01" name="totalPrice" value="${order?.totalPrice || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Amount Received (₹)</label>
          <input class="form-input" type="number" step="0.01" name="received" value="${order?.received || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Wholesale Total (₹)</label>
          <input class="form-input" type="number" step="0.01" name="wholesaleTotal" value="${order?.wholesaleTotal || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Wholesale Date</label>
          <input class="form-input" type="date" name="wholesaleDate" value="${formatDateForInput(order?.wholesaleDate)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Porter Charge (₹)</label>
          <input class="form-input" type="number" step="0.01" name="porterCharge" value="${order?.porterCharge || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Contact Number</label>
          <input class="form-input" type="text" name="contactNo" value="${order?.contactNo || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Order Status</label>
          <select class="form-select" name="orderStatus">
            <option value="pending" ${order?.orderStatus === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in-assembly" ${order?.orderStatus === 'in-assembly' ? 'selected' : ''}>In Assembly</option>
            <option value="waiting" ${order?.orderStatus === 'waiting' ? 'selected' : ''}>Waiting</option>
            <option value="completed" ${order?.orderStatus === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="delivered" ${order?.orderStatus === 'delivered' ? 'selected' : ''}>Delivered</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Wholesale Status</label>
          <select class="form-select" name="wholesaleStatus">
            <option value="pending" ${order?.wholesaleStatus === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="received" ${order?.wholesaleStatus === 'received' ? 'selected' : ''}>Received</option>
            <option value="completed" ${order?.wholesaleStatus === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label class="form-label">Tracking / Notes</label>
          <textarea class="form-textarea" name="trackingNotes">${order?.trackingNotes || ''}</textarea>
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

  // Auto-calc total price
  const form = document.getElementById('material-form');
  const qtyInput = form.querySelector('[name="qty"]');
  const unitPriceInput = form.querySelector('[name="unitPrice"]');
  const totalPriceInput = form.querySelector('[name="totalPrice"]');

  const calcTotal = () => {
    const qty = parseFloat(qtyInput.value) || 0;
    const unitPrice = parseFloat(unitPriceInput.value) || 0;
    if (qty && unitPrice) {
      totalPriceInput.value = (qty * unitPrice).toFixed(2);
    }
  };

  qtyInput.addEventListener('input', calcTotal);
  unitPriceInput.addEventListener('input', calcTotal);

  // Close handlers
  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  // Save handler
  document.getElementById('modal-save').onclick = async () => {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.customerName || !data.materialItem) {
      showToast('Please fill in required fields', 'error');
      return;
    }

    // Calculate derived fields
    const totalPrice = parseFloat(data.totalPrice) || 0;
    const received = parseFloat(data.received) || 0;
    const wholesaleTotal = parseFloat(data.wholesaleTotal) || 0;
    const porterCharge = parseFloat(data.porterCharge) || 0;

    data.balance = totalPrice - received;
    data.netProfit = received - wholesaleTotal - porterCharge;

    try {
      if (isEdit) {
        data.id = order.id;
        data.createdAt = order.createdAt;
        await update('materialOrders', data);
        showToast('Material order updated');
      } else {
        await add('materialOrders', data);
        showToast('Material order added');
      }

      overlay.classList.add('hidden');
      await loadMaterialOrders();
      renderMaterialStats();
      updateBadges();
    } catch (err) {
      showToast('Error saving: ' + err.message, 'error');
    }
  };
}

async function updateBadges() {
  const orders = await getAll('materialOrders');
  const badge = document.getElementById('badge-materials');
  if (badge) badge.textContent = orders.length;
}

/**
 * Material Orders Page — CRUD for material/component orders
 */
import {
  getMaterialOrders, add, update, remove, getMaterialStats, getAll,
  resetMaterialOrdersToSeed, getConsolidatedProcurement, batchOrdersIntoLot, searchCatalog
} from '../db.js';
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
        <button class="btn-secondary" id="btn-consolidate-sourcing">
          <span class="material-icons-round">inventory_2</span>
          <span>Wholesaler Order List</span>
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

  // Wholesaler Order List (Consolidated Procurement)
  document.getElementById('btn-consolidate-sourcing')?.addEventListener('click', () => {
    openConsolidatedProcurementModal();
  });

  // Add button
  document.getElementById('btn-add-material')?.addEventListener('click', () => {
    openMaterialModal();
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

/**
 * Consolidated Wholesaler Procurement Modal
 * 1-Click WhatsApp list, Batching into LOT, and Sourcing Sheet
 */
export async function openConsolidatedProcurementModal() {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  let currentFilter = 'pending';
  let procurement = await getConsolidatedProcurement(currentFilter);
  const existingBatches = await getAll('porterBatches');

  // Next lot ID calculation (e.g. LOT-12)
  let nextLotNum = 1;
  existingBatches.forEach(b => {
    const m = (b.lotId || '').match(/LOT-(\d+)/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num >= nextLotNum) nextLotNum = num + 1;
    }
  });
  const defaultLotName = `LOT-${String(nextLotNum).padStart(2, '0')}`;

  function renderView() {
    container.innerHTML = `
      <div class="modal-header">
        <div>
          <h2 style="display:flex; align-items:center; gap:8px;">
            <span class="material-icons-round" style="color:var(--accent-purple); font-size:26px;">inventory_2</span>
            <span>Wholesaler Order List</span>
          </h2>
          <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
            Consolidated procurement sheet across pending customer project and component orders
          </p>
        </div>
        <button class="modal-close" id="modal-close">
          <span class="material-icons-round">close</span>
        </button>
      </div>

      <div class="modal-body" style="display:flex; flex-direction:column; gap:16px;">
        <!-- METRICS ROW -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px;">
          <div style="background:var(--bg-tertiary); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-primary); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:600; text-transform:uppercase;">Unique Parts</div>
            <div style="font-size:1.3rem; font-weight:800; color:var(--accent-primary-light); margin-top:4px;">${procurement.totalUniqueItems}</div>
          </div>
          <div style="background:var(--bg-tertiary); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-primary); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:600; text-transform:uppercase;">Total Units</div>
            <div style="font-size:1.3rem; font-weight:800; color:var(--accent-purple); margin-top:4px;">${procurement.totalUnits} pcs</div>
          </div>
          <div style="background:var(--bg-tertiary); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-primary); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:600; text-transform:uppercase;">Customer Orders</div>
            <div style="font-size:1.3rem; font-weight:800; color:var(--accent-blue); margin-top:4px;">${procurement.orderCount}</div>
          </div>
          <div style="background:var(--bg-tertiary); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-primary); text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-tertiary); font-weight:600; text-transform:uppercase;">Est. Wholesale</div>
            <div style="font-size:1.3rem; font-weight:800; color:var(--text-success); margin-top:4px;">${formatCurrency(procurement.estimatedWholesaleTotal)}</div>
          </div>
        </div>

        <!-- ACTION TOOLBAR -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:var(--bg-card); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border-secondary);">
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.8rem; color:var(--text-secondary); font-weight:600;">Scope:</label>
            <select id="procure-filter-select" class="form-select" style="min-width:200px; padding:6px 10px; font-size:0.85rem;">
              <option value="pending" ${currentFilter === 'pending' ? 'selected' : ''}>⏳ Pending Orders (Unbatched)</option>
              <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>🌐 All Active Orders</option>
            </select>
          </div>

          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <button class="btn-primary" id="btn-copy-procure-whatsapp" style="background:#25D366; border-color:#25D366; color:white;">
              <span class="material-icons-round" style="font-size:18px;">chat</span>
              <span>Copy WhatsApp List</span>
            </button>
            <button class="btn-secondary" id="btn-toggle-batch-box">
              <span class="material-icons-round" style="font-size:18px;">local_shipping</span>
              <span>1-Click Porter Batch</span>
            </button>
            <button class="btn-secondary" id="btn-print-procure-sheet">
              <span class="material-icons-round" style="font-size:18px;">print</span>
              <span>Print Sheet</span>
            </button>
          </div>
        </div>

        <!-- INLINE BATCH CREATOR FORM (TOGGLEABLE) -->
        <div id="batch-creator-box" class="procurement-batch-box hidden">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:var(--text-primary); font-size:0.95rem; display:flex; align-items:center; gap:6px;">
              <span class="material-icons-round" style="color:var(--accent-primary-light);">local_shipping</span>
              Batch All ${procurement.orderCount} Orders into New Porter Lot
            </strong>
            <button type="button" class="btn-xs btn-secondary" id="btn-close-batch-box">✕ Close</button>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary);">
            Assign all currently pending material orders to this Porter Lot (${defaultLotName}), mark wholesale status as 'Received', and record delivery charges.
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
            <div>
              <label class="form-label">Lot Identifier</label>
              <input type="text" id="batch-lot-id" class="form-input" value="${defaultLotName}" placeholder="e.g. LOT-12" />
            </div>
            <div>
              <label class="form-label">Porter Delivery Charge (₹)</label>
              <input type="number" step="0.01" id="batch-porter-charge" class="form-input" value="250" placeholder="e.g. 250" />
            </div>
            <div>
              <label class="form-label">Wholesaler Name</label>
              <input type="text" id="batch-wholesaler-name" class="form-input" value="Rajindra Electronics" />
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; margin-top:4px;">
            <button class="btn-primary" id="btn-confirm-batch">
              <span class="material-icons-round">check_circle</span>
              <span>Confirm & Lock Batch</span>
            </button>
          </div>
        </div>

        <!-- CONSOLIDATED COMPONENTS TABLE -->
        <div class="procurement-table-scroll">
          <table class="data-table" style="font-size:0.85rem;">
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th>Component / Item Name</th>
                <th>Category</th>
                <th style="text-align:center;">Qty Needed</th>
                <th style="text-align:right;">Wholesale Rate</th>
                <th style="text-align:right;">Est. Cost</th>
                <th>Customer Orders Covered</th>
              </tr>
            </thead>
            <tbody>
              ${procurement.items.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align:center; padding:32px; color:var(--text-tertiary);">
                    No components found needing wholesaler procurement for this filter.
                  </td>
                </tr>
              ` : procurement.items.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td style="font-weight:600; color:var(--text-primary);">${item.name}</td>
                  <td><span class="status-badge" style="background:var(--bg-elevated); color:var(--text-secondary); font-size:0.7rem;">${item.category || 'General'}</span></td>
                  <td style="text-align:center;"><span class="procurement-qty-badge">${item.totalQty}</span></td>
                  <td style="text-align:right; color:var(--text-secondary);">${item.wholesaleUnitCost ? formatCurrency(item.wholesaleUnitCost) : '—'}</td>
                  <td style="text-align:right; font-weight:600; color:var(--accent-purple);">${item.wholesaleUnitCost ? formatCurrency(item.wholesaleUnitCost * item.totalQty) : '—'}</td>
                  <td>
                    ${item.orders.map(o => `
                      <span class="order-source-chip" title="Order #${o.orderId}">
                        ${o.customerName} <strong>(${o.qty})</strong>
                      </span>
                    `).join('')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- PRINTABLE HIDDEN SHEET -->
        <div id="printable-procurement-sheet" style="display:none;">
          <div style="padding:24px; font-family:sans-serif; color:#000; background:#fff;">
            <div style="border-bottom:2px solid #000; padding-bottom:12px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h1 style="margin:0; font-size:20px; font-weight:800;">PROJECT MAFIA — WHOLESALE PROCUREMENT LIST</h1>
                <p style="margin:4px 0 0; font-size:12px; color:#555;">Supplier: Rajindra Electronics • Generated: ${new Date().toLocaleDateString('en-IN')}</p>
              </div>
              <div style="text-align:right;">
                <div style="font-size:14px; font-weight:bold;">${procurement.totalUniqueItems} Parts | ${procurement.totalUnits} Units</div>
              </div>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead>
                <tr style="border-bottom:1px solid #000; text-align:left;">
                  <th style="padding:6px;">#</th>
                  <th style="padding:6px;">Component Description</th>
                  <th style="padding:6px; text-align:center;">Qty</th>
                  <th style="padding:6px; text-align:right;">Unit Rate</th>
                  <th style="padding:6px;">For Orders</th>
                </tr>
              </thead>
              <tbody>
                ${procurement.items.map((item, idx) => `
                  <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:6px;">${idx + 1}</td>
                    <td style="padding:6px; font-weight:bold;">${item.name}</td>
                    <td style="padding:6px; text-align:center; font-weight:bold; font-size:13px;">${item.totalQty}</td>
                    <td style="padding:6px; text-align:right;">${item.wholesaleUnitCost ? '₹' + item.wholesaleUnitCost : ''}</td>
                    <td style="padding:6px; font-size:11px; color:#555;">${item.orders.map(o => `${o.customerName} (${o.qty})`).join(', ')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn-secondary" id="modal-cancel">Close</button>
      </div>
    `;

    overlay.classList.remove('hidden');

    // Close handlers
    document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
    document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
    overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

    // Filter change
    document.getElementById('procure-filter-select')?.addEventListener('change', async (e) => {
      currentFilter = e.target.value;
      procurement = await getConsolidatedProcurement(currentFilter);
      renderView();
    });

    // Copy WhatsApp list
    document.getElementById('btn-copy-procure-whatsapp')?.addEventListener('click', async () => {
      const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      let text = `📦 *WHOLESALER ORDER LIST — PROJECT MAFIA*\n`;
      text += `📅 *Date:* ${dateStr}\n`;
      text += `🏢 *Supplier:* Rajindra Electronics\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      procurement.items.forEach((item, index) => {
        text += `${index + 1}. *${item.name}* — *${item.totalQty} pcs*\n`;
      });

      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `📊 *Total Items:* ${procurement.totalUniqueItems} components\n`;
      text += `🔢 *Total Quantity:* ${procurement.totalUnits} pcs\n`;
      text += `⚡ *Please confirm stock and dispatch via Porter.*\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      try {
        await navigator.clipboard.writeText(text);
        showToast('✓ WhatsApp Order List copied to clipboard!', 'success');
        const btn = document.getElementById('btn-copy-procure-whatsapp');
        if (btn) {
          const originalHTML = btn.innerHTML;
          btn.innerHTML = `<span class="material-icons-round" style="font-size:18px;">check</span><span>Copied!</span>`;
          setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
        }
      } catch (err) {
        showToast('Could not copy automatically. Please select text manually.', 'error');
      }
    });

    // Toggle Batch creator box
    const batchBox = document.getElementById('batch-creator-box');
    document.getElementById('btn-toggle-batch-box')?.addEventListener('click', () => {
      batchBox.classList.toggle('hidden');
    });
    document.getElementById('btn-close-batch-box')?.addEventListener('click', () => {
      batchBox.classList.add('hidden');
    });

    // Confirm Batch button
    document.getElementById('btn-confirm-batch')?.addEventListener('click', async () => {
      const lotId = document.getElementById('batch-lot-id').value.trim();
      const porterCharge = parseFloat(document.getElementById('batch-porter-charge').value) || 0;
      const wholesaler = document.getElementById('batch-wholesaler-name').value.trim() || 'Rajindra Electronics';

      if (!lotId) {
        showToast('Please specify a Lot Identifier (e.g. LOT-12)', 'error');
        return;
      }

      const orderIds = procurement.orders.map(o => o.id);
      if (orderIds.length === 0) {
        showToast('No orders to batch!', 'error');
        return;
      }

      const confirmed = await showConfirm(
        'Confirm Porter Batch',
        `Assign ${orderIds.length} orders to lot "${lotId}" with ₹${porterCharge} Porter charge?`
      );
      if (!confirmed) return;

      const batchedCount = await batchOrdersIntoLot(orderIds, lotId, porterCharge, wholesaler);
      showToast(`Successfully batched ${batchedCount} orders into ${lotId}!`, 'success');

      // Refresh procurement view and material orders page
      procurement = await getConsolidatedProcurement(currentFilter);
      renderView();
      await loadMaterialOrders();
      renderMaterialStats();
    });

    // Print button
    document.getElementById('btn-print-procure-sheet')?.addEventListener('click', () => {
      const printSheet = document.getElementById('printable-procurement-sheet');
      if (!printSheet) return;
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Wholesaler Procurement Sheet - Project Mafia</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; color: #111; }
              table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background: #f4f4f4; }
              .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
            </style>
          </head>
          <body>
            ${printSheet.innerHTML}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    });
  }

  renderView();
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
          <input class="form-input" type="text" name="customerName" value="${order?.customerName || ''}" required placeholder="Customer name" />
        </div>
        <div class="form-group">
          <label class="form-label">Order Type</label>
          <select class="form-select" name="orderType">
            <option value="Component Order" ${order?.orderType === 'Component Order' ? 'selected' : ''}>Component Order</option>
            <option value="Project Order" ${order?.orderType === 'Project Order' ? 'selected' : ''}>Project Order</option>
            <option value="Original Order" ${order?.orderType === 'Original Order' ? 'selected' : ''}>Original Order</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Order Date</label>
          <input class="form-input" type="date" name="orderDate" value="${formatDateForInput(order?.orderDate) || new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-group full-width" style="position:relative;">
          <label class="form-label">Material / Item * (Search Catalog)</label>
          <input class="form-input" type="text" name="materialItem" id="material-item-input" value="${order?.materialItem || ''}" required placeholder="Type component name (518 catalog items autocomplete)..." autocomplete="off" />
          <div id="material-catalog-dropdown" class="bom-catalog-dropdown hidden"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input class="form-input" type="number" name="qty" value="${order?.qty || 1}" />
        </div>
        <div class="form-group">
          <label class="form-label">Customer Unit Rate (₹)</label>
          <input class="form-input" type="number" step="0.01" name="unitPrice" value="${order?.unitPrice || ''}" placeholder="Rate customer pays" />
        </div>
        <div class="form-group">
          <label class="form-label">Total Price (₹)</label>
          <input class="form-input" type="number" step="0.01" name="totalPrice" value="${order?.totalPrice || ''}" placeholder="Total customer payment" />
        </div>
        <div class="form-group">
          <label class="form-label">Amount Received (₹)</label>
          <input class="form-input" type="number" step="0.01" name="received" value="${order?.received || ''}" placeholder="Advance or full payment" />
        </div>
        <div class="form-group">
          <label class="form-label">Wholesale Cost (₹)</label>
          <input class="form-input" type="number" step="0.01" name="wholesaleTotal" value="${order?.wholesaleTotal || 0}" placeholder="Wholesale rate (optional)" />
          <div style="font-size:0.7rem; color:var(--text-tertiary); margin-top:2px;">Leave 0 until wholesaler bill arrives</div>
        </div>
        <div class="form-group">
          <label class="form-label">Wholesale Date</label>
          <input class="form-input" type="date" name="wholesaleDate" value="${formatDateForInput(order?.wholesaleDate)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Porter Charge (₹)</label>
          <input class="form-input" type="number" step="0.01" name="porterCharge" value="${order?.porterCharge || 0}" />
        </div>
        <div class="form-group">
          <label class="form-label">Contact Number</label>
          <input class="form-input" type="text" name="contactNo" value="${order?.contactNo || ''}" placeholder="10-digit phone" />
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
            <option value="pending" ${order?.wholesaleStatus === 'pending' || !order ? 'selected' : ''}>Pending Procurement</option>
            <option value="received" ${order?.wholesaleStatus === 'received' ? 'selected' : ''}>Received from Wholesaler</option>
            <option value="completed" ${order?.wholesaleStatus === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label class="form-label">Tracking / Notes</label>
          <textarea class="form-textarea" name="trackingNotes">${order?.trackingNotes || order?.notes || ''}</textarea>
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
  const itemInput = document.getElementById('material-item-input');
  const catalogDropdown = document.getElementById('material-catalog-dropdown');

  const calcTotal = () => {
    const qty = parseFloat(qtyInput.value) || 0;
    const unitPrice = parseFloat(unitPriceInput.value) || 0;
    if (qty && unitPrice) {
      totalPriceInput.value = (qty * unitPrice).toFixed(2);
    }
  };

  qtyInput.addEventListener('input', calcTotal);
  unitPriceInput.addEventListener('input', calcTotal);

  // Catalog live search autocomplete
  if (itemInput && catalogDropdown) {
    itemInput.addEventListener('input', async () => {
      const q = itemInput.value.trim();
      if (q.length < 2) {
        catalogDropdown.classList.add('hidden');
        return;
      }

      const matches = await searchCatalog(q, 10);
      if (matches.length === 0) {
        catalogDropdown.classList.add('hidden');
        return;
      }

      catalogDropdown.innerHTML = matches.map(m => `
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

      catalogDropdown.classList.remove('hidden');
    });

    catalogDropdown.addEventListener('click', (e) => {
      const row = e.target.closest('.bom-catalog-item');
      if (!row) return;
      const name = row.dataset.name;
      if (name) {
        itemInput.value = name;
        catalogDropdown.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.form-group.full-width')) {
        catalogDropdown.classList.add('hidden');
      }
    });
  }

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

    data.qty = parseFloat(data.qty) || 1;
    data.unitPrice = parseFloat(data.unitPrice) || 0;
    data.totalPrice = totalPrice;
    data.received = received;
    data.wholesaleTotal = wholesaleTotal;
    data.porterCharge = porterCharge;
    data.balance = totalPrice - received;
    data.netProfit = received - wholesaleTotal - porterCharge;

    try {
      if (isEdit) {
        data.id = order.id;
        data.createdAt = order.createdAt;
        data.batchId = order.batchId || '';
        data.linkedProjectId = order.linkedProjectId || null;
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

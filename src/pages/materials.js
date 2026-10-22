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
import { openInvoiceStudioModal, showInvoicePreview } from './invoices.js';
import { navigate } from '../main.js';

let currentOrders = [];
let currentInvoices = [];
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
        <button class="btn-secondary" id="btn-material-from-invoice" title="Create a Component Order by importing items list from an existing Invoice">
          <span class="material-icons-round" style="color:var(--accent-primary-light);">receipt_long</span>
          <span>Add from Invoice</span>
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
  const [orders, allInvoices] = await Promise.all([
    getMaterialOrders({
      search: searchQuery,
      orderType: typeFilter,
      orderStatus: statusFilter,
    }),
    getAll('invoices')
  ]);
  currentOrders = orders;
  currentInvoices = allInvoices;

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

    const mappedInvoice = (currentInvoices || []).find(inv => 
      (order.invoiceId && inv.id === order.invoiceId) || 
      inv.mappedComponentOrderId === order.id || 
      inv.metadata?.component_order_id === order.id
    );

    return `
      <tr data-id="${order.id}">
        <td class="cell-name">
          <div>${order.customerName || '—'}</div>
          ${mappedInvoice ? `
            <div style="margin-top:3px;">
              <span class="status-badge view-order-invoice" data-invoice-id="${mappedInvoice.id}" style="cursor:pointer; display:inline-flex; align-items:center; gap:3px; font-size:0.68rem; background:rgba(99,102,241,0.12); color:var(--accent-primary-light); border:1px solid rgba(99,102,241,0.25);" title="View Tax Invoice (${mappedInvoice.metadata?.invoice_no})">
                <span class="material-icons-round" style="font-size:11px;">receipt</span>
                <span>${mappedInvoice.metadata?.invoice_no || 'Invoice'}</span>
              </span>
            </div>
          ` : ''}
        </td>
        <td><span class="status-badge ${order.orderType === 'Component Order' ? 'completed' : 'pending'}" style="font-size:0.7rem">${order.orderType || '—'}</span></td>
        <td class="cell-secondary">${formatDate(order.orderDate)}</td>
        <td>
          ${(() => {
            const raw = order.materialItem || '—';
            const lines = raw.split(/[\r\n]+/).filter(l => l.trim());
            if (lines.length <= 1) return `<div>${raw}</div>`;
            return `
              <div title="${raw.replace(/"/g, '&quot;')}">
                ${lines.slice(0, 3).map(l => `<div style="font-size:0.78rem; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:240px;">${l}</div>`).join('')}
                ${lines.length > 3 ? `<div style="font-size:0.68rem; color:var(--accent-primary-light); font-weight:600; margin-top:2px;">+ ${lines.length - 3} more items</div>` : ''}
              </div>
            `;
          })()}
        </td>
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
            <button title="${mappedInvoice ? 'View Tax Invoice (' + (mappedInvoice.metadata?.invoice_no || '') + ')' : 'Create & Map Invoice for this Component Order'}" class="btn-invoice-action ${mappedInvoice ? 'has-invoice' : ''}" data-order-id="${order.id}" data-invoice-id="${mappedInvoice ? mappedInvoice.id : ''}">
              <span class="material-icons-round" style="color:${mappedInvoice ? 'var(--accent-primary-light)' : 'var(--text-tertiary)'};">
                ${mappedInvoice ? 'receipt_long' : 'post_add'}
              </span>
            </button>
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

  // Add from Invoice button
  document.getElementById('btn-material-from-invoice')?.addEventListener('click', () => {
    openMaterialModal(null, true);
  });

  // Delegate edit/delete and invoice action
  document.getElementById('material-tbody')?.addEventListener('click', async (e) => {
    const viewInv = e.target.closest('.view-order-invoice');
    if (viewInv) {
      const invId = parseInt(viewInv.dataset.invoiceId, 10);
      const inv = (currentInvoices || []).find(i => i.id === invId);
      if (inv) {
        await navigate('invoices');
        showInvoicePreview(inv);
        return;
      }
    }

    const invAction = e.target.closest('.btn-invoice-action');
    if (invAction) {
      const orderId = parseInt(invAction.dataset.orderId, 10);
      const invId = invAction.dataset.invoiceId ? parseInt(invAction.dataset.invoiceId, 10) : null;
      if (invId) {
        const inv = (currentInvoices || []).find(i => i.id === invId);
        if (inv) {
          await navigate('invoices');
          showInvoicePreview(inv);
        }
      } else {
        await navigate('invoices');
        openInvoiceStudioModal(null, { type: 'material', id: orderId });
      }
      return;
    }

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

export async function openMaterialModal(order = null, openWithInvoiceImport = false) {
  const isEdit = !!order;
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');

  const allInvoices = await getAll('invoices');
  const mappedInvoice = order ? allInvoices.find(inv => 
    (order.invoiceId && inv.id === order.invoiceId) || 
    inv.mappedComponentOrderId === order.id || 
    inv.metadata?.component_order_id === order.id
  ) : null;

  container.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'Edit Material Order' : 'New Material Order'}</h2>
      <button class="modal-close" id="modal-close">
        <span class="material-icons-round">close</span>
      </button>
    </div>
    <div class="modal-body">
      <!-- INVOICE IMPORT / MAPPING SECTION -->
      <div style="background:linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(139,92,246,0.07) 100%); padding:12px 16px; border-radius:var(--radius-sm); border:1px solid rgba(99,102,241,0.25); margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="font-size:0.85rem; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
            <span class="material-icons-round" style="font-size:18px; color:var(--accent-primary-light);">playlist_add</span>
            Add / Import Items List from Invoice:
          </strong>
          <span id="mat-invoice-import-status" class="status-badge ${mappedInvoice ? 'completed' : 'pending'}" style="font-size:0.7rem;">
            ${mappedInvoice ? `✓ Linked to ${mappedInvoice.metadata?.invoice_no || 'Invoice'}` : '1-Click Auto-Fill'}
          </span>
        </div>
        <div style="display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center;">
          <select class="form-select" id="mat-import-invoice-select" style="font-size:0.85rem;">
            <option value="">— Select an Invoice to auto-fill component list & pricing —</option>
            ${allInvoices.map(inv => {
              const invNo = inv.metadata?.invoice_no || inv.invoiceNumber || 'INV';
              const custName = inv.metadata?.customer_name || inv.customerName || 'Customer';
              const itemCount = inv.items?.length || 0;
              const total = inv.customer?.grand_total || inv.total || 0;
              const isSelected = mappedInvoice && mappedInvoice.id === inv.id;
              return `<option value="${inv.id}" ${isSelected ? 'selected' : ''}>${invNo} • ${custName} (${itemCount} items, ${formatCurrency(total)})</option>`;
            }).join('')}
          </select>
          <button type="button" class="btn-secondary btn-sm" id="btn-apply-invoice-import" style="padding:6px 14px; font-size:0.8rem; display:flex; align-items:center; gap:4px;">
            <span class="material-icons-round" style="font-size:16px;">download</span>
            <span>Import List</span>
          </button>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.73rem; color:var(--text-tertiary); margin-top:6px;">
          <span>Loads invoice components, customer name, contact, total price, and wholesale costs.</span>
          ${mappedInvoice ? `
            <button type="button" class="btn-xs btn-secondary btn-modal-view-invoice" data-invoice-id="${mappedInvoice.id}" style="padding:2px 8px; font-size:0.72rem;">
              <span class="material-icons-round" style="font-size:12px;">visibility</span> View Tax Invoice
            </button>
          ` : ''}
        </div>
      </div>

      <form id="material-form" class="form-grid">
        <div class="form-group">
          <label class="form-label">Customer Name *</label>
          <input class="form-input" type="text" name="customerName" value="${order?.customerName || ''}" required placeholder="Customer name" />
        </div>
        <div class="form-group">
          <label class="form-label">Order Type</label>
          <select class="form-select" name="orderType">
            <option value="Component Order" ${order?.orderType === 'Component Order' || !order ? 'selected' : ''}>Component Order</option>
            <option value="Project Order" ${order?.orderType === 'Project Order' ? 'selected' : ''}>Project Order</option>
            <option value="Original Order" ${order?.orderType === 'Original Order' ? 'selected' : ''}>Original Order</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Order Date</label>
          <input class="form-input" type="date" name="orderDate" value="${formatDateForInput(order?.orderDate) || new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-group full-width" style="position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <label class="form-label" style="margin:0;">Component Items List *</label>
            <span style="font-size:0.73rem; color:var(--text-tertiary);">One component per line with quantity: e.g. "• Arduino Uno (2)"</span>
          </div>
          <textarea class="form-textarea" name="materialItem" id="material-item-input" rows="4" required placeholder="• Component Name (1)&#10;• Component Name (2)&#10;(or import from invoice above / search catalog below)" style="font-family:monospace; font-size:0.85rem; line-height:1.5;">${order?.materialItem || ''}</textarea>
          
          <div style="margin-top:6px; display:flex; gap:8px; align-items:center; position:relative;">
            <span class="material-icons-round" style="font-size:16px; color:var(--accent-primary-light);">search</span>
            <input type="text" id="catalog-quick-search-input" class="form-input" placeholder="Type to search 518 catalog components to append to list..." style="font-size:0.8rem; padding:4px 8px;" autocomplete="off" />
            <div id="material-catalog-dropdown" class="bom-catalog-dropdown hidden" style="top:100%; left:0; width:100%; z-index:100;"></div>
          </div>
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

  let selectedInvoiceId = mappedInvoice ? mappedInvoice.id : null;
  let selectedInvoiceNo = mappedInvoice ? (mappedInvoice.metadata?.invoice_no || mappedInvoice.invoiceNumber) : null;

  // Invoice import function
  const applyInvoiceToForm = (inv) => {
    if (!inv) return;
    selectedInvoiceId = inv.id;
    selectedInvoiceNo = inv.metadata?.invoice_no || inv.invoiceNumber;

    const items = inv.items || [];
    const formatted = items.map(item => `• ${item.description || item.name || 'Component'} (${item.quantity || 1})`).join('\n');
    const totalQty = items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 1), 0);
    const grandTotal = parseFloat(inv.customer?.grand_total || inv.total || 0);
    const wholesaleCost = parseFloat(inv.internal?.total_wholesale_cost || 0);
    const isPaid = (inv.metadata?.payment_status || inv.paymentStatus || '').toLowerCase() === 'paid';

    form.querySelector('[name="customerName"]').value = inv.metadata?.customer_name || inv.customerName || '';
    form.querySelector('[name="orderType"]').value = 'Component Order';
    if (inv.metadata?.invoice_date) {
      form.querySelector('[name="orderDate"]').value = formatDateForInput(inv.metadata.invoice_date);
    }
    form.querySelector('[name="materialItem"]').value = formatted || inv.materialItem || '';
    form.querySelector('[name="qty"]').value = totalQty || 1;
    form.querySelector('[name="unitPrice"]').value = totalQty > 0 ? (grandTotal / totalQty).toFixed(2) : grandTotal;
    form.querySelector('[name="totalPrice"]').value = grandTotal.toFixed(2);
    form.querySelector('[name="wholesaleTotal"]').value = wholesaleCost.toFixed(2);
    if (isPaid) {
      form.querySelector('[name="received"]').value = grandTotal.toFixed(2);
    }
    if (inv.metadata?.phone && inv.metadata.phone !== 'N/A') {
      form.querySelector('[name="contactNo"]').value = inv.metadata.phone;
    }

    const statusBadge = document.getElementById('mat-invoice-import-status');
    if (statusBadge) {
      statusBadge.className = 'status-badge completed';
      statusBadge.textContent = `✓ Imported ${items.length} items from ${selectedInvoiceNo}`;
    }

    showToast(`✓ Imported ${items.length} items from Invoice ${selectedInvoiceNo}!`, 'success');
  };

  document.getElementById('btn-apply-invoice-import')?.addEventListener('click', () => {
    const invSelect = document.getElementById('mat-import-invoice-select');
    const invId = parseInt(invSelect?.value, 10);
    if (!invId) {
      showToast('Please select an invoice from the dropdown', 'warning');
      return;
    }
    const inv = allInvoices.find(i => i.id === invId);
    applyInvoiceToForm(inv);
  });

  document.getElementById('mat-import-invoice-select')?.addEventListener('change', (e) => {
    const invId = parseInt(e.target.value, 10);
    if (invId) {
      const inv = allInvoices.find(i => i.id === invId);
      applyInvoiceToForm(inv);
    }
  });

  if (openWithInvoiceImport) {
    const invSelect = document.getElementById('mat-import-invoice-select');
    if (invSelect && allInvoices.length > 0) {
      invSelect.focus();
    }
  }

  // Catalog live search autocomplete to append to items list
  const catalogSearchInput = document.getElementById('catalog-quick-search-input');
  if (catalogSearchInput && catalogDropdown) {
    catalogSearchInput.addEventListener('input', async () => {
      const q = catalogSearchInput.value.trim();
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
      const cost = parseFloat(row.dataset.cost) || 0;
      if (name) {
        const curText = itemInput.value.trim();
        const lineToAdd = `• ${name} (1)`;
        itemInput.value = curText ? `${curText}\n${lineToAdd}` : lineToAdd;
        catalogSearchInput.value = '';
        catalogDropdown.classList.add('hidden');

        // Increment wholesale cost
        const curWholesale = parseFloat(form.querySelector('[name="wholesaleTotal"]').value) || 0;
        form.querySelector('[name="wholesaleTotal"]').value = (curWholesale + cost).toFixed(2);
        showToast(`Appended "${name}" to component list`, 'info');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.form-group.full-width')) {
        catalogDropdown.classList.add('hidden');
      }
    });
  }

  // Invoice mapping buttons in modal
  document.querySelector('.btn-modal-view-invoice')?.addEventListener('click', async (e) => {
    const invId = parseInt(e.currentTarget.dataset.invoiceId, 10);
    const inv = allInvoices.find(i => i.id === invId);
    if (inv) {
      overlay.classList.add('hidden');
      await navigate('invoices');
      showInvoicePreview(inv);
    }
  });

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
      let savedOrderId = order?.id;
      if (isEdit) {
        data.id = order.id;
        data.createdAt = order.createdAt;
        data.batchId = order.batchId || '';
        data.linkedProjectId = order.linkedProjectId || null;
        data.invoiceId = selectedInvoiceId || order.invoiceId || null;
        data.invoiceNo = selectedInvoiceNo || order.invoiceNo || null;
        await update('materialOrders', data);
        showToast('Material order updated');
      } else {
        data.invoiceId = selectedInvoiceId || null;
        data.invoiceNo = selectedInvoiceNo || null;
        savedOrderId = await add('materialOrders', data);
        showToast('Material order added');
      }

      // If linked to an invoice, ensure invoice points back to this component order
      if (selectedInvoiceId && savedOrderId) {
        const targetInv = allInvoices.find(i => i.id === selectedInvoiceId);
        if (targetInv) {
          targetInv.mappedComponentOrderId = savedOrderId;
          if (!targetInv.metadata) targetInv.metadata = {};
          targetInv.metadata.component_order_id = savedOrderId;
          await update('invoices', targetInv);
        }
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

/**
 * Material Orders Page — CRUD for material/component orders
 * Multi-Select Numbered Lists, LOT Creation, Multi-Page Printable PDF & Wholesaler Packet
 */
import {
  getMaterialOrders, add, update, remove, getMaterialStats, getAll, getById,
  resetMaterialOrdersToSeed, getConsolidatedProcurement, batchOrdersIntoLot, getLotPacketData, searchCatalog,
  restoreFromTrash
} from '../db.js';
import { seedMaterialOrders } from '../seedData.js';
import {
  formatCurrency, formatDate, normalizeStatus, getStatusLabel,
  showToast, showConfirm, debounce, formatDateForInput,
  sanitizePhoneForWhatsApp, getPaymentAging, showUndoToast
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
let selectedOrderIds = new Set();

export function renderMaterialOrders() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Material Orders & Sourcing</h1>
        <p class="page-subtitle">Track wholesale procurement, direct component sales, and numbered LOT delivery batches</p>
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
    <div class="table-container" style="position:relative;">
      <div class="table-toolbar">
        <div class="table-search">
          <span class="material-icons-round">search</span>
          <input type="text" id="material-search" placeholder="Search by customer, item, contact, lot..." />
        </div>
        <div class="table-filters">
          <select class="filter-select" id="material-type-filter">
            <option value="">All Types</option>
            <option value="Component Order">Component</option>
            <option value="Project Order">Project Procurement</option>
            <option value="Original Order">Original</option>
          </select>
          <select class="filter-select" id="material-status-filter">
            <option value="">All Status</option>
            <option value="aging-7">⏰ Overdue (>7 Days)</option>
            <option value="aging-14">🚨 Critical (>14 Days)</option>
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
              <th style="width:36px; text-align:center;">
                <input type="checkbox" id="select-all-materials" class="table-checkbox" title="Select / Unselect all on this page" />
              </th>
              <th>Customer / Lot</th>
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

    <!-- Multi-select Batch Action Bar (Appears when 1+ orders are selected) -->
    <div id="material-batch-bar" class="batch-selection-bar hidden">
      <div class="batch-bar-left">
        <span class="material-icons-round" style="color:var(--accent-purple);">check_circle</span>
        <span id="batch-selected-count">0 orders selected</span>
      </div>
      <div class="batch-bar-actions">
        <button class="btn-primary btn-sm" id="btn-batch-create-lot">
          <span class="material-icons-round" style="font-size:16px;">local_shipping</span>
          <span>Create New LOT (Numbered Lists)</span>
        </button>
        <button class="btn-secondary btn-sm" id="btn-batch-assign-existing">
          <span class="material-icons-round" style="font-size:16px;">playlist_add</span>
          <span>Add to Existing LOT</span>
        </button>
        <button class="btn-ghost btn-sm" id="btn-batch-clear-selection" style="color:var(--text-secondary);">
          <span>Cancel</span>
        </button>
      </div>
    </div>
  `;
}

export async function initMaterialOrders() {
  await loadMaterialOrders();
  renderMaterialStats();
  bindMaterialEvents();
}

async function loadMaterialOrders() {
  const isAgingFilter = statusFilter === 'aging-7' || statusFilter === 'aging-14';
  const backendFilter = isAgingFilter ? '' : statusFilter;

  const [orders, allInvoices] = await Promise.all([
    getMaterialOrders({
      search: searchQuery,
      orderType: typeFilter,
      orderStatus: backendFilter,
    }),
    getAll('invoices')
  ]);

  let filtered = orders;
  if (statusFilter === 'aging-7') {
    filtered = filtered.filter(o => !!getPaymentAging(o));
  } else if (statusFilter === 'aging-14') {
    filtered = filtered.filter(o => getPaymentAging(o)?.level === 'critical');
  }

  currentOrders = filtered;
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
        <div class="stat-card-label">Total Material Records</div>
        <div class="stat-card-value">${stats.totalOrders} <span style="font-size:0.72rem; color:var(--text-tertiary); font-weight:normal;">(${stats.directSalesCount} Direct, ${stats.projectProcurementCount} Project)</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon green">
            <span class="material-icons-round">payments</span>
          </div>
        </div>
        <div class="stat-card-label">Direct Component Revenue</div>
        <div class="stat-card-value">${formatCurrency(stats.totalRevenue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon blue">
            <span class="material-icons-round">account_balance_wallet</span>
          </div>
        </div>
        <div class="stat-card-label">Direct Sales Received</div>
        <div class="stat-card-value">${formatCurrency(stats.totalReceived)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon orange">
            <span class="material-icons-round">pending</span>
          </div>
        </div>
        <div class="stat-card-label">Direct Pending Balance</div>
        <div class="stat-card-value" style="color: var(--text-warning)">${formatCurrency(stats.totalPendingAmount)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon red">
            <span class="material-icons-round">precision_manufacturing</span>
          </div>
        </div>
        <div class="stat-card-label">Total Wholesale Cost</div>
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
        <div class="stat-card-label">Direct Component Profit</div>
        <div class="stat-card-value" style="color: var(--text-success)">${formatCurrency(stats.totalProfit)}</div>
      </div>
    `;
  });
}

function updateBatchBar() {
  const bar = document.getElementById('material-batch-bar');
  const countEl = document.getElementById('batch-selected-count');
  if (!bar || !countEl) return;

  const count = selectedOrderIds.size;
  if (count > 0) {
    countEl.textContent = `${count} order${count > 1 ? 's' : ''} selected`;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

function renderMaterialTable() {
  const tbody = document.getElementById('material-tbody');
  if (!tbody) return;

  const start = (currentPage - 1) * pageSize;
  const pageOrders = currentOrders.slice(start, start + pageSize);

  // Update select-all checkbox on current page
  const selectAllCb = document.getElementById('select-all-materials');
  if (selectAllCb) {
    selectAllCb.checked = pageOrders.length > 0 && pageOrders.every(o => selectedOrderIds.has(o.id));
  }

  if (pageOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14">
          <div class="empty-state">
            <div class="empty-state-icon">
              <span class="material-icons-round">shopping_cart</span>
            </div>
            <h3>No material orders found</h3>
            <p>Add your first material order or select project orders to batch.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageOrders.map(order => {
    const status = normalizeStatus(order.orderStatus);
    const netProfit = parseFloat(order.netProfit) || 0;
    const isProjectOrder = order.orderType === 'Project Order' || !!order.linkedProjectId;
    const isSelected = selectedOrderIds.has(order.id);

    const mappedInvoice = (currentInvoices || []).find(inv => 
      (order.invoiceId && inv.id === order.invoiceId) || 
      inv.mappedComponentOrderId === order.id || 
      inv.metadata?.component_order_id === order.id
    );

    return `
      <tr data-id="${order.id}" class="${isSelected ? 'row-selected' : ''}">
        <td style="text-align:center;">
          <input type="checkbox" class="material-row-checkbox table-checkbox" data-id="${order.id}" ${isSelected ? 'checked' : ''} />
        </td>
        <td class="cell-name">
          <div style="font-weight:600;">${order.customerName || '—'}</div>
          <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-top:3px;">
            ${order.batchId ? `
              <span class="badge lot-badge view-lot-packet" data-lot="${order.batchId}" style="cursor:pointer;" title="Click to View / Print Multi-Page Packet (${order.batchId})">
                <span class="material-icons-round" style="font-size:11px;">local_shipping</span>
                <span>${order.batchId} • List ${order.lotListNumber || 1}</span>
              </span>
            ` : `
              <span class="badge lot-badge-pending" title="Awaiting batch allocation">
                <span class="material-icons-round" style="font-size:10px;">hourglass_top</span>
                <span>Unbatched</span>
              </span>
            `}
            ${order.linkedProjectId ? `
              <span class="jump-to-project" data-project-id="${order.linkedProjectId}" style="font-size:0.68rem; color:var(--accent-purple); cursor:pointer; text-decoration:underline;" title="Click to jump to Project Order #${order.linkedProjectId}">
                (Proj #${order.linkedProjectId})
              </span>
            ` : ''}
          </div>
          ${mappedInvoice ? `
            <div style="margin-top:2px;">
              <span class="status-badge view-order-invoice" data-invoice-id="${mappedInvoice.id}" style="cursor:pointer; display:inline-flex; align-items:center; gap:3px; font-size:0.68rem; background:rgba(99,102,241,0.12); color:var(--accent-primary-light); border:1px solid rgba(99,102,241,0.25);" title="View Tax Invoice (${mappedInvoice.metadata?.invoice_no})">
                <span class="material-icons-round" style="font-size:11px;">receipt</span>
                <span>${mappedInvoice.metadata?.invoice_no || 'Invoice'}</span>
              </span>
            </div>
          ` : ''}
        </td>
        <td>
          <span class="status-badge ${isProjectOrder ? 'pending' : 'completed'}" style="font-size:0.7rem;">
            ${isProjectOrder ? 'Project Order' : (order.orderType || 'Component')}
          </span>
        </td>
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
        <td class="cell-money">${isProjectOrder ? '—' : formatCurrency(order.unitPrice)}</td>
        <td class="cell-money">
          ${isProjectOrder ? `<span style="font-size:0.72rem; color:var(--accent-purple); font-weight:700;" title="Customer payment is tracked under Project Orders">Project Billed</span>` : formatCurrency(order.totalPrice)}
        </td>
        <td class="cell-money ${parseFloat(order.balance) > 0 ? 'negative' : ''}">
          ${isProjectOrder ? '—' : `
            <div>${formatCurrency(order.balance)}</div>
            ${(() => {
              const aging = getPaymentAging(order);
              if (!aging) return '';
              return `
                <div style="margin-top:2px;">
                  <span style="font-size:0.65rem; padding:1px 5px; border-radius:4px; font-weight:700; background:${aging.level === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}; color:${aging.level === 'critical' ? 'var(--text-danger)' : 'var(--text-warning)'};" title="${aging.days} days elapsed without full payment">
                    ${aging.label}
                  </span>
                </div>
              `;
            })()}
          `}
        </td>
        <td class="cell-money" style="font-weight:600;">${formatCurrency(order.wholesaleTotal)}</td>
        <td class="cell-money">${formatCurrency(order.porterCharge)}</td>
        <td class="cell-money ${netProfit >= 0 ? 'positive' : 'negative'}">
          ${isProjectOrder ? `<span style="font-size:0.72rem; color:var(--text-tertiary);" title="Profit calculated in Project Order">In Project</span>` : formatCurrency(order.netProfit)}
        </td>
        <td><span class="status-badge ${status}">${getStatusLabel(status)}</span></td>
        <td>
          <div class="row-actions">
            ${order.contactNo ? `
              <button title="WhatsApp Customer" class="whatsapp-material" data-id="${order.id}" style="color:#25D366">
                <span class="material-icons-round">chat</span>
              </button>
            ` : ''}
            ${order.batchId ? `
              <button title="Print Multi-Page Packet (${order.batchId})" class="btn-print-lot view-lot-packet" data-lot="${order.batchId}" style="color:var(--accent-purple)">
                <span class="material-icons-round">print</span>
              </button>
            ` : ''}
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

  // Delegate edit/delete, view lot packet, invoice action, and checkboxes
  document.getElementById('material-tbody')?.addEventListener('click', async (e) => {
    // LOT Packet view/print button click
    const lotBtn = e.target.closest('.view-lot-packet');
    if (lotBtn) {
      const lotId = lotBtn.dataset.lot;
      if (lotId) {
        openLotPdfModal(lotId);
        return;
      }
    }

    // Row selection checkbox
    const rowCb = e.target.closest('.material-row-checkbox');
    if (rowCb) {
      const id = parseInt(rowCb.dataset.id, 10);
      if (rowCb.checked) {
        selectedOrderIds.add(id);
      } else {
        selectedOrderIds.delete(id);
      }
      updateBatchBar();
      const tr = rowCb.closest('tr');
      if (tr) tr.classList.toggle('row-selected', rowCb.checked);
      return;
    }

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

    // 1-Click jump to linked Project Order
    const jumpProj = e.target.closest('.jump-to-project');
    if (jumpProj) {
      const projId = parseInt(jumpProj.dataset.projectId, 10);
      if (projId) {
        await navigate('projects');
        setTimeout(() => {
          const row = document.querySelector(`tr[data-id="${projId}"]`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.background = 'rgba(168,85,247,0.25)';
            setTimeout(() => { row.style.background = ''; }, 2200);
          }
        }, 250);
        return;
      }
    }

    const editBtn = e.target.closest('.edit-material');
    const deleteBtn = e.target.closest('.delete-material');
    const whatsappBtn = e.target.closest('.whatsapp-material');

    if (whatsappBtn) {
      const id = parseInt(whatsappBtn.dataset.id, 10);
      const order = currentOrders.find(o => o.id === id);
      if (order) openMaterialWhatsAppDialog(order);
      return;
    }

    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      const order = currentOrders.find(o => o.id === id);
      if (order) openMaterialModal(order);
    }

    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      const order = currentOrders.find(o => o.id === id);
      const confirmed = await showConfirm('Delete Material Order', `Are you sure you want to delete material order #${id} (${order?.customerName || ''})?`);
      if (confirmed) {
        const res = await remove('materialOrders', id);
        selectedOrderIds.delete(id);
        updateBatchBar();
        await loadMaterialOrders();
        renderMaterialStats();
        updateBadges();

        // 1-Click Undo Toast
        showUndoToast(`Deleted material order #${id} (${order?.customerName || ''})`, async () => {
          if (res?.trashRecordId) {
            await restoreFromTrash(res.trashRecordId);
            showToast(`Restored material order #${id} (${order?.customerName || ''})!`, 'success');
            await loadMaterialOrders();
            renderMaterialStats();
            updateBadges();
          }
        });
      }
    }
  });

  // Select All Checkbox on Current Page
  document.getElementById('select-all-materials')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const start = (currentPage - 1) * pageSize;
    const pageOrders = currentOrders.slice(start, start + pageSize);
    pageOrders.forEach(o => {
      if (isChecked) selectedOrderIds.add(o.id);
      else selectedOrderIds.delete(o.id);
    });
    renderMaterialTable();
    updateBatchBar();
  });

  // Batch Toolbar Actions
  document.getElementById('btn-batch-create-lot')?.addEventListener('click', () => {
    if (selectedOrderIds.size === 0) {
      showToast('Select at least 1 order to create a LOT', 'error');
      return;
    }
    openCreateLotModal([...selectedOrderIds]);
  });

  document.getElementById('btn-batch-assign-existing')?.addEventListener('click', async () => {
    if (selectedOrderIds.size === 0) {
      showToast('Select at least 1 order to assign to a LOT', 'error');
      return;
    }
    const allBatches = await getAll('porterBatches');
    if (allBatches.length === 0) {
      showToast('No existing LOT found. Please click "Create New LOT".', 'info');
      return;
    }
    const lotList = allBatches.map(b => b.lotId).join(', ');
    const chosenLot = prompt(`Enter existing LOT ID to add orders (${lotList}):`, allBatches[0].lotId);
    if (!chosenLot) return;
    const cleanLot = chosenLot.trim().toUpperCase();
    await batchOrdersIntoLot([...selectedOrderIds], cleanLot);
    showToast(`Assigned ${selectedOrderIds.size} orders to ${cleanLot}!`, 'success');
    selectedOrderIds.clear();
    updateBatchBar();
    await loadMaterialOrders();
    renderMaterialStats();
    openLotPdfModal(cleanLot);
  });

  document.getElementById('btn-batch-clear-selection')?.addEventListener('click', () => {
    selectedOrderIds.clear();
    updateBatchBar();
    renderMaterialTable();
  });
}

/**
 * 1-Click WhatsApp Client Messenger for Material / Component Orders
 */
function openMaterialWhatsAppDialog(order) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const cleanPhone = sanitizePhoneForWhatsApp(order.contactNo);
  const balance = parseFloat(order.balance) || 0;

  const msgReady = `Hi ${order.customerName || 'Customer'}! Your order for "${order.materialItem || 'components'}" is ready for pickup/dispatch! Remaining balance: ${formatCurrency(balance)}. Thanks, Project Mafia.`;
  const msgReminder = `Hi ${order.customerName || 'Customer'}, payment reminder regarding your component order "${order.materialItem || 'components'}". Outstanding balance: ${formatCurrency(balance)}. Thanks!`;

  container.innerHTML = `
    <div class="modal-header">
      <h2><span class="material-icons-round" style="color:#25D366; vertical-align:middle;">chat</span> WhatsApp Message — ${order.customerName || 'Customer'}</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <div class="modal-body">
      <p style="color:var(--text-secondary); margin-bottom:16px;">Send instant WhatsApp update to <strong>+${cleanPhone}</strong>:</p>
      
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="background:var(--bg-tertiary); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
          <strong style="color:var(--accent-green); display:block; margin-bottom:6px;">Option 1: Order Ready for Pickup / Dispatch</strong>
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
  document.getElementById('modal-close')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
  });
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  };
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
    const isProjectOrder = data.orderType === 'Project Order' || order?.orderType === 'Project Order' || !!order?.linkedProjectId;
    const totalPrice = isProjectOrder ? 0 : (parseFloat(data.totalPrice) || 0);
    const received = isProjectOrder ? 0 : (parseFloat(data.received) || 0);
    const wholesaleTotal = parseFloat(data.wholesaleTotal) || 0;
    const porterCharge = parseFloat(data.porterCharge) || 0;

    data.qty = parseFloat(data.qty) || 1;
    data.unitPrice = isProjectOrder ? 0 : (parseFloat(data.unitPrice) || 0);
    data.totalPrice = totalPrice;
    data.received = received;
    data.wholesaleTotal = wholesaleTotal;
    data.porterCharge = porterCharge;
    data.balance = isProjectOrder ? 0 : (totalPrice - received);
    data.netProfit = isProjectOrder ? 0 : (totalPrice - wholesaleTotal - porterCharge);

    try {
      let savedOrderId = order?.id;
      if (isEdit) {
        data.id = order.id;
        data.createdAt = order.createdAt;
        data.batchId = order.batchId || '';
        data.lotId = order.lotId || order.batchId || '';
        data.lotListNumber = order.lotListNumber || null;
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

      // Two-way sync: If linked to a project order, automatically update wholesale parts cost on project
      if (data.linkedProjectId) {
        const proj = await getById('projectOrders', parseInt(data.linkedProjectId, 10));
        if (proj) {
          if (wholesaleTotal > 0) proj.materialCost = wholesaleTotal;
          if (data.batchId) proj.batchId = data.batchId;
          if (data.lotListNumber) proj.lotListNumber = data.lotListNumber;
          const pay = parseFloat(proj.payment) || 0;
          const misc = parseFloat(proj.miscExpenses) || 0;
          proj.profit = parseFloat((pay - proj.materialCost - misc).toFixed(2));
          await update('projectOrders', proj);
        }
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

/**
 * Modal to Create a new LOT from selected orders, giving each order List 1, List 2...
 */
export async function openCreateLotModal(orderIds = []) {
  if (!orderIds || orderIds.length === 0) {
    showToast('Please select at least one order to create a LOT', 'error');
    return;
  }

  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const [allMaterials, allBatches, allProjects] = await Promise.all([
    getAll('materialOrders'),
    getAll('porterBatches'),
    getAll('projectOrders')
  ]);

  const selectedOrders = orderIds.map(id => allMaterials.find(m => m.id === id)).filter(Boolean);

  // Auto-calculate next LOT number (e.g. LOT-08)
  let nextLotNum = 1;
  allBatches.forEach(b => {
    const m = (b.lotId || '').match(/LOT-(\d+)/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num >= nextLotNum) nextLotNum = num + 1;
    }
  });
  const defaultLotName = `LOT-${String(nextLotNum).padStart(2, '0')}`;

  container.innerHTML = `
    <div class="modal-header">
      <h2><span class="material-icons-round" style="color:var(--accent-purple); vertical-align:middle;">local_shipping</span> Create New LOT & Numbered Lists</h2>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <div class="modal-body">
      <form id="create-lot-form" class="form-grid">
        <div class="form-group">
          <label class="form-label">LOT ID * (e.g. ${defaultLotName})</label>
          <input class="form-input" type="text" name="lotId" value="${defaultLotName}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Delivery Date</label>
          <input class="form-input" type="date" name="date" value="${new Date().toISOString().split('T')[0]}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Wholesaler</label>
          <input class="form-input" type="text" name="wholesaler" value="Rajindra Electronics" required />
        </div>
        <div class="form-group">
          <label class="form-label">Total Porter Delivery Charge (₹)</label>
          <input class="form-input" type="number" step="0.01" name="porterCharge" id="input-lot-porter" value="250" placeholder="e.g. 250" />
        </div>

        <div class="form-group full-width" style="background:var(--bg-tertiary); padding:14px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="color:var(--text-primary); font-size:0.92rem;">
              Selected Orders Sequence (${selectedOrders.length} Numbered Lists):
            </strong>
            <span style="font-size:0.75rem; color:var(--accent-purple); font-weight:600;">
              Each order is assigned List 1, List 2...
            </span>
          </div>
          <div class="table-scroll" style="max-height:220px; overflow-y:auto;">
            <table class="data-table" style="font-size:0.82rem;">
              <thead>
                <tr>
                  <th style="width:60px;">List #</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Project / Item Summary</th>
                  <th>Wholesale Cost</th>
                </tr>
              </thead>
              <tbody>
                ${selectedOrders.map((o, idx) => {
                  let proj = null;
                  if (o.linkedProjectId) proj = allProjects.find(p => p.id === o.linkedProjectId);
                  const title = proj ? proj.projectName : (o.materialItem?.slice(0, 35) || '—');
                  return `
                    <tr>
                      <td><strong style="color:var(--accent-purple);">List ${idx + 1}</strong></td>
                      <td><strong>${o.customerName}</strong></td>
                      <td><span class="status-badge ${o.orderType === 'Component Order' ? 'completed' : 'pending'}" style="font-size:0.68rem;">${o.orderType}</span></td>
                      <td>${title}</td>
                      <td>${formatCurrency(o.wholesaleTotal)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="btn-confirm-create-lot">
        <span class="material-icons-round">check_circle</span>
        <span>Confirm LOT & Open Multi-Page PDF</span>
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');

  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  document.getElementById('btn-confirm-create-lot').onclick = async () => {
    const form = document.getElementById('create-lot-form');
    const formData = new FormData(form);
    const lotId = formData.get('lotId')?.trim().toUpperCase();
    const wholesaler = formData.get('wholesaler')?.trim();
    const porterCharge = parseFloat(formData.get('porterCharge')) || 0;

    if (!lotId) {
      showToast('Please enter a valid LOT ID', 'error');
      return;
    }

    try {
      await batchOrdersIntoLot(orderIds, lotId, porterCharge, wholesaler, 'Equal Split');
      showToast(`Successfully created ${lotId} with ${orderIds.length} numbered lists!`, 'success');
      overlay.classList.add('hidden');

      // Clear selection
      selectedOrderIds.clear();
      updateBatchBar();

      // Refresh data
      await loadMaterialOrders();
      renderMaterialStats();

      // Open multi-page PDF modal immediately!
      setTimeout(() => {
        openLotPdfModal(lotId);
      }, 200);
    } catch (err) {
      showToast('Error creating lot: ' + err.message, 'error');
    }
  };
}

/**
 * Modal to display and print the Multi-Page PDF packet:
 * Page 1 = Consolidated Master Sourcing Sheet for Rajindra Electronics
 * Pages 2 to N = Individual Polybag Workshop Slips (List 1, List 2...)
 */
export async function openLotPdfModal(lotId) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const packet = await getLotPacketData(lotId);
  if (!packet || packet.lists.length === 0) {
    showToast(`No orders found in ${lotId}`, 'error');
    return;
  }

  // Format WhatsApp message text
  const waLines = [
    `*PROJECT MAFIA — WHOLESALER ORDER (${packet.lotId})*`,
    `Wholesaler: ${packet.wholesaler}`,
    `Date: ${packet.date}`,
    `Total Orders: ${packet.orderCount} | Total Parts: ${packet.totalUnits}`,
    ``,
    `*MASTER PARTS LIST (CONSOLIDATED):*`
  ];
  packet.masterList.forEach(item => {
    waLines.push(`• ${item.name}: ${item.totalQty} pcs`);
  });
  waLines.push(``);
  waLines.push(`*POLYBAG BREAKDOWN (NUMBERED LISTS):*`);
  packet.lists.forEach(l => {
    waLines.push(`*List ${l.listNumber}: ${l.customerName} (${l.projectTitle})*`);
    l.components.forEach(c => {
      waLines.push(`  - ${c.name} (${c.qty})`);
    });
    waLines.push(``);
  });
  const fullWaText = waLines.join('\n');

  container.innerHTML = `
    <div class="modal-header no-print">
      <div>
        <h2 style="display:flex; align-items:center; gap:8px;">
          <span class="material-icons-round" style="color:var(--accent-purple); font-size:26px;">inventory</span>
          <span>${packet.lotId} — Multi-Page Workshop & Sourcing Packet</span>
        </h2>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
          ${packet.orderCount} Numbered Lists (List 1 to List ${packet.orderCount}) • ${packet.totalUnits} Total Components
        </p>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn-secondary btn-sm" id="btn-copy-wa-lot">
          <span class="material-icons-round" style="font-size:16px; color:#25D366;">content_copy</span>
          <span>Copy WhatsApp Text</span>
        </button>
        <button class="btn-primary btn-sm" id="btn-print-lot-pages">
          <span class="material-icons-round" style="font-size:16px;">print</span>
          <span>Print / Save as PDF</span>
        </button>
        <button class="modal-close" id="modal-close">
          <span class="material-icons-round">close</span>
        </button>
      </div>
    </div>

    <div class="modal-body" style="padding: 20px; max-height: 80vh; overflow-y: auto;">
      
      <div class="lot-pdf-toolbar no-print" style="background:var(--bg-tertiary); border:1px solid var(--border-primary); padding:12px 16px; border-radius:var(--radius-md); margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:0.85rem; color:var(--text-secondary);">
          💡 <strong>Printing Note:</strong> Clicking "Print / Save as PDF" automatically prints Page 1 (Master Sourcing List for Rajindra) followed by separate individual pages for each numbered list (List 1, List 2...) for polybag packaging.
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-xs btn-secondary" id="scroll-to-master">Master Sheet</button>
          <button class="btn-xs btn-secondary" id="scroll-to-lists">Individual Lists</button>
        </div>
      </div>

      <!-- Printable Multi-Page Area -->
      <div id="printable-lot-packet" class="lot-packet-content">

        <!-- ================= PAGE 1: MASTER SOURCING SHEET ================= -->
        <div class="lot-print-page" id="lot-page-master" style="background:white; color:#111; padding:30px; border-radius:8px; border:1px solid #ddd; margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:12px; margin-bottom:16px;">
            <div>
              <h1 style="margin:0; font-size:1.5rem; font-weight:800; letter-spacing:1px; color:#000;">PROJECT MAFIA</h1>
              <div style="font-size:0.85rem; color:#444; font-weight:600;">Consolidated Wholesaler Sourcing Sheet • Master Requisition</div>
            </div>
            <div style="text-align:right;">
              <div style="display:inline-block; border:2px solid #7c3aed; background:rgba(124,58,237,0.08); color:#7c3aed; font-weight:800; font-size:1.1rem; padding:4px 12px; border-radius:6px;">
                ${packet.lotId}
              </div>
              <div style="font-size:0.8rem; color:#555; margin-top:4px;">Date: ${formatDate(packet.date)}</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; background:#f9fafb; padding:12px 16px; border-radius:6px; border:1px solid #e5e7eb; margin-bottom:18px; font-size:0.85rem;">
            <div><span style="color:#666;">WHOLESALER:</span><br><strong style="font-size:0.95rem; color:#000;">${packet.wholesaler}</strong></div>
            <div><span style="color:#666;">TOTAL LISTS:</span><br><strong style="font-size:0.95rem; color:#000;">${packet.orderCount} Orders</strong></div>
            <div><span style="color:#666;">TOTAL COMPONENTS:</span><br><strong style="font-size:0.95rem; color:#000;">${packet.totalUnits} Units</strong></div>
            <div><span style="color:#666;">PORTER DELIVERY:</span><br><strong style="font-size:0.95rem; color:#000;">${formatCurrency(packet.totalPorterCharge)}</strong></div>
          </div>

          <!-- INDEX OF NUMBERED LISTS -->
          <div style="margin-bottom:20px;">
            <div style="font-size:0.85rem; font-weight:800; text-transform:uppercase; color:#374151; margin-bottom:6px; letter-spacing:0.5px;">
              Numbered Bag Index (List 1 to List ${packet.orderCount}):
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:0.82rem; border:1px solid #d1d5db;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="border:1px solid #d1d5db; padding:6px 10px; width:70px; text-align:center;">List #</th>
                  <th style="border:1px solid #d1d5db; padding:6px 10px; text-align:left;">Client Name</th>
                  <th style="border:1px solid #d1d5db; padding:6px 10px; text-align:left;">Project / Purpose</th>
                  <th style="border:1px solid #d1d5db; padding:6px 10px; width:80px; text-align:center;">Parts</th>
                  <th style="border:1px solid #d1d5db; padding:6px 10px; width:100px; text-align:center;">Bag Packed</th>
                </tr>
              </thead>
              <tbody>
                ${packet.lists.map(l => `
                  <tr>
                    <td style="border:1px solid #d1d5db; padding:6px 10px; text-align:center; font-weight:800; color:#7c3aed;">
                      List ${l.listNumber}
                    </td>
                    <td style="border:1px solid #d1d5db; padding:6px 10px; font-weight:600;">${l.customerName}</td>
                    <td style="border:1px solid #d1d5db; padding:6px 10px;">${l.projectTitle}</td>
                    <td style="border:1px solid #d1d5db; padding:6px 10px; text-align:center; font-weight:700;">${l.components.reduce((s, c) => s + c.qty, 0)}</td>
                    <td style="border:1px solid #d1d5db; padding:6px 10px; text-align:center;">[ &nbsp; ] Bag #${l.listNumber}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- MASTER CONSOLIDATED PARTS CHECKLIST FOR WHOLESALER -->
          <div>
            <div style="font-size:0.85rem; font-weight:800; text-transform:uppercase; color:#374151; margin-bottom:6px; letter-spacing:0.5px;">
              Consolidated Items to Pick from Warehouse (${packet.masterList.length} Unique Components):
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:0.82rem; border:1px solid #d1d5db;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="border:1px solid #d1d5db; padding:6px 10px; width:40px; text-align:center;">#</th>
                  <th style="border:1px solid #d1d5db; padding:6px 10px; text-align:left;">Component / Part Name</th>
                  <th style="border:1px solid #d1d5db; padding:6px 10px; width:100px; text-align:left;">Category</th>
                  <th style="border:1px solid #d1d5db; padding:6px 10px; width:80px; text-align:center;">Total Qty</th>
                  <th style="border:1px solid #d1d5db; padding:6px 10px; width:100px; text-align:right;">Est. Unit</th>
                  <th style="border:1px solid #d1d5db; padding:6px 10px; width:70px; text-align:center;">Picked</th>
                </tr>
              </thead>
              <tbody>
                ${packet.masterList.map((item, idx) => `
                  <tr>
                    <td style="border:1px solid #d1d5db; padding:5px 8px; text-align:center; color:#555;">${idx + 1}</td>
                    <td style="border:1px solid #d1d5db; padding:5px 8px; font-weight:700;">${item.name}</td>
                    <td style="border:1px solid #d1d5db; padding:5px 8px; color:#555;">${item.category}</td>
                    <td style="border:1px solid #d1d5db; padding:5px 8px; text-align:center; font-weight:800; font-size:0.95rem; color:#111;">
                      ${item.totalQty}
                    </td>
                    <td style="border:1px solid #d1d5db; padding:5px 8px; text-align:right; color:#555;">
                      ${item.wholesaleUnitCost > 0 ? formatCurrency(item.wholesaleUnitCost) : '—'}
                    </td>
                    <td style="border:1px solid #d1d5db; padding:5px 8px; text-align:center; font-size:1.1rem;">
                      ☐
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="margin-top:20px; display:flex; justify-content:space-between; font-size:0.75rem; color:#777; border-top:1px solid #e5e7eb; padding-top:8px;">
            <span>Generated by Project Mafia • Master Page 1</span>
            <span>Wholesaler Dispatch & Verification Copy</span>
          </div>
        </div>

        <!-- ================= PAGES 2 TO N: INDIVIDUAL POLYBAG SLIPS ================= -->
        ${packet.lists.map(list => `
          <div class="lot-print-page" id="lot-page-list-${list.listNumber}" style="background:white; color:#111; padding:30px; border-radius:8px; border:1px solid #ddd; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:12px; margin-bottom:16px;">
              <div>
                <div style="display:inline-block; background:#000; color:#fff; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:4px; text-transform:uppercase; margin-bottom:4px;">
                  PROJECT MAFIA WORKSHOP SLIP
                </div>
                <h1 style="margin:0; font-size:1.6rem; font-weight:800; color:#7c3aed;">
                  ${packet.lotId} — LIST #${list.listNumber}
                </h1>
                <div style="font-size:0.85rem; color:#444; font-weight:600; margin-top:2px;">
                  Bag #${list.listNumber} of ${packet.orderCount} in ${packet.lotId}
                </div>
              </div>
              <div style="text-align:right;">
                <div style="border:2px dashed #000; padding:6px 14px; font-weight:800; font-size:1.1rem; background:#f9fafb;">
                  POLYBAG #${list.listNumber}
                </div>
                <div style="font-size:0.8rem; color:#666; margin-top:6px;">Date: ${formatDate(list.orderDate || packet.date)}</div>
              </div>
            </div>

            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:12px; background:#f9fafb; padding:14px; border-radius:6px; border:1px solid #e5e7eb; margin-bottom:16px; font-size:0.88rem;">
              <div>
                <div style="color:#666; font-size:0.75rem; text-transform:uppercase;">CLIENT / RECIPIENT:</div>
                <strong style="font-size:1.1rem; color:#000;">${list.customerName}</strong>
                <div style="color:#555; margin-top:2px;">Phone: ${list.phone || '—'}</div>
              </div>
              <div>
                <div style="color:#666; font-size:0.75rem; text-transform:uppercase;">PROJECT TITLE / PURPOSE:</div>
                <strong style="font-size:1rem; color:#7c3aed;">${list.projectTitle}</strong>
                <div style="color:#555; margin-top:2px; font-size:0.78rem;">
                  ${list.linkedProjectId ? `Linked Project Order #${list.linkedProjectId}` : `Component Order #${list.orderId}`}
                </div>
              </div>
            </div>

            <div style="margin-bottom:16px;">
              <div style="font-size:0.82rem; font-weight:800; text-transform:uppercase; color:#374151; margin-bottom:6px;">
                Components Checklist for Bag #${list.listNumber}:
              </div>
              <table style="width:100%; border-collapse:collapse; font-size:0.85rem; border:1px solid #d1d5db;">
                <thead>
                  <tr style="background:#f3f4f6;">
                    <th style="border:1px solid #d1d5db; padding:6px 10px; width:40px; text-align:center;">#</th>
                    <th style="border:1px solid #d1d5db; padding:6px 10px; text-align:left;">Component / Part</th>
                    <th style="border:1px solid #d1d5db; padding:6px 10px; width:80px; text-align:center;">Qty</th>
                    <th style="border:1px solid #d1d5db; padding:6px 10px; width:120px; text-align:center;">Bag Packed</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.components.map((c, idx) => `
                    <tr>
                      <td style="border:1px solid #d1d5db; padding:6px 10px; text-align:center; color:#555;">${idx + 1}</td>
                      <td style="border:1px solid #d1d5db; padding:6px 10px; font-weight:700;">${c.name}</td>
                      <td style="border:1px solid #d1d5db; padding:6px 10px; text-align:center; font-weight:800; font-size:0.95rem; color:#7c3aed;">
                        ${c.qty}
                      </td>
                      <td style="border:1px solid #d1d5db; padding:6px 10px; text-align:center; font-size:1.1rem;">
                        ☐ Verified
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:6px; padding:12px; margin-bottom:16px; font-size:0.8rem; color:#92400e;">
              <strong>Packaging & Workshop Instructions:</strong><br>
              1. Count and check each part above.<br>
              2. Place all parts together inside <strong>Polybag #${list.listNumber}</strong>.<br>
              3. Write <strong>"${packet.lotId} - LIST ${list.listNumber} (${list.customerName})"</strong> on the exterior polybag sticker before handover or assembly.
            </div>

            <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top:1px dashed #999; padding-top:12px; font-size:0.8rem;">
              <div>
                <div>Packer Name: __________________________</div>
                <div style="margin-top:4px;">Date Packed: __________________________</div>
              </div>
              <div style="text-align:right;">
                <div>[ &nbsp; ] All parts confirmed and polybag sealed</div>
              </div>
            </div>
          </div>
        `).join('')}

      </div>
    </div>
    <div class="modal-footer no-print">
      <button class="btn-secondary" id="modal-cancel">Close</button>
      <button class="btn-primary" id="btn-print-lot-pages-bottom">
        <span class="material-icons-round">print</span> Print / Save as PDF
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');

  // Print handlers
  const doPrint = () => { window.print(); };
  document.getElementById('btn-print-lot-pages')?.addEventListener('click', doPrint);
  document.getElementById('btn-print-lot-pages-bottom')?.addEventListener('click', doPrint);

  // Copy WhatsApp text
  document.getElementById('btn-copy-wa-lot')?.addEventListener('click', () => {
    navigator.clipboard.writeText(fullWaText).then(() => {
      showToast('Copied WhatsApp parts list & numbered lists to clipboard!', 'success');
    }).catch(err => {
      showToast('Copy failed: ' + err.message, 'error');
    });
  });

  // Scroll shortcuts
  document.getElementById('scroll-to-master')?.addEventListener('click', () => {
    document.getElementById('lot-page-master')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('scroll-to-lists')?.addEventListener('click', () => {
    document.getElementById('lot-page-list-1')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Close handlers
  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
}

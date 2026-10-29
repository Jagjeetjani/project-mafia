/**
 * Porter Delivery Batches & Allocation Page
 * Matches user's exact spreadsheet for batching wholesaler deliveries & dynamic per-order cost division
 */
import { getPorterBatches, getAll, add, update, remove, syncPorterBatchAllocation } from '../db.js';
import { formatCurrency, formatDate, showToast, showConfirm, formatDateForInput } from '../utils.js';
import { openLotPdfModal } from './materials.js';

let currentBatches = [];
let searchQuery = '';
let statusFilter = '';

export function renderPorterBatches() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Porter Delivery Batches & Allocation</h1>
        <p class="page-subtitle">Consolidated wholesaler delivery lots, Porter charges, and dynamic per-order cost division</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-primary" id="btn-add-batch">
          <span class="material-icons-round">local_shipping</span>
          <span>New Delivery Batch</span>
        </button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid" id="batch-stats-grid"></div>

    <!-- Batches Table -->
    <div class="table-container">
      <div class="table-toolbar">
        <div class="table-search">
          <span class="material-icons-round">search</span>
          <input type="text" id="batch-search" placeholder="Search by Lot ID, wholesaler..." />
        </div>
        <div class="table-filters">
          <select class="filter-select" id="batch-status-filter">
            <option value="">All Statuses</option>
            <option value="Delivered">Delivered</option>
            <option value="In Transit">In Transit</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
      </div>

      <div class="table-scroll">
        <table class="data-table" id="batches-table">
          <thead>
            <tr>
              <th>Lot ID</th>
              <th>Date</th>
              <th>Wholesaler</th>
              <th>Total Porter Charge</th>
              <th>Orders Count</th>
              <th>Delivery Cost / Order</th>
              <th>Delivery Status</th>
              <th>Allocation Mode</th>
              <th>Total Wholesale Cost</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="batches-tbody"></tbody>
        </table>
      </div>
    </div>
  `;
}

export async function initPorterBatches() {
  await loadBatches();
  bindBatchEvents();
}

async function loadBatches() {
  const allBatches = await getPorterBatches();

  currentBatches = allBatches.filter(b => {
    const matchesSearch = !searchQuery ||
      b.lotId?.toLowerCase().includes(searchQuery) ||
      b.wholesaler?.toLowerCase().includes(searchQuery);
    const matchesStatus = !statusFilter || b.deliveryStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  renderBatchStats(allBatches);
  renderBatchTable();
}

function renderBatchStats(allBatches) {
  const grid = document.getElementById('batch-stats-grid');
  if (!grid) return;

  const totalPorter = allBatches.reduce((sum, b) => sum + (parseFloat(b.totalPorterCharge) || 0), 0);
  const totalWholesale = allBatches.reduce((sum, b) => sum + (parseFloat(b.totalWholesaleCost) || 0), 0);
  const totalOrdersInLots = allBatches.reduce((sum, b) => sum + (parseInt(b.ordersCount) || 0), 0);

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon purple">
          <span class="material-icons-round">local_shipping</span>
        </div>
      </div>
      <div class="stat-card-label">Total Batches</div>
      <div class="stat-card-value">${allBatches.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon blue">
          <span class="material-icons-round">receipt</span>
        </div>
      </div>
      <div class="stat-card-label">Orders Handled</div>
      <div class="stat-card-value">${totalOrdersInLots}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon orange">
          <span class="material-icons-round">two_wheeler</span>
        </div>
      </div>
      <div class="stat-card-label">Total Porter Charges</div>
      <div class="stat-card-value" style="color: var(--accent-orange)">${formatCurrency(totalPorter)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-icon green">
          <span class="material-icons-round">storefront</span>
        </div>
      </div>
      <div class="stat-card-label">Total Wholesaler Cost</div>
      <div class="stat-card-value" style="color: var(--text-success)">${formatCurrency(totalWholesale)}</div>
    </div>
  `;
}

function renderBatchTable() {
  const tbody = document.getElementById('batches-tbody');
  if (!tbody) return;

  if (currentBatches.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">
            <div class="empty-state-icon">
              <span class="material-icons-round">local_shipping</span>
            </div>
            <h3>No delivery batches found</h3>
            <p>Create a batch to group wholesale orders and automatically split Porter delivery charges.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = currentBatches.map(b => `
    <tr>
      <td class="cell-name"><strong style="color:var(--accent-purple)">${b.lotId}</strong></td>
      <td class="cell-secondary">${formatDate(b.date)}</td>
      <td>${b.wholesaler || 'Rajindra Electronics'}</td>
      <td class="cell-money" style="font-weight:600; color:var(--accent-orange);">${formatCurrency(b.totalPorterCharge)}</td>
      <td>
        <span class="badge" style="background:rgba(124,58,237,0.15); color:var(--accent-purple); padding:3px 10px; border-radius:12px; font-weight:600;">
          ${b.ordersCount || 0} orders
        </span>
      </td>
      <td class="cell-money"><strong>${formatCurrency(b.deliveryCostPerOrder)}</strong></td>
      <td>
        <span class="status-pill status-${(b.deliveryStatus || 'delivered').toLowerCase().replace(' ', '-')}">
          ${b.deliveryStatus || 'Delivered'}
        </span>
      </td>
      <td>
        <span style="font-size:0.8rem; color:var(--text-secondary); background:var(--bg-tertiary); padding:2px 8px; border-radius:4px; border:1px solid var(--border-secondary);">
          ${b.allocationMode || 'Equal Split'}
        </span>
      </td>
      <td class="cell-money" style="color:var(--text-secondary)">${formatCurrency(b.totalWholesaleCost)}</td>
      <td>
        <div class="row-actions">
          <button title="Print Multi-Page Packet & Numbered Lists" class="btn-print-lot-packet" data-lot="${b.lotId}" style="color:var(--accent-purple)">
            <span class="material-icons-round">print</span>
          </button>
          <button title="Auto-Sync & Re-Split to Orders" class="btn-sync-batch" data-lot="${b.lotId}" style="color:var(--accent-green)">
            <span class="material-icons-round">sync</span>
          </button>
          <button title="Edit Batch" class="btn-edit-batch" data-id="${b.id}">
            <span class="material-icons-round">edit</span>
          </button>
          <button title="Delete" class="delete btn-delete-batch" data-id="${b.id}">
            <span class="material-icons-round">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function bindBatchEvents() {
  document.getElementById('btn-add-batch')?.addEventListener('click', () => {
    openBatchModal();
  });

  document.getElementById('batch-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    loadBatches();
  });

  document.getElementById('batch-status-filter')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    loadBatches();
  });

  document.getElementById('batches-tbody')?.addEventListener('click', async (e) => {
    const printBtn = e.target.closest('.btn-print-lot-packet');
    const syncBtn = e.target.closest('.btn-sync-batch');
    const editBtn = e.target.closest('.btn-edit-batch');
    const deleteBtn = e.target.closest('.btn-delete-batch');

    if (printBtn) {
      const lotId = printBtn.dataset.lot;
      if (lotId) openLotPdfModal(lotId);
      return;
    }

    if (syncBtn) {
      const lotId = syncBtn.dataset.lot;
      syncBtn.disabled = true;
      try {
        await syncPorterBatchAllocation(lotId);
        showToast(`Recalculated & synchronized Porter split for ${lotId}!`, 'success');
        await loadBatches();
      } catch (err) {
        showToast('Sync error: ' + err.message, 'error');
      } finally {
        syncBtn.disabled = false;
      }
    }

    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      const batch = currentBatches.find(b => b.id === id);
      if (batch) openBatchModal(batch);
    }

    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      showConfirm({
        title: 'Delete Delivery Batch',
        message: 'Are you sure you want to delete this batch?',
        confirmText: 'Delete',
        danger: true,
        onConfirm: async () => {
          await remove('porterBatches', id);
          showToast('Batch deleted');
          await loadBatches();
        }
      });
    }
  });
}

export function openBatchModal(batch = null) {
  const isEdit = !!batch;
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  container.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'Edit Porter Delivery Batch' : 'New Porter Delivery Batch'}</h2>
      <button class="modal-close" id="modal-close">
        <span class="material-icons-round">close</span>
      </button>
    </div>
    <div class="modal-body">
      <form id="batch-form" class="form-grid">
        <div class="form-group">
          <label class="form-label">LOT ID * (e.g. LOT-08)</label>
          <input class="form-input" type="text" name="lotId" value="${batch?.lotId || 'LOT-' + String(currentBatches.length + 1).padStart(2, '0')}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Delivery Date</label>
          <input class="form-input" type="date" name="date" value="${formatDateForInput(batch?.date) || new Date().toISOString().split('T')[0]}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Wholesaler</label>
          <input class="form-input" type="text" name="wholesaler" value="${batch?.wholesaler || 'Rajindra Electronics'}" />
        </div>
        <div class="form-group">
          <label class="form-label">Total Porter Charge (₹) *</label>
          <input class="form-input" type="number" step="0.01" name="totalPorterCharge" id="modal-total-porter" value="${batch?.totalPorterCharge || 0}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Allocation Mode</label>
          <select class="form-select" name="allocationMode" id="modal-allocation-mode">
            <option value="Equal Split" ${batch?.allocationMode !== 'Single Payer / Custom' ? 'selected' : ''}>Equal Split (Auto-divided among orders)</option>
            <option value="Single Payer / Custom" ${batch?.allocationMode === 'Single Payer / Custom' ? 'selected' : ''}>Single Payer / Custom</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Delivery Status</label>
          <select class="form-select" name="deliveryStatus">
            <option value="Delivered" ${batch?.deliveryStatus === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="In Transit" ${batch?.deliveryStatus === 'In Transit' ? 'selected' : ''}>In Transit</option>
            <option value="Pending" ${batch?.deliveryStatus === 'Pending' ? 'selected' : ''}>Pending</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label class="form-label">Batch Notes</label>
          <textarea class="form-textarea" name="notes" placeholder="Notes about this delivery lot...">${batch?.notes || ''}</textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-save">
        <span class="material-icons-round">save</span>
        <span>${isEdit ? 'Update & Auto-Split' : 'Save & Calculate'}</span>
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');

  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  document.getElementById('modal-save').onclick = async () => {
    const form = document.getElementById('batch-form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.lotId) {
      showToast('Lot ID is required', 'error');
      return;
    }

    data.totalPorterCharge = parseFloat(data.totalPorterCharge) || 0;

    try {
      if (isEdit) {
        data.id = batch.id;
        data.ordersCount = batch.ordersCount || 0;
        data.totalWholesaleCost = batch.totalWholesaleCost || 0;
        data.deliveryCostPerOrder = batch.deliveryCostPerOrder || 0;
        await update('porterBatches', data);
        await syncPorterBatchAllocation(data.lotId);
        showToast('Batch updated and split applied!');
      } else {
        data.ordersCount = 0;
        data.totalWholesaleCost = 0;
        data.deliveryCostPerOrder = 0;
        await add('porterBatches', data);
        await syncPorterBatchAllocation(data.lotId);
        showToast('Delivery Batch created!');
      }

      overlay.classList.add('hidden');
      await loadBatches();
    } catch (err) {
      showToast('Error saving batch: ' + err.message, 'error');
    }
  };
}

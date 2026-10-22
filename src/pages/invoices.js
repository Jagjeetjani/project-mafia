/**
 * Invoices Page — Customer Invoice Generator & Profit Margin Studio
 * Integrated from C:\INVOICE: 25% margin auto-pricing, 518-item catalog autocomplete,
 * ₹700 free delivery rule, dual customer/internal summaries, and professional PDF/print.
 */
import { getAll, add, update, remove, searchCatalog, getCatalog } from '../db.js';
import { calculateInvoice, generateDefaultInvoiceNo, numberToWords } from '../invoiceCalculator.js';
import {
  formatCurrency, formatDate, formatDateForInput,
  showToast, showConfirm, debounce
} from '../utils.js';

let invoices = [];
let currentFilter = {
  search: '',
  type: '',
  status: ''
};
let currentViewingInvoice = null;
let currentPreviewTab = 'invoice'; // 'invoice' | 'profit' | 'wholesaler'

export function renderInvoices() {
  return `
    <div class="page-header" id="invoice-page-header">
      <div class="page-header-left">
        <h1 class="page-title">Invoices & Profit Studio</h1>
        <p class="page-subtitle">Customer Bill of Supply, 25% profit margin calculator, and wholesale tracking</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-primary" id="btn-create-invoice">
          <span class="material-icons-round">receipt_long</span>
          <span>Create Invoice & Calculate</span>
        </button>
      </div>
    </div>

    <!-- Main List Container -->
    <div class="table-container" id="invoice-list-container">
      <div class="table-toolbar">
        <div class="table-search">
          <span class="material-icons-round">search</span>
          <input type="text" id="invoice-search" placeholder="Search by customer, invoice #, phone..." />
        </div>
        <div class="table-filters">
          <select class="filter-select" id="invoice-type-filter">
            <option value="">All Types</option>
            <option value="Component Order">Component Order</option>
            <option value="Project Order">Project Order</option>
            <option value="Kit Order">Kit Order</option>
            <option value="Bulk Order">Bulk Order</option>
            <option value="Custom Order">Custom Order</option>
          </select>
          <select class="filter-select" id="invoice-status-filter">
            <option value="">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
            <option value="Partial">Partial</option>
            <option value="COD">COD</option>
          </select>
        </div>
      </div>

      <div class="table-scroll">
        <table class="data-table" id="invoices-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Type</th>
              <th>Items</th>
              <th>Wholesale Cost</th>
              <th>Grand Total</th>
              <th>Net Profit</th>
              <th>Margin</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="invoice-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- Interactive Invoice Preview & Print Studio (hidden by default) -->
    <div id="invoice-preview-wrapper" style="display: none; margin-top: 16px;">
      <div class="page-header" style="background:var(--bg-card); padding:16px 20px; border-radius:var(--radius-md); border:1px solid var(--border-primary); margin-bottom:20px;">
        <div class="page-header-left" style="display:flex; align-items:center; gap:16px;">
          <button class="btn-secondary" id="btn-back-to-list">
            <span class="material-icons-round">arrow_back</span>
            <span>Back to Invoices</span>
          </button>
          <!-- Preview Tabs -->
          <div style="display:flex; gap:6px; background:var(--bg-tertiary); padding:4px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
            <button class="btn-xs preview-tab active" data-tab="invoice" id="tab-btn-invoice">
              📄 Customer Tax Invoice
            </button>
            <button class="btn-xs preview-tab" data-tab="profit" id="tab-btn-profit">
              📊 Internal Profit Report
            </button>
            <button class="btn-xs preview-tab" data-tab="wholesaler" id="tab-btn-wholesaler">
              📦 Wholesaler Dispatch
            </button>
          </div>
        </div>
        <div class="page-header-actions" style="display:flex; gap:8px;">
          <button class="btn-secondary" id="btn-copy-preview-whatsapp">
            <span class="material-icons-round" style="color:#25D366;">chat</span>
            <span>Copy WhatsApp</span>
          </button>
          <button class="btn-primary" id="btn-print-current-view">
            <span class="material-icons-round">print</span>
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      <div id="invoice-preview-content"></div>
    </div>
  `;
}

export async function initInvoices() {
  await loadInvoices();
  bindInvoiceEvents();
}

async function loadInvoices() {
  const allInvoices = await getAll('invoices');
  invoices = allInvoices.filter(inv => {
    const q = currentFilter.search.toLowerCase().trim();
    const matchSearch = !q ||
      (inv.metadata?.invoice_no && inv.metadata.invoice_no.toLowerCase().includes(q)) ||
      (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
      (inv.metadata?.customer_name && inv.metadata.customer_name.toLowerCase().includes(q)) ||
      (inv.customerName && inv.customerName.toLowerCase().includes(q)) ||
      (inv.metadata?.phone && inv.metadata.phone.includes(q)) ||
      (inv.customerPhone && inv.customerPhone.includes(q));

    const type = inv.metadata?.order_type || inv.orderType || '';
    const matchType = !currentFilter.type || type.toLowerCase() === currentFilter.type.toLowerCase();

    const status = inv.metadata?.payment_status || inv.paymentStatus || 'Pending';
    const matchStatus = !currentFilter.status || status.toLowerCase() === currentFilter.status.toLowerCase();

    return matchSearch && matchType && matchStatus;
  });

  invoices.sort((a, b) => new Date(b.metadata?.invoice_date || b.date || b.createdAt || 0) - new Date(a.metadata?.invoice_date || a.date || a.createdAt || 0));
  renderInvoiceTable();
}

function renderInvoiceTable() {
  const tbody = document.getElementById('invoice-tbody');
  if (!tbody) return;

  if (invoices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11">
          <div class="empty-state">
            <div class="empty-state-icon">
              <span class="material-icons-round">receipt_long</span>
            </div>
            <h3>No invoices found</h3>
            <p>Generate your first customer invoice with auto-calculated 25% profit margin.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const meta = inv.metadata || {
      invoice_no: inv.invoiceNumber || 'INV-001',
      customer_name: inv.customerName || 'Customer',
      invoice_date: inv.date || '',
      order_type: inv.orderType || 'Component Order',
      payment_status: inv.paymentStatus || 'Pending'
    };
    const customer = inv.customer || {
      grand_total: inv.total || 0
    };
    const internal = inv.internal || {
      total_wholesale_cost: 0,
      final_net_profit: 0,
      final_net_margin_on_wholesale_pct: 0
    };

    const marginPct = parseFloat(internal.final_net_margin_on_wholesale_pct || 0);
    let marginClass = 'mid';
    if (marginPct >= 24) marginClass = 'high';
    else if (marginPct < 15) marginClass = 'low';

    const statusClass = meta.payment_status?.toLowerCase() === 'paid' ? 'completed' : 'pending';

    return `
      <tr data-id="${inv.id}">
        <td class="cell-name font-mono" style="color:var(--accent-primary-light); font-weight:700;">
          ${meta.invoice_no}
        </td>
        <td class="cell-name">
          <div>${meta.customer_name}</div>
          ${meta.phone && meta.phone !== 'N/A' ? `<div style="font-size:0.75rem; color:var(--text-tertiary);">${meta.phone}</div>` : ''}
        </td>
        <td class="cell-secondary">${formatDate(meta.invoice_date)}</td>
        <td><span class="status-badge" style="font-size:0.72rem; background:var(--bg-elevated);">${meta.order_type}</span></td>
        <td>${inv.items?.length || 0} items</td>
        <td class="cell-money">${formatCurrency(internal.total_wholesale_cost)}</td>
        <td class="cell-money font-bold" style="color:var(--text-primary);">${formatCurrency(customer.grand_total)}</td>
        <td class="cell-money positive">${formatCurrency(internal.final_net_profit)}</td>
        <td>
          <span class="margin-pill ${marginClass}">${marginPct > 0 ? '+' : ''}${marginPct.toFixed(1)}%</span>
        </td>
        <td><span class="status-badge ${statusClass}">${meta.payment_status}</span></td>
        <td>
          <div class="row-actions">
            <button title="View / Print Tax Invoice" class="view-invoice" data-id="${inv.id}">
              <span class="material-icons-round">visibility</span>
            </button>
            <button title="Edit Invoice" class="edit-invoice" data-id="${inv.id}">
              <span class="material-icons-round">edit</span>
            </button>
            <button title="Delete Invoice" class="delete delete-invoice" data-id="${inv.id}">
              <span class="material-icons-round">delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function bindInvoiceEvents() {
  // Search
  document.getElementById('invoice-search')?.addEventListener('input', debounce((e) => {
    currentFilter.search = e.target.value;
    loadInvoices();
  }, 250));

  // Type filter
  document.getElementById('invoice-type-filter')?.addEventListener('change', (e) => {
    currentFilter.type = e.target.value;
    loadInvoices();
  });

  // Status filter
  document.getElementById('invoice-status-filter')?.addEventListener('change', (e) => {
    currentFilter.status = e.target.value;
    loadInvoices();
  });

  // Create invoice button
  document.getElementById('btn-create-invoice')?.addEventListener('click', () => {
    openInvoiceStudioModal();
  });

  // Table row click delegation
  document.getElementById('invoice-tbody')?.addEventListener('click', async (e) => {
    const viewBtn = e.target.closest('.view-invoice');
    const editBtn = e.target.closest('.edit-invoice');
    const deleteBtn = e.target.closest('.delete-invoice');

    if (viewBtn) {
      const id = parseInt(viewBtn.dataset.id, 10);
      const invoice = invoices.find(i => i.id === id);
      if (invoice) showInvoicePreview(invoice, 'invoice');
    }

    if (editBtn) {
      const id = parseInt(editBtn.dataset.id, 10);
      const invoice = invoices.find(i => i.id === id);
      if (invoice) openInvoiceStudioModal(invoice);
    }

    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id, 10);
      const confirmed = await showConfirm('Delete Invoice', 'Are you sure you want to delete this invoice?');
      if (confirmed) {
        await remove('invoices', id);
        showToast('Invoice deleted successfully', 'success');
        await loadInvoices();
      }
    }
  });

  // Back from preview
  document.getElementById('btn-back-to-list')?.addEventListener('click', () => {
    document.getElementById('invoice-list-container').style.display = 'block';
    document.getElementById('invoice-page-header').style.display = 'flex';
    document.getElementById('invoice-preview-wrapper').style.display = 'none';
  });

  // Preview tab switches
  document.querySelectorAll('.preview-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preview-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPreviewTab = btn.dataset.tab;
      if (currentViewingInvoice) renderActivePreview(currentViewingInvoice);
    });
  });

  // Print button in preview
  document.getElementById('btn-print-current-view')?.addEventListener('click', () => {
    window.print();
  });

  // WhatsApp button in preview
  document.getElementById('btn-copy-preview-whatsapp')?.addEventListener('click', async () => {
    if (!currentViewingInvoice) return;
    const text = generateInvoiceWhatsAppText(currentViewingInvoice);
    try {
      await navigator.clipboard.writeText(text);
      showToast('✓ WhatsApp message copied to clipboard!', 'success');
    } catch {
      showToast('Please copy text manually', 'error');
    }
  });
}

/**
 * Open the Comprehensive Invoice Studio Modal (Matching C:\INVOICE)
 */
export async function openInvoiceStudioModal(existingInvoice = null) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const isEdit = !!existingInvoice;

  // Load project orders and catalog
  const [projectOrders, materialOrders, catalog] = await Promise.all([
    getAll('projectOrders'),
    getAll('materialOrders'),
    getCatalog()
  ]);

  // Extract initial state
  let currentItems = [];
  if (existingInvoice && existingInvoice.items) {
    currentItems = JSON.parse(JSON.stringify(existingInvoice.items));
  }

  let currentDelivery = {
    deliveryService: existingInvoice?.delivery?.deliveryService || "Direct Handover / Self Pickup",
    paidDeliveryFee: existingInvoice?.delivery?.paidDeliveryFee || 0,
    packagingMisc: existingInvoice?.delivery?.packagingMisc || 0,
    customerDeliveryFeeAmount: existingInvoice?.delivery?.customerDeliveryFeeAmount ?? 50,
    deliveryThreshold: existingInvoice?.delivery?.deliveryThreshold ?? 700
  };

  let currentMeta = {
    customer_name: existingInvoice?.metadata?.customer_name || existingInvoice?.customerName || "",
    phone: existingInvoice?.metadata?.phone || existingInvoice?.customerPhone || "",
    delivery_address: existingInvoice?.metadata?.delivery_address || existingInvoice?.customerAddress || "",
    order_notes: existingInvoice?.metadata?.order_notes || existingInvoice?.notes || "",
    invoice_no: existingInvoice?.metadata?.invoice_no || existingInvoice?.invoiceNumber || generateDefaultInvoiceNo(),
    invoice_date: existingInvoice?.metadata?.invoice_date || existingInvoice?.date || new Date().toISOString().split('T')[0],
    order_type: existingInvoice?.metadata?.order_type || existingInvoice?.orderType || "Component Order",
    payment_status: existingInvoice?.metadata?.payment_status || existingInvoice?.paymentStatus || "Pending"
  };

  // Extract catalog categories
  const categories = Array.from(new Set(catalog.map(c => c.category || 'General'))).sort();

  container.innerHTML = `
    <div class="modal-header">
      <div>
        <h2 style="display:flex; align-items:center; gap:8px;">
          <span class="material-icons-round" style="color:var(--accent-primary-light); font-size:26px;">receipt_long</span>
          <span>${isEdit ? 'Edit Invoice & Profit Margin' : 'New Customer Invoice & Profit Calculator'}</span>
        </h2>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
          Auto-calculates customer prices with 25% profit margin over wholesale bill (after 18% GST)
        </p>
      </div>
      <button class="modal-close" id="modal-close">
        <span class="material-icons-round">close</span>
      </button>
    </div>

    <div class="modal-body" style="display:flex; flex-direction:column; gap:20px;">
      
      <!-- 1. AUTO-IMPORT FROM PROJECT OR MATERIAL ORDER -->
      <div style="background:linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%); padding:14px; border-radius:var(--radius-md); border:1px solid rgba(99,102,241,0.25);">
        <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
          <span><span class="material-icons-round" style="font-size:18px; vertical-align:middle; color:var(--accent-primary-light);">sync_alt</span> 1-Click Import from Project / Material Order</span>
          <span style="font-size:0.75rem; color:var(--accent-primary-light); font-weight:600;">Auto-fills customer info & components</span>
        </label>
        <select class="form-select" id="inv-import-selector">
          <option value="">— Select an existing order to auto-populate —</option>
          <optgroup label="Project Orders">
            ${projectOrders.map(p => `
              <option value="project_${p.id}">${p.name} — ${p.projectName} (${formatCurrency(p.payment)})</option>
            `).join('')}
          </optgroup>
          <optgroup label="Material Orders">
            ${materialOrders.map(m => `
              <option value="material_${m.id}">${m.customerName} — ${m.materialItem ? m.materialItem.substring(0, 35) : 'Components'} (${formatCurrency(m.totalPrice)})</option>
            `).join('')}
          </optgroup>
        </select>
      </div>

      <!-- 2. CUSTOMER & INVOICE DETAILS GRID -->
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Customer Name *</label>
          <input class="form-input" type="text" id="inv-customer-name" value="${currentMeta.customer_name}" required placeholder="Customer name" />
        </div>
        <div class="form-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <label class="form-label" style="margin:0;">Invoice No *</label>
            <button type="button" class="btn-xs btn-secondary" id="btn-randomize-inv" style="padding:2px 8px; font-size:0.75rem;">
              🎲 Randomize
            </button>
          </div>
          <input class="form-input font-mono font-bold" type="text" id="inv-invoice-no" value="${currentMeta.invoice_no}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input class="form-input" type="text" id="inv-phone" value="${currentMeta.phone}" placeholder="10-digit phone" />
        </div>
        <div class="form-group">
          <label class="form-label">Invoice Date</label>
          <input class="form-input" type="date" id="inv-date" value="${formatDateForInput(currentMeta.invoice_date)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Order Type</label>
          <select class="form-select" id="inv-order-type">
            <option value="Component Order" ${currentMeta.order_type === 'Component Order' ? 'selected' : ''}>Component Order</option>
            <option value="Project Order" ${currentMeta.order_type === 'Project Order' ? 'selected' : ''}>Project Order</option>
            <option value="Kit Order" ${currentMeta.order_type === 'Kit Order' ? 'selected' : ''}>Kit Order</option>
            <option value="Bulk Order" ${currentMeta.order_type === 'Bulk Order' ? 'selected' : ''}>Bulk Order</option>
            <option value="Custom Order" ${currentMeta.order_type === 'Custom Order' ? 'selected' : ''}>Custom Order</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Payment Status</label>
          <select class="form-select" id="inv-payment-status">
            <option value="Pending" ${currentMeta.payment_status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Paid" ${currentMeta.payment_status === 'Paid' ? 'selected' : ''}>Paid</option>
            <option value="Partial" ${currentMeta.payment_status === 'Partial' ? 'selected' : ''}>Partial</option>
            <option value="COD" ${currentMeta.payment_status === 'COD' ? 'selected' : ''}>COD</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label class="form-label">Delivery Address</label>
          <input class="form-input" type="text" id="inv-address" value="${currentMeta.delivery_address}" placeholder="Shipping address or Pickup location" />
        </div>
      </div>

      <!-- 3. DELIVERY & LOGISTICS EXPENSE SETUP -->
      <div style="background:var(--bg-tertiary); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
        <strong style="color:var(--text-primary); font-size:0.9rem; display:block; margin-bottom:12px;">
          🚚 Delivery & Logistics Engine (Free Delivery Threshold: ₹700)
        </strong>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:12px;">
          <div>
            <label class="form-label" style="font-size:0.8rem;">Delivery Service</label>
            <select class="form-select" id="inv-delivery-service">
              <option value="Direct Handover / Self Pickup" ${currentDelivery.deliveryService === 'Direct Handover / Self Pickup' ? 'selected' : ''}>Direct Handover / Self Pickup</option>
              <option value="Porter" ${currentDelivery.deliveryService === 'Porter' ? 'selected' : ''}>Porter</option>
              <option value="Rapido" ${currentDelivery.deliveryService === 'Rapido' ? 'selected' : ''}>Rapido</option>
              <option value="India Post" ${currentDelivery.deliveryService === 'India Post' ? 'selected' : ''}>India Post</option>
              <option value="Courier" ${currentDelivery.deliveryService === 'Courier' ? 'selected' : ''}>Courier</option>
            </select>
          </div>
          <div>
            <label class="form-label" style="font-size:0.8rem;">Paid Delivery Fee (₹ Actual)</label>
            <input type="number" step="0.01" class="form-input" id="inv-paid-delivery" value="${currentDelivery.paidDeliveryFee}" placeholder="Porter expense paid" />
          </div>
          <div>
            <label class="form-label" style="font-size:0.8rem;">Packaging / Misc (₹)</label>
            <input type="number" step="0.01" class="form-input" id="inv-packaging-misc" value="${currentDelivery.packagingMisc}" placeholder="Box, tape, etc." />
          </div>
          <div>
            <label class="form-label" style="font-size:0.8rem;">Customer Fee to Charge (₹)</label>
            <input type="number" step="0.01" class="form-input" id="inv-customer-delivery-fee" value="${currentDelivery.customerDeliveryFeeAmount}" />
          </div>
          <div>
            <label class="form-label" style="font-size:0.8rem;">Free Delivery If Above (₹)</label>
            <input type="number" step="0.01" class="form-input" id="inv-delivery-threshold" value="${currentDelivery.deliveryThreshold}" />
          </div>
        </div>
      </div>

      <!-- 4. ADD ITEMS & 518 CATALOG SEARCH SECTION -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="color:var(--text-primary); font-size:0.95rem; display:flex; align-items:center; gap:6px;">
            <span class="material-icons-round" style="color:var(--accent-purple);">inventory</span>
            Invoice Items (<span id="inv-items-count">0</span> items)
          </strong>
          <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:var(--text-secondary); cursor:pointer;">
            <input type="checkbox" id="check-show-internal-profit" checked style="accent-color:var(--accent-primary);" />
            <span>Show Wholesale Cost & Margin Columns</span>
          </label>
        </div>

        <!-- Catalog Search Bar -->
        <div style="display:flex; gap:8px; margin-bottom:12px; position:relative;">
          <select id="inv-catalog-category" class="form-select" style="max-width:180px;">
            <option value="">All Categories</option>
            ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
          </select>
          <div style="flex:1; position:relative;">
            <input type="text" id="inv-catalog-search-input" class="form-input" placeholder="Search 518 catalog components by name..." autocomplete="off" />
            <div id="inv-catalog-search-dropdown" class="bom-catalog-dropdown hidden"></div>
          </div>
          <button type="button" class="btn-secondary" id="btn-add-custom-inv-item">
            <span class="material-icons-round">edit_note</span>
            <span>+ Custom Item</span>
          </button>
        </div>

        <!-- Items Table Header -->
        <div style="display:grid; grid-template-columns: 2.2fr 0.8fr 1fr 1fr 1fr 1fr 1fr 1fr auto; gap:6px; font-size:0.75rem; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; padding:0 8px 6px;">
          <div>Item Name</div>
          <div style="text-align:center;">Qty</div>
          <div style="text-align:right;">Pre-Tax Rate</div>
          <div style="text-align:center;">GST %</div>
          <div style="text-align:right;">Post-Tax Rate</div>
          <div style="text-align:right;">Line Total</div>
          <div class="col-internal-header" style="text-align:right; color:#d97706;">Wholesale Cost</div>
          <div class="col-internal-header" style="text-align:center; color:#d97706;">Margin %</div>
          <div style="width:30px;"></div>
        </div>

        <!-- Dynamic Items Container -->
        <div id="inv-items-container" style="max-height:300px; overflow-y:auto;"></div>
      </div>

      <!-- 5. LIVE DUAL SUMMARY CARDS -->
      <div class="invoice-dual-summary">
        <!-- Customer Bill Summary -->
        <div class="invoice-summary-card">
          <strong style="color:var(--text-primary); font-size:0.95rem; border-bottom:1px solid var(--border-secondary); padding-bottom:6px; margin-bottom:6px;">
            🧾 Customer Bill Summary
          </strong>
          <div class="invoice-summary-row">
            <span>Subtotal (Taxable Value):</span>
            <span id="sum-subtotal" class="font-mono">₹0.00</span>
          </div>
          <div class="invoice-summary-row">
            <span>Total GST (18%):</span>
            <span id="sum-gst" class="font-mono">₹0.00</span>
          </div>
          <div class="invoice-summary-row">
            <span id="label-delivery">Delivery Fee:</span>
            <span id="sum-delivery" class="font-mono">₹0.00</span>
          </div>
          <div class="invoice-summary-row">
            <span>Round Off Adjustment:</span>
            <span id="sum-roundoff" class="font-mono">₹0.00</span>
          </div>
          <div class="invoice-summary-row total-row">
            <span>GRAND TOTAL:</span>
            <span id="sum-grand-total" class="font-mono" style="color:var(--accent-primary-light);">₹0.00</span>
          </div>
        </div>

        <!-- Internal Profit Summary -->
        <div class="invoice-summary-card profit-card">
          <strong style="color:#d97706; font-size:0.95rem; border-bottom:1px solid rgba(245, 158, 11, 0.3); padding-bottom:6px; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
            <span class="material-icons-round" style="font-size:18px;">trending_up</span>
            Internal Profit Summary (25% Target Margin)
          </strong>
          <div class="invoice-summary-row">
            <span>Total Wholesale Cost:</span>
            <span id="profit-wholesale" class="font-mono">₹0.00</span>
          </div>
          <div class="invoice-summary-row">
            <span>Gross Profit (Products):</span>
            <span id="profit-gross" class="font-mono">₹0.00</span>
          </div>
          <div class="invoice-summary-row" style="color:#ef4444;">
            <span>Less: Logistics & Misc Expense:</span>
            <span id="profit-expense" class="font-mono">- ₹0.00</span>
          </div>
          <div class="invoice-summary-row" style="color:#10b981;">
            <span>Plus: Delivery Fee Charged:</span>
            <span id="profit-delivery-charged" class="font-mono">+ ₹0.00</span>
          </div>
          <div class="invoice-summary-row profit-total-row">
            <span>FINAL NET PROFIT:</span>
            <span id="profit-net" class="font-mono">₹0.00</span>
          </div>
          <div class="invoice-summary-row" style="margin-top:4px;">
            <span style="font-weight:600;">Net Profit Margin (% of Wholesale Bill):</span>
            <span id="profit-margin-badge" class="margin-pill high">0.0%</span>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div class="form-group full-width">
        <label class="form-label">Order Notes / Terms</label>
        <textarea class="form-textarea" id="inv-notes" placeholder="Special requirements, pickup timing, component details...">${currentMeta.order_notes}</textarea>
      </div>

    </div>

    <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <div style="display:flex; gap:8px;">
        <button class="btn-secondary" id="btn-inv-copy-whatsapp">
          <span class="material-icons-round" style="color:#25D366;">chat</span>
          <span>Copy WhatsApp List</span>
        </button>
        <button class="btn-primary" id="btn-save-invoice">
          <span class="material-icons-round">save</span>
          <span>${isEdit ? 'Save Changes' : 'Save Invoice'}</span>
        </button>
      </div>
    </div>
  `;

  overlay.classList.remove('hidden');

  const itemsContainer = document.getElementById('inv-items-container');
  const itemsCountEl = document.getElementById('inv-items-count');
  const showInternalCheck = document.getElementById('check-show-internal-profit');
  const searchInput = document.getElementById('inv-catalog-search-input');
  const searchDropdown = document.getElementById('inv-catalog-search-dropdown');
  const categorySelect = document.getElementById('inv-catalog-category');

  // Helper to re-render items and recalculate
  let calculatedData = null;

  function recalculateAndRender() {
    // Read delivery inputs
    currentDelivery.deliveryService = document.getElementById('inv-delivery-service').value;
    currentDelivery.paidDeliveryFee = parseFloat(document.getElementById('inv-paid-delivery').value) || 0;
    currentDelivery.packagingMisc = parseFloat(document.getElementById('inv-packaging-misc').value) || 0;
    currentDelivery.customerDeliveryFeeAmount = parseFloat(document.getElementById('inv-customer-delivery-fee').value) || 0;
    currentDelivery.deliveryThreshold = parseFloat(document.getElementById('inv-delivery-threshold').value) || 700;

    // Read metadata
    currentMeta.customer_name = document.getElementById('inv-customer-name').value.trim();
    currentMeta.phone = document.getElementById('inv-phone').value.trim();
    currentMeta.delivery_address = document.getElementById('inv-address').value.trim();
    currentMeta.order_notes = document.getElementById('inv-notes').value.trim();
    currentMeta.invoice_no = document.getElementById('inv-invoice-no').value.trim();
    currentMeta.invoice_date = document.getElementById('inv-date').value;
    currentMeta.order_type = document.getElementById('inv-order-type').value;
    currentMeta.payment_status = document.getElementById('inv-payment-status').value;

    calculatedData = calculateInvoice(currentItems, currentDelivery, currentMeta);

    itemsCountEl.textContent = currentItems.length;

    // Render items rows
    if (currentItems.length === 0) {
      itemsContainer.innerHTML = `
        <div style="text-align:center; padding:24px; color:var(--text-tertiary); font-size:0.85rem;">
          No items added yet. Search components from the 518 catalog above or import from an existing order.
        </div>
      `;
    } else {
      const showInternal = showInternalCheck.checked;
      document.querySelectorAll('.col-internal-header').forEach(el => {
        el.style.display = showInternal ? 'block' : 'none';
      });

      itemsContainer.innerHTML = calculatedData.items.map((item, idx) => `
        <div class="invoice-item-calc-row" style="grid-template-columns: 2.2fr 0.8fr 1fr 1fr 1fr 1fr ${showInternal ? '1fr 1fr' : ''} auto;">
          <div>
            <input type="text" class="form-input item-input-name" data-idx="${idx}" value="${item.name}" style="padding:4px 8px; font-size:0.82rem;" />
          </div>
          <div style="display:flex; align-items:center; justify-content:center; gap:2px;">
            <button type="button" class="btn-xs btn-secondary btn-qty-dec" data-idx="${idx}" style="padding:2px 5px;">−</button>
            <span style="font-weight:700; min-width:20px; text-align:center;">${item.quantity}</span>
            <button type="button" class="btn-xs btn-secondary btn-qty-inc" data-idx="${idx}" style="padding:2px 5px;">+</button>
          </div>
          <div>
            <input type="number" class="form-input item-input-pretax" data-idx="${idx}" value="${item.unit_price_excl_tax}" style="padding:4px 8px; font-size:0.82rem; text-align:right;" />
          </div>
          <div style="text-align:center; font-size:0.82rem; color:var(--text-tertiary);">
            18%
          </div>
          <div style="text-align:right; font-size:0.85rem; font-weight:600; color:var(--text-secondary);">
            ₹${item.unit_price_incl_gst.toFixed(2)}
          </div>
          <div style="text-align:right; font-size:0.85rem; font-weight:700; color:var(--text-primary);">
            ₹${item.line_total.toFixed(2)}
          </div>
          ${showInternal ? `
            <div style="text-align:right; font-size:0.82rem; color:#d97706;">
              <input type="number" step="0.01" class="form-input item-input-wholesale" data-idx="${idx}" value="${item.wholesale_unit_cost}" style="padding:4px 6px; font-size:0.8rem; text-align:right; color:#d97706;" />
            </div>
            <div style="text-align:center; font-size:0.8rem;">
              <span class="margin-pill ${item.net_margin_pct >= 24 ? 'high' : item.net_margin_pct >= 15 ? 'mid' : 'low'}">
                ${item.net_margin_pct > 0 ? '+' : ''}${item.net_margin_pct.toFixed(0)}%
              </span>
            </div>
          ` : ''}
          <div>
            <button type="button" class="btn-icon btn-del-item" data-idx="${idx}" style="color:var(--text-tertiary); padding:2px;" title="Remove Item">
              <span class="material-icons-round" style="font-size:16px;">close</span>
            </button>
          </div>
        </div>
      `).join('');
    }

    // Update Customer Summary
    const cust = calculatedData.customer;
    document.getElementById('sum-subtotal').textContent = formatCurrency(cust.subtotal);
    document.getElementById('sum-gst').textContent = formatCurrency(cust.total_gst);
    const delLabel = document.getElementById('label-delivery');
    if (cust.is_free_delivery) {
      delLabel.innerHTML = `Delivery Fee: <span style="color:#10b981; font-weight:600; font-size:0.75rem;">(Free ≥ ₹${currentDelivery.deliveryThreshold})</span>`;
      document.getElementById('sum-delivery').textContent = '₹0.00';
    } else {
      delLabel.innerHTML = `Delivery Fee: <span style="color:#f59e0b; font-size:0.75rem;">(Order < ₹${currentDelivery.deliveryThreshold})</span>`;
      document.getElementById('sum-delivery').textContent = formatCurrency(cust.delivery_fee);
    }
    document.getElementById('sum-roundoff').textContent = (cust.round_off >= 0 ? '+' : '') + formatCurrency(cust.round_off);
    document.getElementById('sum-grand-total').textContent = formatCurrency(cust.grand_total);

    // Update Internal Profit Summary
    const intnl = calculatedData.internal;
    document.getElementById('profit-wholesale').textContent = formatCurrency(intnl.total_wholesale_cost);
    document.getElementById('profit-gross').textContent = formatCurrency(intnl.gross_profit_products);
    document.getElementById('profit-expense').textContent = '- ' + formatCurrency(intnl.delivery_expense);
    document.getElementById('profit-delivery-charged').textContent = '+ ' + formatCurrency(intnl.delivery_fee_charged);
    document.getElementById('profit-net').textContent = formatCurrency(intnl.final_net_profit);

    const marginBadge = document.getElementById('profit-margin-badge');
    const margin = intnl.final_net_margin_on_wholesale_pct;
    marginBadge.textContent = `${margin > 0 ? '+' : ''}${margin.toFixed(1)}%`;
    marginBadge.className = `margin-pill ${margin >= 24 ? 'high' : margin >= 15 ? 'mid' : 'low'}`;
  }

  // Auto-import selector change
  document.getElementById('inv-import-selector').addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;

    if (val.startsWith('project_')) {
      const id = parseInt(val.replace('project_', ''), 10);
      const proj = projectOrders.find(p => p.id === id);
      if (proj) {
        document.getElementById('inv-customer-name').value = proj.name || '';
        document.getElementById('inv-phone').value = proj.phone || '';
        document.getElementById('inv-order-type').value = 'Project Order';
        document.getElementById('inv-notes').value = `Project: ${proj.projectName}`;

        // Parse components from materialItem
        currentItems = [];
        if (proj.materialItem) {
          const lines = proj.materialItem.split(/[\n•\r]+/).filter(l => l.trim().length > 0);
          lines.forEach(l => {
            let qty = 1;
            let name = l.trim();
            const m = l.match(/\((\d+)\)/);
            if (m) {
              qty = parseInt(m[1], 10);
              name = l.replace(/\(\d+\)/, '').trim();
            }
            // Match with catalog
            const matched = catalog.find(c => c.name.toLowerCase() === name.toLowerCase());
            currentItems.push({
              name: matched ? matched.name : name,
              quantity: qty,
              wholesale_unit_cost: matched ? (matched.wholesale_unit_cost || 0) : 0,
              unit_price_excl_tax: 0 // Will auto calculate 25% target
            });
          });
        }

        // If no components parsed, add single project line
        if (currentItems.length === 0) {
          currentItems.push({
            name: proj.projectName,
            quantity: 1,
            wholesale_unit_cost: proj.materialCost || 0,
            unit_price_excl_tax: Math.round(proj.payment / 1.18)
          });
        }
        recalculateAndRender();
        showToast(`Imported components for "${proj.projectName}"!`, 'info');
      }
    } else if (val.startsWith('material_')) {
      const id = parseInt(val.replace('material_', ''), 10);
      const mat = materialOrders.find(m => m.id === id);
      if (mat) {
        document.getElementById('inv-customer-name').value = mat.customerName || '';
        document.getElementById('inv-phone').value = mat.contactNo || '';
        document.getElementById('inv-order-type').value = mat.orderType || 'Component Order';

        currentItems = [];
        if (mat.materialItem) {
          const lines = mat.materialItem.split(/[\n•\r]+/).filter(l => l.trim().length > 0);
          lines.forEach(l => {
            let qty = 1;
            let name = l.trim();
            const m = l.match(/\((\d+)\)/);
            if (m) {
              qty = parseInt(m[1], 10);
              name = l.replace(/\(\d+\)/, '').trim();
            }
            const matched = catalog.find(c => c.name.toLowerCase() === name.toLowerCase());
            currentItems.push({
              name: matched ? matched.name : name,
              quantity: qty,
              wholesale_unit_cost: matched ? (matched.wholesale_unit_cost || 0) : 0,
              unit_price_excl_tax: 0
            });
          });
        }
        recalculateAndRender();
        showToast(`Imported components for "${mat.customerName}"!`, 'info');
      }
    }
  });

  // Randomize invoice number
  document.getElementById('btn-randomize-inv')?.addEventListener('click', () => {
    document.getElementById('inv-invoice-no').value = generateDefaultInvoiceNo();
  });

  // Toggle internal profit columns
  showInternalCheck.addEventListener('change', recalculateAndRender);

  // Search input live autocomplete
  searchInput.addEventListener('input', async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) {
      searchDropdown.classList.add('hidden');
      return;
    }

    const catFilter = categorySelect.value;
    let matches = await searchCatalog(q, 15);
    if (catFilter) {
      matches = matches.filter(m => m.category === catFilter);
    }

    if (matches.length === 0) {
      searchDropdown.innerHTML = `<div style="padding:10px; color:var(--text-tertiary); font-size:0.8rem;">No catalog match. Use "+ Custom Item" to add custom.</div>`;
      searchDropdown.classList.remove('hidden');
      return;
    }

    searchDropdown.innerHTML = matches.map(m => `
      <div class="bom-catalog-item" data-name="${m.name}" data-cost="${m.wholesale_unit_cost || 0}">
        <div>
          <strong style="color:var(--text-primary); display:block;">${m.name}</strong>
          <span style="font-size:0.75rem; color:var(--text-tertiary);">${m.category}</span>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.8rem; font-weight:700; color:#d97706;">Wholesale: ₹${(m.wholesale_unit_cost || 0).toFixed(2)}</div>
          <div style="font-size:0.75rem; color:#10b981;">Target 25%: ₹${((m.wholesale_unit_cost || 0) * 1.25).toFixed(0)}</div>
        </div>
      </div>
    `).join('');

    searchDropdown.classList.remove('hidden');
  });

  // Catalog item click
  searchDropdown.addEventListener('click', (e) => {
    const row = e.target.closest('.bom-catalog-item');
    if (!row) return;
    const name = row.dataset.name;
    const cost = parseFloat(row.dataset.cost) || 0;

    const existing = currentItems.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
    } else {
      currentItems.push({
        name,
        quantity: 1,
        wholesale_unit_cost: cost,
        unit_price_excl_tax: 0 // Will auto calculate 25% target
      });
    }

    searchInput.value = '';
    searchDropdown.classList.add('hidden');
    recalculateAndRender();
  });

  // Add custom item
  document.getElementById('btn-add-custom-inv-item')?.addEventListener('click', () => {
    const customName = prompt('Enter item description:');
    if (!customName) return;
    const customCost = parseFloat(prompt('Enter wholesale cost (₹):', '0')) || 0;
    currentItems.push({
      name: customName,
      quantity: 1,
      wholesale_unit_cost: customCost,
      unit_price_excl_tax: 0
    });
    recalculateAndRender();
  });

  // Click outside search dropdown
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#inv-catalog-search-input') && !e.target.closest('#inv-catalog-search-dropdown')) {
      searchDropdown.classList.add('hidden');
    }
  });

  // Items table delegation (+, -, delete, manual price inputs)
  itemsContainer.addEventListener('click', (e) => {
    const incBtn = e.target.closest('.btn-qty-inc');
    const decBtn = e.target.closest('.btn-qty-dec');
    const delBtn = e.target.closest('.btn-del-item');

    if (incBtn) {
      const idx = parseInt(incBtn.dataset.idx, 10);
      if (currentItems[idx]) {
        currentItems[idx].quantity = (currentItems[idx].quantity || 1) + 1;
        recalculateAndRender();
      }
    }

    if (decBtn) {
      const idx = parseInt(decBtn.dataset.idx, 10);
      if (currentItems[idx]) {
        if ((currentItems[idx].quantity || 1) > 1) {
          currentItems[idx].quantity = (currentItems[idx].quantity || 1) - 1;
          recalculateAndRender();
        } else {
          currentItems.splice(idx, 1);
          recalculateAndRender();
        }
      }
    }

    if (delBtn) {
      const idx = parseInt(delBtn.dataset.idx, 10);
      if (currentItems[idx]) {
        currentItems.splice(idx, 1);
        recalculateAndRender();
      }
    }
  });

  itemsContainer.addEventListener('input', (e) => {
    const nameInput = e.target.closest('.item-input-name');
    const pretaxInput = e.target.closest('.item-input-pretax');
    const wholesaleInput = e.target.closest('.item-input-wholesale');

    if (nameInput) {
      const idx = parseInt(nameInput.dataset.idx, 10);
      if (currentItems[idx]) currentItems[idx].name = nameInput.value;
    }
    if (pretaxInput) {
      const idx = parseInt(pretaxInput.dataset.idx, 10);
      if (currentItems[idx]) currentItems[idx].unit_price_excl_tax = parseFloat(pretaxInput.value) || 0;
      recalculateAndRender();
    }
    if (wholesaleInput) {
      const idx = parseInt(wholesaleInput.dataset.idx, 10);
      if (currentItems[idx]) currentItems[idx].wholesale_unit_cost = parseFloat(wholesaleInput.value) || 0;
      recalculateAndRender();
    }
  });

  // Delivery inputs change listeners
  ['inv-delivery-service', 'inv-paid-delivery', 'inv-packaging-misc', 'inv-customer-delivery-fee', 'inv-delivery-threshold']
    .forEach(id => {
      document.getElementById(id)?.addEventListener('input', recalculateAndRender);
    });

  // Initial calculation
  recalculateAndRender();

  // Close handlers
  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  // Copy WhatsApp from modal
  document.getElementById('btn-inv-copy-whatsapp')?.addEventListener('click', async () => {
    if (!calculatedData) return;
    const text = generateInvoiceWhatsAppText(calculatedData);
    try {
      await navigator.clipboard.writeText(text);
      showToast('✓ WhatsApp message copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
  });

  // Save Invoice Handler
  document.getElementById('btn-save-invoice')?.addEventListener('click', async () => {
    if (!currentMeta.customer_name) {
      showToast('Please enter Customer Name', 'error');
      return;
    }
    if (currentItems.length === 0) {
      showToast('Please add at least one item to the invoice', 'error');
      return;
    }

    recalculateAndRender();

    const invoiceRecord = {
      ...calculatedData,
      createdAt: isEdit ? existingInvoice.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (isEdit) {
        invoiceRecord.id = existingInvoice.id;
        await update('invoices', invoiceRecord);
        showToast('Invoice updated successfully', 'success');
      } else {
        await add('invoices', invoiceRecord);
        showToast('Invoice created successfully', 'success');
      }

      overlay.classList.add('hidden');
      await loadInvoices();
    } catch (err) {
      showToast('Error saving invoice: ' + err.message, 'error');
    }
  });
}

/**
 * Show Modern Invoice Preview Studio
 */
export function showInvoicePreview(invoice, defaultTab = 'invoice') {
  currentViewingInvoice = invoice;
  currentPreviewTab = defaultTab;

  const listContainer = document.getElementById('invoice-list-container');
  const pageHeader = document.getElementById('invoice-page-header');
  const previewWrapper = document.getElementById('invoice-preview-wrapper');

  if (listContainer) listContainer.style.display = 'none';
  if (pageHeader) pageHeader.style.display = 'none';
  if (previewWrapper) previewWrapper.style.display = 'block';

  document.querySelectorAll('.preview-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === currentPreviewTab);
  });

  renderActivePreview(invoice);
}

function renderActivePreview(invoice) {
  const previewContent = document.getElementById('invoice-preview-content');
  if (!previewContent) return;

  if (currentPreviewTab === 'invoice') {
    renderCustomerTaxInvoice(previewContent, invoice);
  } else if (currentPreviewTab === 'profit') {
    renderInternalProfitReport(previewContent, invoice);
  } else if (currentPreviewTab === 'wholesaler') {
    renderWholesalerDispatchSheet(previewContent, invoice);
  }
}

/**
 * 1. Customer-Facing Tax Invoice / Bill of Supply
 */
function renderCustomerTaxInvoice(container, invoice) {
  const meta = invoice.metadata || {};
  const cust = invoice.customer || {};
  const items = invoice.items || [];
  const words = numberToWords(cust.grand_total || 0);

  container.innerHTML = `
    <div class="invoice-preview-card" id="printable-customer-invoice">
      
      <!-- INVOICE HEADER -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1e3a5f; padding-bottom:18px; margin-bottom:20px;">
        <div>
          <h1 style="font-size:24px; font-weight:800; color:#1e3a5f; letter-spacing:0.5px; margin:0 0 4px 0;">
            PROJECT MAFIA
          </h1>
          <div style="font-size:12px; color:#475569; font-weight:600;">
            Ready-Made Projects & Electronic Components Procurement
          </div>
          <div style="font-size:11px; color:#64748b; margin-top:2px;">
            Tech Solutions • Microcontrollers • Sensors • Hardware Prototyping
          </div>
        </div>
        <div style="text-align:right;">
          <div style="display:inline-block; background:#1e3a5f; color:white; font-size:11px; font-weight:700; padding:4px 10px; border-radius:4px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">
            TAX INVOICE / BILL OF SUPPLY
          </div>
          <div style="font-family:monospace; font-weight:800; font-size:15px; color:#1e3a5f;">${meta.invoice_no || 'INV-001'}</div>
          <div style="font-size:12px; color:#64748b; margin-top:2px;">Date: ${formatDate(meta.invoice_date)}</div>
        </div>
      </div>

      <!-- BILLED TO & ORDER DETAILS -->
      <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:24px; margin-bottom:24px; font-size:12px; line-height:1.5;">
        <div style="background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0;">
          <div style="font-size:10px; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:6px;">BILLED TO</div>
          <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:2px;">${meta.customer_name || 'Valued Customer'}</div>
          ${meta.phone && meta.phone !== 'N/A' ? `<div style="color:#334155;"><strong>Phone:</strong> +91 ${meta.phone}</div>` : ''}
          ${meta.delivery_address && meta.delivery_address !== 'N/A' ? `<div style="color:#334155; margin-top:2px;"><strong>Address:</strong> ${meta.delivery_address}</div>` : ''}
          ${meta.order_notes ? `<div style="color:#64748b; font-style:italic; margin-top:4px;"><strong>Note:</strong> ${meta.order_notes}</div>` : ''}
        </div>
        <div style="background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0; font-size:12px;">
          <div style="font-size:10px; text-transform:uppercase; font-weight:700; color:#64748b; margin-bottom:6px;">ORDER METADATA</div>
          <div><strong>Order Type:</strong> ${meta.order_type || 'Component Order'}</div>
          <div style="margin-top:2px;"><strong>Payment Status:</strong> <span style="font-weight:700; color:${meta.payment_status === 'Paid' ? '#10b981' : '#f59e0b'};">${meta.payment_status || 'Pending'}</span></div>
          <div style="margin-top:2px;"><strong>Delivery Mode:</strong> ${invoice.delivery?.deliveryService || 'Direct Handover'}</div>
          <div style="margin-top:2px;"><strong>Place of Supply:</strong> Punjab, India</div>
        </div>
      </div>

      <!-- ITEMS TABLE -->
      <table style="width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:20px;">
        <thead>
          <tr style="background:#1e3a5f; color:white; font-size:11px; text-transform:uppercase;">
            <th style="padding:8px 6px; text-align:center; width:35px;">#</th>
            <th style="padding:8px 10px; text-align:left;">Item Description</th>
            <th style="padding:8px 6px; text-align:center; width:45px;">Qty</th>
            <th style="padding:8px 8px; text-align:right; width:85px;">Unit Price<br><span style="font-size:9px; font-weight:normal;">(Excl. Tax)</span></th>
            <th style="padding:8px 6px; text-align:center; width:45px;">GST</th>
            <th style="padding:8px 8px; text-align:right; width:95px;">Unit Price<br><span style="font-size:9px; font-weight:normal;">(Incl. GST)</span></th>
            <th style="padding:8px 10px; text-align:right; width:95px;">Total Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, idx) => `
            <tr style="border-bottom:1px solid #e2e8f0; background:${idx % 2 === 0 ? '#fff' : '#f8fafc'};">
              <td style="padding:8px 6px; text-align:center; color:#64748b;">${idx + 1}</td>
              <td style="padding:8px 10px; font-weight:600; color:#0f172a;">${item.name}</td>
              <td style="padding:8px 6px; text-align:center; font-weight:700;">${item.quantity}</td>
              <td style="padding:8px 8px; text-align:right; font-family:monospace;">₹${item.unit_price_excl_tax}</td>
              <td style="padding:8px 6px; text-align:center; color:#64748b;">18%</td>
              <td style="padding:8px 8px; text-align:right; font-family:monospace; color:#334155;">₹${item.unit_price_incl_gst.toFixed(2)}</td>
              <td style="padding:8px 10px; text-align:right; font-family:monospace; font-weight:700; color:#0f172a;">₹${item.line_total.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- FINANCIAL TOTALS & AMOUNT IN WORDS -->
      <div style="display:grid; grid-template-columns:1.3fr 1fr; gap:20px; margin-bottom:24px;">
        <div style="font-size:11px; color:#475569;">
          <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">Amount in Words:</div>
          <div style="font-style:italic; font-size:12px; font-weight:600; color:#1e3a5f; margin-bottom:14px;">${words}</div>

          <div style="border-top:1px dashed #cbd5e1; padding-top:8px;">
            <div style="font-weight:700; color:#0f172a; margin-bottom:2px;">Bank / UPI Payment Details:</div>
            <div><strong>Account Name:</strong> Project Mafia</div>
            <div><strong>UPI ID:</strong> projectmafia@okaxis</div>
            <div><strong>Accepted:</strong> Google Pay / PhonePe / Paytm / UPI</div>
          </div>
        </div>

        <div style="font-size:12px;">
          <div style="display:flex; justify-content:space-between; padding:4px 0;">
            <span style="color:#64748b;">Subtotal (Taxable Value):</span>
            <span style="font-family:monospace; font-weight:600;">₹${(cust.subtotal || 0).toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0;">
            <span style="color:#64748b;">Total GST (18%):</span>
            <span style="font-family:monospace; font-weight:600;">₹${(cust.total_gst || 0).toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0;">
            <span style="color:#64748b;">
              Delivery Fee ${cust.is_free_delivery ? '<span style="color:#10b981; font-weight:bold;">(Free ≥ ₹700)</span>' : ''}:
            </span>
            <span style="font-family:monospace; font-weight:600;">₹${(cust.delivery_fee || 0).toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:4px 0;">
            <span style="color:#64748b;">Round Off Adjustment:</span>
            <span style="font-family:monospace; color:#64748b;">${(cust.round_off >= 0 ? '+' : '')}₹${(cust.round_off || 0).toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-top:2px solid #1e3a5f; padding-top:8px; margin-top:4px; font-size:15px; font-weight:800; color:#1e3a5f;">
            <span>INVOICE GRAND TOTAL:</span>
            <span style="font-family:monospace;">₹${cust.grand_total || 0}.00</span>
          </div>
        </div>
      </div>

      <!-- TERMS AND SIGNATURE -->
      <div style="display:grid; grid-template-columns:1.6fr 1fr; gap:20px; border-top:1px solid #e2e8f0; padding-top:16px; font-size:10px; color:#64748b; line-height:1.4;">
        <div>
          <strong style="color:#0f172a; display:block; margin-bottom:4px;">Terms & Conditions:</strong>
          1. Goods once sold will be replaced only if verified defective upon delivery.<br/>
          2. All microcontrollers, sensors, and development boards are tested prior to dispatch.<br/>
          3. This is a computer generated invoice and requires no physical signature.<br/>
          4. Thank you for choosing Project Mafia for your hardware and engineering projects!
        </div>
        <div style="text-align:right;">
          <div style="margin-top:24px; font-weight:700; color:#0f172a;">For PROJECT MAFIA</div>
          <div style="font-size:9px; color:#94a3b8; margin-top:2px;">Authorized Signatory</div>
        </div>
      </div>

    </div>
  `;
}

/**
 * 2. Internal Procurement & Profit Report (matching C:\INVOICE)
 */
function renderInternalProfitReport(container, invoice) {
  const meta = invoice.metadata || {};
  const cust = invoice.customer || {};
  const intnl = invoice.internal || {};
  const del = invoice.delivery || {};
  const items = invoice.items || [];

  container.innerHTML = `
    <div class="invoice-preview-card" id="printable-profit-report" style="background:#fffbeb; border:1px solid #fde68a;">
      
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #b45309; padding-bottom:12px; margin-bottom:16px;">
        <div>
          <h1 style="font-size:20px; font-weight:800; color:#b45309; margin:0;">
            INTERNAL PROCUREMENT & PROFIT MARGIN REPORT
          </h1>
          <div style="font-size:11px; color:#92400e; margin-top:2px;">
            Target Margin: 25.0% over Wholesaler Bill (Confidential / Internal Use Only)
          </div>
        </div>
        <div style="text-align:right; font-size:12px; color:#92400e;">
          <div><strong>Invoice Ref:</strong> ${meta.invoice_no || 'N/A'}</div>
          <div><strong>Customer:</strong> ${meta.customer_name || 'N/A'}</div>
          <div><strong>Date:</strong> ${formatDate(meta.invoice_date)}</div>
        </div>
      </div>

      <!-- KEY METRICS ROW -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:16px;">
        <div style="background:#fff; border:1px solid #fcd34d; padding:10px; border-radius:6px; text-align:center;">
          <div style="font-size:10px; color:#92400e; font-weight:700; text-transform:uppercase;">Wholesale Cost</div>
          <div style="font-size:16px; font-weight:800; color:#b45309; margin-top:2px;">${formatCurrency(intnl.total_wholesale_cost)}</div>
        </div>
        <div style="background:#fff; border:1px solid #fcd34d; padding:10px; border-radius:6px; text-align:center;">
          <div style="font-size:10px; color:#92400e; font-weight:700; text-transform:uppercase;">Customer Total</div>
          <div style="font-size:16px; font-weight:800; color:#0f172a; margin-top:2px;">${formatCurrency(cust.grand_total)}</div>
        </div>
        <div style="background:#fff; border:1px solid #fcd34d; padding:10px; border-radius:6px; text-align:center;">
          <div style="font-size:10px; color:#92400e; font-weight:700; text-transform:uppercase;">Gross Profit</div>
          <div style="font-size:16px; font-weight:800; color:#10b981; margin-top:2px;">${formatCurrency(intnl.gross_profit_products)}</div>
        </div>
        <div style="background:#fff; border:1px solid #fcd34d; padding:10px; border-radius:6px; text-align:center;">
          <div style="font-size:10px; color:#92400e; font-weight:700; text-transform:uppercase;">Logistics Cost</div>
          <div style="font-size:16px; font-weight:800; color:#ef4444; margin-top:2px;">${formatCurrency(intnl.delivery_expense)}</div>
        </div>
        <div style="background:#fff; border:1px solid #fcd34d; padding:10px; border-radius:6px; text-align:center;">
          <div style="font-size:10px; color:#92400e; font-weight:700; text-transform:uppercase;">Net Profit</div>
          <div style="font-size:16px; font-weight:800; color:#059669; margin-top:2px;">${formatCurrency(intnl.final_net_profit)}</div>
        </div>
        <div style="background:#fff; border:1px solid #fcd34d; padding:10px; border-radius:6px; text-align:center;">
          <div style="font-size:10px; color:#92400e; font-weight:700; text-transform:uppercase;">Margin %</div>
          <div style="font-size:16px; font-weight:800; color:#d97706; margin-top:2px;">${(intnl.final_net_margin_on_wholesale_pct || 0).toFixed(1)}%</div>
        </div>
      </div>

      <!-- ITEM BY ITEM PROFIT TABLE -->
      <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px;">
        <thead>
          <tr style="background:#fef3c7; color:#92400e; text-transform:uppercase; border-bottom:1px solid #fcd34d;">
            <th style="padding:6px; text-align:center; width:30px;">#</th>
            <th style="padding:6px; text-align:left;">Component Description</th>
            <th style="padding:6px; text-align:center; width:40px;">Qty</th>
            <th style="padding:6px; text-align:right; width:75px;">Wholesale Unit</th>
            <th style="padding:6px; text-align:right; width:75px;">Wholesale Total</th>
            <th style="padding:6px; text-align:right; width:75px;">Customer Total</th>
            <th style="padding:6px; text-align:right; width:75px;">Gross Profit</th>
            <th style="padding:6px; text-align:center; width:65px;">Margin %</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, idx) => `
            <tr style="border-bottom:1px solid #fef3c7; background:${idx % 2 === 0 ? '#fff' : '#fffdf5'};">
              <td style="padding:6px; text-align:center; color:#92400e;">${idx + 1}</td>
              <td style="padding:6px; font-weight:600;">${item.name}</td>
              <td style="padding:6px; text-align:center; font-weight:bold;">${item.quantity}</td>
              <td style="padding:6px; text-align:right; font-family:monospace;">₹${item.wholesale_unit_cost.toFixed(2)}</td>
              <td style="padding:6px; text-align:right; font-family:monospace; color:#b45309;">₹${item.wholesale_total.toFixed(2)}</td>
              <td style="padding:6px; text-align:right; font-family:monospace;">₹${item.line_total.toFixed(2)}</td>
              <td style="padding:6px; text-align:right; font-family:monospace; font-weight:bold; color:#059669;">₹${item.gross_profit.toFixed(2)}</td>
              <td style="padding:6px; text-align:center;">
                <span class="margin-pill ${item.net_margin_pct >= 24 ? 'high' : 'mid'}">
                  +${item.net_margin_pct.toFixed(1)}%
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- LOGISTICS BREAKDOWN -->
      <div style="background:#fff; border:1px solid #fde68a; padding:12px; border-radius:6px; font-size:12px; color:#92400e;">
        <strong style="display:block; margin-bottom:6px;">Logistics Reconciliation:</strong>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px;">
          <div>• Service: <strong>${del.deliveryService || 'Direct'}</strong></div>
          <div>• Actual Delivery Fee Paid: <strong>₹${del.paidDeliveryFee || 0}</strong></div>
          <div>• Packaging & Misc Cost: <strong>₹${del.packagingMisc || 0}</strong></div>
          <div>• Charged to Customer: <strong>₹${cust.delivery_fee || 0}</strong></div>
        </div>
      </div>

    </div>
  `;
}

/**
 * 3. Wholesaler Dispatch Sheet (Matching C:\INVOICE)
 */
function renderWholesalerDispatchSheet(container, invoice) {
  const meta = invoice.metadata || {};
  const items = invoice.items || [];
  const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

  container.innerHTML = `
    <div class="invoice-preview-card" id="printable-procurement-sheet">
      <div style="border-bottom:2px solid #000; padding-bottom:12px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h1 style="margin:0; font-size:20px; font-weight:800; color:#000;">
            WHOLESALER DISPATCH SHEET — RAJINDRA ELECTRONICS
          </h1>
          <div style="font-size:12px; color:#555; margin-top:2px;">
            Order Ref: ${meta.invoice_no || 'N/A'} • Customer: ${meta.customer_name || 'N/A'} • Date: ${formatDate(meta.invoice_date)}
          </div>
        </div>
        <div style="text-align:right;">
          <span style="display:inline-block; border:1px solid #000; padding:4px 8px; font-weight:bold; font-size:13px;">
            TOTAL: ${items.length} Items / ${totalQty} Units
          </span>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:20px;">
        <thead>
          <tr style="border-bottom:2px solid #000; text-align:left;">
            <th style="padding:6px; width:40px;">#</th>
            <th style="padding:6px;">Item Description</th>
            <th style="padding:6px; text-align:center; width:80px;">Dispatch Qty</th>
            <th style="padding:6px; text-align:right; width:100px;">Wholesale Unit</th>
            <th style="padding:6px; text-align:center; width:80px;">Checked (✓)</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, idx) => `
            <tr style="border-bottom:1px solid #ddd;">
              <td style="padding:6px; color:#666;">${idx + 1}</td>
              <td style="padding:6px; font-weight:bold; color:#000;">${item.name}</td>
              <td style="padding:6px; text-align:center; font-weight:bold; font-size:14px;">${item.quantity}</td>
              <td style="padding:6px; text-align:right; font-family:monospace;">₹${item.wholesale_unit_cost.toFixed(2)}</td>
              <td style="padding:6px; text-align:center; color:#ccc;">[ &nbsp;&nbsp;&nbsp;&nbsp; ]</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="font-size:11px; color:#555; border-top:1px dashed #999; padding-top:10px;">
        Please pack with care and dispatch via Porter. Contact Project Mafia upon dispatch.
      </div>
    </div>
  `;
}

/**
 * Generate formatted WhatsApp message
 */
function generateInvoiceWhatsAppText(invoice) {
  const meta = invoice.metadata || {};
  const cust = invoice.customer || {};
  const items = invoice.items || [];

  let text = `🧾 *INVOICE — PROJECT MAFIA*\n`;
  text += `📄 *Invoice No:* ${meta.invoice_no}\n`;
  text += `👤 *Customer:* ${meta.customer_name}\n`;
  text += `📅 *Date:* ${meta.invoice_date}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  items.forEach((item, idx) => {
    text += `${idx + 1}. *${item.name}* (x${item.quantity}) — ₹${item.line_total.toFixed(2)}\n`;
  });

  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Subtotal (Taxable): ₹${(cust.subtotal || 0).toFixed(2)}\n`;
  text += `GST (18%): ₹${(cust.total_gst || 0).toFixed(2)}\n`;
  if (cust.is_free_delivery) {
    text += `Delivery Fee: *FREE (Order ≥ ₹700)*\n`;
  } else {
    text += `Delivery Fee: ₹${(cust.delivery_fee || 0).toFixed(2)}\n`;
  }
  text += `*GRAND TOTAL: ₹${cust.grand_total || 0}.00*\n`;
  text += `Payment Status: *${meta.payment_status || 'Pending'}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `⚡ Thank you for choosing Project Mafia!`;

  return text;
}

// Backward compatibility alias for main.js Quick Add
export const openCreateInvoiceModal = openInvoiceStudioModal;


/**
 * Invoices Page — Generate and manage invoices
 */
import { getAll, add, remove } from '../db.js';
import {
  formatCurrency, formatDate, generateInvoiceNumber,
  showToast, showConfirm
} from '../utils.js';

let invoices = [];

export function renderInvoices() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Invoices</h1>
        <p class="page-subtitle">Generate, view, and print invoices for your orders</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-primary" id="btn-create-invoice">
          <span class="material-icons-round">receipt_long</span>
          <span>Create Invoice</span>
        </button>
      </div>
    </div>

    <!-- Invoice List -->
    <div class="table-container" id="invoice-list-container">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Items</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="invoice-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- Invoice Preview (hidden by default) -->
    <div id="invoice-preview-wrapper" style="display: none; margin-top: 24px;">
      <div class="page-header">
        <div class="page-header-left">
          <h2 class="page-title" style="font-size: 1.2rem;">Invoice Preview</h2>
        </div>
        <div class="page-header-actions">
          <button class="btn-secondary" id="btn-back-to-list">
            <span class="material-icons-round">arrow_back</span>
            <span>Back</span>
          </button>
          <button class="btn-primary" id="btn-print-invoice">
            <span class="material-icons-round">print</span>
            <span>Print</span>
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
  invoices = await getAll('invoices');
  invoices.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  renderInvoiceTable();
}

function renderInvoiceTable() {
  const tbody = document.getElementById('invoice-tbody');
  if (!tbody) return;

  if (invoices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">
              <span class="material-icons-round">receipt_long</span>
            </div>
            <h3>No invoices yet</h3>
            <p>Create your first invoice to generate professional bills for your customers.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td class="cell-name" style="color: var(--text-accent)">${inv.invoiceNumber}</td>
      <td>${inv.customerName || '—'}</td>
      <td class="cell-secondary">${formatDate(inv.date)}</td>
      <td>${inv.items?.length || 0} items</td>
      <td class="cell-money positive">${formatCurrency(inv.total)}</td>
      <td>
        <div class="row-actions">
          <button title="View" class="view-invoice" data-id="${inv.id}">
            <span class="material-icons-round">visibility</span>
          </button>
          <button title="Delete" class="delete delete-invoice" data-id="${inv.id}">
            <span class="material-icons-round">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function bindInvoiceEvents() {
  // Create invoice
  document.getElementById('btn-create-invoice')?.addEventListener('click', () => {
    openCreateInvoiceModal();
  });

  // Delegate
  document.getElementById('invoice-tbody')?.addEventListener('click', async (e) => {
    const viewBtn = e.target.closest('.view-invoice');
    const deleteBtn = e.target.closest('.delete-invoice');

    if (viewBtn) {
      const id = parseInt(viewBtn.dataset.id);
      const invoice = invoices.find(i => i.id === id);
      if (invoice) showInvoicePreview(invoice);
    }

    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      const confirmed = await showConfirm('Delete Invoice', 'Delete this invoice permanently?');
      if (confirmed) {
        await remove('invoices', id);
        showToast('Invoice deleted');
        await loadInvoices();
      }
    }
  });
}

export async function openCreateInvoiceModal() {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');

  // Get customers list for dropdown
  const customers = await getAll('customers');
  const projectOrders = await getAll('projectOrders');

  container.innerHTML = `
    <div class="modal-header">
      <h2>Create Invoice</h2>
      <button class="modal-close" id="modal-close">
        <span class="material-icons-round">close</span>
      </button>
    </div>
    <div class="modal-body">
      <form id="invoice-form" class="form-grid">
        <div class="form-group">
          <label class="form-label">Invoice Number</label>
          <input class="form-input" type="text" name="invoiceNumber" value="${generateInvoiceNumber()}" />
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" type="date" name="date" value="${new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-group">
          <label class="form-label">Customer Name *</label>
          <input class="form-input" type="text" name="customerName" list="customer-list" required placeholder="Select or type customer name" />
          <datalist id="customer-list">
            ${customers.map(c => `<option value="${c.name}">`).join('')}
          </datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Customer Phone</label>
          <input class="form-input" type="text" name="customerPhone" placeholder="Phone number" />
        </div>
        <div class="form-group full-width">
          <label class="form-label">Customer Address</label>
          <input class="form-input" type="text" name="customerAddress" placeholder="Address" />
        </div>

        <div class="form-group full-width">
          <label class="form-label">Invoice Items</label>
          <div id="invoice-items-list">
            <div class="invoice-item-row" style="display:grid; grid-template-columns: 3fr 1fr 1fr 1fr auto; gap: 8px; margin-bottom: 8px;">
              <input class="form-input" type="text" name="item_desc_0" placeholder="Description" />
              <input class="form-input" type="number" name="item_qty_0" placeholder="Qty" value="1" />
              <input class="form-input" type="number" step="0.01" name="item_rate_0" placeholder="Rate" />
              <input class="form-input" type="number" step="0.01" name="item_amount_0" placeholder="Amount" readonly />
              <button type="button" class="btn-icon remove-item" style="height:38px" data-index="0">
                <span class="material-icons-round" style="font-size:16px">close</span>
              </button>
            </div>
          </div>
          <button type="button" class="btn-secondary btn-sm" id="btn-add-item" style="margin-top: 8px">
            <span class="material-icons-round">add</span> Add Item
          </button>
        </div>

        <div class="form-group full-width" style="text-align: right; font-size: 1.1rem; font-weight: 700; color: var(--text-success)">
          Total: <span id="invoice-total">₹0.00</span>
        </div>

        <div class="form-group full-width">
          <label class="form-label">Auto-import from Project Order</label>
          <select class="form-select" id="import-from-order">
            <option value="">— Select an order to auto-fill —</option>
            ${projectOrders.map(o => `
              <option value="${o.id}">${o.name} — ${o.projectName} (${formatCurrency(o.payment)})</option>
            `).join('')}
          </select>
        </div>

        <div class="form-group full-width">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" name="notes" placeholder="Additional notes for the invoice"></textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-save">
        <span class="material-icons-round">receipt_long</span>
        <span>Generate Invoice</span>
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');

  let itemCount = 1;

  // Auto-fill customer info
  const customerNameInput = container.querySelector('[name="customerName"]');
  customerNameInput.addEventListener('change', () => {
    const customer = customers.find(c => c.name === customerNameInput.value);
    if (customer) {
      container.querySelector('[name="customerPhone"]').value = customer.phone || '';
      container.querySelector('[name="customerAddress"]').value = customer.address || '';
    }
  });

  // Import from order
  document.getElementById('import-from-order').addEventListener('change', (e) => {
    const orderId = parseInt(e.target.value);
    const order = projectOrders.find(o => o.id === orderId);
    if (!order) return;

    customerNameInput.value = order.name || '';
    container.querySelector('[name="customerPhone"]').value = order.phone || '';

    // Fill first item
    const descInput = container.querySelector('[name="item_desc_0"]');
    const qtyInput = container.querySelector('[name="item_qty_0"]');
    const rateInput = container.querySelector('[name="item_rate_0"]');
    const amountInput = container.querySelector('[name="item_amount_0"]');

    if (descInput) descInput.value = order.projectName || '';
    if (qtyInput) qtyInput.value = 1;
    if (rateInput) rateInput.value = order.payment || '';
    if (amountInput) amountInput.value = order.payment || '';

    updateTotal();
  });

  // Add item
  document.getElementById('btn-add-item').addEventListener('click', () => {
    const list = document.getElementById('invoice-items-list');
    const idx = itemCount++;
    const row = document.createElement('div');
    row.className = 'invoice-item-row';
    row.style = 'display:grid; grid-template-columns: 3fr 1fr 1fr 1fr auto; gap: 8px; margin-bottom: 8px;';
    row.innerHTML = `
      <input class="form-input" type="text" name="item_desc_${idx}" placeholder="Description" />
      <input class="form-input" type="number" name="item_qty_${idx}" placeholder="Qty" value="1" />
      <input class="form-input" type="number" step="0.01" name="item_rate_${idx}" placeholder="Rate" />
      <input class="form-input" type="number" step="0.01" name="item_amount_${idx}" placeholder="Amount" readonly />
      <button type="button" class="btn-icon remove-item" style="height:38px" data-index="${idx}">
        <span class="material-icons-round" style="font-size:16px">close</span>
      </button>
    `;
    list.appendChild(row);
    bindItemCalc(row);
  });

  // Remove item
  document.getElementById('invoice-items-list').addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.remove-item');
    if (removeBtn) {
      const row = removeBtn.closest('.invoice-item-row');
      if (document.querySelectorAll('.invoice-item-row').length > 1) {
        row.remove();
        updateTotal();
      }
    }
  });

  // Bind item calculations
  function bindItemCalc(row) {
    const qtyInput = row.querySelector('[name^="item_qty"]');
    const rateInput = row.querySelector('[name^="item_rate"]');
    const amountInput = row.querySelector('[name^="item_amount"]');

    const calc = () => {
      const qty = parseFloat(qtyInput.value) || 0;
      const rate = parseFloat(rateInput.value) || 0;
      amountInput.value = (qty * rate).toFixed(2);
      updateTotal();
    };

    qtyInput.addEventListener('input', calc);
    rateInput.addEventListener('input', calc);
  }

  // Bind first row
  bindItemCalc(document.querySelector('.invoice-item-row'));

  function updateTotal() {
    const amounts = document.querySelectorAll('[name^="item_amount"]');
    let total = 0;
    amounts.forEach(inp => { total += parseFloat(inp.value) || 0; });
    document.getElementById('invoice-total').textContent = formatCurrency(total);
  }

  // Close handlers
  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  // Save handler
  document.getElementById('modal-save').onclick = async () => {
    const form = document.getElementById('invoice-form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.customerName) {
      showToast('Customer name is required', 'error');
      return;
    }

    // Collect items
    const items = [];
    const rows = document.querySelectorAll('.invoice-item-row');
    rows.forEach((row, i) => {
      const desc = row.querySelector('[name^="item_desc"]')?.value;
      const qty = parseFloat(row.querySelector('[name^="item_qty"]')?.value) || 0;
      const rate = parseFloat(row.querySelector('[name^="item_rate"]')?.value) || 0;
      const amount = parseFloat(row.querySelector('[name^="item_amount"]')?.value) || 0;
      if (desc && amount > 0) {
        items.push({ description: desc, qty, rate, amount });
      }
    });

    const total = items.reduce((s, item) => s + item.amount, 0);

    const invoice = {
      invoiceNumber: data.invoiceNumber,
      date: data.date,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress,
      items,
      total,
      notes: data.notes,
    };

    try {
      await add('invoices', invoice);
      showToast('Invoice created successfully');
      overlay.classList.add('hidden');
      await loadInvoices();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };
}

function showInvoicePreview(invoice) {
  const listContainer = document.getElementById('invoice-list-container');
  const previewWrapper = document.getElementById('invoice-preview-wrapper');
  const previewContent = document.getElementById('invoice-preview-content');

  if (listContainer) listContainer.style.display = 'none';
  if (previewWrapper) previewWrapper.style.display = 'block';

  previewContent.innerHTML = `
    <div class="invoice-preview" id="printable-invoice">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #4f46e5; padding-bottom: 24px;">
        <div>
          <h1 style="font-size: 1.8rem; margin-bottom: 4px;">INVOICE</h1>
          <p style="color: #6b7280; font-size: 0.9rem;">Project Mafia — Ready-Made Projects & Components</p>
        </div>
        <div style="text-align: right;">
          <p style="font-weight: 700; color: #4f46e5; font-size: 1.1rem;">${invoice.invoiceNumber}</p>
          <p style="color: #6b7280; font-size: 0.85rem;">Date: ${formatDate(invoice.date)}</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px;">
        <div>
          <p style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 8px; font-weight: 600;">Bill To</p>
          <p style="font-weight: 600; font-size: 1.1rem;">${invoice.customerName}</p>
          ${invoice.customerPhone ? `<p style="color: #6b7280; font-size: 0.85rem;">${invoice.customerPhone}</p>` : ''}
          ${invoice.customerAddress ? `<p style="color: #6b7280; font-size: 0.85rem;">${invoice.customerAddress}</p>` : ''}
        </div>
        <div style="text-align: right;">
          <p style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 8px; font-weight: 600;">From</p>
          <p style="font-weight: 600;">Project Mafia</p>
          <p style="color: #6b7280; font-size: 0.85rem;">Ready-Made Projects & Components</p>
        </div>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Rate</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items?.map((item, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${item.description}</td>
              <td style="text-align: center;">${item.qty}</td>
              <td style="text-align: right;">${formatCurrency(item.rate)}</td>
              <td style="text-align: right; font-weight: 600;">${formatCurrency(item.amount)}</td>
            </tr>
          `).join('') || '<tr><td colspan="5">No items</td></tr>'}
        </tbody>
      </table>

      <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
        <div style="min-width: 250px;">
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <span style="color: #6b7280;">Subtotal</span>
            <span style="font-weight: 600;">${formatCurrency(invoice.total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 12px 0; font-size: 1.15rem; font-weight: 700; color: #4f46e5;">
            <span>Total</span>
            <span>${formatCurrency(invoice.total)}</span>
          </div>
        </div>
      </div>

      ${invoice.notes ? `
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 6px; font-weight: 600;">Notes</p>
          <p style="color: #6b7280; font-size: 0.85rem;">${invoice.notes}</p>
        </div>
      ` : ''}

      <div style="margin-top: 48px; text-align: center; color: #9ca3af; font-size: 0.8rem;">
        <p>Thank you for your business!</p>
        <p style="margin-top: 4px;">This is a computer-generated invoice.</p>
      </div>
    </div>
  `;

  // Back button
  document.getElementById('btn-back-to-list')?.addEventListener('click', () => {
    listContainer.style.display = 'block';
    previewWrapper.style.display = 'none';
  });

  // Print button
  document.getElementById('btn-print-invoice')?.addEventListener('click', () => {
    const printContent = document.getElementById('printable-invoice').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoiceNumber}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a1a; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f3f4f6; padding: 10px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
          td { padding: 10px 16px; border-bottom: 1px solid #f3f4f6; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  });
}

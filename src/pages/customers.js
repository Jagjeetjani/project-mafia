/**
 * Customers Page — Customer management with order history
 */
import { getAll, add, update, remove } from '../db.js';
import {
  formatCurrency, formatDate, normalizeStatus, getStatusLabel, getInitials, showToast, showConfirm, debounce, cleanCustomerName
} from '../utils.js';

let customers = [];
let searchQuery = '';

export function renderCustomers() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Customers</h1>
        <p class="page-subtitle">Manage your customer database and view order history</p>
      </div>
      <div class="page-header-actions">
        <button class="btn-secondary" id="btn-auto-sync-customers">
          <span class="material-icons-round">sync</span>
          <span>Auto-Sync from Orders</span>
        </button>
        <button class="btn-primary" id="btn-add-customer">
          <span class="material-icons-round">person_add</span>
          <span>Add Customer</span>
        </button>
      </div>
    </div>

    <div class="table-container" style="margin-bottom: 24px; border-radius: var(--radius-lg);">
      <div class="table-toolbar">
        <div class="table-search">
          <span class="material-icons-round">search</span>
          <input type="text" id="customer-search" placeholder="Search customers by name or phone..." />
        </div>
        <div class="pagination-info" id="customer-count" style="margin-left: auto;"></div>
      </div>
    </div>

    <div class="customer-cards" id="customer-grid">
      <!-- Customer cards rendered here -->
    </div>
  `;
}

export async function initCustomers() {
  await loadCustomers();
  bindCustomerEvents();
}

async function loadCustomers() {
  customers = await getAll('customers');

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    customers = customers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  }

  // Get order counts for each customer
  const projectOrders = await getAll('projectOrders');
  const materialOrders = await getAll('materialOrders');

  const customerData = customers.map(c => {
    const projOrders = projectOrders.filter(o =>
      o.name?.toLowerCase() === c.name?.toLowerCase()
    );
    const matOrders = materialOrders.filter(o =>
      o.customerName?.toLowerCase() === c.name?.toLowerCase()
    );

    const totalSpent = projOrders.reduce((s, o) => s + (parseFloat(o.payment) || 0), 0)
      + matOrders.reduce((s, o) => s + (parseFloat(o.totalPrice) || 0), 0);

    return {
      ...c,
      projectCount: projOrders.length,
      materialCount: matOrders.length,
      totalOrders: projOrders.length + matOrders.length,
      totalSpent,
    };
  });

  renderCustomerCards(customerData);
}

function renderCustomerCards(data) {
  const grid = document.getElementById('customer-grid');
  const countEl = document.getElementById('customer-count');

  if (countEl) countEl.textContent = `${data.length} customers`;

  if (!grid) return;

  if (data.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-state-icon">
          <span class="material-icons-round">people</span>
        </div>
        <h3>No customers yet</h3>
        <p>Add customers manually or click "Auto-Sync from Orders" to import from your existing orders.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = data.map(c => `
    <div class="customer-card" data-id="${c.id}">
      <div class="customer-card-header">
        <div class="customer-avatar">${getInitials(c.name)}</div>
        <div>
          <div class="customer-card-name">${c.name}</div>
          <div class="customer-card-phone">${c.phone || 'No phone'}</div>
        </div>
        <div class="row-actions" style="margin-left:auto">
          <button title="Edit" class="edit-customer" data-id="${c.id}">
            <span class="material-icons-round">edit</span>
          </button>
          <button title="Delete" class="delete delete-customer" data-id="${c.id}">
            <span class="material-icons-round">delete</span>
          </button>
        </div>
      </div>
      <div class="customer-card-stats">
        <div class="customer-stat">
          <div class="customer-stat-value">${c.totalOrders}</div>
          <div class="customer-stat-label">Orders</div>
        </div>
        <div class="customer-stat">
          <div class="customer-stat-value">${c.projectCount}</div>
          <div class="customer-stat-label">Projects</div>
        </div>
        <div class="customer-stat">
          <div class="customer-stat-value" style="color: var(--text-success); font-size: 0.95rem">${formatCurrency(c.totalSpent)}</div>
          <div class="customer-stat-label">Total Value</div>
        </div>
      </div>
    </div>
  `).join('');
}

function bindCustomerEvents() {
  // Search
  document.getElementById('customer-search')?.addEventListener('input', debounce((e) => {
    searchQuery = e.target.value;
    loadCustomers();
  }, 250));

  // Add
  document.getElementById('btn-add-customer')?.addEventListener('click', () => {
    openCustomerModal();
  });

  // Auto-sync
  document.getElementById('btn-auto-sync-customers')?.addEventListener('click', async () => {
    await autoSyncCustomers();
  });

  // Delegate edit/delete/card-click
  document.getElementById('customer-grid')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-customer');
    const deleteBtn = e.target.closest('.delete-customer');
    const card = e.target.closest('.customer-card');

    if (editBtn) {
      e.stopPropagation();
      const id = parseInt(editBtn.dataset.id);
      const customer = customers.find(c => c.id === id);
      if (customer) openCustomerModal(customer);
      return;
    }

    if (deleteBtn) {
      e.stopPropagation();
      const id = parseInt(deleteBtn.dataset.id);
      const confirmed = await showConfirm('Delete Customer', 'Are you sure you want to delete this customer?');
      if (confirmed) {
        await remove('customers', id);
        showToast('Customer deleted');
        await loadCustomers();
      }
      return;
    }

    if (card) {
      const id = parseInt(card.dataset.id);
      const customer = customers.find(c => c.id === id);
      if (customer) openCustomerHistoryModal(customer);
    }
  });
}

export function openCustomerModal(customer = null) {
  const isEdit = !!customer;
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');

  container.innerHTML = `
    <div class="modal-header">
      <h2>${isEdit ? 'Edit Customer' : 'Add Customer'}</h2>
      <button class="modal-close" id="modal-close">
        <span class="material-icons-round">close</span>
      </button>
    </div>
    <div class="modal-body">
      <form id="customer-form" class="form-grid">
        <div class="form-group">
          <label class="form-label">Name *</label>
          <input class="form-input" type="text" name="name" value="${customer?.name || ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input class="form-input" type="text" name="phone" value="${customer?.phone || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" type="email" name="email" value="${customer?.email || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input class="form-input" type="text" name="address" value="${customer?.address || ''}" />
        </div>
        <div class="form-group full-width">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" name="notes">${customer?.notes || ''}</textarea>
        </div>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn-primary" id="modal-save">
        <span class="material-icons-round">${isEdit ? 'save' : 'person_add'}</span>
        <span>${isEdit ? 'Save' : 'Add Customer'}</span>
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');

  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  document.getElementById('modal-save').onclick = async () => {
    const form = document.getElementById('customer-form');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.name) {
      showToast('Name is required', 'error');
      return;
    }

    try {
      if (isEdit) {
        data.id = customer.id;
        data.createdAt = customer.createdAt;
        await update('customers', data);
        showToast('Customer updated');
      } else {
        await add('customers', data);
        showToast('Customer added');
      }

      overlay.classList.add('hidden');
      await loadCustomers();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };
}

async function autoSyncCustomers() {
  const [projectOrders, materialOrders, existingCustomers] = await Promise.all([
    getAll('projectOrders'),
    getAll('materialOrders'),
    getAll('customers'),
  ]);

  const existingNames = new Set(existingCustomers.map(c => c.name?.toLowerCase()));

  // Collect unique customer names from orders with clean names
  const customerMap = new Map();

  projectOrders.forEach(o => {
    const cleanName = cleanCustomerName(o.name);
    if (cleanName && !existingNames.has(cleanName.toLowerCase())) {
      const key = cleanName.toLowerCase();
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: cleanName,
          phone: o.phone || '',
        });
      } else if (o.phone && !customerMap.get(key).phone) {
        customerMap.get(key).phone = o.phone;
      }
    }
  });

  materialOrders.forEach(o => {
    const cleanName = cleanCustomerName(o.customerName);
    if (cleanName && !existingNames.has(cleanName.toLowerCase())) {
      const key = cleanName.toLowerCase();
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: cleanName,
          phone: o.contactNo || '',
        });
      } else if (o.contactNo && !customerMap.get(key).phone) {
        customerMap.get(key).phone = o.contactNo;
      }
    }
  });

  let addedCount = 0;
  for (const customer of customerMap.values()) {
    await add('customers', customer);
    addedCount++;
  }

  if (addedCount > 0) {
    showToast(`Synced ${addedCount} clean customer records from orders`);
  } else {
    showToast('All customers are already up-to-date', 'info');
  }

  await loadCustomers();
}

/**
 * 360-degree Customer Details & Multi-Order History Modal
 */
export async function openCustomerHistoryModal(customer) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  const [projectOrders, materialOrders] = await Promise.all([
    getAll('projectOrders'),
    getAll('materialOrders')
  ]);

  const custProjects = projectOrders.filter(p => p.name?.toLowerCase() === customer.name?.toLowerCase());
  const custMaterials = materialOrders.filter(m => m.customerName?.toLowerCase() === customer.name?.toLowerCase());

  const totalSpent = custProjects.reduce((s, o) => s + (parseFloat(o.payment) || 0), 0) +
                     custMaterials.reduce((s, o) => s + (parseFloat(o.totalPrice) || 0), 0);
  const totalReceived = custProjects.reduce((s, o) => s + (parseFloat(o.received) || 0), 0) +
                        custMaterials.reduce((s, o) => s + (parseFloat(o.received) || 0), 0);
  const totalPending = custProjects.reduce((s, o) => s + (parseFloat(o.pending) || 0), 0) +
                       custMaterials.reduce((s, o) => s + (parseFloat(o.balance) || 0), 0);

  container.innerHTML = `
    <div class="modal-header">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="customer-avatar" style="width:42px; height:42px; font-size:1.05rem;">${getInitials(customer.name)}</div>
        <div>
          <h2 style="margin:0; font-size:1.25rem;">${customer.name}</h2>
          <div style="font-size:0.8rem; color:var(--text-secondary);">${customer.phone ? `+91 ${customer.phone}` : 'No phone'} ${customer.email ? `• ${customer.email}` : ''}</div>
        </div>
      </div>
      <button class="modal-close" id="modal-close"><span class="material-icons-round">close</span></button>
    </div>
    <div class="modal-body" style="display:flex; flex-direction:column; gap:20px;">
      
      <!-- Summary metrics for this customer -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:12px; background:var(--bg-tertiary); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-primary);">
        <div>
          <div style="font-size:0.75rem; color:var(--text-tertiary);">Total Orders</div>
          <div style="font-size:1.2rem; font-weight:700;">${custProjects.length + custMaterials.length}</div>
        </div>
        <div>
          <div style="font-size:0.75rem; color:var(--text-tertiary);">Total Value</div>
          <div style="font-size:1.2rem; font-weight:700; color:var(--text-primary);">${formatCurrency(totalSpent)}</div>
        </div>
        <div>
          <div style="font-size:0.75rem; color:var(--text-tertiary);">Total Received</div>
          <div style="font-size:1.2rem; font-weight:700; color:var(--text-success);">${formatCurrency(totalReceived)}</div>
        </div>
        <div>
          <div style="font-size:0.75rem; color:var(--text-tertiary);">Pending Balance</div>
          <div style="font-size:1.2rem; font-weight:700; color:${totalPending > 0 ? 'var(--text-warning)' : 'var(--text-secondary)'};">${formatCurrency(totalPending)}</div>
        </div>
      </div>

      <!-- Project Orders Section -->
      <div>
        <h3 style="font-size:0.95rem; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span class="material-icons-round" style="color:var(--accent-purple); font-size:18px;">inventory_2</span>
          Project Orders (${custProjects.length})
        </h3>
        ${custProjects.length === 0 ? `
          <div style="font-size:0.85rem; color:var(--text-tertiary); padding:12px; background:var(--bg-card); border-radius:var(--radius-sm); border:1px solid var(--border-secondary);">No project orders for this client.</div>
        ` : `
          <div class="table-scroll">
            <table class="data-table" style="font-size:0.8rem;">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Project Name</th>
                  <th>Order Date</th>
                  <th>Agreed Price</th>
                  <th>Received</th>
                  <th>Pending</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${custProjects.map(p => `
                  <tr>
                    <td><strong>#${p.id}</strong></td>
                    <td style="font-weight:600;">${p.projectName}</td>
                    <td class="cell-secondary">${formatDate(p.orderDate)}</td>
                    <td class="cell-money">${formatCurrency(p.payment)}</td>
                    <td class="cell-money positive">${formatCurrency(p.received)}</td>
                    <td class="cell-money ${parseFloat(p.pending) > 0 ? 'negative' : ''}">${formatCurrency(p.pending)}</td>
                    <td><span class="status-badge ${normalizeStatus(p.status)}">${getStatusLabel(normalizeStatus(p.status))}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- Material Orders Section -->
      <div>
        <h3 style="font-size:0.95rem; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span class="material-icons-round" style="color:var(--accent-green); font-size:18px;">shopping_cart</span>
          Material / Component Orders (${custMaterials.length})
        </h3>
        ${custMaterials.length === 0 ? `
          <div style="font-size:0.85rem; color:var(--text-tertiary); padding:12px; background:var(--bg-card); border-radius:var(--radius-sm); border:1px solid var(--border-secondary);">No material orders for this client.</div>
        ` : `
          <div class="table-scroll">
            <table class="data-table" style="font-size:0.8rem;">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Material Item</th>
                  <th>Total Price</th>
                  <th>Wholesale</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${custMaterials.map(m => {
                  const cleanItem = (m.materialItem || '').replace(/[\r\n]+/g, ' ').substring(0, 35);
                  return `
                    <tr>
                      <td><strong>#${m.id}</strong></td>
                      <td><span class="status-badge ${m.orderType === 'Component Order' ? 'completed' : 'pending'}" style="font-size:0.65rem">${m.orderType}</span></td>
                      <td class="cell-secondary">${formatDate(m.orderDate)}</td>
                      <td title="${m.materialItem}">${cleanItem}...</td>
                      <td class="cell-money">${formatCurrency(m.totalPrice)}</td>
                      <td class="cell-money">${formatCurrency(m.wholesaleTotal)}</td>
                      <td><span class="status-badge ${normalizeStatus(m.orderStatus)}">${getStatusLabel(normalizeStatus(m.orderStatus))}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

    </div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel">Close</button>
      <button class="btn-primary" id="btn-edit-from-history">
        <span class="material-icons-round">edit</span>
        <span>Edit Customer Profile</span>
      </button>
    </div>
  `;

  overlay.classList.remove('hidden');
  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  document.getElementById('modal-cancel').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  document.getElementById('btn-edit-from-history').onclick = () => {
    overlay.classList.add('hidden');
    setTimeout(() => openCustomerModal(customer), 100);
  };
}

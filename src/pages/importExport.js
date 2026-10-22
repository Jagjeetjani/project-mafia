/**
 * Import / Export Page — CSV Import and JSON Cloud Backup / Restore
 * Directly connected to Firebase Cloud
 */
import { bulkAdd, exportAllData, importData, clearStore, getAll } from '../db.js';
import {
  parseCSV, toCSV, downloadFile, showToast, showConfirm,
  parseCurrency, normalizeStatus
} from '../utils.js';

export function renderImportExport() {
  return `
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Import / Export</h1>
        <p class="page-subtitle">Import data from CSV files or download/restore your cloud database backup</p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab-btn active" data-tab="import">Import Data</button>
      <button class="tab-btn" data-tab="export">Export / Backup</button>
    </div>

    <!-- Import Tab -->
    <div class="tab-content active" id="tab-import">
      <div class="import-options">
        <div class="import-option" id="import-project-csv">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon purple">
              <span class="material-icons-round">inventory_2</span>
            </div>
            <h4>Import Project Orders (CSV)</h4>
          </div>
          <p>Import from your Google Sheets "Project Orders Tracker" CSV export directly into Firebase Cloud.</p>
          <p style="margin-top:8px; font-size:0.75rem; color:var(--text-tertiary)">Expected columns: S.NO, NAME, PNAME, PAYMENT, RECEIVED, PENDING, ORDER DATE, DUE DATE, MATERIAL COST, MISC EXPENSES, PROFIT, PH.NO, STATUS</p>
        </div>
        <div class="import-option" id="import-material-csv">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon orange">
              <span class="material-icons-round">shopping_cart</span>
            </div>
            <h4>Import Material Orders (CSV)</h4>
          </div>
          <p>Import from your Google Sheets "Material Orders & Procurement" CSV export directly into Firebase Cloud.</p>
          <p style="margin-top:8px; font-size:0.75rem; color:var(--text-tertiary)">Expected columns: S.NO, CUSTOMER NAME, ORDER TYPE, ORDER DATE, MATERIAL / ITEM, QTY, UNIT PRICE, TOTAL PRICE, BALANCE, etc.</p>
        </div>
        <div class="import-option" id="import-json-backup">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon blue">
              <span class="material-icons-round">backup</span>
            </div>
            <h4>Restore from Backup (JSON)</h4>
          </div>
          <p>Restore data directly to Firebase Cloud from a previously exported JSON backup file.</p>
        </div>
      </div>

      <!-- Hidden file inputs -->
      <input type="file" id="file-project-csv" accept=".csv" style="display:none" />
      <input type="file" id="file-material-csv" accept=".csv" style="display:none" />
      <input type="file" id="file-json-backup" accept=".json" style="display:none" />

      <!-- Import preview -->
      <div id="import-preview" style="display:none; margin-top:24px;">
        <div class="table-container">
          <div class="table-toolbar">
            <h3 style="font-size:1rem; font-weight:600;">Preview Import Data</h3>
            <div class="table-filters">
              <span id="import-row-count" style="color:var(--text-secondary); font-size:0.85rem;"></span>
              <button class="btn-primary btn-sm" id="btn-confirm-import">
                <span class="material-icons-round">check</span>
                <span>Confirm Import</span>
              </button>
              <button class="btn-secondary btn-sm" id="btn-cancel-import">Cancel</button>
            </div>
          </div>
          <div class="table-scroll" id="import-preview-table"></div>
        </div>
      </div>
    </div>

    <!-- Export Tab -->
    <div class="tab-content" id="tab-export">
      <div class="import-options">
        <div class="import-option" id="export-project-csv">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon purple">
              <span class="material-icons-round">download</span>
            </div>
            <h4>Export Project Orders (CSV)</h4>
          </div>
          <p>Download all cloud project orders as a CSV file.</p>
        </div>
        <div class="import-option" id="export-material-csv">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon orange">
              <span class="material-icons-round">download</span>
            </div>
            <h4>Export Material Orders (CSV)</h4>
          </div>
          <p>Download all cloud material orders as a CSV file.</p>
        </div>
        <div class="import-option" id="export-full-backup">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon green">
              <span class="material-icons-round">cloud_download</span>
            </div>
            <h4>Full Backup (JSON)</h4>
          </div>
          <p>Download complete backup of all data (projects, materials, customers, invoices) from Firebase Cloud.</p>
        </div>
        <div class="import-option" id="btn-clear-all" style="border-color: rgba(239,68,68,0.2);">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon red">
              <span class="material-icons-round">delete_forever</span>
            </div>
            <h4 style="color: var(--text-danger);">Clear All Cloud Data</h4>
          </div>
          <p>Delete all data from Firebase Cloud. This cannot be undone!</p>
        </div>
      </div>
    </div>
  `;
}

let pendingImportData = null;
let pendingImportType = '';

export function initImportExport() {
  bindImportExportEvents();
}

function bindImportExportEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });

  // Import triggers
  document.getElementById('import-project-csv')?.addEventListener('click', () => {
    document.getElementById('file-project-csv').click();
  });

  document.getElementById('import-material-csv')?.addEventListener('click', () => {
    document.getElementById('file-material-csv').click();
  });

  document.getElementById('import-json-backup')?.addEventListener('click', () => {
    document.getElementById('file-json-backup').click();
  });

  // File handlers
  document.getElementById('file-project-csv')?.addEventListener('change', (e) => {
    handleCSVFile(e.target.files[0], 'projectOrders');
  });

  document.getElementById('file-material-csv')?.addEventListener('change', (e) => {
    handleCSVFile(e.target.files[0], 'materialOrders');
  });

  document.getElementById('file-json-backup')?.addEventListener('change', (e) => {
    handleJSONFile(e.target.files[0]);
  });

  // Export triggers
  document.getElementById('export-project-csv')?.addEventListener('click', exportProjectCSV);
  document.getElementById('export-material-csv')?.addEventListener('click', exportMaterialCSV);
  document.getElementById('export-full-backup')?.addEventListener('click', exportFullBackup);

  // Clear all
  document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
    const confirmed = await showConfirm(
      'Clear All Cloud Data',
      'This will permanently delete ALL your data in Firebase Cloud (projects, materials, customers, and invoices). This action CANNOT be undone!'
    );
    if (confirmed) {
      await clearStore('projectOrders');
      await clearStore('materialOrders');
      await clearStore('customers');
      await clearStore('invoices');
      await clearStore('porterBatches');
      showToast('All cloud data has been cleared');
    }
  });

  // Confirm/Cancel import
  document.getElementById('btn-confirm-import')?.addEventListener('click', confirmImport);
  document.getElementById('btn-cancel-import')?.addEventListener('click', () => {
    document.getElementById('import-preview').style.display = 'none';
    pendingImportData = null;
  });
}

function handleCSVFile(file, type) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const csvText = e.target.result;
      const parsed = parseCSV(csvText);

      if (parsed.length === 0) {
        showToast('The CSV file appears to be empty', 'warning');
        return;
      }

      if (type === 'projectOrders') {
        pendingImportData = mapProjectCSVData(parsed);
      } else {
        pendingImportData = mapMaterialCSVData(parsed);
      }

      pendingImportType = type;
      showImportPreview(pendingImportData, type);
    } catch (err) {
      showToast('Failed to parse CSV: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function handleJSONFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const jsonData = JSON.parse(e.target.result);
      if (!jsonData.data) {
        showToast('Invalid backup file format', 'error');
        return;
      }

      const confirmed = await showConfirm(
        'Restore Database',
        'This will import all data from the backup file into Firebase Cloud. Existing records may be overwritten or appended. Continue?'
      );

      if (confirmed) {
        const counts = await importData(jsonData);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        showToast(`Successfully imported ${total} records into Firebase Cloud!`, 'success');
      }
    } catch (err) {
      showToast('Failed to parse JSON backup: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function mapProjectCSVData(rows) {
  return rows.map((row, index) => {
    const payment = parseCurrency(row['PAYMENT'] || row['payment'] || '0');
    const received = parseCurrency(row['RECEIVED'] || row['received'] || '0');
    const pending = parseCurrency(row['PENDING'] || row['pending'] || '0');
    const materialCost = parseCurrency(row['MATERIAL COST'] || row['materialCost'] || '0');
    const miscExpenses = parseCurrency(row['MISC EXPENSES'] || row['miscExpenses'] || '0');
    const profit = parseCurrency(row['PROFIT'] || row['profit'] || '0');

    return {
      name: (row['NAME'] || row['name'] || '').trim(),
      projectName: (row['PNAME'] || row['PROJECT NAME'] || row['projectName'] || '').trim(),
      payment,
      received,
      pending: pending || (payment - received),
      orderDate: row['ORDER DATE'] || row['orderDate'] || new Date().toISOString().split('T')[0],
      dueDate: row['DUE DATE'] || row['dueDate'] || '',
      materialCost,
      miscExpenses,
      profit: profit || (payment - materialCost - miscExpenses),
      phone: (row['PH.NO'] || row['PHONE'] || row['phone'] || '').trim(),
      status: normalizeStatus(row['STATUS'] || row['status'] || 'pending'),
    };
  }).filter(o => o.name && o.projectName);
}

function mapMaterialCSVData(rows) {
  return rows.map((row) => {
    const qty = parseInt(row['QTY'] || row['qty'] || '1') || 1;
    const unitPrice = parseCurrency(row['UNIT PRICE'] || row['unitPrice'] || '0');
    const totalPrice = parseCurrency(row['TOTAL PRICE'] || row['totalPrice'] || '0') || (qty * unitPrice);
    const received = parseCurrency(row['RECEIVED'] || row['received'] || '0');
    const balance = parseCurrency(row['BALANCE'] || row['balance'] || '0') || (totalPrice - received);
    const wholesaleTotal = parseCurrency(row['WHOLESALE TOTAL'] || row['wholesaleTotal'] || '0');
    const porterCharge = parseCurrency(row['PORTER CHARGE'] || row['porterCharge'] || '0');
    const netProfit = parseCurrency(row['NET PROFIT'] || row['netProfit'] || '0') || (totalPrice - wholesaleTotal - porterCharge);

    return {
      customerName: (row['CUSTOMER NAME'] || row['customerName'] || '').trim(),
      orderType: (row['ORDER TYPE'] || row['orderType'] || 'Material Order').trim(),
      orderDate: row['ORDER DATE'] || row['orderDate'] || new Date().toISOString().split('T')[0],
      materialItem: (row['MATERIAL / ITEM'] || row['materialItem'] || '').trim(),
      qty,
      unitPrice,
      totalPrice,
      received,
      balance,
      wholesaler: (row['WHOLESALER'] || row['wholesaler'] || '').trim(),
      wholesaleTotal,
      wholesaleRate: wholesaleTotal,
      batchId: (row['BATCH ID'] || row['batchId'] || '').trim(),
      porterCharge,
      netProfit,
      wholesalerStatus: (row['WHOLESALER STATUS'] || row['wholesalerStatus'] || 'Pending').trim(),
      orderStatus: normalizeStatus(row['ORDER STATUS'] || row['orderStatus'] || 'pending'),
      contactNo: (row['CONTACT NO'] || row['contactNo'] || '').trim(),
      notes: (row['TRACKING/NOTES'] || row['notes'] || '').trim(),
    };
  }).filter(o => o.customerName && o.materialItem);
}

function showImportPreview(data, type) {
  const container = document.getElementById('import-preview');
  const countEl = document.getElementById('import-row-count');
  const tableEl = document.getElementById('import-preview-table');

  countEl.textContent = `${data.length} valid rows found`;

  let headers = [];
  if (type === 'projectOrders') {
    headers = ['Name', 'Project', 'Payment', 'Received', 'Order Date', 'Status'];
  } else {
    headers = ['Customer', 'Type', 'Item', 'Qty', 'Total', 'Status'];
  }

  let html = `
    <table class="data-table">
      <thead>
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
  `;

  const previewRows = data.slice(0, 10);
  previewRows.forEach(row => {
    if (type === 'projectOrders') {
      html += `
        <tr>
          <td>${row.name}</td>
          <td>${row.projectName}</td>
          <td>₹${row.payment.toLocaleString('en-IN')}</td>
          <td>₹${row.received.toLocaleString('en-IN')}</td>
          <td>${row.orderDate}</td>
          <td><span class="badge badge-${row.status}">${row.status}</span></td>
        </tr>
      `;
    } else {
      html += `
        <tr>
          <td>${row.customerName}</td>
          <td>${row.orderType}</td>
          <td>${row.materialItem}</td>
          <td>${row.qty}</td>
          <td>₹${row.totalPrice.toLocaleString('en-IN')}</td>
          <td><span class="badge badge-${row.orderStatus}">${row.orderStatus}</span></td>
        </tr>
      `;
    }
  });

  if (data.length > 10) {
    html += `<tr><td colspan="${headers.length}" style="text-align:center; color:var(--text-tertiary);">...and ${data.length - 10} more rows</td></tr>`;
  }

  html += '</tbody></table>';
  tableEl.innerHTML = html;
  container.style.display = 'block';
}

async function confirmImport() {
  if (!pendingImportData || pendingImportData.length === 0) return;

  try {
    const count = await bulkAdd(pendingImportType, pendingImportData);
    showToast(`Successfully imported ${count} records into Firebase Cloud!`, 'success');
    document.getElementById('import-preview').style.display = 'none';
    pendingImportData = null;
    pendingImportType = '';
  } catch (err) {
    showToast('Import failed: ' + err.message, 'error');
  }
}

async function exportProjectCSV() {
  const orders = await getAll('projectOrders');
  if (orders.length === 0) {
    showToast('No project orders to export', 'info');
    return;
  }

  const exportData = orders.map(o => ({
    'S.NO': o.id,
    'NAME': o.name,
    'PROJECT NAME': o.projectName,
    'PAYMENT': o.payment,
    'RECEIVED': o.received,
    'PENDING': o.pending,
    'ORDER DATE': o.orderDate,
    'DUE DATE': o.dueDate,
    'MATERIAL COST': o.materialCost,
    'MISC EXPENSES': o.miscExpenses,
    'PROFIT': o.profit,
    'PHONE': o.phone,
    'STATUS': o.status,
  }));

  const csv = toCSV(exportData);
  downloadFile(csv, `project-orders-${new Date().toISOString().split('T')[0]}.csv`);
  showToast('Project orders exported as CSV');
}

async function exportMaterialCSV() {
  const orders = await getAll('materialOrders');
  if (orders.length === 0) {
    showToast('No material orders to export', 'info');
    return;
  }

  const exportData = orders.map(o => ({
    'S.NO': o.id,
    'CUSTOMER NAME': o.customerName,
    'ORDER TYPE': o.orderType,
    'ORDER DATE': o.orderDate,
    'MATERIAL / ITEM': o.materialItem,
    'QTY': o.qty,
    'UNIT PRICE': o.unitPrice,
    'TOTAL PRICE': o.totalPrice,
    'RECEIVED': o.received,
    'BALANCE': o.balance,
    'WHOLESALE TOTAL': o.wholesaleTotal,
    'PORTER CHARGE': o.porterCharge,
    'NET PROFIT': o.netProfit,
    'CONTACT NO': o.contactNo,
    'ORDER STATUS': o.orderStatus,
    'TRACKING/NOTES': o.notes,
  }));

  const csv = toCSV(exportData);
  downloadFile(csv, `material-orders-${new Date().toISOString().split('T')[0]}.csv`);
  showToast('Material orders exported as CSV');
}

async function exportFullBackup() {
  const data = await exportAllData();
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `project-mafia-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  showToast('Full cloud backup downloaded');
}

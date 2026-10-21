/**
 * Import / Export Page — CSV import and JSON backup
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
        <p class="page-subtitle">Import data from CSV files or backup/restore your database</p>
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
          <p>Import from your Google Sheets "Project Orders Tracker" CSV export.</p>
          <p style="margin-top:8px; font-size:0.75rem; color:var(--text-tertiary)">Expected columns: S.NO, NAME, PNAME, PAYMENT, RECEIVED, PENDING, ORDER DATE, DUE DATE, MATERIAL COST, MISC EXPENSES, PROFIT, PH.NO, STATUS</p>
        </div>
        <div class="import-option" id="import-material-csv">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon orange">
              <span class="material-icons-round">shopping_cart</span>
            </div>
            <h4>Import Material Orders (CSV)</h4>
          </div>
          <p>Import from your Google Sheets "Material Orders & Procurement" CSV export.</p>
          <p style="margin-top:8px; font-size:0.75rem; color:var(--text-tertiary)">Expected columns: S.NO, CUSTOMER NAME, ORDER TYPE, ORDER DATE, MATERIAL / ITEM, QTY, UNIT PRICE, TOTAL PRICE, BALANCE, etc.</p>
        </div>
        <div class="import-option" id="import-json-backup">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon blue">
              <span class="material-icons-round">backup</span>
            </div>
            <h4>Restore from Backup (JSON)</h4>
          </div>
          <p>Restore data from a previously exported JSON backup file.</p>
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
          <p>Download all project orders as a CSV file.</p>
        </div>
        <div class="import-option" id="export-material-csv">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon orange">
              <span class="material-icons-round">download</span>
            </div>
            <h4>Export Material Orders (CSV)</h4>
          </div>
          <p>Download all material orders as a CSV file.</p>
        </div>
        <div class="import-option" id="export-full-backup">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon green">
              <span class="material-icons-round">cloud_download</span>
            </div>
            <h4>Full Backup (JSON)</h4>
          </div>
          <p>Download complete backup of all data (projects, materials, customers, invoices).</p>
        </div>
        <div class="import-option" id="btn-clear-all" style="border-color: rgba(239,68,68,0.2);">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div class="stat-card-icon red">
              <span class="material-icons-round">delete_forever</span>
            </div>
            <h4 style="color: var(--text-danger);">Clear All Data</h4>
          </div>
          <p>Delete all data from the application. This cannot be undone!</p>
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
      'Clear All Data',
      'This will permanently delete ALL your data including project orders, material orders, customers, and invoices. This action CANNOT be undone!'
    );
    if (confirmed) {
      await clearStore('projectOrders');
      await clearStore('materialOrders');
      await clearStore('customers');
      await clearStore('invoices');
      showToast('All data has been cleared');
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
      const rawData = parseCSV(e.target.result);

      if (rawData.length === 0) {
        showToast('No data found in CSV file', 'error');
        return;
      }

      // Map CSV columns to our schema
      let mappedData;
      if (type === 'projectOrders') {
        mappedData = mapProjectCSV(rawData);
      } else {
        mappedData = mapMaterialCSV(rawData);
      }

      pendingImportData = mappedData;
      pendingImportType = type;

      showImportPreview(mappedData, type);
    } catch (err) {
      showToast('Error parsing CSV: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function mapProjectCSV(data) {
  return data.map(row => {
    // Try to match columns flexibly
    const findCol = (...names) => {
      for (const name of names) {
        for (const key of Object.keys(row)) {
          if (key.toLowerCase().trim().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
            return row[key];
          }
        }
      }
      return '';
    };

    return {
      name: findCol('NAME', 'CUSTOMER') || '',
      projectName: findCol('PNAME', 'PROJECT', 'PROJECTNAME') || '',
      payment: parseCurrency(findCol('PAYMENT', 'AMOUNT', 'TOTAL')),
      received: parseCurrency(findCol('RECEIVED', 'PAID')),
      pending: parseCurrency(findCol('PENDING', 'BALANCE', 'DUE')),
      orderDate: findCol('ORDERDATE', 'DATE') || '',
      dueDate: findCol('DUEDATE', 'DEADLINE') || '',
      materialCost: parseCurrency(findCol('MATERIALCOST', 'MATERIAL')),
      miscExpenses: parseCurrency(findCol('MISCEXPENSES', 'MISC', 'EXPENSES')),
      profit: parseCurrency(findCol('PROFIT', 'EARNINGS')),
      phone: findCol('PHNO', 'PHONE', 'CONTACT', 'MOBILE') || '',
      status: normalizeStatus(findCol('STATUS', 'STATE') || 'pending'),
    };
  }).filter(r => r.name || r.projectName);
}

function mapMaterialCSV(data) {
  return data.map(row => {
    const findCol = (...names) => {
      for (const name of names) {
        for (const key of Object.keys(row)) {
          if (key.toLowerCase().trim().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
            return row[key];
          }
        }
      }
      return '';
    };

    return {
      customerName: findCol('CUSTOMERNAME', 'NAME', 'CUSTOMER') || '',
      orderType: findCol('ORDERTYPE', 'TYPE') || 'Component Order',
      orderDate: findCol('ORDERDATE', 'DATE') || '',
      materialItem: findCol('MATERIALITEM', 'MATERIAL', 'ITEM') || '',
      qty: parseInt(findCol('QTY', 'QUANTITY')) || 1,
      unitPrice: parseCurrency(findCol('UNITPRICE', 'PRICE', 'RATE')),
      totalPrice: parseCurrency(findCol('TOTALPRICE', 'TOTAL')),
      received: parseCurrency(findCol('RECEIVED', 'PAID')),
      balance: parseCurrency(findCol('BALANCE', 'DUE', 'PENDING')),
      wholesaleDate: findCol('WHOLESALEDATE') || '',
      wholesaleTotal: parseCurrency(findCol('WHOLESALETOTAL', 'WHOLESALE')),
      porterCharge: parseCurrency(findCol('PORTERCHARGE', 'PORTER', 'DELIVERY')),
      netProfit: parseCurrency(findCol('NETPROFIT', 'PROFIT')),
      contactNo: findCol('CONTACTNO', 'CONTACT', 'PHONE', 'MOBILE') || '',
      orderStatus: normalizeStatus(findCol('ORDERSTATUS', 'STATUS') || 'pending'),
      wholesaleStatus: findCol('WHOLESALESTATUS') || 'pending',
      trackingNotes: findCol('TRACKINGNOTES', 'TRACKING', 'NOTES') || '',
    };
  }).filter(r => r.customerName || r.materialItem);
}

function showImportPreview(data, type) {
  const preview = document.getElementById('import-preview');
  const previewTable = document.getElementById('import-preview-table');
  const rowCount = document.getElementById('import-row-count');

  preview.style.display = 'block';
  rowCount.textContent = `${data.length} rows found`;

  if (data.length === 0) {
    previewTable.innerHTML = '<p style="padding: 24px; color: var(--text-secondary)">No valid data found. Please check your CSV format.</p>';
    return;
  }

  const headers = Object.keys(data[0]);
  const displayData = data.slice(0, 10); // Show first 10 rows

  previewTable.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          ${headers.map(h => `<th>${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${displayData.map(row => `
          <tr>
            ${headers.map(h => `<td>${row[h] ?? '—'}</td>`).join('')}
          </tr>
        `).join('')}
        ${data.length > 10 ? `
          <tr>
            <td colspan="${headers.length}" style="text-align:center; color: var(--text-secondary); font-style:italic;">
              ... and ${data.length - 10} more rows
            </td>
          </tr>
        ` : ''}
      </tbody>
    </table>
  `;
}

async function confirmImport() {
  if (!pendingImportData || !pendingImportType) return;

  try {
    const count = await bulkAdd(pendingImportType, pendingImportData);
    showToast(`Successfully imported ${count} records!`);

    pendingImportData = null;
    pendingImportType = '';
    document.getElementById('import-preview').style.display = 'none';
  } catch (err) {
    showToast('Import error: ' + err.message, 'error');
  }
}

function handleJSONFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const jsonData = JSON.parse(e.target.result);
      const counts = await importData(jsonData);

      const summary = Object.entries(counts)
        .filter(([_, v]) => v > 0)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');

      showToast(summary ? `Imported: ${summary}` : 'No data found in backup file');
    } catch (err) {
      showToast('Error reading backup: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
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
    'TRACKING/NOTES': o.trackingNotes,
  }));

  const csv = toCSV(exportData);
  downloadFile(csv, `material-orders-${new Date().toISOString().split('T')[0]}.csv`);
  showToast('Material orders exported as CSV');
}

async function exportFullBackup() {
  const data = await exportAllData();
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `project-mafia-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  showToast('Full backup downloaded');
}

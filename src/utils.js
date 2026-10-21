/**
 * Utility functions
 */

// Format currency in INR
export function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Format compact currency
export function formatCurrencyCompact(amount) {
  const num = parseFloat(amount) || 0;
  if (num >= 100000) return '₹' + (num / 100000).toFixed(1) + 'L';
  if (num >= 1000) return '₹' + (num / 1000).toFixed(1) + 'K';
  return '₹' + num.toFixed(0);
}

// Format date
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// Format date for input
export function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // Try parsing DD-MM-YYYY or YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    return '';
  }
  return date.toISOString().split('T')[0];
}

// Get relative time
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

// Normalize status string
export function normalizeStatus(status) {
  if (!status) return 'pending';
  const s = status.toLowerCase().trim();
  if (s.includes('deliver')) return 'delivered';
  if (s.includes('complet')) return 'completed';
  if (s.includes('assembl')) return 'in-assembly';
  if (s.includes('wait')) return 'waiting';
  if (s.includes('pend')) return 'pending';
  return s;
}

// Clean customer name from legacy spreadsheet deduplication suffixes (e.g. "Aryaman 2" -> "Aryaman")
export function cleanCustomerName(name) {
  if (!name) return '';
  const trimmed = name.trim();
  // Preserve pure phone numbers like "78589 97375" or "74949 99350"
  if (/^\d{5}\s+\d{5}$/.test(trimmed) || /^\d{10}$/.test(trimmed)) {
    return trimmed;
  }
  // Strip trailing numbers or arbitrary single letters added for excel vlookup
  return trimmed.replace(/\s+\d+$|\s+[A-Za-z]$/, '').trim();
}


// Get status label
export function getStatusLabel(status) {
  const map = {
    'delivered': 'Delivered',
    'completed': 'Completed',
    'in-assembly': 'In Assembly',
    'waiting': 'Waiting for Material',
    'pending': 'Pending',
  };
  return map[status] || status;
}

// Generate a unique invoice number
export function generateInvoiceNumber() {
  const date = new Date();
  const prefix = 'PM';
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${year}${month}-${random}`;
}

// Parse CSV text into array of objects
export function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = (values[idx] || '').trim();
    });
    data.push(row);
  }

  return data;
}

// Parse a single CSV line (handles quoted values)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Convert array of objects to CSV
export function toCSV(data) {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const lines = [headers.join(',')];

  data.forEach(row => {
    const values = headers.map(h => {
      const val = row[h] ?? '';
      const str = String(val);
      // Escape commas and quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    });
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

// Download file
export function downloadFile(content, filename, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Debounce function
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Get initials from name
export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Parse currency string to number
export function parseCurrency(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return parseFloat(String(str).replace(/[₹,\s]/g, '')) || 0;
}

// Show toast notification
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const icons = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
    warning: 'warning',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="material-icons-round">${icons[type] || 'info'}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Confirm dialog
export function showConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');

    container.innerHTML = `
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close" id="confirm-cancel-x">
          <span class="material-icons-round">close</span>
        </button>
      </div>
      <div class="modal-body">
        <div class="confirm-content">
          <span class="material-icons-round">warning</span>
          <h3>${title}</h3>
          <p>${message}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="confirm-cancel">Cancel</button>
        <button class="btn-danger" id="confirm-ok">
          <span class="material-icons-round">delete</span>
          <span>Confirm</span>
        </button>
      </div>
    `;

    overlay.classList.remove('hidden');

    const cleanup = (result) => {
      overlay.classList.add('hidden');
      resolve(result);
    };

    document.getElementById('confirm-cancel-x').onclick = () => cleanup(false);
    document.getElementById('confirm-cancel').onclick = () => cleanup(false);
    document.getElementById('confirm-ok').onclick = () => cleanup(true);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
  });
}

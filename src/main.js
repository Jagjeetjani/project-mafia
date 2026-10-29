/**
 * Project Mafia — Main Application Entry Point
 * Routing, Quick Add, Global Search, Notifications, Database Seeding
 * Enhanced with Role-Based Access Control (RBAC), Work Portal & Delegation
 */
import {
  initDB, getAll, bulkAdd, count, add, clearStore, update,
  resetProjectOrdersToSeed, resetMaterialOrdersToSeed
} from './db.js';
import { isCloudConnected } from './firebase.js';
import { getCurrentUser, logout, isAdmin, isWorker, checkAndSeedTeam } from './auth.js';
import { renderLoginPage, initLoginPage } from './pages/login.js';
import { renderWorkPortal, initWorkPortal } from './pages/workPortal.js';
import { renderTeamPage, initTeamPage } from './pages/team.js';
import { renderDashboard, initDashboard } from './pages/dashboard.js';
import { renderProjectOrders, initProjectOrders, openProjectModal } from './pages/projects.js';
import { renderMaterialOrders, initMaterialOrders, openMaterialModal } from './pages/materials.js';
import { renderPorterBatches, initPorterBatches, openBatchModal } from './pages/porterBatches.js';
import { renderCustomers, initCustomers, openCustomerModal } from './pages/customers.js';
import { renderInvoices, initInvoices, openCreateInvoiceModal } from './pages/invoices.js';
import { renderImportExport, initImportExport } from './pages/importExport.js';
import { seedProjectOrders, seedMaterialOrders, seedPorterBatches } from './seedData.js';
import { showToast, formatCurrency, formatDate, cleanCustomerName } from './utils.js';

// Route Definitions with Role Guards
const routes = {
  dashboard: { render: renderDashboard, init: initDashboard, title: 'Dashboard', adminOnly: true },
  projects: { render: renderProjectOrders, init: initProjectOrders, title: 'Project Orders', adminOnly: true },
  materials: { render: renderMaterialOrders, init: initMaterialOrders, title: 'Material Orders', adminOnly: true },
  batches: { render: renderPorterBatches, init: initPorterBatches, title: 'Porter Delivery Batches', adminOnly: true },
  customers: { render: renderCustomers, init: initCustomers, title: 'Customers', adminOnly: true },
  tasks: { render: renderWorkPortal, init: initWorkPortal, title: 'Work Portal' },
  team: { render: renderTeamPage, init: initTeamPage, title: 'Team & Staff', adminOnly: true },
  invoices: { render: renderInvoices, init: initInvoices, title: 'Invoices', adminOnly: true },
  import: { render: renderImportExport, init: initImportExport, title: 'Import / Export', adminOnly: true },
};

let currentPage = 'dashboard';

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDB();
    await checkAndSeedDatabase();
    await checkAndSeedTeam();
    await updateSidebarBadges();
    setupNavigation();
    setupGlobalSearch();
    setupQuickAdd();
    setupNotifications();
    setupSidebarToggle();
    setupKeyboardShortcuts();
    setupCloudSyncPill();
    setupAuthListeners();

    // Cross-device real-time sync listener:
    // When any device modifies data, instantly refresh badges and active view without scroll jumping or wiping inputs!
    window.addEventListener('cloud-data-changed', async (e) => {
      const { storeName } = e.detail || {};
      await updateSidebarBadges();

      const storeToRouteMap = {
        projectOrders: 'projects',
        materialOrders: 'materials',
        porterBatches: 'batches',
        customers: 'customers',
        invoices: 'invoices',
        workTasks: 'tasks',
        teamMembers: 'team',
      };

      if (currentPage === 'dashboard' || (storeToRouteMap[storeName] && currentPage === storeToRouteMap[storeName])) {
        const overlay = document.getElementById('modal-overlay');
        if (!overlay || overlay.classList.contains('hidden')) {
          // If the user is actively typing in a search box or input, do not interrupt them!
          const activeEl = document.activeElement;
          const isUserTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
          if (isUserTyping) return;

          // Preserve scroll position
          const scrollY = window.scrollY;

          // Surgical refresh: re-run the page's init() to update tables/stats without destroying outer DOM
          try {
            if (currentPage === 'projects') {
              await initProjectOrders();
            } else if (currentPage === 'materials') {
              await initMaterialOrders();
            } else if (currentPage === 'batches') {
              await initPorterBatches();
            } else if (currentPage === 'customers') {
              await initCustomers();
            } else if (currentPage === 'invoices') {
              await initInvoices();
            } else if (currentPage === 'tasks') {
              await initWorkPortal();
            } else if (currentPage === 'team') {
              await initTeamPage();
            } else if (currentPage === 'dashboard') {
              await initDashboard();
            }
          } catch (err) {
            console.error(`Error surgically refreshing page ${currentPage}:`, err);
          }

          // Restore scroll position instantly
          window.scrollTo({ top: scrollY, behavior: 'instant' });
        }
      }
    });

    // Initialize UI for current user or show login screen
    const user = getCurrentUser();
    setupAppForRole(user);

    // Update storage status indicator in sidebar footer
    const storageEl = document.getElementById('storage-status');
    if (storageEl) {
      storageEl.innerHTML = `<span style="color:var(--text-success);font-weight:600">● Firebase Cloud Live</span>`;
    }
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Failed to initialize database: ' + err.message, 'error');
  }
});

/**
 * Seed database if completely empty in cloud
 */
async function checkAndSeedDatabase() {
  const pCount = await count('projectOrders');
  const mCount = await count('materialOrders');
  const bCount = await count('porterBatches');

  // Only seed if cloud database is completely empty
  if (pCount === 0 && mCount === 0) {
    console.log('Seeding initial business records to Firebase Cloud...');
    await bulkAdd('projectOrders', JSON.parse(JSON.stringify(seedProjectOrders)));
    await bulkAdd('materialOrders', JSON.parse(JSON.stringify(seedMaterialOrders)));
    await syncCustomerDirectory(true);
  }

  // Seed Porter Batches if empty
  if (bCount === 0 && seedPorterBatches && seedPorterBatches.length > 0) {
    console.log('Seeding initial Porter Batches to Firebase Cloud...');
    await bulkAdd('porterBatches', JSON.parse(JSON.stringify(seedPorterBatches)));
  }

  // Ensure project orders carry batchId & lotListNumber if linked material order has it
  try {
    const projects = await getAll('projectOrders');
    const materials = await getAll('materialOrders');
    for (const p of projects) {
      if (p.materialOrderId) {
        const m = materials.find(mat => mat.id === p.materialOrderId);
        if (m && m.batchId && (!p.batchId || !p.lotListNumber)) {
          p.batchId = m.batchId;
          p.lotListNumber = m.lotListNumber || 1;
          await update('projectOrders', p);
        }
      }
    }
  } catch (e) {
    console.warn('Sync existing project batch info:', e);
  }
}

function setupCloudSyncPill() {
  const pill = document.getElementById('cloud-sync-pill');
  const label = document.getElementById('cloud-sync-label');

  window.addEventListener('cloud-sync-status', (e) => {
    if (!pill || !label) return;
    const { connected, syncing, text } = e.detail || {};
    pill.classList.remove('syncing', 'offline');
    if (syncing) {
      pill.classList.add('syncing');
    } else if (!connected) {
      pill.classList.add('offline');
    }
    label.textContent = text || (connected ? 'Firebase Cloud Live' : 'Offline');
  });
}

/**
 * Ensure customer directory contains all contacts from project and material orders
 */
export async function syncCustomerDirectory(forceReset = false) {
  if (forceReset) {
    await clearStore('customers');
  }
  const existingCustomers = await getAll('customers');
  const customerMap = new Map();
  existingCustomers.forEach(c => customerMap.set(c.name?.toLowerCase(), c));

  const newCustomers = [];

  seedProjectOrders.forEach(order => {
    const cleanName = cleanCustomerName(order.name);
    if (cleanName && !customerMap.has(cleanName.toLowerCase())) {
      const c = {
        name: cleanName,
        phone: order.phone || '',
        email: '',
        address: '',
        notes: `Project: ${order.projectName}`,
      };
      customerMap.set(cleanName.toLowerCase(), c);
      newCustomers.push(c);
    }
  });

  seedMaterialOrders.forEach(order => {
    const cleanName = cleanCustomerName(order.customerName);
    if (cleanName && !customerMap.has(cleanName.toLowerCase())) {
      const c = {
        name: cleanName,
        phone: order.contactNo || '',
        email: '',
        address: '',
        notes: `Material: ${order.materialItem}`,
      };
      customerMap.set(cleanName.toLowerCase(), c);
      newCustomers.push(c);
    }
  });

  if (newCustomers.length > 0) {
    await bulkAdd('customers', newCustomers);
  }
}

/**
 * 1-Click Complete Force Sync from Verified Seed Data
 */
export async function forceSyncPreloadedData() {
  await resetProjectOrdersToSeed(seedProjectOrders);
  await resetMaterialOrdersToSeed(seedMaterialOrders);
  await syncCustomerDirectory();
  localStorage.setItem('pm_verified_33_orders', 'true');
  localStorage.setItem('pm_verified_40_materials', 'true');
  await updateSidebarBadges();
  showToast('Verified all 33 Projects & 40 Material Orders from spreadsheets!', 'success');
}

/**
 * Update Sidebar Badges for total counts
 */
export async function updateSidebarBadges() {
  try {
    const [pCount, mCount, bCount, tCount] = await Promise.all([
      count('projectOrders'),
      count('materialOrders'),
      count('porterBatches'),
      count('workTasks')
    ]);

    const badgeP = document.getElementById('badge-projects');
    const badgeM = document.getElementById('badge-materials');
    const badgeB = document.getElementById('badge-batches');
    const badgeT = document.getElementById('badge-tasks');

    if (badgeP) badgeP.textContent = pCount;
    if (badgeM) badgeM.textContent = mCount;
    if (badgeB) badgeB.textContent = bCount;
    if (badgeT) badgeT.textContent = tCount;

    // Mobile Bottom Navigation Badges
    const bottomP = document.getElementById('bottom-badge-projects');
    const bottomM = document.getElementById('bottom-badge-materials');
    const bottomB = document.getElementById('bottom-badge-batches');
    const bottomT = document.getElementById('bottom-badge-tasks');
    if (bottomP) bottomP.textContent = pCount;
    if (bottomM) bottomM.textContent = mCount;
    if (bottomB) bottomB.textContent = bCount;
    if (bottomT) bottomT.textContent = tCount;
  } catch (e) {
    console.warn('Could not update badges', e);
  }
}

/**
 * Setup Role-Based Access Control and Auth Listeners
 */
function setupAuthListeners() {
  window.addEventListener('auth-changed', (e) => {
    setupAppForRole(e.detail?.user);
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    logout();
  });
}

export function setupAppForRole(user) {
  const loginOverlay = document.getElementById('login-overlay-root');
  const appContainer = document.getElementById('app');

  if (!user) {
    if (loginOverlay) {
      loginOverlay.innerHTML = renderLoginPage();
      loginOverlay.classList.remove('hidden');
      initLoginPage();
    }
    if (appContainer) appContainer.style.display = 'none';
    return;
  }

  // User is authenticated
  if (loginOverlay) {
    loginOverlay.classList.add('hidden');
    loginOverlay.innerHTML = '';
  }
  if (appContainer) appContainer.style.display = 'flex';

  // Update topbar user pill
  const nameEl = document.getElementById('auth-user-name');
  const avatarEl = document.getElementById('auth-avatar');
  if (nameEl) nameEl.textContent = user.name;
  if (avatarEl) {
    avatarEl.textContent = user.name.charAt(0).toUpperCase();
    avatarEl.style.background = user.avatarColor || '#6366f1';
  }

  const isUserAdmin = user.role === 'admin';

  // Toggle admin-only navigation links
  document.querySelectorAll('.admin-only-nav').forEach(el => {
    el.style.display = isUserAdmin ? '' : 'none';
  });

  // Adjust work portal navigation label
  const tasksLabel = document.getElementById('nav-label-tasks');
  if (tasksLabel) {
    tasksLabel.textContent = isUserAdmin ? 'Team Tasks' : 'My Work Portal';
  }

  // Adjust bottom navigation on mobile
  const bottomProjects = document.querySelector('.bottom-nav-item[data-page="projects"]');
  const bottomMaterials = document.querySelector('.bottom-nav-item[data-page="materials"]');
  const bottomBatches = document.querySelector('.bottom-nav-item[data-page="batches"]');
  const bottomDashboard = document.querySelector('.bottom-nav-item[data-page="dashboard"]');

  if (!isUserAdmin) {
    if (bottomProjects) bottomProjects.style.display = 'none';
    if (bottomMaterials) bottomMaterials.style.display = 'none';
    if (bottomBatches) bottomBatches.style.display = 'none';
    if (bottomDashboard) bottomDashboard.style.display = 'none';
  } else {
    if (bottomProjects) bottomProjects.style.display = '';
    if (bottomMaterials) bottomMaterials.style.display = '';
    if (bottomBatches) bottomBatches.style.display = '';
    if (bottomDashboard) bottomDashboard.style.display = '';
  }

  // Navigate according to role
  const hash = window.location.hash.replace('#', '').trim();
  if (!isUserAdmin) {
    navigate('tasks');
  } else if (routes[hash]) {
    navigate(hash);
  } else {
    navigate('dashboard');
  }
}

/**
 * Navigate to a Page
 */
export async function navigate(pageId) {
  const user = getCurrentUser();
  const isUserWorker = user && user.role === 'worker';

  // Role guard: Workers cannot access admin-only pages
  if (isUserWorker && routes[pageId]?.adminOnly) {
    pageId = 'tasks';
  } else if (!routes[pageId]) {
    pageId = isUserWorker ? 'tasks' : 'dashboard';
  }
  currentPage = pageId;

  // Close any open popups on navigation
  document.getElementById('global-search-results')?.classList.add('hidden');
  document.getElementById('notifications-dropdown')?.classList.add('hidden');

  // Update URL hash without scroll
  history.replaceState(null, '', `#${pageId}`);

  // Update active sidebar state
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
    if (el.dataset.page === pageId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Update active bottom navigation state (iOS)
  document.querySelectorAll('.bottom-nav-item').forEach(el => {
    if (el.dataset.page === pageId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Render Page Content
  const container = document.getElementById('page-container');
  if (!container) return;

  container.innerHTML = routes[pageId].render();

  // Initialize Page Logic
  try {
    await routes[pageId].init();
  } catch (err) {
    console.error(`Error initializing page ${pageId}:`, err);
  }

  // Refresh badges in sidebar & bottom nav
  updateSidebarBadges();
}

/**
 * Setup Sidebar Navigation & Mobile Bottom Nav Clicks
 */
function setupNavigation() {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) {
        navigate(page);
        // On mobile, close sidebar & backdrop after navigation
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('active');
      }
    });
  });

  // Mobile Bottom Navigation clicks (iOS)
  document.querySelectorAll('.bottom-nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) {
        navigate(page);
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('active');
      }
    });
  });

  // Mobile "More" button toggles sidebar drawer
  const bottomMenuBtn = document.getElementById('bottom-nav-menu');
  if (bottomMenuBtn) {
    bottomMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebar-backdrop');
      const isOpen = sidebar?.classList.toggle('open');
      backdrop?.classList.toggle('active', !!isOpen);
    });
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '').trim();
    if (routes[hash] && hash !== currentPage) {
      navigate(hash);
    }
  });
}

/**
 * Setup Quick Add Modal Button
 */
function setupQuickAdd() {
  const quickAddBtn = document.getElementById('btn-quick-add');
  if (!quickAddBtn) return;

  quickAddBtn.addEventListener('click', () => {
    openQuickAddMenu();
  });
}

function openQuickAddMenu() {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');
  if (!overlay || !container) return;

  container.innerHTML = `
    <div class="modal-header">
      <h2>Quick Actions</h2>
      <button class="modal-close" id="modal-close">
        <span class="material-icons-round">close</span>
      </button>
    </div>
    <div class="modal-body">
      <p style="color:var(--text-secondary); margin-bottom: 20px;">Choose what you would like to create:</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
        <button id="qa-project" class="quick-add-card" style="display:flex; flex-direction:column; align-items:flex-start; gap:8px; padding:20px; background:var(--bg-tertiary); border:1px solid var(--border-primary); border-radius:var(--radius-md); text-align:left; cursor:pointer; transition:var(--transition-fast);">
          <div style="width:40px; height:40px; border-radius:10px; background:rgba(124,58,237,0.15); color:var(--accent-purple); display:flex; align-items:center; justify-content:center;">
            <span class="material-icons-round">inventory_2</span>
          </div>
          <strong style="color:var(--text-primary); font-size:1.05rem;">Project Order</strong>
          <span style="color:var(--text-tertiary); font-size:0.85rem;">Track readymade project order, milestones & student details</span>
        </button>

        <button id="qa-material" class="quick-add-card" style="display:flex; flex-direction:column; align-items:flex-start; gap:8px; padding:20px; background:var(--bg-tertiary); border:1px solid var(--border-primary); border-radius:var(--radius-md); text-align:left; cursor:pointer; transition:var(--transition-fast);">
          <div style="width:40px; height:40px; border-radius:10px; background:rgba(16,185,129,0.15); color:var(--accent-green); display:flex; align-items:center; justify-content:center;">
            <span class="material-icons-round">shopping_cart</span>
          </div>
          <strong style="color:var(--text-primary); font-size:1.05rem;">Material Order</strong>
          <span style="color:var(--text-tertiary); font-size:0.85rem;">Log component procurement, wholesale cost & porter charges</span>
        </button>

        <button id="qa-batch" class="quick-add-card" style="display:flex; flex-direction:column; align-items:flex-start; gap:8px; padding:20px; background:var(--bg-tertiary); border:1px solid var(--border-primary); border-radius:var(--radius-md); text-align:left; cursor:pointer; transition:var(--transition-fast);">
          <div style="width:40px; height:40px; border-radius:10px; background:rgba(245,158,11,0.15); color:var(--accent-orange); display:flex; align-items:center; justify-content:center;">
            <span class="material-icons-round">local_shipping</span>
          </div>
          <strong style="color:var(--text-primary); font-size:1.05rem;">Porter Delivery Batch</strong>
          <span style="color:var(--text-tertiary); font-size:0.85rem;">Group wholesale delivery & auto-split charges equally</span>
        </button>

        <button id="qa-customer" class="quick-add-card" style="display:flex; flex-direction:column; align-items:flex-start; gap:8px; padding:20px; background:var(--bg-tertiary); border:1px solid var(--border-primary); border-radius:var(--radius-md); text-align:left; cursor:pointer; transition:var(--transition-fast);">
          <div style="width:40px; height:40px; border-radius:10px; background:rgba(59,130,246,0.15); color:var(--accent-blue); display:flex; align-items:center; justify-content:center;">
            <span class="material-icons-round">person_add</span>
          </div>
          <strong style="color:var(--text-primary); font-size:1.05rem;">New Customer</strong>
          <span style="color:var(--text-tertiary); font-size:0.85rem;">Add a new client contact with phone and requirements</span>
        </button>
      </div>
    </div>
  `;

  overlay.classList.remove('hidden');

  document.getElementById('modal-close').onclick = () => overlay.classList.add('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

  document.getElementById('qa-project').onclick = () => {
    overlay.classList.add('hidden');
    navigate('projects');
    setTimeout(() => openProjectModal(), 100);
  };

  document.getElementById('qa-material').onclick = () => {
    overlay.classList.add('hidden');
    navigate('materials');
    setTimeout(() => openMaterialModal(), 100);
  };

  document.getElementById('qa-batch').onclick = () => {
    overlay.classList.add('hidden');
    navigate('batches');
    setTimeout(() => openBatchModal(), 100);
  };

  document.getElementById('qa-customer').onclick = () => {
    overlay.classList.add('hidden');
    navigate('customers');
    setTimeout(() => openCustomerModal(), 100);
  };
}

/**
 * Setup Global Search across all entities with Mutual Closing
 */
function setupGlobalSearch() {
  const searchInput = document.getElementById('global-search');
  const clearBtn = document.getElementById('btn-clear-search');
  const kbd = document.getElementById('search-kbd');
  if (!searchInput) return;

  let resultsContainer = document.getElementById('global-search-results');
  if (!resultsContainer) {
    resultsContainer = document.createElement('div');
    resultsContainer.id = 'global-search-results';
    resultsContainer.className = 'global-search-dropdown hidden';
    searchInput.parentElement.appendChild(resultsContainer);
  }

  let debounceTimer;

  function updateClearBtnVisibility() {
    if (searchInput.value.trim()) {
      clearBtn?.classList.remove('hidden');
      kbd?.classList.add('hidden');
    } else {
      clearBtn?.classList.add('hidden');
      kbd?.classList.remove('hidden');
    }
  }

  clearBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    searchInput.value = '';
    resultsContainer.classList.add('hidden');
    updateClearBtnVisibility();
    searchInput.focus();
  });

  searchInput.addEventListener('input', (e) => {
    // Close notifications immediately when searching
    document.getElementById('notifications-dropdown')?.classList.add('hidden');
    updateClearBtnVisibility();

    clearTimeout(debounceTimer);
    const query = e.target.value.trim().toLowerCase();
    if (!query) {
      resultsContainer.classList.add('hidden');
      return;
    }

    debounceTimer = setTimeout(async () => {
      await performGlobalSearch(query, resultsContainer);
    }, 200);
  });

  searchInput.addEventListener('focus', () => {
    // Close notifications immediately
    document.getElementById('notifications-dropdown')?.classList.add('hidden');

    if (searchInput.value.trim()) {
      resultsContainer.classList.remove('hidden');
    }
  });
}

async function performGlobalSearch(query, resultsContainer) {
  const [projects, materials, customers] = await Promise.all([
    getAll('projectOrders'),
    getAll('materialOrders'),
    getAll('customers'),
  ]);

  const matchedProjects = projects.filter(p =>
    p.name?.toLowerCase().includes(query) ||
    p.projectName?.toLowerCase().includes(query) ||
    p.phone?.toLowerCase().includes(query)
  ).slice(0, 5);

  const matchedMaterials = materials.filter(m =>
    m.customerName?.toLowerCase().includes(query) ||
    m.materialItem?.toLowerCase().includes(query) ||
    m.contactNo?.toLowerCase().includes(query)
  ).slice(0, 5);

  const matchedCustomers = customers.filter(c =>
    c.name?.toLowerCase().includes(query) ||
    c.phone?.toLowerCase().includes(query)
  ).slice(0, 5);

  const totalMatches = matchedProjects.length + matchedMaterials.length + matchedCustomers.length;

  if (totalMatches === 0) {
    resultsContainer.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 0.85rem;">
        No results found for "${query}"
      </div>
    `;
    resultsContainer.classList.remove('hidden');
    return;
  }

  let html = '';

  if (matchedProjects.length > 0) {
    html += `<div class="search-section-title">Project Orders (${matchedProjects.length})</div>`;
    matchedProjects.forEach(p => {
      html += `
        <div class="search-result-item" data-type="project" data-id="${p.id}">
          <span class="material-icons-round" style="color:var(--accent-purple)">inventory_2</span>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; color:var(--text-primary);">${p.projectName}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${p.name} • ${formatCurrency(p.payment)} • ${p.status}</div>
          </div>
        </div>
      `;
    });
  }

  if (matchedMaterials.length > 0) {
    html += `<div class="search-section-title">Material Orders (${matchedMaterials.length})</div>`;
    matchedMaterials.forEach(m => {
      html += `
        <div class="search-result-item" data-type="material" data-id="${m.id}">
          <span class="material-icons-round" style="color:var(--accent-green)">shopping_cart</span>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; color:var(--text-primary);">${m.materialItem}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${m.customerName} • ${formatCurrency(m.totalPrice)} • ${m.orderStatus}</div>
          </div>
        </div>
      `;
    });
  }

  if (matchedCustomers.length > 0) {
    html += `<div class="search-section-title">Customers (${matchedCustomers.length})</div>`;
    matchedCustomers.forEach(c => {
      html += `
        <div class="search-result-item" data-type="customer" data-id="${c.id}">
          <span class="material-icons-round" style="color:var(--accent-blue)">person</span>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; color:var(--text-primary);">${c.name}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${c.phone || 'No phone'}</div>
          </div>
        </div>
      `;
    });
  }

  resultsContainer.innerHTML = html;
  resultsContainer.classList.remove('hidden');

  resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type;
      resultsContainer.classList.add('hidden');
      document.getElementById('global-search').value = '';

      if (type === 'project') navigate('projects');
      else if (type === 'material') navigate('materials');
      else if (type === 'customer') navigate('customers');
    });
  });
}

/**
 * Setup Notifications & Pending Deadlines with Mutual Closing
 */
function setupNotifications() {
  const notifBtn = document.getElementById('btn-notifications');
  const notifDot = document.getElementById('notification-dot');
  if (!notifBtn) return;

  let notifDropdown = document.getElementById('notifications-dropdown');
  if (!notifDropdown) {
    notifDropdown = document.createElement('div');
    notifDropdown.id = 'notifications-dropdown';
    notifDropdown.className = 'notifications-dropdown hidden';
    notifBtn.parentElement.appendChild(notifDropdown);
  }

  refreshNotifications(notifDot, notifDropdown);

  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    // Close search dropdown immediately
    document.getElementById('global-search-results')?.classList.add('hidden');

    const isHidden = notifDropdown.classList.contains('hidden');
    if (isHidden) {
      notifDropdown.classList.remove('hidden');
      refreshNotifications(notifDot, notifDropdown);
    } else {
      notifDropdown.classList.add('hidden');
    }
  });

  // Universal outside-click dismiss for notifications and search
  document.addEventListener('click', (e) => {
    const notif = document.getElementById('notifications-dropdown');
    const btn = document.getElementById('btn-notifications');
    const searchDropdown = document.getElementById('global-search-results');
    const searchContainer = document.querySelector('.topbar-search');

    if (notif && !notif.classList.contains('hidden')) {
      if (!btn?.contains(e.target) && !notif.contains(e.target)) {
        notif.classList.add('hidden');
      }
    }

    if (searchDropdown && !searchDropdown.classList.contains('hidden')) {
      if (!searchContainer?.contains(e.target)) {
        searchDropdown.classList.add('hidden');
      }
    }
  });
}

async function refreshNotifications(dot, dropdown) {
  try {
    const [projects, materials] = await Promise.all([
      getAll('projectOrders'),
      getAll('materialOrders'),
    ]);

    const waitingForMaterial = projects.filter(p => p.status === 'waiting');
    const pendingPayment = projects.filter(p => parseFloat(p.pending) > 0);
    const inAssembly = projects.filter(p => p.status === 'in-assembly');

    const totalNotifications = waitingForMaterial.length + (pendingPayment.length > 0 ? 1 : 0);

    if (dot) {
      dot.style.display = totalNotifications > 0 ? 'block' : 'none';
    }

    let itemsHtml = `
      <div class="notifications-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <h3>Notifications & Alerts</h3>
          <span class="badge" style="background:var(--accent-purple); color:white; font-size:0.75rem; padding:2px 8px; border-radius:12px;">${totalNotifications} alerts</span>
        </div>
        <button id="btn-close-notif-panel" title="Close Panel" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; padding:4px; display:flex; align-items:center; border-radius:var(--radius-sm);">
          <span class="material-icons-round" style="font-size:20px;">close</span>
        </button>
      </div>
      <div class="notifications-list">
    `;

    if (waitingForMaterial.length > 0) {
      itemsHtml += `
        <div class="notification-item warning" id="notif-waiting-materials" style="cursor:pointer">
          <span class="material-icons-round" style="color:var(--accent-orange)">pending_actions</span>
          <div>
            <div style="font-weight:600; font-size:0.85rem;">${waitingForMaterial.length} Orders Waiting for Materials</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">Needs procurement from Rajindra Electronics</div>
          </div>
        </div>
      `;
    }

    if (pendingPayment.length > 0) {
      const totalPendingSum = pendingPayment.reduce((sum, p) => sum + (parseFloat(p.pending) || 0), 0);
      itemsHtml += `
        <div class="notification-item info" id="notif-pending-payments" style="cursor:pointer">
          <span class="material-icons-round" style="color:var(--accent-blue)">account_balance_wallet</span>
          <div>
            <div style="font-weight:600; font-size:0.85rem;">Pending Payments: ${formatCurrency(totalPendingSum)}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${pendingPayment.length} clients have balance remaining</div>
          </div>
        </div>
      `;
    }

    if (inAssembly.length > 0) {
      itemsHtml += `
        <div class="notification-item success" id="notif-in-assembly" style="cursor:pointer">
          <span class="material-icons-round" style="color:var(--accent-green)">build</span>
          <div>
            <div style="font-weight:600; font-size:0.85rem;">${inAssembly.length} Orders in Assembly</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">Currently being built and tested</div>
          </div>
        </div>
      `;
    }

    if (totalNotifications === 0 && inAssembly.length === 0) {
      itemsHtml += `
        <div style="padding: 24px; text-align: center; color: var(--text-tertiary); font-size: 0.85rem;">
          <span class="material-icons-round" style="font-size: 32px; display:block; margin-bottom: 8px; opacity:0.5;">check_circle</span>
          All caught up! No urgent alerts.
        </div>
      `;
    }

    itemsHtml += `</div>`;
    dropdown.innerHTML = itemsHtml;

    document.getElementById('btn-close-notif-panel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.add('hidden');
    });

    document.getElementById('notif-waiting-materials')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      navigate('projects');
    });

    document.getElementById('notif-pending-payments')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      navigate('projects');
    });

    document.getElementById('notif-in-assembly')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      navigate('projects');
    });

  } catch (err) {
    console.warn('Error refreshing notifications:', err);
  }
}

/**
 * Setup Sidebar Mobile Toggle
 */
function setupSidebarToggle() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      sidebar?.classList.remove('open');
      backdrop.classList.remove('active');
    });
  }

  const closeBtn = document.getElementById('sidebar-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      sidebar?.classList.remove('open');
      backdrop?.classList.remove('active');
    });
  }

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('open');
      backdrop?.classList.toggle('active', isOpen);
    });
  }
}

/**
 * Setup Global Keyboard Shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const search = document.getElementById('global-search');
      if (search) {
        search.focus();
        search.select();
      }
    }

    if (e.key === 'Escape') {
      const search = document.getElementById('global-search');
      if (search) search.blur();

      const overlay = document.getElementById('modal-overlay');
      if (overlay && !overlay.classList.contains('hidden')) {
        overlay.classList.add('hidden');
      }

      const searchDropdown = document.getElementById('global-search-results');
      if (searchDropdown) searchDropdown.classList.add('hidden');

      const notifDropdown = document.getElementById('notifications-dropdown');
      if (notifDropdown) notifDropdown.classList.add('hidden');
    }
  });
}

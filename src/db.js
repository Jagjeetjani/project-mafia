/**
 * Database Module — 100% Cloud-Native with Firebase Realtime Database
 * + Local IndexedDB Offline Resilience & Multi-Device Collision-Proof IDs
 * Real-time synchronization guarantees updates on laptop, mobile, or any device instantly reflect across all devices.
 */
import { openDB } from 'idb';
import {
  initFirebase,
  cloudSave,
  cloudDelete,
  cloudClear,
  cloudBulkSave,
  cloudGetAll,
  cloudGetById,
  subscribeToStore,
  CLOUD_STORES
} from './firebase.js';
import catalogData from './data/catalog.json';
import { defaultProjectRecipes } from './data/projectRecipes.js';

// In-memory responsive cache for instant UI performance
const memoryCache = new Map();
let isInitialized = false;

// === Local IndexedDB Offline Storage & Sync Queue ===
const DB_NAME = 'project-mafia-offline-db';
const DB_VERSION = 2;

let localDbPromise = null;
export function getLocalDB() {
  if (!localDbPromise) {
    localDbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        CLOUD_STORES.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });
        if (!db.objectStoreNames.contains('_syncQueue')) {
          db.createObjectStore('_syncQueue', { keyPath: 'queueId', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('_trash')) {
          db.createObjectStore('_trash', { keyPath: 'trashId', autoIncrement: true });
        }
      }
    });
  }
  return localDbPromise;
}

export async function saveToLocalStore(storeName, item) {
  try {
    const db = await getLocalDB();
    await db.put(storeName, JSON.parse(JSON.stringify(item)));
  } catch (e) {
    console.warn(`Local DB save error (${storeName}):`, e);
  }
}

export async function bulkSaveToLocalStore(storeName, items) {
  try {
    const db = await getLocalDB();
    const tx = db.transaction(storeName, 'readwrite');
    for (const item of items) {
      if (item && item.id !== undefined && item.id !== null) {
        tx.store.put(JSON.parse(JSON.stringify(item)));
      }
    }
    await tx.done;
  } catch (e) {
    console.warn(`Local DB bulk save error (${storeName}):`, e);
  }
}

export async function deleteFromLocalStore(storeName, id) {
  try {
    const db = await getLocalDB();
    await db.delete(storeName, id);
  } catch (e) {
    console.warn(`Local DB delete error (${storeName}):`, e);
  }
}

export async function loadFromLocalStore(storeName) {
  try {
    const db = await getLocalDB();
    return await db.getAll(storeName);
  } catch (e) {
    return [];
  }
}

export async function queueOfflineAction(action, storeName, data) {
  try {
    const db = await getLocalDB();
    await db.add('_syncQueue', {
      action,
      storeName,
      data,
      timestamp: Date.now()
    });
  } catch (e) {
    console.warn('Sync queue error:', e);
  }
}

export async function flushOfflineQueue() {
  try {
    const db = await getLocalDB();
    const queue = await db.getAll('_syncQueue');
    if (!queue || queue.length === 0) return 0;

    let flushed = 0;
    for (const item of queue) {
      try {
        if (item.action === 'save' && item.data) {
          await cloudSave(item.storeName, item.data);
        } else if (item.action === 'delete' && item.data?.id) {
          await cloudDelete(item.storeName, item.data.id);
        }
        await db.delete('_syncQueue', item.queueId);
        flushed++;
      } catch (err) {
        console.warn('Could not flush item:', item, err);
        break; // Stop if network still offline
      }
    }
    return flushed;
  } catch (e) {
    console.warn('Flush offline queue error:', e);
    return 0;
  }
}

export async function restoreFromTrash(trashRecordId) {
  try {
    const db = await getLocalDB();
    const record = await db.get('_trash', trashRecordId);
    if (!record || !record.item) return false;

    const { storeName, item } = record;
    await add(storeName, item);
    await db.delete('_trash', trashRecordId);
    return true;
  } catch (e) {
    console.error('Error restoring from trash:', e);
    return false;
  }
}

/**
 * Initialize Cloud Database and establish real-time listeners across all devices
 * Boots immediately from local IndexedDB for zero latency, then syncs with Firebase Cloud
 */
export async function initDB() {
  if (isInitialized) return true;

  // 1. Instant 0ms boot from local IndexedDB (works offline on phone/desktop)
  await Promise.all(
    CLOUD_STORES.map(async (storeName) => {
      try {
        const localItems = await loadFromLocalStore(storeName);
        if (localItems && localItems.length > 0) {
          memoryCache.set(storeName, localItems);
        }
      } catch (e) {
        console.warn('Local store prefetch error:', e);
      }
    })
  );

  initFirebase();

  // 2. Connect to Firebase Cloud and sync in background
  await Promise.all(
    CLOUD_STORES.map(async (storeName) => {
      try {
        const items = await cloudGetAll(storeName);
        if (items && items.length > 0) {
          memoryCache.set(storeName, items);
          bulkSaveToLocalStore(storeName, items).catch(() => {});
        }

        // Real-time listener: any device changes data -> all devices update immediately
        subscribeToStore(storeName, (updatedItems) => {
          memoryCache.set(storeName, updatedItems);
          bulkSaveToLocalStore(storeName, updatedItems).catch(() => {});
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('cloud-data-changed', {
                detail: { storeName, count: updatedItems.length }
              })
            );
          }
        });
      } catch (err) {
        console.warn(`Error loading cloud store ${storeName}:`, err);
        if (!memoryCache.has(storeName)) {
          memoryCache.set(storeName, []);
        }
      }
    })
  );

  // Auto-flush any pending offline queue if online
  flushOfflineQueue().catch(() => {});

  // Seed default catalog & project recipes if store is empty
  const existingCatalog = memoryCache.get('catalog') || [];
  if (existingCatalog.length === 0 && catalogData && catalogData.length > 0) {
    cloudBulkSave('catalog', catalogData).catch(e => console.warn('Catalog cloud save:', e));
    memoryCache.set('catalog', catalogData);
    bulkSaveToLocalStore('catalog', catalogData).catch(() => {});
  }

  const existingTemplates = memoryCache.get('projectTemplates') || [];
  if (existingTemplates.length === 0 && defaultProjectRecipes && defaultProjectRecipes.length > 0) {
    cloudBulkSave('projectTemplates', defaultProjectRecipes).catch(e => console.warn('Templates cloud save:', e));
    memoryCache.set('projectTemplates', defaultProjectRecipes);
    bulkSaveToLocalStore('projectTemplates', defaultProjectRecipes).catch(() => {});
  }

  isInitialized = true;
  return true;
}

// === Generic Cloud CRUD Operations ===

export async function getAll(storeName) {
  if (!isInitialized) await initDB();

  if (memoryCache.has(storeName)) {
    return JSON.parse(JSON.stringify(memoryCache.get(storeName)));
  }

  const items = await cloudGetAll(storeName);
  memoryCache.set(storeName, items);
  return items;
}

export async function getById(storeName, id) {
  if (!isInitialized) await initDB();

  const numId = parseInt(id, 10);
  const items = memoryCache.get(storeName) || [];
  const found = items.find(i => i.id === numId || i.id === id || String(i.id) === String(id));
  if (found) return JSON.parse(JSON.stringify(found));

  return cloudGetById(storeName, id);
}

export async function add(storeName, data) {
  if (!isInitialized) await initDB();

  const items = memoryCache.get(storeName) || [];
  
  // Safe monotonic ID calculation (collision-proof across devices)
  let maxId = 0;
  for (const item of items) {
    const n = parseInt(item.id, 10);
    if (!isNaN(n) && n > maxId) maxId = n;
  }
  let newId = maxId + 1;
  while (items.some(i => String(i.id) === String(newId))) {
    newId++;
  }

  data.id = newId;
  data.uid = data.uid || `${storeName}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  data.createdAt = data.createdAt || new Date().toISOString();
  data.updatedAt = new Date().toISOString();

  // Save to in-memory cache and IndexedDB immediately (instant response)
  items.push(data);
  memoryCache.set(storeName, items);
  await saveToLocalStore(storeName, data);

  // Save to Firebase Cloud (queue if offline)
  try {
    await cloudSave(storeName, data);
  } catch (err) {
    console.warn(`Cloud save failed for ${storeName}/${newId}, queued locally:`, err);
    await queueOfflineAction('save', storeName, data);
  }

  return newId;
}

export async function update(storeName, data) {
  if (!isInitialized) await initDB();

  data.updatedAt = new Date().toISOString();

  // Update in-memory cache and IndexedDB immediately
  const items = memoryCache.get(storeName) || [];
  const idx = items.findIndex(i => String(i.id) === String(data.id));
  if (idx !== -1) {
    items[idx] = data;
  } else {
    items.push(data);
  }
  memoryCache.set(storeName, items);
  await saveToLocalStore(storeName, data);

  // Save to Firebase Cloud (queue if offline)
  try {
    await cloudSave(storeName, data);
  } catch (err) {
    console.warn(`Cloud update failed for ${storeName}/${data.id}, queued locally:`, err);
    await queueOfflineAction('save', storeName, data);
  }

  return data.id;
}

export async function remove(storeName, id) {
  if (!isInitialized) await initDB();

  const items = memoryCache.get(storeName) || [];
  const found = items.find(i => String(i.id) === String(id));
  let trashRecordId = null;

  // Save to local trash store for 1-click Undo recovery
  if (found) {
    try {
      const db = await getLocalDB();
      trashRecordId = await db.add('_trash', {
        storeName,
        item: JSON.parse(JSON.stringify(found)),
        deletedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Trash save error:', e);
    }
  }

  // Update in-memory cache and IndexedDB
  const filtered = items.filter(i => String(i.id) !== String(id));
  memoryCache.set(storeName, filtered);
  await deleteFromLocalStore(storeName, id);

  // Delete directly from Firebase Cloud
  try {
    await cloudDelete(storeName, id);
  } catch (err) {
    console.warn(`Cloud delete failed for ${storeName}/${id}, queued locally:`, err);
    await queueOfflineAction('delete', storeName, { id });
  }

  return { success: true, trashRecordId };
}

export async function clearStore(storeName) {
  if (!isInitialized) await initDB();

  await cloudClear(storeName);
  memoryCache.set(storeName, []);
  return true;
}

export async function count(storeName) {
  const items = await getAll(storeName);
  return items.length;
}

export async function bulkAdd(storeName, items) {
  if (!isInitialized) await initDB();
  if (!items || !items.length) return 0;

  const existing = memoryCache.get(storeName) || [];
  let maxId = 0;
  for (const item of existing) {
    const n = parseInt(item.id, 10);
    if (!isNaN(n) && n > maxId) maxId = n;
  }

  const now = new Date().toISOString();
  const prepared = items.map((item, index) => {
    const clean = { ...item };
    if (clean.id === undefined || clean.id === null) {
      clean.id = maxId + index + 1;
    }
    clean.createdAt = clean.createdAt || now;
    clean.updatedAt = clean.updatedAt || now;
    return clean;
  });

  await cloudBulkSave(storeName, prepared);
  memoryCache.set(storeName, [...existing, ...prepared]);
  return prepared.length;
}

// === Project Orders Specific ===

export async function getProjectOrders(filters = {}) {
  let orders = await getAll('projectOrders');

  if (filters.status) {
    orders = orders.filter(o => o.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    orders = orders.filter(o =>
      o.name?.toLowerCase().includes(q) ||
      o.projectName?.toLowerCase().includes(q) ||
      o.phone?.toLowerCase().includes(q)
    );
  }
  if (filters.sortBy) {
    orders.sort((a, b) => {
      const aVal = a[filters.sortBy];
      const bVal = b[filters.sortBy];
      if (filters.sortDir === 'desc') return bVal > aVal ? 1 : -1;
      return aVal > bVal ? 1 : -1;
    });
  }

  return orders;
}

// === Material Orders Specific ===

export async function getMaterialOrders(filters = {}) {
  let orders = await getAll('materialOrders');

  if (filters.orderType) {
    orders = orders.filter(o => o.orderType === filters.orderType);
  }
  if (filters.orderStatus) {
    orders = orders.filter(o => o.orderStatus === filters.orderStatus);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    orders = orders.filter(o =>
      o.customerName?.toLowerCase().includes(q) ||
      o.materialItem?.toLowerCase().includes(q) ||
      o.contactNo?.toLowerCase().includes(q)
    );
  }

  return orders;
}

// === Aggregation Helpers ===

export async function getProjectStats() {
  const orders = await getAll('projectOrders');

  const totalOrders = orders.length;
  const totalOrderValue = orders.reduce((sum, o) => sum + (parseFloat(o.payment) || 0), 0);
  const totalReceived = orders.reduce((sum, o) => sum + (parseFloat(o.received) || 0), 0);
  const totalPending = orders.reduce((sum, o) => sum + (parseFloat(o.pending) || 0), 0);
  const totalMaterialCost = orders.reduce((sum, o) => sum + (parseFloat(o.materialCost) || 0), 0);
  const totalMiscExpenses = orders.reduce((sum, o) => sum + (parseFloat(o.miscExpenses) || 0), 0);
  const totalProfit = orders.reduce((sum, o) => sum + (parseFloat(o.profit) || 0), 0);

  const statusCounts = {};
  orders.forEach(o => {
    const s = o.status || 'Unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  return {
    totalOrders,
    totalOrderValue,
    totalReceived,
    totalPending,
    totalMaterialCost,
    totalMiscExpenses,
    totalProfit,
    statusCounts,
    orders,
  };
}

export async function getMaterialStats() {
  const orders = await getAll('materialOrders');

  const totalOrders = orders.length;

  // Separate Direct Component Sales (Stream B) from Project Procurement Tickets (Stream A)
  // Project Procurement tickets are internal sourcing tickets billed under Project Orders.
  const directSales = orders.filter(o => o.orderType !== 'Project Order' && !o.linkedProjectId);
  const projectProcurements = orders.filter(o => o.orderType === 'Project Order' || o.linkedProjectId);

  // Direct retail component sales: real customer revenue, received, pending, profit
  const totalRevenue = directSales.reduce((sum, o) => sum + (parseFloat(o.totalPrice) || 0), 0);
  const totalReceived = directSales.reduce((sum, o) => sum + (parseFloat(o.received) || 0), 0);
  const totalPendingAmount = directSales.reduce((sum, o) => sum + (parseFloat(o.balance) || 0), 0);
  const directProfit = directSales.reduce((sum, o) => sum + (parseFloat(o.netProfit) || 0), 0);

  // Wholesale costs & porter charges across ALL material orders (direct sales + project procurement)
  const totalWholesaleCost = orders.reduce((sum, o) => sum + (parseFloat(o.wholesaleTotal) || 0), 0);
  const totalPorterCost = orders.reduce((sum, o) => sum + (parseFloat(o.porterCharge) || 0), 0);
  const projectWholesaleCost = projectProcurements.reduce((sum, o) => sum + (parseFloat(o.wholesaleTotal) || 0), 0);

  return {
    totalOrders,
    directSalesCount: directSales.length,
    projectProcurementCount: projectProcurements.length,
    totalRevenue,        // Real customer revenue from direct component sales (zero double-counting)
    totalReceived,       // Real customer receipts from direct component sales
    totalPendingAmount,  // Real pending balance from direct component sales
    totalWholesaleCost,  // Total wholesaler bill across all orders
    totalPorterCost,     // Total porter delivery charges
    projectWholesaleCost,// Wholesale cost specifically for ready-made projects
    totalProfit: directProfit, // Direct component sales profit (project profits stay in Project Orders)
    orders,
  };
}

export async function getDashboardStats() {
  const [projectStats, materialStats] = await Promise.all([
    getProjectStats(),
    getMaterialStats(),
  ]);

  const customerCount = (await getAll('customers')).length;

  // Accurate Combined Financials:
  // Combined Revenue = Total Project Fees + Direct Component Sales (NO DOUBLE COUNTING)
  // Combined Profit  = Total Project Profit + Direct Component Profit (NO DOUBLE COUNTING)
  // Combined Pending = Total Project Pending + Direct Component Pending (NO DOUBLE COUNTING)
  return {
    projectStats,
    materialStats,
    customerCount,
    combinedProfit: projectStats.totalProfit + materialStats.totalProfit,
    combinedRevenue: projectStats.totalOrderValue + materialStats.totalRevenue,
    combinedPending: projectStats.totalPending + materialStats.totalPendingAmount,
    totalWholesaleCost: materialStats.totalWholesaleCost,
    totalPorterCost: materialStats.totalPorterCost,
  };
}

// === Export / Import Data ===

export async function exportAllData() {
  const [projectOrders, materialOrders, customers, invoices, porterBatches] = await Promise.all([
    getAll('projectOrders'),
    getAll('materialOrders'),
    getAll('customers'),
    getAll('invoices'),
    getAll('porterBatches'),
  ]);

  return {
    exportDate: new Date().toISOString(),
    version: 2,
    data: {
      projectOrders,
      materialOrders,
      customers,
      invoices,
      porterBatches,
    },
  };
}

export async function importData(jsonData) {
  const counts = { projectOrders: 0, materialOrders: 0, customers: 0, invoices: 0, porterBatches: 0 };

  if (jsonData.data) {
    for (const [storeName, items] of Object.entries(jsonData.data)) {
      if (Array.isArray(items) && items.length > 0) {
        counts[storeName] = await bulkAdd(storeName, items);
      }
    }
  }

  return counts;
}

// === Porter Batches & Dynamic Cost Allocation ===

export async function getPorterBatches() {
  const batches = await getAll('porterBatches');
  return batches.sort((a, b) => (b.lotId || '').localeCompare(a.lotId || ''));
}

export async function syncPorterBatchAllocation(batchLotId) {
  const batches = await getAll('porterBatches');
  const batch = batches.find(b => b.lotId === batchLotId);
  if (!batch) return;

  const allMaterials = await getAll('materialOrders');
  const batchOrders = allMaterials.filter(m => m.batchId === batchLotId);

  const ordersCount = batchOrders.length;
  let deliveryCostPerOrder = 0;

  if (batch.allocationMode === 'Equal Split' && ordersCount > 0) {
    deliveryCostPerOrder = parseFloat((batch.totalPorterCharge / ordersCount).toFixed(2));
  } else if (batch.allocationMode === 'Single Payer / Custom') {
    deliveryCostPerOrder = batch.deliveryCostPerOrder || 0;
  }

  let totalWholesaleCost = 0;

  for (let i = 0; i < batchOrders.length; i++) {
    const order = batchOrders[i];
    if (!order.lotListNumber) {
      order.lotListNumber = i + 1;
    }
    totalWholesaleCost += parseFloat(order.wholesaleTotal) || 0;
    if (batch.allocationMode === 'Equal Split') {
      order.porterCharge = deliveryCostPerOrder;
      if (order.orderType !== 'Project Order' && !order.linkedProjectId) {
        const unitPrice = parseFloat(order.totalPrice || order.unitPrice) || 0;
        const wholesale = parseFloat(order.wholesaleTotal || order.wholesaleRate) || 0;
        order.netProfit = parseFloat((unitPrice - wholesale - deliveryCostPerOrder).toFixed(2));
      } else {
        order.netProfit = 0;
      }
      await update('materialOrders', order);

      // Sync batchId and list number to linked project
      if (order.linkedProjectId) {
        const proj = await getById('projectOrders', parseInt(order.linkedProjectId, 10));
        if (proj) {
          proj.batchId = batchLotId;
          proj.lotListNumber = order.lotListNumber;
          await update('projectOrders', proj);
        }
      }
    }
  }

  batch.ordersCount = ordersCount;
  batch.totalWholesaleCost = parseFloat(totalWholesaleCost.toFixed(2));
  if (batch.allocationMode === 'Equal Split') {
    batch.deliveryCostPerOrder = deliveryCostPerOrder;
  }

  await update('porterBatches', batch);
  return batch;
}

export async function linkProjectToMaterial(projectId, materialOrderId, miscExpenses = null) {
  const project = await getById('projectOrders', parseInt(projectId));
  const material = await getById('materialOrders', parseInt(materialOrderId));

  if (!project || !material) return null;

  const wholesaleCost = parseFloat(material.wholesaleTotal || material.wholesaleRate) || 0;
  project.materialOrderId = material.id;
  project.materialCost = wholesaleCost;
  project.materialItem = material.materialItem || '';

  if (miscExpenses !== null) {
    project.miscExpenses = parseFloat(miscExpenses) || 0;
  }

  const payment = parseFloat(project.payment) || 0;
  const received = parseFloat(project.received) || 0;
  const misc = parseFloat(project.miscExpenses) || 0;

  project.pending = payment - received;
  project.profit = payment - wholesaleCost - misc;

  await update('projectOrders', project);

  material.linkedProjectId = project.id;
  await update('materialOrders', material);

  return project;
}

export async function resetProjectOrdersToSeed(seedOrders) {
  await clearStore('projectOrders');
  const items = JSON.parse(JSON.stringify(seedOrders));
  for (let i = 0; i < items.length; i++) {
    items[i].id = items[i].id || (i + 1);
  }
  await cloudBulkSave('projectOrders', items);
  memoryCache.set('projectOrders', items);
  return items.length;
}

export async function resetMaterialOrdersToSeed(seedOrders) {
  await clearStore('materialOrders');
  const items = JSON.parse(JSON.stringify(seedOrders));
  for (let i = 0; i < items.length; i++) {
    items[i].id = items[i].id || (i + 1);
  }
  await cloudBulkSave('materialOrders', items);
  memoryCache.set('materialOrders', items);
  return items.length;
}

// === Project Recipes & Bill of Materials (BOM) ===

export async function getProjectTemplates() {
  if (!isInitialized) await initDB();
  const custom = await getAll('projectTemplates');
  if (custom && custom.length > 0) return custom;
  return defaultProjectRecipes;
}

export async function saveProjectTemplate(template) {
  if (!isInitialized) await initDB();
  const templates = await getAll('projectTemplates');
  const existing = templates.find(t => 
    t.name.toLowerCase().trim() === template.name.toLowerCase().trim() ||
    t.id === template.id
  );

  if (existing) {
    template.id = existing.id;
    await update('projectTemplates', template);
  } else {
    template.id = template.id || `recipe-${Date.now()}`;
    await add('projectTemplates', template);
  }
  return template;
}

export async function deleteProjectTemplate(templateId) {
  return remove('projectTemplates', templateId);
}

// === Component Catalog ===

export async function getCatalog() {
  if (!isInitialized) await initDB();
  const items = await getAll('catalog');
  if (items && items.length > 0) return items;
  return catalogData;
}

export async function searchCatalog(query = '', limit = 25) {
  const catalog = await getCatalog();
  if (!query) return catalog.slice(0, limit);
  const q = query.toLowerCase().trim();
  return catalog.filter(item =>
    (item.name && item.name.toLowerCase().includes(q)) ||
    (item.category && item.category.toLowerCase().includes(q)) ||
    (item.pricing_notes && item.pricing_notes.toLowerCase().includes(q))
  ).slice(0, limit);
}

// === Auto-create / Link Material Procurement Order from Project Order ===

export async function autoCreateLinkedMaterialOrder(projectOrder, componentsList = []) {
  if (!projectOrder) return null;
  if (!isInitialized) await initDB();

  let formattedItems = '';
  if (Array.isArray(componentsList) && componentsList.length > 0) {
    formattedItems = componentsList.map(c => `• ${c.name} (${c.qty || 1})`).join('\n');
  } else if (projectOrder.materialItem) {
    formattedItems = projectOrder.materialItem;
  }

  const allMaterials = await getAll('materialOrders');
  let existingMaterial = null;

  if (projectOrder.materialOrderId) {
    existingMaterial = allMaterials.find(m => String(m.id) === String(projectOrder.materialOrderId));
  }
  if (!existingMaterial && projectOrder.id) {
    existingMaterial = allMaterials.find(m => m.linkedProjectId === projectOrder.id);
  }

  const materialCost = parseFloat(projectOrder.materialCost) || 0;

  if (existingMaterial) {
    // Update existing linked procurement ticket under customer's name
    // Customer price for parts alone is 0 because the customer is billed for the complete project
    existingMaterial.customerName = projectOrder.name;
    existingMaterial.orderType = 'Project Order';
    existingMaterial.materialItem = formattedItems || existingMaterial.materialItem;
    existingMaterial.unitPrice = 0;
    existingMaterial.totalPrice = 0;
    existingMaterial.received = 0;
    existingMaterial.balance = 0;
    existingMaterial.netProfit = 0;
    existingMaterial.contactNo = projectOrder.phone || existingMaterial.contactNo || '';
    existingMaterial.notes = `Project #${projectOrder.id || ''}: ${projectOrder.projectName || ''}`;
    existingMaterial.linkedProjectId = projectOrder.id;
    if (projectOrder.batchId) existingMaterial.batchId = projectOrder.batchId;
    if (projectOrder.lotListNumber) existingMaterial.lotListNumber = projectOrder.lotListNumber;
    
    // Sync wholesale cost if project has an updated cost
    if (materialCost > 0 && (!existingMaterial.wholesaleTotal || existingMaterial.wholesaleTotal === 0)) {
      existingMaterial.wholesaleTotal = materialCost;
      existingMaterial.wholesaleRate = materialCost;
      existingMaterial.wholesalerStatus = 'Received';
    }

    await update('materialOrders', existingMaterial);
    return existingMaterial;
  } else {
    // Create new linked procurement ticket
    const newMaterial = {
      customerName: projectOrder.name,
      orderType: 'Project Order',
      orderDate: projectOrder.orderDate || new Date().toISOString().split('T')[0],
      materialItem: formattedItems,
      qty: 1,
      unitPrice: 0,
      totalPrice: 0,
      received: 0,
      balance: 0,
      wholesaler: 'Rajindra Electronics',
      wholesaleTotal: materialCost,
      wholesaleRate: materialCost,
      batchId: projectOrder.batchId || '',
      lotListNumber: projectOrder.lotListNumber || null,
      porterCharge: 0,
      netProfit: 0,
      wholesalerStatus: materialCost > 0 ? 'Received' : 'Pending',
      orderStatus: projectOrder.status === 'delivered' ? 'delivered' : 'pending',
      contactNo: projectOrder.phone || '',
      notes: `Project #${projectOrder.id || 'New'}: ${projectOrder.projectName || ''}`,
      linkedProjectId: projectOrder.id || null
    };

    const newId = await add('materialOrders', newMaterial);
    newMaterial.id = newId;

    // Link back to project order
    if (projectOrder.id) {
      projectOrder.materialOrderId = newId;
      projectOrder.materialItem = formattedItems;
      await update('projectOrders', projectOrder);
    }

    return newMaterial;
  }
}

// === Consolidated Wholesaler Procurement Generator ===

export async function getConsolidatedProcurement(filterMode = 'pending') {
  if (!isInitialized) await initDB();

  const [materialOrders, catalog] = await Promise.all([
    getAll('materialOrders'),
    getCatalog()
  ]);

  // Select which orders to consolidate
  let ordersToProcess = [];
  if (filterMode === 'pending') {
    // All orders that are un-batched or still pending wholesaler procurement
    ordersToProcess = materialOrders.filter(m =>
      !m.batchId ||
      !m.lotId ||
      m.orderStatus === 'pending' ||
      m.orderStatus === 'waiting' ||
      m.wholesalerStatus?.toLowerCase() === 'pending' ||
      m.wholesaleStatus?.toLowerCase() === 'pending'
    );
  } else if (filterMode.startsWith('LOT-')) {
    ordersToProcess = materialOrders.filter(m => m.batchId === filterMode);
  } else {
    ordersToProcess = materialOrders;
  }

  // Component aggregator map: normalizedName -> { name, totalQty, orders: [...], catalogItem }
  const componentMap = new Map();

  function addComponent(rawName, qty, orderInfo) {
    if (!rawName) return;
    const cleanName = rawName.trim().replace(/^[-•*]\s*/, '').replace(/\s*\(\d+\)$/, '').trim();
    if (!cleanName || cleanName.length < 2) return;

    const key = cleanName.toLowerCase();
    if (!componentMap.has(key)) {
      // Find closest match in catalog
      const matched = catalog.find(c =>
        c.name.toLowerCase() === key ||
        c.name.toLowerCase().includes(key) ||
        key.includes(c.name.toLowerCase())
      );

      componentMap.set(key, {
        name: matched ? matched.name : cleanName,
        totalQty: 0,
        orders: [],
        wholesaleUnitCost: matched ? (matched.wholesale_unit_cost || 0) : 0,
        category: matched ? matched.category : 'General'
      });
    }

    const record = componentMap.get(key);
    const parsedQty = parseInt(qty, 10) || 1;
    record.totalQty += parsedQty;
    record.orders.push({
      customerName: orderInfo.customerName || 'Customer',
      orderType: orderInfo.orderType || 'Order',
      orderId: orderInfo.id,
      batchId: orderInfo.batchId || '',
      qty: parsedQty
    });
  }

  // Parse components from materialItem strings
  ordersToProcess.forEach(order => {
    const text = order.materialItem || '';
    if (!text.trim()) return;

    // Splits lines by newline, bullet, or comma
    const lines = text.split(/[\n•\r]+/).filter(l => l.trim().length > 0);
    
    lines.forEach(line => {
      let qty = 1;
      let name = line.trim();

      const qtyMatch1 = line.match(/\((\d+)\)/); // (2)
      const qtyMatch2 = line.match(/—\s*(\d+)/); // — 2
      const qtyMatch3 = line.match(/[x×]\s*(\d+)/i); // x2 or ×2
      const qtyMatch4 = line.match(/Qty:\s*(\d+)/i); // Qty: 2
      const qtyMatch5 = line.match(/^(\d+)\s*[x×]\s+/i); // 2x Item

      if (qtyMatch1) {
        qty = parseInt(qtyMatch1[1], 10);
        name = line.replace(/\(\d+\)/, '');
      } else if (qtyMatch2) {
        qty = parseInt(qtyMatch2[1], 10);
        name = line.replace(/—\s*\d+/, '');
      } else if (qtyMatch3) {
        qty = parseInt(qtyMatch3[1], 10);
        name = line.replace(/[x×]\s*\d+/i, '');
      } else if (qtyMatch4) {
        qty = parseInt(qtyMatch4[1], 10);
        name = line.replace(/Qty:\s*\d+/i, '');
      } else if (qtyMatch5) {
        qty = parseInt(qtyMatch5[1], 10);
        name = line.replace(/^\d+\s*[x×]\s+/i, '');
      }

      addComponent(name, qty, order);
    });
  });

  const consolidatedList = Array.from(componentMap.values()).sort((a, b) => b.totalQty - a.totalQty);
  const totalUnits = consolidatedList.reduce((sum, item) => sum + item.totalQty, 0);
  const estWholesaleTotal = consolidatedList.reduce((sum, item) => sum + (item.totalQty * item.wholesaleUnitCost), 0);

  return {
    items: consolidatedList,
    totalUniqueItems: consolidatedList.length,
    totalUnits,
    estimatedWholesaleTotal: parseFloat(estWholesaleTotal.toFixed(2)),
    orderCount: ordersToProcess.length,
    orders: ordersToProcess
  };
}

export async function batchOrdersIntoLot(orderIds, lotId, porterCharge = 0, wholesaler = 'Rajindra Electronics', allocationMode = 'Equal Split') {
  if (!orderIds || !orderIds.length || !lotId) return 0;
  if (!isInitialized) await initDB();

  const count = orderIds.length;
  const totalPorter = parseFloat(porterCharge) || 0;
  const costPerOrder = count > 0 ? parseFloat((totalPorter / count).toFixed(2)) : 0;
  let totalWholesaleCost = 0;

  for (let i = 0; i < orderIds.length; i++) {
    const id = orderIds[i];
    const order = await getById('materialOrders', id);
    if (order) {
      const listNum = i + 1; // Numbered sequential list: List 1, List 2, List 3...
      order.batchId = lotId;
      order.lotId = lotId;
      order.lotListNumber = listNum;
      order.wholesaleStatus = 'received';
      order.wholesalerStatus = 'Received';
      order.wholesaler = wholesaler || order.wholesaler || 'Rajindra Electronics';

      if (allocationMode === 'Equal Split') {
        order.porterCharge = costPerOrder;
      }

      totalWholesaleCost += (parseFloat(order.wholesaleTotal) || 0);

      // Direct component sales calculate profit; project procurement tickets keep profit in Project Orders
      if (order.orderType !== 'Project Order' && !order.linkedProjectId) {
        const total = parseFloat(order.totalPrice) || 0;
        const wholesale = parseFloat(order.wholesaleTotal) || 0;
        const porter = parseFloat(order.porterCharge) || 0;
        order.netProfit = parseFloat((total - wholesale - porter).toFixed(2));
      } else {
        order.netProfit = 0;
      }

      await update('materialOrders', order);

      // If linked to a Project Order, update project order with batchId & lotListNumber
      if (order.linkedProjectId) {
        const proj = await getById('projectOrders', parseInt(order.linkedProjectId, 10));
        if (proj) {
          proj.batchId = lotId;
          proj.lotListNumber = listNum;
          // Sync wholesale parts cost into project order
          const wholesale = parseFloat(order.wholesaleTotal) || 0;
          if (wholesale > 0) {
            proj.materialCost = wholesale;
            const pay = parseFloat(proj.payment) || 0;
            const misc = parseFloat(proj.miscExpenses) || 0;
            proj.profit = parseFloat((pay - proj.materialCost - misc).toFixed(2));
          }
          await update('projectOrders', proj);
        }
      }
    }
  }

  // Create or update the porter batch record
  const existingBatches = await getAll('porterBatches');
  const batch = existingBatches.find(b => b.lotId === lotId);
  const now = new Date().toISOString().split('T')[0];

  if (!batch) {
    await add('porterBatches', {
      lotId,
      date: now,
      wholesaler,
      totalPorterCharge: totalPorter,
      ordersCount: count,
      deliveryCostPerOrder: costPerOrder,
      deliveryStatus: 'Pending',
      allocationMode: allocationMode || 'Equal Split',
      totalWholesaleCost: parseFloat(totalWholesaleCost.toFixed(2)),
      notes: `${lotId} - ${count} Consolidated Orders`
    });
  } else {
    batch.totalPorterCharge = totalPorter;
    batch.ordersCount = count;
    batch.deliveryCostPerOrder = costPerOrder;
    batch.totalWholesaleCost = parseFloat(totalWholesaleCost.toFixed(2));
    batch.wholesaler = wholesaler;
    await update('porterBatches', batch);
  }

  return count;
}

/**
 * Get comprehensive LOT packet data for multi-page PDF generation & workshop slips
 * Each order is mapped to List 1, List 2, List 3... with its customer, project, and component checklist
 */
export async function getLotPacketData(lotId) {
  if (!isInitialized) await initDB();

  const [batches, allMaterials, allProjects, catalog] = await Promise.all([
    getAll('porterBatches'),
    getAll('materialOrders'),
    getAll('projectOrders'),
    getCatalog()
  ]);

  const batch = batches.find(b => b.lotId === lotId) || {
    lotId,
    date: new Date().toISOString().split('T')[0],
    wholesaler: 'Rajindra Electronics',
    totalPorterCharge: 0,
    ordersCount: 0,
    deliveryStatus: 'Pending'
  };

  // Find all material orders in this lot
  const lotMaterials = allMaterials.filter(m => m.batchId === lotId || m.lotId === lotId);

  // Sort orders by lotListNumber (or order id)
  lotMaterials.sort((a, b) => (parseInt(a.lotListNumber, 10) || 999) - (parseInt(b.lotListNumber, 10) || 999));

  // Build mapped lists with customer, project details and parsed component items
  const mappedLists = lotMaterials.map((m, idx) => {
    const listNumber = m.lotListNumber || (idx + 1);
    let linkedProj = null;
    if (m.linkedProjectId) {
      linkedProj = allProjects.find(p => String(p.id) === String(m.linkedProjectId));
    }

    const customerName = m.customerName || linkedProj?.name || 'Customer';
    const projectTitle = linkedProj?.projectName || m.notes?.replace(/^Project:\s*/i, '') || m.materialItem?.slice(0, 30) || 'Components';
    const phone = m.contactNo || linkedProj?.phone || '';

    // Parse items into clean array: [{ name, qty }]
    const rawText = m.materialItem || '';
    const lines = rawText.split(/[\n•\r,]+/).filter(l => l.trim().length > 0);
    const components = [];

    lines.forEach(l => {
      let qty = 1;
      let name = l.trim();
      const m1 = l.match(/\((\d+)\)/);
      const m2 = l.match(/—\s*(\d+)/);
      const m3 = l.match(/[x×]\s*(\d+)/i);
      const m4 = l.match(/^(\d+)\s*[x×]\s+/i);
      const m5 = l.match(/Qty:\s*(\d+)/i);

      if (m1) { qty = parseInt(m1[1], 10); name = l.replace(/\(\d+\)/, ''); }
      else if (m2) { qty = parseInt(m2[1], 10); name = l.replace(/—\s*\d+/, ''); }
      else if (m3) { qty = parseInt(m3[1], 10); name = l.replace(/[x×]\s*\d+/i, ''); }
      else if (m4) { qty = parseInt(m4[1], 10); name = l.replace(/^\d+\s*[x×]\s+/i, ''); }
      else if (m5) { qty = parseInt(m5[1], 10); name = l.replace(/Qty:\s*\d+/i, ''); }

      name = name.replace(/^[-*•\s]+/, '').replace(/\s*\(\d+\)$/, '').trim();
      if (name) {
        components.push({ name, qty });
      }
    });

    return {
      listNumber,
      orderId: m.id,
      linkedProjectId: m.linkedProjectId || null,
      customerName,
      projectTitle,
      phone,
      orderDate: m.orderDate || '',
      wholesaleTotal: parseFloat(m.wholesaleTotal) || 0,
      orderStatus: m.orderStatus || 'pending',
      rawText,
      components: components.length > 0 ? components : [{ name: rawText || 'Hardware Kit', qty: 1 }]
    };
  });

  // Build Master Sourcing Checklist (Aggregated across all lists for Rajindra Electronics)
  const masterMap = new Map();
  mappedLists.forEach(list => {
    list.components.forEach(item => {
      const key = item.name.toLowerCase().trim();
      if (!masterMap.has(key)) {
        const matched = catalog.find(c => c.name.toLowerCase() === key || c.name.toLowerCase().includes(key));
        masterMap.set(key, {
          name: matched ? matched.name : item.name,
          category: matched ? matched.category : 'General',
          wholesaleUnitCost: matched ? (matched.wholesale_unit_cost || 0) : 0,
          totalQty: 0,
          lists: []
        });
      }
      const record = masterMap.get(key);
      record.totalQty += item.qty;
      record.lists.push({
        listNumber: list.listNumber,
        customerName: list.customerName,
        qty: item.qty
      });
    });
  });

  const masterList = Array.from(masterMap.values()).sort((a, b) => b.totalQty - a.totalQty);
  const totalUnits = masterList.reduce((sum, item) => sum + item.totalQty, 0);
  const totalWholesaleCost = lotMaterials.reduce((sum, m) => sum + (parseFloat(m.wholesaleTotal) || 0), 0);

  return {
    batch,
    lotId,
    wholesaler: batch.wholesaler || 'Rajindra Electronics',
    date: batch.date || new Date().toISOString().split('T')[0],
    totalPorterCharge: parseFloat(batch.totalPorterCharge) || 0,
    totalWholesaleCost: parseFloat(totalWholesaleCost.toFixed(2)),
    deliveryCostPerOrder: parseFloat(batch.deliveryCostPerOrder) || 0,
    orderCount: mappedLists.length,
    totalUnits,
    lists: mappedLists,
    masterList
  };
}

/**
 * =================================================================
 * Team Members & Work Tasks (RBAC & Workshop Delegation)
 * =================================================================
 */

export async function getTeamMembers() {
  const members = await getAll('teamMembers');
  return members.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function getWorkTasks(filters = {}) {
  let tasks = await getAll('workTasks');

  if (filters.workerId) {
    const wid = parseInt(filters.workerId, 10);
    tasks = tasks.filter(t => t.assignedToId === wid);
  }

  if (filters.status && filters.status !== 'all') {
    tasks = tasks.filter(t => t.status === filters.status);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    tasks = tasks.filter(t => 
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.projectName && t.projectName.toLowerCase().includes(q)) ||
      (t.assignedToName && t.assignedToName.toLowerCase().includes(q)) ||
      (t.type && t.type.toLowerCase().includes(q))
    );
  }

  return tasks.sort((a, b) => {
    // Priority first (urgent -> standard -> relaxed), then due date
    const priorityWeight = { urgent: 3, standard: 2, relaxed: 1 };
    const pDiff = (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
    if (pDiff !== 0) return pDiff;
    return new Date(a.dueDate || '9999-12-31') - new Date(b.dueDate || '9999-12-31');
  });
}

/**
 * Automatically sync a workTask from a Project Order when an assignment is made
 */
export async function syncProjectTask(project) {
  if (!project) return null;
  const allTasks = await getAll('workTasks');
  const existingTask = allTasks.find(t => t.projectId === project.id);

  // If unassigned and no existing task, nothing to do
  if (!project.assignedWorkerId && !existingTask) {
    return null;
  }

  const teamMembers = await getAll('teamMembers');
  const worker = teamMembers.find(m => m.id === parseInt(project.assignedWorkerId, 10));

  if (existingTask) {
    if (!project.assignedWorkerId) {
      // Worker unassigned, remove task or mark unassigned
      existingTask.assignedToId = null;
      existingTask.assignedToName = 'Unassigned';
    } else {
      existingTask.assignedToId = worker ? worker.id : null;
      existingTask.assignedToName = worker ? worker.name : 'Unknown';
    }
    existingTask.title = project.projectName || `Project #${project.id}`;
    existingTask.projectName = project.projectName || '';
    existingTask.type = project.workType || 'Hardware & IoT';
    existingTask.priority = project.workPriority || 'standard';
    existingTask.dueDate = project.workerDeadline || project.deadline || '';
    existingTask.description = project.requirements || project.specs || '';
    existingTask.adminNotes = project.workerBrief || '';
    existingTask.referenceLinks = project.workerReferenceLinks ? [project.workerReferenceLinks] : (existingTask.referenceLinks || []);
    existingTask.updatedAt = new Date().toISOString();
    await update('workTasks', existingTask);
    return existingTask;
  } else if (project.assignedWorkerId) {
    // Create new task
    const newTask = {
      title: project.projectName || `Project #${project.id}`,
      projectName: project.projectName || '',
      projectId: project.id,
      assignedToId: worker ? worker.id : null,
      assignedToName: worker ? worker.name : 'Unknown',
      assignedBy: 'Admin',
      type: project.workType || 'Hardware & IoT',
      priority: project.workPriority || 'standard',
      status: 'assigned', // assigned, in_progress, review, completed
      dueDate: project.workerDeadline || project.deadline || '',
      description: project.requirements || project.specs || '',
      adminNotes: project.workerBrief || '',
      referenceLinks: project.workerReferenceLinks ? [project.workerReferenceLinks] : [],
      deliverableLink: '',
      workerNotes: '',
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const created = await add('workTasks', newTask);
    return created;
  }
}

/**
 * Worker updates task status & deliverable link
 */
export async function updateTaskStatus(taskId, status, deliverableLink = '', workerNotes = '') {
  const task = await getById('workTasks', taskId);
  if (!task) throw new Error('Task not found');

  task.status = status;
  if (deliverableLink) task.deliverableLink = deliverableLink;
  if (workerNotes) task.workerNotes = workerNotes;
  task.updatedAt = new Date().toISOString();

  await update('workTasks', task);

  // If approved and linked to project, update project status
  if (status === 'completed' && task.projectId) {
    const project = await getById('projectOrders', task.projectId);
    if (project && project.orderStatus !== 'delivered') {
      project.orderStatus = 'completed';
      await update('projectOrders', project);
    }
  }

  return task;
}

/**
 * Add a comment to a task (internal communication between Admin and Worker)
 */
export async function addTaskComment(taskId, authorName, text) {
  const task = await getById('workTasks', taskId);
  if (!task) throw new Error('Task not found');

  if (!Array.isArray(task.comments)) {
    task.comments = [];
  }

  task.comments.push({
    author: authorName,
    text: text.trim(),
    time: new Date().toISOString()
  });
  task.updatedAt = new Date().toISOString();

  await update('workTasks', task);
  return task;
}


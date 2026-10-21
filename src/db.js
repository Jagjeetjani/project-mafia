/**
 * Database Module — IndexedDB wrapper using idb
 * Stores all project and material order data locally
 */
import { openDB } from 'idb';

const DB_NAME = 'ProjectMafiaDB';
const DB_VERSION = 2;

let dbInstance = null;

export async function initDB() {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Project Orders Store
      if (!db.objectStoreNames.contains('projectOrders')) {
        const projectStore = db.createObjectStore('projectOrders', {
          keyPath: 'id',
          autoIncrement: true,
        });
        projectStore.createIndex('name', 'name');
        projectStore.createIndex('status', 'status');
        projectStore.createIndex('orderDate', 'orderDate');
      }

      // Material Orders Store
      if (!db.objectStoreNames.contains('materialOrders')) {
        const materialStore = db.createObjectStore('materialOrders', {
          keyPath: 'id',
          autoIncrement: true,
        });
        materialStore.createIndex('customerName', 'customerName');
        materialStore.createIndex('orderType', 'orderType');
        materialStore.createIndex('orderDate', 'orderDate');
        materialStore.createIndex('orderStatus', 'orderStatus');
        materialStore.createIndex('batchId', 'batchId');
      }

      // Customers Store
      if (!db.objectStoreNames.contains('customers')) {
        const customerStore = db.createObjectStore('customers', {
          keyPath: 'id',
          autoIncrement: true,
        });
        customerStore.createIndex('name', 'name');
        customerStore.createIndex('phone', 'phone');
      }

      // Invoices Store
      if (!db.objectStoreNames.contains('invoices')) {
        const invoiceStore = db.createObjectStore('invoices', {
          keyPath: 'id',
          autoIncrement: true,
        });
        invoiceStore.createIndex('customerName', 'customerName');
        invoiceStore.createIndex('date', 'date');
        invoiceStore.createIndex('invoiceNumber', 'invoiceNumber');
      }

      // Porter Batches Store
      if (!db.objectStoreNames.contains('porterBatches')) {
        const batchStore = db.createObjectStore('porterBatches', {
          keyPath: 'id',
          autoIncrement: true,
        });
        batchStore.createIndex('lotId', 'lotId', { unique: true });
        batchStore.createIndex('date', 'date');
      }
    },
  });

  return dbInstance;
}

// === Generic CRUD Operations ===

export async function getAll(storeName) {
  const db = await initDB();
  return db.getAll(storeName);
}

export async function getById(storeName, id) {
  const db = await initDB();
  return db.get(storeName, id);
}

export async function add(storeName, data) {
  const db = await initDB();
  data.createdAt = new Date().toISOString();
  data.updatedAt = new Date().toISOString();
  return db.add(storeName, data);
}

export async function update(storeName, data) {
  const db = await initDB();
  data.updatedAt = new Date().toISOString();
  return db.put(storeName, data);
}

export async function remove(storeName, id) {
  const db = await initDB();
  return db.delete(storeName, id);
}

export async function clearStore(storeName) {
  const db = await initDB();
  return db.clear(storeName);
}

export async function count(storeName) {
  const db = await initDB();
  return db.count(storeName);
}

// === Bulk Operations ===

export async function bulkAdd(storeName, items) {
  const db = await initDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const now = new Date().toISOString();

  for (const item of items) {
    item.createdAt = now;
    item.updatedAt = now;
    await store.add(item);
  }

  await tx.done;
  return items.length;
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
  const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.totalPrice) || 0), 0);
  const totalReceived = orders.reduce((sum, o) => sum + (parseFloat(o.received) || 0), 0);
  const totalPendingAmount = orders.reduce((sum, o) => sum + (parseFloat(o.balance) || 0), 0);
  const totalWholesaleCost = orders.reduce((sum, o) => sum + (parseFloat(o.wholesaleTotal) || 0), 0);
  const totalPorterCost = orders.reduce((sum, o) => sum + (parseFloat(o.porterCharge) || 0), 0);
  const totalProfit = orders.reduce((sum, o) => sum + (parseFloat(o.netProfit) || 0), 0);

  return {
    totalOrders,
    totalRevenue,
    totalReceived,
    totalPendingAmount,
    totalWholesaleCost,
    totalPorterCost,
    totalProfit,
    orders,
  };
}

export async function getDashboardStats() {
  const [projectStats, materialStats] = await Promise.all([
    getProjectStats(),
    getMaterialStats(),
  ]);

  const customerCount = (await getAll('customers')).length;

  return {
    projectStats,
    materialStats,
    customerCount,
    combinedProfit: projectStats.totalProfit + materialStats.totalProfit,
    combinedRevenue: projectStats.totalOrderValue + materialStats.totalRevenue,
    combinedPending: projectStats.totalPending + materialStats.totalPendingAmount,
  };
}

// === Export Data ===

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
    version: DB_VERSION,
    data: {
      projectOrders,
      materialOrders,
      customers,
      invoices,
      porterBatches,
    },
  };
}

// === Import Data ===

export async function importData(jsonData) {
  const counts = { projectOrders: 0, materialOrders: 0, customers: 0, invoices: 0, porterBatches: 0 };

  if (jsonData.data) {
    for (const [storeName, items] of Object.entries(jsonData.data)) {
      if (Array.isArray(items) && items.length > 0) {
        // Remove IDs to let auto-increment work
        const cleanItems = items.map(item => {
          const { id, ...rest } = item;
          return rest;
        });
        counts[storeName] = await bulkAdd(storeName, cleanItems);
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

/**
 * Recalculate and synchronize a Porter Batch across all associated material orders
 */
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

  for (const order of batchOrders) {
    totalWholesaleCost += parseFloat(order.wholesaleTotal) || 0;
    if (batch.allocationMode === 'Equal Split') {
      order.porterCharge = deliveryCostPerOrder;
      // Recalculate net profit: Total received/price - wholesale - porter
      const unitPrice = parseFloat(order.totalPrice || order.unitPrice) || 0;
      const wholesale = parseFloat(order.wholesaleTotal || order.wholesaleRate) || 0;
      order.netProfit = parseFloat((unitPrice - wholesale - deliveryCostPerOrder).toFixed(2));
      await update('materialOrders', order);
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

/**
 * Link a project order to a material order to auto-inherit wholesale cost
 */
export async function linkProjectToMaterial(projectId, materialOrderId, miscExpenses = null) {
  const project = await getById('projectOrders', parseInt(projectId));
  const material = await getById('materialOrders', parseInt(materialOrderId));

  if (!project || !material) return null;

  // Wholesale cost taken directly from material order
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

  // Mark material order with linked project order
  material.linkedProjectId = project.id;
  await update('materialOrders', material);

  return project;
}

/**
 * Reset and reload project orders to exact verified seed data
 */
export async function resetProjectOrdersToSeed(seedOrders) {
  await clearStore('projectOrders');
  const items = JSON.parse(JSON.stringify(seedOrders));
  await bulkAdd('projectOrders', items);
  return items.length;
}

/**
 * Reset and reload material orders to exact verified seed data
 */
export async function resetMaterialOrdersToSeed(seedOrders) {
  await clearStore('materialOrders');
  const items = JSON.parse(JSON.stringify(seedOrders));
  await bulkAdd('materialOrders', items);
  return items.length;
}


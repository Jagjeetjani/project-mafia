/**
 * Database Module — 100% Cloud-Native with Firebase Realtime Database
 * All data is stored directly in Firebase Cloud.
 * Real-time synchronization guarantees updates on laptop, mobile, or any device instantly reflect across all devices.
 */
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

/**
 * Initialize Cloud Database and establish real-time listeners across all devices
 */
export async function initDB() {
  if (isInitialized) return true;

  initFirebase();

  // Load all stores from Cloud and subscribe to real-time events
  await Promise.all(
    CLOUD_STORES.map(async (storeName) => {
      try {
        const items = await cloudGetAll(storeName);
        memoryCache.set(storeName, items);

        // Real-time listener: any device changes data -> all devices update immediately
        subscribeToStore(storeName, (updatedItems) => {
          memoryCache.set(storeName, updatedItems);
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
        memoryCache.set(storeName, []);
      }
    })
  );

  // Seed default catalog & project recipes if store is empty
  const existingCatalog = memoryCache.get('catalog') || [];
  if (existingCatalog.length === 0 && catalogData && catalogData.length > 0) {
    cloudBulkSave('catalog', catalogData).catch(e => console.warn('Catalog cloud save:', e));
    memoryCache.set('catalog', catalogData);
  }

  const existingTemplates = memoryCache.get('projectTemplates') || [];
  if (existingTemplates.length === 0 && defaultProjectRecipes && defaultProjectRecipes.length > 0) {
    cloudBulkSave('projectTemplates', defaultProjectRecipes).catch(e => console.warn('Templates cloud save:', e));
    memoryCache.set('projectTemplates', defaultProjectRecipes);
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
  // Assign next sequential numeric ID
  let maxId = 0;
  for (const item of items) {
    const n = parseInt(item.id, 10);
    if (!isNaN(n) && n > maxId) maxId = n;
  }
  const newId = maxId + 1;

  data.id = newId;
  data.createdAt = data.createdAt || new Date().toISOString();
  data.updatedAt = new Date().toISOString();

  // Save directly to Firebase Cloud
  await cloudSave(storeName, data);

  // Update in-memory cache
  items.push(data);
  memoryCache.set(storeName, items);

  return newId;
}

export async function update(storeName, data) {
  if (!isInitialized) await initDB();

  data.updatedAt = new Date().toISOString();

  // Save directly to Firebase Cloud
  await cloudSave(storeName, data);

  // Update in-memory cache
  const items = memoryCache.get(storeName) || [];
  const idx = items.findIndex(i => String(i.id) === String(data.id));
  if (idx !== -1) {
    items[idx] = data;
  } else {
    items.push(data);
  }
  memoryCache.set(storeName, items);

  return data.id;
}

export async function remove(storeName, id) {
  if (!isInitialized) await initDB();

  // Delete directly from Firebase Cloud
  await cloudDelete(storeName, id);

  // Update in-memory cache
  const items = memoryCache.get(storeName) || [];
  const filtered = items.filter(i => String(i.id) !== String(id));
  memoryCache.set(storeName, filtered);

  return true;
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

  for (const order of batchOrders) {
    totalWholesaleCost += parseFloat(order.wholesaleTotal) || 0;
    if (batch.allocationMode === 'Equal Split') {
      order.porterCharge = deliveryCostPerOrder;
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

  const payment = parseFloat(projectOrder.payment) || 0;
  const received = parseFloat(projectOrder.received) || 0;

  if (existingMaterial) {
    // Update existing linked material order under customer's name
    existingMaterial.customerName = projectOrder.name;
    existingMaterial.materialItem = formattedItems || existingMaterial.materialItem;
    existingMaterial.totalPrice = payment;
    existingMaterial.received = received;
    existingMaterial.balance = payment - received;
    existingMaterial.contactNo = projectOrder.phone || existingMaterial.contactNo || '';
    existingMaterial.notes = `Project: ${projectOrder.projectName}`;
    existingMaterial.linkedProjectId = projectOrder.id;
    // Keep wholesale rate blank / unchanged until wholesaler bill arrives
    await update('materialOrders', existingMaterial);
    return existingMaterial;
  } else {
    // Create new linked material order under customer's name
    const newMaterial = {
      customerName: projectOrder.name,
      orderType: 'Project Order',
      orderDate: projectOrder.orderDate || new Date().toISOString().split('T')[0],
      materialItem: formattedItems,
      qty: 1,
      unitPrice: payment,
      totalPrice: payment,
      received: received,
      balance: payment - received,
      wholesaler: 'Rajindra Electronics',
      wholesaleTotal: 0, // Left blank / pending as requested
      wholesaleRate: 0,
      batchId: '',
      porterCharge: 0,
      netProfit: 0,
      wholesalerStatus: 'Pending',
      orderStatus: 'pending',
      contactNo: projectOrder.phone || '',
      notes: `Project: ${projectOrder.projectName}`,
      linkedProjectId: projectOrder.id
    };

    const newId = await add('materialOrders', newMaterial);
    newMaterial.id = newId;

    // Link back to project order
    projectOrder.materialOrderId = newId;
    projectOrder.materialItem = formattedItems;
    await update('projectOrders', projectOrder);

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

export async function batchOrdersIntoLot(orderIds, lotId, porterCharge = 0, wholesaler = 'Rajindra Electronics') {
  if (!orderIds || !orderIds.length || !lotId) return 0;
  if (!isInitialized) await initDB();

  for (const id of orderIds) {
    const order = await getById('materialOrders', id);
    if (order) {
      order.batchId = lotId;
      order.lotId = lotId;
      order.wholesaleStatus = 'received';
      order.wholesalerStatus = 'Received';
      await update('materialOrders', order);
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
      totalPorterCharge: parseFloat(porterCharge) || 0,
      ordersCount: orderIds.length,
      deliveryCostPerOrder: orderIds.length > 0 ? parseFloat((porterCharge / orderIds.length).toFixed(2)) : 0,
      deliveryStatus: 'Pending',
      allocationMode: 'Equal Split',
      totalWholesaleCost: 0,
      notes: `${lotId} - ${orderIds.length} Consolidated Orders`
    });
  }

  return orderIds.length;
}

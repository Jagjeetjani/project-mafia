/**
 * Firebase Realtime Database Engine — Pure Cloud Backend
 * All business data is stored exclusively in Firebase Cloud.
 * Updates made on any device (phone, laptop) instantly reflect on all other devices in real-time.
 */
import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  get,
  remove,
  onValue,
  update as rtdbUpdate
} from 'firebase/database';

export const firebaseConfig = {
  apiKey: "AIzaSyD42FdIg6xJbGRsWisehrzPfTlsMVfM2E0",
  authDomain: "project-mafia-d940c.firebaseapp.com",
  databaseURL: "https://project-mafia-d940c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "project-mafia-d940c",
  storageBucket: "project-mafia-d940c.firebasestorage.app",
  messagingSenderId: "820279441636",
  appId: "1:820279441636:web:09355e092efa17d97c54f1",
  measurementId: "G-42B644YT7Q"
};

let app = null;
let rtdb = null;
let isConnected = false;
const activeListeners = new Map();

export const CLOUD_STORES = [
  'projectOrders',
  'materialOrders',
  'porterBatches',
  'customers',
  'invoices',
  'projectTemplates',
  'catalog'
];

/**
 * Initialize Firebase connection and status tracking
 */
export function initFirebase() {
  if (rtdb) return { app, rtdb };

  try {
    app = initializeApp(firebaseConfig);
    rtdb = getDatabase(app);

    // Track online/offline status
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snap) => {
      isConnected = snap.val() === true;
      dispatchSyncStatus();
    });

    console.log('Firebase Cloud Engine active for project:', firebaseConfig.projectId);
    return { app, rtdb };
  } catch (err) {
    console.error('Failed to initialize Firebase:', err);
    isConnected = false;
    dispatchSyncStatus();
    return { app: null, rtdb: null };
  }
}

export function isCloudConnected() {
  return isConnected;
}

function dispatchSyncStatus() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('cloud-sync-status', {
        detail: {
          connected: isConnected,
          text: isConnected ? 'Cloud Active' : 'Offline'
        }
      })
    );
  }
}

/**
 * Save or update a single record directly in Firebase Cloud
 */
export async function cloudSave(storeName, item) {
  if (!rtdb) initFirebase();
  if (!item || item.id === undefined || item.id === null) return;

  const itemRef = ref(rtdb, `${storeName}/${item.id}`);
  const cleanData = JSON.parse(JSON.stringify(item));
  cleanData.updatedAt = cleanData.updatedAt || new Date().toISOString();

  await set(itemRef, cleanData);
  return cleanData;
}

/**
 * Delete a single record from Firebase Cloud
 */
export async function cloudDelete(storeName, id) {
  if (!rtdb) initFirebase();
  if (id === undefined || id === null) return;

  const itemRef = ref(rtdb, `${storeName}/${id}`);
  await remove(itemRef);
}

/**
 * Clear an entire store in Firebase Cloud
 */
export async function cloudClear(storeName) {
  if (!rtdb) initFirebase();
  const storeRef = ref(rtdb, storeName);
  await remove(storeRef);
}

/**
 * Bulk save items into a Firebase Cloud store
 */
export async function cloudBulkSave(storeName, items) {
  if (!rtdb) initFirebase();
  if (!items || !items.length) return;

  const updates = {};
  for (const item of items) {
    if (item && item.id !== undefined && item.id !== null) {
      const cleanData = JSON.parse(JSON.stringify(item));
      updates[`${storeName}/${item.id}`] = cleanData;
    }
  }

  if (Object.keys(updates).length > 0) {
    await rtdbUpdate(ref(rtdb), updates);
  }
}

/**
 * Get all records from a Firebase Cloud store
 */
export async function cloudGetAll(storeName) {
  if (!rtdb) initFirebase();

  const storeRef = ref(rtdb, storeName);
  const snap = await get(storeRef);
  const val = snap.val();

  if (!val) return [];

  if (Array.isArray(val)) {
    return val
      .filter(item => item !== null && item !== undefined)
      .map((item, idx) => ({
        ...item,
        id: item.id !== undefined ? item.id : idx
      }));
  }

  return Object.entries(val).map(([key, item]) => {
    if (typeof item === 'object' && item !== null) {
      const numKey = parseInt(key, 10);
      return {
        ...item,
        id: item.id !== undefined ? item.id : (isNaN(numKey) ? key : numKey)
      };
    }
    return { id: key, value: item };
  });
}

/**
 * Get single record by ID from Firebase Cloud
 */
export async function cloudGetById(storeName, id) {
  if (!rtdb) initFirebase();
  const snap = await get(ref(rtdb, `${storeName}/${id}`));
  if (!snap.exists()) return null;
  const val = snap.val();
  const numKey = parseInt(id, 10);
  return {
    ...val,
    id: val.id !== undefined ? val.id : (isNaN(numKey) ? id : numKey)
  };
}

/**
 * Fetch record counts from Firebase Cloud
 */
export async function getCloudCounts() {
  if (!rtdb) initFirebase();

  const counts = {};
  await Promise.all(
    CLOUD_STORES.map(async (store) => {
      try {
        const items = await cloudGetAll(store);
        counts[store] = items.length;
      } catch (err) {
        counts[store] = 0;
      }
    })
  );
  return counts;
}

/**
 * Listen for real-time changes to a store in Firebase Cloud
 */
export function subscribeToStore(storeName, callback) {
  if (!rtdb) initFirebase();

  if (activeListeners.has(storeName)) {
    activeListeners.get(storeName)();
    activeListeners.delete(storeName);
  }

  const storeRef = ref(rtdb, storeName);
  const unsubscribe = onValue(storeRef, (snap) => {
    const val = snap.val();
    let items = [];
    if (val) {
      if (Array.isArray(val)) {
        items = val.filter(Boolean).map((item, idx) => ({
          ...item,
          id: item.id !== undefined ? item.id : idx
        }));
      } else {
        items = Object.entries(val).map(([key, item]) => {
          const numKey = parseInt(key, 10);
          return {
            ...item,
            id: item.id !== undefined ? item.id : (isNaN(numKey) ? key : numKey)
          };
        });
      }
    }
    callback(items);
  });

  activeListeners.set(storeName, unsubscribe);
  return unsubscribe;
}

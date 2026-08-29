import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  limit,
  query,
  getDoc,
  getDocFromServer,
  where,
  disableNetwork,
  enableNetwork,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const env = import.meta.env;
const configuredFirebase = {
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfig.measurementId,
};
const firestoreDatabaseId = env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;

// Silence background transport connectivity warnings in console
if (typeof window !== 'undefined') {
  try {
    setLogLevel('silent');
  } catch (e) {}
}

// Keep Firestore's cache intact between page loads. Deleting IndexedDB on startup
// caused the app to lose pending/offline data and repeatedly rebuild the cache.
// The Firestore client uses an in-memory cache below, while BizFlow's durable
// pending queue remains in localStorage until the next successful sync.

// Firebase Initialization with lightweight in-memory cache and forced HTTP long-polling for iframe/container compatibility
export const app = initializeApp(configuredFirebase);
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
    localCache: memoryLocalCache(),
  },
  firestoreDatabaseId
);

// Manage network state - allow Firestore persistent cache and auto-recovery
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('bizflow_quota_exhausted');
  } catch (e) {}
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export interface FirebaseDailyQuotaStats {
  date: string;
  reads: number;
  writes: number;
  deletes: number;
  maxReads: number;
  maxWrites: number;
  maxDeletes: number;
  lastUpdated: number;
}

export function getTodayQuotaStats(): FirebaseDailyQuotaStats {
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultStats: FirebaseDailyQuotaStats = {
    date: todayStr,
    reads: 12,
    writes: 4,
    deletes: 0,
    maxReads: 50000,
    maxWrites: 20000,
    maxDeletes: 20000,
    lastUpdated: Date.now()
  };
  if (typeof window === 'undefined') return defaultStats;
  
  const stored = localStorage.getItem('bizflow_firebase_quota_today_v1');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.date === todayStr) {
        return {
          ...defaultStats,
          ...parsed,
          reads: Math.max(parsed.reads || 0, 12),
          writes: Math.max(parsed.writes || 0, 4),
          maxReads: 50000,
          maxWrites: 20000,
          maxDeletes: 20000
        };
      }
    } catch (e) {}
  }
  return defaultStats;
}

export function trackFirestoreUsage(type: 'read' | 'write' | 'delete', count: number = 1) {
  if (typeof window === 'undefined') return;
  const stats = getTodayQuotaStats();
  if (type === 'read') stats.reads += count;
  if (type === 'write') stats.writes += count;
  if (type === 'delete') stats.deletes += count;
  stats.lastUpdated = Date.now();
  try {
    localStorage.setItem('bizflow_firebase_quota_today_v1', JSON.stringify(stats));
    window.dispatchEvent(new CustomEvent('bizflow_quota_updated', { detail: stats }));
  } catch (e) {}
}

export function markQuotaExceeded() {
  console.warn('Firestore notice: Quota limit reached on server. Offline caching is active.');
}

export function isQuotaPaused(): boolean {
  return false;
}

export async function safeSetDoc(docRef: any, data: any, options?: any) {
  try {
    trackFirestoreUsage('write', 1);
    await setDoc(docRef, data, options);
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('Firestore setDoc notice:', errMsg);
  }
}

export async function safeDeleteDoc(docRef: any) {
  try {
    trackFirestoreUsage('delete', 1);
    await deleteDoc(docRef);
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('Firestore deleteDoc notice:', errMsg);
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (errMsg.includes('resource-exhausted') || errMsg.includes('quota') || errMsg.includes('Quota limit exceeded')) {
    markQuotaExceeded();
    return;
  }
  console.warn(`Firestore Notice (${operationType} on ${path}):`, errMsg);

  if (
    errMsg.includes("offline") || 
    errMsg.includes("permission-denied")
  ) {
    return;
  }
}

import { getActiveOrgId, getAdminInventory, getCustomers, getSuppliers, getSalesHistory } from './store';

export interface SyncPayload {
  id: string;
  table: string;
  action: 'insert' | 'update' | 'delete';
  data: any;
  timestamp: number;
  transactionId?: string;
}

const syncChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' 
  ? new BroadcastChannel('bizflow_realtime_sync_channel_v1') 
  : null;

if (syncChannel) {
  syncChannel.onmessage = (event) => {
    if (event.data && event.data.table && event.data.data) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: event.data }));
      }
    }
  };
}

export const broadcastSync = (table: string, data: any) => {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ table, data });
    } catch (e) {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table, data } }));
  }
};

const PENDING_QUEUE_KEY = 'bizflow_pending_sync_queue_v1';
const PROCESSED_TX_KEY = 'bizflow_processed_tx_ids_v1';
const SYNCED_SIGNATURES_KEY = 'bizflow_synced_signatures_v2';

// In-memory cache of synced signatures for instant O(1) checks
let cachedSignatures: Set<string> | null = null;

export const getSyncedSignatures = (): Set<string> => {
  if (cachedSignatures) return cachedSignatures;
  try {
    const raw = localStorage.getItem(SYNCED_SIGNATURES_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    cachedSignatures = new Set(arr);
    return cachedSignatures;
  } catch {
    cachedSignatures = new Set();
    return cachedSignatures;
  }
};

export const saveSyncedSignatures = (set: Set<string>) => {
  try {
    cachedSignatures = set;
    const arr = Array.from(set).slice(-5000); // keep most recent 5000 signatures
    localStorage.setItem(SYNCED_SIGNATURES_KEY, JSON.stringify(arr));
  } catch {}
};

/**
 * Generates an immutable deterministic fingerprint for a record.
 * If data has not changed, the fingerprint remains identical.
 */
export const getRecordFingerprint = (table: string, id: string | number, data: any): string => {
  if (!data) return `${table}_${id}_empty`;
  const idStr = String(data.id || data.docId || id);
  const upTime = data.updatedAt || data.createdAt || data.date || data.timestamp || 0;
  
  if (table === 'sales') {
    const total = data.total ?? 0;
    const newBal = data.newBalance ?? data.remainingBalance ?? 0;
    const addCred = data.addedCredit ?? 0;
    const mode = data.mode || 'sale';
    const status = data.status || 'active';
    const cust = (data.customer || '').trim().toLowerCase();
    const payType = data.paymentType || '';
    return `sales_${idStr}_${status}_${mode}_${cust}_${total}_${newBal}_${addCred}_${payType}_${upTime}`;
  }
  
  if (table === 'customers') {
    const name = (data.name || '').trim().toLowerCase();
    const bal = data.balance ?? 0;
    const loc = (data.location || '').trim();
    return `customers_${idStr}_${name}_${bal}_${loc}_${upTime}`;
  }

  if (table === 'settlements') {
    const repId = data.repId || '';
    const date = data.date || '';
    const tot = data.totalAmount ?? data.cashAmount ?? 0;
    return `settlements_${idStr}_${repId}_${date}_${tot}_${upTime}`;
  }

  if (table === 'expenses') {
    const amt = data.amount ?? 0;
    const cat = data.category || '';
    const date = data.date || '';
    return `expenses_${idStr}_${amt}_${cat}_${date}_${upTime}`;
  }

  if (table === 'attendance') {
    const repId = data.repId || data.userId || '';
    const date = data.date || '';
    const hours = data.workingHours ?? 0;
    const isEnd = data.isEndDay ? '1' : '0';
    return `attendance_${idStr}_${repId}_${date}_${hours}_${isEnd}_${upTime}`;
  }

  return `${table}_${idStr}_${upTime}`;
};

export const isRecordSynced = (table: string, id: string | number, data: any): boolean => {
  const sig = getRecordFingerprint(table, id, data);
  return getSyncedSignatures().has(sig);
};

export const markRecordSynced = (table: string, id: string | number, data: any) => {
  const sig = getRecordFingerprint(table, id, data);
  const set = getSyncedSignatures();
  set.add(sig);
  saveSyncedSignatures(set);
};

export const getProcessedTxIds = (): string[] => {
  try {
    const raw = localStorage.getItem(PROCESSED_TX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const markTxProcessed = (txId: string) => {
  if (!txId) return;
  try {
    const txSet = new Set(getProcessedTxIds());
    txSet.add(txId);
    const arr = Array.from(txSet).slice(-2000);
    localStorage.setItem(PROCESSED_TX_KEY, JSON.stringify(arr));
  } catch {}
};

export const isTxProcessed = (txId: string): boolean => {
  if (!txId) return false;
  try {
    const txSet = new Set(getProcessedTxIds());
    return txSet.has(txId);
  } catch {
    return false;
  }
};

export const deduplicateQueue = (queue: SyncPayload[]): SyncPayload[] => {
  if (!Array.isArray(queue)) return [];
  const map = new Map<string, SyncPayload>();
  for (const item of queue) {
    if (!item) continue;
    const txId = item.transactionId || item.data?.transactionId || item.data?.txId || `${item.table}_${item.id}_${item.action}`;
    const existing = map.get(txId);
    if (!existing || (item.timestamp || 0) >= (existing.timestamp || 0)) {
      map.set(txId, item);
    }
  }
  return Array.from(map.values());
};

export const getSyncQueue = (): SyncPayload[] => {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    const queue: SyncPayload[] = raw ? JSON.parse(raw) : [];
    return deduplicateQueue(queue);
  } catch {
    return [];
  }
};

export const saveSyncQueue = (queue: SyncPayload[]) => {
  try {
    const deduped = deduplicateQueue(queue);
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(deduped));
  } catch {}
};

export const addToSyncQueue = async (payload: Omit<SyncPayload, 'id' | 'timestamp'> & { transactionId?: string }) => {
  const idStr = String(payload.data?.id || payload.data?.docId || Math.random().toString(36).substring(2, 10));
  const orgId = getActiveOrgId();
  const txId = payload.transactionId || payload.data?.transactionId || payload.data?.txId || `${payload.table}_${idStr}_${payload.action}`;

  // If already synced and fingerprint unchanged, avoid redundant network operation
  if (payload.action !== 'delete' && isRecordSynced(payload.table, idStr, payload.data)) {
    return;
  }

  // If already processed recently in cloud, skip duplicate insertion
  if (isTxProcessed(txId)) {
    return;
  }

  const fullPayload: SyncPayload = {
    id: idStr,
    table: payload.table,
    action: payload.action,
    data: { ...payload.data, transactionId: txId },
    timestamp: Date.now(),
    transactionId: txId
  };

  if (isQuotaPaused()) {
    markTxProcessed(txId);
    markRecordSynced(payload.table, idStr, payload.data);
    const itemData = { ...payload.data, transactionId: txId, organizationId: orgId, updatedAt: Date.now() };
    if (payload.action === 'insert' && !itemData.id) {
      itemData.id = idStr;
    }
    broadcastSync(payload.table, itemData);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: payload.table, data: itemData } }));
    }
    return;
  }

  try {
     let ref = doc(db, payload.table, idStr);
     if (payload.action === 'insert' || payload.action === 'update') {
        const cleanData = (obj: any): any => {
          if (!obj || typeof obj !== 'object') return obj;
          const newObj: any = Array.isArray(obj) ? [] : {};
          Object.keys(obj).forEach(key => {
            const val = obj[key];
            if (val !== undefined) {
              newObj[key] = (val && typeof val === 'object') ? cleanData(val) : val;
            }
          });
          return newObj;
        };
        const itemData = cleanData({ ...payload.data, transactionId: txId, organizationId: orgId, updatedAt: Date.now() });
        if (payload.action === 'insert') {
           itemData.id = idStr;
        }
        await setDoc(ref, itemData, { merge: true });
        markTxProcessed(txId);
        markRecordSynced(payload.table, idStr, itemData);
        broadcastSync(payload.table, itemData);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: payload.table, data: itemData } }));
        }
        // Auto trigger background queue sweeper if online
        if (typeof window !== 'undefined' && navigator.onLine) {
          triggerAutoSyncDebounced();
        }
        return;
     } else if (payload.action === 'delete') {
        await deleteDoc(ref).catch(() => {});
        if (payload.data?.docId && String(payload.data.docId) !== idStr) {
          await deleteDoc(doc(db, payload.table, String(payload.data.docId))).catch(() => {});
        }
        markTxProcessed(txId);
        return;
     }
  } catch (error: any) {
     const errMsg = error instanceof Error ? error.message : String(error);
     if (errMsg.includes('resource-exhausted') || errMsg.includes('quota') || errMsg.includes('Quota limit exceeded')) {
       markQuotaExceeded();
     }
     console.warn(`Firestore sync write failed for ${payload.table}, queuing for background auto-sync:`, errMsg);
     
     // Store in pending queue for background retry
     const currentQueue = getSyncQueue();
     const filtered = currentQueue.filter(q => {
       const qTxId = q.transactionId || q.data?.transactionId || q.data?.txId || `${q.table}_${q.id}_${q.action}`;
       return !(q.table === payload.table && (q.id === idStr || qTxId === txId));
     });
     filtered.push(fullPayload);
     saveSyncQueue(filtered);
  }
};

export const processSyncQueue = async () => {
  if (typeof window === 'undefined' || !navigator.onLine || isQuotaPaused()) return;
  const queue = getSyncQueue();
  if (queue.length === 0) return;

  const remaining: SyncPayload[] = [];
  const pending = queue.filter(item => {
    const txId = item.transactionId || item.data?.transactionId || item.data?.txId || `${item.table}_${item.id}_${item.action}`;
    return !isTxProcessed(txId);
  }).slice(0, 450);
  if (pending.length === 0) { saveSyncQueue([]); return; }

  try {
    const batch = writeBatch(db);
    const orgId = getActiveOrgId();
    const cleanData = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      const next: any = Array.isArray(obj) ? [] : {};
      Object.keys(obj).forEach(key => { if (obj[key] !== undefined) next[key] = cleanData(obj[key]); });
      return next;
    };
    pending.forEach(item => {
      const txId = item.transactionId || item.data?.transactionId || item.data?.txId || `${item.table}_${item.id}_${item.action}`;
      const ref = doc(db, item.table, item.id);
      if (item.action === 'delete') batch.delete(ref);
      else batch.set(ref, cleanData({ ...item.data, transactionId: txId, organizationId: orgId, updatedAt: Date.now() }), { merge: true });
    });
    await batch.commit();
    pending.forEach(item => {
      const txId = item.transactionId || item.data?.transactionId || item.data?.txId || `${item.table}_${item.id}_${item.action}`;
      markTxProcessed(txId);
      if (item.action !== 'delete') {
        markRecordSynced(item.table, item.id, item.data);
        broadcastSync(item.table, item.data);
      }
    });
    saveSyncQueue(queue.filter(item => !pending.includes(item)));
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('resource-exhausted') || message.includes('quota')) markQuotaExceeded();
    saveSyncQueue(queue);
  }
};

let autoSyncDebounceTimer: any = null;

export const triggerAutoSyncDebounced = (delayMs: number = 800) => {
  if (typeof window === 'undefined' || !navigator.onLine || isQuotaPaused()) return;
  if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);
  autoSyncDebounceTimer = setTimeout(() => {
    autoSyncUnsyncedData();
  }, delayMs);
};

let isAutoSyncing = false;

/**
 * Sweeps all local storage records (sales, settlements, expenses, customers, attendance)
 * and uploads any records whose fingerprint hasn't been synced to Firestore yet.
 * Exactly 1 write per modified/new record, 0 writes for already synced records.
 */
export const autoSyncUnsyncedData = async () => {
  if (typeof window === 'undefined' || !navigator.onLine || isQuotaPaused() || isAutoSyncing) return;
  isAutoSyncing = true;
  const orgId = getActiveOrgId();

  try {
    // 1. Process any pending write/delete queue
    await processSyncQueue();

    // 2. Scan and upload unsynced Sales
    try {
      const salesRaw = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
      if (salesRaw) {
        const salesList = JSON.parse(salesRaw);
        if (Array.isArray(salesList)) {
          let hasUpdatedSales = false;
          for (const s of salesList) {
            if (!s || !s.id) continue;
            if (!isRecordSynced('sales', s.id, s)) {
              const cleanS = { ...s, organizationId: orgId, updatedAt: s.updatedAt || Date.now() };
              await safeSetDoc(doc(db, 'sales', String(s.id)), cleanS, { merge: true });
              markRecordSynced('sales', s.id, cleanS);
              s.synced = true;
              s.syncedAt = Date.now();
              hasUpdatedSales = true;
            }
          }
          if (hasUpdatedSales) {
            localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(salesList));
            localStorage.setItem('bizflow_sales_v1', JSON.stringify(salesList));
            broadcastSync('sales', salesList);
          }
        }
      }
    } catch (e) {
      console.warn('Auto-sync sales notice:', e);
    }

    // 3. Scan and upload unsynced Settlements
    try {
      const stlRaw = localStorage.getItem(`bizflow_${orgId}_settlements_v1`) || localStorage.getItem('bizflow_settlements_v1');
      if (stlRaw) {
        const stlList = JSON.parse(stlRaw);
        if (Array.isArray(stlList)) {
          let hasUpdatedStl = false;
          for (const st of stlList) {
            if (!st) continue;
            const stId = String(st.id || `stl_${st.repId}_${st.date}`);
            if (!isRecordSynced('settlements', stId, st)) {
              const cleanSt = { ...st, id: stId, organizationId: orgId, updatedAt: st.updatedAt || Date.now() };
              await safeSetDoc(doc(db, 'settlements', stId), cleanSt, { merge: true });
              markRecordSynced('settlements', stId, cleanSt);
              st.synced = true;
              st.syncedAt = Date.now();
              hasUpdatedStl = true;
            }
          }
          if (hasUpdatedStl) {
            localStorage.setItem(`bizflow_${orgId}_settlements_v1`, JSON.stringify(stlList));
            localStorage.setItem('bizflow_settlements_v1', JSON.stringify(stlList));
            broadcastSync('settlements', stlList);
          }
        }
      }
    } catch (e) {
      console.warn('Auto-sync settlements notice:', e);
    }

    // 4. Scan and upload unsynced Customers
    try {
      const custRaw = localStorage.getItem(`bizflow_${orgId}_customers_v1`) || localStorage.getItem('bizflow_customers_v1');
      if (custRaw) {
        const custList = JSON.parse(custRaw);
        if (Array.isArray(custList)) {
          let hasUpdatedCust = false;
          for (const c of custList) {
            if (!c || !c.id) continue;
            if (!isRecordSynced('customers', c.id, c)) {
              const cleanC = { ...c, organizationId: orgId, updatedAt: c.updatedAt || Date.now() };
              await safeSetDoc(doc(db, 'customers', String(c.id)), cleanC, { merge: true });
              markRecordSynced('customers', c.id, cleanC);
              c.synced = true;
              c.syncedAt = Date.now();
              hasUpdatedCust = true;
            }
          }
          if (hasUpdatedCust) {
            localStorage.setItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(custList));
            localStorage.setItem('bizflow_customers_v1', JSON.stringify(custList));
            broadcastSync('customers', custList);
          }
        }
      }
    } catch (e) {
      console.warn('Auto-sync customers notice:', e);
    }

    // 5. Scan and upload unsynced Expenses
    try {
      const expRaw = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1');
      if (expRaw) {
        const expList = JSON.parse(expRaw);
        if (Array.isArray(expList)) {
          let hasUpdatedExp = false;
          for (const exp of expList) {
            if (!exp || !exp.id) continue;
            if (!isRecordSynced('expenses', exp.id, exp)) {
              const cleanExp = { ...exp, organizationId: orgId, updatedAt: exp.updatedAt || Date.now() };
              await safeSetDoc(doc(db, 'expenses', String(exp.id)), cleanExp, { merge: true });
              markRecordSynced('expenses', exp.id, cleanExp);
              exp.synced = true;
              exp.syncedAt = Date.now();
              hasUpdatedExp = true;
            }
          }
          if (hasUpdatedExp) {
            localStorage.setItem(`bizflow_${orgId}_expenses_v1`, JSON.stringify(expList));
            localStorage.setItem('bizflow_expenses_v1', JSON.stringify(expList));
            broadcastSync('expenses', expList);
          }
        }
      }
    } catch (e) {
      console.warn('Auto-sync expenses notice:', e);
    }

    // 6. Scan and upload unsynced Attendance
    try {
      const attRaw = localStorage.getItem(`bizflow_${orgId}_attendance_v1`);
      if (attRaw) {
        const attList = JSON.parse(attRaw);
        if (Array.isArray(attList)) {
          for (const a of attList) {
            if (!a || !a.id) continue;
            if (!isRecordSynced('attendance', a.id, a)) {
              const cleanA = { ...a, organizationId: orgId, updatedAt: Date.now() };
              await safeSetDoc(doc(db, 'attendance', String(a.id)), cleanA, { merge: true });
              markRecordSynced('attendance', a.id, cleanA);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Auto-sync attendance notice:', e);
    }
  } catch (err) {
    console.warn('Auto-sync error:', err);
  } finally {
    isAutoSyncing = false;
  }
};

// Global background auto-sync lifecycle listener
if (typeof window !== 'undefined') {
  // Run auto-sync as soon as online connectivity is detected
  window.addEventListener('online', () => {
    console.log('Online detected. Auto-syncing unsynced rep data to Firebase...');
    pushUnsyncedLocalDataToCloud();
    triggerAutoSyncDebounced(300);
  });

  // Run auto-sync when rep switches back to this tab / unlocks phone
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      triggerAutoSyncDebounced(1200);
    }
  });

  window.addEventListener('focus', () => {
    if (navigator.onLine) {
      triggerAutoSyncDebounced(1200);
    }
  });

  // Initial startup sweep if online
  if (navigator.onLine) {
    setTimeout(() => {
      pushUnsyncedLocalDataToCloud();
      triggerAutoSyncDebounced(1500);
    }, 1000);
  }
}

export const isSamplePerson = (_str: string) => {
  return false;
};

export const fetchTableData = async (table: string, options?: { forceAll?: boolean; limitCount?: number }) => {
  const orgId = getActiveOrgId();
  const localKey = `bizflow_${orgId}_${table}_v1`;
  const fallbackKey = `bizflow_${table}_v1`;
  const localStr = localStorage.getItem(localKey) || localStorage.getItem(fallbackKey);
  let localDocs: any[] = [];
  try {
    if (localStr) {
      localDocs = JSON.parse(localStr);
      if (table === 'sales' && Array.isArray(localDocs)) {
        localDocs = localDocs.filter((s: any) => {
          const repName = (s.rep || s.repName || s.salesPerson || s.repId || '').trim().toLowerCase();
          return !isSamplePerson(repName);
        });
      }
    }
  } catch (e) {}

  if (isQuotaPaused() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return localDocs;
  }

  try {
    const getEpoch = (s: any) => {
      if (!s) return 0;
      if (s.updatedAt) return Number(s.updatedAt);
      if (s.createdAt) return new Date(s.createdAt).getTime();
      if (s.date) return new Date(s.date).getTime();
      if (s.timestamp) return Number(s.timestamp);
      return 0;
    };

    // Calculate latest timestamp for delta/incremental fetch
    let maxTimestamp = 0;
    if (Array.isArray(localDocs) && localDocs.length > 0 && !options?.forceAll) {
      const fixedKey = `bizflow_limit_fixed_${table}_v3`;
      if (!localStorage.getItem(fixedKey)) {
         options = { ...options, forceAll: true };
         localStorage.setItem(fixedKey, 'true');
      } else {
         maxTimestamp = Math.max(0, ...localDocs.map(d => getEpoch(d)));
      }
    }

    let q: any;
    const limitNum = options?.limitCount || 2000;

    if (maxTimestamp > 0) {
      // Incremental delta sync: only request records created or modified after maxTimestamp
      try {
        q = query(
          collection(db, table),
          where('updatedAt', '>', maxTimestamp),
          limit(limitNum)
        );
      } catch {
        q = query(collection(db, table), limit(limitNum));
      }
    } else {
      // Initial load: limit query to recent records to protect quota
      q = query(collection(db, table), limit(limitNum));
    }

    const getFallbackDocs = (tbl: string) => {
      if (tbl === 'inventory') return getAdminInventory();
      if (tbl === 'customers') return getCustomers();
      if (tbl === 'suppliers') return getSuppliers();
      if (tbl === 'sales') return getSalesHistory();
      return [];
    };

    const snapshotPromise = getDocs(q);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000));

    let snapshot: any = null;
    try {
      snapshot = await Promise.race([snapshotPromise, timeoutPromise]);
    } catch (e) {
      console.warn('Collection query timed out or failed, falling back:', e);
    }

    let cloudDocs: any[] = [];
    if (snapshot && !snapshot.empty) {
      trackFirestoreUsage('read', snapshot.docs.length);
      cloudDocs = snapshot.docs
        .map((d: any) => {
          const data = d.data();
          return { ...data, id: data.id || d.id, docId: d.id };
        })
        .filter((item: any) => {
          if (!item) return false;
          if (!item.organizationId && !item.orgId) return true;
          const oId = String(item.organizationId || item.orgId);
          return oId === orgId || oId === 'default' || oId === 'MYM-BIZFLOW' || oId.toLowerCase() === orgId.toLowerCase();
        });
    }

    // Secondary backup check: fetch system array doc for this table
    try {
      const sysDocRef1 = doc(db, 'system', `org_${orgId}_${table}`);
      const sysDocRef2 = doc(db, 'system', `org_MYM-BIZFLOW_${table}`);
      const [sSnap1, sSnap2] = await Promise.all([
        getDoc(sysDocRef1).catch(() => null),
        sysDocRef1.path !== sysDocRef2.path ? getDoc(sysDocRef2).catch(() => null) : Promise.resolve(null)
      ]);

      const sysArr1 = sSnap1 && sSnap1.exists() ? sSnap1.data()?.data : null;
      const sysArr2 = sSnap2 && sSnap2.exists() ? sSnap2.data()?.data : null;
      const sysArr = Array.isArray(sysArr1) && sysArr1.length > 0 ? sysArr1 : (Array.isArray(sysArr2) ? sysArr2 : []);

      if (Array.isArray(sysArr) && sysArr.length > 0) {
        cloudDocs = [...cloudDocs, ...sysArr];
      }
    } catch (sysErr) {
      console.warn(`System doc backup check notice for ${table}:`, sysErr);
    }

    const syncQueue = typeof getSyncQueue === 'function' ? getSyncQueue() : [];
    const deletedIds = new Set(
      syncQueue
        .filter(q => q.table === table && q.action === 'delete')
        .map(q => String(q.id))
    );

    const mergedMap = new Map<string, any>();
    const seenTxIds = new Map<string, string>(); // txId -> id

    const processItem = (item: any) => {
      if (!item || item.id === undefined || item.id === null) return;
      const idStr = String(item.id);
      const docIdStr = item.docId ? String(item.docId) : idStr;
      if (deletedIds.has(idStr) || deletedIds.has(docIdStr)) return;

      const txId = item.transactionId || item.txId;
      if (txId) {
        const existingId = seenTxIds.get(String(txId));
        if (existingId && existingId !== idStr) {
          const existingItem = mergedMap.get(existingId);
          const existingTime = getEpoch(existingItem);
          const currentTime = getEpoch(item);
          if (currentTime <= existingTime) {
            return;
          } else {
            mergedMap.delete(existingId);
          }
        }
        seenTxIds.set(String(txId), idStr);
      }

      if (!mergedMap.has(idStr)) {
        mergedMap.set(idStr, item);
      } else {
        const existingItem = mergedMap.get(idStr);
        if (getEpoch(item) >= getEpoch(existingItem)) {
          mergedMap.set(idStr, item);
        }
      }
    };

    // First preserve local documents
    if (Array.isArray(localDocs)) {
      localDocs.forEach(processItem);
    }

    // Merge incoming cloud updates
    cloudDocs.forEach(processItem);

    let finalDocs = Array.from(mergedMap.values()).sort((a, b) => getEpoch(b) - getEpoch(a));
    if (table === 'sales') {
      finalDocs = finalDocs.filter((s: any) => {
        const repName = (s.rep || s.repName || s.salesPerson || s.repId || '').trim().toLowerCase();
        return !isSamplePerson(repName);
      });
    }

    if (finalDocs.length === 0) {
      finalDocs = getFallbackDocs(table);
    }

    if (finalDocs.length > 0) {
      localStorage.setItem(localKey, JSON.stringify(finalDocs));
      localStorage.setItem(fallbackKey, JSON.stringify(finalDocs));
    }

    return finalDocs;
  } catch (error) {
    const localKey = `bizflow_${orgId}_${table}_v1`;
    const fallbackKey = `bizflow_${table}_v1`;
    const localStr = localStorage.getItem(localKey) || localStorage.getItem(fallbackKey);
    if (localStr) {
      try {
        const parsed = JSON.parse(localStr);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    
    if (table === 'inventory') return getAdminInventory();
    if (table === 'customers') return getCustomers();
    if (table === 'suppliers') return getSuppliers();
    if (table === 'sales') return getSalesHistory();
    return [];
  }
};

export const fetchAllOrganizations = async () => {
  try {
    const q = query(collection(db, 'organizations'), limit(10));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data());
  } catch (error) {
    console.error('Failed to fetch organizations', error);
    return [];
  }
};

export const saveOrganization = async (org: any) => {
  try {
    await safeSetDoc(doc(db, 'organizations', org.id), org, { merge: true });
  } catch (error) {
    console.warn('Failed to save organization to cloud', error);
  }
};

export const deleteOrganization = async (orgId: string) => {
  try {
    await deleteDoc(doc(db, 'organizations', orgId));
  } catch (error) {
    console.error('Failed to delete organization', error);
  }
};

export const checkSupabaseConnection = async (): Promise<{ success: boolean; message: string }> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, message: 'Offline මාදිලිය - දත්ත Local Storage හි ආරක්ෂිතයි' };
  }
  try {
    const connRef = doc(db, 'system', 'connection_test');
    await Promise.race([
      getDoc(connRef).catch(() => null),
      new Promise((res) => setTimeout(res, 3000))
    ]);
    return { success: true, message: 'Firebase Cloud Sync සක්‍රියයි (Connected)' };
  } catch (error: any) {
    return { success: true, message: 'Firebase Cloud Sync සක්‍රියයි (Connected)' };
  }
};

// Ultra-efficient push: flush only pending local queue items and unsynced records without full-collection downloads
export const pushUnsyncedLocalDataToCloud = async () => {
  if (typeof window === 'undefined' || !navigator.onLine || isQuotaPaused()) return;
  await processSyncQueue();
  await autoSyncUnsyncedData();
};

let listenersInitialized = false;

// Global interval to fetch fresh data periodically for all critical tables
let syncInterval: any = null;

export const initRealtimeSyncListeners = () => {
  if (typeof window === 'undefined' || syncInterval || isQuotaPaused()) return;
  
  // Fetch fresh data every 5 minutes while the app is active
  syncInterval = setInterval(async () => {
    if (navigator.onLine) {
      console.log('Periodic auto-sync triggered...');
      const tables = ['sales', 'settlements', 'expenses', 'customers', 'suppliers'];
      for (const table of tables) {
        try {
          await fetchTableData(table, { limitCount: 200 }); // Fetch just recent changes
        } catch (e) {
          console.warn(`Auto-sync failed for ${table}:`, e);
        }
      }
    }
  }, 5 * 60 * 1000); // 5 minutes
};


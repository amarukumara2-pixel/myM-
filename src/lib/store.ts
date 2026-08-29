export const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (e: any) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || (e.message && e.message.toLowerCase().includes('quota')))) {
      console.warn('LocalStorage quota exceeded, cleaning up old keys and large items...');
      try {
        // First pass: remove logs, signals, temp, cache
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (k.includes('network_logs') || k.includes('sync_queue') || k.includes('old_') || k.includes('temp_') || k.includes('signal') || k.includes('log'))) {
            localStorage.removeItem(k);
          }
        }
        try {
          localStorage.setItem(key, value);
          return;
        } catch (innerErr) {
          // Second pass: remove older sales/inventory backups if still exceeding
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k !== key && !k.includes('users_v2')) {
              localStorage.removeItem(k);
            }
          }
          localStorage.setItem(key, value);
        }
      } catch (retryErr) {
        console.error('Failed to setItem even after aggressive quota cleanup:', retryErr);
      }
    } else {
      console.error('LocalStorage setItem error:', e);
    }
  }
};

export function getActiveOrgId(): string {
  return 'MYM-BIZFLOW';
};

export function setActiveOrgId(_id: string) {
  // No longer needed for single organization app
};

export interface OrganizationSettings {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  printerSize?: '58'|'80';
  printerFontSize?: number;
  printerFontWeight?: number;
  logoUrl?: string;
  hasStockKeeper?: boolean;
  hasStaff?: boolean;
  hasAI?: boolean;
  createdAt?: number;
  isLocked?: boolean;
}

export const getOrganizationSettings = (): OrganizationSettings => {
  const orgId = getActiveOrgId();
  try {
    const stored = localStorage.getItem(`bizflow_${orgId}_settings`);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure createdAt exists for old orgs (mocking 3 months ago if missing so feature works for current users if they want)
      if (!parsed.createdAt) {
          parsed.createdAt = Date.now() - (90 * 24 * 60 * 60 * 1000); 
          safeSetItem(`bizflow_${orgId}_settings`, JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch (e) {}
  return { id: orgId, name: 'MYM BIZFLOW', printerSize: '58', printerFontSize: 13, printerFontWeight: 700, createdAt: Date.now() };
};

export const saveOrganizationSettings = (settings: OrganizationSettings) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_settings`, JSON.stringify(settings));
  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_settings`), { 
      ...settings,
      updatedAt: Date.now()
    }, { merge: true });
  });
};

export interface SystemUser {
  id: string;
  name: string;
  pin: string;
  email?: string;
  role: 'admin' | 'rep' | 'super_admin' | 'stock_keeper' | 'driver' | 'other';
  organizationId: string;
  advances?: number;
  cashBookBalance?: number;
  pendingAdminHandover?: number;
  salaryBalance?: number;
  baseSalary?: number;
  attendanceAllowance?: number;
  hourlyRate?: number;
  otRate?: number;
  dailyWage?: number;
  payModel?: 'monthly' | 'daily' | 'hourly';
  customRoleName?: string;
  subscriptionPlan?: 'offline-only' | 'pro';
  subscriptionStart?: number;
  activeArea?: string;
  assignedPartnerId?: string;
  assignedVehicle?: string;
  lockedFeatures?: string[];
  lastOnline?: number;
}

export const DEFAULT_USERS: SystemUser[] = [
  { 
    id: `admin_MYM-BIZFLOW`, 
    name: 'Admin', 
    pin: '1993', 
    role: 'admin',
    organizationId: 'MYM-BIZFLOW' 
  }
];

export const isSamplePerson = (_str: string) => {
  return false;
};

export const purgeNimalKamal = () => {
  // No-op to preserve user created reps
};

export const getUsers = (): SystemUser[] => {
  const orgId = getActiveOrgId();
  const keys = [
    `bizflow_${orgId}_users_v2`,
    `bizflow_MYM-BIZFLOW_users_v2`,
    `bizflow_default_users_v2`,
    `bizflow_users_v2`,
    `bizflow_${orgId}_users_v1`,
    `bizflow_MYM-BIZFLOW_users_v1`,
    `bizflow_default_users_v1`,
    `bizflow_users_v1`,
    `bizflow_users`
  ];
  
  const userMap = new Map<string, SystemUser>();
  keys.forEach(k => {
    try {
      const stored = localStorage.getItem(k);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsed.forEach((u: SystemUser) => {
            if (u && (u.id || u.name)) {
              const userKey = u.id || `user_${u.name}_${u.role}`;
              if (!userMap.has(userKey)) {
                userMap.set(userKey, u);
              }
            }
          });
        }
      }
    } catch (e) {}
  });

  if (userMap.size > 0) {
    return Array.from(userMap.values());
  }
  
  const defaults: SystemUser[] = [
    { 
      id: `admin_${orgId}`, 
      name: 'Admin', 
      pin: '1993', 
      role: 'admin',
      organizationId: orgId 
    }
  ];
  safeSetItem(`bizflow_${orgId}_users_v2`, JSON.stringify(defaults));
  safeSetItem(`bizflow_MYM-BIZFLOW_users_v2`, JSON.stringify(defaults));
  safeSetItem(`bizflow_users_v2`, JSON.stringify(defaults));
  return defaults;
};


export const deleteSystemUser = (userId: string) => {
  const orgId = getActiveOrgId();
  const currentUsers = getUsers().filter(u => u.id !== userId);
  safeSetItem(`bizflow_${orgId}_users_v2`, JSON.stringify(currentUsers));
  
  Promise.all([import('firebase/firestore'), import('./sync')]).then(async ([ {doc}, {db, safeSetDoc, safeDeleteDoc} ]) => {
    const sanitize = (obj: any): any => JSON.parse(JSON.stringify(obj));
    // 1. Update legacy single-doc
    safeSetDoc(doc(db, 'system', `org_${orgId}_users`), { 
      data: sanitize(currentUsers),
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });

    // 2. Delete individual user doc
    safeDeleteDoc(doc(db, 'users', userId));
    safeDeleteDoc(doc(db, 'system', `org_${orgId}_repinv_${userId}`));
  });
};

export const saveUsers = (users: SystemUser[]) => {
  const orgId = getActiveOrgId();
  const cleanUsers = users;
  safeSetItem(`bizflow_${orgId}_users_v2`, JSON.stringify(cleanUsers));
  
  // Also push to standard 'users' collection for multi-device reliability
  Promise.all([import('firebase/firestore'), import('./sync')]).then(async ([ {doc}, {db, safeSetDoc} ]) => {
    const sanitize = (obj: any): any => JSON.parse(JSON.stringify(obj));
    // 1. Legacy single-doc sync for backward compatibility with current syncAllFromCloud
    safeSetDoc(doc(db, 'system', `org_${orgId}_users`), { 
      data: sanitize(cleanUsers),
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });

    // 2. Individual user doc sync for better multi-user reliability
    for (const user of cleanUsers) {
      safeSetDoc(doc(db, 'users', user.id), {
        ...sanitize(user),
        organizationId: orgId,
        updatedAt: Date.now()
      }, { merge: true });
    }
  });
};

export const updateUserOnlineStatus = (userId: string) => {
  if (!userId) return;
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx >= 0) {
    const now = Date.now();
    const last = users[idx].lastOnline || 0;
    // Always update local storage for fast UI feedback
    users[idx].lastOnline = now;
    const orgId = getActiveOrgId();
    safeSetItem(`bizflow_${orgId}_users_v2`, JSON.stringify(users));

    // Throttle cloud write to once every 15 minutes to preserve Firestore quota
    if (!last || now - last > 15 * 60 * 1000) {
      saveUsers(users);
    }
  }
};

export const formatLastOnline = (timestamp?: number, lang: 'en' | 'si' = 'en') => {
  if (!timestamp) {
    return {
      text: lang === 'si' ? 'තවම ඔන්ලයින් වී නැත' : 'Never Online',
      isOnline: false,
      badgeColor: 'bg-slate-100 text-slate-500 border-slate-200'
    };
  }

  const diffMs = Date.now() - timestamp;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);

  if (diffMins < 2) {
    return {
      text: lang === 'si' ? 'දැන් ඔන්ලයින්' : 'Online Now',
      isOnline: true,
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
    };
  }

  if (diffMins < 60) {
    return {
      text: lang === 'si' ? `මීට මිනිත්තු ${diffMins} කට පෙර` : `${diffMins}m ago`,
      isOnline: false,
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200'
    };
  }

  const dateObj = new Date(timestamp);
  const todayStr = new Date().toLocaleDateString();
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (dateObj.toLocaleDateString() === todayStr) {
    return {
      text: lang === 'si' ? `අද ${timeStr}` : `Today at ${timeStr}`,
      isOnline: false,
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
    };
  }

  const dateStr = dateObj.toLocaleDateString();
  return {
    text: `${dateStr} ${timeStr}`,
    isOnline: false,
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200'
  };
};

export interface RepInventoryItem {
  id: number;
  name: string;
  minPrice: number;
  maxPrice: number;
  stockInMain: number;
  myStock: number;
  returnStock: number;
  costPrice: number;
  area?: string;
}

export const getRepInventory = (repId: string): RepInventoryItem[] => {
  const orgId = getActiveOrgId();
  try {
    const stored = localStorage.getItem(`bizflow_${orgId}_repinv_${repId}`) ||
                   localStorage.getItem(`bizflow_MYM-BIZFLOW_repinv_${repId}`) ||
                   localStorage.getItem(`bizflow_default_repinv_${repId}`) ||
                   localStorage.getItem(`bizflow_repinv_${repId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch(e) {}

  const initialRepStock: RepInventoryItem[] = (REAL_INVENTORY || []).map(item => ({
    id: item.id,
    name: item.name,
    category: item.category || 'General',
    price: item.price || item.minPrice || item.sellingPrice,
    minPrice: item.minPrice || item.price,
    maxPrice: item.maxPrice || item.price,
    wholesalePrice: item.costPrice || item.wholesalePrice,
    mainStock: item.stock || 0,
    mainStockQty: item.stock || 0,
    stockInMain: item.stock || 0,
    myStock: 0,
    returnStock: 0,
    costPrice: item.costPrice || 0
  }));

  safeSetItem(`bizflow_${orgId}_repinv_${repId}`, JSON.stringify(initialRepStock));
  safeSetItem(`bizflow_repinv_${repId}`, JSON.stringify(initialRepStock));
  return initialRepStock;
};

export const saveRepInventory = (repId: string, inv: RepInventoryItem[]) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_repinv_${repId}`, JSON.stringify(inv));
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: `repinv_${repId}`, data: inv } }));
  }

  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc, broadcastSync} ]) => {
    const sanitize = (obj: any): any => JSON.parse(JSON.stringify(obj));
    if (broadcastSync) broadcastSync(`repinv_${repId}`, sanitize(inv));
    safeSetDoc(doc(db, 'system', `org_${orgId}_repinv_${repId}`), { 
      data: sanitize(inv),
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
  });
};

export interface AttendanceRecord {
  id: string;
  repId: string;
  repName: string;
  date: string;
  timestamp: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  location?: string;
  dailySale?: number;
  dailyBonus?: number;
  workingHours?: number;
  otHours?: number;
  isEndDay?: boolean;
}

export const getAttendanceRecords = (): AttendanceRecord[] => {
  const orgId = getActiveOrgId();
  try {
    const stored1 = localStorage.getItem(`bizflow_${orgId}_attendance_v1`);
    const stored2 = localStorage.getItem(`bizflow_${orgId}_staff_attendance_v1`);
    const list1: AttendanceRecord[] = stored1 ? JSON.parse(stored1) : [];
    const list2: StaffAttendance[] = stored2 ? JSON.parse(stored2) : [];
    
    const map = new Map<string, AttendanceRecord>();
    list1.forEach(r => {
      const uId = r.repId || (r as any).userId;
      if (uId && r.date) {
        map.set(`${uId}_${r.date}`, r);
      }
    });

    list2.forEach(s => {
      if (s.userId && s.date) {
        const key = `${s.userId}_${s.date}`;
        if (!map.has(key)) {
          map.set(key, {
            id: s.id || 'att_' + Date.now(),
            repId: s.userId,
            repName: s.userName || 'Staff',
            date: s.date,
            timestamp: s.checkIn || Date.now(),
            status: 'Approved',
            workingHours: s.workingHours || 0,
            otHours: s.otHours || 0,
            isEndDay: !!s.checkOut
          });
        } else {
          const existing = map.get(key)!;
          if (s.workingHours && (!existing.workingHours || existing.workingHours === 0)) existing.workingHours = s.workingHours;
          if (s.otHours && (!existing.otHours || existing.otHours === 0)) existing.otHours = s.otHours;
        }
      }
    });

    return Array.from(map.values());
  } catch (e) {}
  return [];
};

export const saveAttendanceRecords = (records: AttendanceRecord[]) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_attendance_v1`, JSON.stringify(records));
  
  const existingStaffStr = localStorage.getItem(`bizflow_${orgId}_staff_attendance_v1`);
  let staffList: StaffAttendance[] = existingStaffStr ? JSON.parse(existingStaffStr) : [];
  
  const staffMap = new Map<string, StaffAttendance>();
  staffList.forEach(s => staffMap.set(s.id, s));

  records.forEach(r => {
    staffMap.set(r.id, {
      id: r.id,
      userId: r.repId,
      userName: r.repName,
      date: r.date,
      checkIn: r.timestamp,
      checkOut: r.isEndDay ? r.timestamp + ((r.workingHours || 8) * 3600000) : undefined,
      workingHours: r.workingHours || 0,
      otHours: r.otHours || 0,
      organizationId: orgId
    });
  });
  
  const newStaffList = Array.from(staffMap.values());
  safeSetItem(`bizflow_${orgId}_staff_attendance_v1`, JSON.stringify(newStaffList));
  
  const staffListForCloud = newStaffList; // rename to match downstream usage

  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_attendance`), { 
      data: records,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
    safeSetDoc(doc(db, 'system', `org_${orgId}_staff_attendance`), { 
      data: staffListForCloud,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
  });

  window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'attendance' } }));
};

export interface SettlementRecord {
  id: string;
  repId: string;
  repName?: string;
  date: string;
  timestamp: number;
  totalCash?: number;
  totalCheque?: number;
  expensesDeduction?: number;
  advancesDeduction?: number;
  netCashHandedOver?: number;
  salesCount?: number;
  grossProfit?: number;
  netProfit?: number;
  status: 'Settled';
  submittedOnline: boolean;
  organizationId: string;
}

export const getSettlementRecords = (): SettlementRecord[] => {
  const orgId = getActiveOrgId();
  try {
    const raw = localStorage.getItem(`bizflow_${orgId}_settlements_v1`) || 
                localStorage.getItem(`bizflow_MYM-BIZFLOW_settlements_v1`) || 
                localStorage.getItem(`bizflow_default_settlements_v1`) || 
                localStorage.getItem('bizflow_settlements_v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const getSettledDates = (repId: string): string[] => {
  if (!repId) return [];
  const orgId = getActiveOrgId();
  try {
    const key = `bizflow_${orgId}_${repId}_settled_dates`;
    const raw = localStorage.getItem(key);
    const localDates: string[] = raw ? JSON.parse(raw) : [];

    const allRecords = getSettlementRecords();
    const globalDates = allRecords.filter(r => r.repId === repId).map(r => r.date);

    return Array.from(new Set([...localDates, ...globalDates]));
  } catch {
    return [];
  }
};

export const markDatesSettled = (repId: string, dates: string[], details?: { 
  totalCash?: number; 
  totalCheque?: number; 
  repName?: string;
  expensesDeduction?: number;
  advancesDeduction?: number;
  netCashHandedOver?: number;
  salesCount?: number;
  grossProfit?: number;
  netProfit?: number;
  }) => {
  if (!repId) return;
  const orgId = getActiveOrgId();
  const existingRecords = getSettlementRecords();
  const now = Date.now();
  
  const newRecords: SettlementRecord[] = dates.map(d => ({
    id: `SETTL-${repId}-${d}-${now}`,
    repId,
    repName: details?.repName,
    date: d,
    timestamp: now,
    totalCash: details?.totalCash || 0,
    totalCheque: details?.totalCheque || 0,
    expensesDeduction: details?.expensesDeduction || 0,
    advancesDeduction: details?.advancesDeduction || 0,
    netCashHandedOver: details?.netCashHandedOver !== undefined ? details.netCashHandedOver : (details?.totalCash || 0),
  salesCount: details?.salesCount || 0,
  grossProfit: details?.grossProfit || 0,
  netProfit: details?.netProfit || 0,
  status: 'Settled',
    submittedOnline: navigator.onLine,
    organizationId: orgId
  }));

  const updatedRecords = [...existingRecords];
  newRecords.forEach(nr => {
    const idx = updatedRecords.findIndex(r => r.repId === nr.repId && r.date === nr.date);
    if (idx >= 0) {
      updatedRecords[idx] = nr;
    } else {
      updatedRecords.push(nr);
    }
  });

  safeSetItem(`bizflow_${orgId}_settlements_v1`, JSON.stringify(updatedRecords));

  const key = `bizflow_${orgId}_${repId}_settled_dates`;
  let existingDates: string[] = [];
  try {
    const raw = localStorage.getItem(key);
    existingDates = raw ? JSON.parse(raw) : [];
  } catch {}
  const updatedDates = Array.from(new Set([...existingDates, ...dates]));
  safeSetItem(key, JSON.stringify(updatedDates));

  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc, addToSyncQueue} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_settlements`), { 
      data: updatedRecords,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });

    newRecords.forEach(nr => {
      addToSyncQueue({ table: 'settlements', action: 'insert', data: nr });
    });
  });

  window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'settlements', data: updatedRecords } }));
};

export interface StaffAttendance {
  id: string;
  userId: string;
  userName: string;
  date: string;
  checkIn?: number;
  checkOut?: number;
  workingHours?: number;
  otHours?: number;
  note?: string;
  organizationId: string;
}

export const getStaffAttendance = (): StaffAttendance[] => {
  const orgId = getActiveOrgId();
  try {
    const stored1 = localStorage.getItem(`bizflow_${orgId}_staff_attendance_v1`);
    const stored2 = localStorage.getItem(`bizflow_${orgId}_attendance_v1`);
    const list1: StaffAttendance[] = stored1 ? JSON.parse(stored1) : [];
    const list2: AttendanceRecord[] = stored2 ? JSON.parse(stored2) : [];
    
    const map = new Map<string, StaffAttendance>();
    list1.forEach(s => {
      if (s.userId && s.date) {
        map.set(`${s.userId}_${s.date}`, s);
      }
    });

    list2.forEach(r => {
      const uId = r.repId || (r as any).userId;
      if (uId && r.date) {
        const key = `${uId}_${r.date}`;
        const wHours = (r.workingHours && r.workingHours > 0) ? r.workingHours : 8;
        if (!map.has(key)) {
          map.set(key, {
            id: r.id || 'staff_att_' + Date.now(),
            userId: uId,
            userName: r.repName || 'Staff',
            date: r.date,
            checkIn: r.timestamp || Date.now(),
            checkOut: r.isEndDay ? (r.timestamp || Date.now()) + (wHours * 3600000) : (r.timestamp ? r.timestamp + (wHours * 3600000) : undefined),
            workingHours: wHours,
            otHours: r.otHours || 0,
            organizationId: orgId
          });
        } else {
          const existing = map.get(key)!;
          if (!existing.workingHours || existing.workingHours === 0) existing.workingHours = wHours;
          if (r.otHours && (!existing.otHours || existing.otHours === 0)) existing.otHours = r.otHours;
        }
      }
    });

    // Auto-discover active work days from settlements so rep never loses salary or settlement data if check-in was missed
    const settlements = getSettlementRecords();
    settlements.forEach(st => {
      if (st.repId && st.date) {
        const key = `${st.repId}_${st.date}`;
        if (!map.has(key)) {
          map.set(key, {
            id: `att_auto_stl_${st.repId}_${st.date}`,
            userId: st.repId,
            userName: st.repName || 'Staff',
            date: st.date,
            checkIn: st.timestamp || Date.now(),
            checkOut: (st.timestamp || Date.now()) + (8 * 3600000),
            workingHours: 8,
            otHours: 0,
            note: 'Auto-credited from Daily Settlement',
            organizationId: orgId
          });
        }
      }
    });

    // Auto-discover active work days from sales bills if check-in was missed
    try {
      const salesRaw = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
      if (salesRaw) {
        const salesList = JSON.parse(salesRaw);
        if (Array.isArray(salesList)) {
          salesList.forEach((sl: any) => {
            if (sl && sl.status !== 'cancelled') {
              const repId = sl.repId || sl.coRepId;
              const dateRaw = sl.createdAt || sl.date;
              if (repId && dateRaw) {
                const dStr = typeof dateRaw === 'string' ? dateRaw.slice(0, 10) : new Date(dateRaw).toISOString().slice(0, 10);
                if (dStr && dStr.length === 10) {
                  const key = `${repId}_${dStr}`;
                  if (!map.has(key)) {
                    map.set(key, {
                      id: `att_auto_sale_${repId}_${dStr}`,
                      userId: repId,
                      userName: sl.repName || sl.rep || 'Staff',
                      date: dStr,
                      checkIn: new Date(dateRaw).getTime() || Date.now(),
                      checkOut: (new Date(dateRaw).getTime() || Date.now()) + (8 * 3600000),
                      workingHours: 8,
                      otHours: 0,
                      note: 'Auto-credited from Active Sales Activity',
                      organizationId: orgId
                    });
                  }
                }
              }
            }
          });
        }
      }
    } catch {}

    return Array.from(map.values());
  } catch (e) {}
  return [];
};

export const saveStaffAttendance = (records: StaffAttendance[]) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_staff_attendance_v1`, JSON.stringify(records));
  
  const attList: AttendanceRecord[] = records.map(s => ({
    id: s.id,
    repId: s.userId,
    repName: s.userName,
    date: s.date,
    timestamp: s.checkIn || Date.now(),
    status: 'Approved',
    workingHours: s.workingHours || 0,
    otHours: s.otHours || 0,
    isEndDay: !!s.checkOut
  }));
  safeSetItem(`bizflow_${orgId}_attendance_v1`, JSON.stringify(attList));

  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_staff_attendance`), { 
      data: records,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
    safeSetDoc(doc(db, 'system', `org_${orgId}_attendance`), { 
      data: attList,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
  });

  window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'attendance' } }));
};

export interface AIActionRequest {
  id: string;
  repId: string;
  repName?: string;
  type?: string;
  actionType?: 'add_expense' | 'add_bill' | 'update_stock' | 'delete_record' | 'product_add' | 'supplier_buy' | 'rep_load' | 'stock_load' | 'stock_load_rep' | 'stock_load_admin' | 'sale_cancel' | 'handover_admin' | 'price_approval' | 'rep_return_handover' | 'rep_good_stock_handover' | 'other';
  description?: string;
  payload?: any;
  metadata?: any;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Completed';
  timestamp: string | number;
  createdRole?: string;
}

export const getAIActionRequests = (): AIActionRequest[] => {
  const orgId = getActiveOrgId();
  try {
    const stored = localStorage.getItem(`bizflow_${orgId}_aiactions_v1`) || localStorage.getItem('bizflow_aiactions_v1');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
};

export const saveAIActionRequests = (requests: AIActionRequest[]) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_aiactions_v1`, JSON.stringify(requests));
  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_aiactions`), { 
      data: requests,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
  });
};

export const REAL_INVENTORY = [
  {
    "id": 1780000000001,
    "name": "ඥානකතා 20 පොඩි",
    "category": "General",
    "supplier": "චමෝද්",
    "costPrice": 440,
    "minPrice": 530,
    "maxPrice": 550,
    "price": 530,
    "wholesalePrice": 440,
    "sellingPrice": 530,
    "stock": 6,
    "mainStock": 6,
    "mainStockQty": 6,
    "stockInMain": 6,
    "availableStock": 6,
    "myStock": 6,
    "returnStock": 0
  },
  {
    "id": 1780000000002,
    "name": "ටොෆි-මිල්ක්",
    "category": "General",
    "supplier": "බින්ගො",
    "costPrice": 425,
    "minPrice": 500,
    "maxPrice": 550,
    "price": 500,
    "wholesalePrice": 425,
    "sellingPrice": 500,
    "stock": 70,
    "mainStock": 70,
    "mainStockQty": 70,
    "stockInMain": 70,
    "availableStock": 70,
    "myStock": 70,
    "returnStock": 0
  },
  {
    "id": 1780000000003,
    "name": "ටොෆි",
    "category": "General",
    "supplier": "බින්ගො",
    "costPrice": 336,
    "minPrice": 450,
    "maxPrice": 550,
    "price": 450,
    "wholesalePrice": 336,
    "sellingPrice": 450,
    "stock": 10,
    "mainStock": 10,
    "mainStockQty": 10,
    "stockInMain": 10,
    "availableStock": 10,
    "myStock": 10,
    "returnStock": 0
  },
  {
    "id": 1780000000004,
    "name": "ටිෆිටිප්-100",
    "category": "General",
    "supplier": "බින්ගො",
    "costPrice": 60,
    "minPrice": 70,
    "maxPrice": 80,
    "price": 70,
    "wholesalePrice": 60,
    "sellingPrice": 70,
    "stock": 144,
    "mainStock": 144,
    "mainStockQty": 144,
    "stockInMain": 144,
    "availableStock": 144,
    "myStock": 144,
    "returnStock": 0
  },
  {
    "id": 1780000000005,
    "name": "සුවදපහ",
    "category": "General",
    "supplier": "අනූෂා",
    "costPrice": 450,
    "minPrice": 480,
    "maxPrice": 500,
    "price": 480,
    "wholesalePrice": 450,
    "sellingPrice": 480,
    "stock": 10,
    "mainStock": 10,
    "mainStockQty": 10,
    "stockInMain": 10,
    "availableStock": 10,
    "myStock": 10,
    "returnStock": 0
  },
  {
    "id": 1780000000006,
    "name": "ටිෆිටිප්-1kg",
    "category": "General",
    "supplier": "බින්ගො",
    "costPrice": 1175,
    "minPrice": 1200,
    "maxPrice": 1300,
    "price": 1200,
    "wholesalePrice": 1175,
    "sellingPrice": 1200,
    "stock": 7,
    "mainStock": 7,
    "mainStockQty": 7,
    "stockInMain": 7,
    "availableStock": 7,
    "myStock": 7,
    "returnStock": 0
  },
  {
    "id": 1780000000007,
    "name": "මුරුක්කු-5",
    "category": "General",
    "supplier": "රන්මල්",
    "costPrice": 500,
    "minPrice": 580,
    "maxPrice": 650,
    "price": 580,
    "wholesalePrice": 500,
    "sellingPrice": 580,
    "stock": 20,
    "mainStock": 20,
    "mainStockQty": 20,
    "stockInMain": 20,
    "availableStock": 20,
    "myStock": 20,
    "returnStock": 0
  },
  {
    "id": 1780000000008,
    "name": "කිරිටොෆි 10",
    "category": "General",
    "supplier": "",
    "costPrice": 450,
    "minPrice": 580,
    "maxPrice": 630,
    "price": 580,
    "wholesalePrice": 450,
    "sellingPrice": 580,
    "stock": 22,
    "mainStock": 22,
    "mainStockQty": 22,
    "stockInMain": 22,
    "availableStock": 22,
    "myStock": 22,
    "returnStock": 0
  },
  {
    "id": 1780000000009,
    "name": "තල බෝල",
    "category": "General",
    "supplier": "",
    "costPrice": 450,
    "minPrice": 580,
    "maxPrice": 650,
    "price": 580,
    "wholesalePrice": 450,
    "sellingPrice": 580,
    "stock": 5,
    "mainStock": 5,
    "mainStockQty": 5,
    "stockInMain": 5,
    "availableStock": 5,
    "myStock": 5,
    "returnStock": 0
  },
  {
    "id": 1780000000010,
    "name": "නූඩ්ල්ස් 400g",
    "category": "General",
    "supplier": "බින්ගො",
    "costPrice": 155,
    "minPrice": 190,
    "maxPrice": 210,
    "price": 190,
    "wholesalePrice": 155,
    "sellingPrice": 190,
    "stock": 70,
    "mainStock": 70,
    "mainStockQty": 70,
    "stockInMain": 70,
    "availableStock": 70,
    "myStock": 70,
    "returnStock": 0
  },
  {
    "id": 1780000000011,
    "name": "රටකජු-මසාලා",
    "category": "General",
    "supplier": "දේදුණු",
    "costPrice": 890,
    "minPrice": 1050,
    "maxPrice": 1150,
    "price": 1050,
    "wholesalePrice": 890,
    "sellingPrice": 1050,
    "stock": 10,
    "mainStock": 10,
    "mainStockQty": 10,
    "stockInMain": 10,
    "availableStock": 10,
    "myStock": 10,
    "returnStock": 0
  },
  {
    "id": 1780000000012,
    "name": "රටකජු-අවන්",
    "category": "General",
    "supplier": "දේදුණු",
    "costPrice": 890,
    "minPrice": 1050,
    "maxPrice": 1150,
    "price": 1050,
    "wholesalePrice": 890,
    "sellingPrice": 1050,
    "stock": 7,
    "mainStock": 7,
    "mainStockQty": 7,
    "stockInMain": 7,
    "availableStock": 7,
    "myStock": 7,
    "returnStock": 0
  },
  {
    "id": 1780000000013,
    "name": "රටකජු-තෙල්",
    "category": "General",
    "supplier": "දේදුණු",
    "costPrice": 890,
    "minPrice": 1050,
    "maxPrice": 1150,
    "price": 1050,
    "wholesalePrice": 890,
    "sellingPrice": 1050,
    "stock": 10,
    "mainStock": 10,
    "mainStockQty": 10,
    "stockInMain": 10,
    "availableStock": 10,
    "myStock": 10,
    "returnStock": 0
  },
  {
    "id": 1780000000014,
    "name": "බයිට් මුරුක්කු",
    "category": "General",
    "supplier": "දේදුණු",
    "costPrice": 490,
    "minPrice": 580,
    "maxPrice": 610,
    "price": 580,
    "wholesalePrice": 490,
    "sellingPrice": 580,
    "stock": 9,
    "mainStock": 9,
    "mainStockQty": 9,
    "stockInMain": 9,
    "availableStock": 9,
    "myStock": 9,
    "returnStock": 0
  },
  {
    "id": 1780000000015,
    "name": "මිෂර්",
    "category": "General",
    "supplier": "දේදුණු",
    "costPrice": 490,
    "minPrice": 580,
    "maxPrice": 620,
    "price": 580,
    "wholesalePrice": 490,
    "sellingPrice": 580,
    "stock": 18,
    "mainStock": 18,
    "mainStockQty": 18,
    "stockInMain": 18,
    "availableStock": 18,
    "myStock": 18,
    "returnStock": 0
  },
  {
    "id": 1780000000016,
    "name": "බේබි මිෂර්",
    "category": "General",
    "supplier": "දේදුණු",
    "costPrice": 490,
    "minPrice": 580,
    "maxPrice": 620,
    "price": 580,
    "wholesalePrice": 490,
    "sellingPrice": 580,
    "stock": 9,
    "mainStock": 9,
    "mainStockQty": 9,
    "stockInMain": 9,
    "availableStock": 9,
    "myStock": 9,
    "returnStock": 0
  },
  {
    "id": 1780000000017,
    "name": "බැදපු තුනපහ 50g",
    "category": "General",
    "supplier": "අනූෂා",
    "costPrice": 71.25,
    "minPrice": 78,
    "maxPrice": 85,
    "price": 78,
    "wholesalePrice": 71.25,
    "sellingPrice": 78,
    "stock": 27,
    "mainStock": 27,
    "mainStockQty": 27,
    "stockInMain": 27,
    "availableStock": 27,
    "myStock": 27,
    "returnStock": 0
  },
  {
    "id": 1780000000018,
    "name": "අමු තුනපහ 50g",
    "category": "General",
    "supplier": "අනූෂා",
    "costPrice": 67.5,
    "minPrice": 78,
    "maxPrice": 85,
    "price": 78,
    "wholesalePrice": 67.5,
    "sellingPrice": 78,
    "stock": 8,
    "mainStock": 8,
    "mainStockQty": 8,
    "stockInMain": 8,
    "availableStock": 8,
    "myStock": 8,
    "returnStock": 0
  },
  {
    "id": 1780000000019,
    "name": "සෝයා උම්මලකඩ",
    "category": "General",
    "supplier": "හිරු",
    "costPrice": 80,
    "minPrice": 100,
    "maxPrice": 110,
    "price": 100,
    "wholesalePrice": 80,
    "sellingPrice": 100,
    "stock": 130,
    "mainStock": 130,
    "mainStockQty": 130,
    "stockInMain": 130,
    "availableStock": 130,
    "myStock": 130,
    "returnStock": 0
  },
  {
    "id": 1780000000020,
    "name": "සෝයා 70",
    "category": "General",
    "supplier": "හිරු",
    "costPrice": 40,
    "minPrice": 50,
    "maxPrice": 60,
    "price": 50,
    "wholesalePrice": 40,
    "sellingPrice": 50,
    "stock": 405,
    "mainStock": 405,
    "mainStockQty": 405,
    "stockInMain": 405,
    "availableStock": 405,
    "myStock": 405,
    "returnStock": 0
  },
  {
    "id": 1780000000021,
    "name": "කහ කුඩු 25g",
    "category": "General",
    "supplier": "අනූෂා",
    "costPrice": 108.75,
    "minPrice": 125,
    "maxPrice": 135,
    "price": 125,
    "wholesalePrice": 108.75,
    "sellingPrice": 125,
    "stock": 9,
    "mainStock": 9,
    "mainStockQty": 9,
    "stockInMain": 9,
    "availableStock": 9,
    "myStock": 9,
    "returnStock": 0
  },
  {
    "id": 1780000000022,
    "name": "කෑලි මිරිස් 50g",
    "category": "General",
    "supplier": "අනූෂා",
    "costPrice": 63.75,
    "minPrice": 70,
    "maxPrice": 75,
    "price": 70,
    "wholesalePrice": 63.75,
    "sellingPrice": 70,
    "stock": 53,
    "mainStock": 53,
    "mainStockQty": 53,
    "stockInMain": 53,
    "availableStock": 53,
    "myStock": 53,
    "returnStock": 0
  },
  {
    "id": 1780000000023,
    "name": "ගම්මිරිස් 25g",
    "category": "General",
    "supplier": "අනූෂා",
    "costPrice": 97.5,
    "minPrice": 110,
    "maxPrice": 120,
    "price": 110,
    "wholesalePrice": 97.5,
    "sellingPrice": 110,
    "stock": 23,
    "mainStock": 23,
    "mainStockQty": 23,
    "stockInMain": 23,
    "availableStock": 23,
    "myStock": 23,
    "returnStock": 0
  },
  {
    "id": 1780000000024,
    "name": "කජු බෝතල්",
    "category": "General",
    "supplier": "NSR",
    "costPrice": 370,
    "minPrice": 450,
    "maxPrice": 500,
    "price": 450,
    "wholesalePrice": 370,
    "sellingPrice": 450,
    "stock": 8,
    "mainStock": 8,
    "mainStockQty": 8,
    "stockInMain": 8,
    "availableStock": 8,
    "myStock": 8,
    "returnStock": 0
  },
  {
    "id": 1780000000025,
    "name": "බීම 350ml",
    "category": "General",
    "supplier": "C cola",
    "costPrice": 78,
    "minPrice": 95,
    "maxPrice": 110,
    "price": 95,
    "wholesalePrice": 78,
    "sellingPrice": 95,
    "stock": 624,
    "mainStock": 624,
    "mainStockQty": 624,
    "stockInMain": 624,
    "availableStock": 624,
    "myStock": 624,
    "returnStock": 0
  },
  {
    "id": 1780000000026,
    "name": "බීම 750ml",
    "category": "General",
    "supplier": "C cola",
    "costPrice": 117,
    "minPrice": 144,
    "maxPrice": 162,
    "price": 144,
    "wholesalePrice": 117,
    "sellingPrice": 144,
    "stock": 456,
    "mainStock": 456,
    "mainStockQty": 456,
    "stockInMain": 456,
    "availableStock": 456,
    "myStock": 456,
    "returnStock": 0
  },
  {
    "id": 1780000000027,
    "name": "බීම 1.5L",
    "category": "General",
    "supplier": "C cola",
    "costPrice": 227.5,
    "minPrice": 280,
    "maxPrice": 310,
    "price": 280,
    "wholesalePrice": 227.5,
    "sellingPrice": 280,
    "stock": 144,
    "mainStock": 144,
    "mainStockQty": 144,
    "stockInMain": 144,
    "availableStock": 144,
    "myStock": 144,
    "returnStock": 0
  },
  {
    "id": 1780000000028,
    "name": "මුරුක්කු-10",
    "category": "General",
    "supplier": "",
    "costPrice": 500,
    "minPrice": 580,
    "maxPrice": 650,
    "price": 580,
    "wholesalePrice": 500,
    "sellingPrice": 580,
    "stock": 20,
    "mainStock": 20,
    "mainStockQty": 20,
    "stockInMain": 20,
    "availableStock": 20,
    "myStock": 20,
    "returnStock": 0
  },
  {
    "id": 1780000000029,
    "name": "මිනි චිප්ස්",
    "category": "General",
    "supplier": "බින්ගෝ",
    "costPrice": 33,
    "minPrice": 35,
    "maxPrice": 44,
    "price": 35,
    "wholesalePrice": 33,
    "sellingPrice": 35,
    "stock": 200,
    "mainStock": 200,
    "mainStockQty": 200,
    "stockInMain": 200,
    "availableStock": 200,
    "myStock": 200,
    "returnStock": 0
  },
  {
    "id": 1780000000030,
    "name": "සෝයා 60",
    "category": "General",
    "supplier": "හිරු",
    "costPrice": 35,
    "minPrice": 40,
    "maxPrice": 50,
    "price": 40,
    "wholesalePrice": 35,
    "sellingPrice": 40,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000031,
    "name": "ටිපිටිප්-20",
    "category": "General",
    "supplier": "බින්ගො",
    "costPrice": 14,
    "minPrice": 17,
    "maxPrice": 18,
    "price": 17,
    "wholesalePrice": 14,
    "sellingPrice": 17,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000032,
    "name": "ලුණු කැට 1kg",
    "category": "General",
    "supplier": "ලලිත්",
    "costPrice": 100,
    "minPrice": 115,
    "maxPrice": 130,
    "price": 115,
    "wholesalePrice": 100,
    "sellingPrice": 115,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000033,
    "name": "ලොලිපොප් 10",
    "category": "General",
    "supplier": "මිරිගම",
    "costPrice": 600,
    "minPrice": 750,
    "maxPrice": 850,
    "price": 750,
    "wholesalePrice": 600,
    "sellingPrice": 750,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000034,
    "name": "සැමන්",
    "category": "General",
    "supplier": "මල්ටි",
    "costPrice": 450,
    "minPrice": 490,
    "maxPrice": 510,
    "price": 490,
    "wholesalePrice": 450,
    "sellingPrice": 490,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000035,
    "name": "නූඩ්ල්ස් 5kg",
    "category": "General",
    "supplier": "තිලිණි",
    "costPrice": 1200,
    "minPrice": 1300,
    "maxPrice": 1350,
    "price": 1300,
    "wholesalePrice": 1200,
    "sellingPrice": 1300,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000036,
    "name": "පපඩම්-ලොකු 1kg",
    "category": "General",
    "supplier": "තිලිණි",
    "costPrice": 520,
    "minPrice": 600,
    "maxPrice": 650,
    "price": 600,
    "wholesalePrice": 520,
    "sellingPrice": 600,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000037,
    "name": "මිරිස්කුඩු 50g",
    "category": "General",
    "supplier": "අනූෂා",
    "costPrice": 63.75,
    "minPrice": 70,
    "maxPrice": 75,
    "price": 70,
    "wholesalePrice": 63.75,
    "sellingPrice": 70,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000038,
    "name": "එනසාල්",
    "category": "General",
    "supplier": "අනූෂා",
    "costPrice": 960,
    "minPrice": 1000,
    "maxPrice": 1100,
    "price": 1000,
    "wholesalePrice": 960,
    "sellingPrice": 1000,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000039,
    "name": "උම්බලකඩ",
    "category": "General",
    "supplier": "අනූෂා",
    "costPrice": 712.5,
    "minPrice": 800,
    "maxPrice": 850,
    "price": 800,
    "wholesalePrice": 712.5,
    "sellingPrice": 800,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000040,
    "name": "තේ කොල 50g",
    "category": "General",
    "supplier": "ලලිත්",
    "costPrice": 60,
    "minPrice": 75,
    "maxPrice": 85,
    "price": 75,
    "wholesalePrice": 60,
    "sellingPrice": 75,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000041,
    "name": "ලුණු කුඩු 400g",
    "category": "General",
    "supplier": "ලලිත්",
    "costPrice": 58,
    "minPrice": 75,
    "maxPrice": 85,
    "price": 75,
    "wholesalePrice": 58,
    "sellingPrice": 75,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000042,
    "name": "නූඩ්ල්ස් 200g",
    "category": "General",
    "supplier": "හිරු",
    "costPrice": 120,
    "minPrice": 145,
    "maxPrice": 150,
    "price": 145,
    "wholesalePrice": 120,
    "sellingPrice": 145,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000043,
    "name": "කොච්චි",
    "category": "General",
    "supplier": "දේදුණු",
    "costPrice": 540,
    "minPrice": 600,
    "maxPrice": 650,
    "price": 600,
    "wholesalePrice": 540,
    "sellingPrice": 600,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000044,
    "name": "බබල් ගම්",
    "category": "General",
    "supplier": "ලලිත්",
    "costPrice": 300,
    "minPrice": 380,
    "maxPrice": 420,
    "price": 380,
    "wholesalePrice": 300,
    "sellingPrice": 380,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000045,
    "name": "සෝයා 160",
    "category": "General",
    "supplier": "හිරු",
    "costPrice": 110,
    "minPrice": 130,
    "maxPrice": 140,
    "price": 130,
    "wholesalePrice": 110,
    "sellingPrice": 130,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000046,
    "name": "පපඩම්-බේබි 1kg",
    "category": "General",
    "supplier": "තිලිණි",
    "costPrice": 520,
    "minPrice": 600,
    "maxPrice": 650,
    "price": 600,
    "wholesalePrice": 520,
    "sellingPrice": 600,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000047,
    "name": "ගී බිස්කට්",
    "category": "General",
    "supplier": "රන්මල්",
    "costPrice": 450,
    "minPrice": 580,
    "maxPrice": 630,
    "price": 580,
    "wholesalePrice": 450,
    "sellingPrice": 580,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000048,
    "name": "සෝයා කූනිස්සො",
    "category": "General",
    "supplier": "හිරු",
    "costPrice": 45,
    "minPrice": 58,
    "maxPrice": 70,
    "price": 58,
    "wholesalePrice": 45,
    "sellingPrice": 58,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1780000000049,
    "name": "බීඩී",
    "category": "General",
    "supplier": "හෙට්ටි",
    "costPrice": 2300,
    "minPrice": 2700,
    "maxPrice": 3200,
    "price": 2700,
    "wholesalePrice": 2300,
    "sellingPrice": 2700,
    "stock": 0,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "availableStock": 0,
    "myStock": 0,
    "returnStock": 0
  },
  {
    "id": 1782914438101,
    "name": "ජෙලි 10",
    "category": "General",
    "supplier": "රන්මල්",
    "costPrice": 450,
    "minPrice": 580,
    "maxPrice": 620,
    "price": 580,
    "stock": 12,
    "availableStock": 21,
    "myStock": 21,
    "wholesalePrice": 450,
    "sellingPrice": 580,
    "mainStock": 12,
    "mainStockQty": 12,
    "stockInMain": 12,
    "returnStock": 0
  },
  {
    "id": 1782914540166,
    "name": "ජෙලි 20",
    "category": "General",
    "supplier": "රන්මල්",
    "costPrice": 420,
    "minPrice": 530,
    "maxPrice": 580,
    "price": 530,
    "stock": 0,
    "availableStock": 0,
    "myStock": 0,
    "wholesalePrice": 420,
    "sellingPrice": 530,
    "mainStock": 0,
    "mainStockQty": 0,
    "stockInMain": 0,
    "returnStock": 0
  },
  {
    "id": 1782914589202,
    "name": "ජෙලි 50",
    "category": "General",
    "supplier": "රන්මල්",
    "costPrice": 450,
    "minPrice": 580,
    "maxPrice": 620,
    "price": 580,
    "stock": 7,
    "availableStock": 14,
    "myStock": 14,
    "wholesalePrice": 450,
    "sellingPrice": 580,
    "mainStock": 7,
    "mainStockQty": 7,
    "stockInMain": 7,
    "returnStock": 0
  },
  {
    "id": 1782957431238,
    "name": "මුදු බයිට්",
    "category": "General",
    "supplier": "දේදුණු",
    "costPrice": 530,
    "minPrice": 600,
    "maxPrice": 650,
    "price": 600,
    "stock": 6,
    "availableStock": 10,
    "myStock": 10,
    "wholesalePrice": 530,
    "sellingPrice": 600,
    "mainStock": 6,
    "mainStockQty": 6,
    "stockInMain": 6,
    "returnStock": 0
  },
  {
    "id": 1783839707052,
    "name": "චොකලට් බිස්කට් 100",
    "category": "Biscuits",
    "supplier": "දබුල්ල",
    "costPrice": 75,
    "minPrice": 85,
    "maxPrice": 90,
    "price": 85,
    "stock": 68,
    "availableStock": 28,
    "myStock": 128,
    "wholesalePrice": 75,
    "sellingPrice": 85,
    "mainStock": 68,
    "mainStockQty": 68,
    "stockInMain": 68,
    "returnStock": 0
  },
  {
    "id": 1783839785790,
    "name": "ෂෝටීස් බිස්කට් ",
    "category": "Biscuits",
    "supplier": "දබුල්ල",
    "costPrice": 75,
    "minPrice": 115,
    "maxPrice": 130,
    "price": 115,
    "stock": 24,
    "availableStock": 0,
    "myStock": 0,
    "wholesalePrice": 75,
    "sellingPrice": 115,
    "mainStock": 24,
    "mainStockQty": 24,
    "stockInMain": 24,
    "returnStock": 0
  },
  {
    "id": 1783839861302,
    "name": "පොල් ටොෆී ",
    "category": "Sweets",
    "supplier": "රන්මල්",
    "costPrice": 450,
    "minPrice": 550,
    "maxPrice": 620,
    "price": 550,
    "stock": 8,
    "availableStock": 0,
    "myStock": 0,
    "wholesalePrice": 450,
    "sellingPrice": 550,
    "mainStock": 8,
    "mainStockQty": 8,
    "stockInMain": 8,
    "returnStock": 0
  },
  {
    "id": 1783839911018,
    "name": "කටු බයිට්",
    "category": "Snacks",
    "supplier": "දේදුණු",
    "costPrice": 520,
    "minPrice": 580,
    "maxPrice": 630,
    "price": 580,
    "stock": 2,
    "availableStock": 2,
    "myStock": 2,
    "wholesalePrice": 520,
    "sellingPrice": 580,
    "mainStock": 2,
    "mainStockQty": 2,
    "stockInMain": 2,
    "returnStock": 0
  },
  {
    "id": 1783839978348,
    "name": "මාස්මෙලෝස් 20",
    "category": "Sweets",
    "supplier": "ලක්රස",
    "costPrice": 650,
    "minPrice": 750,
    "maxPrice": 830,
    "price": 750,
    "stock": 29,
    "availableStock": 20,
    "myStock": 20,
    "wholesalePrice": 650,
    "sellingPrice": 750,
    "mainStock": 29,
    "mainStockQty": 29,
    "stockInMain": 29,
    "returnStock": 0
  },
  {
    "id": 1783956882790,
    "name": "ගල් මස්කට්",
    "category": "Sweets",
    "supplier": "දබුල්ල",
    "costPrice": 650,
    "minPrice": 780,
    "maxPrice": 850,
    "price": 780,
    "stock": 24,
    "availableStock": 5,
    "myStock": 5,
    "wholesalePrice": 650,
    "sellingPrice": 780,
    "mainStock": 24,
    "mainStockQty": 24,
    "stockInMain": 24,
    "returnStock": 0
  },
  {
    "id": 1783956913252,
    "name": "තෙල් මස්කට්",
    "category": "Sweets",
    "supplier": "දබුල්ල",
    "costPrice": 650,
    "minPrice": 780,
    "maxPrice": 850,
    "price": 780,
    "stock": 23,
    "availableStock": 6,
    "myStock": 6,
    "wholesalePrice": 650,
    "sellingPrice": 780,
    "mainStock": 23,
    "mainStockQty": 23,
    "stockInMain": 23,
    "returnStock": 0
  },
  {
    "id": 1785318334414,
    "name": "මඤ්ඤොක්කා",
    "category": "Snacks",
    "supplier": "දේදුණු",
    "costPrice": 780,
    "minPrice": 850,
    "maxPrice": 860,
    "price": 850,
    "stock": 4,
    "availableStock": 3,
    "myStock": 3,
    "wholesalePrice": 780,
    "sellingPrice": 850,
    "mainStock": 4,
    "mainStockQty": 4,
    "stockInMain": 4,
    "returnStock": 0
  },
  {
    "id": 1785736874520,
    "name": "අයිස්කෝන්",
    "category": "Sweets",
    "supplier": "රන්මල්",
    "costPrice": 360,
    "minPrice": 450,
    "maxPrice": 500,
    "price": 450,
    "stock": 6,
    "availableStock": 8,
    "myStock": 8,
    "wholesalePrice": 360,
    "sellingPrice": 450,
    "mainStock": 6,
    "mainStockQty": 6,
    "stockInMain": 6,
    "returnStock": 0
  },
  {
    "id": 1785829454031,
    "name": "වේපස් බිස්කට්",
    "category": "Biscuits",
    "supplier": "",
    "costPrice": 320,
    "minPrice": 370,
    "maxPrice": 420,
    "price": 370,
    "stock": 14,
    "availableStock": 5,
    "myStock": 5,
    "wholesalePrice": 320,
    "sellingPrice": 370,
    "mainStock": 14,
    "mainStockQty": 14,
    "stockInMain": 14,
    "returnStock": 0
  },
  {
    "id": 1786073488999,
    "name": "කිරිටොෆි-5",
    "category": "Sweets",
    "supplier": "රන්මල්",
    "costPrice": 450,
    "minPrice": 580,
    "maxPrice": 630,
    "price": 580,
    "stock": 20,
    "availableStock": 0,
    "myStock": 0,
    "wholesalePrice": 450,
    "sellingPrice": 580,
    "mainStock": 20,
    "mainStockQty": 20,
    "stockInMain": 20,
    "returnStock": 0
  },
  {
    "id": 1786073703244,
    "name": "ජෙලි ස්ටික්",
    "category": "Sweets",
    "supplier": "රන්මල්",
    "costPrice": 600,
    "minPrice": 750,
    "maxPrice": 830,
    "price": 750,
    "stock": 10,
    "availableStock": 0,
    "myStock": 0,
    "wholesalePrice": 600,
    "sellingPrice": 750,
    "mainStock": 10,
    "mainStockQty": 10,
    "stockInMain": 10,
    "returnStock": 0
  },
  {
    "id": 1786692515952,
    "name": "වයින් බිස්කට් ",
    "category": "Biscuits",
    "supplier": "දබුල්ල",
    "costPrice": 650,
    "minPrice": 850,
    "maxPrice": 900,
    "price": 850,
    "stock": 5,
    "availableStock": 3,
    "myStock": 3,
    "wholesalePrice": 650,
    "sellingPrice": 850,
    "mainStock": 5,
    "mainStockQty": 5,
    "stockInMain": 5,
    "returnStock": 0
  },
  {
    "id": 1786768395581,
    "name": "සෝයා 500g",
    "category": "Grocery",
    "supplier": "හිරු",
    "costPrice": 200,
    "minPrice": 250,
    "maxPrice": 270,
    "price": 250,
    "stock": 5,
    "availableStock": 5,
    "myStock": 5,
    "wholesalePrice": 200,
    "sellingPrice": 250,
    "mainStock": 5,
    "mainStockQty": 5,
    "stockInMain": 5,
    "returnStock": 0
  },
  {
    "id": 1786768941263,
    "name": "සුදුලූනූ ",
    "category": "Grocery",
    "supplier": "දේදුණු",
    "costPrice": 540,
    "minPrice": 600,
    "maxPrice": 650,
    "price": 600,
    "stock": 11,
    "availableStock": 15,
    "myStock": 15,
    "wholesalePrice": 540,
    "sellingPrice": 600,
    "mainStock": 11,
    "mainStockQty": 11,
    "stockInMain": 11,
    "returnStock": 0
  }
];

export const getAdminInventory = (): any[] => {
  const orgId = getActiveOrgId();
  try {
    const stored = localStorage.getItem(`bizflow_${orgId}_admin_inventory_v1`) || 
                   localStorage.getItem(`bizflow_MYM-BIZFLOW_admin_inventory_v1`) || 
                   localStorage.getItem(`bizflow_default_admin_inventory_v1`) || 
                   localStorage.getItem('bizflow_admin_inventory_v1') ||
                   localStorage.getItem(`bizflow_${orgId}_inventory_v1`) ||
                   localStorage.getItem('bizflow_inventory_v1');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length >= REAL_INVENTORY.length) {
        const cleanItems = parsed.filter((item: any) => 
          !item.name?.includes('Munchee Super') && 
          !item.name?.includes('Munchee Lemon') && 
          !item.name?.includes('Anchor Milk') && 
          !item.name?.includes('Watawala Tea')
        );
        if (cleanItems.length >= REAL_INVENTORY.length) return cleanItems;
      }
    }
  } catch (e) {}

  safeSetItem(`bizflow_${orgId}_admin_inventory_v1`, JSON.stringify(REAL_INVENTORY));
  safeSetItem('bizflow_admin_inventory_v1', JSON.stringify(REAL_INVENTORY));
  safeSetItem(`bizflow_${orgId}_inventory_v1`, JSON.stringify(REAL_INVENTORY));
  safeSetItem('bizflow_inventory_v1', JSON.stringify(REAL_INVENTORY));
  return REAL_INVENTORY;
};

export const DEFAULT_CUSTOMERS: any[] = [];

export const getCustomers = (): any[] => {
  const orgId = getActiveOrgId();
  try {
    const stored = localStorage.getItem(`bizflow_${orgId}_customers_v1`) || 
                   localStorage.getItem(`bizflow_MYM-BIZFLOW_customers_v1`) || 
                   localStorage.getItem('bizflow_customers_v1');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {}

  return [];
};

export const DEFAULT_SUPPLIERS = Array.from(new Set(REAL_INVENTORY.map(i => i.supplier).filter(Boolean))).map((s, idx) => ({
  id: `sup_${idx + 1}`,
  name: s,
  contactPerson: s,
  phone: '',
  category: 'General'
}));

export const getSuppliers = (): any[] => {
  const orgId = getActiveOrgId();
  try {
    const stored = localStorage.getItem(`bizflow_${orgId}_suppliers_v1`) || 
                   localStorage.getItem(`bizflow_MYM-BIZFLOW_suppliers_v1`) || 
                   localStorage.getItem('bizflow_suppliers_v1');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  return DEFAULT_SUPPLIERS;
};

export const DEFAULT_SALES: any[] = [];

export const getSalesHistory = (): any[] => {
  const orgId = getActiveOrgId();
  const keys = [
    `bizflow_${orgId}_sales_v1`,
    `bizflow_MYM-BIZFLOW_sales_v1`,
    `bizflow_default_sales_v1`,
    `bizflow_sales_v1`,
    `bizflow_${orgId}_sales`,
    `bizflow_MYM-BIZFLOW_sales`,
    `bizflow_sales`
  ];

  const salesMap = new Map<string, any>();
  keys.forEach(k => {
    try {
      const stored = localStorage.getItem(k);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsed.forEach((s: any) => {
            if (s) {
              const key = String(s.id || s.billNo || s.invoiceNo || s.transactionId || s.txId || (s.date && s.customer ? `${s.date}_${s.customer}_${s.total || s.netAmount}` : ''));
              if (key && !salesMap.has(key)) {
                salesMap.set(key, s);
              }
            }
          });
        }
      }
    } catch (e) {}
  });

  return Array.from(salesMap.values());
};

export const saveCustomers = (customers: any[]) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(customers));
  safeSetItem(`bizflow_MYM-BIZFLOW_customers_v1`, JSON.stringify(customers));
  safeSetItem('bizflow_customers_v1', JSON.stringify(customers));
  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc, autoSyncUnsyncedData} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_customers`), { 
      data: customers,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
    autoSyncUnsyncedData();
  });
};

export const saveSuppliers = (suppliers: any[]) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_suppliers_v1`, JSON.stringify(suppliers));
  safeSetItem(`bizflow_MYM-BIZFLOW_suppliers_v1`, JSON.stringify(suppliers));
  safeSetItem('bizflow_suppliers_v1', JSON.stringify(suppliers));
  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc, autoSyncUnsyncedData} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_suppliers`), { 
      data: suppliers,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
    autoSyncUnsyncedData();
  });
};

export const saveSalesHistory = (sales: any[]) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(sales));
  safeSetItem(`bizflow_MYM-BIZFLOW_sales_v1`, JSON.stringify(sales));
  safeSetItem('bizflow_sales_v1', JSON.stringify(sales));
  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc, autoSyncUnsyncedData} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_sales`), { 
      data: sales,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
    autoSyncUnsyncedData();
  });
};

export const saveAdminInventory = (inventory: any[]) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_admin_inventory_v1`, JSON.stringify(inventory));
  safeSetItem(`bizflow_MYM-BIZFLOW_admin_inventory_v1`, JSON.stringify(inventory));
  safeSetItem(`bizflow_admin_inventory_v1`, JSON.stringify(inventory));
  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_inventory`), { 
      data: inventory,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
  });
};

export const getMainReturnStock = (): any[] => {
  const orgId = getActiveOrgId();
  try {
    const stored = localStorage.getItem(`bizflow_${orgId}_main_return_stock_v1`) || 
                   localStorage.getItem(`bizflow_MYM-BIZFLOW_main_return_stock_v1`) || 
                   localStorage.getItem(`bizflow_default_main_return_stock_v1`) || 
                   localStorage.getItem('bizflow_main_return_stock_v1');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return [];
};

export const saveMainReturnStock = (stock: any[]) => {
  const orgId = getActiveOrgId();
  safeSetItem(`bizflow_${orgId}_main_return_stock_v1`, JSON.stringify(stock));
  safeSetItem(`bizflow_main_return_stock_v1`, JSON.stringify(stock));
  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc} ]) => {
    // Legacy sync
    safeSetDoc(doc(db, 'system', `org_${orgId}_returns`), { 
      data: stock,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
    
    // Individual docs
    for (const item of stock) {
      safeSetDoc(doc(db, 'main_return_stock', item.id), {
        ...item,
        organizationId: orgId,
        updatedAt: Date.now()
      }, { merge: true });
    }
  });
};

export const syncRequestsFromCloud = async () => {
  const orgId = getActiveOrgId();
  try {
    const [{ db }, { doc, getDoc }] = await Promise.all([import('./sync'), import('firebase/firestore')]);
    const aiDoc = await getDoc(doc(db, 'system', `org_${orgId}_aiactions`));
    if (aiDoc.exists() && aiDoc.data().data) {
      safeSetItem(`bizflow_${orgId}_aiactions_v1`, JSON.stringify(aiDoc.data().data));
      return aiDoc.data().data;
    }
  } catch (e) {
    console.warn('Sync requests notice:', e);
  }
  return null;
};

export const syncAllFromCloud = async () => {
  const orgId = getActiveOrgId();
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  try {
    const [{ db, pushUnsyncedLocalDataToCloud, fetchTableData, isQuotaPaused }, { doc, getDoc }] = await Promise.all([
      import('./sync'), 
      import('firebase/firestore')
    ]);

    if (isQuotaPaused()) return false;
    
    // 1. Push any queued offline transactions
    await pushUnsyncedLocalDataToCloud();
    
    // 2. Fetch single targeted system doc for users
    try {
      let uDoc = await getDoc(doc(db, 'system', `org_${orgId}_users`));
      if (!uDoc.exists() && orgId !== 'MYM-BIZFLOW') {
        uDoc = await getDoc(doc(db, 'system', `org_MYM-BIZFLOW_users`));
      }
      if (!uDoc.exists() && orgId !== 'default') {
        uDoc = await getDoc(doc(db, 'system', `org_default_users`));
      }
      if (uDoc.exists() && uDoc.data()?.data) {
        const arr = uDoc.data().data;
        if (Array.isArray(arr) && arr.length > 0) {
          safeSetItem(`bizflow_${orgId}_users_v2`, JSON.stringify(arr));
          safeSetItem(`bizflow_MYM-BIZFLOW_users_v2`, JSON.stringify(arr));
          safeSetItem(`bizflow_users_v2`, JSON.stringify(arr));
        }
      }
    } catch (e) {}

    // 3. Fetch single targeted system doc for attendance
    try {
      const attendanceDoc = await getDoc(doc(db, 'system', `org_${orgId}_attendance`));
      if (attendanceDoc.exists() && attendanceDoc.data()?.data) {
        safeSetItem(`bizflow_${orgId}_attendance_v1`, JSON.stringify(attendanceDoc.data().data));
      }
    } catch (e) {}

    // 4. Fetch single targeted system doc for AI Action requests
    try {
      const aiDoc = await getDoc(doc(db, 'system', `org_${orgId}_aiactions`));
      if (aiDoc.exists() && aiDoc.data()?.data) {
        safeSetItem(`bizflow_${orgId}_aiactions_v1`, JSON.stringify(aiDoc.data().data));
      }
    } catch (e) {}

    // 5. Fetch single targeted system doc for organization settings
    try {
      const settingsDoc = await getDoc(doc(db, 'system', `org_${orgId}_settings`));
      if (settingsDoc.exists()) {
        safeSetItem(`bizflow_${orgId}_settings`, JSON.stringify(settingsDoc.data()));
      }
    } catch (e) {}
    
    // 6. Fetch single targeted system doc for Admin Inventory
    try {
      let invDoc = await getDoc(doc(db, 'system', `org_${orgId}_inventory`));
      if (!invDoc.exists() && orgId !== 'MYM-BIZFLOW') {
        invDoc = await getDoc(doc(db, 'system', `org_MYM-BIZFLOW_inventory`));
      }
      if (!invDoc.exists() && orgId !== 'default') {
        invDoc = await getDoc(doc(db, 'system', `org_default_inventory`));
      }
      if (invDoc.exists() && invDoc.data()?.data && Array.isArray(invDoc.data().data)) {
        const invArr = invDoc.data().data;
        safeSetItem(`bizflow_${orgId}_admin_inventory_v1`, JSON.stringify(invArr));
        safeSetItem('bizflow_MYM-BIZFLOW_admin_inventory_v1', JSON.stringify(invArr));
        safeSetItem('bizflow_admin_inventory_v1', JSON.stringify(invArr));
      }
    } catch (e) {}

    // 7. Fetch single targeted system doc for Main Return Stock
    try {
      let retDoc = await getDoc(doc(db, 'system', `org_${orgId}_returns`));
      if (!retDoc.exists() && orgId !== 'MYM-BIZFLOW') {
        retDoc = await getDoc(doc(db, 'system', `org_MYM-BIZFLOW_returns`));
      }
      if (retDoc.exists() && retDoc.data()?.data) {
        safeSetItem(`bizflow_${orgId}_main_return_stock_v1`, JSON.stringify(retDoc.data().data));
        safeSetItem('bizflow_main_return_stock_v1', JSON.stringify(retDoc.data().data));
      }
    } catch (e) {}

    // 8. Delta-sync essential collections (only fetch new or modified records)
    const [sales, settlements, expenses, customers, suppliers, returnStock, invColData, userColData] = await Promise.all([
      fetchTableData('sales', { limitCount: 500 }),
      fetchTableData('settlements', { limitCount: 500 }),
      fetchTableData('expenses', { limitCount: 500 }),
      fetchTableData('customers', { limitCount: 500 }),
      fetchTableData('suppliers', { limitCount: 500 }),
      fetchTableData('main_return_stock', { limitCount: 500 }),
      fetchTableData('inventory', { limitCount: 500 }),
      fetchTableData('users', { limitCount: 200 })
    ]);

    if (Array.isArray(sales) && sales.length > 0) {
      const currentSales = getSalesHistory();
      const salesMap = new Map<string, any>();
      currentSales.forEach(s => {
        const key = String(s.id || s.billNo || s.invoiceNo || s.transactionId || s.txId || Math.random());
        salesMap.set(key, s);
      });
      sales.forEach(s => {
        const key = String(s.id || s.billNo || s.invoiceNo || s.transactionId || s.txId || Math.random());
        if (!salesMap.has(key)) {
          salesMap.set(key, s);
        }
      });
      saveSalesHistory(Array.from(salesMap.values()));
    }

    if (Array.isArray(userColData) && userColData.length > 0) {
      const currentUsers = getUsers();
      const userMap = new Map<string, SystemUser>();
      currentUsers.forEach(u => {
        const key = u.id || `user_${u.name}_${u.role}`;
        userMap.set(key, u);
      });
      userColData.forEach((u: any) => {
        if (u && (u.id || u.name)) {
          const key = u.id || `user_${u.name}_${u.role}`;
          userMap.set(key, u);
        }
      });
      const mergedUsers = Array.from(userMap.values());
      saveUsers(mergedUsers);
    }

    if (Array.isArray(customers) && customers.length > 0) {
      const currentCust = getCustomers();
      const custMap = new Map<string, any>();
      currentCust.forEach(c => {
        const key = String(c.id || c.name || Math.random());
        custMap.set(key, c);
      });
      customers.forEach(c => {
        const key = String(c.id || c.name || Math.random());
        if (!custMap.has(key)) custMap.set(key, c);
      });
      saveCustomers(Array.from(custMap.values()));
    }

    if (Array.isArray(suppliers) && suppliers.length > 0) {
      const currentSupp = getSuppliers();
      const suppMap = new Map<string, any>();
      currentSupp.forEach(s => {
        const key = String(s.id || s.name || Math.random());
        suppMap.set(key, s);
      });
      suppliers.forEach(s => {
        const key = String(s.id || s.name || Math.random());
        if (!suppMap.has(key)) suppMap.set(key, s);
      });
      saveSuppliers(Array.from(suppMap.values()));
    }

    if (Array.isArray(invColData) && invColData.length > 0) {
      const existing = getAdminInventory();
      if (!existing || existing.length === 0) {
        saveAdminInventory(invColData);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'all' } }));
    }

    return true;
  } catch (e) {
    console.warn('Sync cloud notice:', e);
    return false;
  }
};

export const syncRepFromCloud = async (repId: string) => {
  const orgId = getActiveOrgId();
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const [{ db, isQuotaPaused }, { doc, getDoc }] = await Promise.all([
      import('./sync'), 
      import('firebase/firestore')
    ]);
    if (isQuotaPaused()) return;
    const repInvDoc = await getDoc(doc(db, 'system', `org_${orgId}_repinv_${repId}`));
    if (repInvDoc.exists() && repInvDoc.data()?.data) {
      safeSetItem(`bizflow_${orgId}_repinv_${repId}`, JSON.stringify(repInvDoc.data().data));
    }
  } catch (e) {
    console.warn('Sync rep data notice:', e);
  }
};

export const listenToCloudChanges = async (callback: (table: string, data: any) => void) => {
  // Realtime listeners disabled to reduce quota usage.
  return () => {};
};

export const listenToRepInventory = async (repId: string, callback: (inv: RepInventoryItem[]) => void) => {
  // Realtime listeners disabled to reduce quota usage.
  return () => {};
};

// --- STORAGE HEALTH & HIGH-SPEED CACHE PURGE UTILITY ---
export const getStorageUsageKB = (): number => {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  let totalBytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key) || '';
        totalBytes += (key.length + val.length) * 2; // UTF-16
      }
    }
  } catch (e) {}
  return Math.round(totalBytes / 1024);
};

export const purgeAppCache = async (): Promise<{ freedKB: number }> => {
  const before = getStorageUsageKB();
  
  // 1. Purge bloated Firestore IndexedDB databases if any exist
  if (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') {
    try {
      if (window.indexedDB.databases) {
        const dbs = await window.indexedDB.databases();
        dbs.forEach((dbInfo) => {
          if (dbInfo.name && (dbInfo.name.startsWith('firestore') || dbInfo.name.startsWith('firebase'))) {
            try {
              window.indexedDB.deleteDatabase(dbInfo.name);
            } catch (err) {}
          }
        });
      }
    } catch (e) {}
  }

  // 2. Clean temporary/stale localStorage keys while preserving real business data
  if (typeof window !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        // Identify stale temporary logs, debug data or orphan markers
        if (
          key.startsWith('bizflow_temp_') ||
          key.includes('quota_exhausted') ||
          key.startsWith('loglevel:') ||
          key === 'bizflow_network_logs' ||
          key === 'bizflow_network_logs_v1'
        ) {
          keysToRemove.push(key);
        } else if (key.endsWith('_network_logs_v1')) {
          // Compact organization network logs to max 20 entries
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const logs = JSON.parse(raw);
              if (Array.isArray(logs) && logs.length > 20) {
                safeSetItem(key, JSON.stringify(logs.slice(0, 20)));
              }
            }
          } catch (err) {}
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }

  const after = getStorageUsageKB();
  return { freedKB: Math.max(0, before - after) };
};

// --- Customer Debt Cascading & Persistence Suite ---
export interface CustomerDebtRecalcResult {
  newAllSales: any[];
  newAllCustomers: any[];
  updatedSalesForSync: any[];
  updatedCustomerForSync: any | null;
  finalCustomerBalance: number;
}

/**
 * Re-chains all transactions for a given customer in chronological order.
 * Ensures previousBalance -> addedCredit / payment -> newBalance -> remainingBalance
 * cascades correctly across past, present, and future transactions.
 */
export function recalculateCustomerDebtChain(
  customerName: string,
  allSales: any[],
  allCustomers: any[],
  manualAnchorSaleId?: string,
  manualAnchorNewBalance?: number,
  manualCustomerBalance?: number
): CustomerDebtRecalcResult {
  const normTargetName = (customerName || '').toLowerCase().trim();
  if (!normTargetName) {
    return {
      newAllSales: allSales,
      newAllCustomers: allCustomers,
      updatedSalesForSync: [],
      updatedCustomerForSync: null,
      finalCustomerBalance: 0
    };
  }

  const getEpoch = (s: any) => new Date(s.createdAt || s.date || 0).getTime() || 0;
  
  const customerSales: any[] = [];
  const otherSales: any[] = [];
  
  (allSales || []).forEach(s => {
    if (s && s.status !== 'cancelled' && (s.customer || '').toLowerCase().trim() === normTargetName) {
      customerSales.push({ ...s });
    } else {
      otherSales.push(s);
    }
  });

  // Sort chronological ascending (oldest first)
  customerSales.sort((a, b) => getEpoch(a) - getEpoch(b));

  const updatedSalesForSync: any[] = [];
  let runningBalance = 0;

  const targetCust = (allCustomers || []).find(c => (c.name || '').toLowerCase().trim() === normTargetName);

  customerSales.forEach((sale, index) => {
    let prevBal = runningBalance;
    if (index === 0) {
      if (sale.previousBalance !== undefined && !isNaN(Number(sale.previousBalance))) {
        prevBal = Number(sale.previousBalance);
      } else if (sale.initialCredit !== undefined && !isNaN(Number(sale.initialCredit))) {
        prevBal = Number(sale.initialCredit);
      }
    }

    sale.previousBalance = prevBal;

    const isAnchor = manualAnchorSaleId && (String(sale.id) === String(manualAnchorSaleId) || String(sale.docId) === String(manualAnchorSaleId));
    
    if (isAnchor && manualAnchorNewBalance !== undefined && !isNaN(manualAnchorNewBalance)) {
      sale.newBalance = manualAnchorNewBalance;
      sale.remainingBalance = manualAnchorNewBalance;
      runningBalance = manualAnchorNewBalance;
    } else {
      if (sale.mode === 'credit') {
        const creditPaid = Number(sale.creditReceivedAmount || sale.partialAmount || sale.total || 0);
        sale.newBalance = Math.max(0, prevBal - creditPaid);
        sale.remainingBalance = sale.newBalance;
        runningBalance = sale.newBalance;
      } else {
        let addedCredit = 0;
        if (sale.addedCredit !== undefined && !isNaN(Number(sale.addedCredit))) {
          addedCredit = Number(sale.addedCredit);
        } else {
          const pt = (sale.paymentType || '').toLowerCase();
          const tot = Number(sale.total || 0);
          const part = Number(sale.partialAmount || 0);
          if (pt === 'credit') {
            addedCredit = tot;
          } else if (pt === 'half-payment') {
            addedCredit = Math.max(0, tot - part);
          } else if (pt === 'cash' || pt === 'cheque') {
            addedCredit = 0;
          } else {
            addedCredit = Math.max(0, tot - part);
          }
        }
        sale.addedCredit = addedCredit;
        sale.newBalance = prevBal + addedCredit;
        sale.remainingBalance = sale.newBalance;
        runningBalance = sale.newBalance;
      }
    }

    sale.updatedAt = new Date().toISOString();
    updatedSalesForSync.push(sale);
  });

  // If a direct manual customer balance was provided (e.g. from customer directory edit)
  if (manualCustomerBalance !== undefined && !isNaN(manualCustomerBalance)) {
    runningBalance = manualCustomerBalance;
    if (customerSales.length > 0 && !manualAnchorSaleId) {
      const lastSale = customerSales[customerSales.length - 1];
      lastSale.newBalance = manualCustomerBalance;
      lastSale.remainingBalance = manualCustomerBalance;
      lastSale.updatedAt = new Date().toISOString();
      if (!updatedSalesForSync.some(s => String(s.id) === String(lastSale.id))) {
        updatedSalesForSync.push(lastSale);
      }
    }
  }

  const newAllSales = [...customerSales, ...otherSales].sort((a, b) => getEpoch(b) - getEpoch(a));

  let finalCustomerBalance = runningBalance;
  if (customerSales.length === 0 && manualCustomerBalance !== undefined && !isNaN(manualCustomerBalance)) {
    finalCustomerBalance = manualCustomerBalance;
  } else if (customerSales.length === 0 && targetCust) {
    finalCustomerBalance = Number(targetCust.balance || 0);
  }

  let updatedCustomerForSync: any = null;
  const newAllCustomers = (allCustomers || []).map(c => {
    if ((c.name || '').toLowerCase().trim() === normTargetName) {
      const updated = {
        ...c,
        balance: finalCustomerBalance,
        updatedAt: Date.now()
      };
      updatedCustomerForSync = updated;
      return updated;
    }
    return c;
  });

  if (!targetCust && normTargetName) {
    const newCust = {
      id: 'cust_' + Date.now(),
      name: customerName.trim(),
      balance: finalCustomerBalance,
      updatedAt: Date.now(),
      createdAt: new Date().toISOString()
    };
    newAllCustomers.push(newCust);
    updatedCustomerForSync = newCust;
  }

  return {
    newAllSales,
    newAllCustomers,
    updatedSalesForSync,
    updatedCustomerForSync,
    finalCustomerBalance
  };
}

export function persistSalesAndCustomers(
  orgId: string,
  allSales: any[],
  allCustomers: any[],
  salesForSync: any[] = [],
  customerForSync: any = null
) {
  try {
    safeSetItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(allSales));
    safeSetItem(`bizflow_MYM-BIZFLOW_sales_v1`, JSON.stringify(allSales));
    safeSetItem('bizflow_sales_v1', JSON.stringify(allSales));
  } catch (e) {}

  try {
    safeSetItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(allCustomers));
    safeSetItem(`bizflow_MYM-BIZFLOW_customers_v1`, JSON.stringify(allCustomers));
    safeSetItem('bizflow_customers_v1', JSON.stringify(allCustomers));
  } catch (e) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: allSales } }));
    window.dispatchEvent(new CustomEvent('bizflow_sales_updated', { detail: { table: 'sales', data: allSales } }));
    window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'customers', data: allCustomers } }));
  }

  Promise.resolve().then(async () => {
    try {
      const { addToSyncQueue } = await import('./sync');
      if (customerForSync) {
        addToSyncQueue({ table: 'customers', action: 'update', data: customerForSync });
      }
      for (const s of salesForSync) {
        addToSyncQueue({ table: 'sales', action: 'update', data: s });
      }
    } catch (err) {
      console.warn("Sync queue registration notice:", err);
    }
  });
}

// Run light pruning on app initialization
if (typeof window !== 'undefined') {
  try {
    purgeAppCache();
  } catch (e) {}
}




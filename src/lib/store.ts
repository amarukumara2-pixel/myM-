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
          localStorage.setItem(`bizflow_${orgId}_settings`, JSON.stringify(parsed));
      }
      return parsed;
    }
  } catch (e) {}
  return { id: orgId, name: 'MYM BIZFLOW', printerSize: '58', printerFontSize: 13, printerFontWeight: 700, createdAt: Date.now() };
};

export const saveOrganizationSettings = (settings: OrganizationSettings) => {
  const orgId = getActiveOrgId();
  localStorage.setItem(`bizflow_${orgId}_settings`, JSON.stringify(settings));
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

export const getUsers = (): SystemUser[] => {
  const orgId = getActiveOrgId();
  try {
    const stored = localStorage.getItem(`bizflow_${orgId}_users_v2`) || 
                   localStorage.getItem(`bizflow_MYM-BIZFLOW_users_v2`) || 
                   localStorage.getItem(`bizflow_default_users_v2`) || 
                   localStorage.getItem(`bizflow_users_v2`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  
  // Default Admin User for this org
  const defaults: SystemUser[] = [{ 
    id: `admin_${orgId}`, 
    name: 'Admin', 
    pin: '1993', 
    role: 'admin',
    organizationId: orgId 
  }];
  localStorage.setItem(`bizflow_${orgId}_users_v2`, JSON.stringify(defaults));
  return defaults;
};


export const deleteSystemUser = (userId: string) => {
  const orgId = getActiveOrgId();
  const currentUsers = getUsers().filter(u => u.id !== userId);
  localStorage.setItem(`bizflow_${orgId}_users_v2`, JSON.stringify(currentUsers));
  
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
  localStorage.setItem(`bizflow_${orgId}_users_v2`, JSON.stringify(cleanUsers));
  
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
    localStorage.setItem(`bizflow_${orgId}_users_v2`, JSON.stringify(users));

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
  return [];
};

export const saveRepInventory = (repId: string, inv: RepInventoryItem[]) => {
  const orgId = getActiveOrgId();
  localStorage.setItem(`bizflow_${orgId}_repinv_${repId}`, JSON.stringify(inv));
  
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
  localStorage.setItem(`bizflow_${orgId}_attendance_v1`, JSON.stringify(records));
  
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
  localStorage.setItem(`bizflow_${orgId}_staff_attendance_v1`, JSON.stringify(newStaffList));
  
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

  localStorage.setItem(`bizflow_${orgId}_settlements_v1`, JSON.stringify(updatedRecords));

  const key = `bizflow_${orgId}_${repId}_settled_dates`;
  let existingDates: string[] = [];
  try {
    const raw = localStorage.getItem(key);
    existingDates = raw ? JSON.parse(raw) : [];
  } catch {}
  const updatedDates = Array.from(new Set([...existingDates, ...dates]));
  localStorage.setItem(key, JSON.stringify(updatedDates));

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
  localStorage.setItem(`bizflow_${orgId}_staff_attendance_v1`, JSON.stringify(records));
  
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
  localStorage.setItem(`bizflow_${orgId}_attendance_v1`, JSON.stringify(attList));

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
  localStorage.setItem(`bizflow_${orgId}_aiactions_v1`, JSON.stringify(requests));
  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_aiactions`), { 
      data: requests,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
  });
};

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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return [];
};

export const saveAdminInventory = (inventory: any[]) => {
  const orgId = getActiveOrgId();
  localStorage.setItem(`bizflow_${orgId}_admin_inventory_v1`, JSON.stringify(inventory));
  localStorage.setItem(`bizflow_MYM-BIZFLOW_admin_inventory_v1`, JSON.stringify(inventory));
  localStorage.setItem(`bizflow_admin_inventory_v1`, JSON.stringify(inventory));
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
  localStorage.setItem(`bizflow_${orgId}_main_return_stock_v1`, JSON.stringify(stock));
  localStorage.setItem(`bizflow_main_return_stock_v1`, JSON.stringify(stock));
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
      localStorage.setItem(`bizflow_${orgId}_aiactions_v1`, JSON.stringify(aiDoc.data().data));
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
      const uDoc = await getDoc(doc(db, 'system', `org_${orgId}_users`));
      if (uDoc.exists() && uDoc.data()?.data) {
        const arr = uDoc.data().data;
        if (Array.isArray(arr) && arr.length > 0) {
          localStorage.setItem(`bizflow_${orgId}_users_v2`, JSON.stringify(arr));
          localStorage.setItem(`bizflow_MYM-BIZFLOW_users_v2`, JSON.stringify(arr));
          localStorage.setItem(`bizflow_users_v2`, JSON.stringify(arr));
        }
      }
    } catch (e) {}

    // 3. Fetch single targeted system doc for attendance
    try {
      const attendanceDoc = await getDoc(doc(db, 'system', `org_${orgId}_attendance`));
      if (attendanceDoc.exists() && attendanceDoc.data()?.data) {
        localStorage.setItem(`bizflow_${orgId}_attendance_v1`, JSON.stringify(attendanceDoc.data().data));
      }
    } catch (e) {}

    // 4. Fetch single targeted system doc for AI Action requests
    try {
      const aiDoc = await getDoc(doc(db, 'system', `org_${orgId}_aiactions`));
      if (aiDoc.exists() && aiDoc.data()?.data) {
        localStorage.setItem(`bizflow_${orgId}_aiactions_v1`, JSON.stringify(aiDoc.data().data));
      }
    } catch (e) {}

    // 5. Fetch single targeted system doc for organization settings
    try {
      const settingsDoc = await getDoc(doc(db, 'system', `org_${orgId}_settings`));
      if (settingsDoc.exists()) {
        localStorage.setItem(`bizflow_${orgId}_settings`, JSON.stringify(settingsDoc.data()));
      }
    } catch (e) {}
    
    // 6. Fetch single targeted system doc for Admin Inventory
    try {
      const invDoc = await getDoc(doc(db, 'system', `org_${orgId}_inventory`));
      if (invDoc.exists() && invDoc.data()?.data && Array.isArray(invDoc.data().data)) {
        localStorage.setItem(`bizflow_${orgId}_admin_inventory_v1`, JSON.stringify(invDoc.data().data));
        localStorage.setItem('bizflow_admin_inventory_v1', JSON.stringify(invDoc.data().data));
      }
    } catch (e) {}

    // 7. Fetch single targeted system doc for Main Return Stock
    try {
      const retDoc = await getDoc(doc(db, 'system', `org_${orgId}_returns`));
      if (retDoc.exists() && retDoc.data()?.data) {
        localStorage.setItem(`bizflow_${orgId}_main_return_stock_v1`, JSON.stringify(retDoc.data().data));
        localStorage.setItem('bizflow_main_return_stock_v1', JSON.stringify(retDoc.data().data));
      }
    } catch (e) {}

    // 8. Delta-sync essential collections (only fetch new or modified records)
    await Promise.all([
      fetchTableData('sales', { limitCount: 40 }),
      fetchTableData('settlements', { limitCount: 30 }),
      fetchTableData('expenses', { limitCount: 30 }),
      fetchTableData('customers', { limitCount: 50 }),
      fetchTableData('suppliers', { limitCount: 30 }),
      fetchTableData('main_return_stock', { limitCount: 30 })
    ]);

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
      localStorage.setItem(`bizflow_${orgId}_repinv_${repId}`, JSON.stringify(repInvDoc.data().data));
    }
  } catch (e) {
    console.warn('Sync rep data notice:', e);
  }
};

export const listenToCloudChanges = async (callback: (table: string, data: any) => void) => {
  const orgId = getActiveOrgId();
  const [{ db, getSyncQueue, isQuotaPaused, markQuotaExceeded }, { doc, onSnapshot, collection, query, where }] = await Promise.all([import('./sync'), import('firebase/firestore')]);
  if (isQuotaPaused()) return () => {};
  
  const repInvUnsubs = new Map<string, () => void>();

  // Listen to common tables
  const unsubs = [
    onSnapshot(query(collection(db, 'users')), (snapshot) => {
      const dbUsers: any[] = [];
      snapshot.forEach(d => dbUsers.push({ ...d.data(), id: d.data().id || d.id, docId: d.id }));
      const filteredDbUsers = dbUsers.filter((item: any) => !item.organizationId || item.organizationId === orgId);
      // Merge with existing local storage to prevent wiping out legacy un-migrated users
      const localUsersStr = localStorage.getItem(`bizflow_${orgId}_users_v2`);
      let localUsers: any[] = [];
      try { if (localUsersStr) localUsers = JSON.parse(localUsersStr); } catch(e) {}
      
      const mergedMap = new Map<string, any>();
      localUsers.forEach(u => { if (u && u.id) mergedMap.set(String(u.id), u); });
      
      // Handle explicit deletions from other devices
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          mergedMap.delete(String(change.doc.id));
        }
      });

      filteredDbUsers.forEach(u => { if (u && u.id) mergedMap.set(String(u.id), u); });
      
      const finalUsers = Array.from(mergedMap.values());
      localStorage.setItem(`bizflow_${orgId}_users_v2`, JSON.stringify(finalUsers));
      
      // Attach real-time cloud listeners for all reps' loaded stock / inventory
      finalUsers.forEach((u: any) => {
        if (u && u.id && !repInvUnsubs.has(u.id)) {
          const unsubRep = onSnapshot(doc(db, 'system', `org_${orgId}_repinv_${u.id}`), (snap) => {
            if (snap.exists() && snap.data().data) {
              const invData = snap.data().data;
              localStorage.setItem(`bizflow_${orgId}_repinv_${u.id}`, JSON.stringify(invData));
              callback(`repinv_${u.id}`, invData);
              callback('repinv', { repId: u.id, data: invData });
            }
          }, () => {});
          repInvUnsubs.set(u.id, unsubRep);
        }
      });

      callback('users', finalUsers);
    }, (error) => {
      console.warn("Real-time sync inactive or denied for users. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(query(collection(db, 'suppliers')), (snapshot) => {
      const dbSups: any[] = [];
      snapshot.forEach(d => dbSups.push({ ...d.data(), id: d.data().id || d.id, docId: d.id }));
      const filteredDbSups = dbSups.filter((item: any) => !item.organizationId || item.organizationId === orgId);
      
      const localSupsStr = localStorage.getItem(`bizflow_${orgId}_suppliers_v1`) || localStorage.getItem('bizflow_suppliers_v1');
      let localSups: any[] = [];
      try { if (localSupsStr) localSups = JSON.parse(localSupsStr); } catch(e) {}
      
      const mergedMap = new Map<string, any>();
      localSups.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });
      
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          mergedMap.delete(String(change.doc.id));
        }
      });
      
      filteredDbSups.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });
      
      const finalSups = Array.from(mergedMap.values());
      localStorage.setItem(`bizflow_${orgId}_suppliers_v1`, JSON.stringify(finalSups));
      localStorage.setItem(`bizflow_suppliers_v1`, JSON.stringify(finalSups));
      callback('suppliers', finalSups);
    }, (error) => {
      console.warn("Real-time sync inactive or denied for suppliers. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(query(collection(db, 'sales')), (snapshot) => {
      const dbSales: any[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        const id = data.id || d.id;
        dbSales.push({ ...data, id, docId: d.id });
      });
      const filteredDbSales = dbSales.filter((item: any) => !item.organizationId || item.organizationId === orgId);
      
      const localSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
      let localSales: any[] = [];
      try { if (localSalesStr) localSales = JSON.parse(localSalesStr); } catch(e) {}
      
      const syncQueue = typeof getSyncQueue === 'function' ? getSyncQueue() : [];
      const deletedIds = new Set(
        syncQueue
          .filter(q => q.table === 'sales' && q.action === 'delete')
          .map(q => String(q.id))
      );

      const mergedMap = new Map<string, any>();
      
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          mergedMap.delete(String(change.doc.id));
        }
      });

      const getEpoch = (s: any) => {
        if (!s) return 0;
        if (s.updatedAt) return Number(s.updatedAt);
        if (s.createdAt) return new Date(s.createdAt).getTime();
        if (s.date) return new Date(s.date).getTime();
        if (s.timestamp) return Number(s.timestamp);
        return 0;
      };

      const processItem = (s: any) => {
        if (!s || !s.id) return;
        const sId = String(s.id);
        const sDocId = s.docId ? String(s.docId) : sId;
        if (deletedIds.has(sId) || deletedIds.has(sDocId)) return;

        if (!mergedMap.has(sId)) {
          mergedMap.set(sId, s);
        } else {
          const existing = mergedMap.get(sId);
          if (getEpoch(s) >= getEpoch(existing)) {
            mergedMap.set(sId, s);
          }
        }
      };

      filteredDbSales.forEach(processItem);
      localSales.forEach(processItem);
      
      const finalSales = Array.from(mergedMap.values()).sort((a, b) => getEpoch(b) - getEpoch(a));
      localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(finalSales));
      localStorage.setItem(`bizflow_sales_v1`, JSON.stringify(finalSales));
      callback('sales', finalSales);
    }, (error) => {
      console.warn("Real-time sync inactive or denied for sales. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(query(collection(db, 'customers')), (snapshot) => {
      const dbCusts: any[] = [];
      snapshot.forEach(d => dbCusts.push(d.data()));
      const filteredDbCusts = dbCusts.filter((item: any) => !item.organizationId || item.organizationId === orgId);
      
      const localCustsStr = localStorage.getItem(`bizflow_${orgId}_customers_v1`) || localStorage.getItem('bizflow_customers_v1');
      let localCusts: any[] = [];
      try { if (localCustsStr) localCusts = JSON.parse(localCustsStr); } catch(e) {}
      
      const mergedMap = new Map<string, any>();
      localCusts.forEach(c => { if (c && c.id) mergedMap.set(String(c.id), c); });
      
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          mergedMap.delete(String(change.doc.id));
        }
      });
      
      filteredDbCusts.forEach(c => { if (c && c.id) mergedMap.set(String(c.id), c); });
      
      const finalCusts = Array.from(mergedMap.values());
      localStorage.setItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(finalCusts));
      localStorage.setItem(`bizflow_customers_v1`, JSON.stringify(finalCusts));
      callback('customers', finalCusts);
    }, (error) => {
      console.warn("Real-time sync inactive or denied for customers. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(query(collection(db, 'expenses')), (snapshot) => {
      const dbExp: any[] = [];
      snapshot.forEach(d => dbExp.push(d.data()));
      const filteredDbExp = dbExp.filter((item: any) => !item.organizationId || item.organizationId === orgId);
      
      const localExpStr = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1');
      let localExp: any[] = [];
      try { if (localExpStr) localExp = JSON.parse(localExpStr); } catch(e) {}
      
      const mergedMap = new Map<string, any>();
      localExp.forEach(e => { if (e && e.id) mergedMap.set(String(e.id), e); });
      
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          mergedMap.delete(String(change.doc.id));
        }
      });
      
      filteredDbExp.forEach(e => { if (e && e.id) mergedMap.set(String(e.id), e); });
      
      const finalExp = Array.from(mergedMap.values());
      localStorage.setItem(`bizflow_${orgId}_expenses_v1`, JSON.stringify(finalExp));
      localStorage.setItem(`bizflow_expenses_v1`, JSON.stringify(finalExp));
      callback('expenses', finalExp);
    }, (error) => {
      console.warn("Real-time sync inactive or denied for expenses. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(query(collection(db, 'main_return_stock')), (snapshot) => {
      const dbReturns: any[] = [];
      snapshot.forEach(d => {
        const item = d.data();
        if (!item.organizationId || item.organizationId === orgId) {
          dbReturns.push({ ...item, id: item.id || d.id });
        }
      });
      localStorage.setItem(`bizflow_${orgId}_main_return_stock_v1`, JSON.stringify(dbReturns));
      localStorage.setItem(`bizflow_main_return_stock_v1`, JSON.stringify(dbReturns));
      callback('main_return_stock', dbReturns);
    }, (error) => {
      console.warn("Real-time sync inactive or denied for return stock. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(doc(db, 'system', `org_${orgId}_aiactions`), (snapshot) => {
      if (snapshot.exists() && snapshot.data().data) {
        localStorage.setItem(`bizflow_${orgId}_aiactions_v1`, JSON.stringify(snapshot.data().data));
        callback('aiactions', snapshot.data().data);
      }
    }, (error) => {
      console.warn("Real-time sync inactive or denied for actions. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(doc(db, 'system', `org_${orgId}_attendance`), (snapshot) => {
      if (snapshot.exists() && snapshot.data().data) {
        localStorage.setItem(`bizflow_${orgId}_attendance_v1`, JSON.stringify(snapshot.data().data));
        callback('attendance', snapshot.data().data);
      }
    }, (error) => {
      console.warn("Real-time sync inactive or denied for attendance. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(doc(db, 'system', `org_${orgId}_inventory`), (snapshot) => {
      if (snapshot.exists() && snapshot.data().data) {
        localStorage.setItem(`bizflow_${orgId}_admin_inventory_v1`, JSON.stringify(snapshot.data().data));
        localStorage.setItem(`bizflow_admin_inventory_v1`, JSON.stringify(snapshot.data().data));
        callback('inventory', snapshot.data().data);
      }
    }, (error) => {
      console.warn("Real-time sync inactive or denied for inventory. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(doc(db, 'system', `org_${orgId}_settings`), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        localStorage.setItem(`bizflow_${orgId}_settings`, JSON.stringify(data));
        callback('settings', data);
      }
    }, (error) => {
      console.warn("Real-time sync inactive or denied for settings. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(doc(db, 'system', `org_${orgId}_settlements`), (snapshot) => {
      if (snapshot.exists() && snapshot.data().data) {
        const data = snapshot.data().data;
        localStorage.setItem(`bizflow_${orgId}_settlements_v1`, JSON.stringify(data));
        callback('settlements', data);
      }
    }, (error) => {
      console.warn("Real-time sync inactive or denied for settlements. Operating on robust local cache fallback.", error);
    }),
    onSnapshot(query(collection(db, 'settlements')), (snapshot) => {
      const dbSettlements: any[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        dbSettlements.push({ ...data, id: data.id || d.id, docId: d.id });
      });
      const filteredDbSettlements = dbSettlements.filter((item: any) => !item.organizationId || item.organizationId === orgId);
      
      const localSettlementsStr = localStorage.getItem(`bizflow_${orgId}_settlements_v1`);
      let localSettlements: any[] = [];
      try { if (localSettlementsStr) localSettlements = JSON.parse(localSettlementsStr); } catch(e) {}
      
      const mergedMap = new Map<string, any>();
      localSettlements.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });
      filteredDbSettlements.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });
      
      const finalSettlements = Array.from(mergedMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      localStorage.setItem(`bizflow_${orgId}_settlements_v1`, JSON.stringify(finalSettlements));
      callback('settlements', finalSettlements);
    }, (error) => {
      console.warn("Real-time sync inactive or denied for settlements collection fallback.", error);
    })
  ];

  return () => {
    unsubs.forEach(unsub => unsub());
    repInvUnsubs.forEach(unsub => unsub());
  };
};

export const listenToRepInventory = async (repId: string, callback: (inv: RepInventoryItem[]) => void) => {
  const orgId = getActiveOrgId();
  const [{ db }, { doc, onSnapshot }] = await Promise.all([import('./sync'), import('firebase/firestore')]);
  return onSnapshot(doc(db, 'system', `org_${orgId}_repinv_${repId}`), (snapshot) => {
    if (snapshot.exists() && snapshot.data().data) {
      localStorage.setItem(`bizflow_${orgId}_repinv_${repId}`, JSON.stringify(snapshot.data().data));
      callback(snapshot.data().data);
    }
  }, (error) => {
    console.warn(`Real-time sync inactive or denied for rep inventory ${repId}. Operating on robust local cache fallback.`, error);
  });
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
          key === 'bizflow_network_logs'
        ) {
          keysToRemove.push(key);
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
  manualAnchorNewBalance?: number
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

  const newAllSales = [...customerSales, ...otherSales].sort((a, b) => getEpoch(b) - getEpoch(a));

  let finalCustomerBalance = runningBalance;
  if (customerSales.length === 0 && targetCust) {
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
    localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(allSales));
    localStorage.setItem(`bizflow_MYM-BIZFLOW_sales_v1`, JSON.stringify(allSales));
    localStorage.setItem('bizflow_sales_v1', JSON.stringify(allSales));
  } catch (e) {}

  try {
    localStorage.setItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(allCustomers));
    localStorage.setItem(`bizflow_MYM-BIZFLOW_customers_v1`, JSON.stringify(allCustomers));
    localStorage.setItem('bizflow_customers_v1', JSON.stringify(allCustomers));
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




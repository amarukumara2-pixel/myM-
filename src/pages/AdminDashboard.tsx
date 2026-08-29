import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
// { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { LayoutDashboard, Users, AlertTriangle, ScanLine, Bot, Globe, Home, ChevronRight, Package, Truck, Printer, Wallet, Store, Camera, Plus, CheckCircle, Search, Trash2, Edit, UserCog, ArrowDown, Send, History, MoreVertical, Menu, Wifi, WifiOff, CloudCog, MapPin, LogOut, DownloadCloud, ArrowLeft, Settings, ShoppingBag, Eye, EyeOff, RotateCcw, Check, Scale, Receipt, CreditCard, DollarSign, RefreshCw, Share2, Facebook, Phone, ShieldAlert, PlusCircle, FileText, Tag, Bell, X, MessageSquare, Target, Database } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import ThermalLogo from '../components/ThermalLogo';
import RepRoutes from '../components/RepRoutes';
import { BillPrintLayout } from "../components/BillPrintLayout";
import AttendancePayrollTab from '../components/AttendancePayrollTab';
import RepTargetsCommissionTab from '../components/RepTargetsCommissionTab';
import {
  TrendsTab,
  OverviewTab,
  InventoryTab,
  SuppliersTab,
  CustomersTab,
  PurchasingTab,
  CreditBillsTab,
  ExpensesTab,
  CashBookTab,
  PaymentHistoryTab,
  RepsTab,
  ReturnsTab,
  ApprovalsTab,
  SpecialApprovalsTab,
  AlertsTab,
  SettingsTab,
  DeployTab
} from './AdminTabs';
import { motion, AnimatePresence } from 'motion/react';
import { getUsers, saveUsers, SystemUser, getRepInventory, saveRepInventory, RepInventoryItem, getAttendanceRecords, saveAttendanceRecords, AttendanceRecord, getAIActionRequests, saveAIActionRequests, AIActionRequest, syncRepFromCloud, listenToRepInventory, listenToCloudChanges, syncAllFromCloud, getActiveOrgId, getOrganizationSettings, saveOrganizationSettings, OrganizationSettings, StaffAttendance, getStaffAttendance, saveStaffAttendance, getAdminInventory, getMainReturnStock, getSuppliers, getCustomers, getSalesHistory } from '../lib/store';
import { getSyncQueue, checkSupabaseConnection, processSyncQueue, addToSyncQueue, fetchTableData, broadcastSync } from '../lib/sync';
import { appConfirm, appPrompt } from '../components/Dialogs';
import { useLogo } from '../lib/logo';
import { BillPreviewModal } from '../components/BillPreviewModal';
import { DailySettlementsTab } from '../components/DailySettlementsTab';
import html2canvas from 'html2canvas';
import { withOklchBypass } from '../lib/canvasUtils';
import { sendTopPhoneNotification } from '../lib/notificationService';
import { clearAppCache } from '../lib/cacheUtils';
import { FirebaseQuotaWidget } from '../components/FirebaseQuotaWidget';

import { getGeminiApiKey, generateGeminiContent } from '../lib/gemini';
import { calculateMonthlySubscription, SubscriptionSettings } from '../services/billingService';

function LongPressDeleteButton({ onDelete, itemName }: { onDelete: () => void, itemName: string }) {
  const [isPressing, setIsPressing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startPress = () => {
    setIsPressing(true);
    timerRef.current = setTimeout(async () => {
       setIsPressing(false);
       const pin = prompt(`Enter Admin PIN to delete ${itemName}:`);
       const admin = getUsers().find(u => u.role === 'admin');
       if (pin === admin?.pin) {
          onDelete();
       } else if (pin !== null) {
          alert('Incorrect PIN');
       }
    }, 1000); // 1 second long press
  };

  const cancelPress = () => {
    setIsPressing(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <button
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      className={`p-2 rounded-lg transition-all ${isPressing ? 'bg-rose-200 text-rose-800 scale-110' : 'text-rose-600 hover:bg-rose-50'}`}
      title="Long press and hold to delete"
    >
      <Trash2 size={16} className={isPressing ? 'animate-pulse' : ''} />
    </button>
  );
}


export default function AdminDashboard() {
  const logo = useLogo();
  const navigate = useNavigate();
  const [lang, setLang] = useState<'en'|'si'>((localStorage.getItem('bizflow_lang') as 'en'|'si') || 'en');
  const [repsList, setRepsList] = useState<any[]>([]);

  useEffect(() => {
    const loadUsers = () => {
      const users = getUsers();
      setRepsList(users.filter(u => u.role === 'rep'));
    };
    loadUsers();
    
    window.addEventListener('bizflow_sync', (e: any) => {
      if (e.detail?.table === 'users') loadUsers();
    });
    return () => window.removeEventListener('bizflow_sync', loadUsers);
  }, []);
  
  const handleLangChange = () => {
    const newLang = lang === 'en' ? 'si' : 'en';
    setLang(newLang);
    localStorage.setItem('bizflow_lang', newLang);
  };
  
  const t = useTranslation(lang);
  const [activeTab, setActiveTab] = useState('home');
  
  useEffect(() => {
    localStorage.setItem('admin_active_tab', activeTab);
  }, [activeTab]);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<{checking: boolean, success?: boolean, message?: string}>({ checking: false });
  const [pendingRequests, setPendingRequests] = useState<AIActionRequest[]>([]);
  const [notification, setNotification] = useState<AIActionRequest | null>(null);
  const [orgSettings, setOrgSettings] = useState(getOrganizationSettings());
  const [logoClicks, setLogoClicks] = useState(0);
  const [isGhostMode, setIsGhostMode] = useState(() => {
    const activeUntil = localStorage.getItem('bizflow_ghost_until');
    return activeUntil ? Number(activeUntil) > Date.now() : false;
  });

  const [currentUser, setCurrentUser] = useState<SystemUser | null>(() => {
    const saved = sessionStorage.getItem('current_user');
    return saved ? JSON.parse(saved) : { role: 'admin' };
  });

  const [allSalesData, setAllSalesData] = useState<any[]>(() => {
    const orgId = getActiveOrgId();
    const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    fetchTableData('sales').then(data => {
      if (data && Array.isArray(data)) {
        setAllSalesData(data);
      }
    });

    const handleSalesUpdate = (e: any) => {
      if (e?.detail?.table === 'sales' || !e?.detail?.table) {
        const orgId = getActiveOrgId();
        const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
        if (stored) {
          try { setAllSalesData(JSON.parse(stored)); } catch (err) {}
        }
      }
    };
    window.addEventListener('bizflow_sync', handleSalesUpdate);
    window.addEventListener('bizflow_sales_updated', handleSalesUpdate);
    return () => {
      window.removeEventListener('bizflow_sync', handleSalesUpdate);
      window.removeEventListener('bizflow_sales_updated', handleSalesUpdate);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const activeUntil = localStorage.getItem('bizflow_ghost_until');
      if (activeUntil && Number(activeUntil) <= Date.now()) {
        setIsGhostMode(false);
        localStorage.removeItem('bizflow_ghost_until');
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLogoClick = () => {
    const twoMonthsAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
    const orgCreated = orgSettings.createdAt || Date.now();
    
    if (orgCreated > twoMonthsAgo) return;

    setLogoClicks(prev => {
      const next = prev + 1;
      if (next >= 3) {
        const newState = !isGhostMode;
        setIsGhostMode(newState);
        if (newState) {
          localStorage.setItem('bizflow_ghost_until', (Date.now() + 4 * 60 * 60 * 1000).toString());
        } else {
          localStorage.removeItem('bizflow_ghost_until');
        }
        return 0;
      }
      return next;
    });
  };

  const notifiedIdsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    setOrgSettings(getOrganizationSettings());
  }, [activeTab]);

  useEffect(() => {
    const checkRequests = () => {
      const allReqs = getAIActionRequests();
      const pending = allReqs.filter(r => r && r.status === 'Pending');
      setPendingRequests(pending);
      
      const unnotified = pending.find(r => r && r.id && !notifiedIdsRef.current.has(r.id));
      if (unnotified) {
        notifiedIdsRef.current.add(unnotified.id);
        setNotification(unnotified);
        sendTopPhoneNotification(
          '🔔 නව අනුමැති ඉල්ලීමක්!',
          `${unnotified.repName || 'Rep'} වෙතින් ඉල්ලීමක්: ${unnotified.description || unnotified.actionType}`,
          'approval'
        );
      }
    };

    checkRequests();
    const interval = setInterval(checkRequests, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = (req: AIActionRequest, status: 'Approved' | 'Rejected') => {
    // Prevent double processing if already Approved, Completed, or Rejected
    const currentReqs = getAIActionRequests();
    const freshReq = currentReqs.find(r => r.id === req.id) || req;
    if (freshReq.status === 'Approved' || freshReq.status === 'Completed' || freshReq.status === 'Rejected') {
      return;
    }

    // Execute business logic depending on actionType
    if (status === 'Approved') {
      if (req.actionType === 'handover_admin' || req.type === 'handover_admin') {
        const amt = Number(req.payload?.amount || 0);
        const repId = req.repId;
        const allUsers = getUsers();
        const updatedUsers = allUsers.map(u => {
          if (u.id === repId) {
            return {
              ...u,
              pendingAdminHandover: Math.max(0, (u.pendingAdminHandover || 0) - amt),
              cashBookBalance: Math.max(0, (u.cashBookBalance || 0) - amt)
            };
          }
          return u;
        });
        saveUsers(updatedUsers);
        addToSyncQueue({ table: 'users', action: 'update', data: updatedUsers.find(u => u.id === repId) });
      } else if (req.actionType === 'stock_load_rep' || req.type === 'stock_load_rep') {
        if (req.payload?.items && Array.isArray(req.payload.items)) {
          const repId = req.repId;
          const currentRepInv = getRepInventory(repId);
          req.payload.items.forEach((item: any) => {
            const existing = currentRepInv.find(i => String(i.id) === String(item.id));
            if (existing) {
              existing.myStock = (existing.myStock || 0) + Number(item.qty || item.quantity || 0);
            } else {
              currentRepInv.push({ 
                id: item.id, 
                name: item.name || 'Item', 
                myStock: Number(item.qty || item.quantity || 0),
                minPrice: item.minPrice || 0,
                maxPrice: item.maxPrice || 0,
                stockInMain: 0,
                returnStock: 0,
                costPrice: item.costPrice || 0
              });
            }
          });
          saveRepInventory(repId, currentRepInv);
          addToSyncQueue({ table: 'inventory', action: 'update', data: { repId, items: currentRepInv } });
        }
      }
    } else if (status === 'Rejected') {
      if (req.actionType === 'handover_admin' || req.type === 'handover_admin') {
        const amt = Number(req.payload?.amount || 0);
        const repId = req.repId;
        const allUsers = getUsers();
        const updatedUsers = allUsers.map(u => {
          if (u.id === repId) {
            return {
              ...u,
              pendingAdminHandover: Math.max(0, (u.pendingAdminHandover || 0) - amt)
            };
          }
          return u;
        });
        saveUsers(updatedUsers);
        addToSyncQueue({ table: 'users', action: 'update', data: updatedUsers.find(u => u.id === repId) });
      }
    }

    // Save status
    const all = getAIActionRequests();
    const updated = all.map(r => r.id === req.id ? { ...r, status } : r);
    saveAIActionRequests(updated);
    addToSyncQueue({ table: 'aiactions', action: 'update', data: { id: req.id, status } });

    sendTopPhoneNotification(
      status === 'Approved' ? '✅ ඉල්ලීම අනුමත විය' : '❌ ඉල්ලීම ප්‍රතික්ෂේප විය',
      `${req.repName || 'Rep'}ගේ ${req.description || 'ඉල්ලීම'} ${status === 'Approved' ? 'අනුමත කරන ලදී' : 'ප්‍රතික්ෂේප කරන ලදී'}.`,
      status === 'Approved' ? 'approval' : 'system'
    );

    const remainingPending = updated.filter(r => r && r.status === 'Pending');
    setPendingRequests(remainingPending);
    setNotification(remainingPending[0] || null);
  };

  useEffect(() => {
    const triggerFullSync = async () => {
      if (!navigator.onLine) return;
      setIsOnline(true);
      try {
        const [{ pushUnsyncedLocalDataToCloud }, mod] = await Promise.all([
          import('../lib/sync'),
          import('../lib/store')
        ]);
        await pushUnsyncedLocalDataToCloud();
        await mod.syncAllFromCloud();
      } catch (e) {
        console.warn('Admin sync error:', e);
      }
    };

    const handleOn = () => triggerFullSync();
    const handleOff = () => setIsOnline(false);

    window.addEventListener('online', handleOn);
    window.addEventListener('offline', handleOff);

    if (navigator.onLine) {
      triggerFullSync();
    }

    const interval = setInterval(() => {
      if (navigator.onLine) {
        triggerFullSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOn);
      window.removeEventListener('offline', handleOff);
      clearInterval(interval);
    };
  }, []);

  const handleTestConnection = async () => {
    setSyncStatus({ checking: true });
    processSyncQueue();
    const res = await checkSupabaseConnection();
    setSyncStatus({ checking: false, success: res.success, message: res.message });
    setTimeout(() => {
      setSyncStatus({ checking: false });
    }, 3000);
  };

  const [globalItems, setGlobalItems] = useState<any[]>(() => getAdminInventory());
  const [suppliers, setSuppliers] = useState<any[]>(() => getSuppliers());
  const [customers, setCustomers] = useState<any[]>(() => getCustomers());
  const [returnStock, setReturnStock] = useState<any[]>(() => getMainReturnStock());

  useEffect(() => {
    const orgId = getActiveOrgId();
    const loadData = async () => {
      const inv = getAdminInventory();
      if (inv.length > 0) setGlobalItems(inv);

      const sups = getSuppliers();
      if (sups.length > 0) setSuppliers(sups);

      const custs = getCustomers();
      if (custs.length > 0) setCustomers(custs);

      const ret = getMainReturnStock();
      if (ret.length > 0) setReturnStock(ret);

      if (navigator.onLine) {
        syncAllFromCloud().then(() => {
          const updatedInv = getAdminInventory();
          if (updatedInv.length > 0) setGlobalItems(updatedInv);
        });

        const checkAndSet = async (table: string, setter: (data: any[]) => void, key: string) => {
          try {
            const data = await fetchTableData(table);
            if (data && data.length > 0) {
              setter(data);
              localStorage.setItem(key, JSON.stringify(data));
              localStorage.setItem(`bizflow_MYM-BIZFLOW_${table}_v1`, JSON.stringify(data));
              localStorage.setItem(`bizflow_${table}_v1`, JSON.stringify(data));
            }
          } catch (err) {
            console.error(`Failed to fetch and sync table ${table}:`, err);
          }
        };

        checkAndSet('suppliers', setSuppliers, `bizflow_${orgId}_suppliers_v1`);
        checkAndSet('customers', setCustomers, `bizflow_${orgId}_customers_v1`);
        checkAndSet('main_return_stock', setReturnStock, `bizflow_${orgId}_main_return_stock_v1`);
        checkAndSet('inventory', setGlobalItems, `bizflow_${orgId}_admin_inventory_v1`);
      }
    };
    loadData();

    // Set up real-time listener for Firestore changes
    let unsubCloud: (() => void) | undefined;
    listenToCloudChanges((table, data) => {
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table, data } }));
    }).then(unsub => { unsubCloud = unsub; });

    // Background periodic auto-sync when mobile data turns on & every 30 minutes
    const handleOnline = () => {
      processSyncQueue();
      syncAllFromCloud();
    };

    window.addEventListener('online', handleOnline);
    const syncInterval = setInterval(() => {
      if (navigator.onLine) {
        handleOnline();
      }
    }, 30 * 60 * 1000);

    // Listen for real-time cloud sync events
    const handleSync = (e: any) => {
      const table = e.detail?.table;
      const currentOrgId = getActiveOrgId();

      if (table === 'settings') {
        setOrgSettings(e.detail.data);
      }
      
      if (!table || table === 'inventory' || table === 'all') {
        const stored = getAdminInventory();
        if (stored && stored.length > 0) setGlobalItems(stored);
      }
      
      if (!table || table === 'suppliers' || table === 'all') {
        const stored = localStorage.getItem(`bizflow_${currentOrgId}_suppliers_v1`) || localStorage.getItem('bizflow_suppliers_v1');
        if (stored) {
          try { setSuppliers(JSON.parse(stored)); } catch (err) {}
        }
      }
      
      if (!table || table === 'customers' || table === 'all') {
        const stored = localStorage.getItem(`bizflow_${currentOrgId}_customers_v1`) || localStorage.getItem('bizflow_customers_v1');
        if (stored) {
          try { setCustomers(JSON.parse(stored)); } catch (err) {}
        }
      }
      
      if (!table || table === 'main_return_stock' || table === 'all') {
        const stored = localStorage.getItem(`bizflow_${currentOrgId}_main_return_stock_v1`) || localStorage.getItem('bizflow_main_return_stock_v1');
        if (stored) {
          try { setReturnStock(JSON.parse(stored)); } catch (err) {}
        }
      }
      
      if (!table || table === 'sales' || table === 'all') {
        window.dispatchEvent(new CustomEvent('bizflow_sales_updated', { detail: e.detail }));
      }
      
      if (!table || table === 'aiactions' || table === 'all') {
        const reqs = getAIActionRequests();
        const pending = reqs.filter(r => r && r.status === 'Pending');
        setPendingRequests(pending);
        const unnotified = pending.find(r => r && r.id && !notifiedIdsRef.current.has(r.id));
        if (unnotified) {
          notifiedIdsRef.current.add(unnotified.id);
          setNotification(unnotified);
          try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(() => {});
          } catch (e) {}
        }
      }
    };
    window.addEventListener('bizflow_sync', handleSync);
    return () => {
      window.removeEventListener('bizflow_sync', handleSync);
      window.removeEventListener('online', handleOnline);
      clearInterval(syncInterval);
      if (unsubCloud) unsubCloud();
    };
  }, []);

  const updateReturnStock = (newStock: any[], syncAction: 'insert' | 'update' | 'delete' = 'update', data?: any) => {
    const orgId = getActiveOrgId();
    setReturnStock(newStock);
    localStorage.setItem(`bizflow_${orgId}_main_return_stock_v1`, JSON.stringify(newStock));
    localStorage.setItem(`bizflow_main_return_stock_v1`, JSON.stringify(newStock));
    if (data) addToSyncQueue({ table: 'main_return_stock', action: syncAction, data });
  };

  const updateGlobalItems = (newItems: any[], syncAction: 'insert' | 'update' | 'delete' = 'update', itemData?: any) => {
    const orgId = getActiveOrgId();
    setGlobalItems(newItems);
    localStorage.setItem(`bizflow_${orgId}_admin_inventory_v1`, JSON.stringify(newItems));
    localStorage.setItem(`bizflow_admin_inventory_v1`, JSON.stringify(newItems));
    if (itemData) addToSyncQueue({ table: 'inventory', action: syncAction, data: itemData });
    
    // Trigger real-time sync for other devices
    Promise.all([import('firebase/firestore'), import('../lib/sync')]).then(([{ doc }, { db, safeSetDoc }]) => {
      safeSetDoc(doc(db, 'system', `org_${orgId}_inventory`), {
        data: newItems,
        organizationId: orgId,
        updatedAt: Date.now()
      }, { merge: true });
    });
  };

  const updateSuppliers = (newSups: any[], syncAction: 'insert' | 'update' | 'delete' = 'update', supData?: any) => {
    const orgId = getActiveOrgId();
    setSuppliers(newSups);
    localStorage.setItem(`bizflow_${orgId}_suppliers_v1`, JSON.stringify(newSups));
    localStorage.setItem(`bizflow_suppliers_v1`, JSON.stringify(newSups));
    if (supData) addToSyncQueue({ table: 'suppliers', action: syncAction, data: supData });
  };

  const updateCustomers = (newCusts: any[], syncAction: 'insert' | 'update' | 'delete' = 'update', custData?: any) => {
    const orgId = getActiveOrgId();
    setCustomers(newCusts);
    localStorage.setItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(newCusts));
    localStorage.setItem(`bizflow_customers_v1`, JSON.stringify(newCusts));
    if (custData) addToSyncQueue({ table: 'customers', action: syncAction, data: custData });
  };

  const allTabs = [
    { 
      id: 'dashboard', 
      label: t('dashboard'), 
      icon: <LayoutDashboard size={32} />, 
      color: 'text-indigo-600', 
      cardBg: 'from-indigo-50/60 via-white to-indigo-50/10', 
      borderColor: 'border-indigo-100',
      borderHover: 'hover:border-indigo-400', 
      iconBg: 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-indigo-500/30',
      shadowHover: 'hover:shadow-indigo-500/10',
      accentColor: 'bg-indigo-500'
    },
    { 
      id: 'invoicing', 
      label: t('billing') || 'Invoicing', 
      icon: <Printer size={32} />, 
      color: 'text-emerald-600', 
      cardBg: 'from-emerald-50/60 via-white to-emerald-50/10', 
      borderColor: 'border-emerald-100',
      borderHover: 'hover:border-emerald-400', 
      iconBg: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-500/30',
      shadowHover: 'hover:shadow-emerald-500/10',
      accentColor: 'bg-emerald-500'
    },
    { 
      id: 'inventory', 
      label: t('inventory'), 
      icon: <Package size={32} />, 
      color: 'text-blue-600', 
      cardBg: 'from-blue-50/60 via-white to-blue-50/10', 
      borderColor: 'border-blue-100',
      borderHover: 'hover:border-blue-400', 
      iconBg: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/30',
      shadowHover: 'hover:shadow-blue-500/10',
      accentColor: 'bg-blue-500'
    },
    { 
      id: 'suppliers', 
      label: t('suppliers'), 
      icon: <Store size={32} />, 
      color: 'text-rose-600', 
      cardBg: 'from-rose-50/60 via-white to-rose-50/10', 
      borderColor: 'border-rose-100',
      borderHover: 'hover:border-rose-400', 
      iconBg: 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/30',
      shadowHover: 'hover:shadow-rose-500/10',
      accentColor: 'bg-rose-500'
    },
    { 
      id: 'customers', 
      label: t('customers'), 
      icon: <Users size={32} />, 
      color: 'text-teal-600', 
      cardBg: 'from-teal-50/60 via-white to-teal-50/10', 
      borderColor: 'border-teal-100',
      borderHover: 'hover:border-teal-400', 
      iconBg: 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-teal-500/30',
      shadowHover: 'hover:shadow-teal-500/10',
      accentColor: 'bg-teal-500'
    },
    { 
      id: 'purchasing', 
      label: t('purchasing'), 
      icon: <ShoppingBag size={32} />, 
      color: 'text-fuchsia-600', 
      cardBg: 'from-fuchsia-50/60 via-white to-fuchsia-50/10', 
      borderColor: 'border-fuchsia-100',
      borderHover: 'hover:border-fuchsia-400', 
      iconBg: 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 text-white shadow-fuchsia-500/30',
      shadowHover: 'hover:shadow-fuchsia-500/10',
      accentColor: 'bg-fuchsia-500'
    },
    { 
      id: 'credit', 
      label: t('credit_bills') || 'Credit Bills', 
      icon: <Wallet size={32} />, 
      color: 'text-orange-600', 
      cardBg: 'from-orange-50/60 via-white to-orange-50/10', 
      borderColor: 'border-orange-100',
      borderHover: 'hover:border-orange-400', 
      iconBg: 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-orange-500/30',
      shadowHover: 'hover:shadow-orange-500/10',
      accentColor: 'bg-orange-500'
    },
    { 
      id: 'expenses', 
      label: lang === 'si' ? 'වියදම්' : 'Expenses', 
      icon: <Receipt size={32} />, 
      color: 'text-pink-600', 
      cardBg: 'from-pink-50/60 via-white to-pink-50/10', 
      borderColor: 'border-pink-100',
      borderHover: 'hover:border-pink-400', 
      iconBg: 'bg-gradient-to-br from-pink-500 to-pink-600 text-white shadow-pink-500/30',
      shadowHover: 'hover:shadow-pink-500/10',
      accentColor: 'bg-pink-500'
    },
    { 
      id: 'cashbook', 
      label: lang === 'si' ? 'මුදල් පොත' : 'Cash Book', 
      icon: <Scale size={32} />, 
      color: 'text-green-600', 
      cardBg: 'from-green-50/60 via-white to-green-50/10', 
      borderColor: 'border-green-100',
      borderHover: 'hover:border-green-400', 
      iconBg: 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-green-500/30',
      shadowHover: 'hover:shadow-green-500/10',
      accentColor: 'bg-green-500'
    },
    { 
      id: 'payment_history', 
      label: t('payment_history') || 'Payment History', 
      icon: <History size={32} />, 
      color: 'text-slate-600', 
      cardBg: 'from-slate-100/60 via-white to-slate-100/10', 
      borderColor: 'border-slate-200',
      borderHover: 'hover:border-slate-400', 
      iconBg: 'bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-slate-600/30',
      shadowHover: 'hover:shadow-slate-500/10',
      accentColor: 'bg-slate-500'
    },
    { 
      id: 'reps', 
      label: currentUser?.role === 'stock_keeper' ? (lang === 'si' ? 'ස්ටොක් නිකුත් කිරීම' : 'Stock Loading') : (t('manage_reps') || 'Manage Reps'), 
      icon: <UserCog size={32} />, 
      color: 'text-sky-600', 
      cardBg: 'from-sky-50/60 via-white to-sky-50/10', 
      borderColor: 'border-sky-100',
      borderHover: 'hover:border-sky-400', 
      iconBg: 'bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sky-500/30',
      shadowHover: 'hover:shadow-sky-500/10',
      accentColor: 'bg-sky-500'
    },
    { 
      id: 'returns', 
      label: lang === 'si' ? 'ආපසු ලැබුණු තොග' : 'Returns Stock', 
      icon: <Truck size={32} />, 
      color: 'text-rose-600', 
      cardBg: 'from-rose-50/60 via-white to-rose-50/10', 
      borderColor: 'border-rose-100',
      borderHover: 'hover:border-rose-400', 
      iconBg: 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/30',
      shadowHover: 'hover:shadow-rose-500/10',
      accentColor: 'bg-rose-500'
    },
    { 
      id: 'trends', 
      label: lang === 'si' ? 'ප්‍රවණතා' : 'Trends', 
      icon: <LayoutDashboard size={32} />, 
      color: 'text-purple-600', 
      cardBg: 'from-purple-50/60 via-white to-purple-50/10', 
      borderColor: 'border-purple-100',
      borderHover: 'hover:border-purple-400', 
      iconBg: 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-purple-500/30',
      shadowHover: 'hover:shadow-purple-500/10',
      accentColor: 'bg-purple-500'
    },
    { 
      id: 'diagnostic', 
      label: 'Sync Diagnostic', 
      icon: <CloudCog size={32} />, 
      color: 'text-purple-600', 
      cardBg: 'from-purple-50/60 via-white to-purple-50/10', 
      borderColor: 'border-purple-100',
      borderHover: 'hover:border-purple-400', 
      iconBg: 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-purple-500/30',
      shadowHover: 'hover:shadow-purple-500/10',
      accentColor: 'bg-purple-500'
    },
    { 
      id: 'alerts', 
      label: t('red_alerts'), 
      icon: <AlertTriangle size={32} />, 
      color: 'text-red-700', 
      cardBg: 'from-red-50/65 via-white to-red-50/10', 
      borderColor: 'border-red-100',
      borderHover: 'hover:border-red-400', 
      iconBg: 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-red-500/30',
      shadowHover: 'hover:shadow-red-500/10',
      accentColor: 'bg-red-500'
    },
    { 
      id: 'attendance', 
      label: lang === 'si' ? 'පැමිණීම සහ පේයිරෝල්' : 'Attendance & Payroll', 
      icon: <ScanLine size={32} />, 
      color: 'text-violet-600', 
      cardBg: 'from-violet-50/60 via-white to-violet-50/10', 
      borderColor: 'border-violet-100',
      borderHover: 'hover:border-violet-400', 
      iconBg: 'bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-violet-500/30',
      shadowHover: 'hover:shadow-violet-500/10',
      accentColor: 'bg-violet-500'
    },
    { 
      id: 'targets', 
      label: lang === 'si' ? 'ඉලක්ක සහ කොමිස්' : 'Targets & Commission', 
      icon: <Target size={32} />, 
      color: 'text-amber-600', 
      cardBg: 'from-amber-50/60 via-white to-amber-50/10', 
      borderColor: 'border-amber-100',
      borderHover: 'hover:border-amber-400', 
      iconBg: 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-amber-500/30',
      shadowHover: 'hover:shadow-amber-500/10',
      accentColor: 'bg-amber-500'
    },
    { 
      id: 'routes', 
      label: 'Rep Routes', 
      icon: <MapPin size={32} />, 
      color: 'text-cyan-600', 
      cardBg: 'from-cyan-50/60 via-white to-cyan-50/10', 
      borderColor: 'border-cyan-100',
      borderHover: 'hover:border-cyan-400', 
      iconBg: 'bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-cyan-500/30',
      shadowHover: 'hover:shadow-cyan-500/10',
      accentColor: 'bg-cyan-500'
    },
    { 
      id: 'deploy', 
      label: 'Export & Deploy', 
      icon: <DownloadCloud size={32} />, 
      color: 'text-blue-700', 
      cardBg: 'from-blue-50/60 via-white to-blue-50/10', 
      borderColor: 'border-blue-100',
      borderHover: 'hover:border-blue-400', 
      iconBg: 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-blue-650/30',
      shadowHover: 'hover:shadow-blue-600/10',
      accentColor: 'bg-blue-600'
    },
    { 
      id: 'quota', 
      label: lang === 'si' ? 'Firebase Quota සජීවීව' : 'Firebase Daily Quota', 
      icon: <Database size={32} />, 
      color: 'text-amber-600', 
      cardBg: 'from-amber-50/60 via-white to-amber-50/10', 
      borderColor: 'border-amber-100',
      borderHover: 'hover:border-amber-400', 
      iconBg: 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-amber-500/30',
      shadowHover: 'hover:shadow-amber-500/10',
      accentColor: 'bg-amber-500'
    },
    { 
      id: 'settings', 
      label: lang === 'si' ? 'සැකසුම්' : 'Settings', 
      icon: <Settings size={32} />, 
      color: 'text-slate-700', 
      cardBg: 'from-slate-100/80 via-white to-slate-200/20', 
      borderColor: 'border-slate-200',
      borderHover: 'hover:border-slate-400', 
      iconBg: 'bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-slate-500/30',
      shadowHover: 'hover:shadow-slate-500/10',
      accentColor: 'bg-slate-600'
    },
  ];

  const groups = [
    { id: 'dashboard', label: t('dashboard'), icon: <LayoutDashboard size={20} />, subTabs: ['dashboard'] },
    { id: 'supply', label: lang === 'si' ? 'තොග සහ සැපයුම්' : 'Supply & Stock', icon: <Package size={20} />, subTabs: ['inventory', 'suppliers', 'purchasing', 'returns', 'diagnostic'] },
    { id: 'sales', label: lang === 'si' ? 'අලෙවිය සහ ගිණුම්' : 'Sales & Finance', icon: <Users size={20} />, subTabs: ['invoicing', 'customers', 'credit', 'expenses', 'cashbook', 'payment_history'] },
    { id: 'team', label: lang === 'si' ? 'සේවක කළමණාකරණය' : 'Team / Reps', icon: <UserCog size={20} />, subTabs: ['reps', 'routes', 'attendance', 'approvals'] },
    { id: 'system', label: lang === 'si' ? 'පද්ධතිය' : 'System & Tools', icon: <Settings size={20} />, subTabs: ['alerts', 'settings', 'quota', 'deploy'] },
  ];

  const getActiveGroup = () => {
    return groups.find(g => g.subTabs.includes(activeTab)) || groups[0];
  };

  const filteredGroups = groups.filter(group => {
    const allowedInGroup = group.subTabs.filter(tabId => {
      if (currentUser?.role === 'stock_keeper' || currentUser?.role === 'driver' || currentUser?.role === 'other') {
        if (currentUser?.role === 'driver') return ['routes', 'dashboard', 'settings'].includes(tabId);
        if (currentUser?.role === 'other') return ['dashboard', 'settings'].includes(tabId);
        return ['inventory', 'returns', 'reps', 'alerts', 'dashboard', 'settings', 'attendance', 'approvals'].includes(tabId);
      }
      if (tabId === 'deploy' && currentUser?.role !== 'super_admin') return false; 
      return true;
    });
    return allowedInGroup.length > 0;
  });

  const getFilteredSubTabs = (group: any) => {
    return group.subTabs.filter((tabId: string) => {
      if (currentUser?.role === 'stock_keeper' || currentUser?.role === 'driver' || currentUser?.role === 'other') {
        if (currentUser?.role === 'driver') return ['routes', 'dashboard', 'settings'].includes(tabId);
        if (currentUser?.role === 'other') return ['dashboard', 'settings'].includes(tabId);
        return ['inventory', 'returns', 'reps', 'alerts', 'dashboard', 'settings', 'attendance', 'approvals'].includes(tabId);
      }
      if (tabId === 'deploy' && currentUser?.role !== 'super_admin') return false; 
      return true;
    });
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex flex-col font-sans">
      {activeTab !== 'home' && (
      <header className="w-full bg-[#0B1120] text-white shadow-2xl sticky top-0 z-30">
        <div className="w-full p-4 md:p-6 bg-white/5 flex justify-between items-center relative z-40">
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => {
                if (activeTab !== 'home') {
                  setActiveTab('home');
                } else {
                  navigate('/');
                }
              }} 
              className="p-2.5 rounded-xl hover:bg-white/10 transition-colors bg-white/10 text-white flex items-center"
              title="Back"
            >
              <ArrowLeft size={24} />
            </button>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)} 
              className="p-2.5 rounded-xl hover:bg-white/10 transition-colors bg-white/10 text-white"
              title="Menu"
            >
              <MoreVertical size={24} />
            </button>
            <img 
              src={orgSettings?.logoUrl || logo} 
              alt="Logo" 
              className="w-8 h-8 rounded-lg shadow-lg cursor-pointer active:scale-95 transition-transform object-contain" 
              onClick={handleLogoClick}
            />
            <h2 className="font-display font-black text-xl md:text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 hidden sm:block">
              MYM BIZFLOW
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
             <h2 className="font-display font-black text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 sm:hidden">
                BIZFLOW
             </h2>

             {/* Pending Approvals Badge */}
             {pendingRequests.length > 0 && (
               <button 
                 onClick={() => {
                   if (pendingRequests[0]) setNotification(pendingRequests[0]);
                 }}
                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs animate-bounce shadow-lg shadow-amber-500/30 transition-all cursor-pointer"
                 title="Click to pop up pending approval requests"
               >
                 <Bell size={15} />
                 <span>{pendingRequests.length} අනුමැති ඉල්ලීම් (Pop-up)</span>
               </button>
             )}
             
             {/* Network / DB Sync Status */}
             <div className="flex items-center gap-2">
               {isOnline ? (
                 <span className="flex items-center text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1.5 rounded-full" title="Online">
                    Online
                 </span>
               ) : (
                 <span className="flex items-center text-xs font-bold text-rose-400 bg-rose-400/10 px-2 py-1.5 rounded-full" title="Offline - Working Locally">
                    Offline
                 </span>
               )}
             </div>


             <button onClick={handleLangChange} className="p-2.5 rounded-full hover:bg-white/10 transition-colors flex items-center bg-white/10">
               <Globe size={18} />
             </button>
             <Link to="/" className="p-2.5 rounded-full hover:bg-rose-500/20 transition-colors flex items-center bg-rose-500/10 text-rose-400" title="Logout">
               <LogOut size={18} />
             </Link>
          </div>
        </div>

        {/* Sync Toast Notification */}
        <AnimatePresence>
          {syncStatus.message && (
            <motion.div 
               initial={{ opacity: 0, y: -20, left: '50%', x: '-50%' }}
               animate={{ opacity: 1, y: 10, left: '50%', x: '-50%' }}
               exit={{ opacity: 0, y: -20, left: '50%', x: '-50%' }}
               className={`absolute top-full z-50 px-4 py-2 rounded-full shadow-lg font-bold text-sm flex items-center ${syncStatus.success ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}
            >
               {syncStatus.success ? <CheckCircle size={16} className="mr-2" /> : <AlertTriangle size={16} className="mr-2" />}
               {syncStatus.message}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div 
           initial={false}
           animate={{ 
             height: isMenuOpen ? 'auto' : 0,
             opacity: isMenuOpen ? 1 : 0,
             display: isMenuOpen ? 'block' : 'none'
           }}
           transition={{ duration: 0.2 }}
           className="bg-[#0B1120] border-t border-white/10 absolute top-full left-0 w-full shadow-xl overflow-hidden z-30"
        >
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[75vh] overflow-y-auto">
            {filteredGroups.map(group => {
              const isActive = getActiveGroup().id === group.id;
              return (
                <button
                  key={group.id}
                  onClick={() => { 
                    const firstAllowed = getFilteredSubTabs(group)[0];
                    if (firstAllowed) setActiveTab(firstAllowed);
                    setIsMenuOpen(false); 
                  }}
                  className={`flex items-center px-4 py-4 rounded-2xl w-full text-left transition-all duration-300 ${isActive ? 'bg-blue-600/20 text-blue-400 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
                >
                  {group.icon}
                  <span className="ml-4 font-medium">{group.label}</span>
                  {isActive && <ChevronRight size={16} className="ml-auto opacity-50" />}
                </button>
              )
            })}
            <button 
                onClick={() => {
                  const appUrl = window.location.origin;
                  const text = lang === 'si' ? `අපගේ MYM BIZFLOW ඇප් එක මෙහිදී ලබා ගන්න: ${appUrl}` : `Get our MYM BIZFLOW App here: ${appUrl}`;
                  if (navigator.share) {
                    navigator.share({ title: 'MYM BIZFLOW App', text: text, url: appUrl }).catch(err => console.log('Share canceled or failed', err));
                  } else {
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                  }
                }}
                className="flex items-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors bg-white/5 px-4 py-4 rounded-2xl"
              >
                <Send size={20} className="mr-3" /> <span className="font-medium">{lang === 'si' ? 'ඇප් එක යවන්න' : 'Share App'}</span>
            </button>
            <Link to="/" className="flex items-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors bg-white/5 px-4 py-4 rounded-2xl">
              <Home size={20} className="mr-3" /> <span className="font-medium">{t('logout')}</span>
            </Link>
          </div>
        </motion.div>
        
        {/* Sub-Tab Navigation Bar (Mobile & Desktop) */}
        {activeTab !== 'dashboard' && activeTab !== 'home' && (
          <div className="bg-white/5 border-t border-white/5 overflow-x-auto no-scrollbar">
            <div className="flex gap-2 p-3 px-4 md:px-6">
              {getFilteredSubTabs(getActiveGroup()).map((tabId: string) => {
                 const tInfo = allTabs.find(t => t.id === tabId);
                 if (!tInfo) return null;
                 const isSubActive = activeTab === tabId;
                 return (
                   <button 
                     key={tabId}
                     onClick={() => {
                        if (tabId === 'invoicing') {
                           if (currentUser) {
                              sessionStorage.setItem('current_rep', JSON.stringify(currentUser));
                           }
                           navigate('/rep');
                        } else {
                           setActiveTab(tabId);
                        }
                     }}
                     className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${isSubActive ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
                   >
                     {React.cloneElement(tInfo.icon as React.ReactElement<any>, { size: 14 })}
                     {tInfo.label}
                   </button>
                 )
              })}
            </div>
          </div>
        )}
      </header>
      )}

      <div className="flex-1 p-4 md:p-8 lg:p-10 overflow-y-auto w-full relative">
        <div className="max-w-6xl mx-auto">
          {/* Real-time Pop-up Approval Overlay */}
          <AnimatePresence>
            {notification && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.85, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: -30 }}
                  className="w-full max-w-lg bg-white border-2 border-amber-500 shadow-2xl rounded-3xl p-6 relative overflow-hidden"
                >
                  <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-amber-500 via-emerald-500 to-indigo-500 animate-pulse" />
                  
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl animate-bounce">
                        <Bell size={26} />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          {notification.actionType || 'නව ඉල්ලීමක්'}
                        </span>
                        <h3 className="font-display text-xl font-bold text-slate-800 mt-0.5">නව අනුමැති ඉල්ලීමක්!</h3>
                      </div>
                    </div>
                    <button 
                      onClick={() => setNotification(null)} 
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 mb-6">
                    <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-200/60">
                      <span>නියෝජිතයා (Rep): <strong className="text-slate-900 font-bold">{notification.repName || 'Rep'}</strong></span>
                      <span className="font-mono">{new Date(Number(notification.timestamp || Date.now())).toLocaleTimeString('si-LK')}</span>
                    </div>

                    <p className="text-sm font-semibold text-slate-800 pt-1 leading-relaxed">
                      {notification.description || 'අනුමැතියක් අවශ්‍ය වේ'}
                    </p>

                    {notification.payload?.amount && (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2 rounded-xl text-sm font-bold flex justify-between items-center mt-2">
                        <span>ඉල්ලූ මුදල (Amount):</span>
                        <span className="font-mono text-lg text-emerald-700">Rs {Number(notification.payload.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => handleApprove(notification, 'Rejected')}
                      className="flex-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <X size={18} /> ප්‍රතික්ෂේප කරන්න (Reject)
                    </button>
                    <button 
                      onClick={() => handleApprove(notification, 'Approved')}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-emerald-600/30 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle size={18} /> අනුමත කරන්න (Approve)
                    </button>
                  </div>

                  {pendingRequests.length > 1 && (
                    <p className="text-center text-[11px] font-bold text-amber-600 mt-3">
                      ⏳ තවත් ඉල්ලීම් {pendingRequests.length - 1}ක් පෝලිමේ ඇත (Queued requests)
                    </p>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.4 }}
          >
            {activeTab === 'home' && (
               <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto pt-2 pb-10">
                 {/* Top Header matching screenshot */}
                 <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex flex-col gap-6">
                    <div className="flex bg-white items-center gap-4">
                       <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 text-white shrink-0 overflow-hidden">
                          <img src={orgSettings?.logoUrl || logo} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white" />
                       </div>
                       <div>
                          <h1 className="text-2xl md:text-3xl font-black text-slate-800 font-display flex items-center gap-3">
                             MYM BizFlow <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold uppercase tracking-widest self-center md:self-auto mt-2 md:mt-0">V2.0</span>
                          </h1>
                          <p className="text-slate-500 text-sm md:text-base mt-2 md:mt-1 font-medium">{lang === 'si' ? 'විකුණුම් සහ තොග කළමනාකරණ පරිපාලක පද්ධතිය' : 'Sales & Inventory Admin System'}</p>
                       </div>
                    </div>
                    <div className="flex flex-wrap gap-3 items-center justify-between border-t border-slate-100 pt-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <button onClick={handleLangChange} className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-full text-slate-700 font-bold hover:bg-slate-50 transition-colors bg-white">
                          <Globe size={18} className="text-blue-500" /> {lang === 'si' ? 'සිංහල' : 'English'}
                        </button>
                        <button onClick={handleTestConnection} className="p-2 border border-slate-200 rounded-full text-blue-500 hover:bg-blue-50 transition-colors bg-white" title="Sync">
                          <RefreshCw size={18} className={syncStatus.checking ? 'animate-spin' : ''} />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-2 border border-slate-200 rounded-full bg-white flex-1 sm:flex-none">
                           <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                           <div className="truncate">
                             <div className="text-sm font-bold text-slate-800 truncate">{currentUser?.email || 'admin@example.com'}</div>
                             <div className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">{currentUser?.role?.replace('_', ' ') || 'ADMIN'}</div>
                           </div>
                        </div>
                        <Link to="/" className="flex items-center gap-2 px-4 py-2 border border-rose-100 bg-rose-50 rounded-full text-rose-600 font-bold hover:bg-rose-100 transition-colors shrink-0">
                          <LogOut size={16} /> <span className="hidden sm:inline">Logout</span>
                        </Link>
                      </div>
                    </div>
                 </div>

                 {/* Colorful Cards Grid */}
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                   {allTabs.filter(t => {
                     // Check role-based access for this tab
                     if (currentUser?.role === 'stock_keeper' || currentUser?.role === 'driver' || currentUser?.role === 'other') {
                       if (currentUser?.role === 'driver') return ['routes', 'dashboard', 'settings'].includes(t.id);
                       if (currentUser?.role === 'other') return ['dashboard', 'settings'].includes(t.id);
                       return ['inventory', 'returns', 'reps', 'alerts', 'dashboard', 'settings', 'attendance'].includes(t.id);
                     }
                     if (t.id === 'deploy' && currentUser?.role !== 'super_admin') return false; 
                     return true;
                   }).map(tab => (
                     <button
                       key={tab.id}
                       onClick={() => {
                          if (tab.id === 'invoicing') {
                             if (currentUser) {
                                sessionStorage.setItem('current_rep', JSON.stringify(currentUser));
                             }
                             navigate('/rep');
                          } else {
                             setActiveTab(tab.id);
                          }
                       }}
                       className={`flex flex-col items-center justify-between p-6 md:p-8 bg-gradient-to-br ${tab.cardBg || 'from-slate-50 to-white'} rounded-[2rem] shadow-[0_4px_25px_rgba(0,0,0,0.02)] hover:-translate-y-1.5 transition-all duration-300 border-2 ${tab.borderColor || 'border-slate-100'} ${tab.borderHover || 'hover:border-slate-300'} ${tab.shadowHover || 'hover:shadow-slate-500/10'} aspect-square group relative overflow-hidden`}
                     >
                       {/* Sleek top indicator bar */}
                       <div className={`absolute top-0 left-0 right-0 h-2 ${tab.accentColor || 'bg-slate-500'}`} />
                       
                       {/* Subtle transparent background glow */}
                       <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full ${tab.accentColor || 'bg-slate-500'} opacity-5 blur-xl group-hover:scale-150 transition-transform duration-500`} />

                       <div className="flex-1 flex flex-col items-center justify-center w-full">
                         <div className={`p-4 md:p-5 rounded-[1.5rem] mb-4 md:mb-5 transition-all duration-300 group-hover:scale-110 ${tab.iconBg || 'bg-slate-100 text-slate-700'} flex items-center justify-center shadow-lg`}>
                           {tab.icon}
                         </div>
                         <span className="font-extrabold text-slate-800 text-sm md:text-base lg:text-lg text-center tracking-tight transition-colors duration-300 group-hover:text-slate-900 px-1 leading-snug">
                           {tab.label}
                         </span>
                       </div>
                     </button>
                   ))}
                 </div>
               </div>
            )}
            {activeTab === 'trends' && <TrendsTab />}
            {activeTab === 'dashboard' && <OverviewTab repsList={repsList} isGhostMode={isGhostMode} />}
            {activeTab === 'invoicing' && <InvoicingTab t={t} items={globalItems} setItems={updateGlobalItems} customers={customers} setCustomers={updateCustomers} repsList={repsList} orgSettings={orgSettings} />}
            {activeTab === 'inventory' && <InventoryTab items={globalItems} setItems={updateGlobalItems} pendingRequests={pendingRequests} setPendingRequests={setPendingRequests} suppliers={suppliers} />}
            {activeTab === 'suppliers' && <SuppliersTab suppliers={suppliers} setSuppliers={updateSuppliers} setActiveTab={setActiveTab} items={globalItems} />}
            {activeTab === 'customers' && <CustomersTab customers={customers} setCustomers={updateCustomers} />}
            {activeTab === 'purchasing' && <PurchasingTab items={globalItems} setItems={updateGlobalItems} suppliers={suppliers} />}
            {activeTab === 'credit' && <CreditBillsTab />}
            {activeTab === 'expenses' && <ExpensesTab />}
            {activeTab === 'cashbook' && <CashBookTab />}
            {activeTab === 'payment_history' && <PaymentHistoryTab repsList={repsList} />}
            {activeTab === 'daily_settlements' && <DailySettlementsTab lang={lang} repsList={repsList} />}
            {activeTab === 'reps' && <RepsTab items={globalItems} setItems={updateGlobalItems} suppliers={suppliers} setSuppliers={updateSuppliers} />}
            {activeTab === 'returns' && <ReturnsTab returnStock={returnStock} setReturnStock={updateReturnStock} pendingRequests={pendingRequests} setPendingRequests={setPendingRequests} />}
            {activeTab === 'diagnostic' && <DiagnosticTab items={globalItems} repsList={repsList} />}
            {activeTab === 'approvals' && (
              <div className="space-y-8">
                <ApprovalsTab />
                <SpecialApprovalsTab items={globalItems} setItems={updateGlobalItems} />
              </div>
            )}
            {activeTab === 'alerts' && <AlertsTab />}
            {activeTab === 'attendance' && <AttendancePayrollTab lang={lang} />}
            {activeTab === 'targets' && <RepTargetsCommissionTab sales={allSalesData} users={getUsers()} lang={lang} />}
            {activeTab === 'settings' && <SettingsTab lang={lang} />}
            {activeTab === 'routes' && <RepRoutes lang={lang} />}
            {activeTab === 'quota' && <FirebaseQuotaWidget lang={lang} />}
            {activeTab === 'deploy' && <DeployTab />}
          </motion.div>
        </div>
      </div>

    </div>
  );
}

// Add this at the end of the file, before the closing brace if needed, or create a new block
function DiagnosticTab({ items, repsList }: { items: any[], repsList: any[] }) {
  const [syncResults, setSyncResults] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<AIActionRequest[]>([]);

  useEffect(() => {
    const all = getAIActionRequests();
    setRecentTransactions(all.filter(r => r.actionType === 'rep_load').slice(-20));
  }, []);

  const verifySync = () => {
     const results = repsList.map(rep => {
         const repInv = getRepInventory(rep.id);
         let inconsistencies = 0;
         repInv.forEach(item => {
             const mainItem = items.find(i => String(i.id) === String(item.id));
             if (mainItem && item.stockInMain !== mainItem.stock) {
                 inconsistencies++;
             }
         });
         return { repName: rep.name, inconsistencies };
     });
     setSyncResults(results);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-4xl font-bold text-slate-800 tracking-tight">Sync Diagnostics</h3>
        <p className="text-slate-500 mt-1">Verify stock consistency and recent transactions</p>
      </div>

      <button onClick={verifySync} className="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-purple-700 shadow-lg shadow-purple-500/30">
        Verify Sync Consistency
      </button>

      {syncResults.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100">
           <h4 className="font-bold text-purple-800 mb-4">Sync Consistency Report</h4>
           <div className="space-y-2">
             {syncResults.map((r, i) => (
                <div key={i} className={`p-3 rounded-xl flex justify-between ${r.inconsistencies > 0 ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                   <span>{r.repName}</span>
                   <span>{r.inconsistencies === 0 ? 'In Sync' : `${r.inconsistencies} inconsistencies`}</span>
                </div>
             ))}
           </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
         <h4 className="font-bold text-slate-800 mb-4">Recent Stock Load Transactions</h4>
         <div className="space-y-2">
           {recentTransactions.map(t => (
             <div key={t.id} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center">
                <div>
                   <div className="font-bold">{t.repName}</div>
                   <div className="text-xs text-slate-500">{new Date(Number(t.timestamp)).toLocaleString()}</div>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-bold ${t.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                   {t.status}
                </div>
             </div>
           ))}
         </div>
      </div>
    </div>
  );
}

function InvoicingTab({ t, items, setItems, customers, setCustomers, repsList, orgSettings }: { t: (key: string) => string, items: any[], setItems: any, customers: any[], setCustomers: any, repsList: any[], orgSettings: any }) { 
  
  const [mode, setMode] = useState<'sale' | 'credit'>('sale');
  const [billingMode, setBillingMode] = useState<'wholesale' | 'retail'>('retail');
  const [cart, setCart] = useState<any[]>([]);
  const [customer, setCustomer] = useState('');
  const [address, setAddress] = useState('');
  const [paymentType, setPaymentType] = useState('Cash');
  const [splitCashAmount, setSplitCashAmount] = useState('');
  const [splitChequeAmount, setSplitChequeAmount] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [partialAmount, setPartialAmount] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [initialCredit, setInitialCredit] = useState<string>('');
  const [creditReceivedAmount, setCreditReceivedAmount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [locationStr, setLocationStr] = useState<string>('');
  const [selectedRepId, setSelectedRepId] = useState<string>('admin');
  const [previewSale, setPreviewSale] = useState<any>(null);
  const [customItems, setCustomItems] = useState<any[]>([]);

  const [showAllRecentBills, setShowAllRecentBills] = useState(false);
  const [billFilter, setBillFilter] = useState<'today' | 'all'>('today');
  const [repFilter, setRepFilter] = useState<string>('all');
  const orgId = getActiveOrgId();

  const [salesHistory, setSalesHistory] = useState<any[]>(() => {
    const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
    return stored ? JSON.parse(stored) : [];
  });

  const loadSalesHistory = async () => {
    try {
      const data = await fetchTableData('sales');
      if (data && Array.isArray(data)) {
        setSalesHistory(data);
        localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(data));
        localStorage.setItem('bizflow_sales_v1', JSON.stringify(data));
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadSalesHistory();

    const handleSync = (e: any) => {
      const table = e?.detail?.table;
      if (table && table !== 'sales') return;
      if (e?.detail?.data && Array.isArray(e.detail.data) && (table === 'sales' || !table)) {
        setSalesHistory(e.detail.data);
      } else {
        const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
        if (stored) {
          try { setSalesHistory(JSON.parse(stored)); } catch (err) {}
        }
      }
    };

    window.addEventListener('bizflow_sync', handleSync);
    window.addEventListener('bizflow_sales_updated', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('bizflow_sync', handleSync);
      window.removeEventListener('bizflow_sales_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [orgId]);

  const handleCancelSale = async (sale: any) => {
    if (!sale) return;
    const isAlreadyCancelled = sale.status === 'cancelled';
    const confirmMsg = isAlreadyCancelled
      ? 'මෙම අවලංගු කළ බිල්පත පද්ධතියෙන් සහ ඉතිහාසයෙන් මුළුමනින්ම මකා දැමීමට (Delete) අවශ්‍යද?'
      : 'ඔබට විශ්වාසද මෙම බිල්පත අවලංගු කර මකා දැමීමට (Cancel & Delete) අවශ්‍යද?';

    if (!window.confirm(confirmMsg)) return;

    const targetId = sale.id || sale.docId;
    addToSyncQueue({ table: 'sales', action: 'delete', data: { id: targetId, docId: sale.docId } });

    const updated = salesHistory.filter(s => String(s.id) !== String(targetId) && String(s.docId || '') !== String(targetId));
    setSalesHistory(updated);
    localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(updated));
    localStorage.setItem('bizflow_sales_v1', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('bizflow_sales_updated', { detail: { table: 'sales', data: updated } }));
    window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: updated } }));
  };

  const filteredRecentBills = salesHistory.filter(sale => {
    if (!sale) return false;
    
    // Rep filter
    if (repFilter !== 'all') {
      const isSaleAdmin = sale.issuedByAdmin || sale.repId === 'admin';
      if (repFilter === 'admin' && !isSaleAdmin) return false;
      if (repFilter !== 'admin' && String(sale.repId) !== String(repFilter)) return false;
    }

    // Date filter
    if (billFilter === 'today') {
      const rawDate = sale.createdAt || sale.date;
      if (!rawDate) return false;

      const now = new Date();
      const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      if (sale.date && typeof sale.date === 'string' && sale.date.includes(todayYMD)) {
        return true;
      }

      const d = typeof rawDate === 'number' ? new Date(rawDate) : (!isNaN(Number(rawDate)) ? new Date(Number(rawDate)) : new Date(rawDate));
      if (isNaN(d.getTime())) return false;

      const dYMD = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dYMD === todayYMD;
    }

    return true;
  });

  const displayItems = React.useMemo(() => {
    const map = new Map<string, any>();

    // 1. First add all global items
    (items || []).forEach(g => {
      map.set(g.id, {
        ...g,
        mainStock: g.stock !== undefined ? g.stock : 0,
        repStock: 0
      });
    });

    // 2. If a specific Rep is selected, merge rep's stock
    if (selectedRepId && selectedRepId !== 'admin') {
      const repInv = getRepInventory(selectedRepId) || [];
      repInv.forEach(r => {
        const itemKey = String(r.id);
        const stockQty = r.myStock || 0;
        if (map.has(itemKey)) {
          const existing = map.get(itemKey)!;
          existing.repStock = stockQty;
        } else {
          map.set(itemKey, {
            id: itemKey,
            name: r.name,
            category: (r as any).category || 'General',
            supplier: (r as any).supplier || '',
            maxPrice: r.maxPrice || 0,
            costPrice: r.costPrice || 0,
            stock: 0,
            mainStock: 0,
            repStock: stockQty
          });
        }
      });
    }

    // 3. Merge manually added custom items
    customItems.forEach(c => {
      if (!map.has(c.id)) {
        map.set(c.id, c);
      }
    });

    return Array.from(map.values());
  }, [items, selectedRepId, customItems]);

  const handleAddQuickItem = (prefillName = '') => {
    const namePrompt = prompt("බඩුවේ නම ඇතුළත් කරන්න (Item Name):", prefillName || searchQuery || "");
    if (!namePrompt || !namePrompt.trim()) return;
    const pricePrompt = prompt(`"${namePrompt.trim()}" සඳහා විකුණුම් මිල (Price LKR):`, "100");
    if (!pricePrompt) return;
    const priceNum = parseFloat(pricePrompt) || 0;
    
    const newItem = {
      id: 'custom_' + Date.now(),
      name: namePrompt.trim(),
      category: 'General',
      supplier: 'Custom',
      maxPrice: priceNum,
      costPrice: priceNum,
      stock: 999,
      mainStock: 999,
      repStock: 999,
      isCustom: true
    };

    setCustomItems(prev => [newItem, ...prev]);
    addToCart(newItem);
  };

  React.useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocationStr(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
        (err) => console.log(err)
      );
    }
  }, []);

  const isSoyaItem = (name: string) => {
    if (!name) return false;
    const n = String(name).toLowerCase();
    return n.includes('soya') || n.includes('සෝයා');
  };

  const getCustomerLastPrice = (custName: string, itemId: string) => {
    if (!custName || !custName.trim()) return null;
    const cleanCust = custName.trim().toLowerCase();
    const orgId = getActiveOrgId();
    const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
    if (!stored) return null;
    try {
      const allSales: any[] = JSON.parse(stored);
      for (let i = allSales.length - 1; i >= 0; i--) {
        const s = allSales[i];
        if (s.customer && s.customer.trim().toLowerCase() === cleanCust && Array.isArray(s.items)) {
          const match = s.items.find((ci: any) => String(ci.id) === String(itemId) && !ci.isReturn);
          if (match && match.price !== undefined && match.price !== null && Number(match.price) > 0) {
            return Number(match.price);
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const addToCart = (item: any, isReturn = false) => {
    const cartId = item.id + (isReturn ? '_return' : '_sale');
    const existing = cart.find(c => c.cartId === cartId);
    
    // Calculate price based on customer's last purchase or mode
    const lastPrice = getCustomerLastPrice(customer, item.id);
    const cost = item.costPrice || item.maxPrice;
    const defaultCalcPrice = billingMode === 'wholesale' ? (cost * 1.05) : (cost * 1.20);
    const price = (lastPrice && lastPrice > 0 && !isReturn) ? lastPrice : (item.maxPrice || defaultCalcPrice);
    
    if (existing) {
      setCart(cart.map(c => {
        if (c.cartId === cartId) {
          const newQty = c.qty + 1;
          let freeQty = c.freeQty || 0;
          if (c.isFreeScheme) {
            if (c.freeThreshold && c.freeThreshold > 0) {
              freeQty = Math.floor(newQty / c.freeThreshold) * (c.freeBonus || 0);
            } else if (isSoyaItem(c.name)) {
              if (newQty >= 60) freeQty = 10;
              else if (newQty >= 30) freeQty = 3;
              else if (newQty >= 15) freeQty = 1;
              else freeQty = 0;
            } else {
              freeQty = Math.floor(newQty / 12);
            }
          }
          return { ...c, qty: newQty, freeQty };
        }
        return c;
      }));
    } else {
      setCart([...cart, { ...item, cartId, qty: 1, price: price, isReturn, isSample: false, freeQty: 0, isFreeScheme: false }]);
    }
  };

  const updateCartPrice = (cartId: string, priceStr: string) => {
    let p = parseFloat(priceStr);
    const item = cart.find(c => c.cartId === cartId);
    if (!item) return;
    if (isNaN(p)) p = item.maxPrice;
    setCart(cart.map(c => c.cartId === cartId ? { ...c, price: p } : c));
  };

  const updateCartQty = (cartId: string, qtyStr: string) => {
    const qty = parseFloat(qtyStr) || 0;
    setCart(cart.map(c => {
      if (c.cartId === cartId) {
        let freeQty = c.freeQty || 0;
        if (c.isFreeScheme) {
          if (c.freeThreshold && c.freeThreshold > 0) {
            freeQty = Math.floor(qty / c.freeThreshold) * (c.freeBonus || 0);
          } else if (isSoyaItem(c.name)) {
            if (qty >= 60) freeQty = 10;
            else if (qty >= 30) freeQty = 3;
            else if (qty >= 15) freeQty = 1;
            else freeQty = 0;
          } else {
            freeQty = Math.floor(qty / 12);
          }
        }
        return { ...c, qty: isNaN(qty) ? 0 : qty, freeQty };
      }
      return c;
    }));
  };

  const toggleFreeScheme = (cartId: string, enabled: boolean) => {
    setCart(cart.map(c => {
      if (c.cartId === cartId) {
        const qty = parseFloat(c.qty) || 0;
        let freeQty = c.freeQty || 0;
        if (enabled) {
          if (c.freeThreshold && c.freeThreshold > 0) {
            freeQty = Math.floor(qty / c.freeThreshold) * (c.freeBonus || 0);
          } else if (isSoyaItem(c.name)) {
            if (qty >= 60) freeQty = 10;
            else if (qty >= 30) freeQty = 3;
            else if (qty >= 15) freeQty = 1;
            else freeQty = 0;
          } else {
            freeQty = Math.floor(qty / 12);
          }
        } else {
          freeQty = 0;
        }
        return { ...c, isFreeScheme: enabled, freeQty };
      }
      return c;
    }));
  };

  const subTotal = cart.reduce((acc, curr) => curr.isReturn ? acc - (curr.price * (Number(curr.qty) || 0)) : acc + ((curr.isSample ? 0 : curr.price) * (Number(curr.qty) || 0)), 0);
  const discountAmount = subTotal * ((invoiceDiscount || 0) / 100);
  const total = Math.max(0, subTotal - discountAmount);

  const [printData, setPrintData] = useState<any>(null);
  const [triggerPrint, setTriggerPrint] = useState(0);
  const [requestedCopies, setRequestedCopies] = useState<number>(1);
  const [printImageSrc, setPrintImageSrc] = useState<string | null>(null);
  const [isGeneratingPrintImage, setIsGeneratingPrintImage] = useState(false);

  React.useEffect(() => {
    if (triggerPrint > 0) {
      console.log("Admin Triggering print...");
      setIsGeneratingPrintImage(false);
      setPrintImageSrc(null); // Ensure raw HTML is rendered
      const timer = setTimeout(() => {
        window.print();
        setTriggerPrint(0);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [triggerPrint]);

  const performFinalizeTransaction = (saleData: any) => {
    if (saleData.mode === 'sale') {
      const updatedMainItems: any[] = [];
      const newItems = items.map(item => {
        let soldQty = 0;
        let returnQty = 0;
        saleData.items.forEach((c: any) => {
          if (String(c.id) === String(item.id)) {
            if (c.isReturn) returnQty += (Number(c.qty) || 0);
            else soldQty += (Number(c.qty) || 0) + (Number(c.freeQty) || 0);
          }
        });
        if (soldQty > 0 || returnQty > 0) {
          const updatedItem = {
            ...item,
            stock: item.stock - soldQty + returnQty
          };
          updatedMainItems.push(updatedItem);
          return updatedItem;
        }
        return item;
      });
      setItems(newItems, 'update');

      // Sync every updated main stock item
      updatedMainItems.forEach(updatedItem => {
        addToSyncQueue({ table: 'inventory', action: 'update', data: updatedItem });
      });

      const orgId = getActiveOrgId();
      localStorage.setItem(`bizflow_${orgId}_admin_inventory_v1`, JSON.stringify(newItems));
      localStorage.setItem(`bizflow_admin_inventory_v1`, JSON.stringify(newItems));
      
      if (saleData.customer && saleData.customer.trim()) {
        const trimmedCustName = saleData.customer.trim();
        const targetCust = customers.find(c => (c.name || '').toLowerCase().trim() === trimmedCustName.toLowerCase());
        let updatedCustList: any[] = [];
        let syncedCustObj: any = null;
        let custAction: 'update' | 'insert' = 'update';

        if (targetCust) {
          syncedCustObj = { 
            ...targetCust, 
            balance: saleData.newBalance !== undefined ? saleData.newBalance : Math.max(0, (targetCust.balance || 0)),
            location: saleData.address || targetCust.location || '',
            updatedAt: Date.now()
          };
          updatedCustList = customers.map(c => c.id === targetCust.id ? syncedCustObj : c);
          custAction = 'update';
        } else {
          syncedCustObj = {
            id: 'cust_' + Date.now(),
            name: trimmedCustName,
            balance: saleData.newBalance || 0,
            location: saleData.address || '',
            phone: '',
            organizationId: orgId,
            updatedAt: Date.now(),
            createdAt: new Date().toISOString()
          };
          updatedCustList = [...customers, syncedCustObj];
          custAction = 'insert';
        }

        setCustomers(updatedCustList);
        localStorage.setItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(updatedCustList));
        localStorage.setItem('bizflow_MYM-BIZFLOW_customers_v1', JSON.stringify(updatedCustList));
        localStorage.setItem('bizflow_customers_v1', JSON.stringify(updatedCustList));
        addToSyncQueue({ table: 'customers', action: custAction, data: syncedCustObj });
        window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'customers', data: updatedCustList } }));
      }

      addToSyncQueue({
          table: 'sales',
          action: 'insert',
          data: saleData
        });

      const currentOrgId = getActiveOrgId();
      const storedSalesStr = localStorage.getItem(`bizflow_${currentOrgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
      let allSales: any[] = [];
      try { allSales = JSON.parse(storedSalesStr); } catch (e) {}
      const salesMap = new Map<string, any>();
      if (Array.isArray(allSales)) {
        allSales.forEach((s: any) => { if (s && s.id) salesMap.set(String(s.id), s); });
      }
      salesMap.set(String(saleData.id), saleData);
      const getEpoch = (s: any) => new Date(s.createdAt || s.date || 0).getTime();
      const newAllSales = Array.from(salesMap.values()).sort((a: any, b: any) => getEpoch(b) - getEpoch(a));
      localStorage.setItem(`bizflow_${currentOrgId}_sales_v1`, JSON.stringify(newAllSales));
      localStorage.setItem('bizflow_sales_v1', JSON.stringify(newAllSales));
      window.dispatchEvent(new CustomEvent('bizflow_sales_updated', { detail: { table: 'sales', data: newAllSales } }));
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: newAllSales } }));

    } else {
        const orgId = getActiveOrgId();
        if (saleData.customer && saleData.customer.trim()) {
          const trimmedCustName = saleData.customer.trim();
          const targetCust = customers.find(c => (c.name || '').toLowerCase().trim() === trimmedCustName.toLowerCase());
          let updatedCustList: any[] = [];
          let syncedCustObj: any = null;
          let custAction: 'update' | 'insert' = 'update';

          if (targetCust) {
            syncedCustObj = { 
              ...targetCust, 
              balance: saleData.newBalance !== undefined ? saleData.newBalance : Math.max(0, (targetCust.balance || 0)),
              location: saleData.address || targetCust.location || '',
              updatedAt: Date.now()
            };
            updatedCustList = customers.map(c => c.id === targetCust.id ? syncedCustObj : c);
            custAction = 'update';
          } else {
            syncedCustObj = {
              id: 'cust_' + Date.now(),
              name: trimmedCustName,
              balance: saleData.newBalance || 0,
              location: saleData.address || '',
              phone: '',
              organizationId: orgId,
              updatedAt: Date.now(),
              createdAt: new Date().toISOString()
            };
            updatedCustList = [...customers, syncedCustObj];
            custAction = 'insert';
          }

          setCustomers(updatedCustList);
          localStorage.setItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(updatedCustList));
          localStorage.setItem('bizflow_MYM-BIZFLOW_customers_v1', JSON.stringify(updatedCustList));
          localStorage.setItem('bizflow_customers_v1', JSON.stringify(updatedCustList));
          addToSyncQueue({ table: 'customers', action: custAction, data: syncedCustObj });
          window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'customers', data: updatedCustList } }));
        }

        addToSyncQueue({
             table: 'sales',
             action: 'insert',
             data: saleData
           });

        const currentOrgId = getActiveOrgId();
        const storedSalesStr = localStorage.getItem(`bizflow_${currentOrgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
        let allSales: any[] = [];
        try { allSales = JSON.parse(storedSalesStr); } catch (e) {}
        const salesMap = new Map<string, any>();
        if (Array.isArray(allSales)) {
          allSales.forEach((s: any) => { if (s && s.id) salesMap.set(String(s.id), s); });
        }
        salesMap.set(String(saleData.id), saleData);
        const getEpoch = (s: any) => new Date(s.createdAt || s.date || 0).getTime();
        const newAllSales = Array.from(salesMap.values()).sort((a: any, b: any) => getEpoch(b) - getEpoch(a));
        localStorage.setItem(`bizflow_${currentOrgId}_sales_v1`, JSON.stringify(newAllSales));
        localStorage.setItem('bizflow_sales_v1', JSON.stringify(newAllSales));
        window.dispatchEvent(new CustomEvent('bizflow_sales_updated', { detail: { table: 'sales', data: newAllSales } }));
        window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: newAllSales } }));
    }
  };

  const handlePreviewBill = () => {
    const commonId = mode === 'sale' ? 'INV-' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(-2) : 'CR-' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(-2);
    
    const currentTargetCust = customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim());
    const rawPreviousBalance = currentTargetCust?.balance || 0;
    const hasInitCreditInput = initialCredit !== '' && initialCredit !== undefined && !isNaN(parseFloat(initialCredit));
    const initCredValue = hasInitCreditInput ? parseFloat(initialCredit) : 0;
    
    // Fix: When initialCredit (edited arrears) is entered, it REPLACES rawPreviousBalance instead of adding to it.
    const effectivePreviousBalance = hasInitCreditInput ? initCredValue : rawPreviousBalance;
    
    let newBalance = effectivePreviousBalance;
    let addedCredit = 0;
    
    const cVal = parseFloat(splitCashAmount) || 0;
    const chkVal = parseFloat(splitChequeAmount) || 0;
    const splitTotalPaid = cVal + chkVal;

    if (mode === 'sale') {
      const paid = paymentType === 'Cash + Cheque'
        ? splitTotalPaid
        : (paymentType === 'Cash' || paymentType === 'Cheque' || !paymentType)
          ? (partialAmount ? parseFloat(partialAmount) : Number(total))
          : parseFloat(partialAmount || '0');
      addedCredit = Math.max(0, Number(total) - paid);
      newBalance = Math.max(0, newBalance + Number(total) - paid);
    } else if (mode === 'credit') {
      const paidAmount = paymentType === 'Cash + Cheque' ? splitTotalPaid : parseFloat(creditReceivedAmount || '0');
      newBalance = Math.max(0, newBalance - paidAmount);
    }

    let saleData: any = {};
    if (mode === 'sale') {
      saleData = {
        id: commonId,
        repId: selectedRepId,
        issuedByAdmin: true,
        customer,
        address,
        locationStr,
        paymentType,
        cashAmount: paymentType === 'Cash + Cheque' ? cVal : (paymentType === 'Cash' ? (partialAmount ? parseFloat(partialAmount) : Number(total)) : 0),
        chequeAmount: paymentType === 'Cash + Cheque' ? chkVal : (paymentType === 'Cheque' ? (partialAmount ? parseFloat(partialAmount) : Number(total)) : 0),
        chequeNo: chequeNo || '',
        total: Number(total),
        invoiceDiscount: Number(invoiceDiscount || 0),
        discountAmount: Number(discountAmount),
        partialAmount: partialAmount ? parseFloat(partialAmount) : ((paymentType === 'Cash' || !paymentType) ? Number(total) : 0),
        creditReceivedAmount: 0,
        addedCredit,
        items: cart,
        mode,
        previousBalance: effectivePreviousBalance,
        initialCredit: 0,
        newBalance,
        createdAt: new Date().toISOString()
      };
    } else {
      saleData = {
        id: commonId,
        repId: 'admin',
        issuedByAdmin: true,
        customer,
        mode: 'credit',
        creditReceivedAmount: parseFloat(creditReceivedAmount || '0'),
        total: 0,
        addedCredit: 0,
        previousBalance: effectivePreviousBalance,
        initialCredit: 0,
        newBalance,
        createdAt: new Date().toISOString()
      };
    }
    setPreviewSale(saleData);
  };

  const handleConfirmPrint = async (saleObj: any, imageBlob?: Blob, canvas?: HTMLCanvasElement, copies: number = 1) => {
    performFinalizeTransaction(saleObj);
    if (copies > 0) {
      setRequestedCopies(copies);
      setPrintData(saleObj);
      setTriggerPrint(prev => prev + 1);
    }
    setPreviewSale(null);
  };

  const generateShareText = (saleObj: any) => {
    const repName = saleObj.repId === 'admin' ? 'Head Office' : (repsList.find(r => r.id === saleObj.repId)?.name || 'Rep');
    let text = `✨ *${orgSettings.name.toUpperCase()}* ✨\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (orgSettings.address) text += `📍 ${orgSettings.address}\n`;
    if (orgSettings.phone) text += `📞 ${orgSettings.phone}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `📅 *Date:* ${new Date(saleObj.createdAt).toLocaleString()}\n`;
    text += `👤 *Customer:* ${saleObj.customer}\n`;
    if (saleObj.address) text += `🏠 *Address:* ${saleObj.address}\n`;
    text += `🧑‍💼 *Rep:* ${repName}\n`;
    if (saleObj.locationStr) text += `🗺️ *Location:* ${saleObj.locationStr}\n`;
    text += `📑 *Invoice No:* ${saleObj.id || 'INV-' + Date.now().toString().slice(-6)}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (saleObj.mode === 'sale') {
      text += `*ITEMS PURCHASED:*\n`;
      (saleObj.items || []).forEach((c: any) => {
        text += `${c.isReturn ? '🔄 ' : '🔹 '}${c.isSample ? '[SAMPLE] ' : ''}${c.name}${c.supplier ? ` (${c.supplier})` : ''}\n`;
        text += `   ${Number(c.qty)} x Rs ${Number(c.price).toFixed(2)} = *${c.isSample ? 'FREE' : `Rs ${(Number(c.qty) * Number(c.price)).toFixed(2)}`}*\n`;
        if (c.isSample) text += `   🎁 Sample Value: Rs ${(Number(c.qty) * Number(c.price)).toFixed(2)}\n`;
      });
      text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (saleObj.invoiceDiscount > 0) {
        text += `💰 *GROSS TOTAL: Rs ${(Number(saleObj.total) + Number(saleObj.discountAmount)).toFixed(2)}*\n`;
        text += `🎁 *DISCOUNT (${saleObj.invoiceDiscount}%): - Rs ${Number(saleObj.discountAmount).toFixed(2)}*\n`;
      }
      text += `💰 *NET TOTAL: Rs ${Number(saleObj.total).toFixed(2)}*\n`;
      text += `💳 *Payment:* ${saleObj.paymentType}\n`;
      
      if (saleObj.paymentType === 'Half-payment') {
        text += `💵 *Paid:* Rs ${parseFloat(saleObj.partialAmount || '0').toFixed(2)}\n`;
        text += `📉 *Balance:* Rs ${(Number(saleObj.total) - parseFloat(saleObj.partialAmount || '0')).toFixed(2)}\n`;
      }
      
      const targetCust = customers.find(c => (c.name || '').toLowerCase() === (saleObj.customer || '').toLowerCase());
      if (targetCust) {
          text += `📊 *Total Outstanding:* Rs ${(targetCust.balance || 0).toFixed(2)}\n`;
      }
    } else {
      text += `💎 *CREDIT SETTLEMENT*\n`;
      text += `✅ *Amount Received:* Rs ${Number(saleObj.creditReceivedAmount).toFixed(2)}\n`;
      const targetCust = customers.find(c => (c.name || '').toLowerCase() === (saleObj.customer || '').toLowerCase());
      if (targetCust) {
          text += `📉 *Remaining Balance:* Rs ${(targetCust.balance || 0).toFixed(2)}\n`;
      }
    }

    text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🙏 *බොහෝම ස්තුතියි! / THANK YOU!* \n`;
    text += `_System by MYM BizFlow_`;
    return text;
  };

  const handleConfirmShareImage = async (saleObj: any, imageBlob: Blob) => {
     const file = new File([imageBlob], `Invoice-${saleObj.id || 'bill'}.png`, { type: "image/png" });
     
     if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Invoice - ${saleObj.customer || 'MYM BIZFLOW'}`
         });
        } catch (err: any) {
          if (err.name !== 'AbortError') console.error('Error sharing image', err);
        }
     } else {
        const url = URL.createObjectURL(imageBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Invoice-${saleObj.id || 'bill'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
     }

     performFinalizeTransaction(saleObj);
     setPreviewSale(null);
  };

  const handleConfirmShareText = async (saleObj: any) => {
     const text = generateShareText(saleObj);
     
     if (navigator.share) {
        try {
          await navigator.share({
            title: 'Invoice from MYM BIZFLOW',
            text: text,
          });
        } catch (err: any) {
           if (err.name !== 'AbortError') {
             const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
             window.open(waUrl, '_blank');
           }
        }
     } else {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
     }

     performFinalizeTransaction(saleObj);
     setPreviewSale(null);
  };

  const shareBill = async () => {
    const repName = selectedRepId === 'admin' ? 'Head Office' : (repsList.find(r => r.id === selectedRepId)?.name || 'Rep');
    let text = `✨ *${orgSettings.name.toUpperCase()}* ✨\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (orgSettings.address) text += `📍 ${orgSettings.address}\n`;
    if (orgSettings.phone) text += `📞 ${orgSettings.phone}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `📅 *Date:* ${new Date().toLocaleString()}\n`;
    text += `👤 *Customer:* ${customer}\n`;
    if (address) text += `🏠 *Address:* ${address}\n`;
    text += `🧑‍💼 *Rep:* ${repName}\n`;
    if (locationStr) text += `🗺️ *Location:* ${locationStr}\n`;
    text += `📑 *Invoice No:* INV-${Date.now().toString().slice(-6)}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (mode === 'sale') {
      text += `*ITEMS PURCHASED:*\n`;
      cart.forEach(c => {
        text += `${c.isReturn ? '🔄 ' : '🔹 '}${c.isSample ? '[SAMPLE] ' : ''}${c.name}${c.supplier ? ` (${c.supplier})` : ''}\n`;
        text += `   ${Number(c.qty)} x Rs ${Number(c.price).toFixed(2)} = *${c.isSample ? 'FREE' : `Rs ${(Number(c.qty) * Number(c.price)).toFixed(2)}`}*\n`;
        if (c.isSample) text += `   🎁 Sample Value: Rs ${(Number(c.qty) * Number(c.price)).toFixed(2)}\n`;
      });
      text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
      if (invoiceDiscount > 0) {
        text += `💰 *GROSS TOTAL: Rs ${(Number(total) + Number(invoiceDiscount)).toFixed(2)}*\n`;
        text += `🎁 *DISCOUNT: - Rs ${Number(invoiceDiscount).toFixed(2)}*\n`;
      }
      text += `💰 *NET TOTAL: Rs ${Number(total).toFixed(2)}*\n`;
      text += `💳 *Payment:* ${paymentType}\n`;
      
      if (paymentType === 'Half-payment') {
        text += `💵 *Paid:* Rs ${parseFloat(partialAmount || '0').toFixed(2)}\n`;
        text += `📉 *Balance:* Rs ${(Number(total) - parseFloat(partialAmount || '0')).toFixed(2)}\n`;
      }
      
      // Add Customer Outstanding if it exists
      const targetCust = customers.find(c => (c.name || '').toLowerCase() === (customer || '').toLowerCase());
      if (targetCust) {
          text += `📊 *Total Outstanding:* Rs ${(targetCust.balance || 0).toFixed(2)}\n`;
      }
    } else {
      text += `💎 *CREDIT SETTLEMENT*\n`;
      text += `✅ *Amount Received:* Rs ${Number(creditReceivedAmount).toFixed(2)}\n`;
      const targetCust = customers.find(c => (c.name || '').toLowerCase() === (customer || '').toLowerCase());
      if (targetCust) {
          text += `📉 *Remaining Balance:* Rs ${(targetCust.balance || 0).toFixed(2)}\n`;
      }
    }

    text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🙏 *බොහෝම ස්තුතියි! / THANK YOU!* \n`;
    text += `_System by MYM BizFlow_`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Invoice from MYM BIZFLOW',
          text: text,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error sharing', err);
        }
      }
    } else {
      alert("Sharing not supported on this browser.\n\n" + text);
    }
  };

  return (
    <div className="space-y-8">
      {isGeneratingPrintImage && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[99999] flex flex-col items-center justify-center text-white p-6 animate-in fade-in duration-200">
          <div className="bg-white text-slate-800 p-8 rounded-[2rem] shadow-2xl flex flex-col items-center max-w-sm text-center">
            <div className="relative flex items-center justify-center mb-6">
              <div className="w-16 h-16 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
              <Printer size={24} className="absolute text-blue-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-bold font-display text-slate-900 mb-2">
              පින්තූරය සකසමින් පවතී...
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed font-semibold">
              බිල්පත ආරක්ෂිත රූපයක් (Locked Photo) ලෙස සකසමින් පවතී. කිසිදු වෙනස්කමක් කිරීමට නොහැකි වන සේ ලොක් කෙරේ.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-4xl font-bold text-slate-800 tracking-tight">{t('billing')}</h3>
          <p className="text-slate-500 mt-1">Select items and generate bill</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setMode('sale')}
            className={`px-6 py-2 rounded-lg font-bold transition-all text-sm ${mode === 'sale' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            New Sale
          </button>
          <button 
            onClick={() => setMode('credit')}
            className={`px-6 py-2 rounded-lg font-bold transition-all text-sm ${mode === 'credit' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            ණය ලැබීම් (Credit Receipt)
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Section: Conditional (Inventory OR Credit Receipt Form) */}
        {mode === 'sale' ? (
          <div className="lg:col-span-5 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-[1050px] flex flex-col">
            <div className="flex justify-between items-center mb-4 gap-2">
              <h4 className="font-display text-xl font-bold text-slate-700">Available Stock</h4>
              <button
                onClick={() => handleAddQuickItem()}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1 active:scale-95 shrink-0"
              >
                <Plus size={14} /> + වෙනත් බඩුවක්
              </button>
            </div>
             <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search items..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 ring-blue-500/20 transition-all font-medium text-slate-700 text-sm"
              />
            </div>
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-2 pb-2">
              {displayItems.filter(item => (item.name || '').toLowerCase().includes((searchQuery || '').toLowerCase())).map((item, idx) => {
                const custLastPrice = getCustomerLastPrice(customer, item.id);
                return (
                  <div key={`inv-item-${item.id || idx}`} className="flex items-center justify-between p-2 hover:bg-slate-50 border-b border-slate-100 transition-all gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-xs sm:text-sm truncate" title={item.name}>
                        {item.name} {item.supplier && <span className="text-[10px] font-normal text-slate-400">({item.supplier})</span>}
                      </div>
                      <div className="text-[10px] font-medium text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                        {selectedRepId === 'admin' ? (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${item.mainStock > 0 ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                            {item.mainStock > 0 ? `Main Stock: ${item.mainStock}` : `Main Stock: ${item.mainStock} (ඇඩ්මින් අවසරලත්)`}
                          </span>
                        ) : (
                          <>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${(item.repStock || 0) > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                              Rep Stock: {item.repStock !== undefined ? item.repStock : 0}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              Main: {item.mainStock !== undefined ? item.mainStock : 0}
                            </span>
                          </>
                        )}
                        <span className="bg-slate-100 text-slate-600 px-1 rounded text-[9px] font-bold border border-slate-200">
                          Rs {item.maxPrice}
                        </span>
                        {custLastPrice !== null && (
                          <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[9px] font-bold border border-emerald-200 flex items-center gap-0.5" title="පාරිභෝගිකයාට මීට පෙර ලබාදුන් මිල">
                            <Tag size={10} /> පසුගිය මිල: Rs {custLastPrice}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button 
                        onClick={() => addToCart(item)} 
                        className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center hover:shadow-sm transition-all active:scale-95 font-bold text-[11px]"
                      >
                        <Plus size={12} className="mr-0.5" /> Sale
                      </button>
                      <button 
                        onClick={() => addToCart(item, true)} 
                        className="h-7 px-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg flex items-center justify-center transition-all active:scale-95 font-bold text-[11px]"
                      >
                        <ArrowDown size={12} className="mr-0.5" /> Ret
                      </button>
                    </div>
                  </div>
                );
              })}

              {displayItems.filter(item => (item.name || '').toLowerCase().includes((searchQuery || '').toLowerCase())).length === 0 && (
                <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 my-4">
                  <p className="text-slate-500 text-xs font-semibold mb-3">
                    {searchQuery ? `"${searchQuery}" නමින් බඩුවක් සොයාගත නොහැක.` : 'කිසිදු බඩුවක් සොයාගත නොහැක.'}
                  </p>
                  <button
                    onClick={() => handleAddQuickItem(searchQuery)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} /> {searchQuery ? `"${searchQuery}" බිලට එකතු කරන්න` : '+ නව බඩුවක් බිලට එකතු කරන්න'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
           <div className="lg:col-span-5 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-auto flex flex-col">
              <h4 className="font-display text-xl font-bold mb-6 text-slate-700">Credit Receipt Details</h4>
              <div className="space-y-4 mb-6">
                <input 
                  list="customer-list"
                  type="text" 
                  placeholder="Customer Name / Shop (කඩේ නම)" 
                  value={customer} 
                  onChange={e => {
                    setCustomer(e.target.value);
                    const cust = customers.find(c => (c.name || '').toLowerCase().trim() === (e.target.value || '').toLowerCase().trim());
                    if (cust && cust.location) setAddress(cust.location);
                  }} 
                  className="w-full bg-slate-50/50 p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800" 
                />
                <input type="text" placeholder="Address (ලිපිනය)" value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-slate-50/50 p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800" />
                <input type="number" placeholder="Amount Received (Rs)" value={creditReceivedAmount} onChange={e => setCreditReceivedAmount(e.target.value)} className="w-full bg-slate-50/50 p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 font-bold" />
              </div>
           </div>
        )}

        {/* Right Section: Bill/Receipt Details */}
        <div className="lg:col-span-7 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col h-[1050px]">
          <h4 className="font-display text-xl font-bold mb-6 text-slate-700 flex items-center justify-between">
            {mode === 'sale' ? 'Current Bill' : 'Generate Receipt'}
            {mode === 'sale' && <span className="bg-emerald-100 text-emerald-700 text-sm px-3 py-1 rounded-full font-bold">Total: Rs {(total || 0).toLocaleString()}</span>}
          </h4>
          
          <div className="space-y-4 mb-6 flex-shrink-0">
             <div className="flex bg-slate-200 p-1 rounded-xl mb-4">
                 <button className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${billingMode === 'wholesale' ? 'bg-white shadow' : 'text-slate-600'}`} onClick={() => setBillingMode('wholesale')}>Wholesale (තොග)</button>
                 <button className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${billingMode === 'retail' ? 'bg-white shadow' : 'text-slate-600'}`} onClick={() => setBillingMode('retail')}>Retail (සිල්ලර)</button>
             </div>
             {mode === 'sale' && (
               <>
                  <input 
                    list="customer-list"
                    type="text" 
                    placeholder="Customer Name / Shop (කඩේ නම)" 
                    value={customer} 
                    onChange={e => {
                      setCustomer(e.target.value);
                      const cust = customers.find(c => (c.name || '').toLowerCase().trim() === (e.target.value || '').toLowerCase().trim());
                      if (cust && cust.location) setAddress(cust.location);
                    }} 
                    className="w-full bg-slate-50/50 p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800" 
                  />
                  <datalist id="customer-list">
                    {customers.map((c, idx) => <option key={`cust-dl-${c.id || idx}`} value={c.name}>{c.location ? `${c.name} (${c.location})` : c.name} - Bal: Rs {c.balance}</option>)}
                  </datalist>
                  <input type="text" placeholder="Address (ලිපිනය)" value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-slate-50/50 p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800" />
                  
                  <div className="flex gap-2">
                     <select value={selectedRepId} onChange={e => setSelectedRepId(e.target.value)} className="flex-1 bg-slate-50/50 p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 appearance-none text-sm">
                        <option value="admin">Head Office (Main Store)</option>
                        {repsList.map(rep => <option key={rep.id} value={rep.id}>Rep: {rep.name}</option>)}
                     </select>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    {['Cash', 'Cheque', 'Cash + Cheque'].map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setPaymentType(type);
                          if (type !== 'Cash + Cheque') {
                            setSplitCashAmount('');
                            setSplitChequeAmount('');
                          }
                        }}
                        className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all ${paymentType === type 
                          ? (type === 'Cash' ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                            : type === 'Cheque' ? 'bg-purple-500 border-purple-500 text-white shadow-lg shadow-purple-500/30'
                            : 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/30') 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  {paymentType === 'Cash + Cheque' && (
                    <div className="p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                        <span>💵 + 💳 Mixed Payment (Cash + Cheque):</span>
                        <span className="text-[11px] font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                          Rs. {((parseFloat(splitCashAmount) || 0) + (parseFloat(splitChequeAmount) || 0)).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[11px] font-bold text-slate-600 block mb-1">Cash Amount Rs:</span>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={splitCashAmount}
                            onChange={e => {
                              const val = e.target.value;
                              setSplitCashAmount(val);
                              const cVal = parseFloat(val) || 0;
                              const chkVal = parseFloat(splitChequeAmount) || 0;
                              if (mode === 'sale') setPartialAmount((cVal + chkVal).toString());
                              else setCreditReceivedAmount((cVal + chkVal).toString());
                            }}
                            className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500/20 font-bold text-slate-800 text-sm"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-slate-600 block mb-1">Cheque Amount Rs:</span>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={splitChequeAmount}
                            onChange={e => {
                              const val = e.target.value;
                              setSplitChequeAmount(val);
                              const cVal = parseFloat(splitCashAmount) || 0;
                              const chkVal = parseFloat(val) || 0;
                              if (mode === 'sale') setPartialAmount((cVal + chkVal).toString());
                              else setCreditReceivedAmount((cVal + chkVal).toString());
                            }}
                            className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500/20 font-bold text-slate-800 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] font-semibold text-slate-600 block mb-1">Cheque Details (No/Bank):</span>
                        <input
                          type="text"
                          placeholder="e.g. Chq# 48201 / Commercial Bank"
                          value={chequeNo}
                          onChange={e => setChequeNo(e.target.value)}
                          className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500/20 text-xs text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-400 -mt-2 ml-1">GPS: {locationStr || 'Fetching...'}</p>

                  {paymentType === 'Half-payment' && (
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-4 items-center">
                       <label className="text-sm font-semibold text-blue-800">Received Amnt:</label>
                       <input type="number" placeholder="Enter amount" value={partialAmount} onChange={e => setPartialAmount(e.target.value)} className="flex-1 p-2 border border-blue-200 rounded text-right focus:outline-none focus:border-blue-500" />
                    </div>
                  )}

                  <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl flex gap-4 items-center">
                    <label className="text-sm font-semibold text-purple-800">Discount (%):</label>
                    <input type="number" placeholder="0" value={invoiceDiscount || ''} onChange={e => setInvoiceDiscount(parseFloat(e.target.value) || 0)} className="flex-1 p-2 border border-purple-200 rounded text-right focus:outline-none focus:border-purple-500 font-bold" />
                    <span className="text-sm font-bold text-purple-800">%</span>
                  </div>

                  {customer && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 mt-2">
                      <label className="text-sm font-black text-amber-800 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-500" />
                        කලින් ණය වෙනස් කරන්න / පැරණි ණය (Initial/Adjust Previous Debt)
                      </label>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          placeholder="0.00" 
                          value={initialCredit} 
                          onChange={e => setInitialCredit(e.target.value)} 
                          className="flex-1 p-3 bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-amber-500 font-black text-amber-700 text-lg" 
                        />
                      </div>
                      <p className="text-[10px] text-amber-600 font-bold italic">
                        * ඇඩ්මින් ලෙස මෙහි පැරණි ණය වෙනස් කළ විට, කලින් පැවති ණය අහෝසි වී අලුතින් ඇතුළත් කළ ණය මුදල පමණක් බිලට එකතු වේ.
                      </p>
                    </div>
                  )}
               </>
             )}
          </div>

          {mode === 'sale' && (
            <div className="flex-1 border border-slate-200 rounded-2xl bg-slate-50 mb-6 overflow-y-auto">
              {cart.length === 0 ? <div className="flex h-full items-center justify-center text-slate-400 font-medium">Cart is empty</div> : (
                <div className="p-2 space-y-2">
                  {cart.map((c, idx) => (
                    <div key={`${c.cartId || c.id}_${idx}`} className={`flex flex-col gap-3 p-4 rounded-xl border ${c.isReturn ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-white'}`}>
                      <div className="flex justify-between items-start">
                        <span className={`font-semibold ${c.isReturn ? 'text-rose-700' : 'text-slate-700'}`}>
                          {c.name} {c.supplier && <span className="text-[10px] text-slate-500 font-normal ml-1">[{c.supplier}]</span>} {c.isReturn && <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded ml-2">Return</span>}
                        </span>
                        <button onClick={() => setCart(cart.filter(x => x.cartId !== c.cartId))} className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors">
                           <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <div className="flex-1 sm:flex-initial flex flex-col">
                            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Qty</label>
                            <input type="number" value={c.qty === 0 ? '' : c.qty} step="any" min="0" onChange={(e) => updateCartQty(c.cartId, e.target.value)} className="w-full sm:w-20 p-2 bg-slate-50 border border-slate-200 rounded-lg text-center focus:outline-none focus:border-blue-400 font-medium text-slate-800" />
                          </div>
                          <span className="text-slate-400 font-medium pt-5">×</span>
                          <div className="flex-1 sm:flex-initial flex flex-col">
                            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Price</label>
                            <input type="number" value={c.price === 0 ? '' : c.price} onBlur={(e) => updateCartPrice(c.cartId, e.target.value)} onChange={(e) => setCart(cart.map(x => x.cartId === c.cartId ? {...x, price: parseFloat(e.target.value) || 0} : x))} className="w-full sm:w-24 p-2 bg-slate-50 border border-slate-200 rounded-lg text-center focus:outline-none focus:border-blue-400 font-medium text-slate-800" title={`Min: ${c.minPrice}, Max: ${c.maxPrice}`} />
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end justify-end pt-2 sm:pt-5 border-t sm:border-t-0 mt-2 sm:mt-0 border-slate-100">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1 sm:hidden">Total</span>
                          <span className={`text-base font-bold ${c.isReturn ? 'text-rose-600' : 'text-slate-800'}`}>
                            {c.isReturn ? '-' : ''}{c.isSample ? '0.00' : (Number(c.price) * (Number(c.qty) || 0)).toFixed(2)}
                            {c.isSample && <span className="text-[10px] text-purple-600 ml-1">(Sample)</span>}
                          </span>
                        </div>
                      </div>

                      {!c.isReturn && (
                        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-2 px-2 py-1 bg-purple-50 rounded-lg border border-purple-100">
                            <input 
                              type="checkbox" 
                              id={`sample-${c.cartId}`}
                              checked={!!c.isSample}
                              onChange={(e) => setCart(cart.map(x => x.cartId === c.cartId ? {...x, isSample: e.target.checked} : x))}
                              className="w-4 h-4 text-purple-600 border-purple-300 rounded focus:ring-purple-500"
                            />
                            <label htmlFor={`sample-${c.cartId}`} className="text-xs font-bold text-purple-700 cursor-pointer flex-1">
                              Give as Sample / සාම්පල් එකක් ලෙස
                            </label>
                          </div>

                          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-100 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                              <input 
                                type="checkbox" 
                                id={`free-${c.cartId}`}
                                checked={!!c.isFreeScheme}
                                onChange={(e) => toggleFreeScheme(c.cartId, e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                              />
                              <label htmlFor={`free-${c.cartId}`} className="text-xs font-bold text-blue-700 cursor-pointer">
                                Free Scheme {c.freeThreshold && c.freeThreshold > 0 ? `(${c.freeThreshold}:${c.freeBonus})` : (isSoyaItem(c.name) ? '(15:1, 30:3, 60:10)' : '(12:1)')}
                              </label>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-blue-800 font-bold">Free Units (නොමිලේ):</span>
                              <input 
                                type="number"
                                value={c.freeQty || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setCart(cart.map(x => x.cartId === c.cartId ? {...x, freeQty: val, isFreeScheme: val > 0 ? x.isFreeScheme : false} : x));
                                }}
                                className="w-14 p-1 text-center bg-white border border-blue-300 rounded text-xs font-bold text-blue-800 focus:outline-none"
                                min="0"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-auto">
            <button 
              disabled={(mode === 'sale' && cart.length === 0) || !customer || (mode === 'credit' && !creditReceivedAmount)} 
              onClick={handlePreviewBill} 
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-4 rounded-2xl text-xl font-bold hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.98] flex items-center justify-center"
            >
              <Eye size={24} className="mr-2" /> Preview Invoice
            </button>
          </div>
        </div>
      </div>

      {/* Recent Bills Section for Admin */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h4 className="font-display text-xl font-bold text-slate-800 flex items-center">
              <Printer size={22} className="mr-2 text-emerald-500" /> Recent Bills (මෑතකාලීන බිල්පත්)
            </h4>
            <p className="text-slate-500 text-xs mt-0.5">View, filter, edit, print or cancel bills issued today or previously across all reps & admin.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date filter toggle */}
            <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setBillFilter('today')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  billFilter === 'today' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                අද බිල්පත් (Today)
              </button>
              <button
                type="button"
                onClick={() => setBillFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  billFilter === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                සියල්ල (All History)
              </button>
            </div>

            {/* Rep filter dropdown */}
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
              className="bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ring-emerald-500/20"
            >
              <option value="all">සියලුම රෙප්වරුන් (All Reps & Admin)</option>
              <option value="admin">Head Office (Admin)</option>
              {repsList.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.area || 'Rep'})</option>
              ))}
            </select>

            {filteredRecentBills.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllRecentBills(!showAllRecentBills)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-xl transition-colors cursor-pointer border border-blue-200"
              >
                {showAllRecentBills 
                  ? 'අඩු කරන්න (Show Less)' 
                  : `සියල්ල බලන්න (${filteredRecentBills.length})`}
              </button>
            )}
          </div>
        </div>

        {filteredRecentBills.length === 0 ? (
          <div className="text-center py-8 text-slate-400 font-medium text-sm bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            {billFilter === 'today' ? 'අද දිනයේ කිසිදු බිල්පතක් නිකුත් කර නොමැත. (No bills issued today)' : 'කිසිදු බිල්පතක් සොයාගත නොහැකි විය. (No bills found)'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="py-3 px-3">Date & Time</th>
                  <th className="py-3 px-3">Issued By</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Payment Type</th>
                  <th className="py-3 px-3 text-right">Total Amount</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {(showAllRecentBills ? filteredRecentBills : filteredRecentBills.slice(0, 5)).map((sale: any, idx: number) => {
                  const rawDate = sale.createdAt || sale.date;
                  const dObj = rawDate ? new Date(typeof rawDate === 'number' ? rawDate : (!isNaN(Number(rawDate)) ? Number(rawDate) : rawDate)) : new Date();
                  const dateStr = !isNaN(dObj.getTime()) ? dObj.toLocaleString() : 'Unknown';
                  const isSaleAdmin = sale.issuedByAdmin || sale.repId === 'admin';
                  const repObj = repsList.find(r => String(r.id) === String(sale.repId));
                  const repName = isSaleAdmin ? 'Head Office (Admin)' : (repObj?.name || sale.repName || 'Sales Rep');

                  return (
                    <tr key={`${sale.id}_${idx}`} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${sale.status === 'cancelled' ? 'opacity-50 bg-rose-50/30' : ''}`}>
                      <td className="py-3.5 px-3 text-xs font-mono text-slate-500">
                        {dateStr}
                        {sale.status === 'cancelled' && (
                          <div className="text-rose-600 font-bold text-[10px] mt-0.5">
                            ❌ අවලංගුයි (Cancelled)
                            {sale.cancelReason && <span className="block text-slate-600 font-medium font-mono text-[9px]">හේතුව: {sale.cancelReason}</span>}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-xs font-bold text-slate-800">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${isSaleAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {repName}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-sm text-slate-800">{sale.customer || 'Guest Customer'}</td>
                      <td className="py-3.5 px-3 text-xs font-medium">
                        <span className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                          sale.paymentType === 'Credit' ? 'bg-rose-100 text-rose-700' :
                          sale.paymentType === 'Half-payment' ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {sale.paymentType || 'Cash'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right text-sm font-black text-slate-900">
                        Rs {(sale.total || sale.creditReceivedAmount || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {sale.status !== 'cancelled' && (
                            <button
                              onClick={() => {
                                setCart(sale.items || []);
                                setCustomer(sale.customer || '');
                                setAddress(sale.address || '');
                                setPaymentType(sale.paymentType || 'Cash');
                                setInvoiceDiscount(sale.invoiceDiscount || 0);
                              }}
                              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                              title="Edit / Load into Cart"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handleCancelSale(sale)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                            title="Delete / Cancel Bill"
                          >
                            <Trash2 size={16} />
                          </button>
                          {sale.status !== 'cancelled' && (
                            <button
                              onClick={() => handleConfirmPrint(sale)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                              title="Print Bill"
                            >
                              <Printer size={16} />
                            </button>
                          )}
                          {sale.status !== 'cancelled' && (
                            <button
                              onClick={() => setPreviewSale(sale)}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                              title="Share Invoice"
                            >
                              <Send size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BillPreviewModal 
        previewSale={previewSale} 
        onClose={() => setPreviewSale(null)}
        onEdit={(saleData) => {
            setCart(saleData.items);
            setCustomer(saleData.customer);
            setAddress(saleData.address);
            setPaymentType(saleData.paymentType);
            setInvoiceDiscount(saleData.invoiceDiscount);
            setInitialCredit(saleData.initialCredit ? saleData.initialCredit.toString() : '');
            setPreviewSale(null);
        }}
        onConfirmPrint={handleConfirmPrint}
        onConfirmShareImage={handleConfirmShareImage}
        onConfirmShareText={handleConfirmShareText}
        orgSettings={orgSettings}
      />

      {/* Hidden thermal print area (Admin) */}
      {createPortal(
      <div 
        id="thermal-print-area" 
        className="print-only"
        style={printImageSrc ? {
          position: 'fixed',
          left: '0',
          top: '0',
          width: '100%',
          maxWidth: '384px',
          background: 'white',
          zIndex: 9999
        } : {
          position: 'fixed',
          left: '0',
          top: '0',
          width: '384px',
          background: 'white',
          zIndex: -9999
        }}
      >
        {printImageSrc ? (
          <img src={printImageSrc} style={{ width: '384px', display: 'block', margin: '0 auto' }} referrerPolicy="no-referrer" />
        ) : (
          printData && Array.from({ length: requestedCopies || 1 }).map((_, idx) => {
            const copyNum = idx + 1;
            return (
              <div key={`admin-print-${copyNum}`} style={{ marginBottom: idx < (requestedCopies - 1) ? '30px' : '0' }}>
                <BillPrintLayout previewSale={printData} orgSettings={orgSettings} />
                {idx < (requestedCopies - 1) ? (
                  <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderTop: '2px dashed black', borderBottom: '2px dashed black', padding: '15px 0', margin: '20px 0', width: '384px' }}>- - - - - CUT - - - - -</div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      , document.body)}

    </div>
  );
}


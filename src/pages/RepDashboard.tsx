import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation, formatSinhalaDate } from '../i18n';
import { Link, useNavigate } from 'react-router-dom';
import imageCompression from 'browser-image-compression';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Printer, Truck, CheckSquare, DollarSign, Globe, Home, Bot, Plus, Trash2, Send, Edit, ChevronRight, Package, ArrowDown, ArrowUp, ArrowUpRight, ArrowDownLeft, FileText, Wifi, WifiOff, CloudCog, CheckCircle, AlertTriangle, Wallet, Search, LogOut, ArrowLeft, Share2, Settings, Eye, EyeOff, Maximize2, Minimize2, X, RefreshCw, Download, Upload, Undo2, ShoppingCart, RotateCcw, Fingerprint, MessageSquare } from 'lucide-react';
import ThermalLogo from '../components/ThermalLogo';
import { BillPreviewModal } from '../components/BillPreviewModal';
import { BillPrintLayout } from '../components/BillPrintLayout';
import { useLogo } from '../lib/logo';
import { getRepInventory, saveRepInventory, SystemUser, getUsers, saveUsers, getAttendanceRecords, saveAttendanceRecords, AttendanceRecord, getAIActionRequests, saveAIActionRequests, AIActionRequest, syncRequestsFromCloud, listenToCloudChanges, listenToRepInventory, getActiveOrgId, getOrganizationSettings, getAdminInventory, saveAdminInventory, getMainReturnStock, saveMainReturnStock, getSettledDates, markDatesSettled, updateUserOnlineStatus } from '../lib/store';
import { getSyncQueue, checkSupabaseConnection, processSyncQueue, addToSyncQueue, fetchTableData } from '../lib/sync';
import { appConfirm, appPrompt } from '../components/Dialogs';
import { isBiometricSupported, hasBiometricRegistered, registerBiometric, verifyBiometric, removeBiometric } from '../lib/biometrics';

import { getGeminiApiKey, generateGeminiContent } from '../lib/gemini';
import html2canvas from 'html2canvas';
import { withOklchBypass } from '../lib/canvasUtils';
import { printCanvasViaBluetooth, generateEscPosImage, uint8ArrayToBase64, connectBluetoothPrinter } from '../lib/bluetoothPrinter';
import { FireworksBackground } from '../components/Fireworks';
import { CustomerHistoryTab } from '../components/CustomerHistoryTab';
import { sendTopPhoneNotification } from '../lib/notificationService';
import { startNetworkLogger } from '../lib/networkLogger';

export const parseSaleDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const ms = val < 1e11 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        const d = val.toDate();
        if (d && !isNaN(d.getTime())) return d;
      } catch {}
    }
    if (typeof val.seconds === 'number') {
      const d = new Date(val.seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof val._seconds === 'number') {
      const d = new Date(val._seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

export const getSaleDateStr = (sale: any): string | null => {
  const dateVal = sale?.createdAt || sale?.date;
  if (!dateVal) return null;
  const d = parseSaleDate(dateVal);
  if (!d) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getTodayDateStr = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getUnsettledPreviousDates = (salesData: any[], repId?: string): string[] => {
  if (!repId) return [];
  const todayStr = getTodayDateStr();
  const settled = getSettledDates(repId);

  const unsettledSet = new Set<string>();
  (salesData || []).forEach(s => {
    if (s.repId === repId && !s.issuedByAdmin && s.status !== 'cancelled') {
      const dStr = getSaleDateStr(s);
      if (dStr && dStr < todayStr && !settled.includes(dStr)) {
        unsettledSet.add(dStr);
      }
    }
  });

  return Array.from(unsettledSet).sort();
};

export default function RepDashboard() {
  const logo = useLogo();
  const navigate = useNavigate();
  const [lang, setLang] = useState<'en'|'si'>((localStorage.getItem('bizflow_lang') as 'en'|'si') || 'en');
  
  const handleLangChange = () => {
    const newLang = lang === 'en' ? 'si' : 'en';
    setLang(newLang);
    localStorage.setItem('bizflow_lang', newLang);
  };
  
  const t = useTranslation(lang);
  const [popup, setPopup] = useState<{
    show: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
    items?: { id: string; name: string; qty: number }[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState('home');

  // Track physical/hardware back button on phone to close popup or return to home tab
  useEffect(() => {
    const hasBackAction = (activeTab !== 'home') || (popup && popup.show);
    
    if (hasBackAction) {
      // Only push a state if the current history state is not already marked by us
      const currentState = window.history.state;
      if (!currentState || currentState.app !== 'mym_bizflow' || currentState.activeTab !== activeTab || currentState.hasPopup !== !!popup?.show) {
        window.history.pushState({ app: 'mym_bizflow', activeTab, hasPopup: !!popup?.show }, '');
      }
    }

    const handlePopState = (event: PopStateEvent) => {
      if (popup && popup.show) {
        setPopup(null);
        // Put state back so next hardware back returns to home tab or exits
        window.history.pushState({ app: 'mym_bizflow', activeTab, hasPopup: false }, '');
      } else if (activeTab !== 'home') {
        setActiveTab('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeTab, popup]);

  const [inventory, setInventory] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [currentRep, setCurrentRep] = useState<SystemUser | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [actionRequests, setActionRequests] = useState<AIActionRequest[]>([]);
  const [printData, setPrintData] = useState<any>(null);
  const [triggerPrint, setTriggerPrint] = useState(0);
  const [requestedCopies, setRequestedCopies] = useState<number>(1);
  const [orgSettings, setOrgSettings] = useState(getOrganizationSettings());

  useEffect(() => {
    // Refresh settings occasionally or on mount
    setOrgSettings(getOrganizationSettings());
  }, [activeTab]);

  const handleTabChange = (targetTabId: string) => {
    setActiveTab(targetTabId);
  };

  useEffect(() => {
    localStorage.setItem('rep_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!currentRep?.id) return;
    updateUserOnlineStatus(currentRep.id);
    startNetworkLogger(currentRep.id, currentRep.name);
    const interval = setInterval(() => {
      updateUserOnlineStatus(currentRep.id);
    }, 15000);
    return () => clearInterval(interval);
  }, [currentRep?.id, currentRep?.name]);

  const [printImageSrc, setPrintImageSrc] = useState<string | null>(null);
  const [isGeneratingPrintImage, setIsGeneratingPrintImage] = useState(false);

  useEffect(() => {
    if (printData && triggerPrint > 0) {
      console.log("Triggering print with data:", printData);
      const pMethod = localStorage.getItem('bizflow_print_method') || 'bluetooth';
      
      if (pMethod !== 'bluetooth' && pMethod !== 'rawbt') {
        // System Print: Bypass html2canvas completely for perfect vector text and reliability!
        setIsGeneratingPrintImage(false);
        setPrintImageSrc(null); // Ensure raw HTML is rendered
        const timer = setTimeout(() => {
          window.print();
          setTriggerPrint(0);
        }, 300);
        return () => clearTimeout(timer);
      } else {
        // Bluetooth or RawBT: Require converting HTML to canvas/image
        setIsGeneratingPrintImage(true);
        const timer = setTimeout(async () => {
          try {
            const el = document.getElementById('thermal-print-area');
            if (el) {
              // Clear any old generated image to ensure rendering raw HTML
              setPrintImageSrc(null);
              // Wait for DOM to update with raw HTML
              await new Promise(resolve => setTimeout(resolve, 150));

              // Render to high quality canvas (scale: 3 for maximum crispness on thermal printers)
              const canvas = await withOklchBypass(async () => {
                return await html2canvas(el, { 
                  scale: 3, 
                  useCORS: true, 
                  backgroundColor: '#ffffff',
                  logging: false, x: 0, y: 0, scrollY: 0, scrollX: 0, width: orgSettings?.printerSize === '80' ? 576 : 384, onclone: (doc) => { const el = doc.getElementById('thermal-print-area'); if(el) { el.style.position = 'relative'; el.style.left = '0px'; el.style.top = '0px'; el.style.margin = '0px'; el.style.padding = '0px'; el.style.transform = 'none'; } },
                  windowHeight: el.scrollHeight,
                  height: el.scrollHeight
                });
              });
              const imgData = canvas.toDataURL('image/png');
              setPrintImageSrc(imgData);

              if (pMethod === 'bluetooth') {
                // Direct Web Bluetooth Thermal Printing
                await printCanvasViaBluetooth(canvas, orgSettings?.printerSize);
              } else if (pMethod === 'rawbt') {
                const escPosBytes = generateEscPosImage(canvas);
                const b64 = uint8ArrayToBase64(escPosBytes);
                const rawbtUrl = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
                window.location.href = rawbtUrl;
              }
            } else {
              window.print();
            }
          } catch (err) {
            console.error("Rep Image Print Error", err);
            alert("Error generating print image. Falling back to system print.");
            window.print();
          } finally {
            setIsGeneratingPrintImage(false);
            // Keep print data populated for a brief moment, then reset
            setTimeout(() => {
              setTriggerPrint(0);
              setPrintImageSrc(null);
            }, 3000);
          }
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  }, [printData, triggerPrint]);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<{checking: boolean, success?: boolean, message?: string}>({ checking: false });
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isStartingDay, setIsStartingDay] = useState(false);
  const [editingSale, setEditingSale] = useState<any | null>(null);

  // Real-time Push Notification Change Tracking Refs
  const prevReqStatusRef = useRef<Record<string, string>>({});
  const prevRepStockRef = useRef<Record<string, number>>({});
  const prevUserAreaRef = useRef<string>('');
  const isInitialLoadDoneRef = useRef<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      isInitialLoadDoneRef.current = true;
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleEditSale = (sale: any) => {
    setEditingSale(sale);
    setActiveTab('billing');
  };

  const markAttendance = (isEndDay = false, workingHoursVal = '0', otHoursVal = '0') => {
    if (!currentRep) return;
    setIsStartingDay(true);

    const handleSave = (loc: string) => {
      const allAtt = getAttendanceRecords();
      const todayStr = new Date().toISOString().split('T')[0];
      
      const existing = allAtt.find(a => a.repId === currentRep.id && a.date === todayStr);

      const newRec: AttendanceRecord = {
        id: existing?.id || 'att_' + Date.now(),
        repId: currentRep.id,
        repName: currentRep.name,
        date: todayStr,
        timestamp: Date.now(),
        status: existing?.status || 'Pending',
        location: loc,
        workingHours: isEndDay ? parseFloat(workingHoursVal || '0') : (existing?.workingHours || 0),
        otHours: isEndDay ? parseFloat(otHoursVal || '0') : (existing?.otHours || 0),
        isEndDay: isEndDay || existing?.isEndDay || false
      };
      
      const filtered = allAtt.filter(a => !(a.repId === currentRep.id && a.date === todayStr));
      filtered.push(newRec);
      saveAttendanceRecords(filtered);
      setTodayAttendance(newRec);
      addToSyncQueue({ table: 'attendance', action: 'insert', data: newRec });
      setIsStartingDay(false);
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        handleSave(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
      }, () => {
        handleSave('GPS Unavailable');
      }, { timeout: 8000 });
    } else {
      handleSave('GPS Not Supported');
    }
  };

  useEffect(() => {
    const triggerLightSync = async () => {
      if (!navigator.onLine) return;
      setIsOnline(true);
      try {
        const [{ pushUnsyncedLocalDataToCloud, triggerAutoSyncDebounced }, mod] = await Promise.all([
          import('../lib/sync'),
          import('../lib/store')
        ]);
        // 1. Immediately push all unsynced rep sales, debts, settlements, expenses to Firebase
        await pushUnsyncedLocalDataToCloud();
        triggerAutoSyncDebounced(100);

        // 2. Fetch any new cloud delta updates
        await mod.syncAllFromCloud();
        if (currentRep) {
          await mod.syncRepFromCloud(currentRep.id);
        }
      } catch (e) {
        console.warn('Light sync error:', e);
      }
    };

    const handleOn = () => {
      setIsOnline(true);
      triggerLightSync();
    };
    const handleOff = () => setIsOnline(false);

    window.addEventListener('online', handleOn);
    window.addEventListener('offline', handleOff);

    // Initial light background delta sync if online
    if (navigator.onLine) {
      triggerLightSync();
    }

    // Auto-sync in background once every 15 minutes (conserves Firebase quota)
    const syncTimer = setInterval(() => {
      if (navigator.onLine) {
        triggerLightSync();
      }
    }, 15 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOn);
      window.removeEventListener('offline', handleOff);
      clearInterval(syncTimer);
    };
  }, [currentRep]);

  const handleTestConnection = async () => {
    setSyncStatus({ checking: true });
    processSyncQueue();
    const res = await checkSupabaseConnection();
    setSyncStatus({ checking: false, success: res.success, message: res.message });
    setTimeout(() => {
      setSyncStatus({ checking: false });
    }, 5000);
  };

  const handleCancelSale = async (sale: any) => {
    if (!sale) return;

    const isAlreadyCancelled = sale.status === 'cancelled';
    const targetId = sale.id || sale.docId || sale._id;

    if (isAlreadyCancelled) {
      const confirmMsg = lang === 'si'
        ? `මෙම අවලංග��� කළ බිල්පත (ID: ${sale.id || 'N/A'}) පද්ධතියෙන් සහ ඉතිහාසයෙන් මුළුමනින්ම මකා දැමීමට (Delete) අවශ්‍යද?`
        : `Do you want to permanently delete bill ${sale.id || 'N/A'} from history?`;

      if (!window.confirm(confirmMsg)) return;

      // Permanent deletion for already cancelled bill
      addToSyncQueue({ table: 'sales', action: 'delete', data: { id: targetId, docId: sale.docId } });
      setSalesData((prev: any[]) => prev.filter(s => String(s.id) !== String(targetId) && String(s.docId || '') !== String(targetId)));

      const orgId = getActiveOrgId();
      const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
      try {
        const storedSales = JSON.parse(storedSalesStr);
        const updatedSales = storedSales.filter((s: any) => String(s.id) !== String(targetId) && String(s.docId || '') !== String(targetId));
        localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(updatedSales));
        localStorage.setItem('bizflow_sales_v1', JSON.stringify(updatedSales));
        window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: updatedSales } }));
      } catch (e) {
        console.error("Error updating local storage sales:", e);
      }

      alert(lang === 'si' ? 'බිල්පත මුළුමනින්ම මකා දමන ලදී.' : 'Bill permanently deleted.');
      return;
    }

    // MANDATORY cancellation reason prompt for active bills
    const reasonInput = window.prompt(
      lang === 'si'
        ? `බිල්පත (ID: ${sale.id || 'N/A'}) අවලංගු කිරීමට හේතුව ඇතුළත් කරන්න (අනිවාර්යයි):`
        : `Enter mandatory reason for cancelling bill ${sale.id || 'N/A'}:`
    );

    if (reasonInput === null || !reasonInput.trim()) {
      alert(
        lang === 'si'
          ? 'බිල්පත අවලංගු කිරීමට හේතුවක් ඇතුළත් කිරීම අනිවාර්ය වේ! බිල්පත අවලංගු නොකෙරිණි.'
          : 'A cancellation reason is required! The bill was not cancelled.'
      );
      return;
    }

    const cancelReason = reasonInput.trim();

    // Revert Inventory and Customer Balance if active
    if (sale.mode === 'sale' && sale.items && Array.isArray(sale.items)) {
      const updatedInv = [...inventory];
      for (const item of sale.items) {
        const idx = updatedInv.findIndex((i: any) => String(i.id) === String(item.id));
        if (idx > -1) {
          const invItem = { ...updatedInv[idx] };
          const soldQty = item.isReturn ? 0 : (Number(item.qty || 0) + Number(item.freeQty || 0));
          const returnedQty = item.isReturn ? Number(item.qty || 0) : 0;
          
          invItem.myStock = (invItem.myStock || 0) + soldQty;
          invItem.returnStock = (invItem.returnStock || 0) - returnedQty;
          
          updatedInv[idx] = invItem;
        }
      }
      setInventory(updatedInv);
      if (currentRep?.id) {
        saveRepInventory(currentRep.id, updatedInv);
      }
    }
    
    // Revert Customer Balance
    if (sale.customer) {
      const targetCust = customers.find(c => (c.name || '').toLowerCase().trim() === (sale.customer || '').toLowerCase().trim());
      if (targetCust) {
        let creditToAdd = 0;
        if (sale.mode === 'credit') {
          creditToAdd = -Number(sale.creditReceivedAmount || 0);
        } else {
          const pType = sale.paymentType;
          const tot = Number(sale.total || 0);
          if (pType === 'Credit') {
            creditToAdd = tot;
          } else if (pType === 'Half-payment') {
            creditToAdd = tot - Number(sale.partialAmount || 0);
          } else if (sale.addedCredit !== undefined) {
            creditToAdd = Number(sale.addedCredit);
          }
        }

        const updatedCust = {
          ...targetCust,
          balance: Math.max(0, (targetCust.balance || 0) - creditToAdd)
        };
        const newCusts = customers.map(c => c.id === targetCust.id ? updatedCust : c);
        setCustomers(newCusts);
        localStorage.setItem('bizflow_customers_v1', JSON.stringify(newCusts));
        addToSyncQueue({ table: 'customers', action: 'update', data: updatedCust });
      }
    }

    const cancelledSaleObj = {
      ...sale,
      status: 'cancelled',
      cancelReason,
      cancelledBy: currentRep?.name || currentRep?.id || 'Rep',
      cancelledAt: new Date().toISOString()
    };

    // 1. Send update action to cloud sync queue
    addToSyncQueue({ table: 'sales', action: 'update', data: cancelledSaleObj });

    // 2. Update React state
    setSalesData((prev: any[]) => prev.map(s => (String(s.id) === String(targetId) || String(s.docId || '') === String(targetId)) ? cancelledSaleObj : s));

    // 3. Update localStorage
    const orgId = getActiveOrgId();
    const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
    try {
      const storedSales = JSON.parse(storedSalesStr);
      const updatedSales = storedSales.map((s: any) => (String(s.id) === String(targetId) || String(s.docId || '') === String(targetId)) ? cancelledSaleObj : s);
      localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(updatedSales));
      localStorage.setItem('bizflow_sales_v1', JSON.stringify(updatedSales));
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: updatedSales } }));
    } catch (e) {
      console.error("Error updating local storage sales:", e);
    }

    alert(lang === 'si' ? 'බිල්පත සාර්ථකව අවලංගු කරන ලදී.' : 'Bill cancelled successfully.');
  };

  useEffect(() => {
    let unsubGlobal: any;
    let unsubInv: any;

    try {
      const repData = sessionStorage.getItem('current_rep');
      if (repData) {
        const storedRep = JSON.parse(repData) as SystemUser;
        
        // Refresh from latest getUsers to get balance
        const all = getUsers();
        const freshRep = all.find(u => u.id === storedRep.id) || storedRep;
        setCurrentRep(freshRep);
        
        const mergeStock = (gItems: any[], rStock: any[], activeArea?: string) => {
          // We TRUST gItems for catalog and store levels.
          // We TRUST rStock for myStock and returnStock levels assigned to vehicle.
          let items = gItems.map((gItem: any) => {
             const matching = rStock.filter(r => String(r.id) === String(gItem.id));
             const totalMyStock = matching.reduce((acc, r) => acc + (Number(r.myStock) || 0), 0);
             const totalReturnStock = matching.reduce((acc, r) => acc + (Number(r.returnStock) || 0), 0);
             const area = matching.find(r => r.area)?.area;
             return {
                ...gItem,
                stockInMain: gItem.stock, // Latest from global
                availableStock: totalMyStock,
                myStock: totalMyStock,
                returnStock: totalReturnStock,
                area: area
             };
          });

          // Also include any items in rStock that might not be in gItems catalog yet
          rStock.forEach(rItem => {
            if (!items.some(i => String(i.id) === String(rItem.id))) {
              items.push({
                ...rItem,
                stockInMain: rItem.stockInMain || 0,
                availableStock: Number(rItem.myStock) || 0,
                myStock: Number(rItem.myStock) || 0,
                returnStock: Number(rItem.returnStock) || 0,
                area: rItem.area
              });
            }
          });
          
          if (activeArea) {
            items = items.filter(i => i.area === activeArea || !i.area || (i.myStock || 0) > 0 || (i.returnStock || 0) > 0);
          }
          return items;
        };

        const loadInitialData = () => {
          // Load sales from local storage first
          const orgId = getActiveOrgId();
          const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
          if (storedSalesStr) {
            try {
              const storedSales = JSON.parse(storedSalesStr);
              const isRepMatch = (s: any) => freshRep.role === 'admin' || !s.repId || s.repId === freshRep.id || s.coRepId === freshRep.id || s.issuedByAdmin;
              setSalesData(storedSales.filter(isRepMatch).sort((a: any, b: any) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime()));
            } catch (e) {
              console.error("Error parsing local sales data:", e);
            }
          }

          // Fetch sales for history from cloud
          fetchTableData('sales').then(data => {
            if (data && data.length > 0) {
              const isRepMatch = (s: any) => freshRep.role === 'admin' || !s.repId || s.repId === freshRep.id || s.coRepId === freshRep.id || s.issuedByAdmin;
              setSalesData(data.filter(isRepMatch).sort((a:any, b:any) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime()));
            }
          });

          fetchTableData('expenses').then(() => {
            // Local expenses are merged inside fetchTableData and stored in localStorage.
            // CashBookTab reads from localStorage directly on render.
          });


          // Load Approval Requests
          setActionRequests(getAIActionRequests().filter(r => r.repId === freshRep.id && r.status !== 'Completed'));
          
          // Load Customers
          const storedCusts = localStorage.getItem('bizflow_customers_v1');
          if (storedCusts) setCustomers(JSON.parse(storedCusts));
          fetchTableData('customers').then(data => {
            if (data && data.length > 0) {
              setCustomers(data);
              localStorage.setItem('bizflow_customers_v1', JSON.stringify(data));
            }
          });

          // 1. Fetch Admin Global Inventory
          const storedGlobal = localStorage.getItem('bizflow_admin_inventory_v1');
          const globalItems = storedGlobal ? JSON.parse(storedGlobal) : [];
          
          // 2. Fetch Rep specific stats
          const repStock = getRepInventory(storedRep.id);
          
          // Initial render from local storage
          setInventory(mergeStock(globalItems, repStock, freshRep.activeArea));

          // Fetch fresh global inventory from cloud
          fetchTableData('inventory').then(gData => {
            if (gData && gData.length > 0) {
              localStorage.setItem('bizflow_admin_inventory_v1', JSON.stringify(gData));
              const rStock = getRepInventory(storedRep.id);
              setInventory(mergeStock(gData, rStock, freshRep.activeArea));
            }
          });

          // Load Attendance
          const todayStr = new Date().toISOString().split('T')[0];
          const allAtt = getAttendanceRecords();
          const todayAtt = allAtt.find(a => a.repId === freshRep.id && a.date === todayStr);
          if (todayAtt) {
            setTodayAttendance(todayAtt);
          }
          setIsDataLoaded(true);
        };

        loadInitialData();

        const handleSyncEvent = (e: any) => {
          if (e.detail && e.detail.table === 'sales' && Array.isArray(e.detail.data)) {
            const isRepMatch = (s: any) => freshRep.role === 'admin' || !s.repId || s.repId === freshRep.id || s.coRepId === freshRep.id || s.issuedByAdmin;
            setSalesData(e.detail.data.filter(isRepMatch).sort((a: any, b: any) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime()));
          }
        };
        window.addEventListener('bizflow_sync', handleSyncEvent);

        listenToCloudChanges((table, data) => {
          if (table === 'users') {
            const updatedMe = data.find((u: any) => u.id === storedRep.id);
            if (updatedMe) {
                if (isInitialLoadDoneRef.current && prevUserAreaRef.current && prevUserAreaRef.current !== updatedMe.activeArea) {
                  sendTopPhoneNotification(
                    '👤 මාර්ගය යාවත්කාලීන විය',
                    `ඇඩ්මින් විසින් ඔබගේ සක්‍රීය ප්‍රදේශය "${updatedMe.activeArea}" ලෙස වෙනස් කරන ලදී.`,
                    'system'
                  );
                }
                prevUserAreaRef.current = updatedMe.activeArea || '';
                setCurrentRep(updatedMe);
                // Re-apply filtering when rep area changes
                const orgId = getActiveOrgId();
                const storedGlobal = localStorage.getItem(`bizflow_${orgId}_admin_inventory_v1`);
                const globalItems = storedGlobal ? JSON.parse(storedGlobal) : [];
                const repStock = getRepInventory(storedRep.id);
                setInventory(mergeStock(globalItems, repStock, updatedMe.activeArea));
            }
          } else if (table === 'inventory') {
            const repStock = getRepInventory(storedRep.id);
            setInventory(mergeStock(data, repStock, currentRep?.activeArea || freshRep.activeArea));
          } else if (table === 'aiactions') {
            const myReqs = data.filter((r: any) => r.repId === storedRep.id && r.status !== 'Completed');
            if (isInitialLoadDoneRef.current) {
              myReqs.forEach((r: any) => {
                const prevStatus = prevReqStatusRef.current[r.id];
                if (prevStatus === 'Pending' && r.status === 'Approved') {
                  sendTopPhoneNotification(
                    '✅ ඇඩ්මින් අනුමැතිය ලැබුණි!',
                    `ඔබගේ ${r.payload?.itemName || 'ඉල්ලීම'} ඇඩ්මින් විසින් අනුමත කරන ලදී.`,
                    'approval'
                  );
                } else if (prevStatus === 'Pending' && r.status === 'Rejected') {
                  sendTopPhoneNotification(
                    '❌ ඉල්ලීම ප්‍රතික්ෂේප විය',
                    `ඇඩ්මින් විසින් ඔබගේ ඉල්ලීම ප්‍රතික්ෂේප කරන ලදී.`,
                    'system'
                  );
                } else if (!prevStatus && r.status === 'Pending' && (r.actionType === 'stock_load_admin' || r.createdRole === 'admin')) {
                  sendTopPhoneNotification(
                    '🔔 ඇඩ්මින් වෙතින් නව නිවේදනයක්!',
                    `ඇඩ්මින් විසින් ඔබ සඳහා නව කාර්යයක්/තොගයක් පවරා ඇත.`,
                    'stock'
                  );
                }
              });
            }
            const reqMap: Record<string, string> = {};
            myReqs.forEach((r: any) => { reqMap[r.id] = r.status; });
            prevReqStatusRef.current = reqMap;
            setActionRequests(myReqs);
          } else if (table === 'attendance') {
            const todayStr = new Date().toISOString().split('T')[0];
            const att = data.find((a: any) => a.repId === storedRep.id && a.date === todayStr);
            if (att) setTodayAttendance(att);
          }
        }).then(unsub => unsubGlobal = unsub);

        listenToRepInventory(storedRep.id, (newInv) => {
           if (isInitialLoadDoneRef.current) {
             let stockAdded = false;
             let addedItemName = '';
             newInv.forEach((item: any) => {
               const prevQty = prevRepStockRef.current[item.id] || 0;
               const currQty = item.myStock || 0;
               if (currQty > prevQty) {
                 stockAdded = true;
                 addedItemName = item.name || addedItemName;
               }
             });

             if (stockAdded) {
               sendTopPhoneNotification(
                 '📦 ඇඩ්මින් වෙතින් නව තොග එකතු විය!',
                 `ඇඩ්මින් විසින් ඔබගේ තොගයට ${addedItemName ? `"${addedItemName}" ඇතුළු ` : ''}නව භාණ්ඩ එකතු කරන ලදී.`,
                 'stock'
               );
             }
           }

           const newMap: Record<string, number> = {};
           newInv.forEach((item: any) => {
             newMap[item.id] = item.myStock || 0;
           });
           prevRepStockRef.current = newMap;

           const orgId = getActiveOrgId();
           const storedGlobal = localStorage.getItem(`bizflow_${orgId}_admin_inventory_v1`);
           const globalItems = storedGlobal ? JSON.parse(storedGlobal) : [];
           
           if (globalItems.length > 0) {
             setInventory(mergeStock(globalItems, newInv, currentRep?.activeArea));
           } else {
             // Fallback if global not loaded yet
             setInventory(newInv.map((i: any) => ({ ...i, availableStock: i.myStock || 0 })));
           }
        }).then(unsub => unsubInv = unsub);

        if (navigator.onLine) {
          import('../lib/store.ts').then(mod => {
            mod.syncRepFromCloud(storedRep.id).then(() => {
              loadInitialData();
            });
          });
        }
      }
    } catch(e) {}

    return () => {
      if (unsubGlobal) unsubGlobal();
      if (unsubInv) unsubInv();
    };
  }, []);

  useEffect(() => {
    // Polling for Admin approvals
    const interval = setInterval(() => {
      if (navigator.onLine) {
        syncRequestsFromCloud().then(data => {
           if (data) {
             const myReqs = data.filter((r: any) => r.repId === currentRep?.id && r.status !== 'Completed');
             setActionRequests(myReqs);
           }
        });
      } else {
        const all = getAIActionRequests();
        const myReqs = all.filter(r => r.repId === currentRep?.id && r.status !== 'Completed');
        setActionRequests(myReqs);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentRep]);

  const handleUpdateInventory = (newInv: any[]) => {
    const orgId = getActiveOrgId();
    setInventory(newInv);
    if (currentRep) {
      saveRepInventory(currentRep.id, newInv);
    }
    // Update the main stock if stockInMain changed
    const storedGlobal = localStorage.getItem(`bizflow_${orgId}_admin_inventory_v1`);
    if (storedGlobal) {
       let globalItems = JSON.parse(storedGlobal);
       let changed = false;
       globalItems = globalItems.map((gItem: any) => {
          const rItem = newInv.find((r: any) => r.id === gItem.id);
          if (rItem && rItem.stockInMain !== gItem.stock) {
             changed = true;
             return { ...gItem, stock: rItem.stockInMain };
          }
          return gItem;
       });
       if (changed) {
          localStorage.setItem(`bizflow_${orgId}_admin_inventory_v1`, JSON.stringify(globalItems));
       }
    }
  };

  // Automatically process approved stock load requests without requiring manual action or approval from the Rep
  useEffect(() => {
    if (!currentRep || actionRequests.length === 0) return;

    const approvedLoads = actionRequests.filter(
      r => (r.actionType === 'rep_load' || r.actionType === 'stock_load') && r.status === 'Approved'
    );

    if (approvedLoads.length === 0) return;

    console.log("Processing approved load requests:", approvedLoads);

    const completedRequestIds = approvedLoads.map(r => r.id);

    // Mark these processed requests as 'Completed'
    if (completedRequestIds.length > 0) {
      const allReqs = getAIActionRequests();
      const updatedAll = allReqs.map(r => 
        completedRequestIds.includes(r.id) ? { ...r, status: 'Completed' as any } : r
      );
      saveAIActionRequests(updatedAll);
      setActionRequests(updatedAll.filter(r => r.repId === currentRep.id && r.status !== 'Completed'));

      // Show notification to the rep
      setPopup({
        show: true,
        type: 'success',
        title: lang === 'si' ? 'නව තොග එකතු විය! (New Stock Loaded!)' : 'New Stock Loaded!',
        message: lang === 'si' 
          ? 'පරිපාලක විසින් එවන ලද නව බඩු තොගය ඔබගේ වාහන තොගයට කෙලින්ම ඇතුලත් කරන ලදී.' 
          : 'New stock loaded by the administrator has been directly added to your vehicle stock.'
      });
    }
  }, [actionRequests, currentRep, lang]);

  const [selectedLoginRep, setSelectedLoginRep] = useState<SystemUser | null>(null);
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [repsListForLogin, setRepsListForLogin] = useState<SystemUser[]>([]);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricMsg, setBiometricMsg] = useState('');

  useEffect(() => {
    if (!currentRep) {
      setRepsListForLogin(getUsers().filter(u => u.role === 'rep' || u.role === 'admin' || u.role === 'super_admin'));
      if (navigator.onLine) {
        import('../lib/store').then(mod => {
          mod.syncAllFromCloud().then(() => {
            setRepsListForLogin(getUsers().filter(u => u.role === 'rep' || u.role === 'admin' || u.role === 'super_admin'));
          });
        });
      }
    }
  }, [currentRep]);

  if (!currentRep) {
    const handlePortalLogin = () => {
      if (!selectedLoginRep) {
        setLoginError(lang === 'si' ? 'කරුණාකර ඔබගේ නම තෝරන්න' : 'Please select your name');
        return;
      }
      if (selectedLoginRep.pin === loginPin) {
        sessionStorage.setItem('current_rep', JSON.stringify(selectedLoginRep));
        setCurrentRep(selectedLoginRep);
        setLoginPin('');
        setLoginError('');
        window.location.reload();
      } else {
        setLoginError(lang === 'si' ? 'ඇතුලත් කල PIN අංකය වැරදියි' : 'Incorrect PIN');
        setLoginPin('');
      }
    };

    const handleBiometricLogin = async () => {
      if (!selectedLoginRep) return;
      setBiometricLoading(true);
      setLoginError('');
      const res = await verifyBiometric(selectedLoginRep.id);
      setBiometricLoading(false);
      if (res.success) {
        sessionStorage.setItem('current_rep', JSON.stringify(selectedLoginRep));
        setCurrentRep(selectedLoginRep);
        window.location.reload();
      } else {
        setLoginError(res.error || (lang === 'si' ? 'ජෛවමිතික සත්‍යාපනය අසාර්ථකයි' : 'Biometric authentication failed'));
      }
    };

    return (
      <div className="min-h-screen bg-[#0A0F1C] flex items-center justify-center p-4 relative overflow-hidden font-sans text-slate-800">
        <FireworksBackground />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative bg-white/10 backdrop-blur-xl border border-white/15 rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl z-10 flex flex-col items-center"
        >
          {/* Top Row with Language Switcher */}
          <div className="absolute top-6 right-6 flex items-center gap-2">
            <button 
              onClick={handleLangChange}
              className="p-2 border border-white/20 text-white rounded-full bg-white/10 hover:bg-white/20 transition-all font-mono text-[10px] uppercase font-bold flex items-center gap-1 leading-none"
            >
              <Globe size={12} />
              {lang === 'si' ? 'සිංහල' : 'EN'}
            </button>
            <button 
              onClick={() => navigate('/')}
              className="p-2 border border-white/20 text-white rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center"
            >
              <Home size={12} />
            </button>
          </div>

          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-6 border border-white/20 overflow-hidden">
            <img src={orgSettings?.logoUrl || logo} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white" />
          </div>

          <h2 className="font-display font-black text-xl text-white text-center tracking-tight mb-2 uppercase">
            {lang === 'si' ? 'විකුණුම් නියෝජිත ලොගින්' : 'Sales Rep Login'}
          </h2>
          <p className="text-blue-200/60 text-center text-xs mb-6 font-medium leading-relaxed px-2">
            {lang === 'si' ? 'ඔබගේ ගිණුමට පිවිසීමට නම, PIN අංකය හෝ මුහුණ/ඇඟිලි සලකුණ භාවිත කරන්න' : 'Select your name and enter PIN or use Biometrics to access workspace'}
          </p>

          <div className="w-full space-y-4">
            {/* Rep profile selection */}
            <div>
              <label className="block text-blue-200/80 text-[10px] font-black uppercase tracking-wider mb-2">
                {lang === 'si' ? 'ඔබගේ නම තෝරන්න' : 'Select Your Name'}
              </label>
              <select
                value={selectedLoginRep ? selectedLoginRep.id : ''}
                onChange={(e) => {
                  const r = repsListForLogin.find(u => u.id === e.target.value);
                  setSelectedLoginRep(r || null);
                  setLoginError('');
                }}
                className="w-full bg-slate-950/60 border border-white/10 text-white p-4 rounded-xl focus:outline-none focus:border-blue-500 text-sm font-bold shadow-inner"
              >
                <option value="" className="bg-slate-950 text-slate-400">
                  {lang === 'si' ? '-- තෝරන්න --' : '-- Choose Name --'}
                </option>
                {repsListForLogin.map(rep => (
                  <option key={rep.id} value={rep.id} className="bg-slate-950 text-white">
                    {rep.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Biometric Quick Login Button if registered */}
            {selectedLoginRep && hasBiometricRegistered(selectedLoginRep.id) && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-2"
              >
                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={biometricLoading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm py-3.5 px-4 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 border border-emerald-400/30 uppercase tracking-wider"
                >
                  <Fingerprint size={20} className={biometricLoading ? "animate-spin" : "text-emerald-200"} />
                  <span>
                    {biometricLoading
                      ? (lang === 'si' ? 'පරීක්ෂා කරමින්...' : 'Scanning...')
                      : (lang === 'si' ? 'මුහුණ / ඇඟිලි සලකුණෙන් පිවිසෙන්න' : 'Unlock with Fingerprint / Face ID')}
                  </span>
                </button>
                <div className="flex items-center gap-3 my-3">
                  <div className="h-[1px] bg-white/10 flex-1"></div>
                  <span className="text-[10px] uppercase font-bold text-blue-200/40">{lang === 'si' ? 'හෝ PIN අංකයෙන්' : 'OR WITH PIN'}</span>
                  <div className="h-[1px] bg-white/10 flex-1"></div>
                </div>
              </motion.div>
            )}

            {/* PIN Entry */}
            {selectedLoginRep && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-blue-200/80 text-[10px] font-black uppercase tracking-wider mb-2">
                    {lang === 'si' ? 'රහස්‍ය PIN අංකය (අංක 4)' : 'Enter 4-Digit PIN'}
                  </label>
                  <input 
                    type="password" 
                    maxLength={4}
                    value={loginPin}
                    onChange={(e) => {
                      setLoginPin(e.target.value.replace(/\D/g, ''));
                      setLoginError('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && loginPin.length === 4 && handlePortalLogin()}
                    placeholder="• • • •"
                    className="w-full bg-slate-950/60 border border-white/10 text-white text-center text-2xl tracking-[1em] p-4 rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                    autoFocus
                  />
                </div>
              </motion.div>
            )}

            {loginError && (
              <p className="text-rose-400 text-xs text-center font-extrabold mt-2 uppercase tracking-wide">
                {loginError}
              </p>
            )}

            <button 
              onClick={handlePortalLogin}
              disabled={!selectedLoginRep || loginPin.length < 4}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm py-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all active:scale-[0.98] mt-4 shadow-lg shadow-blue-500/20 uppercase tracking-wider"
            >
              {lang === 'si' ? 'පිවිසෙන්න' : 'Unlock Portal'}
            </button>
          </div>
        </motion.div>
        
        {/* Sync loading message or indicators */}
        <p className="absolute bottom-6 text-blue-200/30 text-[9px] font-bold uppercase tracking-widest text-center">
          MYM BIZFLOW • SECURED WORKSPACE • AUTOMATIC REAL-TIME SYNC
        </p>
      </div>
    );
  }

  const tabs = [
    { id: 'billing', label: t('billing'), icon: <Printer size={32} />, color: 'text-emerald-500 bg-emerald-50' },
    { id: 'inventory', label: lang === 'si' ? 'මගේ තොගය' : 'My Stock', icon: <Package size={32} />, color: 'text-blue-500 bg-blue-50' },
    { id: 'return_goods', label: lang === 'si' ? 'බඩු භාරදීම' : 'Return Stock', icon: <Undo2 size={32} />, color: 'text-orange-500 bg-orange-50' },
    { id: 'settlement', label: t('settlement'), icon: <DollarSign size={32} />, color: 'text-rose-500 bg-rose-50' },
    { id: 'customer_history', label: lang === 'si' ? 'පාරිභෝගික ඉතිහාසය' : 'Customer History', icon: <Eye size={32} />, color: 'text-amber-500 bg-amber-50' },
    { id: 'cashbook', label: lang === 'si' ? 'මුදල් පොත' : 'Cash Book', icon: <Wallet size={32} />, color: 'text-purple-500 bg-purple-50' },
    { id: 'attendance', label: t('attendance'), icon: <CheckSquare size={32} />, color: 'text-cyan-500 bg-cyan-50' },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex flex-col md:flex-row pb-20 md:pb-0 font-sans">
      
      {isGeneratingPrintImage && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[99999] flex flex-col items-center justify-center text-white p-6 animate-in fade-in duration-200">
          <div className="bg-white text-slate-800 p-8 rounded-[2rem] shadow-2xl flex flex-col items-center max-w-sm text-center">
            <div className="relative flex items-center justify-center mb-6">
              <div className="w-16 h-16 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
              <Printer size={24} className="absolute text-blue-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-bold font-display text-slate-900 mb-2">
              {lang === 'si' ? 'පින්තූරය සකසමින් පවතී...' : 'Generating Bill Image...'}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed font-semibold">
              {lang === 'si' 
                ? 'බිල්පත ආරක්ෂිත රූපයක් (Locked Photo) ලෙස සකසමින් පවතී. කිසිදු වෙනස්කමක් කිරීමට නොහැකි වන සේ ලොක් කෙරේ.' 
                : 'Locking your invoice as a secure, unchangeable photo. This prevents print apps from altering the layout.'}
            </p>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <AnimatePresence>
      {activeTab !== 'home' && (
      <motion.div 
        initial={{ x: -20, opacity: 0 }} 
        animate={{ x: 0, opacity: 1 }} 
        exit={{ x: -20, opacity: 0 }}
        className="hidden md:flex w-72 bg-gradient-to-b from-blue-900 to-slate-900 text-white flex-col shadow-2xl h-screen sticky top-0 z-20"
      >
        <div className="p-6 border-b border-white/10 flex flex-col gap-4">
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  if (activeTab !== 'home') {
                    setActiveTab('home');
                  } else {
                    navigate('/');
                  }
                }} 
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors" 
                title="Back"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-3">
                <div className="bg-white p-1 rounded-lg">
                   <img src={orgSettings?.logoUrl || logo} alt="Logo" className="w-8 h-8 rounded object-contain" />
                </div>
                <div>
                  <h2 className="font-display font-black text-xl tracking-tight text-white">{t('rep_portal')}</h2>
                  <p className="text-blue-300 text-[10px] mt-0.5 uppercase tracking-wider">MYM Bizflow</p>
                </div>
              </div>
            </div>
            <button onClick={handleLangChange} className="p-2 rounded-full hover:bg-white/10 bg-white/5 transition-colors">
              <Globe size={18} />
            </button>
          </div>
          <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10">
             {isOnline ? (
               <span className="flex items-center text-xs font-bold text-emerald-400">
                 <Wifi size={14} className="mr-1" /> Online
               </span>
             ) : (
               <span className="flex items-center text-xs font-bold text-rose-400">
                 <WifiOff size={14} className="mr-1" /> Offline
               </span>
             )}
          </div>
        </div>
        <div className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center px-4 py-3 rounded-2xl transition-all duration-300 ${isActive ? 'bg-white/15 text-white shadow-lg backdrop-blur-md' : 'text-blue-200/70 hover:bg-white/5 hover:text-white'}`}
              >
                <div className={`p-2 rounded-xl mr-4 ${isActive ? 'bg-blue-500 text-white shadow-md' : 'bg-transparent text-current'}`}>
                  {React.cloneElement(tab.icon as any, { size: 20 })}
                </div>
                <span className="font-medium text-base">{tab.label}</span>
                {isActive && <ChevronRight size={16} className="ml-auto opacity-70" />}
              </button>
            )
          })}
        </div>
        <div className="p-6 border-t border-white/10 flex flex-col gap-2">
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
            className="flex items-center text-blue-200/70 hover:text-white transition-colors bg-white/5 px-4 py-3 rounded-2xl justify-center w-full"
          >
            <Send size={18} className="mr-2" /> <span className="font-medium text-sm">{lang === 'si' ? 'ඇප් එක යවන්න' : 'Share App'}</span>
          </button>
          <button onClick={() => {
            if (currentRep?.role === 'admin' || currentRep?.role === 'super_admin') {
              navigate('/admin');
            } else {
              navigate('/');
            }
          }} className="flex items-center text-rose-300/80 hover:text-rose-100 transition-colors bg-rose-500/10 px-4 py-3 rounded-2xl justify-center">
            <LogOut size={20} className="mr-2" /> <span className="font-medium text-sm">{t('logout')}</span>
          </button>
        </div>
      </motion.div>
      )}
      </AnimatePresence>

      {/* Mobile Header */}
      {activeTab !== 'home' && (
      <div className="md:hidden bg-blue-900 text-white p-4 flex justify-between items-center shadow-md z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (activeTab !== 'home') {
                setActiveTab('home');
              } else {
                navigate('/');
              }
            }} 
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors" 
            title="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-white p-0.5 rounded-lg">
               <img src={orgSettings?.logoUrl || logo} alt="Logo" className="w-7 h-7 rounded object-contain" />
            </div>
            <div className="flex flex-col">
              <h2 className="font-display font-black text-xl tracking-tight leading-tight">MYM BIZFLOW</h2>
              <div className="flex items-center mt-1">
                 {isOnline ? (
                   <Wifi size={12} className="text-emerald-400 mr-2" />
                 ) : (
                   <WifiOff size={12} className="text-rose-400 mr-2" />
                 )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={handleLangChange} className="p-2 rounded-full bg-white/10">
            <Globe size={18} />
          </button>
          <button onClick={() => {
            if (currentRep?.role === 'admin' || currentRep?.role === 'super_admin') {
              navigate('/admin');
            } else {
              navigate('/');
            }
          }} className="p-2 rounded-full bg-rose-500/20 text-rose-300"><LogOut size={18} /></button>
        </div>
      </div>
      )}
      
      {/* Toast */}
      {syncStatus.message && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg font-bold text-sm flex items-center whitespace-nowrap ${syncStatus.success ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
           {syncStatus.success ? <CheckCircle size={16} className="mr-2" /> : <AlertTriangle size={16} className="mr-2" />}
           {syncStatus.message}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 p-4 md:p-8 lg:p-10 w-full overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'home' && (
               <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto pt-2 pb-10">
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
                          <p className="text-slate-500 text-sm md:text-base mt-2 md:mt-1 font-medium">{lang === 'si' ? 'විකුණුම් සහ තොග කළමනාකරණ පද්ධතිය' : 'Sales & Inventory Management System'}</p>
                       </div>
                    </div>
                    <div className="flex flex-wrap gap-3 items-center justify-between border-t border-slate-100 pt-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <button onClick={handleLangChange} className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-full text-slate-700 font-bold hover:bg-slate-50 transition-colors bg-white">
                          <Globe size={18} className="text-blue-500" /> {lang === 'si' ? 'සිංහල' : 'English'}
                        </button>
                        <button 
                          onClick={async () => {
                            if (currentRep) {
                              setSyncStatus({ checking: true, message: lang === 'si' ? 'යාවත්කාලීන වෙමින්...' : 'Syncing...' });
                              try {
                                const { syncRepFromCloud } = await import('../lib/store');
                                await syncRepFromCloud(currentRep.id);
                                
                                // Refresh current user to get latest balance
                                const all = getUsers();
                                const freshRep = all.find(u => u.id === currentRep.id) || currentRep;
                                setCurrentRep(freshRep);
                                
                                // Refresh Rep specific stats
                                const repStock = getRepInventory(currentRep.id);
                                const orgId = getActiveOrgId();
                                const storedGlobal = localStorage.getItem(`bizflow_${orgId}_admin_inventory_v1`) || localStorage.getItem('bizflow_admin_inventory_v1');
                                const globalItems = storedGlobal ? JSON.parse(storedGlobal) : [];
                                
                                const localMergeStock = (gItems: any[], rStock: any[], activeArea?: string) => {
                                  let items = gItems.map((gItem: any) => {
                                     const matching = rStock.filter(r => String(r.id) === String(gItem.id));
                                     const totalMyStock = matching.reduce((acc, r) => acc + (Number(r.myStock) || 0), 0);
                                     const totalReturnStock = matching.reduce((acc, r) => acc + (Number(r.returnStock) || 0), 0);
                                     const area = matching.find(r => r.area)?.area;
                                     return {
                                        ...gItem,
                                        stockInMain: gItem.stock,
                                        availableStock: totalMyStock,
                                        myStock: totalMyStock,
                                        returnStock: totalReturnStock,
                                        area: area
                                     };
                                  });
                                  rStock.forEach(rItem => {
                                    if (!items.some(i => String(i.id) === String(rItem.id))) {
                                      items.push({
                                        ...rItem,
                                        stockInMain: rItem.stockInMain || 0,
                                        availableStock: Number(rItem.myStock) || 0,
                                        myStock: Number(rItem.myStock) || 0,
                                        returnStock: Number(rItem.returnStock) || 0,
                                        area: rItem.area
                                      });
                                    }
                                  });
                                  if (activeArea) {
                                    items = items.filter(i => i.area === activeArea || !i.area || (i.myStock || 0) > 0 || (i.returnStock || 0) > 0);
                                  }
                                  return items;
                                };
                                
                                setInventory(localMergeStock(globalItems, repStock, freshRep.activeArea));
                                
                                // Fetch sales
                                const data = await fetchTableData('sales');
                                if (data) {
                                  const isRepMatch = (s: any) => freshRep.role === 'admin' || !s.repId || s.repId === freshRep.id || s.coRepId === freshRep.id || s.issuedByAdmin;
                                  setSalesData(data.filter(isRepMatch).sort((a:any, b:any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
                                }
                                
                                setSyncStatus({ checking: false, success: true, message: lang === 'si' ? 'සාර්ථකව යාවත්කාලීන කරන ලදී!' : 'Sync Successful!' });
                              } catch (e) {
                                setSyncStatus({ checking: false, success: false, message: lang === 'si' ? 'යාවත්කාලීන කිරීම අසාර්ථකයි' : 'Sync Failed' });
                              }
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-full text-blue-500 hover:bg-slate-50 bg-white transition-colors font-bold text-sm"
                        >
                          <RefreshCw size={16} className={syncStatus.checking ? "animate-spin" : ""} />
                          <span>{syncStatus.checking ? (lang === 'si' ? 'යාවත්කාලීන වෙමින්...' : 'Syncing...') : (lang === 'si' ? 'Refresh' : 'Refresh')}</span>
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                        {currentRep && isBiometricSupported() && (
                          <button
                            onClick={async () => {
                              if (hasBiometricRegistered(currentRep.id)) {
                                if (window.confirm(lang === 'si' ? 'ඔබට මෙම උපාංගයේ ජෛවමිතික ලොගින් අක්‍රීය කිරීමට අවශ්‍යද?' : 'Disable biometric login on this device?')) {
                                  removeBiometric(currentRep.id);
                                  alert(lang === 'si' ? 'ජෛවමිතිය අක්‍රීය කරන ලදී' : 'Biometrics disabled');
                                  window.location.reload();
                                }
                              } else {
                                const res = await registerBiometric(currentRep);
                                if (res.success) {
                                  alert(lang === 'si' ? 'මුහුණ / ඇඟිලි සලකුණ සාර්ථකව සක්‍රීය කරන ලදී!' : 'Fingerprint/Face ID setup completed successfully!');
                                  window.location.reload();
                                } else {
                                  alert(res.error || (lang === 'si' ? 'ජෛවමිතිය සක්‍රීය කිරීම අසාර්ථකයි' : 'Biometric setup failed'));
                                }
                              }
                            }}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-full font-bold text-xs transition-colors border shrink-0 ${
                              hasBiometricRegistered(currentRep.id) 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            }`}
                            title={hasBiometricRegistered(currentRep.id) ? "Click to remove Fingerprint / Face ID" : "Click to setup Fingerprint / Face ID"}
                          >
                            <Fingerprint size={16} className={hasBiometricRegistered(currentRep.id) ? "text-emerald-600" : "text-blue-600"} />
                            <span className="hidden sm:inline">
                              {hasBiometricRegistered(currentRep.id) 
                                ? (lang === 'si' ? 'ජෛවමිතිය Active' : 'Biometric Active') 
                                : (lang === 'si' ? 'ඇඟිලි සලකුණ Setup' : 'Setup Biometric')}
                            </span>
                          </button>
                        )}

                        <div className="flex items-center gap-3 px-4 py-2 border border-slate-200 rounded-full bg-white flex-1 sm:flex-none">
                           <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                           <div className="truncate">
                             <div className="text-sm font-bold text-slate-800 truncate">{currentRep?.email || 'User'}</div>
                             <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider">{currentRep?.name || 'REP'} {currentRep?.activeArea ? `- ${currentRep.activeArea}` : ''}</div>
                           </div>
                        </div>
                        <button onClick={() => {
                          if (currentRep?.role === 'admin' || currentRep?.role === 'super_admin') {
                            navigate('/admin');
                          } else {
                            navigate('/');
                          }
                        }} className="flex items-center gap-2 px-4 py-2 border border-rose-100 bg-rose-50 rounded-full text-rose-600 font-bold hover:bg-rose-100 transition-colors shrink-0">
                          <LogOut size={16} /> <span className="hidden sm:inline">Logout</span>
                        </button>
                      </div>
                    </div>
                 </div>

                 {/* Colorful Cards Grid */}
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                   {tabs.map(tab => (
                     <button
                       key={tab.id}
                       onClick={() => handleTabChange(tab.id)}
                       className="flex flex-col items-center justify-center p-6 md:p-8 bg-white rounded-[2rem] shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300 border border-slate-100 aspect-square group"
                     >
                       <div className={`p-4 md:p-5 rounded-[1.5rem] mb-4 md:mb-6 transition-transform duration-300 group-hover:scale-110 ${tab.color}`}>
                         {tab.icon}
                       </div>
                       <span className="font-extrabold text-slate-800 text-sm md:text-lg text-center tracking-tight bg-gradient-to-br from-slate-800 to-slate-600 bg-clip-text text-transparent">
                         {tab.label}
                       </span>
                     </button>
                   ))}
                 </div>
               </div>
            )}
            {activeTab === 'billing' && <BillingTab setPopup={setPopup} t={t} inventory={inventory} setInventory={handleUpdateInventory} currentRep={currentRep} lang={lang} customers={customers} setCustomers={setCustomers} salesHistory={salesData} setSalesHistory={setSalesData} actionRequests={actionRequests} setActionRequests={setActionRequests} setPrintData={setPrintData} setTriggerPrint={setTriggerPrint} setRequestedCopies={setRequestedCopies} requestedCopies={requestedCopies} printData={printData} orgSettings={orgSettings} printImageSrc={printImageSrc} onDeleteSale={handleCancelSale} editingSale={editingSale} setEditingSale={setEditingSale} onRequireSettlement={() => handleTabChange('settlement')} />}
            {activeTab === 'customer_history' && <CustomerHistoryTab salesHistory={salesData} lang={lang} onDeleteSale={handleCancelSale} onEditSale={handleEditSale} />}
            {activeTab === 'inventory' && <RepInventoryTab t={t} inventory={inventory} lang={lang} />}
            {activeTab === 'return_goods' && <ReturnStockTab t={t} inventory={inventory} setInventory={handleUpdateInventory} currentRep={currentRep!} setPopup={setPopup} />}
            {activeTab === 'settlement' && <SettlementTab t={t} currentRep={currentRep} inventory={inventory} setInventory={handleUpdateInventory} salesData={salesData} lang={lang} />}
            {activeTab === 'cashbook' && <CashBookTab t={t} currentRep={currentRep} setCurrentRep={setCurrentRep} lang={lang} salesData={salesData} />}
            {activeTab === 'attendance' && <AttendanceTab t={t} todayAttendance={todayAttendance} setTodayAttendance={setTodayAttendance} currentRep={currentRep!} salesData={salesData} onMarkAttendance={markAttendance} />}
          </motion.div>
        </div>
      </div>

      {/* Forced Start Day Modal (Cannot bypass without OK or Cancel/Logout) */}
      {isDataLoaded && !!currentRep && !todayAttendance && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] max-w-lg w-full p-8 shadow-2xl border border-slate-100 flex flex-col items-center text-center relative overflow-hidden my-auto"
          >
            <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500" />

            <div className="w-24 h-24 rounded-full bg-emerald-50 border-8 border-emerald-100 flex items-center justify-center text-emerald-600 mb-6 shadow-xl shadow-emerald-500/10">
              <Truck size={48} className="animate-bounce" />
            </div>

            <h2 className="font-display text-3xl font-bold text-slate-900 tracking-tight mb-1">
              දවසේ වැඩ ආරම්භ කරන්න
            </h2>
            <p className="text-xs font-bold text-emerald-600 mb-6 uppercase tracking-wider">
              Start Day's Work Required
            </p>

            <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6 text-left space-y-2.5">
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-xs font-semibold uppercase text-slate-400">අලෙවි නියෝජිත (Rep):</span>
                <span className="font-bold text-sm text-slate-900">{currentRep?.name}</span>
              </div>
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-xs font-semibold uppercase text-slate-400">දිනය (Date):</span>
                <span className="font-semibold text-xs text-slate-700">{formatSinhalaDate(new Date(), { includeWeekday: true })}</span>
              </div>
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-xs font-semibold uppercase text-slate-400">ජංගම දත්ත / GPS:</span>
                <span className="inline-flex items-center text-xs font-bold text-emerald-600 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                  <Wifi size={12} className="mr-1 animate-pulse" /> ස්ථානය සහ ඩේටා සක්‍රියයි
                </span>
              </div>
            </div>

            <p className="text-slate-600 text-sm leading-relaxed mb-8">
              අද දවසේ අලෙවි කටයුතු, බිල්පත් නිකුත් කිරීම් සහ තොග පරීක්ෂාව ආරම්භ කිරීමට ප්‍රථමයෙන් කරුණාකර පහත <strong className="text-emerald-600">"ඕකේ / වැඩ ආරම්භ කරන්න"</strong> බටන් එක ඔබන්න.
            </p>

            <div className="w-full space-y-3">
              <button
                onClick={() => markAttendance(false)}
                disabled={isStartingDay}
                className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-lg rounded-2xl shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-all disabled:opacity-50 active:scale-95"
              >
                {isStartingDay ? (
                  <>
                    <RefreshCw size={22} className="animate-spin mr-2" />
                    ස්ථානය ලබා ගනිමින්... (Marking Attendance...)
                  </>
                ) : (
                  <>
                    <CheckSquare size={24} className="mr-2" />
                    ඕකේ / වැඩ ආරම්භ කරන්න (Start Day)
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  sessionStorage.removeItem('current_rep');
                  navigate('/');
                }}
                disabled={isStartingDay}
                className="w-full py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-sm rounded-2xl flex items-center justify-center transition-all"
              >
                <LogOut size={16} className="mr-1.5" />
                කැන්සල් / පිටවන්න (Cancel & Logout)
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Popup renderer at root */}
      {popup && popup.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2.5rem] max-w-md w-full p-8 shadow-2xl border border-slate-100 flex flex-col items-center text-center transform transition-all animate-in fade-in zoom-in-95 duration-200">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 shadow-lg ${
              popup.type === 'success' 
                ? 'bg-emerald-50 text-emerald-600 shadow-emerald-100' 
                : 'bg-rose-50 text-rose-600 shadow-rose-100'
            }`}>
              {popup.type === 'success' ? (
                <CheckCircle size={44} className="animate-pulse" />
              ) : (
                <AlertTriangle size={44} className="animate-bounce" />
              )}
            </div>

            <h4 className={`text-2xl font-bold mb-3 ${
              popup.type === 'success' ? 'text-emerald-800 font-display' : 'text-rose-800 font-display'
            }`}>
              {popup.title}
            </h4>

            <p className="text-slate-600 text-sm mb-6 leading-relaxed whitespace-pre-wrap">
              {popup.message}
            </p>

            {popup.items && popup.items.length > 0 && (
              <div className="w-full bg-slate-50 rounded-2xl p-5 mb-6 max-h-56 overflow-y-auto text-left border border-slate-100">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-200 pb-2 flex justify-between">
                  <span>පටවන ලද බඩු (Item Name)</span>
                  <span>ප්‍රමාණය (Quantity)</span>
                </div>
                <div className="space-y-2.5">
                  {popup.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm font-medium text-slate-700">
                      <span>{item.name}</span>
                      <span className="font-bold text-slate-900 bg-slate-200/60 px-2.5 py-0.5 rounded-lg text-xs">{item.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setPopup(null)}
              className={`w-full py-4 rounded-2xl font-bold text-white transition-all shadow-lg text-base ${
                popup.type === 'success'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/30'
              }`}
            >
              හරි (Understand)
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Pill */}
      {activeTab !== 'home' && (
        <div className="md:hidden fixed bottom-4 left-4 right-4 bg-white/80 backdrop-blur-xl border border-slate-200/50 shadow-2xl rounded-full px-2 py-2 flex justify-between items-center z-50">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-300 ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}
              >
                {React.cloneElement(tab.icon as any, { size: isActive ? 24 : 20 })}
              </button>
            )
          })}
        </div>
      )}

    </div>
  );
}

function BillingTab({ t, inventory, setInventory, currentRep, lang, customers, setCustomers, salesHistory, setSalesHistory, actionRequests, setActionRequests, setPrintData: setPrintDataProp, setTriggerPrint, setRequestedCopies, requestedCopies, printData, orgSettings, setPopup, printImageSrc, onDeleteSale, editingSale, setEditingSale, onRequireSettlement }: { t: (key: string) => string, inventory: any[], setInventory: any, currentRep: SystemUser | null, lang: 'en'|'si', customers: any[], setCustomers: any, salesHistory: any[], setSalesHistory: any, actionRequests: AIActionRequest[], setActionRequests: any, setPrintData: any, setTriggerPrint: any, setRequestedCopies?: any, requestedCopies?: number, printData: any, orgSettings: any, setPopup: any, printImageSrc: string | null, onDeleteSale?: (sale: any) => void, editingSale?: any, setEditingSale?: any, onRequireSettlement?: () => void }) {
  console.log("BillingTab called. printData prop:", printData);
  const [showAllRecentBills, setShowAllRecentBills] = useState(false);
  const [mode, setMode] = useState<'sale' | 'credit'>(() => (localStorage.getItem('bizflow_rep_billing_mode') as 'sale' | 'credit') || 'sale');
  const [itemInputQty, setItemInputQty] = useState<{[key: string]: string}>({});
  const [cart, setCart] = useState<any[]>(() => {
    const saved = localStorage.getItem('bizflow_rep_billing_cart');
    return saved ? JSON.parse(saved) : [];
  });
  const [customer, setCustomer] = useState(() => localStorage.getItem('bizflow_rep_billing_customer') || '');
  const [address, setAddress] = useState(() => localStorage.getItem('bizflow_rep_billing_address') || '');
  const [coRepId, setCoRepId] = useState(() => localStorage.getItem('bizflow_rep_billing_coRepId') || '');
  const [paymentType, setPaymentType] = useState(() => localStorage.getItem('bizflow_rep_billing_paymentType') || 'Cash');
  const [splitCashAmount, setSplitCashAmount] = useState(() => localStorage.getItem('bizflow_rep_billing_splitCashAmount') || '');
  const [splitChequeAmount, setSplitChequeAmount] = useState(() => localStorage.getItem('bizflow_rep_billing_splitChequeAmount') || '');
  const [chequeNo, setChequeNo] = useState(() => localStorage.getItem('bizflow_rep_billing_chequeNo') || '');
  const [partialAmount, setPartialAmount] = useState(() => localStorage.getItem('bizflow_rep_billing_partialAmount') || '');
  const [todayPaidAmount, setTodayPaidAmount] = useState('');
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(() => Number(localStorage.getItem('bizflow_rep_billing_invoiceDiscount')) || 0);
  const [printMethod, setPrintMethod] = useState<'bluetooth' | 'rawbt' | 'system'>(() => {
    return 'bluetooth';
  });

  useEffect(() => {
    localStorage.setItem('bizflow_rep_billing_mode', mode);
    localStorage.setItem('bizflow_rep_billing_cart', JSON.stringify(cart));
    localStorage.setItem('bizflow_rep_billing_customer', customer);
    localStorage.setItem('bizflow_rep_billing_address', address);
    localStorage.setItem('bizflow_rep_billing_coRepId', coRepId);
    localStorage.setItem('bizflow_rep_billing_paymentType', paymentType);
    localStorage.setItem('bizflow_rep_billing_splitCashAmount', splitCashAmount);
    localStorage.setItem('bizflow_rep_billing_splitChequeAmount', splitChequeAmount);
    localStorage.setItem('bizflow_rep_billing_chequeNo', chequeNo);
    localStorage.setItem('bizflow_rep_billing_partialAmount', partialAmount);
    localStorage.setItem('bizflow_rep_billing_invoiceDiscount', invoiceDiscount.toString());
  }, [mode, cart, customer, address, coRepId, paymentType, splitCashAmount, splitChequeAmount, chequeNo, partialAmount, invoiceDiscount]);

  useEffect(() => {
    localStorage.setItem('bizflow_print_method', printMethod);
  }, [printMethod]);

  const [creditReceivedAmount, setCreditReceivedAmount] = useState('');
  const [initialCredit, setInitialCredit] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [locationStr, setLocationStr] = useState<string>('');
  const [previewSale, setPreviewSale] = useState<any>(null);
  const [customerSalesHistory, setCustomerSalesHistory] = useState<any[]>([]);
  const [nearbyShops, setNearbyShops] = useState<string[]>([]);
  const [isCartCollapsed, setIsCartCollapsed] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [mobileSubTab, setMobileSubTab] = useState<'stock' | 'bill'>('stock');

  // Physical/hardware back button integration for BillingTab popups & modals
  useEffect(() => {
    const hasBackAction = isCartModalOpen || !!previewSale;

    if (hasBackAction) {
      const currentState = window.history.state;
      if (!currentState || currentState.billing_modal === undefined) {
        window.history.pushState({ app: 'mym_bizflow', billing_modal: true }, '');
      }
    }

    const handlePopState = (event: PopStateEvent) => {
      if (previewSale) {
        setPreviewSale(null);
        if (isCartModalOpen) {
          window.history.pushState({ app: 'mym_bizflow', billing_modal: true }, '');
        }
      } else if (isCartModalOpen) {
        setIsCartModalOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isCartModalOpen, previewSale]);
  
  const otherReps = getUsers().filter(u => u.role !== 'admin' && u.id !== currentRep?.id);

  const todayStr = getTodayDateStr();
  const todaysSales = salesHistory.filter(s => (currentRep?.role === 'admin' || s.repId === currentRep?.id || s.coRepId === currentRep?.id) && s.mode === 'sale' && getSaleDateStr(s) === todayStr);
  let hasSaleToday = false;
  let initialCoRep = '';
  if (todaysSales.length > 0) {
    hasSaleToday = true;
    const sortedSales = [...todaysSales].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    initialCoRep = sortedSales[0].coRepId || '';
  }

  useEffect(() => {
    if (hasSaleToday) {
      setCoRepId(initialCoRep);
    }
  }, [hasSaleToday, initialCoRep]);

  const calculateDistance = (loc1: string, loc2: string) => {
    if (!loc1 || !loc2) return Infinity;
    try {
      const parts1 = loc1.split(',');
      const parts2 = loc2.split(',');
      if (parts1.length < 2 || parts2.length < 2) return Infinity;
      const [lat1, lon1] = parts1.map(Number);
      const [lat2, lon2] = parts2.map(Number);
      if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return Infinity;
      // Approx meters
      const dLat = (lat1 - lat2) * 111111;
      const dLon = (lon1 - lon2) * 111111 * Math.cos(lat1 * Math.PI / 180);
      return Math.sqrt(dLat * dLat + dLon * dLon);
    } catch (e) { return Infinity; }
  };

  React.useEffect(() => {
    let watchId: number;
    if (navigator.geolocation) {
      // Get initial position quickly
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocationStr(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
        (err) => console.log(err)
      );

      // Setup continuous watch for local tracking
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
          setLocationStr(loc);
          // Note: rep_locations cloud sync disabled to prevent Firebase quota exhaustion
        },
        (err) => console.log(err),
        { enableHighAccuracy: true, maximumAge: 10000 }
      );
    }
    
    // Fetch relevant history to detect existing shops at this location
    fetchTableData('sales').then(data => {
       if (data) {
         setCustomerSalesHistory(data);
       }
    });

    // Also fetch customers for better detection
    fetchTableData('customers').then(data => {
      if (data && customers.length === 0) setCustomers(data);
    });

    return () => {
      if (watchId !== undefined && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [currentRep]);

  useEffect(() => {
    // Sync cart needsApproval with global actionRequests (polling results)
    if (cart.length > 0 && actionRequests.length > 0) {
      setCart(prev => {
        let changed = false;
        const next = prev.map(c => {
          if (c.needsApproval) {
            const isApproved = actionRequests.some(r => 
              r.status === 'Approved' && 
              String(r.metadata?.itemId) === String(c.id) && 
              Number(r.metadata?.requestedPrice) === Number(c.price)
            );
            if (isApproved) {
              changed = true;
              return { ...c, needsApproval: false };
            }
          }
          return c;
        });
        return changed ? next : prev;
      });
    }
  }, [actionRequests, cart.length]);

  useEffect(() => {
    if (locationStr && (customerSalesHistory.length > 0 || customers.length > 0)) {
      const matches = new Set<string>();
      
      // Check sales history
      customerSalesHistory.forEach(s => {
        if (s.locationStr && s.customer && calculateDistance(locationStr, s.locationStr) < 45) {
          matches.add(s.customer);
        }
      });
      
      // Check customers list
      customers.forEach(c => {
        if (c.locationStr && c.name && calculateDistance(locationStr, c.locationStr) < 45) {
          matches.add(c.name);
        }
      });

      setNearbyShops(Array.from(matches));
    }
  }, [locationStr, customerSalesHistory, customers]);

  const addToCart = (item: any, isReturn = false) => {
    const cartId = item.id + (isReturn ? '_return' : '_sale');
    const existing = cart.find(c => c.cartId === cartId);
    const inputQty = itemInputQty[item.id] ? Number(itemInputQty[item.id]) : 1;
    
    // We allow adding to cart even if stock is low, but we show warning in UI later
    if (existing) {
      setCart(cart.map(c => c.cartId === cartId ? { ...c, qty: Number(c.qty) + inputQty } : c));
    } else {
      setCart([...cart, { ...item, cartId, qty: inputQty, price: item.maxPrice, isReturn, freeQty: 0, isFreeScheme: false, isSample: false }]);
    }
    
    if (itemInputQty[item.id]) {
        setItemInputQty(prev => {
            const next = {...prev};
            delete next[item.id];
            return next;
        });
    }

    setIsCartCollapsed(false);
  };

  const getPreviousPrices = (itemId: number) => {
    if (!customer || !customer.trim()) return null;
    const sales = customerSalesHistory.filter(s => 
      (s.customer || '').toLowerCase().trim() === (customer || '').toLowerCase().trim()
    );
    if (sales.length === 0) return null;
    const prices = new Set<number>();
    sales.forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
         sale.items.forEach((cItem: any) => {
            if (cItem.id === itemId && !cItem.isReturn && cItem.price > 0) {
              prices.add(cItem.price);
            }
         });
      }
    });

    if (prices.size === 0) return null;
    return Array.from(prices).sort((a,b) => b - a);
  };

  const isSoyaItem = (name: string) => {
    if (!name) return false;
    const n = String(name).toLowerCase();
    return n.includes('soya') || n.includes('සෝයා');
  };

  const isDrinkItem = (name: string) => {
    if (!name) return false;
    const n = String(name).toLowerCase();
    return n.includes('drink') || n.includes('බීම') || n.includes('nectar') || n.includes('juice') || n.includes('beverage');
  };

  const updateCartPrice = (cartId: string, priceStr: string) => {
    let p = parseFloat(priceStr);
    const item = cart.find(c => c.cartId === cartId);
    if (!item) return;
    if (isNaN(p)) p = item.maxPrice;
    
    if (currentRep?.role !== 'admin' && p < item.minPrice && !item.isReturn) {
      // Check for FRESH approved requests matching this item and price
      const currentActionRequests = getAIActionRequests();
      const hasApproved = currentActionRequests.some(r => 
        r.status === 'Approved' && 
        String(r.metadata?.itemId) === String(item.id) && 
        Number(r.metadata?.requestedPrice) === Number(p)
      );

      if (hasApproved) {
        setCart(cart.map(c => c.cartId === cartId ? { ...c, price: p, needsApproval: false } : c));
        return;
      }
      
      setCart(cart.map(c => c.cartId === cartId ? { ...c, price: p, needsApproval: true } : c));
      return;
    }
    
    setCart(cart.map(c => c.cartId === cartId ? { ...c, price: p, needsApproval: false } : c));
  };

  const requestApproval = (item: any) => {
    const requestId = 'REQ-' + Date.now().toString().slice(-6);
    const customerObj = customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim());
    const request: AIActionRequest = {
      id: requestId,
      repId: currentRep?.id || 'unknown',
      repName: currentRep?.name || 'Unknown Rep',
      type: 'price_approval',
      actionType: 'price_approval',
      description: `Price Approval Request for ${customer}: ${item.name} at Rs ${item.price} (Min: ${item.minPrice})`,
      status: 'Pending',
      timestamp: new Date().toISOString(),
      payload: {
        type: 'price_approval',
        customer,
        address,
        locationStr,
        paymentType,
        total,
        items: cart,
        mode
      },
      metadata: {
        itemId: item.id.toString(), // Store as string for consistency
        requestedPrice: Number(item.price),
        minPrice: Number(item.minPrice),
        customerName: customer,
        customerLocation: customerObj?.location
      }
    };
    
    
    
    // Update local state for immediate feedback
    const freshReqs = getAIActionRequests();
    const updated = [...freshReqs, request];
    saveAIActionRequests(updated);
    setActionRequests(updated.filter(r => r.repId === currentRep?.id));
    
    alert("මතක් කිරීම: අනුමැතිය සඳහා ඇඩ්මින් වෙත ඉල්ලීමක් යොමු කරන ලදී.\n(Approval request sent to Admin)");
  };

  const updateCartQty = (cartId: string, qtyStr: string) => {
    const qty = parseFloat(qtyStr) || 0;
    setCart(cart.map(c => {
      if (c.cartId === cartId) {
        let freeQty = 0;
        if (c.isFreeScheme) {
          if (c.freeThreshold && c.freeThreshold > 0) {
            freeQty = Math.floor(qty / c.freeThreshold) * (c.freeBonus || 0);
          } else if (isSoyaItem(c.name)) {
            if (qty >= 60) freeQty = 10;
            else if (qty >= 30) freeQty = 3;
            else if (qty >= 15) freeQty = 1;
          } else {
            freeQty = Math.floor(qty / 12);
          }
        }
        return { ...c, qty: qtyStr as any, freeQty };
      }
      return c;
    }));
  };

  const toggleFreeScheme = (cartId: string, enabled: boolean) => {
    setCart(cart.map(c => {
      if (c.cartId === cartId) {
        const qty = parseFloat(c.qty) || 0;
        let freeQty = 0;
        if (enabled) {
          if (c.freeThreshold && c.freeThreshold > 0) {
            freeQty = Math.floor(qty / c.freeThreshold) * (c.freeBonus || 0);
          } else if (isSoyaItem(c.name)) {
            if (qty >= 60) freeQty = 10;
            else if (qty >= 30) freeQty = 3;
            else if (qty >= 15) freeQty = 1;
          } else {
            freeQty = Math.floor(qty / 12);
          }
        }
        return { ...c, isFreeScheme: enabled, freeQty };
      }
      return c;
    }));
  };

  const subTotal = cart.reduce((acc, curr) => curr.isReturn ? acc - (curr.price * (Number(curr.qty) || 0)) : acc + ((curr.isSample ? 0 : curr.price) * (Number(curr.qty) || 0)), 0);
  const discountAmount = subTotal * ((invoiceDiscount || 0) / 100);
  const total = Math.max(0, subTotal - discountAmount);

  const handleCancelSale = async (sale: any) => {
    if (onDeleteSale) {
      onDeleteSale(sale);
      return;
    }
    if (!sale) return;

    const isAlreadyCancelled = sale.status === 'cancelled';
    const confirmMsg = isAlreadyCancelled
      ? (lang === 'si' ? 'මෙම අවලංගු කළ බිල්පත පද්ධතියෙන් සහ ඉතිහාසයෙන් මුළුමනින්ම මකා දැමීමට (Delete) අවශ්‍යද?' : 'Do you want to permanently delete this bill record from history?')
      : (lang === 'si' ? 'ඔබට විශ්වාසද මෙම බිල්පත අවලංගු කර මකා දැමීමට (Cancel & Delete) අවශ්‍යද?' : 'Are you sure you want to cancel and delete this bill?');

    if (!window.confirm(confirmMsg)) return;

    // Revert Inventory and Customer Balance if active
    if (!isAlreadyCancelled) {
      if (sale.mode === 'sale' && sale.items && Array.isArray(sale.items)) {
        const updatedInv = [...inventory];
        for (const item of sale.items) {
          const idx = updatedInv.findIndex((i: any) => String(i.id) === String(item.id));
          if (idx > -1) {
            const invItem = { ...updatedInv[idx] };
            const soldQty = item.isReturn ? 0 : (Number(item.qty || 0) + Number(item.freeQty || 0));
            const returnedQty = item.isReturn ? Number(item.qty || 0) : 0;
            
            invItem.myStock = (invItem.myStock || 0) + soldQty;
            invItem.returnStock = (invItem.returnStock || 0) - returnedQty;
            
            updatedInv[idx] = invItem;
          }
        }
        setInventory(updatedInv);
        if (currentRep?.id) {
          saveRepInventory(currentRep.id, updatedInv);
        }
      }
      
      // Revert Customer Balance
      if (sale.customer) {
        const targetCust = customers.find(c => (c.name || '').toLowerCase().trim() === (sale.customer || '').toLowerCase().trim());
        if (targetCust) {
          let creditToAdd = 0;
          if (sale.mode === 'credit') {
            creditToAdd = -Number(sale.creditReceivedAmount || 0);
          } else {
            const pType = sale.paymentType;
            const tot = Number(sale.total || 0);
            if (pType === 'Credit') {
              creditToAdd = tot;
            } else if (pType === 'Half-payment') {
              creditToAdd = tot - Number(sale.partialAmount || 0);
            } else if (sale.addedCredit !== undefined) {
              creditToAdd = Number(sale.addedCredit);
            }
          }

          const updatedCust = {
            ...targetCust,
            balance: Math.max(0, (targetCust.balance || 0) - creditToAdd)
          };
          const newCusts = customers.map(c => c.id === targetCust.id ? updatedCust : c);
          setCustomers(newCusts);
          localStorage.setItem('bizflow_customers_v1', JSON.stringify(newCusts));
          addToSyncQueue({ table: 'customers', action: 'update', data: updatedCust });
        }
      }
    }

    // 1. Delete record from cloud sync queue
    const targetId = sale.id || sale.docId || sale._id;
    addToSyncQueue({ table: 'sales', action: 'delete', data: { id: targetId, docId: sale.docId } }); 

    // 2. Remove from React state
    setSalesHistory((prev: any[]) => prev.filter(s => String(s.id) !== String(targetId) && String(s.docId || '') !== String(targetId)));

    // 3. Remove from localStorage
    const orgId = getActiveOrgId();
    const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
    try {
      const storedSales = JSON.parse(storedSalesStr);
      const updatedSales = storedSales.filter((s: any) => String(s.id) !== String(targetId) && String(s.docId || '') !== String(targetId));
      localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(updatedSales));
      localStorage.setItem('bizflow_sales_v1', JSON.stringify(updatedSales));
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: updatedSales } }));
    } catch (e) {
      console.error("Error updating local storage sales:", e);
    }

    alert(lang === 'si' ? 'බිල්පත සාර්ථකව මකා දමන ලදී (Bill Deleted Successfully).' : 'Bill Deleted Successfully.');
  };

  const handleEditLastSale = async (sale: any) => {
    if (!sale) return;

    if (!window.confirm(lang === 'si' ? 'ඔබට විශ්වාසද මෙම බිල්පත සංස්කරණය කිරීමට අවශ්‍යද? (මෙය ස්ටොක් සහ ණය ප්‍රමාණය පරණ තත්වයට පත් කරයි)' : 'Are you sure you want to edit this bill? (This will revert stock and balances)')) return;

    // 1. Revert Inventory
    if (sale.mode === 'sale' && sale.items && Array.isArray(sale.items)) {
      const updatedInv = [...inventory];
      for (const item of sale.items) {
        const idx = updatedInv.findIndex((i: any) => String(i.id) === String(item.id));
        if (idx > -1) {
          const invItem = { ...updatedInv[idx] };
          const soldQty = item.isReturn ? 0 : (Number(item.qty || 0) + Number(item.freeQty || 0));
          const returnedQty = item.isReturn ? Number(item.qty || 0) : 0;
          invItem.myStock = (invItem.myStock || 0) + soldQty;
          invItem.returnStock = (invItem.returnStock || 0) - returnedQty;
          updatedInv[idx] = invItem;
        }
      }
      setInventory(updatedInv);
      if (currentRep?.id) {
        saveRepInventory(currentRep.id, updatedInv);
      }
    }

    // 2. Revert Customer Balance
    const targetCust = customers.find(c => (c.name || '').toLowerCase().trim() === (sale.customer || '').toLowerCase().trim());
    if (targetCust) {
       let creditToAdd = 0;
       if (sale.mode === 'credit') {
         creditToAdd = -Number(sale.creditReceivedAmount || 0);
       } else {
         const pType = sale.paymentType;
         const tot = Number(sale.total || 0);
         if (pType === 'Credit') {
           creditToAdd = tot;
         } else if (pType === 'Half-payment') {
           creditToAdd = tot - Number(sale.partialAmount || 0);
         } else if (sale.addedCredit !== undefined) {
           creditToAdd = Number(sale.addedCredit);
         }
       }

       const updatedCust = {
         ...targetCust,
         balance: Math.max(0, (targetCust.balance || 0) - creditToAdd)
       };
       const newCusts = customers.map(c => c.id === targetCust.id ? updatedCust : c);
       setCustomers(newCusts);
       localStorage.setItem('bizflow_customers_v1', JSON.stringify(newCusts));
       addToSyncQueue({ table: 'customers', action: 'update', data: updatedCust });
    }

    // 3. Load into State
    setMode(sale.mode || 'sale');
    setCustomer(sale.customer || '');
    setAddress(sale.address || '');
    setInitialCredit(sale.initialCredit ? sale.initialCredit.toString() : '');
    if (sale.mode === 'sale') {
       setCart(sale.items || []);
       setPaymentType(sale.paymentType || 'Cash');
       setPartialAmount(sale.partialAmount?.toString() || '');
    } else {
       setCreditReceivedAmount(sale.creditReceivedAmount?.toString() || '');
    }

    // 4. Delete old record
    const targetId = sale.id || sale.docId || sale._id;
    addToSyncQueue({ table: 'sales', action: 'delete', data: { id: targetId, docId: sale.docId } }); 
    setSalesHistory((prev: any[]) => prev.filter(s => String(s.id) !== String(targetId) && String(s.docId || '') !== String(targetId)));

    const orgId = getActiveOrgId();
    const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
    try {
      const storedSales = JSON.parse(storedSalesStr);
      const updatedSales = storedSales.filter((s: any) => String(s.id) !== String(targetId) && String(s.docId || '') !== String(targetId));
      localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(updatedSales));
      localStorage.setItem('bizflow_sales_v1', JSON.stringify(updatedSales));
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: updatedSales } }));
    } catch (e) {
      console.error("Error updating local storage sales:", e);
    }

    alert(lang === 'si' ? 'බිල්පත සංස්කරණ මාදිලියට පත් කරන ලදී. අවශ්‍ය වෙනස්කම් සිදු කර නැවත සේව් කරන්න.' : 'Bill loaded into edit mode. Make changes and finalize again.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (editingSale) {
      handleEditLastSale(editingSale);
      if (setEditingSale) setEditingSale(null);
    }
  }, [editingSale]);

  const base64EncodeUnicode = (str: string) => {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  };

  const printToEscApp = (sale: any, copies: number = 1) => {
    let text = `     MYM BIZFLOW\n`;
    text += `66, Alhena Bokalagama\n`;
    text += `Hotline: 0787314139\n`;
    text += `--------------------------------\n`;
    text += `Date: ${new Date(sale.createdAt).toLocaleDateString()}\n`;
    text += `Bill No: ${sale.id}\n`;
    text += `Customer: ${sale.customer}\n`;
    text += `--------------------------------\n`;
    
    if (sale.mode === 'sale') {
      (sale.items || []).forEach((c: any) => {
        text += `${c.isReturn ? '[R] ' : ''}${c.name}\n`;
        text += `  ${c.qty} x ${Number(c.price).toFixed(2)} = ${(Number(c.qty) * Number(c.price)).toFixed(2)}\n`;
        if (c.freeQty > 0) text += `  FREE: ${c.freeQty}\n`;
      });
      text += `--------------------------------\n`;
      text += `TOTAL: Rs ${Number(sale.total).toFixed(2)}\n`;
      if (sale.paymentType === 'Half-payment') {
          text += `Paid: Rs ${Number(sale.partialAmount || 0).toFixed(2)}\n`;
          text += `Balance: Rs ${Number((sale.total || 0) - (sale.partialAmount || 0)).toFixed(2)}\n`;
      }
    }

    if (sale.previousBalance !== undefined) {
       text += `\nPre Arrears: Rs ${Number(sale.previousBalance || 0).toFixed(2)}\n`;
       if (sale.mode === 'credit' && sale.creditReceivedAmount) {
         text += `Payment: -Rs ${Number(sale.creditReceivedAmount || 0).toFixed(2)}\n`;
       }
       if (sale.mode === 'sale' && (sale.paymentType === 'Credit' || sale.paymentType === 'Half-payment')) {
         text += `Today Arrears: Rs ${Number(sale.addedCredit || 0).toFixed(2)}\n`;
       }
       text += `\nFINAL BALANCE: Rs ${Number(sale.newBalance || 0).toFixed(2)}\n`;
    }
    
    text += `\nPowered by MYM BizFlow Cloud\n\n\n\n`;
    text = text.repeat(copies);
    console.log("Printing Text");

    if (printMethod === 'bluetooth') {
      connectBluetoothPrinter()
        .then(connected => {
          if (connected) {
              setRequestedCopies?.(copies);
              setPrintDataProp(sale);
              setTriggerPrint((prev: number) => prev + 1);
          }
        })
        .catch(err => {
          
        });
      return;
    }

    if (printMethod === 'system') {
      setRequestedCopies?.(copies);
      setPrintDataProp(sale);
      setTriggerPrint((prev: number) => prev + 1);
      return;
    }
    
    if (printMethod === 'rawbt') {
      setRequestedCopies?.(copies);
      setPrintDataProp(sale);
      setTriggerPrint((prev: number) => prev + 1);
      return;
    }

    // Direct RawBT intent as instant fallback without netlify redirection
    const base64Text = base64EncodeUnicode(text);
    const intentUrl = `intent:base64,${base64Text}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;i.copies=${copies};end;`;
    try {
      window.location.href = intentUrl;
    } catch (e) {
      window.print();
    }
  };

  const handlePrintSale = async (sale: any) => {
    const printsCount = sale.printCount || 0;
    if (printsCount >= 6) {
      alert(lang === 'si' ? 'උපරිම බිල් 6කට පමණක් සීමා කර ඇත! (Maximum 6 prints allowed per bill)' : 'Maximum 6 prints allowed per bill!');
      return;
    }
    
    const copiesStr = await appPrompt("කොපි කීයක් ප්‍රින්ට් කරන්න ඕනෙද? (How many copies? Max: 6)", "1");
    if (!copiesStr) return;
    const copies = parseInt(copiesStr, 10);
    if (isNaN(copies) || copies <= 0) return;
    if (copies > 6) {
      alert(lang === 'si' ? 'උපරිම බිල් 6ක් පමණක් ප්‍රින්ට් කළ හැක! (Maximum 6 copies allowed)' : 'Maximum 6 copies allowed!');
      return;
    }
    
    const updatedSale = { ...sale, printCount: printsCount + copies };
    
    // Optimistic UI update
    setSalesHistory((prev: any[]) => prev.map(s => s.id === sale.id ? updatedSale : s));
    addToSyncQueue({ table: 'sales', action: 'update', data: updatedSale });
    
    printToEscApp(updatedSale, Math.min(6, copies));
  };

  const performFinalizeTransaction = async (saleObj: any) => {
    // 0. IDEMPOTENCY CHECK - Don't save same ID twice 
    if (salesHistory.some(s => s.id === saleObj.id)) {
      console.log("Transaction already finalized:", saleObj.id);
      return;
    }

    // 1. Update Inventory
    if (saleObj.mode === 'sale') {
      const newInventory = inventory.map(item => {
        let soldQty = 0;
        let returnQty = 0;
        (saleObj.items || []).forEach((c: any) => {
          if (String(c.id) === String(item.id)) {
            if (c.isReturn) returnQty += (Number(c.qty) || 0);
            else soldQty += (Number(c.qty) || 0) + (Number(c.freeQty) || 0);
          }
        });
        return {
          ...item,
          myStock: Math.max(0, (item.myStock || 0) - soldQty),
          returnStock: (item.returnStock || 0) + returnQty
        };
      });
      setInventory(newInventory);
    }

    // 2. Update Customer Balance
    const orgId = getActiveOrgId();
    const targetCust = customers.find(c => (c.name || '').toLowerCase().trim() === (saleObj.customer || '').toLowerCase().trim());
    if (targetCust) {
      const updatedCust = { 
        ...targetCust, 
        balance: saleObj.newBalance,
        initialCreditAdded: targetCust.initialCreditAdded || (saleObj.initialCredit > 0),
        updatedAt: Date.now()
      };
      const newCusts = customers.map(c => c.id === targetCust.id ? updatedCust : c);
      setCustomers(newCusts);
      localStorage.setItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(newCusts));
      localStorage.setItem('bizflow_MYM-BIZFLOW_customers_v1', JSON.stringify(newCusts));
      localStorage.setItem('bizflow_customers_v1', JSON.stringify(newCusts));
      addToSyncQueue({ table: 'customers', action: 'update', data: updatedCust });
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'customers', data: newCusts } }));
    } else if (saleObj.customer && saleObj.customer.trim()) {
      const newCust = {
        id: 'cust_' + Date.now(),
        name: saleObj.customer.trim(),
        location: saleObj.address?.trim() || '',
        locationStr: saleObj.locationStr || '',
        balance: saleObj.newBalance,
        initialCreditAdded: (saleObj.initialCredit > 0),
        createdAt: new Date().toISOString(),
        updatedAt: Date.now()
      };
      const newCusts = [...customers, newCust];
      setCustomers(newCusts);
      localStorage.setItem(`bizflow_${orgId}_customers_v1`, JSON.stringify(newCusts));
      localStorage.setItem('bizflow_MYM-BIZFLOW_customers_v1', JSON.stringify(newCusts));
      localStorage.setItem('bizflow_customers_v1', JSON.stringify(newCusts));
      addToSyncQueue({ table: 'customers', action: 'insert', data: newCust });
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'customers', data: newCusts } }));
    }

    // 3. Save Sale Record
    addToSyncQueue({
      table: 'sales',
      action: 'insert',
      data: saleObj
    });
    setSalesHistory((prev: any) => {
      const updated = [saleObj, ...(prev || []).filter((s: any) => String(s.id) !== String(saleObj.id))];
      const orgId = getActiveOrgId();
      
      const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
      let allSales: any[] = [];
      try { allSales = JSON.parse(storedSalesStr); } catch (e) {}

      const salesMap = new Map<string, any>();
      if (Array.isArray(allSales)) {
        allSales.forEach((s: any) => {
          if (s && s.id) salesMap.set(String(s.id), s);
        });
      }
      salesMap.set(String(saleObj.id), saleObj);

      const getEpoch = (s: any) => new Date(s.createdAt || s.date || 0).getTime();
      const newAllSales = Array.from(salesMap.values()).sort((a: any, b: any) => getEpoch(b) - getEpoch(a));

      localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(newAllSales));
      localStorage.setItem('bizflow_sales_v1', JSON.stringify(newAllSales));
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: newAllSales } }));
      return updated;
    });

    // 4. Clear state
    setTimeout(() => {
      setCart([]);
      setCustomer('');
      setAddress('');
      setTodayPaidAmount('');
      setCreditReceivedAmount('');
      setSplitCashAmount('');
      setSplitChequeAmount('');
      setChequeNo('');
      setInitialCredit('');
      setInvoiceDiscount(0);
    }, 1500);
  };

  const handlePreviewBill = async () => {
    console.log("handlePreviewBill initiated. Cart:", cart);

    // 1. FRESH DATA CHECK
    const currentActionRequests = getAIActionRequests();
    
    // 2. CHECK FOR ITEMS NEEDING APPROVAL
    const pendingApprovalItems = currentRep?.role === 'admin'
      ? []
      : cart.filter(c => !c.isReturn && (c.needsApproval || c.price < c.minPrice));
    
      if (pendingApprovalItems.length > 0) {
        const allApproved = pendingApprovalItems.every(c => 
          currentActionRequests.some(r => 
            String(r.metadata?.itemId) === String(c.id) && 
            Number(r.metadata?.requestedPrice) === Number(c.price) && 
            r.status === 'Approved'
          )
        );
  
        if (!allApproved) {
          const itemNames = pendingApprovalItems.filter(c => 
            !currentActionRequests.some(r => 
              String(r.metadata?.itemId) === String(c.id) && 
              Number(r.metadata?.requestedPrice) === Number(c.price) && 
              r.status === 'Approved'
            )
          ).map(i => i.name).join(', ');
  
          alert(lang === 'si' 
            ? `සීමාව ඉක්මවා ඇත: පහත අයිතම සඳහා තවමත් ඇඩ්මින්ගේ අනුමැතිය ලැබී නැත: ${itemNames}` 
            : `Price limit exceeded: Admin approval is still pending for: ${itemNames}`);
          return;
        }
      }

    const currentTargetCust = customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim());
    const rawPreviousBalance = currentTargetCust?.balance || 0;
    const hasInitialCreditInput = initialCredit !== '' && initialCredit !== undefined && !isNaN(parseFloat(initialCredit));
    const initCredValue = hasInitialCreditInput ? parseFloat(initialCredit) : 0;

    // Fix: When initialCredit (edited arrears) is entered, it REPLACES rawPreviousBalance instead of adding to it.
    // Both old arrears and new edited arrears must NOT both be included in the bill.
    const effectivePreviousBalance = hasInitialCreditInput ? initCredValue : rawPreviousBalance;

    let newBalance = effectivePreviousBalance;
    let addedCredit = 0;
    let effectiveMode = mode;
    let creditRecAmt = 0;

    let paidVal = 0;
    let effectivePaymentType = paymentType;

    const splitCashVal = parseFloat(splitCashAmount) || 0;
    const splitChequeVal = parseFloat(splitChequeAmount) || 0;
    const splitTotalPaid = splitCashVal + splitChequeVal;

    if (paymentType === 'Cash + Cheque') {
      effectivePaymentType = 'Cash + Cheque';
      if (cart.length === 0 && customer) {
        effectiveMode = 'credit';
        creditRecAmt = splitTotalPaid;
        paidVal = creditRecAmt;
        newBalance = Math.max(0, newBalance - creditRecAmt);
      } else if (effectiveMode === 'sale') {
        paidVal = todayPaidAmount !== '' && !isNaN(parseFloat(todayPaidAmount)) ? parseFloat(todayPaidAmount) : splitTotalPaid;
        addedCredit = Math.max(0, total - paidVal);
        newBalance = Math.max(0, newBalance + total - paidVal);
      } else if (effectiveMode === 'credit') {
        creditRecAmt = splitTotalPaid;
        paidVal = creditRecAmt;
        newBalance = Math.max(0, newBalance - creditRecAmt);
      }
    } else if (cart.length === 0 && customer) {
      effectiveMode = 'credit';
      creditRecAmt = parseFloat(todayPaidAmount || creditReceivedAmount || '0');
      paidVal = creditRecAmt;
      newBalance = Math.max(0, newBalance - creditRecAmt);
    } else if (effectiveMode === 'sale') {
      paidVal = todayPaidAmount !== '' && !isNaN(parseFloat(todayPaidAmount))
        ? parseFloat(todayPaidAmount)
        : total;
      addedCredit = Math.max(0, total - paidVal);
      newBalance = Math.max(0, newBalance + total - paidVal);

      if (paidVal === 0) {
        effectivePaymentType = 'Credit';
      } else if (paidVal < total) {
        effectivePaymentType = 'Half-payment';
      } else {
        effectivePaymentType = paymentType || 'Cash';
      }
    } else if (effectiveMode === 'credit') {
      creditRecAmt = parseFloat(creditReceivedAmount || '0');
      paidVal = creditRecAmt;
      newBalance = Math.max(0, newBalance - creditRecAmt);
    }

    const saleObj = {
        id: effectiveMode === 'sale' ? 'INV-' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(-2) : 'CR-' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(-2),
        repId: currentRep?.id || 'unknown',
        coRepId: coRepId || null,
        customer,
        address,
        locationStr,
        paymentType: effectivePaymentType,
        payMethod: paymentType || 'Cash',
        cashAmount: paymentType === 'Cash + Cheque' ? splitCashVal : (paymentType === 'Cash' ? paidVal : 0),
        chequeAmount: paymentType === 'Cash + Cheque' ? splitChequeVal : (paymentType === 'Cheque' ? paidVal : 0),
        chequeNo: chequeNo || '',
        total: effectiveMode === 'sale' ? total : 0,
        invoiceDiscount,
        discountAmount: subTotal * (invoiceDiscount / 100),
        partialAmount: effectiveMode === 'sale' ? paidVal : 0,
        creditReceivedAmount: creditRecAmt,
        addedCredit,
        items: cart,
        mode: effectiveMode,
        previousBalance: effectivePreviousBalance,
        initialCredit: 0,
        newBalance,
        organizationId: getActiveOrgId(),
        createdAt: new Date().toISOString()
    };

    setPreviewSale(saleObj);
  };

  const handleConfirmPrint = async (saleObj: any, imageBlob?: Blob, canvas?: HTMLCanvasElement, copies: number = 1) => {
     await performFinalizeTransaction(saleObj);
     
     const updatedSale = { ...saleObj, printCount: copies };
     
     if (copies > 0) {
       try {
         if (printMethod === 'bluetooth' && canvas) {
           for (let i = 0; i < copies; i++) {
             await printCanvasViaBluetooth(canvas, orgSettings?.printerSize);
             if (i < copies - 1) {
               await new Promise(r => setTimeout(r, 1000));
             }
           }
         } else if (printMethod === 'rawbt' && canvas) {
           const escPosBytes = generateEscPosImage(canvas);
           let finalBytes = escPosBytes;
           if (copies > 1) {
               finalBytes = new Uint8Array(escPosBytes.length * copies);
               for (let i = 0; i < copies; i++) {
                   finalBytes.set(escPosBytes, i * escPosBytes.length);
               }
           }
           const b64 = uint8ArrayToBase64(finalBytes);
           const intentUrl = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
           window.location.href = intentUrl;
         } else if (printMethod === 'rawbt' && imageBlob) {
           const reader = new FileReader();
           reader.readAsDataURL(imageBlob);
           reader.onloadend = function() {
               const base64data = reader.result as string;
               const b64 = base64data.split(',')[1];
               const intentUrl = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;i.copies=${copies};end;`;
               window.location.href = intentUrl;
           }
         } else {
           printToEscApp(updatedSale, copies);
         }
       } catch (err) {
         console.warn("Print execution warning, but transaction is saved safely:", err);
       }
     }
     
     setPreviewSale(null);
  };

  const generateShareText = (saleObj: any) => {
    let text = `✨ *${orgSettings.name.toUpperCase()}* ✨\n`;
    text += `${orgSettings.address}\n`;
    text += `📞 ${orgSettings.phone}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📅 ${formatSinhalaDate(saleObj.createdAt)}  ⏰ ${new Date(saleObj.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}\n`;
    text += `📑 ඉන්වොයිස්: ${saleObj.id}\n`;
    text += `👤 පාරිභෝගික: ${saleObj.customer}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (saleObj.mode === 'sale') {
      text += `*භාණ්ඩය* | *ප්‍රමාණය* | *මිල*\n`;
      (saleObj.items || []).forEach((c: any) => {
        text += `${c.isReturn ? '🔄 ' : '🔹 '}${c.name}\n`;
        text += `   ${Number(c.qty)} X ${Number(c.price).toFixed(2)} = Rs ${ (Number(c.qty) * Number(c.price)).toFixed(2) }\n`;
      });
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
      const hasReturns = (saleObj.items || []).some((c: any) => c.isReturn);
      if (hasReturns || saleObj.invoiceDiscount > 0) {
        let subtotal = 0;
        let returnsAmount = 0;
        (saleObj.items || []).forEach((c: any) => {
           if (c.isReturn) returnsAmount += Number(c.qty) * Number(c.price);
           else if (!c.isSample) subtotal += Number(c.qty) * Number(c.price);
        });
        text += `සමස්ත එකතුව (Subtotal): Rs ${subtotal.toFixed(2)}\n`;
        if (hasReturns) {
          text += `ආපසු ලබා දීම් (Returns): - Rs ${returnsAmount.toFixed(2)}\n`;
        }
        if (saleObj.invoiceDiscount > 0) {
          text += `වට්ටම් (${saleObj.invoiceDiscount}%): - Rs ${Number(saleObj.discountAmount).toFixed(2)}\n`;
        }
      }
      text += `ශුද්ධ එකතුව (Total): Rs ${Number(saleObj.total).toFixed(2)}\n`;
      if (saleObj.paymentType === 'Cash + Cheque') {
        text += `ගෙවීම් ක්‍රමය: මුදල් + චෙක්පත් (Cash + Cheque)\n`;
        text += `  - මුදලින්: Rs ${Number(saleObj.cashAmount || 0).toFixed(2)}\n`;
        text += `  - චෙක්පතින්: Rs ${Number(saleObj.chequeAmount || 0).toFixed(2)}${saleObj.chequeNo ? ` (${saleObj.chequeNo})` : ''}\n`;
      } else {
        text += `ගෙවීම් ක්‍රමය: ${saleObj.paymentType}\n`;
      }
      
      if (saleObj.paymentType === 'Half-payment') {
        text += `අද ගෙවූ මුදල (Paid): Rs ${parseFloat(saleObj.partialAmount || '0').toFixed(2)}\n`;
        text += `අද ණය (Debt): Rs ${(Number(saleObj.total) - parseFloat(saleObj.partialAmount || '0')).toFixed(2)}\n`;
      } else if (saleObj.paymentType === 'Credit') {
        text += `ණය (Debt): Rs ${Number(saleObj.total).toFixed(2)}\n`;
      }
    } else {
      text += `💎 *ණය පියවීම*\n`;
      text += `✅ ගෙවූ මුදල: Rs ${Number(saleObj.creditReceivedAmount).toFixed(2)}\n`;
    }

    if (saleObj.previousBalance !== undefined) {
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
      text += `කලින් තිබූ ණය (Previous Debt): Rs ${(Number(saleObj.previousBalance) + Number(saleObj.initialCredit || 0)).toFixed(2)}\n`;
      if (saleObj.mode === 'sale') {
         text += `අද ණය (Today's Debt): Rs ${Number(saleObj.total).toFixed(2)}\n`;
         text += `මුළු ණය (Total Debt): Rs ${(Number(saleObj.previousBalance) + Number(saleObj.initialCredit || 0) + Number(saleObj.total)).toFixed(2)}\n`;
         text += `අද ගෙවූ මුදල (Paid Today): Rs ${Math.max(0, (Number(saleObj.previousBalance) + Number(saleObj.initialCredit || 0) + Number(saleObj.total)) - Number(saleObj.newBalance)).toFixed(2)}\n`;
      }
      text += `අවසන් ශේෂය (Final Balance): Rs ${Number(saleObj.newBalance).toFixed(2)}\n`;
    }

    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🙏 ස්තුතියි! / THANK YOU!\n`;
    text += `_MYM BizFlow Cloud_`;
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
        // Fallback: download invoice photo
        const url = URL.createObjectURL(imageBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Invoice-${saleObj.id || 'bill'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
     }

     await performFinalizeTransaction(saleObj);
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

     await performFinalizeTransaction(saleObj);
     setPreviewSale(null);
  };

  const processApprovedRequest = (req: AIActionRequest) => {
    if (req.status !== 'Approved' || !req.payload) return;
    if (['rep_load', 'stock_load'].includes(req.actionType)) return; // Do not process stock loads here
    
    const saleData = req.payload;

    // 1. Deduct stock from inventory
    const itemsToDeduct = saleData.items || [];
    if (itemsToDeduct.length > 0) {
      const newInventory = inventory.map(item => {
        const matches = itemsToDeduct.filter((i: any) => i.id === item.id);
        if (matches.length > 0) {
          const totalSold = matches.reduce((sum: number, m: any) => sum + (Number(m.qty) || 0) + (Number(m.freeQty) || 0), 0);
          return {
            ...item,
            myStock: Math.max(0, (item.myStock || 0) - totalSold),
            availableStock: Math.max(0, (item.availableStock || 0) - totalSold)
          };
        }
        return item;
      });

      setInventory(newInventory);
      // Removed broken addToSyncQueue for inventory (handled inside setInventory -> saveRepInventory)
    }

    // 2. Update Customer Balance
    const total = saleData.total || 0;
    const partialAmount = saleData.partialAmount || 0;
    const paymentType = saleData.paymentType;
    const customerName = saleData.customer;
    const totalDue = paymentType === 'Half-payment' ? total - partialAmount : (paymentType === 'Credit' ? total : 0);

    let previousBalance = 0;
    let newBalance = 0;

    if (customerName) {
      const targetCust = customers.find(c => (c.name || '').toLowerCase().trim() === (customerName || '').toLowerCase().trim());
      if (targetCust) {
        previousBalance = targetCust.balance || 0;
        newBalance = previousBalance + totalDue;
        const updatedCust = { ...targetCust, balance: newBalance };
        const newCusts = customers.map(c => c.id === targetCust.id ? updatedCust : c);
        setCustomers(newCusts);
        localStorage.setItem('bizflow_customers_v1', JSON.stringify(newCusts));
        addToSyncQueue({ table: 'customers', action: 'update', data: updatedCust });
      }
    }

    // 3. Save Sale Record
    const saleObj = {
      ...saleData,
      previousBalance,
      newBalance,
      organizationId: getActiveOrgId(),
      id: req.id,
      createdAt: req.timestamp || new Date().toISOString()
    };
    addToSyncQueue({
      table: 'sales',
      action: 'insert',
      data: saleObj
    });
    setSalesHistory((prev: any) => [saleObj, ...prev]);

    // 4. Remove from local list and update cloud
    const allReqs = getAIActionRequests();
    const updatedAll = allReqs.filter(r => r.id !== req.id);
    saveAIActionRequests(updatedAll);
    setActionRequests(updatedAll.filter(r => r.repId === currentRep?.id));
  };

  const shareBill = async () => {};

  const renderCartContent = () => (
    <div className="p-2 space-y-2 pb-24 sm:pb-2">
      {cart.map((c, cartIdx) => (
        <div key={`${c.cartId || c.id}_${cartIdx}`} className={`flex flex-col gap-3 p-4 rounded-xl border ${c.isReturn ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-white'}`}>
          <div className="flex justify-between items-start">
            <span className={`font-semibold ${c.isReturn ? 'text-rose-700' : 'text-slate-700'}`}>
              {c.name} {c.supplier && <span className="text-[10px] text-slate-500 font-normal ml-1">[{c.supplier}]</span>} {c.isReturn && <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded ml-2">Return</span>}
            </span>
            <button onClick={async () => {
               if (await appConfirm("Remove this item? / මෙම භාණ්ඩය මකා දමන්නද?")) {
                 setCart(cart.filter(x => x.cartId !== c.cartId));
               }
            }} className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors">
               <Trash2 size={16} />
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex-1 sm:flex-initial flex flex-col">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold mb-1 flex justify-between">
                  <span>Qty</span>
                  {!c.isReturn && (
                    <span className={`${(inventory.find(i => i.id === c.id)?.myStock || 0) < (parseFloat(c.qty) || 0) ? 'text-rose-500 animate-pulse font-black' : 'text-emerald-500'}`}>
                      (Stock: {inventory.find(i => i.id === c.id)?.myStock || 0})
                    </span>
                  )}
                </label>
                <input type="number" value={c.qty === 0 ? '' : c.qty} step="any" min="0" onChange={(e) => updateCartQty(c.cartId, e.target.value)} className={`w-full sm:w-20 p-2 border rounded-lg text-center focus:outline-none font-medium text-slate-800 ${(inventory.find(i => i.id === c.id)?.myStock || 0) < (parseFloat(c.qty) || 0) && !c.isReturn ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200 focus:border-blue-400'}`} />
              </div>
              <span className="text-slate-400 font-medium pt-5">×</span>
              <div className="flex-1 sm:flex-initial flex flex-col">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1 flex justify-between">
                  <span>Price</span>
                  {(currentRep?.role !== 'admin' && !c.isReturn && (c.needsApproval || c.price < c.minPrice)) && (
                    <span className={`text-[9px] px-1 rounded ${actionRequests.some(r => String(r.metadata?.itemId) === String(c.id) && Number(r.metadata?.requestedPrice) === Number(c.price) && r.status === 'Approved') ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 animation-pulse'}`}>
                      {actionRequests.some(r => String(r.metadata?.itemId) === String(c.id) && Number(r.metadata?.requestedPrice) === Number(c.price) && r.status === 'Approved') ? 'APPROVED' : 'PENDING'}
                    </span>
                  )}
                </label>
                <input type="number" value={c.price === 0 ? '' : c.price} onBlur={(e) => updateCartPrice(c.cartId, e.target.value)} onChange={(e) => setCart(cart.map(x => x.cartId === c.cartId ? {...x, price: parseFloat(e.target.value) || 0} : x))} className={`w-full sm:w-24 p-2 border rounded-lg text-center focus:outline-none focus:border-blue-400 font-medium ${currentRep?.role !== 'admin' && c.price < c.minPrice && !c.isReturn ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-800'}`} title={`Min: ${c.minPrice}, Max: ${c.maxPrice}`} />
                {(currentRep?.role !== 'admin' && c.needsApproval) && (
                  <button 
                    onClick={() => requestApproval(c)}
                    className="mt-2 text-[10px] bg-amber-500 text-white px-2 py-1 rounded font-bold hover:bg-amber-600 transition-colors"
                  >
                    Request Approval
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex flex-col items-end justify-end pt-2 sm:pt-5 border-t sm:border-t-0 mt-2 sm:mt-0 border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1 sm:hidden">Total</span>
              <span className={`text-base font-bold ${c.isReturn ? 'text-rose-600' : 'text-slate-800'}`}>
                {c.isReturn ? '-' : ''}{c.isSample ? '0.00' : Number(c.price * c.qty || 0).toFixed(2)}
                {c.isSample && <span className="text-[10px] text-purple-600 ml-1">(Sample)</span>}
              </span>
            </div>
          </div>

          {!c.isReturn && (
            <div className="flex items-center gap-2 px-2 py-1 bg-purple-50 rounded-lg border border-purple-100 my-1">
              <input 
                type="checkbox" 
                id={`sample-${c.cartId}`}
                checked={!!c.isSample}
                onChange={(e) => setCart(cart.map(x => x.cartId === c.cartId ? {...x, isSample: e.target.checked} : x))}
                className="w-4 h-4 text-purple-600 border-purple-300 rounded focus:ring-purple-500"
              />
              <label htmlFor={`sample-${c.cartId}`} className="text-xs font-bold text-purple-700 cursor-pointer flex-1">
                {lang === 'si' ? 'සාම්පල් එකක් ලෙස ලබාදෙන්න (නොමිලේ)' : 'Give as Sample (Free)'}
              </label>
            </div>
          )}

                  {!c.isReturn && (
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
                  )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Shared Datalist for Customer Search */}
      <datalist id="customer-list">
        {customers.map((c, i) => (
          <option key={`cust-opt-${c.id || i}-${i}`} value={c.name}>
            {c.location ? `${c.name} (${c.location})` : c.name} - Bal: Rs {c.balance}
          </option>
        ))}
      </datalist>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-4xl font-bold text-slate-800 tracking-tight">{t('billing')}</h3>
          <p className="text-slate-500 mt-1">
            {lang === 'si'
              ? 'භාණ්ඩ තෝරා බිලක් සාදන්න, හෝ බඩු තෝරා නොගෙන මුදල් ලැබීමක් ඇතුළත් කරන්න (බඩු නොගෙන ණය ගෙවීම)'
              : 'Select items for a new bill, or enter a payment amount without items for debt settlement'}
          </p>
        </div>
      </div>



      {/* Quick Last Bill Action Panel */}
      {salesHistory.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300 mt-2">
          <div className="flex items-start gap-4">
            <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600 mt-1 md:mt-0">
              <Printer size={22} />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {lang === 'si' ? 'අවසාන බිල්පත (Most Recent Bill)' : 'Most Recent Invoice / Bill'}
              </div>
              <div className="text-slate-800 font-bold text-sm sm:text-base mt-1">
                {salesHistory[0].id} • <span className="text-blue-600">{salesHistory[0].customer}</span> • Rs {(salesHistory[0].total || salesHistory[0].creditReceivedAmount || 0).toLocaleString()} 
                {salesHistory[0].status === 'cancelled' && <span className="text-rose-500 ml-2 font-black">({lang === 'si' ? 'අවලංගු කරන ලදි / Cancelled' : 'Cancelled'})</span>}
              </div>
              <div className="text-[11.5px] text-slate-600 mt-1.5 flex items-start sm:items-center gap-1.5 leading-relaxed">
                <span>⚠️</span>
                <span>
                  {lang === 'si'
                    ? 'නැවත ප්‍රින්ට් කිරීමෙන් ස්ටොක් ප්‍රමාණයට හෝ විකුණුම් වාර්තාවලට කිසිදු බලපෑමක් සිදු නොවේ (Reprinting is 100% safe).'
                    : 'Reprinting this bill does not affect stock levels or record duplicate sales.'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto self-stretch md:self-auto justify-end">
            {salesHistory[0].status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => handlePrintSale(salesHistory[0])}
                className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm cursor-pointer whitespace-nowrap"
              >
                <Printer size={15} />
                {lang === 'si' ? 'නැවත ප්‍රින්ට් කරන්න' : 'Reprint Last'}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleCancelSale(salesHistory[0])}
              className="flex-1 md:flex-none bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Trash2 size={15} />
              {lang === 'si' ? 'බිල මකා දමන්න (Delete)' : 'Delete Bill'}
            </button>
          </div>
        </div>
      )}
      
      {/* Mobile Sub-tab Segmented Control */}
      {mode === 'sale' && (
        <div className="flex lg:hidden bg-slate-100 p-1 rounded-2xl mb-4 border border-slate-200">
          <button
            type="button"
            onClick={() => setMobileSubTab('stock')}
            className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${
              mobileSubTab === 'stock'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500'
            }`}
          >
            {lang === 'si' ? 'භාණ්ඩ ලැයිස්තුව (Stock)' : 'Available Stock'}
          </button>
          <button
            type="button"
            onClick={() => setMobileSubTab('bill')}
            className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all relative flex items-center justify-center gap-1.5 ${
              mobileSubTab === 'bill'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500'
            }`}
          >
            <span>{lang === 'si' ? 'වත්මන් බිල (Bill)' : 'Current Bill'}</span>
            {cart.length > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Section: Conditional (Inventory OR Credit Receipt Form) */}
        {mode === 'sale' ? (
          <div className={`lg:col-span-5 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] lg:h-[1050px] h-auto flex flex-col ${mobileSubTab === 'stock' ? 'block' : 'hidden lg:flex'}`}>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-display text-xl font-bold text-slate-700">Available Stock</h4>
              <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2.5 py-1 rounded-full border border-slate-200">
                {inventory.filter(item => (item.name || '').toLowerCase().includes((searchQuery || '').toLowerCase())).length} items
              </span>
            </div>
            <div className="relative mb-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search items..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 ring-blue-500/20 transition-all font-medium text-slate-700 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const namePrompt = prompt(lang === 'si' ? "බඩුවේ නම ඇතුළත් කරන්න (Item Name):" : "Enter Item Name:", searchQuery || "");
                  if (!namePrompt || !namePrompt.trim()) return;
                  const pricePrompt = prompt(lang === 'si' ? `"${namePrompt.trim()}" සඳහා විකුණුම් මිල (Price LKR):` : `Selling price for "${namePrompt.trim()}":`, "100");
                  if (!pricePrompt) return;
                  const priceNum = parseFloat(pricePrompt) || 0;
                  const newItem = {
                    id: 'custom_rep_' + Date.now(),
                    name: namePrompt.trim(),
                    category: 'General',
                    supplier: 'Custom',
                    maxPrice: priceNum,
                    costPrice: priceNum,
                    myStock: 999,
                    stockInMain: 999,
                    availableStock: 999
                  };
                  setInventory(prev => [newItem, ...prev]);
                  addToCart(newItem);
                }}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1 shrink-0 active:scale-95"
              >
                <Plus size={14} /> {lang === 'si' ? '+ බඩුවක්' : '+ Custom'}
              </button>
            </div>
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-2 pb-2">
              {inventory.filter(item => (item.name || '').toLowerCase().includes((searchQuery || '').toLowerCase())).map((item, idx) => {
                const prevPrices = getPreviousPrices(item.id);
                return (
                  <div key={`${item.id}_${idx}`} className="flex items-center justify-between p-2 hover:bg-slate-50 border-b border-slate-100 transition-all gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-xs sm:text-sm truncate" title={item.name}>
                        {item.name} {item.supplier && <span className="text-[10px] font-normal text-slate-400">({item.supplier})</span>}
                      </div>
                      <div className="text-[10px] font-medium text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={`px-1 rounded text-[9px] font-bold ${item.myStock > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                          {lang === 'si' ? 'ස්ටොක්' : 'Stock'}: {item.myStock}
                        </span>
                        <span className="bg-slate-100 text-slate-600 px-1 rounded text-[9px] font-bold border border-slate-200">
                          {lang === 'si' ? 'ගබඩාවේ' : 'Main'}: {item.stockInMain || 0}
                        </span>
                        <span className="bg-slate-100 text-slate-600 px-1 rounded text-[9px] font-bold border border-slate-200">
                          Rs {item.maxPrice}
                        </span>
                        {prevPrices && prevPrices.length > 0 && (
                          <span className="text-[9px] font-medium text-blue-600 bg-blue-50 border border-blue-100 px-1 rounded">
                            Hist: Rs {prevPrices[0]}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input 
                        type="number" 
                        min="1" 
                        placeholder="1"
                        value={itemInputQty[item.id] || ''}
                        onChange={e => setItemInputQty(prev => ({...prev, [item.id]: e.target.value}))}
                        className="w-12 h-7 px-1 text-center text-xs font-bold border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                      />
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

              {inventory.filter(item => (item.name || '').toLowerCase().includes((searchQuery || '').toLowerCase())).length === 0 && (
                <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 my-4">
                  <p className="text-slate-500 text-xs font-semibold mb-3">
                    {searchQuery ? `"${searchQuery}" සොයාගත නොහැක.` : 'ලැයිස්තුව හිස්ය.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const namePrompt = prompt(lang === 'si' ? "බඩුවේ නම ඇතුළත් කරන්න:" : "Enter Item Name:", searchQuery || "");
                      if (!namePrompt || !namePrompt.trim()) return;
                      const pricePrompt = prompt(lang === 'si' ? `"${namePrompt.trim()}" විකුණුම් මිල:` : "Price LKR:", "100");
                      if (!pricePrompt) return;
                      const priceNum = parseFloat(pricePrompt) || 0;
                      const newItem = {
                        id: 'custom_rep_' + Date.now(),
                        name: namePrompt.trim(),
                        category: 'General',
                        supplier: 'Custom',
                        maxPrice: priceNum,
                        costPrice: priceNum,
                        myStock: 999,
                        stockInMain: 999,
                        availableStock: 999
                      };
                      setInventory(prev => [newItem, ...prev]);
                      addToCart(newItem);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} /> {searchQuery ? `"${searchQuery}" බිලට එකතු කරන්න` : '+ නව බඩුවක් බිලට එකතු කරන්න'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
           <div className="lg:col-span-5 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-fit flex flex-col">
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
                {customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim()) && (
                  <div className="px-2 text-xs font-semibold text-rose-600">
                     Arrears (ණය මුදල): Rs {(customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim())?.balance || 0).toLocaleString()}
                  </div>
                )}
                <input type="text" placeholder="Address (ලිපිනය)" value={address || ''} onChange={e => setAddress(e.target.value)} className="w-full bg-slate-50/50 p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800" />
                <input type="number" placeholder="Amount Received (Rs)" value={creditReceivedAmount || ''} onChange={e => setCreditReceivedAmount(e.target.value)} className="w-full bg-slate-50/50 p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 font-bold" />
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 block">Payment Mode (ගෙවීම් ආකාරය):</label>
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
                        className={`py-3 px-1.5 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all ${paymentType === type 
                          ? (type === 'Cash' ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                            : type === 'Cheque' ? 'bg-purple-500 border-purple-500 text-white shadow-lg shadow-purple-500/30'
                            : 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/30') 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                      >
                        {type === 'Cash' ? (lang === 'si' ? 'මුදල්' : 'Cash') 
                          : type === 'Cheque' ? (lang === 'si' ? 'චෙක්' : 'Cheque') 
                          : (lang === 'si' ? 'මුදල්+චෙක්' : 'Cash+Chq')}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentType === 'Cash + Cheque' && (
                  <div className="p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                      <span>💵 + 💳 මුදල් සහ චෙක්පත් (Mixed Payment):</span>
                      <span className="text-[11px] font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                        Rs. {((parseFloat(splitCashAmount) || 0) + (parseFloat(splitChequeAmount) || 0)).toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[11px] font-bold text-slate-600 block mb-1">මුදලින් (Cash) Rs:</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={splitCashAmount}
                          onChange={e => {
                            const val = e.target.value;
                            setSplitCashAmount(val);
                            const cVal = parseFloat(val) || 0;
                            const chkVal = parseFloat(splitChequeAmount) || 0;
                            setCreditReceivedAmount((cVal + chkVal).toString());
                          }}
                          className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500/20 font-bold text-slate-800 text-sm"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-600 block mb-1">චෙක්පතින් (Cheque) Rs:</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={splitChequeAmount}
                          onChange={e => {
                            const val = e.target.value;
                            setSplitChequeAmount(val);
                            const cVal = parseFloat(splitCashAmount) || 0;
                            const chkVal = parseFloat(val) || 0;
                            setCreditReceivedAmount((cVal + chkVal).toString());
                          }}
                          className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500/20 font-bold text-slate-800 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-slate-600 block mb-1">චෙක්පත් විස්තර (Cheque No/Bank):</span>
                      <input
                        type="text"
                        placeholder="උදා: Chq# 48201 / Commercial Bank"
                        value={chequeNo}
                        onChange={e => setChequeNo(e.target.value)}
                        className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500/20 text-xs text-slate-800"
                      />
                    </div>
                  </div>
                )}
                
                {/* Initial Credit / Previous Debt Field (Always available for Admin, or within 2 months for reps) */}
                {customer && (() => {
                  const selectedCust = customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim());
                  const hasInitialCredit = selectedCust ? selectedCust.initialCreditAdded : false;
                  
                  const twoMonthsMs = 60 * 24 * 60 * 60 * 1000;
                  const orgCreated = orgSettings.createdAt || 0;
                  const isWithinTwoMonths = (Date.now() - orgCreated) < twoMonthsMs;
                  const isAdmin = currentRep?.role === 'admin' || currentRep?.role === 'super_admin';
                  
                  if ((isWithinTwoMonths && !hasInitialCredit) || isAdmin) {
                    return (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-[1.5rem] space-y-3 mt-2">
                        <label className="text-sm font-black text-amber-800 flex items-center gap-2">
                          <AlertTriangle size={16} className="text-amber-500" />
                          {lang === 'si' ? 'කලින් ණය වෙනස් කරන්න / පැරණි ණය (Initial/Adjust Previous Debt)' : 'Edit / Add Previous Debt'}
                        </label>
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            placeholder="0.00" 
                            value={initialCredit} 
                            onChange={e => setInitialCredit(e.target.value)} 
                            className="w-full p-3 bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-amber-500 font-black text-amber-700 text-lg" 
                          />
                        </div>
                        <p className="text-[10px] text-amber-600 font-bold italic">
                          {isAdmin 
                            ? (lang === 'si' ? '* ඇඩ්මින් ලෙස ඔබට ඕනෑම වේලාවක කලින් ණය ප්‍රමාණය වෙනස් කිරීමට හැක.' : '* As Admin, you can adjust the previous credit amount at any time.')
                            : (lang === 'si' ? '* මෙය එක් වරක් ඇතුලත් කල පසු යාවත්කාලීන වේ.' : '* This updates once.')}
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
           </div>
        )}

        {/* Right Section: Bill/Receipt Details */}
        <div className={`lg:col-span-7 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col lg:h-[1050px] h-auto ${mode === 'sale' && mobileSubTab !== 'bill' ? 'hidden lg:flex' : 'block'}`}>
          <h4 className="font-display text-xl font-bold mb-6 text-slate-700 flex items-center justify-between">
            {mode === 'sale' ? 'Current Bill' : 'Generate Receipt'}
            {mode === 'sale' && <span className="bg-emerald-100 text-emerald-700 text-sm px-3 py-1 rounded-full font-bold">Total: Rs {(total || 0).toLocaleString()}</span>}
          </h4>
          
          <div className="space-y-4 mb-6 flex-shrink-0">
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
                  {customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim()) && (
                    <div className="px-2 text-xs font-semibold text-rose-600">
                       Arrears (ණය මුදල): Rs {(customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim())?.balance || 0).toLocaleString()}
                    </div>
                  )}
                  <input type="text" placeholder="Address (ලිපිනය)" value={address || ''} onChange={e => setAddress(e.target.value)} className="w-full bg-slate-50/50 p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800" />
                  
                  {otherReps.length > 0 && (
                    <div className="relative">
                      <select
                        value={coRepId}
                        onChange={e => setCoRepId(e.target.value)}
                        disabled={hasSaleToday}
                        className={`w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 ${hasSaleToday ? 'bg-slate-100/70 text-slate-500 cursor-not-allowed' : 'bg-slate-50/50'}`}
                      >
                        <option value="">No Co-Worker (තනිවම)</option>
                        {otherReps.map(r => (
                          <option key={r.id} value={r.id}>With: {r.name}</option>
                        ))}
                      </select>
                      {hasSaleToday && (
                        <p className="px-2 mt-1 text-[10px] text-amber-600 font-semibold">
                          Working partner set from today's first bill.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center px-1">
                    <p className="text-xs text-slate-400">GPS: {locationStr || 'Fetching...'}</p>
                    {nearbyShops.length > 0 && (
                      <div className="flex flex-wrap gap-2 items-center bg-amber-50/50 p-2 rounded-xl border border-amber-100/50 mt-1">
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">{lang === 'si' ? 'අසල කඩවල්:' : 'Nearby:'}</span>
                        {nearbyShops.map((shop, sIdx) => (
                          <button 
                            key={`nearby-${shop}-${sIdx}`}
                            onClick={() => {
                      setCustomer(shop);
                      const cust = customers.find(c => (c.name || '').toLowerCase().trim() === (shop || '').toLowerCase().trim());
                      if (cust && cust.location) setAddress(cust.location);
                            }} 
                            className="bg-white text-amber-800 text-[10px] px-2 py-1 rounded-lg border border-amber-200 shadow-sm hover:bg-amber-100 transition-colors flex items-center gap-1 font-medium"
                          >
                            {shop}
                          </button>
                        ))}
                      </div>
                    )}
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
                        className={`py-3 px-1.5 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all ${paymentType === type 
                          ? (type === 'Cash' ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                            : type === 'Cheque' ? 'bg-purple-500 border-purple-500 text-white shadow-lg shadow-purple-500/30'
                            : 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/30') 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                      >
                        {type === 'Cash' ? (lang === 'si' ? 'මුදල්' : 'Cash') 
                          : type === 'Cheque' ? (lang === 'si' ? 'චෙක්' : 'Cheque') 
                          : (lang === 'si' ? 'මුදල්+චෙක්' : 'Cash+Chq')}
                      </button>
                    ))}
                  </div>

                  {paymentType === 'Cash + Cheque' && (
                    <div className="p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                        <span>💵 + 💳 මුදල් සහ චෙක්පත් (Mixed Payment):</span>
                        <span className="text-[11px] font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                          Rs. {((parseFloat(splitCashAmount) || 0) + (parseFloat(splitChequeAmount) || 0)).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[11px] font-bold text-slate-600 block mb-1">මුදලින් (Cash) Rs:</span>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={splitCashAmount}
                            onChange={e => {
                              const val = e.target.value;
                              setSplitCashAmount(val);
                              const cVal = parseFloat(val) || 0;
                              const chkVal = parseFloat(splitChequeAmount) || 0;
                              setTodayPaidAmount((cVal + chkVal).toString());
                            }}
                            className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500/20 font-bold text-slate-800 text-sm"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-slate-600 block mb-1">චෙක්පතින් (Cheque) Rs:</span>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={splitChequeAmount}
                            onChange={e => {
                              const val = e.target.value;
                              setSplitChequeAmount(val);
                              const cVal = parseFloat(splitCashAmount) || 0;
                              const chkVal = parseFloat(val) || 0;
                              setTodayPaidAmount((cVal + chkVal).toString());
                            }}
                            className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500/20 font-bold text-slate-800 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] font-semibold text-slate-600 block mb-1">චෙක්පත් විස්තර (Cheque No/Bank):</span>
                        <input
                          type="text"
                          placeholder="උදා: Chq# 48201 / Commercial Bank"
                          value={chequeNo}
                          onChange={e => setChequeNo(e.target.value)}
                          className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 ring-indigo-500/20 text-xs text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2">
                     <div className="flex gap-4 items-center">
                       <label className="text-sm font-semibold text-emerald-800">Today's Paid (අද ගෙවූ මුදල):</label>
                       <input type="number" placeholder="Enter amount" value={todayPaidAmount || ''} onChange={e => setTodayPaidAmount(e.target.value)} className="flex-1 p-2 border border-emerald-200 rounded text-right focus:outline-none focus:border-emerald-500 font-bold bg-white" />
                     </div>
                     {cart.length === 0 && todayPaidAmount && parseFloat(todayPaidAmount) > 0 && (
                       <div className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 p-2.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                         <span>💡</span>
                         <span>
                           {lang === 'si'
                             ? 'බඩු තෝරා නොමැති බැවින් මෙම ගෙවීම "බඩු නොගෙන ණය ගෙවීමක්" (Debt Settlement) ලෙස සටහන් වේ.'
                             : 'No items selected. This payment will be recorded as "Debt Payment without items".'}
                         </span>
                       </div>
                     )}
                  </div>

                  <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl flex gap-4 items-center">
                    <label className="text-sm font-semibold text-purple-800">Discount (%):</label>
                    <input type="number" placeholder="0" value={invoiceDiscount || ''} onChange={e => setInvoiceDiscount(parseFloat(e.target.value) || 0)} className="flex-1 p-2 border border-purple-200 rounded text-right focus:outline-none focus:border-purple-500 font-bold" />
                    <span className="text-sm font-bold text-purple-800">%</span>
                  </div>

                  {/* Initial Credit / Previous Debt Field (Always available for Admin, or within 2 months for reps) */}
                  {customer && (() => {
                    const selectedCust = customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim());
                    const hasInitialCredit = selectedCust ? selectedCust.initialCreditAdded : false;
                    
                    const twoMonthsMs = 60 * 24 * 60 * 60 * 1000;
                    const orgCreated = orgSettings.createdAt || 0;
                    const isWithinTwoMonths = (Date.now() - orgCreated) < twoMonthsMs;
                    const isAdmin = currentRep?.role === 'admin' || currentRep?.role === 'super_admin';
                    
                    if ((isWithinTwoMonths && !hasInitialCredit) || isAdmin) {
                      return (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 mt-2">
                          <label className="text-sm font-black text-amber-800 flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-500" />
                            {lang === 'si' ? 'කලින් ණය වෙනස් කරන්න / පැරණි ණය (Initial/Adjust Previous Debt)' : 'Edit / Add Previous Debt'}
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
                            {isAdmin 
                              ? (lang === 'si' ? '* ඇඩ්මින් ලෙස මෙහි පැරණි ණය වෙනස් කළ විට, කලින් පැවති ණය අහෝසි වී අලුතින් ඇතුළත් කළ ණය මුදල පමණක් බිලට එකතු වේ.' : '* As Admin, entering an amount here overrides old arrears so both amounts are not duplicated.')
                              : (lang === 'si' ? '* මෙය එක් වරක් ඇතුලත් කල පසු යාවත්කාලීන වේ.' : '* This updates once.')}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()}
               </>
             )}
          </div>

          {mode === 'sale' && (
            <div className={`flex flex-col border border-slate-200 rounded-2xl bg-slate-50 mb-6 transition-all duration-300 ${isCartCollapsed ? '' : 'flex-1 lg:overflow-y-auto overflow-visible'}`}>
              <div className="flex items-center justify-between p-3 bg-white rounded-t-2xl border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                 <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">Cart Items</span>
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">{cart.length}</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => setIsCartModalOpen(true)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title="Pop Up View">
                       <Maximize2 size={16} />
                    </button>
                    <button onClick={() => setIsCartCollapsed(!isCartCollapsed)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title={isCartCollapsed ? "Expand Cart" : "Collapse Cart"}>
                       {isCartCollapsed ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
                    </button>
                 </div>
              </div>
              
              {!isCartCollapsed && (
                 cart.length === 0 ? (
                   <div className="flex flex-col items-center justify-center p-6 text-slate-400 text-center font-medium gap-1 min-h-[100px]">
                     <Package size={28} className="text-slate-300" />
                     <span>{lang === 'si' ? 'භාණ්ඩ තෝරා නොමැත' : 'Cart is empty'}</span>
                     <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100 mt-1">
                       {lang === 'si' ? 'අද ගෙවූ මුදල ඇතුළත් කර බඩු නොගෙන ණය ගෙවීමක් කළ හැක' : 'Enter paid amount for debt settlement without items'}
                     </span>
                   </div>
                 ) : (
                    renderCartContent()
                 )
              )}
            </div>
          )}

          {/* Bill Summary Section */}
          {(cart.length > 0) || (todayPaidAmount && parseFloat(todayPaidAmount) > 0) || (mode === 'credit' && creditReceivedAmount) ? (
            <div className="bg-slate-50 rounded-2xl p-4 mb-4 border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-slate-500">{cart.length > 0 ? (t('total_amount_si') || 'මුළු එකතුව') : (lang === 'si' ? 'අද ගෙවන මුදල (ණය ගෙවීම)' : 'Payment Amount')}</span>
                <span className="text-xl font-black text-slate-900">Rs {(cart.length > 0 ? total : parseFloat(todayPaidAmount || creditReceivedAmount || '0')).toFixed(2)}</span>
              </div>

              {customer && (() => {
                const selectedCust = customers.find(c => (c.name || '').toLowerCase().trim() === (customer || '').toLowerCase().trim());
                const rawPrev = selectedCust?.balance || 0;
                const hasInitInput = initialCredit !== '' && initialCredit !== undefined && !isNaN(parseFloat(initialCredit));
                const initVal = hasInitInput ? parseFloat(initialCredit) : 0;
                const displayPrevDebt = hasInitInput ? initVal : rawPrev;

                return (
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <span>{lang === 'si' ? 'කලින් තිබූ ණය' : 'Previous Arrears'}:</span>
                      <span className="font-bold">
                        Rs {displayPrevDebt.toFixed(2)}
                        {hasInitInput && (
                          <span className="ml-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                            ({lang === 'si' ? 'සංස්කරණය කළ ණය' : 'Edited Debt'})
                          </span>
                        )}
                      </span>
                    </div>

                    {cart.length > 0 && (paymentType === 'Credit' || paymentType === 'Half-payment') && (
                      <div className="flex justify-between items-center text-xs text-rose-600">
                        <span>{lang === 'si' ? 'අද බිලෙන් ණය' : "Today's New Debt"}:</span>
                        <span className="font-bold">Rs {(paymentType === 'Credit' ? total : total - parseFloat(todayPaidAmount || partialAmount || '0')).toFixed(2)}</span>
                      </div>
                    )}

                    {(cart.length === 0 || mode === 'credit') && (todayPaidAmount || creditReceivedAmount) && (
                      <div className="flex justify-between items-center text-xs text-emerald-600">
                        <span>{lang === 'si' ? 'අද ගෙවූ මුදල (ණය ගෙවීම)' : 'Amount Paid Today'}:</span>
                        <span className="font-bold">- Rs {parseFloat(todayPaidAmount || creditReceivedAmount || '0').toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-300 text-sm font-black text-blue-800">
                      <span>{lang === 'si' ? 'අවසාන ණය ශේෂය (සේසය)' : 'Final Balance'}:</span>
                      <span>Rs {(() => {
                        let added = 0;
                        if (cart.length > 0) {
                          if (paymentType === 'Credit') added = total;
                          else if (paymentType === 'Half-payment') added = Math.max(0, total - (parseFloat(todayPaidAmount || partialAmount || '0')));
                        }
                        const paid = parseFloat(todayPaidAmount || creditReceivedAmount || '0');
                        const netPaid = cart.length === 0 || mode === 'credit' ? paid : 0;
                        return Math.max(0, displayPrevDebt + added - netPaid).toFixed(2);
                      })()}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null}

          <div className="mt-auto space-y-3">
            {salesHistory.length > 0 && (
              <button 
                onClick={() => handleCancelSale(salesHistory[0])}
                className="w-full bg-rose-50 border-2 border-rose-200 text-rose-700 py-3 rounded-2xl text-base font-bold hover:bg-rose-100 flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw size={20} className="animate-reverse" />
                {lang === 'si' ? 'අවසාන ගනුදෙනුව හරිගස්සන්න (Void Last)' : 'Void Last Transaction'}
              </button>
            )}

            <button 
              disabled={!customer || (cart.length === 0 && !(todayPaidAmount && parseFloat(todayPaidAmount) > 0) && !(mode === 'credit' && creditReceivedAmount))} 
              onClick={handlePreviewBill} 
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-4 rounded-2xl text-xl font-bold hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.98] flex items-center justify-center cursor-pointer"
            >
              <Eye size={24} className="mr-2" /> 
              {cart.length === 0 && todayPaidAmount && parseFloat(todayPaidAmount) > 0
                ? (lang === 'si' ? 'බඩු නොගෙන ණය ගෙවීම බලන්න (Preview)' : 'Preview Debt Settlement')
                : (lang === 'si' ? 'බිල පරීක්ෂා කරන්න (Preview)' : 'Preview Invoice')
              }
            </button>
          </div>
        </div>
      </div>

      {isCartModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-50 w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10 sticky top-0 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="font-display font-bold text-slate-800 text-xl">Cart Items</span>
                <span className="bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full font-bold">{cart.length}</span>
              </div>
              <button onClick={() => setIsCartModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors bg-white border border-slate-200 shadow-sm">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto w-full">
               {cart.length === 0 ? (
                  <div className="flex flex-col h-full items-center justify-center text-slate-400 font-medium py-16">
                     <Package size={48} className="mb-4 text-slate-300" />
                     <span>Cart is empty</span>
                  </div>
               ) : (
                  <div className="p-4 sm:p-6 max-w-2xl mx-auto">
                     {renderCartContent()}
                  </div>
               )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <BillPreviewModal 
        previewSale={previewSale} 
        onClose={() => setPreviewSale(null)}
        onConfirmPrint={handleConfirmPrint}
        onConfirmShareImage={handleConfirmShareImage}
        onConfirmShareText={handleConfirmShareText}
        orgSettings={orgSettings}
      />

      {/* Floating Mobile Cart Bar */}
      {mode === 'sale' && cart.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 lg:hidden">
          <button 
            onClick={() => setIsCartModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-4 rounded-full shadow-2xl font-black text-sm active:scale-[0.98] hover:scale-105 transition-all border-2 border-white cursor-pointer"
          >
            <ShoppingCart size={18} />
            <span>{lang === 'si' ? 'කාට් එක' : 'Cart'} ({cart.length}) - Rs {total.toFixed(2)}</span>
          </button>
        </div>
      )}

              {/* Recent Bills */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-display text-xl font-bold text-slate-700 flex items-center">
               <Printer size={20} className="mr-2 text-emerald-500" /> Recent Bills (මෑතකාලීන බිල්පත්)
            </h4>
            {salesHistory.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllRecentBills(!showAllRecentBills)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                {showAllRecentBills 
                  ? (lang === 'si' ? 'අඩු කරන්න' : 'Show Less') 
                  : (lang === 'si' ? `සියල්ල බලන්න (${salesHistory.length})` : `Show All (${salesHistory.length})`)}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="py-3 px-2">Date</th>
                    <th className="py-3 px-2">Customer</th>
                    <th className="py-3 px-2 text-right">Total</th>
                    <th className="py-3 px-2 text-right">Action</th>
                 </tr>
               </thead>
               <tbody className="text-slate-700">
                 {(showAllRecentBills ? salesHistory : salesHistory.slice(0, 5)).map((sale: any, idx: number) => (
                   <tr key={`${sale.id}_${idx}`} className={`border-b border-slate-50 hover:bg-slate-50/50 ${sale.status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className="py-3 px-2 text-[10px]">
                        {new Date(sale.createdAt).toLocaleDateString()} 
                        {sale.status === 'cancelled' && (
                          <div className="text-rose-600 font-bold text-[10px] mt-0.5">
                            ❌ {lang === 'si' ? 'අවලංගුයි' : 'Cancelled'}
                            {sale.cancelReason && <span className="block text-slate-600 font-medium font-mono text-[9px]">හේතුව: {sale.cancelReason}</span>}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 font-medium text-sm">{sale.customer}</td>
                      <td className="py-3 px-2 text-right text-sm font-bold">Rs {(sale.total || sale.creditReceivedAmount || 0).toLocaleString()}</td>
                      <td className="py-3 px-2 text-right flex justify-end gap-1">
                         {sale.status !== 'cancelled' && (
                            <button onClick={() => handleEditLastSale(sale)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer" title="Edit Bill (බිල්පත සංස්කරණය කරන්න)">
                               <Edit size={16} />
                            </button>
                         )}
                         <button onClick={() => handleCancelSale(sale)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer" title="Delete Bill (බිල්පත මකා දමන්න)">
                            <Trash2 size={16} />
                         </button>
                         {sale.status !== 'cancelled' && (
                            <button onClick={() => handlePrintSale(sale)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer" title="Print">
                               <Printer size={16} />
                            </button>
                         )}
                         {sale.status !== 'cancelled' && (
                            <button onClick={() => setPreviewSale(sale)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer" title="Share Invoice (ඉන්වොයිසිය බෙදාගන්න)">
                               <Send size={16} />
                            </button>
                         )}
                      </td>
                   </tr>
                 ))}
               </tbody>
            </table>
          </div>
        </div>

<div className="mt-12 space-y-8">
        {/* Hidden thermal print area (Rep) */}
        {createPortal(
        <div 
          id="thermal-print-area" 
          className="print-only"
          style={printImageSrc ? {
            position: 'fixed',
            left: '0',
            top: '0',
            width: '100%',
            maxWidth: orgSettings?.printerSize === '80' ? '576px' : '384px',
            background: 'white',
            zIndex: 9999
          } : {
            position: 'fixed',
            left: '0',
            top: '0',
            width: orgSettings?.printerSize === '80' ? '576px' : '384px',
            background: 'white',
            zIndex: -9999 }}
        >
          {printImageSrc ? (
            <img src={printImageSrc} style={{ width: orgSettings?.printerSize === '80' ? '576px' : '384px', display: 'block', margin: '0 auto' }} referrerPolicy="no-referrer" />
          ) : (
            printData && Array.from({ length: requestedCopies || 1 }).map((_, idx) => {
              const copyNum = idx + 1;
              return (
                <div key={`print-copy-${copyNum}`} style={{ marginBottom: idx < (requestedCopies - 1) ? '30px' : '0' }}>
                  <BillPrintLayout previewSale={printData} orgSettings={orgSettings} />
                  {idx < (requestedCopies - 1) ? (
                    <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderTop: '2px dashed black', borderBottom: '2px dashed black', padding: '15px 0', margin: '20px 0', width: orgSettings?.printerSize === '80' ? '576px' : '384px' }}>- - - - - CUT - - - - -</div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        , document.body)}
      </div>
        {/* Pending Approvals */}
        {actionRequests.length > 0 && (
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl">
             <h4 className="font-display text-xl font-bold mb-4 text-slate-700 flex items-center">
                <CloudCog size={20} className="mr-2 text-blue-500" /> Approval Status (අනුමැතිය සඳහා වූ ඉල්ලීම්)
             </h4>
             <div className="space-y-3">
                {actionRequests.slice(0, 5).map((req, idx) => (
                  <div key={`${req.id}_${idx}`} className={`p-4 bg-slate-50 rounded-2xl flex justify-between items-center border border-slate-100 ${req.status === 'Approved' && req.payload?.items ? 'cursor-pointer hover:bg-slate-100 transition-colors' : ''}`} onClick={() => { 
                    if (req.status === 'Approved' && req.payload?.items) { 
                      if (['rep_load', 'stock_load'].includes(req.actionType)) {
                        setPopup({
                          show: true,
                          type: 'success',
                          title: lang === 'si' ? 'තොග පැටවීම තහවුරුයි (Stock Load Confirmed)' : 'Stock Load Confirmed',
                          message: lang === 'si' ? 'වාහනයට බඩු පැටවීම සාර්ථකව තහවුරු කර ඇත. (තොගය වාහන තොගයට එකතු කර ඇත)' : 'Stock loading has been successfully confirmed and updated on your vehicle.',
                          items: req.payload.items.map((i: any) => ({ id: String(i.id), name: i.name, qty: i.qty }))
                        });
                        const updatedReq = { ...req, status: 'Completed' as any };
                        const allReqs = getAIActionRequests();
                        saveAIActionRequests(allReqs.map(r => r.id === req.id ? updatedReq : r));
                        setActionRequests(prev => prev.map(r => r.id === req.id ? updatedReq : r));
                      } else {
                        console.log("Approved request clicked for print:", req.id);
                        setPrintDataProp({ ...req.payload, id: req.id, createdAt: new Date(req.timestamp).toISOString() }); 
                        setTriggerPrint((p: number) => p + 1);
                        processApprovedRequest(req);
                      }
                    } 
                  }}>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{req.description} {req.status === 'Approved' && req.payload?.items && <span className="text-emerald-500 font-bold ml-2 text-xs">(Click to Print)</span>}</p>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{new Date(req.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                        req.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                        req.status === 'Rejected' ? 'bg-rose-100 text-rose-700' :
                        'bg-amber-100 text-amber-700 animate-pulse'
                      }`}>
                        {req.status}
                      </span>
                      {req.status === 'Approved' && req.payload?.items && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            // Reuse share logic with this approved payload
                            const sale = { ...req.payload, id: req.id, createdAt: req.timestamp };
                            let shareText = `📄 *MYM BIZFLOW - INVOICE*\n`;
                            shareText += `66, Alhena Bokalagama Mirigama\n`;
                            shareText += `Hotline: 0787314139\n`;
                            if (currentRep?.name?.toLowerCase().includes('ruwan')) {
                              shareText += `Sales: 076 1265005\n`;
                            }
                            shareText += `--------------------------------\n`;
                            shareText += `*Date:* ${new Date(sale.createdAt).toLocaleDateString()}\n`;
                            shareText += `*Bill No:* ${sale.id}\n`;
                            shareText += `*Customer:* ${sale.customer}\n`;
                            shareText += `--------------------------------\n`;
                            (sale.items || []).forEach((c: any) => {
                              shareText += `• ${c.isReturn ? '[R] ' : ''}${c.name}\n`;
                              shareText += `  ${c.qty} x Rs ${Number(c.price).toFixed(2)} = *Rs ${(Number(c.qty) * Number(c.price)).toFixed(2)}*\n`;
                              if (c.freeQty > 0) {
                                shareText += `  🎁 FREE: ${c.freeQty}\n`;
                              }
                            });
                            shareText += `--------------------------------\n`;
                            shareText += `*Total: Rs ${sale.total?.toLocaleString()}*\n`;
                            if (sale.paymentType === 'Half-payment') {
                                shareText += `*Paid:* Rs ${Number(sale.partialAmount || 0).toFixed(2)}\n`;
                                shareText += `*Balance:* Rs ${Number((sale.total || 0) - (sale.partialAmount || 0)).toFixed(2)}\n`;
                            }
                            shareText += `*Pay Mode:* ${sale.paymentType === 'Cash' ? 'Cash' : sale.paymentType === 'Cheque' ? 'Cheque' : sale.paymentType === 'Credit' ? 'Credit' : 'Half-payment'}\n`;
                            shareText += `--------------------------------\n`;
                            shareText += `🙏 *Thank You! / ස්තුතියි!*\n`;

                            if (navigator.share) {
                              navigator.share({ title: 'Invoice', text: shareText }).then(() => {
                                processApprovedRequest(req);
                              }).catch(() => {});
                            } else {
                              navigator.clipboard.writeText(shareText);
                              alert("කෝපි කරන ලදී! (Copied to Clipboard)");
                              processApprovedRequest(req);
                            }
                          }}
                          className="p-2 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                          title="Share / Copy"
                        >
                          <Share2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}
    </div>
  );
}

function RepInventoryTab({ t, inventory, lang }: { t: (key: string) => string, inventory: any[], lang: string }) {
  const totalMyStockValue = inventory.reduce((acc, item) => acc + ((item.myStock || 0) * (item.costPrice || item.maxPrice || 0)), 0);
  const totalReturnStockValue = inventory.reduce((acc, item) => acc + ((item.returnStock || 0) * (item.costPrice || item.maxPrice || 0)), 0);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-4xl font-bold text-slate-800 tracking-tight">{lang === 'si' ? 'මගේ තොගය' : 'My Stock'}</h3>
        <p className="text-slate-500 mt-1">View your current stock and returns</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-500 mb-1">{lang === 'si' ? 'වාහනයේ තොගයේ වටිනාකම' : 'Vehicle Stock Value'}</div>
            <div className="text-2xl font-black text-blue-700">Rs {totalMyStockValue.toLocaleString()}</div>
          </div>
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
            <Package size={24} />
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-rose-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-500 mb-1">{lang === 'si' ? 'රිවර්ස් බඩු වටිනාකම' : 'Return Stock Value'}</div>
            <div className="text-2xl font-black text-rose-700">Rs {totalReturnStockValue.toLocaleString()}</div>
          </div>
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
            <RotateCcw size={24} />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider border-b border-slate-100">
                <th className="p-4 font-semibold rounded-tl-xl text-left">Item Name</th>
                <th className="p-4 font-semibold text-center">Fresh Stock</th>
                <th className="p-4 font-semibold text-center">Warehouse Stock</th>
                <th className="p-4 font-semibold text-center text-rose-600 rounded-tr-xl">Return Stock</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item, idx) => (
                <tr key={item.id || idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-medium text-slate-800">{item.name} {item.supplier && <div className="text-xs text-slate-500 font-normal">{item.supplier}</div>}</td>
                  <td className="p-4 text-center">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{item.myStock}</span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">{item.stockInMain || 0}</span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">{item.returnStock}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SettlementTab({ t, currentRep, inventory, setInventory, salesData, lang }: { t: (key: string) => string, currentRep: SystemUser | null, inventory: any[], setInventory: any, salesData: any[], lang: 'en' | 'si' }) {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr());
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [ruwanExpense, setRuwanExpense] = useState('');
  const [sankaExpense, setSankaExpense] = useState('');
  
  const [advanceToUser, setAdvanceToUser] = useState('');
  const [advanceToUserId, setAdvanceToUserId] = useState('');

  const allUsers = getUsers();
  const selectableUsers = allUsers.filter(u => u.role !== 'admin');

  const todaySales = (salesData || [])
    .filter(s => {
      if (s.status === 'cancelled') return false;
      if (s.issuedByAdmin || s.repId === 'admin') return false;
      const isRepMatch = !currentRep || currentRep.role === 'admin' || !s.repId ||
        s.repId === currentRep.id || s.coRepId === currentRep.id ||
        (currentRep.name && (s.repName === currentRep.name || s.rep === currentRep.name));
      if (!isRepMatch) return false;
      
      const saleDate = getSaleDateStr(s);
      return saleDate === selectedDate;
    })
    .sort((a, b) => {
      const da = parseSaleDate(a.createdAt || a.date)?.getTime() || 0;
      const db = parseSaleDate(b.createdAt || b.date)?.getTime() || 0;
      return db - da;
    });

  const getCleanCustomerName = (name: string) => {
    return (name || '')
      .toLowerCase()
      .replace(/\bs\/l\b/g, '')
      .replace(/\bs\.l\b/g, '')
      .replace(/[\s\.\-\/\,]/g, '');
  };

  const getSalePaidAmount = (sale: any) => {
    if (sale.paymentType === 'Cash + Cheque' || (sale.cashAmount !== undefined && sale.chequeAmount !== undefined && (sale.cashAmount > 0 || sale.chequeAmount > 0))) {
      return Number(sale.cashAmount || 0) + Number(sale.chequeAmount || 0);
    }
    if (sale.mode === 'credit') {
      return Number(sale.creditReceivedAmount || sale.partialAmount || sale.total || 0);
    }
    const T = Number(sale.total || 0);
    if (sale.paymentType === 'Credit') {
      return Number(sale.partialAmount || 0);
    }
    if (sale.partialAmount !== undefined && sale.partialAmount !== null && sale.partialAmount !== '') {
      return Number(sale.partialAmount);
    }
    return T;
  };

  let totalInvoiced = 0;
  let totalCash = 0;
  let totalCheque = 0;
  let totalNewDebt = 0;

  todaySales.forEach(sale => {
    const isCheque = sale.paymentType === 'Cheque' || sale.payMethod === 'Cheque';
    const T = Number(sale.total || 0);
    if (sale.mode === 'sale' || !sale.mode) {
      totalInvoiced += T;
    }

    const paidAmount = getSalePaidAmount(sale);

    if (sale.paymentType === 'Cash + Cheque' || (sale.cashAmount !== undefined && sale.chequeAmount !== undefined && (sale.cashAmount > 0 || sale.chequeAmount > 0))) {
      totalCash += Number(sale.cashAmount || 0);
      totalCheque += Number(sale.chequeAmount || 0);
    } else if (isCheque) {
      totalCheque += paidAmount;
    } else {
      totalCash += paidAmount;
    }

    if (sale.mode === 'sale' || !sale.mode) {
      const unpaid = Math.max(0, T - paidAmount);
      totalNewDebt += unpaid;
    }
  });

  // Calculate Gross Profit, Expenses & Net Profit for selected date
  const adminInventory = getAdminInventory();
  const adminCostMap = new Map<string, number>();
  (inventory || []).forEach((item: any) => {
    if (item && item.id) adminCostMap.set(String(item.id), Number(item.costPrice) || Number(item.maxPrice) || 0);
  });
  (adminInventory || []).forEach((item: any) => {
    if (item && item.id && !adminCostMap.has(String(item.id))) {
      adminCostMap.set(String(item.id), Number(item.costPrice) || Number(item.maxPrice) || 0);
    }
  });

  let todayGrossProfit = 0;
  todaySales.forEach(sale => {
    if (sale.mode === 'sale' || !sale.mode) {
      (sale.items || []).forEach((item: any) => {
        if (!item.isReturn) {
          const sellPrice = Number(item.price) || 0;
          const costPrice = (item.costPrice !== undefined && item.costPrice !== null && Number(item.costPrice) > 0)
            ? Number(item.costPrice)
            : (adminCostMap.get(String(item.id)) || 0);
          const qty = Number(item.qty) || 0;
          todayGrossProfit += (sellPrice - costPrice) * qty;
        }
      });
    }
  });

  const orgId = getActiveOrgId();
  const storedExpStr = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1') || '[]';
  let allExpList: any[] = [];
  try { allExpList = JSON.parse(storedExpStr); } catch (e) {}

  const dateExpenses = allExpList.filter(e => {
    const isRepMatch = !currentRep || currentRep.role === 'admin' || e.repId === currentRep.id || e.rep === currentRep.name;
    if (!isRepMatch) return false;
    const rawDate = e.createdAt || e.date;
    if (!rawDate) return false;
    let expDateKey = '';
    if (typeof rawDate === 'number') {
      const d = new Date(rawDate);
      expDateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
      expDateKey = String(rawDate).split('T')[0];
    }
    return expDateKey === selectedDate;
  });

  const deductibleDateExpenses = dateExpenses.filter(e => e.deductFromSettlement !== false);
  const nonDeductibleDateExpenses = dateExpenses.filter(e => e.deductFromSettlement === false);

  const todayExpensesTotal = deductibleDateExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const todayOtherExpensesTotal = nonDeductibleDateExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const todayNetProfit = todayGrossProfit - todayExpensesTotal;

  const handleSettlementSubmit = () => {
    if (!navigator.onLine) {
      alert(lang === 'si'
        ? "සෙටල්මන්ට් (Settlement) ඇතුලත් කිරීමට අන්තර්ජාල සම්බන්ධතාවය (Online) අනිවාර්ය වේ!"
        : "Internet connection is required to submit settlement!");
      return;
    }
    let allUsers = getUsers();
    let msgs: string[] = [];
    const expAmt = parseFloat(expenseAmount) || 0;
    const myAdv = parseFloat(advanceAmount) || 0;
    const otherAdv = parseFloat(advanceToUser) || 0;
    const ruwanExpAmt = parseFloat(ruwanExpense) || 0;
    const sankaExpAmt = parseFloat(sankaExpense) || 0;

    const totalDeductions = expAmt + myAdv + otherAdv + ruwanExpAmt + sankaExpAmt;
    const netCash = totalCash - totalDeductions;
    
    if (currentRep) {
       allUsers = allUsers.map(u => {
           if (u.id === currentRep.id) {
             return { 
               ...u, 
               advances: (u.advances || 0) + myAdv,
               cashBookBalance: (u.cashBookBalance || 0) + netCash
             };
           }
           if (u.id === advanceToUserId && otherAdv > 0) {
             return { ...u, advances: (u.advances || 0) + otherAdv };
           }
           const uNameLower = (u.name || '').toLowerCase();
           if ((uNameLower.includes('ruwan') || u.name.includes('රුවන්')) && ruwanExpAmt > 0) {
             return { ...u, advances: (u.advances || 0) + ruwanExpAmt };
           }
           if ((uNameLower.includes('sanka') || u.name.includes('සංක')) && sankaExpAmt > 0) {
             return { ...u, advances: (u.advances || 0) + sankaExpAmt };
           }
           return u;
       });

       const orgId = getActiveOrgId();
       const todayDateStr = selectedDate;
       if (expAmt > 0) {
         const expObj = {
           id: 'EXP-' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(-2),
           amount: expAmt,
           description: expenseDesc || 'Other Expense',
           repId: currentRep.id,
           rep: currentRep.name,
           date: todayDateStr,
           createdAt: new Date().toISOString(),
           organizationId: orgId
         };
         addToSyncQueue({ table: 'expenses', action: 'insert', data: expObj });
       }
       if (ruwanExpAmt > 0) {
         const ruwanUser = allUsers.find(u => (u.name || '').toLowerCase().includes('ruwan') || u.name.includes('රුවන්'));
         const expObjRuwan = {
           id: 'EXP-RW-' + Date.now().toString().slice(-6),
           amount: ruwanExpAmt,
           description: 'Ruwan Tea & Expense (රුවන්ගේ තේ සහ වියදම්)',
           repId: ruwanUser?.id || 'ruwan',
           rep: ruwanUser?.name || 'Ruwan',
           date: todayDateStr,
           createdAt: new Date().toISOString(),
           organizationId: orgId
         };
         addToSyncQueue({ table: 'expenses', action: 'insert', data: expObjRuwan });
         msgs.push(`Ruwan tea/expense Rs ${ruwanExpAmt} added.`);
       }
       if (sankaExpAmt > 0) {
         const sankaUser = allUsers.find(u => (u.name || '').toLowerCase().includes('sanka') || u.name.includes('සංක'));
         const expObjSanka = {
           id: 'EXP-SK-' + Date.now().toString().slice(-6),
           amount: sankaExpAmt,
           description: 'Sanka Tea & Expense (සංකගේ තේ සහ වියදම්)',
           repId: sankaUser?.id || 'sanka',
           rep: sankaUser?.name || 'Sanka',
           date: todayDateStr,
           createdAt: new Date().toISOString(),
           organizationId: orgId
         };
         addToSyncQueue({ table: 'expenses', action: 'insert', data: expObjSanka });
         msgs.push(`Sanka tea/expense Rs ${sankaExpAmt} added.`);
       }
       if (myAdv > 0) {
         const advObj = {
           id: 'ADV-' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(-2),
           amount: myAdv,
           description: currentRep.name + ' Advance',
           repId: currentRep.id,
           rep: currentRep.name,
           date: todayDateStr,
           createdAt: new Date().toISOString(),
           organizationId: orgId
         };
         addToSyncQueue({ table: 'expenses', action: 'insert', data: advObj });
       }
       if (otherAdv > 0 && advanceToUserId) {
         const staffName = allUsers.find(u => u.id === advanceToUserId)?.name || 'Staff';
         const advObj2 = {
           id: 'ADV-' + Date.now().toString().slice(-6) + Math.random().toString(36).slice(-2),
           amount: otherAdv,
           description: staffName + ' Advance (from ' + currentRep.name + ')',
           repId: currentRep.id,
           rep: currentRep.name,
           date: todayDateStr,
           createdAt: new Date().toISOString(),
           organizationId: orgId
         };
         addToSyncQueue({ table: 'expenses', action: 'insert', data: advObj2 });
       }
    }

    saveUsers(allUsers);
    if (currentRep) {
      markDatesSettled(currentRep.id, [selectedDate], {
        totalCash,
        totalCheque,
        repName: currentRep.name,
        expensesDeduction: expAmt + ruwanExpAmt + sankaExpAmt,
        advancesDeduction: myAdv + otherAdv,
        netCashHandedOver: netCash,
        salesCount: todaySales.length,
        grossProfit: todayGrossProfit,
        netProfit: todayNetProfit
      });
    }
    if (myAdv > 0) msgs.push(`My advance (Rs ${myAdv}) recorded.`);
    if (otherAdv > 0) msgs.push(`Staff advance (Rs ${otherAdv}) recorded.`);
    msgs.push(`Added net cash Rs ${netCash.toLocaleString()} to your Cash Book.`);
    
    alert("Settlement Submitted (වියදම් සහ අත්තිකාරම් යොමු කරන ලදී).\n" + msgs.join("\n"));
    
    setAdvanceToUser('');
    setAdvanceToUserId('');
    setExpenseAmount('');
    setExpenseDesc('');
    setAdvanceAmount('');
    setRuwanExpense('');
    setSankaExpense('');
  };

  return (
    <div className="space-y-8 pb-32">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-4xl font-bold text-slate-800 tracking-tight">{t('settlement')}</h3>
          <p className="text-slate-500 mt-1">Review collections, submit expenses & cash advances</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
          <label className="text-xs font-bold text-slate-500 whitespace-nowrap">දිනය (Date):</label>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={e => setSelectedDate(e.target.value)}
            className="text-sm font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
          />
          {selectedDate !== getTodayDateStr() && (
            <button 
              onClick={() => setSelectedDate(getTodayDateStr())}
              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-bold hover:bg-blue-200"
            >
              Today
            </button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div>
           <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden h-full flex flex-col justify-center">
             <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full mix-blend-overlay -translate-y-1/2 translate-x-1/4 blur-2xl"></div>
             <div className="flex justify-between items-center mb-6">
               <h4 className="font-display text-xl font-bold text-white/90">ගනුදෙනු හා ලැබීම් (Summary & Collections)</h4>
               <span className="text-xs font-mono bg-white/10 text-slate-200 px-3 py-1 rounded-full">{selectedDate}</span>
             </div>
             <div className="space-y-3">
               <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5 text-sm font-bold">
                 <span>මුළු අලෙවිය (Total Invoiced)</span>
                 <span className="font-mono text-blue-300 text-base">Rs {totalInvoiced.toLocaleString()}</span>
               </div>

               <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5 text-sm font-bold">
                 <span>මුදල් ලැබීම් (Cash Receipts)</span>
                 <span className="font-mono text-emerald-400 text-base">Rs {totalCash.toLocaleString()}</span>
               </div>

               <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5 text-sm font-bold">
                 <span>චෙක්පත් ලැබීම් (Cheque Receipts)</span>
                 <span className="font-mono text-purple-300 text-base">Rs {totalCheque.toLocaleString()}</span>
               </div>

               <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5 text-sm font-bold">
                 <span>අද අලුත් ණය (New Credit Given)</span>
                 <span className="font-mono text-rose-300 text-base">Rs {totalNewDebt.toLocaleString()}</span>
               </div>
             </div>
             
             <div className="flex justify-between items-center mt-6 pt-6 border-t border-white/20">
                <span className="text-white/90 font-bold uppercase tracking-widest text-sm">එකතු වූ මුළු මුදල (Total Collected)</span>
                <span className="font-display text-3xl font-black text-emerald-400">Rs {((totalCash || 0) + (totalCheque || 0)).toLocaleString()}</span>
             </div>
           </div>
        </div>

        <div>
           {/* Profit & Loss Breakdown Card */}
           <div className="mb-6 bg-slate-900 p-6 rounded-[2rem] shadow-xl text-white border border-slate-800">
             <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
               <h4 className="font-display text-base font-bold text-slate-100 flex items-center gap-2">
                 <span>📊 ලාභය සහ වියදම් සාරාංශය (Profit Breakdown)</span>
               </h4>
               <span className="text-xs font-mono bg-white/10 px-2.5 py-1 rounded-full text-slate-300">{selectedDate}</span>
             </div>
             
             <div className="space-y-2.5">
               <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl text-xs font-bold">
                 <span className="text-emerald-300">අලෙවි ලාභය (Gross Profit)</span>
                 <span className="font-mono text-emerald-400 text-sm font-black">Rs {todayGrossProfit.toLocaleString()}</span>
               </div>

               <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl text-xs font-bold">
                 <span className="text-rose-300">සෙට්ල්මන්ට් වියදම් (Deducted Expenses)</span>
                 <span className="font-mono text-rose-400 text-sm font-black">- Rs {todayExpensesTotal.toLocaleString()}</span>
               </div>

               <div className="flex justify-between items-center bg-emerald-500/20 p-3.5 rounded-xl border border-emerald-500/30 text-sm font-bold">
                 <span className="text-emerald-200">ශුද්ධ ලාභය (Net Profit)</span>
                 <span className="font-mono text-white text-base font-black">Rs {todayNetProfit.toLocaleString()}</span>
               </div>

               {todayOtherExpensesTotal > 0 && (
                 <div className="flex justify-between items-center bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-xs font-bold">
                   <span className="text-amber-300">වෙනත් වියදම් (නොඅඩු කළ)</span>
                   <span className="font-mono text-amber-400 text-sm font-black">Rs {todayOtherExpensesTotal.toLocaleString()}</span>
                 </div>
               )}
             </div>
           </div>

           <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-fit flex flex-col">
             <h4 className="font-display text-xl font-bold mb-6 text-slate-800">Expenses & Advances</h4>
             <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-2">මගේ අත්තිකාරම් / My Cash Advance (LKR)</label>
                  <input type="number" placeholder="Enter Amount (e.g. 5000)" value={advanceAmount || ''} onChange={e=>setAdvanceAmount(e.target.value)} className="w-full p-4 bg-orange-50 border border-orange-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 ring-orange-500/20 text-orange-900 font-bold transition-all" />
                </div>
                
                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-sm font-semibold text-slate-500 mb-2">වෙනත් සේවකයෙකුට දුන් මුදල් / Advance Given to Staff</label>
                  <div className="flex gap-2">
                     <select value={advanceToUserId} onChange={e=>setAdvanceToUserId(e.target.value)} className="w-1/2 p-4 bg-purple-50 border border-purple-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 ring-purple-500/20 text-purple-900 font-bold transition-all">
                       <option value="">Select Staff...</option>
                       {selectableUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({String(u.role || '').toUpperCase()})</option>
                       ))}
                     </select>
                     <input type="number" placeholder="Amount (e.g. 2000)" value={advanceToUser || ''} onChange={e=>setAdvanceToUser(e.target.value)} className="w-1/2 p-4 bg-purple-50 border border-purple-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 ring-purple-500/20 text-purple-900 font-bold transition-all" />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-sm font-semibold text-slate-500 mb-2">වෙනත් වියදම් මුදල / Other Expense Amount (LKR)</label>
                  <input type="number" placeholder="e.g. 1500" value={expenseAmount || ''} onChange={e=>setExpenseAmount(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 ring-blue-500/20 text-slate-800 font-medium transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-2">වියදම් විස්තරය / Expense Description</label>
                  <input type="text" placeholder="Fuel (ඉන්ධන), Food (ආහාර), Repairs..." value={expenseDesc || ''} onChange={e=>setExpenseDesc(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 ring-blue-500/20 text-slate-800 transition-all" />
                </div>

                {/* Ruwan & Sanka Tea/Expenses Split */}
                <div className="pt-4 border-t border-amber-200 bg-amber-50/60 p-4 rounded-2xl border">
                  <label className="block text-sm font-bold text-amber-900 mb-3">☕ තේ & වියදම් වෙන වෙනම (Ruwan & Sanka Tea / Expenses)</label>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-amber-800 mb-1">රුවන්ගේ තේ සහ වියදම් (Ruwan Tea & Expense)</label>
                      <input type="number" placeholder="e.g. 300" value={ruwanExpense || ''} onChange={e=>setRuwanExpense(e.target.value)} className="w-full p-3 bg-white border border-amber-300 rounded-xl text-amber-900 font-bold focus:outline-none focus:border-amber-500 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-amber-800 mb-1">සංකගේ තේ සහ වියදම් (Sanka Tea & Expense)</label>
                      <input type="number" placeholder="e.g. 300" value={sankaExpense || ''} onChange={e=>setSankaExpense(e.target.value)} className="w-full p-3 bg-white border border-amber-300 rounded-xl text-amber-900 font-bold focus:outline-none focus:border-amber-500 text-sm" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-500 mb-2">බිල්පතක් ඇත්නම් ඡායාරූපයක් එක් කරන්න / Receipt Photo</label>
                  <div className="relative border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <Camera className="mx-auto text-slate-400 mb-2" size={24} />
                    <span className="text-sm font-medium text-slate-500">Tap to snap receipt</span>
                  </div>
                </div>
                {/* Settlement Summary Box */}
                {(() => {
                  const expAmt = parseFloat(expenseAmount) || 0;
                  const myAdv = parseFloat(advanceAmount) || 0;
                  const otherAdv = parseFloat(advanceToUser) || 0;
                  const ruwanExpAmt = parseFloat(ruwanExpense) || 0;
                  const sankaExpAmt = parseFloat(sankaExpense) || 0;
                  const totalDeductions = expAmt + myAdv + otherAdv + ruwanExpAmt + sankaExpAmt;
                  const netCashHandOver = totalCash - totalDeductions;
                  return (
                    <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-2 border border-slate-800 shadow-inner">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>මුළු මුදල් ලැබීම් (Cash Collected):</span>
                        <span className="font-bold text-slate-200">Rs {totalCash.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>වියදම් සහ අත්තිකාරම් (Deductions):</span>
                        <span className="font-bold text-rose-400">- Rs {totalDeductions.toLocaleString()}</span>
                      </div>
                      <div className="border-t border-slate-700 pt-2 flex justify-between items-center font-bold">
                        <span className="text-sm text-emerald-400">භාරදිය යුතු ශුද්ධ මුදල (Net Cash):</span>
                        <span className="text-xl font-black text-emerald-400">Rs {netCashHandOver.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })()}

                <button onClick={handleSettlementSubmit} className="w-full bg-blue-600 text-white rounded-xl py-4 font-bold tracking-wide hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] mt-2 flex items-center justify-center cursor-pointer">
                   <CheckSquare size={20} className="mr-2" /> සම්පූර්ණ කරන්න (Submit Settlement)
                 </button>
             </div>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8">
        <h4 className="font-display text-xl font-bold mb-4 text-slate-800 flex items-center gap-2">
          <span>📅 තෝරාගත් දින ගනුදෙනු විස්තර (Detailed Transactions)</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold ml-auto">{todaySales.length} Transactions</span>
        </h4>
        {todaySales.length === 0 ? (
          <p className="text-slate-400 text-sm py-4 text-center">තෝරාගත් දිනය ({selectedDate}) සඳහා කිසිදු බිල්පතක් හෝ ලැබීමක් නැත.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Time / Type</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4 text-right">Invoice Total (අලෙවි වටිනාකම)</th>
                  <th className="py-3 px-4 text-right text-emerald-600">Paid / Collected (මුදල් ලැබීම්)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                {todaySales.map((s, i) => {
                  const isCredit = s.mode === 'credit';
                  const totalPaid = getSalePaidAmount(s);
                  const dObj = parseSaleDate(s.createdAt || s.date);
                  const timeStr = dObj ? dObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  
                  return (
                    <tr key={s.id || i} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900">{isCredit ? 'ණය එකතු කිරීම (Credit Collection)' : (s.paymentType || 'Cash Sale')}</span>
                        {timeStr && <span className="block text-[11px] text-slate-400">{timeStr}</span>}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">{s.customer}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          s.paymentType === 'Cash + Cheque' ? 'bg-indigo-100 text-indigo-800' :
                          s.paymentType === 'Cash' ? 'bg-emerald-100 text-emerald-800' :
                          s.paymentType === 'Cheque' ? 'bg-purple-100 text-purple-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {s.paymentType === 'Cash + Cheque' 
                            ? `Cash: Rs.${(s.cashAmount || 0).toLocaleString()} + Chq: Rs.${(s.chequeAmount || 0).toLocaleString()}` 
                            : (s.paymentType || 'Cash')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">{isCredit ? '-' : `Rs ${Number(s.total || 0).toLocaleString()}`}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600">
                        Rs {totalPaid.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                <tr>
                  <td colSpan={3} className="py-3 px-4 text-right text-xs uppercase tracking-wider font-extrabold text-slate-700">
                    එකතුව (Totals):
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-900">
                    Rs {totalInvoiced.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-700 text-base font-black">
                    Rs {(totalCash + totalCheque).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Final Settlement Summary Details at Bottom */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2rem] p-8 border border-slate-700 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700 pb-6">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-widest mb-1">
              <CheckCircle size={16} /> සෙට්ල්මන්ට් අවසන් විස්තරය (Final Settlement Breakdown)
            </div>
            <h4 className="font-display text-2xl font-bold text-white">
              {currentRep?.name || 'Rep'} — Daily Settlement Summary ({selectedDate})
            </h4>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            සැකසූ දිනය: {selectedDate}
          </div>
        </div>

        {(() => {
          const expAmt = parseFloat(expenseAmount) || 0;
          const myAdv = parseFloat(advanceAmount) || 0;
          const otherAdv = parseFloat(advanceToUser) || 0;
          const ruwanExpAmt = parseFloat(ruwanExpense) || 0;
          const sankaExpAmt = parseFloat(sankaExpense) || 0;
          const totalExpensesVal = expAmt + ruwanExpAmt + sankaExpAmt;
          const totalAdvancesVal = myAdv + otherAdv;
          const grandDeduction = totalExpensesVal + totalAdvancesVal;
          const finalNetHandover = (totalCash || 0) - grandDeduction;

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">මුළු අලෙවිය (Total Invoiced)</span>
                <span className="text-2xl font-black text-blue-300 font-mono">Rs {totalInvoiced.toLocaleString()}</span>
                <span className="block text-[11px] text-slate-400 mt-1">{todaySales.length} Invoices Issued</span>
              </div>

              <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">එකතු වූ මුදල් (Cash Collected)</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">Rs {totalCash.toLocaleString()}</span>
                {totalCheque > 0 && <span className="block text-[11px] text-purple-300 mt-1">+ Cheque: Rs {totalCheque.toLocaleString()}</span>}
              </div>

              <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">වියදම් & අත්තිකාරම් (Deductions)</span>
                <span className="text-2xl font-black text-rose-400 font-mono">- Rs {grandDeduction.toLocaleString()}</span>
                <div className="text-[10px] text-rose-300 mt-1 space-y-0.5">
                  {totalExpensesVal > 0 && <div>Expenses: Rs {totalExpensesVal.toLocaleString()}</div>}
                  {totalAdvancesVal > 0 && <div>Advances: Rs {totalAdvancesVal.toLocaleString()}</div>}
                </div>
              </div>

              <div className="bg-emerald-600/20 p-5 rounded-2xl border border-emerald-500/40">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider block mb-1">භාරදුන් ශුද්ධ මුදල (Net Handed Over)</span>
                <span className="text-3xl font-black text-emerald-300 font-mono">Rs {finalNetHandover.toLocaleString()}</span>
                <span className="block text-[11px] text-emerald-400 font-semibold mt-1">Ready for Admin Verification</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function AttendanceTab({ t, todayAttendance, setTodayAttendance, currentRep, salesData, onMarkAttendance }: { t: (key: string) => string, todayAttendance: AttendanceRecord | null, setTodayAttendance: (att: AttendanceRecord) => void, currentRep: SystemUser, salesData: any[], onMarkAttendance?: (isEndDay?: boolean, workingHoursVal?: string, otHoursVal?: string) => void }) {
  const [workingHours, setWorkingHours] = useState('8');
  const [otHours, setOtHours] = useState('0');
  const [showEndDayForm, setShowEndDayForm] = useState(false);

  const markAttendance = (isEndDay = false) => {
    if (onMarkAttendance) {
      onMarkAttendance(isEndDay, workingHours, otHours);
      setShowEndDayForm(false);
      return;
    }
    const handleSave = (loc: string) => {
      const allAtt = getAttendanceRecords();
      const todayStr = new Date().toISOString().split('T')[0];
      
      const existing = allAtt.find(a => a.repId === currentRep.id && a.date === todayStr);

      const newRec: AttendanceRecord = {
        id: existing?.id || 'att_' + Date.now(),
        repId: currentRep.id,
        repName: currentRep.name,
        date: todayStr,
        timestamp: Date.now(),
        status: existing?.status || 'Pending',
        location: loc,
        workingHours: isEndDay ? parseFloat(workingHours || '0') : (existing?.workingHours || 0),
        otHours: isEndDay ? parseFloat(otHours || '0') : (existing?.otHours || 0),
        isEndDay: isEndDay || existing?.isEndDay || false
      };
      
      const filtered = allAtt.filter(a => !(a.repId === currentRep.id && a.date === todayStr));
      filtered.push(newRec);
      saveAttendanceRecords(filtered);
      setTodayAttendance(newRec);
      addToSyncQueue({ table: 'attendance', action: 'insert', data: newRec });
      setShowEndDayForm(false);
    };

    if('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        handleSave(`${pos.coords.latitude}, ${pos.coords.longitude}`);
      }, () => {
        alert("GPS disabled. Could not mark location.");
        handleSave('Unknown');
      });
    } else {
      handleSave('Unknown');
    }
  };

  const calculateTodayStats = () => {
    const todayStr = getTodayDateStr();
    const repSales = salesData.filter(s => (s.repId === currentRep.id || s.coRepId === currentRep.id || currentRep.role === 'admin') && !s.issuedByAdmin && s.mode === 'sale' && getSaleDateStr(s) === todayStr);
    const totalSale = repSales.reduce((sum, current) => sum + (current.total || 0), 0);
    
    // Performance Bonus logic (usually for Reps)
    let bonus = 0;
    if (totalSale >= 100000) bonus = 800;
    else if (totalSale >= 60000) bonus = 400;
    else if (totalSale >= 35000) bonus = 200;

    const model = currentRep.payModel || 'monthly';
    let baseEarnings = 0;

    if (model === 'monthly') {
      baseEarnings = (currentRep.baseSalary ? currentRep.baseSalary / 25 : 1600) + (currentRep.attendanceAllowance || 150);
    } else if (model === 'daily') {
      baseEarnings = currentRep.dailyWage || 0;
    } else if (model === 'hourly') {
      const h = todayAttendance?.workingHours || 0;
      const ot = todayAttendance?.otHours || 0;
      baseEarnings = (h * (currentRep.hourlyRate || 0)) + (ot * (currentRep.otRate || 0));
    }

    const advance = currentRep.advances || 0;
    const totalEarningsToday = (todayAttendance && todayAttendance.status !== 'Rejected') ? (baseEarnings + bonus) : 0;

    return { 
      totalSale, 
      bonus, 
      baseSalary: model === 'monthly' ? (currentRep.baseSalary ? currentRep.baseSalary / 25 : 1600) : baseEarnings, 
      allowance: model === 'monthly' ? (currentRep.attendanceAllowance || 150) : 0, 
      advance, 
      totalEarningsToday,
      model
    };
  };

  const { totalSale, bonus, baseSalary, allowance, advance, totalEarningsToday, model } = calculateTodayStats();

  return (
    <div className="bg-white p-8 md:p-12 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center max-w-2xl mx-auto">
      <h3 className="font-display text-4xl font-bold mb-8 text-slate-800 tracking-tight">{t('attendance')}</h3>
      
      {!todayAttendance ? (
        <div className="py-12 flex flex-col items-center">
          <p className="text-slate-500 mb-10 text-lg leading-relaxed">Turn on GPS and tap below to mark your daily attendance. This starts your day and registers you for baseline pay.</p>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => markAttendance(false)} 
            className="group relative w-44 h-44 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex flex-col items-center justify-center text-white shadow-2xl shadow-emerald-500/40 border-8 border-emerald-50"
          >
            <CheckSquare size={56} className="mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-display font-bold text-lg uppercase tracking-wider">Start Day</span>
          </motion.button>
        </div>
      ) : (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-8 flex flex-col items-center">
          <div className="flex gap-4 mb-6">
            <div className={`p-4 rounded-3xl border flex flex-col items-center justify-center w-32 ${todayAttendance.status === 'Approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
              {todayAttendance.status === 'Approved' ? <CheckCircle size={32} /> : <CloudCog size={32} className="animate-pulse" />}
              <span className="text-[10px] font-bold uppercase mt-2">{todayAttendance.status}</span>
            </div>
            {todayAttendance.isEndDay && (
              <div className="p-4 rounded-3xl border border-blue-100 bg-blue-50 text-blue-600 flex flex-col items-center justify-center w-32">
                <CheckSquare size={32} />
                <span className="text-[10px] font-bold uppercase mt-2">End Day Marked</span>
              </div>
            )}
          </div>

          <h4 className="font-display text-2xl font-black text-slate-800">
             {todayAttendance.status === 'Approved' ? "Verification Successful" : "Attendance Under Review"}
          </h4>

          {todayAttendance.status === 'Approved' && !todayAttendance.isEndDay && (model === 'hourly' || model === 'daily') && (
            <div className="mt-8 w-full max-w-sm">
              {!showEndDayForm ? (
                <button 
                  onClick={() => setShowEndDayForm(true)}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-500/30"
                >
                  End Day / වැඩ අවසන් කිරීම
                </button>
              ) : (
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 text-left space-y-4">
                  <h5 className="font-bold text-slate-700">Daily Work Summary</h5>
                  {model === 'hourly' && (
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500">Working Hours</label>
                          <input type="number" value={workingHours || ''} onChange={e => setWorkingHours(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl" />
                       </div>
                       <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500">OT Hours</label>
                          <input type="number" value={otHours || ''} onChange={e => setOtHours(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl" />
                       </div>
                    </div>
                  )}
                  {model === 'daily' && (
                    <p className="text-sm text-slate-600">Marking end day will notify admin to finalize your daily wage.</p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setShowEndDayForm(false)} className="flex-1 bg-white border border-slate-200 py-3 rounded-xl font-bold">Cancel</button>
                    <button onClick={() => markAttendance(true)} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md">Submit End Day</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Rep Earnings Dashboard */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 text-left">
           <div className="flex justify-between items-start">
             <h5 className="text-slate-500 uppercase text-xs font-bold tracking-widest mb-1">Total Balance</h5>
             <Wallet size={16} className="text-slate-400" />
           </div>
           <div className={`text-3xl font-black ${ (currentRep.salaryBalance || 0) < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
             Rs {(currentRep.salaryBalance || 0).toLocaleString()}
           </div>
        </div>
        <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 text-left">
           <div className="flex justify-between items-start">
             <h5 className="text-emerald-800 uppercase text-xs font-bold tracking-widest mb-1">Today's Est. Earnings</h5>
             <DollarSign size={16} className="text-emerald-500" />
           </div>
           <div className="text-3xl font-black text-emerald-600">
             Rs {(totalEarningsToday).toLocaleString()}
           </div>
           <div className="grid grid-cols-2 gap-y-1 mt-3 pt-3 border-t border-emerald-200/50 text-[10px]">
              <span className="text-emerald-700">Base Earnings ({model}):</span> <span className="text-right font-bold text-emerald-800">Rs {baseSalary.toFixed(2)}</span>
              {model === 'monthly' && (
                <>
                  <span className="text-emerald-700">Allowance:</span> <span className="text-right font-bold text-emerald-800">Rs {allowance}</span>
                </>
              )}
              {bonus > 0 && (
                <>
                  <span className="text-emerald-700">Sales Bonus:</span> <span className="text-right font-black text-emerald-600">+ Rs {bonus}</span>
                </>
              )}
           </div>
        </div>
      </div>
      
      <div className="mt-8 text-left bg-blue-50/50 border border-blue-100 p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full"></div>
        <h4 className="font-display font-bold text-xl mb-4 text-blue-900 flex items-center">
          <DollarSign size={24} className="mr-2 text-blue-500"/> Pay & Bonus Info
        </h4>
        <ul className="space-y-3">
          <li className="flex items-center text-slate-700 bg-white p-3 rounded-xl border border-blue-50">
             <span className="w-2 h-2 rounded-full bg-blue-400 mr-3"></span> Default Pay + Food: <strong className="ml-auto text-slate-900 font-mono">1,750 LKR</strong>
          </li>
          <li className="flex items-center text-slate-700 bg-white p-3 rounded-xl border border-blue-50">
             <span className="w-2 h-2 rounded-full bg-blue-400 mr-3"></span> Daily Target &gt; 35K <strong className="ml-auto text-emerald-600 font-mono">+ 200 LKR</strong>
          </li>
          <li className="flex items-center text-slate-700 bg-white p-3 rounded-xl border border-blue-50">
             <span className="w-2 h-2 rounded-full bg-blue-400 mr-3"></span> Daily Target &gt; 60K <strong className="ml-auto text-emerald-600 font-mono">+ 400 LKR</strong>
          </li>
          <li className="flex items-center text-slate-700 bg-white p-3 rounded-xl border border-blue-50">
             <span className="w-2 h-2 rounded-full bg-blue-400 mr-3"></span> Daily Target &gt; 100K <strong className="ml-auto text-emerald-600 font-mono">+ 800 LKR</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}



function CashBookTab({ t, currentRep, setCurrentRep, lang, salesData }: { t: (key: string) => string, currentRep: SystemUser | null, setCurrentRep: (user: SystemUser) => void, lang: 'en' | 'si', salesData: any[] }) {
  const [handoverAmount, setHandoverAmount] = useState('');
  const [filterText, setFilterText] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('all'); // 'all', 'today', or YYYY-MM-DD
  const orgId = getActiveOrgId();

  const [allExpenses, setAllExpenses] = useState<any[]>(() => {
    const storedExpStr = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1') || '[]';
    try { return JSON.parse(storedExpStr); } catch (e) { return []; }
  });

  const [allReqs, setAllReqs] = useState<any[]>(() => getAIActionRequests());

  useEffect(() => {
    const handleSync = (e: any) => {
      const table = e.detail?.table;
      if (!table || table === 'expenses' || table === 'aiactions') {
        const storedExpStr = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1') || '[]';
        try { setAllExpenses(JSON.parse(storedExpStr)); } catch (err) {}
        setAllReqs(getAIActionRequests());
      }
    };
    window.addEventListener('bizflow_sync', handleSync);
    return () => window.removeEventListener('bizflow_sync', handleSync);
  }, []);

  // Helper for item date key (YYYY-MM-DD)
  const getItemDateKey = (item: any): string => {
    if (item.dateKey && typeof item.dateKey === 'string') return item.dateKey.split('T')[0];
    if (item.date && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.date)) {
      return item.date.split('T')[0];
    }
    const rawDate = item.createdAt || item.date || item.timestamp;
    if (rawDate) {
      if (typeof rawDate === 'number') {
        const d = new Date(rawDate);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // Helper for cash inflow from a sale
  const getSaleCashInflow = (s: any): number => {
    if (s.status === 'cancelled') return 0;
    if (s.paymentType === 'Cash + Cheque' || (s.cashAmount !== undefined && s.cashAmount !== null && (s.cashAmount > 0 || s.chequeAmount > 0))) {
      return Number(s.cashAmount || 0);
    }
    if (s.mode === 'credit') {
      return Number(s.creditReceivedAmount || s.partialAmount || s.total || 0);
    }
    if (s.paymentType === 'Credit') {
      return Number(s.partialAmount || 0);
    }
    if (s.paymentType === 'Cheque' || s.payMethod === 'Cheque') {
      return 0;
    }
    if (s.paymentType === 'Half-payment') {
      return Number(s.partialAmount || 0);
    }
    // For Cash or Full payment:
    if (s.partialAmount !== undefined && s.partialAmount !== null && s.partialAmount !== '' && Number(s.partialAmount) > 0) {
      return Number(s.partialAmount);
    }
    return Number(s.total || 0);
  };

  // 1. Inflows from Sales & Collections
  const repSales = (salesData || []).filter(s => (s.repId === currentRep?.id || s.coRepId === currentRep?.id || currentRep?.role === 'admin' || !s.repId) && s.status !== 'cancelled' && !s.issuedByAdmin && s.repId !== 'admin');

  // 2. Outflows from Expenses & Advances
  const repExpenses = allExpenses.filter(e => e.repId === currentRep?.id || e.rep === currentRep?.name);

  // 3. Handover Requests to Admin
  const repHandovers = allReqs.filter(r => r.repId === currentRep?.id && r.actionType === 'handover_admin');
  const pendingHandover = repHandovers.filter(r => r.status === 'Pending').reduce((acc, curr) => acc + (Number(curr.payload?.amount) || 0), 0);

  // Build Transaction Journal Entries
  const entries: any[] = [];

  repSales.forEach(s => {
    const rawDate = s.createdAt || s.date || Date.now();
    const d = typeof rawDate === 'number' ? new Date(rawDate) : new Date(rawDate);
    const timestamp = isNaN(d.getTime()) ? Date.now() : d.getTime();
    const dateKey = getItemDateKey(s);

    if (s.mode === 'sale') {
      const cashIn = getSaleCashInflow(s);
      if (cashIn > 0) {
        entries.push({
          id: 'sale_' + s.id,
          timestamp,
          dateKey,
          dateStr: formatSinhalaDate(timestamp, { includeTime: true }),
          desc: `${lang === 'si' ? 'අලෙවි බිල්පත' : 'Sales Invoice'}: ${s.customer || 'Cash Customer'} (${s.id})`,
          type: 'IN',
          amount: cashIn,
          category: lang === 'si' ? 'අලෙවිය' : 'Sale'
        });
      }
    } else if (s.mode === 'credit' || s.creditReceivedAmount > 0) {
      const cashIn = Number(s.creditReceivedAmount || s.partialAmount || 0);
      if (cashIn > 0 && s.paymentType !== 'Cheque') {
        entries.push({
          id: 'coll_' + s.id,
          timestamp,
          dateKey,
          dateStr: formatSinhalaDate(timestamp, { includeTime: true }),
          desc: `${lang === 'si' ? 'ණය ලැබීම' : 'Credit Collection'}: ${s.customer || 'Customer'} (${s.id})`,
          type: 'IN',
          amount: cashIn,
          category: lang === 'si' ? 'ණය ලැබීම්' : 'Collection'
        });
      }
    }
  });

  repExpenses.forEach(e => {
    const rawDate = e.createdAt || e.date || Date.now();
    const d = typeof rawDate === 'number' ? new Date(rawDate) : new Date(rawDate);
    const timestamp = isNaN(d.getTime()) ? Date.now() : d.getTime();
    const dateKey = getItemDateKey(e);

    entries.push({
      id: 'exp_' + (e.id || timestamp),
      timestamp,
      dateKey,
      dateStr: formatSinhalaDate(timestamp, { includeTime: true }),
      desc: e.description || (lang === 'si' ? 'වියදම' : 'Expense'),
      type: 'OUT',
      amount: Number(e.amount || 0),
      category: lang === 'si' ? 'වියදම්' : 'Expense'
    });
  });

  repHandovers.filter(r => r.status === 'Approved').forEach(r => {
    const timestamp = Number(r.timestamp || Date.now());
    const dateKey = getItemDateKey(r);

    entries.push({
      id: 'ho_' + r.id,
      timestamp,
      dateKey,
      dateStr: formatSinhalaDate(timestamp, { includeTime: true }),
      desc: lang === 'si' ? 'ඇඩ්මින්ට මුදල් භාරදීම (අනුමතයි)' : 'Admin Cash Handover (Approved)',
      type: 'OUT',
      amount: Number(r.payload?.amount || 0),
      category: lang === 'si' ? 'මුදල් භාරදීම' : 'Handover'
    });
  });

  // Sort chronologically ascending to compute running balance
  entries.sort((a, b) => a.timestamp - b.timestamp);

  let runningBalance = 0;
  let totalIn = 0;
  let totalOut = 0;

  const entriesWithBalance = entries.map(entry => {
    if (entry.type === 'IN') {
      runningBalance += entry.amount;
      totalIn += entry.amount;
    } else {
      runningBalance -= entry.amount;
      totalOut += entry.amount;
    }
    return { ...entry, runningBalance };
  });

  const cbBalance = runningBalance;
  const availableToHandover = Math.max(0, cbBalance - pendingHandover);

  // Sync computed balance back to currentRep state & storage if changed
  useEffect(() => {
    if (currentRep && (currentRep.cashBookBalance !== cbBalance || currentRep.pendingAdminHandover !== pendingHandover)) {
      const allUsers = getUsers();
      const updatedUser = { ...currentRep, cashBookBalance: cbBalance, pendingAdminHandover: pendingHandover };
      const newUsers = allUsers.map(u => u.id === currentRep.id ? updatedUser : u);
      saveUsers(newUsers);
      setCurrentRep(updatedUser);
      sessionStorage.setItem('current_rep', JSON.stringify(updatedUser));
    }
  }, [cbBalance, pendingHandover, currentRep]);

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredEntries = entriesWithBalance.filter(e => {
    if (selectedDate === 'today') {
      return e.dateKey === todayStr;
    } else if (selectedDate !== 'all' && selectedDate) {
      return e.dateKey === selectedDate;
    }
    return true;
  }).filter(e => 
    !filterText || e.desc.toLowerCase().includes(filterText.toLowerCase()) || e.category.toLowerCase().includes(filterText.toLowerCase())
  );

  const displayEntries = [...filteredEntries].reverse();

  const handleHandover = () => {
    const amt = parseFloat(handoverAmount);
    if (!amt || amt <= 0) return alert(lang === 'si' ? "කරුණාකර නිවැරදි මුදලක් ඇතුළත් කරන්න" : "Please enter a valid amount");
    if (amt > availableToHandover) return alert(lang === 'si' ? "ඇතුළත් කළ මුදල භාරදීමට ඇති ශේෂයට වඩා වැඩිය" : "Amount exceeds available balance");
    
    if (currentRep) {
      const allUsers = getUsers();
      const newPending = (pendingHandover || 0) + amt;
      const updatedUser = {
        ...currentRep,
        pendingAdminHandover: newPending
      };
      const newUsers = allUsers.map(u => u.id === currentRep.id ? updatedUser : u);
      
      saveUsers(newUsers);
      setCurrentRep(updatedUser);
      sessionStorage.setItem('current_rep', JSON.stringify(updatedUser));
      
      const reqObj = {
        id: 'req_' + Date.now(),
        repId: currentRep.id,
        repName: currentRep.name,
        actionType: 'handover_admin' as any,
        description: `Handing over cash to Admin: Rs ${amt.toLocaleString()}`,
        payload: { amount: amt },
        status: 'Pending' as any,
        timestamp: Date.now()
      };

      const reqs = getAIActionRequests();
      reqs.push(reqObj);
      saveAIActionRequests(reqs);
      addToSyncQueue({ table: 'aiactions', action: 'insert', data: reqObj });
      
      alert(lang === 'si' ? "මුදල් භාරදීම ඇඩ්මින්ගේ අනුමැතිය සඳහා යවන ලදී!" : "Handover submitted for Admin approval!");
      setHandoverAmount('');
    }
  };

  // Calculate Gross Profit, Expenses & Net Profit for selectedDate view in CashBookTab
  const adminInventory = getAdminInventory();
  const adminCostMap = new Map<string, number>();
  (adminInventory || []).forEach((item: any) => {
    if (item && item.id) adminCostMap.set(String(item.id), Number(item.costPrice) || Number(item.maxPrice) || 0);
  });

  let computedGrossProfit = 0;
  const filteredSalesForProfit = (salesData || []).filter(s => s.status !== 'cancelled').filter(s => {
    if (selectedDate === 'today') return getItemDateKey(s) === todayStr;
    if (selectedDate !== 'all' && selectedDate) return getItemDateKey(s) === selectedDate;
    return true;
  });

  filteredSalesForProfit.forEach(s => {
    if (s.mode === 'sale' || !s.mode) {
      (s.items || []).forEach((item: any) => {
        if (!item.isReturn) {
          const sellPrice = Number(item.price) || 0;
          const costPrice = (item.costPrice !== undefined && item.costPrice !== null && Number(item.costPrice) > 0)
            ? Number(item.costPrice)
            : (adminCostMap.get(String(item.id)) || 0);
          const qty = Number(item.qty) || 0;
          computedGrossProfit += (sellPrice - costPrice) * qty;
        }
      });
    }
  });

  const filteredExpensesForProfit = (allExpenses || []).filter(e => {
    if (selectedDate === 'today') return getItemDateKey(e) === todayStr;
    if (selectedDate !== 'all' && selectedDate) return getItemDateKey(e) === selectedDate;
    return true;
  });

  const deductibleExpensesListRep = filteredExpensesForProfit.filter(e => e.deductFromSettlement !== false);
  const nonDeductibleExpensesListRep = filteredExpensesForProfit.filter(e => e.deductFromSettlement === false);

  const computedExpensesTotal = deductibleExpensesListRep.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const computedOtherExpensesTotal = nonDeductibleExpensesListRep.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const computedNetProfit = computedGrossProfit - computedExpensesTotal;

  return (
    <div className="space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-4xl font-bold text-slate-800 tracking-tight">{lang === 'si' ? 'මුදල් පොත' : 'Cash Book'}</h3>
          <p className="text-slate-500 mt-1">{lang === 'si' ? 'ඔබගේ සජීවී මුදල් ශේෂය, ලොගය සහ භාරදීම් (දවස ගානේ අප්ඩේට් වේ)' : 'Your live cash balance, journal, and handovers (Daily update)'}</p>
        </div>

        {/* Date Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => setSelectedDate('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${selectedDate === 'all' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {lang === 'si' ? 'සියල්ල' : 'All Time'}
          </button>
          <button 
            onClick={() => setSelectedDate('today')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${selectedDate === 'today' ? 'bg-emerald-600 text-white shadow-md' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            {lang === 'si' ? 'අද දින' : 'Today'}
          </button>
          <input 
            type="date"
            value={selectedDate !== 'all' && selectedDate !== 'today' ? selectedDate : ''}
            onChange={e => setSelectedDate(e.target.value || 'all')}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-500 shadow-sm"
          />
        </div>
      </div>

      {/* Profit & Loss Breakdown Card */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl font-bold text-sm">📊</span>
            <h4 className="font-bold text-base sm:text-lg text-slate-100">
              {lang === 'si' ? 'ලාභය සහ වියදම් සාරාංශය (Profit & Loss Summary)' : 'Profit & Loss Summary'}
            </h4>
          </div>
          <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-full w-fit">
            {selectedDate === 'all' ? (lang === 'si' ? 'සියලු කාලයම' : 'All Time') : selectedDate === 'today' ? (lang === 'si' ? 'අද දින' : 'Today') : selectedDate}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
              {lang === 'si' ? 'අලෙවි ලාභය (Gross Profit)' : 'Gross Profit'}
            </span>
            <div className="text-2xl font-black text-emerald-400">Rs {computedGrossProfit.toLocaleString()}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {lang === 'si' ? 'බිල්පත් අලෙවි ලාභයේ එකතුව' : 'Total sales gross profit'}
            </span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60">
            <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider block mb-1">
              {lang === 'si' ? 'සෙට්ල්මන්ට් වියදම් (Deducted)' : 'Deducted Expenses'}
            </span>
            <div className="text-2xl font-black text-rose-400">- Rs {computedExpensesTotal.toLocaleString()}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {lang === 'si' ? 'ලාභයෙන් අඩු කළ වියදම්' : 'Expenses deducted from profit'}
            </span>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/80 to-teal-900/80 p-4 rounded-2xl border border-emerald-500/40">
            <span className="text-xs font-semibold text-emerald-200 uppercase tracking-wider block mb-1">
              {lang === 'si' ? 'ශුද්ධ ලාභය (Net Profit)' : 'Net Profit'}
            </span>
            <div className="text-2xl font-black text-white">Rs {computedNetProfit.toLocaleString()}</div>
            <span className="text-[11px] text-emerald-200/80 mt-1 block font-medium">
              = {lang === 'si' ? 'අලෙවි ලාභය - සෙට්ල්මන්ට් වියදම්' : 'Gross Profit - Expenses'}
            </span>
          </div>

          <div className="bg-amber-950/40 p-4 rounded-2xl border border-amber-500/40">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block mb-1">
              {lang === 'si' ? 'වෙනත් වියදම් (Non-Deducted)' : 'Other Expenses'}
            </span>
            <div className="text-2xl font-black text-amber-300">Rs {computedOtherExpensesTotal.toLocaleString()}</div>
            <span className="text-[11px] text-amber-200/70 mt-1 block font-medium">
              {lang === 'si' ? 'සෙට්ල්මන්ට් නොවන වෙනත් වියදම්' : 'Non-deducted expenses'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{lang === 'si' ? 'මුළු එකතු වූ මුදල්' : 'Total Cash Collected'}</p>
            <h4 className="text-2xl font-black text-emerald-600">Rs {totalIn.toLocaleString()}</h4>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
             <ArrowUpRight size={26} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{lang === 'si' ? 'මුළු වියදම් / භාරදීම්' : 'Total Outflows'}</p>
            <h4 className="text-2xl font-black text-rose-600">Rs {totalOut.toLocaleString()}</h4>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
             <ArrowDownLeft size={26} />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-orange-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">{lang === 'si' ? 'අනුමැතිය සඳහා' : 'Pending Handover'}</p>
            <h4 className="text-2xl font-black text-orange-600">Rs {pendingHandover.toLocaleString()}</h4>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center">
             <AlertTriangle size={26} />
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-6 rounded-3xl shadow-lg relative overflow-hidden flex items-center justify-between text-white">
          <div className="z-10">
            <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider mb-1">{lang === 'si' ? 'භාර දිය හැකි ශේෂය' : 'Available to Handover'}</p>
            <h4 className="text-2xl font-black">Rs {availableToHandover.toLocaleString()}</h4>
          </div>
          <div className="z-10 w-12 h-12 rounded-2xl bg-white/20 text-white flex items-center justify-center backdrop-blur-sm">
             <Wallet size={26} />
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
        </div>
      </div>

      {/* Handover Section */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <h4 className="text-xl font-bold font-display text-slate-800 mb-2">{lang === 'si' ? 'ඇඩ්මින්ට මුදල් භාරදීම' : 'Handover Cash to Admin'}</h4>
        <p className="text-xs text-slate-400 mb-6">{lang === 'si' ? 'එකතු කරගත් මුදල් ඇඩ්මින් වෙත භාරදීමට අනුමැතිය සඳහා යොමු කරන්න.' : 'Submit collected cash handover for Admin verification & approval.'}</p>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setHandoverAmount(availableToHandover.toString())} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all">
            {lang === 'si' ? 'සම්පූර්ණ ශේෂය' : 'Full Balance'} (Rs {availableToHandover.toLocaleString()})
          </button>
          {[5000, 10000, 20000, 50000].map(amt => (
            amt <= availableToHandover && (
              <button key={amt} onClick={() => setHandoverAmount(amt.toString())} className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold transition-all">
                Rs {amt.toLocaleString()}
              </button>
            )
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <input 
            type="number" 
            placeholder={lang === 'si' ? "භාර දෙන මුදල (රු.)" : "Amount to Handover (LKR)"}
            value={handoverAmount}
            onChange={e => setHandoverAmount(e.target.value)}
            className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 ring-blue-500/20 text-slate-800 font-bold transition-all text-lg"
          />
          <button 
            onClick={handleHandover}
            className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Send size={20} /> {lang === 'si' ? 'අනුමැතිය ඉල්ලන්න' : 'Request Handover'}
          </button>
        </div>
      </div>

      {/* Transaction History / Journal Log */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h4 className="text-xl font-bold font-display text-slate-800">{lang === 'si' ? 'මුදල් පොතේ සටහන්' : 'Cash Book Ledger Log'}</h4>
            <p className="text-xs text-slate-400 mt-0.5">{lang === 'si' ? 'සියලු ලැබීම් සහ පිටවීම් සජීවී වාර්තාව' : 'Real-time record of all cash inflows and outflows'}</p>
          </div>
          <div className="relative min-w-[240px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder={lang === 'si' ? "සටහන් සොයන්න..." : "Search transactions..."}
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {displayEntries.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl">
            <FileText size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="font-semibold">{lang === 'si' ? 'තවම මුදල් පොතේ සටහන් කිසිවක් නැත' : 'No cash book entries logged yet.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                  <th className="py-3 px-4">{lang === 'si' ? 'දිනය සහ වේලාව' : 'Date & Time'}</th>
                  <th className="py-3 px-4">{lang === 'si' ? 'විස්තරය' : 'Description'}</th>
                  <th className="py-3 px-4">{lang === 'si' ? 'වර්ගය' : 'Category'}</th>
                  <th className="py-3 px-4 text-right">{lang === 'si' ? 'ලැබීම් (+)' : 'Inflow (+)'}</th>
                  <th className="py-3 px-4 text-right">{lang === 'si' ? 'පිටවීම් (-)' : 'Outflow (-)'}</th>
                  <th className="py-3 px-4 text-right">{lang === 'si' ? 'ශේෂය (LKR)' : 'Running Balance'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {displayEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-500 whitespace-nowrap">{entry.dateStr}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">{entry.desc}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${entry.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                        {entry.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                      {entry.type === 'IN' ? `+ Rs ${entry.amount.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-rose-600">
                      {entry.type === 'OUT' ? `- Rs ${entry.amount.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 bg-slate-50/50">
                      Rs {entry.runningBalance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReturnStockTab({ t, inventory, setInventory, currentRep, setPopup }: { t: (key: string) => string, inventory: any[], setInventory: any, currentRep: SystemUser, setPopup: any }) {
  const [goodStockHandoverQty, setGoodStockHandoverQty] = useState<Record<string, string>>({});
  const returnItems = inventory.filter(i => (i.returnStock || 0) > 0);

  const handleGoodStockHandover = () => {
    const handoverData: any[] = [];
    Object.entries(goodStockHandoverQty).forEach(([itemId, qtyStr]) => {
      const qty = parseFloat(qtyStr);
      if (qty > 0) {
        const item = inventory.find(i => String(i.id) === String(itemId));
        if (item && (item.myStock || 0) >= qty) {
          handoverData.push({
            id: item.id,
            name: item.name,
            qty: qty,
            supplier: item.supplier
          });
        }
      }
    });

    if (handoverData.length === 0) {
      alert("Please enter valid quantities to handover.");
      return;
    }

    const handoverRequest: AIActionRequest = {
      id: 'good_return_' + Date.now(),
      repId: currentRep?.id || 'unknown',
      repName: currentRep?.name || 'Unknown Rep',
      actionType: 'rep_good_stock_handover',
      description: `Good stock handover: ${handoverData.map(i => `${i.qty} x ${i.name}`).join(', ')}`,
      payload: { items: handoverData },
      status: 'Approved' as any, // Mark as approved directly
      timestamp: Date.now()
    };

    const allReqs = getAIActionRequests();
    saveAIActionRequests([...allReqs, handoverRequest]);

    // Deduct stock locally immediately
    const newInventory = [...inventory];
    handoverData.forEach(hd => {
      const idx = newInventory.findIndex(i => String(i.id) === String(hd.id));
      if (idx > -1) {
        newInventory[idx] = { ...newInventory[idx], myStock: (newInventory[idx].myStock || 0) - hd.qty };
      }
    });

    setInventory(newInventory);
    setGoodStockHandoverQty({});

    // Add to Admin Inventory directly
    const adminInventory = getAdminInventory();
    handoverData.forEach(hd => {
      const existingIdx = adminInventory.findIndex(i => String(i.id) === String(hd.id));
      if (existingIdx >= 0) {
        adminInventory[existingIdx].stock += hd.qty;
        addToSyncQueue({ table: 'inventory', action: 'update', data: adminInventory[existingIdx] });
      } else {
        const newItem = {
          id: hd.id,
          name: hd.name,
          costPrice: 0,
          minPrice: 0,
          maxPrice: 0,
          stock: hd.qty,
          supplier: hd.supplier
        };
        adminInventory.push(newItem);
        addToSyncQueue({ table: 'inventory', action: 'insert', data: newItem });
      }
    });
    saveAdminInventory(adminInventory);

    setPopup({
      show: true,
      type: 'success',
      title: 'තොග භාරදීම සාර්ථකයි (Handover Successful)',
      message: 'හොඳ තොග ගබඩාවට සාර්ථකව එකතු කරන ලදී. (Good Stock added to main store successfully)',
      items: []
    });
  };

  const handleReturnHandover = () => {
    if (returnItems.length === 0) {
      alert("No returns to handover.");
      return;
    }

    const handoverData = returnItems.map(i => ({
      id: i.id,
      name: i.name,
      qty: i.returnStock,
      supplier: i.supplier
    }));

    const handoverRequest: AIActionRequest = {
      id: 'return_' + Date.now(),
      repId: currentRep?.id || 'unknown',
      repName: currentRep?.name || 'Unknown Rep',
      actionType: 'rep_return_handover',
      description: `Return stock handover: ${handoverData.map(i => `${i.qty} x ${i.name}`).join(', ')}`,
      payload: { items: handoverData },
      status: 'Pending', // Mark as pending for admin approval
      timestamp: Date.now()
    };

    const allReqs = getAIActionRequests();
    saveAIActionRequests([...allReqs, handoverRequest]);

    // Deduct return stock locally for immediate visual feedback
    const newInventory = inventory.map(i => ({ ...i, returnStock: 0 }));
    setInventory(newInventory);

    setPopup({
      show: true,
      type: 'success',
      title: 'අනුමැතිය සඳහා යොමු කරන ලදී (Sent for Approval)',
      message: 'ආපසු තොග (Return Stock) ඇඩ්මින්ගේ අනුමැතිය සඳහා යොමු කරන ලදී.',
      items: handoverData.map(i => ({ name: i.name, qty: i.qty }))
    });
  };

  return (
    <div className="space-y-8 pb-32">
      <div>
        <h3 className="font-display text-4xl font-bold text-slate-800 tracking-tight">බඩු භාරදීම (Return Stock)</h3>
        <p className="text-slate-500 mt-1">Return excess good stock or collected damaged returns to the main store.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Good Stock Return Section */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-display text-xl font-bold text-slate-800">Return Good Stock</h4>
          </div>
          <p className="text-sm text-slate-500 mb-6">Hand over remaining good items from your vehicle back to the main warehouse.</p>
          
          <div className="space-y-4">
            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
              {inventory.map(item => (
                <div key={`gs-${item.id}`} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex-1 pr-4">
                    <div className="font-bold text-slate-700 text-sm md:text-base leading-tight mb-1">{item.name}</div>
                    <div className="text-xs text-slate-500">Available in Vehicle: <span className="font-bold text-blue-600 px-2 py-0.5 bg-blue-50 rounded-md">{item.myStock || 0}</span></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      min="0" 
                      max={item.myStock || 0}
                      value={goodStockHandoverQty[item.id] || ''}
                      onChange={(e) => setGoodStockHandoverQty({...goodStockHandoverQty, [item.id]: e.target.value})}
                      className="w-20 p-3 border border-blue-200 rounded-xl focus:outline-none focus:border-blue-500 text-center text-base font-bold bg-white"
                      placeholder="Qty"
                    />
                  </div>
                </div>
              ))}
            </div>
            
            <button 
              onClick={handleGoodStockHandover}
              disabled={Object.values(goodStockHandoverQty).filter(v => parseFloat(v) > 0).length === 0}
              className="w-full bg-blue-600 disabled:bg-slate-300 text-white p-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center mt-4"
            >
              <ArrowDown size={20} className="mr-2" /> Submit Good Stock Return
            </button>
          </div>
        </div>

        {/* Damage / Returns Section */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-display text-xl font-bold text-slate-800">Return Damaged/Collected Items</h4>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${returnItems.length > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
              {returnItems.length} items
            </span>
          </div>
          <p className="text-sm text-slate-500 mb-6">Hand over items collected from customers as returns/damages back to the main warehouse.</p>
          
          {returnItems.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl flex flex-col items-center">
               <Undo2 size={40} className="text-slate-300 mb-3" />
               <p>No returns collected today to handover.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                {returnItems.map(item => (
                  <div key={item.id} className="flex justify-between items-center p-4 bg-orange-50/50 rounded-2xl border border-orange-100">
                    <div>
                      <div className="font-bold text-slate-800 text-sm md:text-base leading-tight">{item.name}</div>
                      <div className="text-xs text-orange-600/70 font-semibold uppercase tracking-wide mt-1">Collected Return</div>
                    </div>
                    <div className="font-mono text-xl font-black text-orange-600 bg-white px-4 py-1 rounded-xl shadow-sm border border-orange-100">
                       {item.returnStock}
                    </div>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={handleReturnHandover}
                className="w-full bg-orange-600 text-white p-4 rounded-xl font-bold hover:bg-orange-700 shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center mt-4"
              >
                <ArrowDown size={20} className="mr-2" /> Handover Returns to Main Store
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

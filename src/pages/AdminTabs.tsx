import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, Users, DollarSign, Package, AlertTriangle, ShieldCheck, 
  Plus, Edit2, Trash2, ArrowUpRight, ArrowDownLeft, FileText, Check, 
  X, HelpCircle, Save, Settings, Play, CloudLightning, Info, ShoppingCart, Truck, Search, Database, RefreshCw, Upload, Zap, MessageSquare,
  Printer, RotateCcw, Building2
} from 'lucide-react';
import { 
  getActiveOrgId, getUsers, saveUsers, SystemUser, getRepInventory, saveRepInventory, 
  getAttendanceRecords, saveAttendanceRecords, getAIActionRequests, saveAIActionRequests, 
  getAdminInventory, saveAdminInventory, getMainReturnStock, saveMainReturnStock, 
  getOrganizationSettings, saveOrganizationSettings, OrganizationSettings, AIActionRequest, deleteSystemUser,
  formatLastOnline, purgeAppCache, getStorageUsageKB, recalculateCustomerDebtChain, persistSalesAndCustomers
} from '../lib/store';
import { generateGeminiContent } from '../lib/gemini';
import { formatSinhalaDate } from '../i18n';
import { fetchTableData, addToSyncQueue } from '../lib/sync';
import { sendTopPhoneNotification } from '../lib/notificationService';
import { DailySettlementsTab } from '../components/DailySettlementsTab';
import { getNetworkSignalLogs, NetworkSignalLog } from '../lib/networkLogger';
import { FirebaseQuotaWidget } from '../components/FirebaseQuotaWidget';

// --- 1. OVERVIEW TAB ---
export function OverviewTab({ repsList, isGhostMode }: { repsList: any[], isGhostMode: boolean }) {
  const orgId = getActiveOrgId();
  const [items, setItems] = useState<any[]>(() => getAdminInventory());
  const [requests, setRequests] = useState<any[]>(() => getAIActionRequests());
  const [attendance, setAttendance] = useState<any[]>(() => getAttendanceRecords());

  const [sales, setSales] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || 
                     localStorage.getItem(`bizflow_MYM-BIZFLOW_sales_v1`) || 
                     localStorage.getItem(`bizflow_default_sales_v1`) || 
                     localStorage.getItem('bizflow_sales_v1');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [expenses, setExpenses] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || 
                     localStorage.getItem(`bizflow_MYM-BIZFLOW_expenses_v1`) || 
                     localStorage.getItem(`bizflow_default_expenses_v1`) || 
                     localStorage.getItem('bizflow_expenses_v1');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [signalLogs, setSignalLogs] = useState<NetworkSignalLog[]>(() => getNetworkSignalLogs());
  const [signalFilterRep, setSignalFilterRep] = useState<string>('all');
  const [signalFilterDate, setSignalFilterDate] = useState<string>('');

  useEffect(() => {
    setSignalLogs(getNetworkSignalLogs(signalFilterRep === 'all' ? undefined : signalFilterRep, signalFilterDate || undefined));
  }, [signalFilterRep, signalFilterDate]);

  useEffect(() => {
    fetchTableData('sales').then(data => {
      if (data && Array.isArray(data)) setSales(data);
    });
    fetchTableData('expenses').then(data => {
      if (data && Array.isArray(data)) setExpenses(data);
    });
    fetchTableData('network_logs').then(data => {
      if (data && Array.isArray(data)) {
        // Merge with local safely
        try {
          const key = `bizflow_${orgId}_network_logs_v1`;
          const local: NetworkSignalLog[] = JSON.parse(localStorage.getItem(key) || '[]');
          const map = new Map<string, NetworkSignalLog>();
          [...local, ...data].forEach(l => map.set(l.id, l));
          const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);
          try {
            localStorage.setItem(key, JSON.stringify(merged));
          } catch (e) {
            try {
              localStorage.setItem(key, JSON.stringify(merged.slice(0, 10)));
            } catch (_) {}
          }
          setSignalLogs(getNetworkSignalLogs(signalFilterRep === 'all' ? undefined : signalFilterRep, signalFilterDate || undefined));
        } catch (e) {}
      }
    });

    const handleSync = (e: any) => {
      const table = e.detail?.table;
      if (table === 'sales') {
        if (e.detail?.data && Array.isArray(e.detail.data)) {
          setSales(e.detail.data);
        } else {
          const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
          if (stored) setSales(JSON.parse(stored));
        }
      } else if (table === 'expenses') {
        if (e.detail?.data && Array.isArray(e.detail.data)) {
          setExpenses(e.detail.data);
        } else {
          const stored = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1');
          if (stored) setExpenses(JSON.parse(stored));
        }
      } else if (table === 'inventory') {
        setItems(getAdminInventory());
      } else if (table === 'approvals') {
        setRequests(getAIActionRequests());
      }
    };
    window.addEventListener('bizflow_sync', handleSync);
    window.addEventListener('bizflow_sales_updated', handleSync);
    return () => {
      window.removeEventListener('bizflow_sync', handleSync);
      window.removeEventListener('bizflow_sales_updated', handleSync);
    };
  }, [orgId]);

  const [breakdown, setBreakdown] = useState<{
    title: string;
    grossProfit: number;
    expensesAmount: number;
    netProfit: number;
    salesDetails: any[];
    expenseDetails: any[];
  } | null>(null);

  const totalProducts = items.length;
  const outOfStock = items.filter(i => i.stock <= 0).length;
  const pendingApprovals = requests.filter(r => r.status === 'Pending').length;
  const activeReps = repsList.length;

  const todayStr = new Date().toLocaleDateString();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Map admin items for quick costPrice fallback
  const adminCostMap = new Map<string, number>();
  items.forEach(i => {
    if (i && i.id) adminCostMap.set(String(i.id), Number(i.costPrice) || Number(i.maxPrice) || 0);
  });

  let todayGrossProfit = 0;
  let monthlyGrossProfit = 0;
  let todaySalesTotal = 0;
  let monthlySalesTotal = 0;

  const now = new Date();

  sales.forEach(s => {
    if (s.status === 'cancelled' || s.isCancelled) return;
    if (s.mode && s.mode !== 'sale' && s.mode !== 'credit') return;

    let saleDate = new Date();
    if (s.createdAt) {
      saleDate = new Date(s.createdAt);
    } else if (s.date) {
      saleDate = new Date(s.date);
    }

    if (isNaN(saleDate.getTime())) saleDate = new Date();

    const isToday = saleDate.getFullYear() === now.getFullYear() &&
                    saleDate.getMonth() === now.getMonth() &&
                    saleDate.getDate() === now.getDate();
    const isThisMonth = saleDate.getFullYear() === now.getFullYear() &&
                       saleDate.getMonth() === now.getMonth();

    let grossProfit = 0;
    let saleTotal = Number(s.total || 0);
    (s.items || []).forEach((item: any) => {
      const sellPrice = Number(item.price) || 0;
      const costPrice = (item.costPrice !== undefined && item.costPrice !== null && Number(item.costPrice) > 0)
        ? Number(item.costPrice)
        : (adminCostMap.get(String(item.id)) || 0);
      const qty = Number(item.qty) || 0;
      if (!item.isReturn) {
         grossProfit += (sellPrice - costPrice) * qty;
      }
    });

    if (isToday) {
      todayGrossProfit += grossProfit;
      todaySalesTotal += saleTotal;
    }
    if (isThisMonth) {
      monthlyGrossProfit += grossProfit;
      monthlySalesTotal += saleTotal;
    }
  });

  let todayExpenses = 0;
  let todayOtherExpenses = 0;
  let monthlyExpenses = 0;
  let monthlyOtherExpenses = 0;

  expenses.forEach(e => {
    const rawDate = e.createdAt || e.date;
    if (!rawDate) return;
    const expDate = new Date(rawDate);
    if (isNaN(expDate.getTime())) return;

    const isToday = expDate.getFullYear() === now.getFullYear() &&
                    expDate.getMonth() === now.getMonth() &&
                    expDate.getDate() === now.getDate();
    const isThisMonth = expDate.getFullYear() === now.getFullYear() &&
                       expDate.getMonth() === now.getMonth();

    const amt = Number(e.amount) || 0;
    const isDeductible = e.deductFromSettlement !== false;

    if (isToday) {
      if (isDeductible) todayExpenses += amt;
      else todayOtherExpenses += amt;
    }
    if (isThisMonth) {
      if (isDeductible) monthlyExpenses += amt;
      else monthlyOtherExpenses += amt;
    }
  });

  const todayNetProfit = todayGrossProfit - todayExpenses;
  const monthlyNetProfit = monthlyGrossProfit - monthlyExpenses;

  const todayProfitMargin = todaySalesTotal > 0 ? ((todayNetProfit / todaySalesTotal) * 100).toFixed(1) : '0';
  const monthlyProfitMargin = monthlySalesTotal > 0 ? ((monthlyNetProfit / monthlySalesTotal) * 100).toFixed(1) : '0';
  const todayGrossMargin = todaySalesTotal > 0 ? ((todayGrossProfit / todaySalesTotal) * 100).toFixed(1) : '0';
  const monthlyGrossMargin = monthlySalesTotal > 0 ? ((monthlyGrossProfit / monthlySalesTotal) * 100).toFixed(1) : '0';

  const handleShowTodayBreakdown = () => {
    setBreakdown({
      title: "Today's Profit Calculation",
      grossProfit: todayGrossProfit,
      expensesAmount: todayExpenses,
      netProfit: todayNetProfit,
      salesDetails: sales.filter(s => {
        if (s.status === 'cancelled' || s.isCancelled) return false;
        if (s.mode && s.mode !== 'sale' && s.mode !== 'credit') return false;
        const d = new Date(s.createdAt || s.date || Date.now());
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      }).map(s => {
        let gp = 0;
        (s.items || []).forEach((item: any) => {
          if (!item.isReturn) {
            const sellPrice = Number(item.price) || 0;
            const costPrice = (item.costPrice !== undefined && item.costPrice !== null && Number(item.costPrice) > 0)
              ? Number(item.costPrice)
              : (adminCostMap.get(String(item.id)) || 0);
            gp += (sellPrice - costPrice) * (Number(item.qty) || 0);
          }
        });
        return { ...s, calculatedGrossProfit: gp };
      }),
      expenseDetails: expenses.filter(e => {
        const d = e.date ? new Date(e.date) : new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      })
    });
  };

  const handleShowMonthlyBreakdown = () => {
    setBreakdown({
      title: "Monthly Profit Calculation",
      grossProfit: monthlyGrossProfit,
      expensesAmount: monthlyExpenses,
      netProfit: monthlyNetProfit,
      salesDetails: sales.filter(s => {
        if (s.status === 'cancelled' || s.isCancelled) return false;
        if (s.mode && s.mode !== 'sale' && s.mode !== 'credit') return false;
        const d = new Date(s.createdAt || s.date || Date.now());
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).map(s => {
        let gp = 0;
        (s.items || []).forEach((item: any) => {
          if (!item.isReturn) {
            const sellPrice = Number(item.price) || 0;
            const costPrice = (item.costPrice !== undefined && item.costPrice !== null && Number(item.costPrice) > 0)
              ? Number(item.costPrice)
              : (adminCostMap.get(String(item.id)) || 0);
            gp += (sellPrice - costPrice) * (Number(item.qty) || 0);
          }
        });
        return { ...s, calculatedGrossProfit: gp };
      }),
      expenseDetails: expenses.filter(e => {
        const d = e.date ? new Date(e.date) : new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
    });
  };

  const weeklyActivityData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result: { name: string; sales: number; credit: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayName = days[d.getDay()];
      
      let daySales = 0;
      let dayCredit = 0;
      
      sales.forEach(s => {
        if (s.status === 'cancelled' || s.isCancelled) return;
        const rawDate = s.createdAt || s.date;
        if (!rawDate) return;
        const sDate = new Date(rawDate);
        if (isNaN(sDate.getTime())) return;

        if (sDate.getFullYear() === d.getFullYear() && sDate.getMonth() === d.getMonth() && sDate.getDate() === d.getDate()) {
          const total = Number(s.total) || 0;
          if (s.mode === 'credit' || s.paymentMethod === 'credit' || s.isCredit) {
            dayCredit += total;
          } else {
            daySales += total;
          }
        }
      });

      result.push({
        name: dayName,
        sales: daySales,
        credit: dayCredit
      });
    }
    return result;
  }, [sales]);

  return (
    <div className="space-y-6 relative">
      {breakdown && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-xl text-slate-800">{breakdown.title}</h3>
              <button onClick={() => setBreakdown(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase">Gross Profit</div>
                  <div className="text-lg font-black text-emerald-600">Rs {breakdown.grossProfit.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase">Expenses</div>
                  <div className="text-lg font-black text-rose-600">- Rs {breakdown.expensesAmount.toLocaleString()}</div>
                </div>
                <div className="border-l border-slate-200 pl-4">
                  <div className="text-xs font-bold text-slate-500 uppercase">Net Profit</div>
                  <div className="text-xl font-black text-blue-600">Rs {breakdown.netProfit.toLocaleString()}</div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-500" />
                  Sales Contributing to Gross Profit ({breakdown.salesDetails.length})
                </h4>
                {breakdown.salesDetails.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No sales recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {breakdown.salesDetails.map((s, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl">
                        <div>
                          <div className="font-semibold text-sm text-slate-800">{s.id}</div>
                          <div className="text-xs text-slate-500">{new Date(s.createdAt || s.date).toLocaleString()} • {s.repName}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm text-emerald-600">+ Rs {s.calculatedGrossProfit.toLocaleString()}</div>
                          <div className="text-xs text-slate-400">Items: {s.items?.length || 0}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <ArrowDownLeft size={16} className="text-rose-500" />
                  Deducted Expenses ({breakdown.expenseDetails.length})
                </h4>
                {breakdown.expenseDetails.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No expenses recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {breakdown.expenseDetails.map((e, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl">
                        <div>
                          <div className="font-semibold text-sm text-slate-800">{e.desc || e.description || 'Expense'}</div>
                          <div className="text-xs text-slate-500">{new Date(e.date).toLocaleString()}</div>
                        </div>
                        <div className="font-bold text-sm text-rose-600">- Rs {Number(e.amount).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setBreakdown(null)} className="px-6 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700">Close</button>
            </div>
          </div>
        </div>
      )}

      <FirebaseQuotaWidget compact={true} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div 
          onClick={handleShowTodayBreakdown}
          className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 rounded-2xl shadow-lg text-white flex items-center justify-between cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all"
        >
          <div>
            <span className="text-emerald-100 text-sm font-semibold uppercase tracking-wider">Today's Net Profit</span>
            <div className="text-sm text-emerald-200 mb-1 flex flex-wrap items-center gap-1.5">
              <span>(Gross: Rs {todayGrossProfit.toLocaleString()} - Exp: Rs {todayExpenses.toLocaleString()})</span>
              {todayOtherExpenses > 0 && (
                <span className="bg-amber-400 text-amber-950 font-bold px-2 py-0.5 rounded text-[11px] shadow-sm">
                  වෙනත් වියදම් (නොඅඩු කළ): Rs {todayOtherExpenses.toLocaleString()}
                </span>
              )}
            </div>
            <div className="text-xs text-emerald-100 mb-2 font-medium bg-emerald-800/40 px-2.5 py-1 rounded-lg inline-block">
              📊 විකුණුම් වලින් ලාභ ප්‍රතිශතය (Profit % on Sales): <span className="font-bold text-white">{todayProfitMargin}%</span> (Gross GP: {todayGrossMargin}%) | Total Sales: Rs {todaySalesTotal.toLocaleString()}
            </div>
            <h3 className="text-4xl font-black mt-1">Rs {todayNetProfit.toLocaleString()}</h3>
          </div>
          <div className="bg-white/20 p-4 rounded-xl backdrop-blur-sm">
            <DollarSign size={32} />
          </div>
        </div>

        <div 
          onClick={handleShowMonthlyBreakdown}
          className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-2xl shadow-lg text-white flex items-center justify-between cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all"
        >
          <div>
            <span className="text-blue-100 text-sm font-semibold uppercase tracking-wider">Monthly Net Profit</span>
            <div className="text-sm text-blue-200 mb-1 flex flex-wrap items-center gap-1.5">
              <span>(Gross: Rs {monthlyGrossProfit.toLocaleString()} - Exp: Rs {monthlyExpenses.toLocaleString()})</span>
              {monthlyOtherExpenses > 0 && (
                <span className="bg-amber-400 text-amber-950 font-bold px-2 py-0.5 rounded text-[11px] shadow-sm">
                  වෙනත් වියදම් (නොඅඩු කළ): Rs {monthlyOtherExpenses.toLocaleString()}
                </span>
              )}
            </div>
            <div className="text-xs text-blue-100 mb-2 font-medium bg-blue-800/40 px-2.5 py-1 rounded-lg inline-block">
              📊 විකුණුම් වලින් ලාභ ප්‍රතිශතය (Profit % on Sales): <span className="font-bold text-white">{monthlyProfitMargin}%</span> (Gross GP: {monthlyGrossMargin}%) | Total Sales: Rs {monthlySalesTotal.toLocaleString()}
            </div>
            <h3 className="text-4xl font-black mt-1">Rs {monthlyNetProfit.toLocaleString()}</h3>
          </div>
          <div className="bg-white/20 p-4 rounded-xl backdrop-blur-sm">
            <TrendingUp size={32} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Total Products</span>
            <h3 className="text-3xl font-bold text-slate-800 mt-1">{totalProducts}</h3>
          </div>
          <div className="bg-blue-50 text-blue-600 p-4 rounded-xl">
            <Package size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Out of Stock</span>
            <h3 className="text-3xl font-bold text-rose-600 mt-1">{outOfStock}</h3>
          </div>
          <div className="bg-rose-50 text-rose-600 p-4 rounded-xl">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Pending Approvals</span>
            <h3 className="text-3xl font-bold text-amber-600 mt-1">{pendingApprovals}</h3>
          </div>
          <div className="bg-amber-50 text-amber-600 p-4 rounded-xl">
            <ShieldCheck size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Active Reps</span>
            <h3 className="text-3xl font-bold text-emerald-600 mt-1">{activeReps}</h3>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl">
            <Users size={24} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
            <TrendingUp size={18} className="mr-2 text-blue-500" /> Weekly Activity Overview
          </h4>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyActivityData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip />
                <Area type="monotone" dataKey="sales" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSales)" name="Sales (Rs)" />
                <Line type="monotone" dataKey="credit" stroke="#f59e0b" name="Credit Issued" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-lg font-bold text-slate-800 mb-4">Quick Stats & Status</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                <span className="text-sm text-slate-500">Ghost Mode Status</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${isGhostMode ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                  {isGhostMode ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                <span className="text-sm text-slate-500">Database Connection</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                  ONLINE
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Sync Status</span>
                <span className="text-sm text-slate-700 font-bold">Synchronized</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Reps Last Online Activity</span>
              {repsList.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No reps registered</p>
              ) : (
                repsList.map(rep => {
                  const status = formatLastOnline(rep.lastOnline);
                  return (
                    <div key={rep.id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${status.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                        {rep.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${status.badgeColor}`}>
                        {status.text}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 mt-6">
            <p className="text-xs text-slate-400 font-medium leading-relaxed">
              * Analytics are calculated locally and backed up dynamically to Firestore. Ensure internet connectivity to synchronize multi-rep updates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 2. TRENDS TAB ---
export function TrendsTab() {
  const data = [
    { name: 'Jan', Sales: 4000, Returns: 240, Expenses: 1200 },
    { name: 'Feb', Sales: 5000, Returns: 198, Expenses: 1300 },
    { name: 'Mar', Sales: 6200, Returns: 300, Expenses: 1500 },
    { name: 'Apr', Sales: 4800, Returns: 450, Expenses: 1100 },
    { name: 'May', Sales: 7100, Returns: 220, Expenses: 1800 },
    { name: 'Jun', Sales: 8500, Returns: 150, Expenses: 2100 },
  ];

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
      <div>
        <h3 className="font-display text-2xl font-bold text-slate-800">Business Trends Analytics</h3>
        <p className="text-slate-500 text-sm mt-0.5">Visualize sales growth, return margins, and overhead expenses over the last 6 months.</p>
      </div>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip />
            <Legend />
            <Bar dataKey="Sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Returns" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Expenses" fill="#64748b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --- 4. INVENTORY TAB ---
export function InventoryTab({ items, setItems, pendingRequests, setPendingRequests, suppliers }: { items: any[], setItems: any, pendingRequests: any[], setPendingRequests: any, suppliers: any[] }) {
  const [confirmItemId, setConfirmItemId] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);

  // New product inputs
  const [name, setName] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stock, setStock] = useState('');
  const [supplier, setSupplier] = useState('');

  // State for Load Goods Modal
  const [loadingRep, setLoadingRep] = useState<SystemUser | null>(null);
  const [loadQuantities, setLoadQuantities] = useState<Record<string, string>>({});
  const [loadSearchQuery, setLoadSearchQuery] = useState('');
  const [loadMethod, setLoadMethod] = useState<'from_main' | 'direct'>('from_main');
  const [loadArea, setLoadArea] = useState('Galewela');
  const [doubleLoadConfirm, setDoubleLoadConfirm] = useState<any | null>(null);
  const [isSubmittingLoad, setIsSubmittingLoad] = useState(false);
  const reps = getUsers().filter(u => u.role === 'rep');

  // Galewela Double Load Corrector State
  const [showGalewelaCorrector, setShowGalewelaCorrector] = useState(false);
  const [selectedCorrectorRepId, setSelectedCorrectorRepId] = useState<string>('');
  const [correctionMode, setCorrectionMode] = useState<'deduct' | 'final'>('deduct');
  const [deductQuantityMap, setDeductQuantityMap] = useState<Record<string, string>>({});
  const [correctedStockMap, setCorrectedStockMap] = useState<Record<string, string>>({});
  const [restoreExcessToWarehouse, setRestoreExcessToWarehouse] = useState(true);

  const handleOpenGalewelaCorrector = () => {
    const galewelaRep = reps.find(r => r.activeArea === 'Galewela' || (r as any).area === 'Galewela') || reps[0];
    const repId = galewelaRep ? galewelaRep.id : (reps[0]?.id || '');
    setSelectedCorrectorRepId(repId);
    setCorrectionMode('deduct');
    setDeductQuantityMap({});

    if (repId) {
      const currentInv = getRepInventory(repId) || [];
      const initMap: Record<string, string> = {};
      currentInv.forEach((i: any) => {
        initMap[String(i.id)] = String(i.myStock || 0);
      });
      setCorrectedStockMap(initMap);
    }
    setShowGalewelaCorrector(true);
  };

  const handleSelectCorrectorRep = (repId: string) => {
    setSelectedCorrectorRepId(repId);
    setDeductQuantityMap({});
    const currentInv = getRepInventory(repId) || [];
    const initMap: Record<string, string> = {};
    currentInv.forEach((i: any) => {
      initMap[String(i.id)] = String(i.myStock || 0);
    });
    setCorrectedStockMap(initMap);
  };

  const handleAutoFillFromRecentLoad = (loadItems: any[]) => {
    if (!loadItems || !Array.isArray(loadItems)) return;
    const newDeductMap: Record<string, string> = { ...deductQuantityMap };
    loadItems.forEach((loaded: any) => {
      if (loaded.id && loaded.qty) {
        newDeductMap[String(loaded.id)] = String(loaded.qty);
      }
    });
    setDeductQuantityMap(newDeductMap);
    setCorrectionMode('deduct');
    alert("තෝරාගත් Load එකේ පටවන ලද භාණ්ඩ ප්‍රමාණයන් ඉවත් කිරීමට (Deduct) සකසන ලදී.");
  };

  const handleSaveGalewelaCorrection = () => {
    const targetRep = reps.find(r => r.id === selectedCorrectorRepId);
    if (!targetRep) {
      alert("කරුණාකර රෙප් කෙනෙකු තෝරන්න.");
      return;
    }

    const currentRepInv = getRepInventory(targetRep.id) || [];
    let updatedRepInv = [...currentRepInv];
    let updatedAdminItems = [...items];
    let totalRestoredQty = 0;
    let modifiedCount = 0;

    items.forEach((masterItem) => {
      const itemIdStr = String(masterItem.id);
      const repItemIdx = updatedRepInv.findIndex(i => String(i.id) === itemIdStr);
      const currentQty = repItemIdx >= 0 ? (updatedRepInv[repItemIdx].myStock || 0) : 0;

      let newQtyVal = currentQty;
      let diff = 0;

      if (correctionMode === 'deduct') {
        const deductVal = parseFloat(deductQuantityMap[itemIdStr] || '0');
        if (!isNaN(deductVal) && deductVal > 0) {
          diff = deductVal;
          newQtyVal = Math.max(0, currentQty - deductVal);
        }
      } else {
        const targetVal = parseFloat(correctedStockMap[itemIdStr] ?? '');
        if (!isNaN(targetVal) && targetVal >= 0) {
          diff = currentQty - targetVal;
          newQtyVal = targetVal;
        }
      }

      if (diff !== 0 && repItemIdx >= 0) {
        updatedRepInv[repItemIdx].myStock = newQtyVal;
        modifiedCount++;

        if (restoreExcessToWarehouse && diff > 0) {
          const adminIdx = updatedAdminItems.findIndex(a => String(a.id) === itemIdStr);
          if (adminIdx >= 0) {
            updatedAdminItems[adminIdx].stock += diff;
            totalRestoredQty += diff;
          }
        }
      }
    });

    if (modifiedCount === 0) {
      alert("කිසිදු භාණ්ඩයක ස්ටොක් වෙනසක් සිදු කර නැත. කරුණාකර ඉවත් කළ යුතු ඩබල් වූ ප්‍රමාණය හෝ අලුත් ස්ටොක් එක ඇතුළත් කරන්න.");
      return;
    }

    saveRepInventory(targetRep.id, updatedRepInv);

    if (restoreExcessToWarehouse && totalRestoredQty > 0) {
      setItems(updatedAdminItems);
      saveAdminInventory(updatedAdminItems);
    }

    const req: AIActionRequest = {
      id: 'galewela_corr_' + Date.now(),
      repId: targetRep.id,
      repName: targetRep.name,
      actionType: 'update_stock',
      description: `[ගලේවෙල ස්ටොක් නිවැරදි කිරීම] ඩබල් වූ තොගය ඉවත් කරන ලදී. (${modifiedCount} items corrected, ${totalRestoredQty} units returned to Main Warehouse)`,
      payload: { area: 'Galewela', totalRestoredQty, repId: targetRep.id },
      status: 'Completed',
      timestamp: Date.now()
    };
    saveAIActionRequests([req, ...getAIActionRequests()]);
    addToSyncQueue({ table: 'aiactions', action: 'insert', data: req });

    setShowGalewelaCorrector(false);
    alert(`✅ ගලේවෙල ස්ටොක් නිවැරදි කිරීම සාර්ථකයි!\n${modifiedCount} ක තොග සකසන ලදී.\n${restoreExcessToWarehouse && totalRestoredQty > 0 ? `වැඩිපුර පටවුන ඒකක ${totalRestoredQty} ක් ප්‍රධාන ගබඩාවට (Main Warehouse) නැවත භාරගන්නා ලදී.` : ''}`);
  };

  const executeLoad = (bypassDoubleCheck = false) => {
    if (!loadingRep || isSubmittingLoad) return;
    setIsSubmittingLoad(true);

    const repInv = getRepInventory(loadingRep.id) || [];
    let newAdminItems = [...items];
    let newRepInv = [...repInv];
    let loadedItems: any[] = [];

    Object.entries(loadQuantities).forEach(([itemId, qtyStr]) => {
      const qty = parseFloat(qtyStr);
      if (qty > 0) {
        // Find in admin items
        const adminItemIndex = newAdminItems.findIndex(i => String(i.id) === String(itemId));
        if (adminItemIndex >= 0) {
          if (loadMethod === 'from_main') {
            // Deduct from admin
            newAdminItems[adminItemIndex].stock = Math.max(0, newAdminItems[adminItemIndex].stock - qty);
          }
          
          loadedItems.push({ id: itemId, name: newAdminItems[adminItemIndex].name, qty });
          
          // Add to rep for the specific area
          const repItemIndex = newRepInv.findIndex(i => String(i.id) === String(itemId) && (i.area === loadArea || (!i.area && !loadArea)));
          if (repItemIndex >= 0) {
            newRepInv[repItemIndex].myStock = (newRepInv[repItemIndex].myStock || 0) + qty;
            newRepInv[repItemIndex].stockInMain = newAdminItems[adminItemIndex].stock;
          } else {
            newRepInv.push({
              ...newAdminItems[adminItemIndex],
              stockInMain: newAdminItems[adminItemIndex].stock,
              myStock: qty,
              returnStock: 0,
              area: loadArea
            });
          }
        }
      }
    });

    if (loadedItems.length === 0) {
      alert("Please enter quantities to load.");
      setIsSubmittingLoad(false);
      return;
    }

    if (loadMethod === 'from_main') {
      setItems(newAdminItems);
      saveAdminInventory(newAdminItems);
    }
    saveRepInventory(loadingRep.id, newRepInv);
    
    // Auto-update the rep's active area to the area we just loaded goods to
    const allUsers = getUsers();
    const repIndex = allUsers.findIndex(u => u.id === loadingRep.id);
    if (repIndex >= 0) {
      allUsers[repIndex].activeArea = loadArea;
      saveUsers(allUsers);
    }

    // Save transaction record
    const loadRequest: AIActionRequest = {
      id: 'load_' + Date.now(),
      repId: loadingRep.id,
      repName: loadingRep.name,
      actionType: 'rep_load',
      description: `Stock ${bypassDoubleCheck ? '[DOUBLE LOAD] ' : ''}loaded by admin to ${loadingRep.name} (${loadMethod === 'from_main' ? 'From Main' : 'Direct'})`,
      payload: { items: loadedItems, doubleLoadApproved: bypassDoubleCheck },
      status: 'Completed',
      timestamp: Date.now()
    };
    const reqs = [loadRequest, ...getAIActionRequests()];
    saveAIActionRequests(reqs);
    addToSyncQueue({ table: 'aiactions', action: 'insert', data: loadRequest });
    addToSyncQueue({ table: 'inventory', action: 'update', data: { repId: loadingRep.id, items: newRepInv } });
    
    let msg = `Successfully loaded ${loadedItems.length} items to ${loadingRep.name} (Area: ${loadArea}).\n`;
    if (bypassDoubleCheck) {
      msg = `⚠️ [ද්විත්ව තොගය පටවන ලදී / Double Load Authorized] ${msg}`;
    }
    alert(msg);
    setLoadingRep(null);
    setLoadQuantities({});
    setDoubleLoadConfirm(null);
    setIsSubmittingLoad(false);
  };

  const handleLoadSubmit = () => {
    if (!loadingRep || isSubmittingLoad) return;

    let loadedItems: any[] = [];
    Object.entries(loadQuantities).forEach(([itemId, qtyStr]) => {
      const qty = parseFloat(qtyStr);
      if (qty > 0) {
        const adminItem = items.find(i => String(i.id) === String(itemId));
        if (adminItem) {
          loadedItems.push({ id: itemId, name: adminItem.name, qty });
        }
      }
    });

    if (loadedItems.length === 0) {
      alert("Please enter quantities to load.");
      return;
    }

    // Check for recent stock load within last 10 minutes for this rep
    const recentReqs = getAIActionRequests().filter(r =>
      r.repId === loadingRep.id &&
      ['rep_load', 'stock_load', 'stock_load_rep'].includes(r.actionType || '') &&
      (Date.now() - Number(r.timestamp || 0)) < 10 * 60 * 1000
    );

    if (recentReqs.length > 0) {
      setDoubleLoadConfirm({
        rep: loadingRep,
        loadedItems,
        recentReq: recentReqs[0]
      });
      return;
    }

    executeLoad(false);
  };

const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !minPrice || !maxPrice || !costPrice) return;

    if (isAddMode) {
      const newItem = {
        id: Date.now(),
        name,
        minPrice: Number(minPrice),
        maxPrice: Number(maxPrice),
        costPrice: Number(costPrice),
        stock: Number(stock) || 0,
        supplier,
        createdAt: new Date().toISOString()
      };
      const updated = [...items, newItem];
      setItems(updated);
      saveAdminInventory(updated);
      setIsAddMode(false);
    } else if (editingItem) {
      const updated = items.map(i => i.id === editingItem.id ? {
        ...i,
        name,
        minPrice: Number(minPrice),
        maxPrice: Number(maxPrice),
        costPrice: Number(costPrice),
        stock: Number(stock) || 0,
        supplier
      } : i);
      setItems(updated);
      saveAdminInventory(updated);
      setEditingItem(null);
    }

    // Reset fields
    setName(''); setMinPrice(''); setMaxPrice(''); setCostPrice(''); setStock(''); setSupplier('');
  };

  const handleEditClick = (item: any) => {
    setEditingItem(item);
    setName(item.name);
    setMinPrice(item.minPrice.toString());
    setMaxPrice(item.maxPrice.toString());
    setCostPrice(item.costPrice.toString());
    setStock(item.stock.toString());
    setSupplier(item.supplier || '');
    setIsAddMode(false);
  };

  const handleDeleteItem = (id: any) => {
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    saveAdminInventory(updated);
    setConfirmItemId(null);
  };

  const filtered = items.filter(i => (i.name || '').toLowerCase().includes((search || '').toLowerCase()));
  const totalStockValue = items.reduce((acc, i) => acc + (i.stock * (i.costPrice || i.maxPrice || 0)), 0);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg flex items-center justify-between">
        <div>
          <div className="text-blue-100 font-bold text-sm mb-1 uppercase tracking-wider">Total Warehouse Value</div>
          <div className="text-4xl font-black">Rs {totalStockValue.toLocaleString()}</div>
        </div>
        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
          <Package size={32} className="text-white" />
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <input 
            type="text" 
            placeholder="Search main stock..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-4 pr-10 focus:outline-none focus:border-blue-500 font-medium text-slate-700 text-sm shadow-sm"
          />
        </div>
        <button 
          onClick={() => { setIsAddMode(true); setEditingItem(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-xl flex items-center shadow-lg shadow-blue-500/15 text-sm transition-all active:scale-95 flex-shrink-0"
        >
          <Plus size={18} className="mr-1.5" /> Add New Product
        </button>
        <button 
          onClick={() => { 
            const rep = reps.length > 0 ? reps[0] : null; 
            if(rep) {
              setLoadingRep(rep);
              setLoadArea(rep.activeArea || 'Mirigama');
            } else alert('No Reps available'); 
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-3 rounded-xl flex items-center shadow-lg shadow-purple-500/15 text-sm transition-all active:scale-95 flex-shrink-0"
        >
          <Truck size={18} className="mr-1.5" /> Load Goods To Rep
        </button>
        <button 
          onClick={handleOpenGalewelaCorrector}
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-3 rounded-xl flex items-center shadow-lg shadow-amber-500/15 text-sm transition-all active:scale-95 flex-shrink-0"
        >
          <RefreshCw size={18} className="mr-1.5" /> 🛠️ ගලේවෙල ස්ටොක් නිවැරදි කරන්න
        </button>
      </div>

      {(isAddMode || editingItem) && (
        <form onSubmit={handleSaveProduct} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3 font-bold text-slate-800 text-lg">
            {isAddMode ? 'Add New Product' : `Edit Product: ${editingItem?.name}`}
          </div>
          <input type="text" placeholder="Product Name" value={name} onChange={e => setName(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" required />
          <input type="number" placeholder="Cost Price (Rs)" value={costPrice} onChange={e => setCostPrice(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" required />
          <input type="number" placeholder="Max Price (Rs)" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" required />
          <input type="number" placeholder="Min Price (Rs)" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" required />
          <input type="number" placeholder="Stock Qty" value={stock} onChange={e => setStock(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" required />
          <select value={supplier} onChange={e => setSupplier(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl">
            <option value="">Select Supplier</option>
            {suppliers.map((s, idx) => <option key={`supplier_${s.id}_${idx}`} value={s.name}>{s.name}</option>)}
          </select>
          <div className="md:col-span-3 flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => { setIsAddMode(false); setEditingItem(null); }} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-slate-700 text-sm">Cancel</button>
            <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm flex items-center"><Save size={16} className="mr-1.5" /> Save Product</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-4 px-6">Product</th>
              <th className="py-4 px-6">Supplier</th>
              <th className="py-4 px-6 text-right">Cost Price</th>
              <th className="py-4 px-6 text-right">Max Price</th>
              <th className="py-4 px-6 text-right">Min Price</th>
              <th className="py-4 px-6 text-center">In Stock</th>
              <th className="py-4 px-6 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
            {filtered.map((item, idx) => (
              <tr key={`item_${item.id}_${idx}`} className="hover:bg-slate-50/50">
                <td className="py-4 px-6 font-semibold text-slate-900">{item.name}</td>
                <td className="py-4 px-6 text-slate-400">{item.supplier || '-'}</td>
                <td className="py-4 px-6 text-right">Rs {Number(item.costPrice).toFixed(2)}</td>
                <td className="py-4 px-6 text-right">Rs {Number(item.maxPrice).toFixed(2)}</td>
                <td className="py-4 px-6 text-right">Rs {Number(item.minPrice).toFixed(2)}</td>
                <td className="py-4 px-6 text-center">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.stock > 10 ? 'bg-emerald-50 text-emerald-700' : item.stock > 0 ? 'bg-amber-50 text-amber-700 animate-pulse' : 'bg-rose-50 text-rose-700'}`}>
                    {item.stock}
                  </span>
                </td>
                <td className="py-4 px-6 text-center">
                  <div className="flex justify-center gap-1.5">
                    <button onClick={() => handleEditClick(item)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={15} /></button>
                    {confirmItemId === item.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDeleteItem(item.id)} className="p-1 bg-rose-600 text-white rounded text-[10px] font-bold px-1.5">Yes</button>
                        <button onClick={() => setConfirmItemId(null)} className="p-1 bg-slate-200 text-slate-700 rounded text-[10px] font-bold px-1.5">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmItemId(item.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loadingRep && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Package size={20} className="text-blue-600" />
                Load Goods to: 
                <select 
                  className="ml-2 bg-slate-100 border border-slate-200 text-slate-700 text-sm rounded-lg px-2 py-1 focus:outline-none"
                  value={loadingRep.id}
                  onChange={(e) => {
                    const r = reps.find(rep => rep.id === e.target.value);
                    if (r) {
                      setLoadingRep(r);
                      setLoadArea(r.activeArea || 'Mirigama');
                    }
                  }}
                >
                  {reps.map((r, idx) => (
                    <option key={r.id + "-" + idx} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </h3>
              <button onClick={() => setLoadingRep(null)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 border-b border-slate-100 bg-white sticky top-0 z-10">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Search Products</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Search by name or code..." 
                      value={loadSearchQuery}
                      onChange={e => setLoadSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Target Area</label>
                  <select 
                    value={loadArea}
                    onChange={(e: any) => setLoadArea(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                  >
                    <option value="Galewela">Galewela / ගලේවෙල</option>
                    <option value="Mirigama">Mirigama / මීරිගම</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Loading Method</label>
                  <select 
                    value={loadMethod}
                    onChange={(e: any) => setLoadMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                  >
                    <option value="from_main">Deduct from Main</option>
                    <option value="direct">Direct Load</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-between items-center bg-blue-50 p-3 rounded-xl border border-blue-100">
                <div className="text-sm font-bold text-blue-800">
                  {Object.values(loadQuantities).filter(qty => parseFloat(qty) > 0).length} Items Selected
                </div>
                <button onClick={handleLoadSubmit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm flex items-center shadow-md shadow-blue-500/20 transition-all active:scale-95">
                  <Package size={16} className="mr-2" /> Submit Load
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
              <div className="space-y-2">
                {items.filter(item => (item.name || '').toLowerCase().includes((loadSearchQuery || '').toLowerCase()) || (item.sku && item.sku.toLowerCase().includes((loadSearchQuery || '').toLowerCase()))).map((item, idx) => {
                  const currentRepInv = loadingRep ? (getRepInventory(loadingRep.id) || []) : [];
                  const repStockVal = currentRepInv
                    .filter((r: any) => String(r.id) === String(item.id))
                    .reduce((sum: number, r: any) => sum + (r.myStock || 0), 0);

                  return (
                    <div key={`load_${item.id}_${idx}`} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-white bg-slate-50/50 transition-colors">
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                        <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                          <span>Warehouse Stock: <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{item.stock}</span></span>
                          <span className="text-slate-300">|</span>
                          <span>Rep Stock (රෙප් ළඟ තොගය): <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">{repStockVal}</span></span>
                        </div>
                      </div>
                      <input 
                        type="number" 
                        min="0"
                        placeholder="Qty"
                        value={loadQuantities[item.id] || ''}
                        onChange={(e) => setLoadQuantities({...loadQuantities, [item.id]: e.target.value})}
                        className="w-24 text-center border-2 border-slate-200 rounded-lg p-2 text-sm font-bold focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-2">
              <button onClick={() => setLoadingRep(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors">
                Cancel
              </button>
              <button onClick={handleLoadSubmit} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm flex items-center shadow-md shadow-blue-500/20 transition-all active:scale-95">
                <Package size={16} className="mr-2" /> Submit Load
              </button>
            </div>
          </div>
        </div>
      )}

      {doubleLoadConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-amber-200">
            <div className="p-5 bg-gradient-to-r from-amber-500 to-orange-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-2xl">
                  <AlertTriangle size={24} className="text-white animate-bounce" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">⚠️ ද්විත්ව තොග පැටවීමේ අවධානය!</h3>
                  <p className="text-xs text-amber-100 mt-0.5">Double Stock Load Warning for Admin</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setDoubleLoadConfirm(null);
                  alert("ද්විත්ව තොග පැටවීම අවලංගු කරන ලදී. (Double load cancelled)");
                }} 
                className="p-1.5 text-amber-100 hover:text-white hover:bg-white/20 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-900 text-xs leading-relaxed space-y-1">
                <p className="font-bold text-sm text-amber-950">
                  අවධානයයි: නියෝජිත <span className="underline">{doubleLoadConfirm.rep.name}</span> වෙත මීට සුළු මොහොතකට පෙර තොග පටවා ඇත!
                </p>
                <p>
                  ඔබ නැවතත් මෙම තොගය <strong>දෙගුණයක් (Double Load)</strong> ලෙස වාහනයට පැටවීමට කැමතිද?
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">පැටවීමට සැරසෙන තොග ලැයිස්තුව:</h4>
                <div className="bg-white rounded-2xl border border-slate-200 p-3 max-h-40 overflow-y-auto space-y-2">
                  {doubleLoadConfirm.loadedItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                      <span className="font-semibold text-slate-800">{item.name}</span>
                      <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">+{item.qty}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    executeLoad(true);
                  }}
                  className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Check size={18} />
                  ඔව්, දෙගුණයක් (Double Load) ලෙස පටවන්න
                </button>
                <button
                  onClick={() => {
                    setDoubleLoadConfirm(null);
                    setLoadingRep(null);
                    setLoadQuantities({});
                    alert("ද්විත්ව තොග පැටවීම අවලංගු කරන ලදී. සාමාන්‍ය තොගය පමණක් පවතී. (Double load cancelled)");
                  }}
                  className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  නැත, එපා (සාමාන්‍ය පරිදි පමණක් තබන්න / අවලංගු කරන්න)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGalewelaCorrector && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-amber-200 flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 rounded-2xl">
                  <RefreshCw size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight flex items-center gap-2">
                    🛠️ ගලේවෙල ඩබල් වූ ස්ටොක් නිවැරදි කිරීම
                  </h3>
                  <p className="text-xs text-amber-100 mt-0.5">
                    Deduct exact extra duplicated stock loaded to Galewela Rep
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowGalewelaCorrector(false)} 
                className="p-2 text-amber-100 hover:text-white hover:bg-white/20 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50 flex-1 overflow-y-auto">
              {/* Rep & Mode Selector Header */}
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-amber-950 text-xs">
                <div className="space-y-1">
                  <span className="font-bold text-sm block text-amber-900">
                    💡 උපදෙස්:
                  </span>
                  <p>
                    එදා ඩබල් වී පැටවුන භාණ්ඩ සහ එහි <b>වැඩිපුර පැටවුන ප්‍රමාණයන් පමණක්</b> මෙහි ඇතුළත් කර ස්ටොක් එකෙන් ඉවත් (Deduct) කරන්න.
                  </p>
                </div>
                <div className="flex-shrink-0 bg-white p-2.5 rounded-xl border border-amber-200 shadow-sm">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">නියෝජිතයා (Sales Rep):</label>
                  <select 
                    value={selectedCorrectorRepId}
                    onChange={(e) => handleSelectCorrectorRep(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
                  >
                    {reps.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.activeArea ? `(${r.activeArea})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Correction Mode Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCorrectionMode('deduct')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                    correctionMode === 'deduct' 
                      ? 'bg-amber-500 text-white border-amber-600 shadow-md' 
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <div className="text-sm">➖ ඩබල් වූ ප්‍රමාණය ඇතුළත් කර අයින් කරන්න</div>
                    <div className={`text-[10px] mt-0.5 ${correctionMode === 'deduct' ? 'text-amber-100' : 'text-slate-500'}`}>
                      (Type exact extra units loaded to deduct)
                    </div>
                  </div>
                  {correctionMode === 'deduct' && <Check size={18} />}
                </button>

                <button
                  type="button"
                  onClick={() => setCorrectionMode('final')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                    correctionMode === 'final' 
                      ? 'bg-amber-500 text-white border-amber-600 shadow-md' 
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div>
                    <div className="text-sm">✏️ අලුත් අවසන් ස්ටොක් ප්‍රමාණය කෙලින්ම සකසන්න</div>
                    <div className={`text-[10px] mt-0.5 ${correctionMode === 'final' ? 'text-amber-100' : 'text-slate-500'}`}>
                      (Set final corrected stock value directly)
                    </div>
                  </div>
                  {correctionMode === 'final' && <Check size={18} />}
                </button>
              </div>

              {/* Recent Load History Auto-Deduct Helper */}
              {(() => {
                const recentLoads = getAIActionRequests().filter(
                  r => r.repId === selectedCorrectorRepId && (r.actionType === 'rep_load' || r.actionType === 'stock_load')
                ).slice(0, 3);

                if (recentLoads.length === 0) return null;

                return (
                  <div className="bg-slate-100 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                    <span className="text-xs font-bold text-slate-700 block">
                      📜 ළඟදී පැටවූ Stock Load සටහන් (Recent Load History):
                    </span>
                    <div className="space-y-2">
                      {recentLoads.map((loadReq) => {
                        const itemsArr = loadReq.payload?.items || [];
                        if (itemsArr.length === 0) return null;

                        return (
                          <div key={loadReq.id} className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                            <div>
                              <span className="font-bold text-slate-800">
                                {new Date(loadReq.timestamp).toLocaleString()} - {loadReq.description}
                              </span>
                              <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-2">
                                {itemsArr.map((it: any) => (
                                  <span key={it.id} className="bg-slate-100 px-1.5 py-0.5 rounded border text-slate-700">
                                    {it.name}: <b>{it.qty} units</b>
                                  </span>
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAutoFillFromRecentLoad(itemsArr)}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg transition-all shadow-sm flex-shrink-0 flex items-center gap-1"
                            >
                              <Zap size={13} />
                              මෙම Load එකේ අගයන් Deduct කිරීමට Auto-Fill කරන්න
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-bold text-slate-700">
                  {correctionMode === 'deduct' 
                    ? '👇 එක් එක් භාණ්ඩය සඳහා ඩබල් වූ වැඩිපුර ප්‍රමාණය (Deduct Extra Qty) ඇතුළත් කරන්න:' 
                    : '👇 එක් එක් භාණ්ඩය සඳහා තිබිය යුතු නිවැරදි අවසන් ස්ටොක් ප්‍රමාණය ඇතුළත් කරන්න:'}
                </span>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer bg-amber-50/80 px-3 py-1.5 rounded-xl border border-amber-200">
                  <input 
                    type="checkbox"
                    checked={restoreExcessToWarehouse}
                    onChange={(e) => setRestoreExcessToWarehouse(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                  />
                  ඉවත් කරන අතිරික්ත තොගය Main Warehouse එකට එකතු කරන්න
                </label>
              </div>

              {/* Items Correction Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">භාණ්ඩයේ නම (Product Name)</th>
                      <th className="py-3 px-4 text-center">දැනට ඇති ස්ටොක් (Current Rep Stock)</th>
                      <th className="py-3 px-4 text-center">
                        {correctionMode === 'deduct' ? 'අයින් කළ යුතු ඩබල් ප්‍රමාණය (Deduct Qty)' : 'අලුත් අවසන් ස්ටොක් එක (Final Target Qty)'}
                      </th>
                      <th className="py-3 px-4 text-center">ගණනය වූ අවසන් ස්ටොක් (New Result)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {items.map((item, idx) => {
                      const repInv = selectedCorrectorRepId ? (getRepInventory(selectedCorrectorRepId) || []) : [];
                      const repItem = repInv.find((r: any) => String(r.id) === String(item.id));
                      const currentQty = repItem ? (repItem.myStock || 0) : 0;

                      let inputVal = '';
                      let finalCalcQty = currentQty;
                      let excessRemoved = 0;

                      if (correctionMode === 'deduct') {
                        inputVal = deductQuantityMap[String(item.id)] || '';
                        const parsedDeduct = parseFloat(inputVal) || 0;
                        excessRemoved = parsedDeduct;
                        finalCalcQty = Math.max(0, currentQty - parsedDeduct);
                      } else {
                        inputVal = correctedStockMap[String(item.id)] ?? String(currentQty);
                        const parsedFinal = parseFloat(inputVal) || 0;
                        finalCalcQty = Math.max(0, parsedFinal);
                        excessRemoved = currentQty - finalCalcQty;
                      }

                      return (
                        <tr key={`corr_${item.id}_${idx}`} className="hover:bg-amber-50/30 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {item.name}
                            <span className="block text-[10px] text-slate-400 font-normal">Warehouse: {item.stock} units</span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-800 bg-slate-50">
                            {currentQty} units
                          </td>
                          <td className="py-3 px-4 text-center">
                            {correctionMode === 'deduct' ? (
                              <input 
                                type="number"
                                min="0"
                                placeholder="0"
                                value={inputVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDeductQuantityMap(prev => ({ ...prev, [String(item.id)]: val }));
                                }}
                                className="w-28 text-center bg-amber-50/50 border-2 border-amber-300 rounded-xl p-1.5 text-xs font-bold text-amber-900 focus:outline-none focus:border-amber-600 shadow-inner"
                              />
                            ) : (
                              <input 
                                type="number"
                                min="0"
                                value={inputVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCorrectedStockMap(prev => ({ ...prev, [String(item.id)]: val }));
                                }}
                                className="w-28 text-center bg-white border-2 border-slate-300 rounded-xl p-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 shadow-inner"
                              />
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-bold">
                            <span className="text-slate-900 block text-xs">
                              {finalCalcQty} units
                            </span>
                            {excessRemoved > 0 ? (
                              <span className="inline-block text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mt-0.5">
                                -{excessRemoved} units removed
                              </span>
                            ) : excessRemoved < 0 ? (
                              <span className="inline-block text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 mt-0.5">
                                +{Math.abs(excessRemoved)} units added
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">no change</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
              <button 
                type="button"
                onClick={() => setShowGalewelaCorrector(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                අවලංගු කරන්න (Cancel)
              </button>
              <button 
                type="button"
                onClick={handleSaveGalewelaCorrection}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
              >
                <Check size={18} />
                නිවැරදි කිරීම සුරකින්න (Confirm & Apply Correction)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// --- 5. SUPPLIERS TAB ---
export function SuppliersTab({ suppliers, setSuppliers, setActiveTab, items }: { suppliers: any[], setSuppliers: any, setActiveTab: any, items: any[] }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
    
  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const newSup = {
      id: Date.now(),
      name,
      phone,
      email,
      createdAt: new Date().toISOString()
    };
    const updated = [...suppliers, newSup];
    setSuppliers(updated);
    // Sync with localstorage (represented as suppliers in store)
    localStorage.setItem('bizflow_suppliers_v1', JSON.stringify(updated));
    localStorage.setItem('bizflow_MYM-BIZFLOW_suppliers_v1', JSON.stringify(updated));

    setName(''); setPhone(''); setEmail(''); setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-xl flex items-center shadow-lg shadow-blue-500/15 text-sm transition-all active:scale-95"
        >
          <Plus size={18} className="mr-1.5" /> Add New Supplier
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddSupplier} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3 font-bold text-slate-800 text-lg">Add New Supplier</div>
          <input type="text" placeholder="Supplier Name" value={name} onChange={e => setName(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" required />
          <input type="text" placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" />
          <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" />
          <div className="md:col-span-3 flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setIsAdding(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-slate-700 text-sm">Cancel</button>
            <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm flex items-center"><Save size={16} className="mr-1.5" /> Save Supplier</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-4 px-6">Supplier Name</th>
              <th className="py-4 px-6">Phone</th>
              <th className="py-4 px-6">Email</th>
              <th className="py-4 px-6 text-center">Associated Products</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
            {suppliers.map((sup, idx) => (
              <tr key={sup.id || idx} className="hover:bg-slate-50/50">
                <td className="py-4 px-6 font-semibold text-slate-900">{sup.name}</td>
                <td className="py-4 px-6 text-slate-500">{sup.phone || '-'}</td>
                <td className="py-4 px-6 text-slate-500">{sup.email || '-'}</td>
                <td className="py-4 px-6 text-center">
                  <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-full text-xs">
                    {items.filter(i => i.supplier === sup.name).length} Items
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- 6. CUSTOMERS TAB ---
export function CustomersTab({ customers, setCustomers }: { customers: any[], setCustomers: any }) {
  const orgId = getActiveOrgId();
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [balance, setBalance] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBalance, setEditBalance] = useState('');

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newCust = {
      id: 'cust_' + Date.now(),
      name: name.trim(),
      location: location.trim(),
      balance: parseFloat(balance) || 0,
      initialCreditAdded: (parseFloat(balance) || 0) > 0,
      createdAt: new Date().toISOString(),
      updatedAt: Date.now()
    };
    const updated = [...customers, newCust];
    setCustomers(updated);

    const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
    let allSales: any[] = [];
    try { allSales = JSON.parse(storedSalesStr); } catch (e) {}

    persistSalesAndCustomers(orgId, allSales, updated, [], newCust);

    setName(''); setLocation(''); setBalance(''); setIsAdding(false);
  };

  const handleOpenEdit = (cust: any) => {
    setEditingCustomer(cust);
    setEditName(cust.name || '');
    setEditLocation(cust.location || '');
    setEditBalance(String(cust.balance || 0));
  };

  const handleSaveCustomerEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !editName.trim()) return;

    const oldName = (editingCustomer.name || '').trim();
    const newName = editName.trim();
    const newBal = parseFloat(editBalance) || 0;

    const updatedCust = {
      ...editingCustomer,
      name: newName,
      location: editLocation.trim(),
      balance: newBal,
      updatedAt: Date.now()
    };

    const updatedList = customers.map(c => 
      (c.id === editingCustomer.id || (c.name || '').toLowerCase().trim() === oldName.toLowerCase()) ? updatedCust : c
    );

    const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
    let allSales: any[] = [];
    try { allSales = JSON.parse(storedSalesStr); } catch (e) {}

    // If customer name was changed, also update customer name on all their sales
    let modifiedSales = allSales;
    if (oldName && oldName.toLowerCase() !== newName.toLowerCase()) {
      modifiedSales = allSales.map(s => {
        if ((s.customer || '').toLowerCase().trim() === oldName.toLowerCase()) {
          return { ...s, customer: newName, updatedAt: new Date().toISOString() };
        }
        return s;
      });
    }

    // Cascade new balance across debt chain so bills and arrears align permanently
    const recalcRes = recalculateCustomerDebtChain(
      newName,
      modifiedSales,
      updatedList,
      undefined,
      undefined,
      newBal
    );

    setCustomers(recalcRes.newAllCustomers);
    persistSalesAndCustomers(
      orgId, 
      recalcRes.newAllSales, 
      recalcRes.newAllCustomers, 
      recalcRes.updatedSalesForSync, 
      recalcRes.updatedCustomerForSync || updatedCust
    );

    setEditingCustomer(null);
    alert('ගනුදෙනුකරුගේ තොරතුරු සහ ණය මුදල සාර්ථකව යාවත්කාලීන විය!\n(Customer details and balance updated successfully!)');
  };

  const handleDeleteCustomer = async (cust: any) => {
    if (!cust) return;
    const confirmMsg = `ඔබට "${cust.name}" ගනුදෙනුකරු පද්ධතියෙන් ඉවත් කිරීමට අවශ්‍යද? (Delete Customer?)`;
    if (!window.confirm(confirmMsg)) return;

    const updatedList = customers.filter(c => c.id !== cust.id && String(c.id) !== String(cust.id));
    setCustomers(updatedList);

    const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
    let allSales: any[] = [];
    try { allSales = JSON.parse(storedSalesStr); } catch (e) {}

    persistSalesAndCustomers(orgId, allSales, updatedList);
    addToSyncQueue({ table: 'customers', action: 'delete', data: { id: cust.id, docId: cust.docId } });
  };

  const filtered = customers.filter(c => 
    (c.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (c.location || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h3 className="font-display text-2xl font-bold text-slate-800">Customers & Debt Directory</h3>
          <p className="text-slate-500 text-sm mt-0.5">Manage customer profiles and adjust persistent outstanding balances.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="text" 
            placeholder="Search customers or location..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl py-2.5 pl-4 pr-4 focus:outline-none focus:border-blue-500 font-medium text-slate-700 text-sm shadow-sm w-full sm:w-64"
          />
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center shadow-lg shadow-blue-500/15 text-xs transition-all active:scale-95 whitespace-nowrap"
          >
            <Plus size={16} className="mr-1" /> Add Customer
          </button>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleAddCustomer} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3 font-bold text-slate-800 text-lg">Add New Customer</div>
          <input type="text" placeholder="Customer Name (කඩේ නම)" value={name} onChange={e => setName(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" required />
          <input type="text" placeholder="Location / Address (ලිපිනය)" value={location} onChange={e => setLocation(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" />
          <input type="number" placeholder="Outstanding Balance (Rs)" value={balance} onChange={e => setBalance(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl font-bold" />
          <div className="md:col-span-3 flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setIsAdding(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-slate-700 text-sm">Cancel</button>
            <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm flex items-center"><Save size={16} className="mr-1.5" /> Save Customer</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-4 px-6">Customer Name</th>
              <th className="py-4 px-6">Location</th>
              <th className="py-4 px-6 text-right">Outstanding Balance</th>
              <th className="py-4 px-6 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
            {filtered.map((cust, idx) => (
              <tr key={cust.id || idx} className="hover:bg-slate-50/50">
                <td className="py-4 px-6 font-semibold text-slate-900">{cust.name}</td>
                <td className="py-4 px-6 text-slate-500">{cust.location || '-'}</td>
                <td className="py-4 px-6 text-right font-bold text-slate-900">
                  <span className={cust.balance > 0 ? 'text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200' : 'text-slate-500'}>
                    Rs {Number(cust.balance || 0).toLocaleString()}
                  </span>
                </td>
                <td className="py-4 px-6 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(cust)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-all"
                    >
                      <Edit2 size={13} /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCustomer(cust)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      title="Delete Customer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-md w-full p-8 shadow-2xl border border-slate-100 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-800">Edit Customer & Balance</h3>
                <p className="text-slate-500 text-xs mt-0.5">Adjust persistent debt or customer information.</p>
              </div>
              <button onClick={() => setEditingCustomer(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomerEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Customer Name (කඩේ නම)</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 text-sm focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Location / Address (ලිපිනය)</label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={e => setEditLocation(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Outstanding Balance / ණය මුදල (Rs)</label>
                <input
                  type="number"
                  value={editBalance}
                  onChange={e => setEditBalance(e.target.value)}
                  className="w-full p-3 bg-amber-50 border border-amber-200 rounded-xl font-bold text-amber-900 text-base focus:outline-none focus:border-amber-500"
                  required
                />
                <p className="text-[10px] text-amber-600 font-bold mt-1">
                  * මෙහි ඇතුළත් කරන ණය මුදල ස්ථීරව සුරැකෙන අතර, ඉදිරි සියලු බිල්පත් මෙම ණය මුදල පාදක කර ගනිමින් එකතු වේ.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
                >
                  <Save size={14} /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 7. PURCHASING & SUPPLIER RETURN NOTES TAB ---
export function PurchasingTab({ items, setItems, suppliers }: { items: any[], setItems: any, suppliers: any[] }) {
  const orgId = getActiveOrgId();
  const orgSettings = getOrganizationSettings();

  const [subTab, setSubTab] = useState<'purchase' | 'return_note' | 'history'>('return_note');

  // Purchase Order state
  const [selectedProduct, setSelectedProduct] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');

  // Supplier Return Note state
  const [retSupplier, setRetSupplier] = useState('');
  const [retDate, setRetDate] = useState(new Date().toISOString().slice(0, 10));
  const [retReason, setRetReason] = useState('Damaged Goods / හානි වූ භාණ්ඩ');
  const [customReason, setCustomReason] = useState('');

  // Staged items for Return Note
  const [stagedProductId, setStagedProductId] = useState('');
  const [stagedQty, setStagedQty] = useState('');
  const [stagedUnitPrice, setStagedUnitPrice] = useState('');
  const [stagedItems, setStagedItems] = useState<Array<{
    itemId: string;
    name: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>>([]);

  // Stored Return Notes
  const [returnNotes, setReturnNotes] = useState<any[]>(() => {
    const stored = localStorage.getItem(`bizflow_${orgId}_supplier_returns_v1`) || localStorage.getItem('bizflow_supplier_returns_v1');
    return stored ? JSON.parse(stored) : [];
  });

  // Modal for Invoice display/print
  const [activeInvoice, setActiveInvoice] = useState<any | null>(null);

  // Auto set unit price when selecting product to return
  const handleProductSelectForReturn = (prodId: string) => {
    setStagedProductId(prodId);
    const prod = items.find(i => String(i.id) === String(prodId));
    if (prod) {
      setStagedUnitPrice(String(prod.costPrice || prod.maxPrice || 0));
    } else {
      setStagedUnitPrice('');
    }
  };

  const handleAddStagedItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stagedProductId || !stagedQty || parseFloat(stagedQty) <= 0) {
      alert('කරුණාකර භාණ්ඩයක් සහ වලංගු ප්‍රමාණයක් ඇතුළත් කරන්න (Please select a product and valid quantity).');
      return;
    }

    const prod = items.find(i => String(i.id) === String(stagedProductId));
    if (!prod) return;

    const numQty = parseFloat(stagedQty);
    const numPrice = parseFloat(stagedUnitPrice) || prod.costPrice || 0;
    const itemTotal = numQty * numPrice;

    // Check if item already staged
    const existingIndex = stagedItems.findIndex(i => String(i.itemId) === String(stagedProductId));
    if (existingIndex !== -1) {
      const updated = [...stagedItems];
      updated[existingIndex].qty += numQty;
      updated[existingIndex].total = updated[existingIndex].qty * updated[existingIndex].unitPrice;
      setStagedItems(updated);
    } else {
      setStagedItems([...stagedItems, {
        itemId: String(prod.id),
        name: prod.name,
        qty: numQty,
        unitPrice: numPrice,
        total: itemTotal
      }]);
    }

    setStagedProductId('');
    setStagedQty('');
    setStagedUnitPrice('');
  };

  const handleRemoveStagedItem = (index: number) => {
    setStagedItems(stagedItems.filter((_, idx) => idx !== index));
  };

  // Create Supplier Return Note & Invoice
  const handleCreateReturnNote = () => {
    if (!retSupplier.trim()) {
      alert('කරුණාකර සැපයුම්කරු (Supplier) තෝරන්න හෝ ඇතුළත් කරන්න.');
      return;
    }

    if (stagedItems.length === 0) {
      alert('කරුණාකර අවම වශයෙන් එක් භාණ්ඩයක්වත් එකතු කරන්න (Add at least 1 item to return).');
      return;
    }

    const finalReason = retReason === 'Other' ? (customReason || 'Other Return') : retReason;
    const grandTotal = stagedItems.reduce((sum, item) => sum + item.total, 0);
    const noteNo = 'SRN-' + Math.floor(100000 + Math.random() * 900000);

    const newReturnNote = {
      id: 'SRN-' + Date.now(),
      noteNo,
      supplierName: retSupplier.trim(),
      date: retDate,
      reason: finalReason,
      items: [...stagedItems],
      totalValue: grandTotal,
      createdBy: 'Admin (Head Office)',
      timestamp: Date.now(),
      orgName: orgSettings.name || 'Core System',
      orgAddress: orgSettings.address || 'Head Office',
      orgPhone: orgSettings.phone || ''
    };

    // Deduct stock from main warehouse inventory
    let updatedInventory = [...items];
    stagedItems.forEach(staged => {
      updatedInventory = updatedInventory.map(i => String(i.id) === String(staged.itemId) ? {
        ...i,
        stock: Math.max(0, i.stock - staged.qty)
      } : i);
    });

    setItems(updatedInventory);
    saveAdminInventory(updatedInventory);

    // Save Return Note history
    const updatedNotes = [newReturnNote, ...returnNotes];
    setReturnNotes(updatedNotes);
    localStorage.setItem(`bizflow_${orgId}_supplier_returns_v1`, JSON.stringify(updatedNotes));
    localStorage.setItem('bizflow_supplier_returns_v1', JSON.stringify(updatedNotes));

    // Save action request log
    const request: any = {
      id: 'SRN-LOG-' + Date.now(),
      repId: 'admin',
      repName: 'Head Office',
      actionType: 'supplier_return',
      description: `Returned goods (Value: Rs. ${grandTotal.toLocaleString()}) to supplier ${retSupplier}`,
      payload: newReturnNote,
      status: 'Approved',
      timestamp: Date.now()
    };
    saveAIActionRequests([request, ...getAIActionRequests()]);
    addToSyncQueue({ table: 'aiactions', action: 'insert', data: request });

    // Open printable Invoice Modal immediately!
    setActiveInvoice(newReturnNote);

    // Reset Form
    setStagedItems([]);
    setRetReason('Damaged Goods / හානි වූ භාණ්ඩ');
    setCustomReason('');
    alert(`Supplier Return Note (${noteNo}) සාර්ථකව සාදන ලදී! ඉන්වොයිසිය මුද්‍රණය කිරීමට සුදානම්.`);
  };

  const handlePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !qty) return;

    const prod = items.find(i => String(i.id) === String(selectedProduct));
    if (!prod) return;

    const updated = items.map(i => String(i.id) === String(selectedProduct) ? {
      ...i,
      stock: i.stock + (Number(qty) || 0),
      costPrice: cost ? Number(cost) : i.costPrice
    } : i);

    setItems(updated);
    saveAdminInventory(updated);

    // Save purchasing transaction log
    const request: any = {
      id: 'PUR-' + Date.now(),
      repId: 'admin',
      repName: 'Head Office',
      actionType: 'supplier_buy',
      description: `Purchased ${qty} of ${prod.name} from supplier`,
      payload: { itemId: prod.id, name: prod.name, qty: Number(qty), cost: cost ? Number(cost) : prod.costPrice },
      status: 'Approved',
      timestamp: Date.now()
    };
    saveAIActionRequests([request, ...getAIActionRequests()]);

    setSelectedProduct(''); setQty(''); setCost('');
    alert('Purchase recorded successfully and stock updated!');
  };

  const totalReturnedValueAllTime = returnNotes.reduce((sum, n) => sum + (Number(n.totalValue) || 0), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header and Mode Selection Tabs */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="text-blue-600" size={28} /> Supplier Management & Return Notes
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            සැපයුම්කරුවන්ගේ මිලදී ගැනීම් සහ ආපසු භාණ්ඩ යැවීමේ ඉන්වොයිසි සටහන් (Supplier Purchases & Return Notes)
          </p>
        </div>

        <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setSubTab('return_note')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
              subTab === 'return_note'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCcw size={16} /> ↩️ Supplier Return Note
          </button>
          <button
            type="button"
            onClick={() => setSubTab('purchase')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
              subTab === 'purchase'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingCart size={16} /> 📦 Supplier Purchase
          </button>
          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
              subTab === 'history'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={16} /> 📑 Return Notes ({returnNotes.length})
          </button>
        </div>
      </div>

      {/* --- SUB TAB 1: SUPPLIER RETURN NOTE CREATOR --- */}
      {subTab === 'return_note' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Return Note Setup Form */}
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h4 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <RotateCcw size={20} className="text-rose-500" />
                සැපයුම්කරු තොරතුරු (Supplier Details)
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">තෝරාගත් සැපයුම්කරු වෙත භාණ්ඩ ආපසු යැවීම</p>
            </div>

            {/* Supplier Selector */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-600 uppercase mb-1">
                1. සැපයුම්කරු තෝරන්න (Select Supplier) *
              </label>
              <select
                value={retSupplier}
                onChange={e => setRetSupplier(e.target.value)}
                className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 ring-rose-500/20 focus:border-rose-500"
              >
                <option value="">-- සැපයුම්කරු තෝරන්න (Choose Supplier) --</option>
                {suppliers.map((s, idx) => (
                  <option key={`sup-opt-${s.id || idx}`} value={s.name}>
                    {s.name} {s.contact ? `(${s.contact})` : ''}
                  </option>
                ))}
                <option value="General Supplier">General Supplier / වෙනත් සැපයුම්කරු</option>
              </select>
            </div>

            {/* Manual Supplier Entry option if not in list */}
            <div className="flex flex-col">
              <label className="text-xs font-medium text-slate-500 mb-1">හෝ වෙනත් සැපයුම්කරු නමක් (Custom Supplier Name)</label>
              <input
                type="text"
                placeholder="Ex: Abans Wholesale, Elephant House..."
                value={retSupplier}
                onChange={e => setRetSupplier(e.target.value)}
                className="bg-slate-50 p-3 border border-slate-200 rounded-xl text-sm"
              />
            </div>

            {/* Return Date */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-600 uppercase mb-1">2. දිනය (Return Date)</label>
              <input
                type="date"
                value={retDate}
                onChange={e => setRetDate(e.target.value)}
                className="bg-slate-50 p-3 border border-slate-200 rounded-xl font-medium text-sm text-slate-800"
              />
            </div>

            {/* Reason for Return */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-600 uppercase mb-1">3. ආපසු යැවීමට හේතුව (Reason for Return)</label>
              <select
                value={retReason}
                onChange={e => setRetReason(e.target.value)}
                className="bg-slate-50 p-3 border border-slate-200 rounded-xl text-sm text-slate-800 font-medium"
              >
                <option value="Damaged Goods / හානි වූ භාණ්ඩ">Damaged Goods / හානි වූ භාණ්ඩ</option>
                <option value="Expired Stock / කල් ඉකුත් වූ තොග">Expired Stock / කල් ඉකුත් වූ තොග</option>
                <option value="Quality Defect / ප්‍රමිතියෙන් තොර">Quality Defect / ප්‍රමිතියෙන් තොර</option>
                <option value="Wrong Delivery / වැරදි ඇණවුම">Wrong Delivery / වැරදි ඇණවුම</option>
                <option value="Overstock Return / අතිරික්ත තොග">Overstock Return / අතිරික්ත තොග</option>
                <option value="Other">Other Reason / වෙනත් හේතුවක්</option>
              </select>
            </div>

            {retReason === 'Other' && (
              <div className="flex flex-col">
                <input
                  type="text"
                  placeholder="හේතුව සඳහන් කරන්න..."
                  value={customReason}
                  onChange={e => setCustomReason(e.target.value)}
                  className="bg-slate-50 p-3 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            )}
          </div>

          {/* Right Column: Add Items & Staging Table */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <Package size={20} className="text-blue-600" />
                    ආපසු යවන භාණ්ඩ (Add Products to Return Note)
                  </h4>
                  <p className="text-xs text-slate-500">භාණ්ඩ, ප්‍රමාණය සහ ඒකක වටිනාකම එකතු කරන්න</p>
                </div>
                <span className="bg-rose-50 text-rose-700 font-bold px-3 py-1 rounded-full text-xs border border-rose-200">
                  {stagedItems.length} Items Selected
                </span>
              </div>

              {/* Add Item Form inline */}
              <form onSubmit={handleAddStagedItem} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-5 flex flex-col">
                    <label className="text-[11px] font-bold text-slate-600 uppercase mb-1">භාණ්ඩය (Product)</label>
                    <select
                      value={stagedProductId}
                      onChange={e => handleProductSelectForReturn(e.target.value)}
                      className="bg-white p-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 ring-blue-500/20"
                    >
                      <option value="">-- තෝරන්න (Select Item) --</option>
                      {items.map((i, idx) => (
                        <option key={`ret_p_${i.id}_${idx}`} value={i.id}>
                          {i.name} (තොග: {i.stock})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3 flex flex-col">
                    <label className="text-[11px] font-bold text-slate-600 uppercase mb-1">ප්‍රමාණය (Qty)</label>
                    <input
                      type="number"
                      placeholder="0"
                      min="1"
                      step="any"
                      value={stagedQty}
                      onChange={e => setStagedQty(e.target.value)}
                      className="bg-white p-2.5 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div className="md:col-span-4 flex flex-col">
                    <label className="text-[11px] font-bold text-slate-600 uppercase mb-1">ඒකක වටිනාකම (Unit Price Rs)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={stagedUnitPrice}
                      onChange={e => setStagedUnitPrice(e.target.value)}
                      className="bg-white p-2.5 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> භාණ්ඩය ලැයිස්තුවට එකතු කරන්න (+ Add Item to Return Note)
                </button>
              </form>

              {/* Staged Items Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-xs uppercase font-bold border-b border-slate-200">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">භාණ්ඩ විස්තරය (Product)</th>
                      <th className="py-3 px-4 text-center">ප්‍රමාණය (Qty)</th>
                      <th className="py-3 px-4 text-right">ඒකක මිළ (Unit Price)</th>
                      <th className="py-3 px-4 text-right">එකතුව (Total Rs)</th>
                      <th className="py-3 px-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {stagedItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                          තවමත් කිසිදු භාණ්ඩයක් එකතු කර නැත. උඩින් භාණ්ඩයක් තෝරා එකතු කරන්න.
                        </td>
                      </tr>
                    ) : (
                      stagedItems.map((staged, idx) => (
                        <tr key={`staged_${idx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-slate-800">{staged.name}</td>
                          <td className="py-3 px-4 text-center font-bold text-rose-600 bg-rose-50/50 rounded-lg">{staged.qty}</td>
                          <td className="py-3 px-4 text-right font-mono font-medium">Rs {staged.unitPrice.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">Rs {staged.total.toLocaleString()}</td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => handleRemoveStagedItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Remove item"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {stagedItems.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-900 text-white font-bold">
                        <td colSpan={4} className="py-3 px-4 text-right uppercase text-xs tracking-wider">මුළු ආපසු වටිනාකම (Grand Total):</td>
                        <td className="py-3 px-4 text-right font-mono text-base text-emerald-400">
                          Rs {stagedItems.reduce((sum, item) => sum + item.total, 0).toLocaleString()}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-4 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                * මෙය සම්පූර්ණ කළ පසු ප්‍රධාන තොගයෙන් (Main Stock) මෙම ප්‍රමාණයන් අඩුවේ.
              </div>
              <button
                type="button"
                onClick={handleCreateReturnNote}
                disabled={stagedItems.length === 0 || !retSupplier.trim()}
                className="w-full md:w-auto bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white font-bold px-8 py-4 rounded-2xl transition-all shadow-lg shadow-rose-500/25 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                <Printer size={18} />
                ඉන්වොයිසිය සාදා මුද්‍රණය කරන්න (Generate & Print Return Note)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB TAB 2: SUPPLIER PURCHASE ORDER --- */}
      {subTab === 'purchase' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm max-w-xl mx-auto space-y-6">
          <div>
            <h3 className="font-display text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ShoppingCart size={24} className="text-blue-600" />
              Supplier Purchase Order (තොග මිලදී ගැනීම්)
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              සැපයුම්කරුවන්ගෙන් පැමිණෙන නව තොග ප්‍රධාන ගබඩාවට එකතු කිරීම.
            </p>
          </div>

          <form onSubmit={handlePurchase} className="space-y-4">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Select Product</label>
              <select
                value={selectedProduct}
                onChange={e => setSelectedProduct(e.target.value)}
                className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 ring-blue-500/10 focus:border-blue-500"
                required
              >
                <option value="">Choose a product...</option>
                {items.map((i, idx) => (
                  <option key={i.id + "-" + idx} value={i.id}>
                    {i.name} (Stock: {i.stock})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Purchase Qty</label>
                <input
                  type="number"
                  placeholder="0"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 ring-blue-500/10"
                  required
                />
              </div>
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Cost Price per unit (Optional)</label>
                <input
                  type="number"
                  placeholder="Keep current"
                  value={cost}
                  onChange={e => setCost(e.target.value)}
                  className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 ring-blue-500/10"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              <ShoppingCart size={20} /> Record Purchase & Update Stock
            </button>
          </form>
        </div>
      )}

      {/* --- SUB TAB 3: PAST RETURN NOTES HISTORY --- */}
      {subTab === 'history' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-display text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-rose-600" size={26} />
                Supplier Return Notes History (ආපසු යැවූ සටහන් ලැයිස්තුව)
              </h3>
              <p className="text-slate-500 text-sm mt-0.5">
                කලින් සාදන ලද සියලුම සැපයුම්කරු ආපසු සටහන් ඉන්වොයිසි නැවත බැලීමට සහ මුද්‍රණය කිරීමට.
              </p>
            </div>
            <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100 text-rose-800 text-xs font-bold font-mono">
              Total Returned: Rs {totalReturnedValueAllTime.toLocaleString()}
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold border-b border-slate-200">
                  <th className="py-3 px-4">Note No</th>
                  <th className="py-3 px-4">දිනය (Date)</th>
                  <th className="py-3 px-4">සැපයුම්කරු (Supplier)</th>
                  <th className="py-3 px-4">හේතුව (Reason)</th>
                  <th className="py-3 px-4 text-center">භාණ්ඩ ගණන</th>
                  <th className="py-3 px-4 text-right">මුළු වටිනාකම</th>
                  <th className="py-3 px-4 text-center">ක්‍රියාමාර්ග</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {returnNotes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                      තවමත් කිසිදු Supplier Return Note එකක් සාදා නැත.
                    </td>
                  </tr>
                ) : (
                  returnNotes.map((note, idx) => (
                    <tr key={`note_hist_${note.id || idx}`} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-rose-600">{note.noteNo}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">{note.date}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">{note.supplierName}</td>
                      <td className="py-3.5 px-4 text-slate-600">{note.reason || '-'}</td>
                      <td className="py-3.5 px-4 text-center font-bold">{note.items?.length || 1}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 text-sm">
                        Rs {(Number(note.totalValue) || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setActiveInvoice(note)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-xl transition-all border border-blue-200 flex items-center justify-center gap-1.5 mx-auto"
                        >
                          <Printer size={14} /> View / Print Invoice
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- SUPPLIER RETURN NOTE INVOICE PRINT MODAL --- */}
      {activeInvoice && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-slate-200 space-y-6 relative animate-in fade-in zoom-in duration-200">
            {/* Action Bar (Non-printable controls) */}
            <div className="print:hidden flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
                <Check size={18} /> Supplier Return Note Invoice Ready
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 text-xs"
                >
                  <Printer size={16} /> 🖨️ Print Invoice (මුද්‍රණය කරන්න)
                </button>
                <button
                  onClick={() => setActiveInvoice(null)}
                  className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* PRINTABLE INVOICE CONTAINER */}
            <div id="supplier-return-invoice" className="bg-white p-6 rounded-2xl border border-slate-300 space-y-6 text-slate-900 font-sans">
              {/* Invoice Header */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-wider text-slate-900">
                    {activeInvoice.orgName || orgSettings.name || 'CORE SYSTEM'}
                  </h2>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">{activeInvoice.orgAddress || orgSettings.address}</p>
                  {activeInvoice.orgPhone && <p className="text-xs text-slate-600 font-medium">Tel: {activeInvoice.orgPhone || orgSettings.phone}</p>}
                </div>

                <div className="text-right">
                  <div className="inline-block bg-slate-900 text-white font-black text-xs px-3 py-1 uppercase rounded tracking-widest mb-1">
                    SUPPLIER RETURN NOTE
                  </div>
                  <p className="text-sm font-mono font-bold text-rose-600">{activeInvoice.noteNo}</p>
                  <p className="text-xs text-slate-500 font-semibold">{activeInvoice.date}</p>
                </div>
              </div>

              {/* Supplier & Details Grid */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">සැපයුම්කරු (RETURN TO SUPPLIER):</span>
                  <span className="text-base font-bold text-slate-900">{activeInvoice.supplierName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">හේතුව (REASON FOR RETURN):</span>
                  <span className="text-sm font-semibold text-rose-700">{activeInvoice.reason || 'Damaged / Defective'}</span>
                </div>
              </div>

              {/* Itemized Table */}
              <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="py-2.5 px-3 border-r border-slate-300">#</th>
                    <th className="py-2.5 px-3 border-r border-slate-300">භාණ්ඩ විස්තරය (Item Name)</th>
                    <th className="py-2.5 px-3 text-center border-r border-slate-300">ප්‍රමාණය (Qty)</th>
                    <th className="py-2.5 px-3 text-right border-r border-slate-300">ඒකක මිළ (Unit Value)</th>
                    <th className="py-2.5 px-3 text-right">එකතුව (Total Value)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {activeInvoice.items && activeInvoice.items.length > 0 ? (
                    activeInvoice.items.map((item: any, idx: number) => (
                      <tr key={`inv_item_${idx}`}>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-center">{idx + 1}</td>
                        <td className="py-2.5 px-3 border-r border-slate-200 font-bold">{item.name}</td>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-center font-bold">{item.qty}</td>
                        <td className="py-2.5 px-3 border-r border-slate-200 text-right font-mono">Rs {Number(item.unitPrice).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">Rs {Number(item.total).toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">No items detail recorded.</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-bold">
                    <td colSpan={4} className="py-3 px-4 text-right uppercase text-xs tracking-wider border-r border-slate-800">
                      මුළු ආපසු වටිනාකම (TOTAL RETURN VALUE):
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-base text-emerald-400">
                      Rs {Number(activeInvoice.totalValue || 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Signatures Footer */}
              <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs text-slate-600 font-semibold">
                <div>
                  <div className="border-t-2 border-slate-800 pt-1.5 font-bold text-slate-900 uppercase">
                    බලමුලු ගැන්වූයේ (Prepared / Authorized By)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Head Office Admin</div>
                </div>

                <div>
                  <div className="border-t-2 border-slate-800 pt-1.5 font-bold text-slate-900 uppercase">
                    සැපයුම්කරු භාරගත්තේ (Received & Accepted By Supplier)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Supplier Representative Signature & Stamp</div>
                </div>
              </div>

              {/* Footer Notice */}
              <div className="text-center text-[10px] text-slate-400 border-t border-slate-100 pt-3">
                * This is an official Supplier Return Note generated by {activeInvoice.orgName || orgSettings.name}.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 8. CREDIT BILLS TAB ---
export function CreditBillsTab() {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'admin' | 'rep'>('all');
  const [editingBill, setEditingBill] = useState<any | null>(null);
  const [editCustomer, setEditCustomer] = useState('');
  const [editTotal, setEditTotal] = useState('');
  const [editAddedCredit, setEditAddedCredit] = useState('');
  const [editPartial, setEditPartial] = useState('');
  const [editBalance, setEditBalance] = useState('');

  const handleOpenEditBill = (bill: any) => {
    setEditingBill(bill);
    setEditCustomer(bill.customer || '');
    setEditTotal(String(bill.total || 0));
    setEditAddedCredit(String(bill.addedCredit || (bill.total ? bill.total - (bill.partialAmount || 0) : 0) || 0));
    setEditPartial(String(bill.partialAmount || 0));
    setEditBalance(String(bill.newBalance || bill.remainingBalance || (bill.addedCredit || 0)));
  };

  const handleSaveBillEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBill) return;

    const storedSalesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
    let allSales: any[] = [];
    try { allSales = JSON.parse(storedSalesStr); } catch (e) {}

    const storedCustsStr = localStorage.getItem(`bizflow_${orgId}_customers_v1`) || localStorage.getItem('bizflow_customers_v1') || '[]';
    let allCusts: any[] = [];
    try { allCusts = JSON.parse(storedCustsStr); } catch (e) {}

    const newNewBalance = parseFloat(editBalance) || parseFloat(editAddedCredit) || 0;
    const newTotal = parseFloat(editTotal) || 0;
    const newAddedCredit = parseFloat(editAddedCredit) || 0;
    const newPartial = parseFloat(editPartial) || 0;

    const updatedSale = {
      ...editingBill,
      customer: editCustomer.trim(),
      total: newTotal,
      addedCredit: newAddedCredit,
      partialAmount: newPartial,
      newBalance: newNewBalance,
      remainingBalance: newNewBalance,
      updatedAt: new Date().toISOString()
    };

    const oldCustomerName = (editingBill.customer || '').trim();
    const newCustomerName = editCustomer.trim();

    // Replace the target sale in allSales
    let workingSales = allSales.map(s => 
      (String(s.id) === String(editingBill.id) || String(s.docId) === String(editingBill.docId)) ? updatedSale : s
    );

    // 1. Recalculate debt chain for target new customer
    const resNew = recalculateCustomerDebtChain(
      newCustomerName,
      workingSales,
      allCusts,
      editingBill.id,
      newNewBalance
    );

    workingSales = resNew.newAllSales;
    let workingCusts = resNew.newAllCustomers;
    let salesToSync = [...resNew.updatedSalesForSync];

    // 2. If customer name was changed, also recalculate for the old customer
    if (oldCustomerName && oldCustomerName.toLowerCase() !== newCustomerName.toLowerCase()) {
      const resOld = recalculateCustomerDebtChain(
        oldCustomerName,
        workingSales,
        workingCusts
      );
      workingSales = resOld.newAllSales;
      workingCusts = resOld.newAllCustomers;
      salesToSync = [...salesToSync, ...resOld.updatedSalesForSync];
    }

    // Persist everything to localStorage, sync queue, and broadcast
    persistSalesAndCustomers(
      orgId,
      workingSales,
      workingCusts,
      salesToSync,
      resNew.updatedCustomerForSync
    );

    setSales(workingSales.filter(isCreditBill));
    setEditingBill(null);
    alert('ණය බිල්පත සාර්ථකව යාවත්කාලීන විය! ගනුදෙනුකරුගේ සියලු ණය ශේෂයන් ස්ථීරව සකස් කරන ලදී.\n(Credit bill updated & persistent debt balance recalculated!)');
  };
  
  const isCreditBill = (s: any) => {
    if (!s || s.status === 'cancelled') return false;
    const pt = (s.paymentType || '').toLowerCase();
    const isCreditType = pt === 'credit' || pt === 'half-payment' || pt.includes('credit') || s.mode === 'credit';
    const hasAddedCredit = Number(s.addedCredit || 0) > 0;
    const hasUnpaid = s.mode === 'sale' && Number(s.total || 0) > Number(s.partialAmount || 0) && pt !== 'cash' && pt !== 'cheque';
    return isCreditType || hasAddedCredit || hasUnpaid;
  };

  const orgId = getActiveOrgId();
  const [sales, setSales] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || 
                     localStorage.getItem(`bizflow_MYM-BIZFLOW_sales_v1`) || 
                     localStorage.getItem(`bizflow_default_sales_v1`) || 
                     localStorage.getItem('bizflow_sales_v1');
      if (stored) return JSON.parse(stored).filter(isCreditBill);
    } catch (e) {}
    return [];
  });

  const loadCloudSales = async () => {
    try {
      const data = await fetchTableData('sales');
      if (data && Array.isArray(data)) {
        localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(data));
        localStorage.setItem(`bizflow_MYM-BIZFLOW_sales_v1`, JSON.stringify(data));
        localStorage.setItem('bizflow_sales_v1', JSON.stringify(data));
        setSales(data.filter(isCreditBill));
      }
    } catch (err) {
      console.warn("Failed to fetch sales for CreditBillsTab", err);
    }
  };

  useEffect(() => {
    loadCloudSales();

    const handleSync = (e: any) => {
      const table = e.detail?.table;
      if (table === 'sales') {
        try {
          const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || 
                         localStorage.getItem(`bizflow_MYM-BIZFLOW_sales_v1`) || 
                         localStorage.getItem(`bizflow_default_sales_v1`) || 
                         localStorage.getItem('bizflow_sales_v1');
          if (stored) {
            setSales(JSON.parse(stored).filter(isCreditBill));
          } else if (e.detail?.data && Array.isArray(e.detail.data)) {
            setSales(e.detail.data.filter(isCreditBill));
          }
        } catch (err) {}
      }
    };
    window.addEventListener('bizflow_sync', handleSync);
    window.addEventListener('bizflow_sales_updated', handleSync);
    return () => {
      window.removeEventListener('bizflow_sync', handleSync);
      window.removeEventListener('bizflow_sales_updated', handleSync);
    };
  }, [orgId]);

  const filteredSales = sales.filter(s => {
    const isAdminBill = s.issuedByAdmin || s.repId === 'admin';
    if (sourceFilter === 'admin') return isAdminBill;
    if (sourceFilter === 'rep') return !isAdminBill;
    return true;
  });

  const groupedByDate: { [date: string]: any[] } = {};
  filteredSales.forEach(sale => {
    const rawDate = sale.createdAt || sale.date;
    const dObj = rawDate ? new Date(rawDate) : new Date();
    const dStr = !isNaN(dObj.getTime()) ? dObj.toLocaleDateString() : 'Unknown Date';
    if (!groupedByDate[dStr]) groupedByDate[dStr] = [];
    groupedByDate[dStr].push(sale);
  });

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
    const timeA = new Date(a).getTime() || 0;
    const timeB = new Date(b).getTime() || 0;
    return timeB - timeA;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-bold text-slate-800">Outstanding Credit Bills (දවසින් දවසට ණය බිල් & සංස්කරණය)</h3>
          <p className="text-slate-500 text-sm mt-0.5">Track and edit unpaid bills and previous balances separated day by day.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
            <button 
              onClick={() => setSourceFilter('all')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sourceFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              සියල්ල (All)
            </button>
            <button 
              onClick={() => setSourceFilter('admin')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sourceFilter === 'admin' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              ඇඩ්මින් (Head Office)
            </button>
            <button 
              onClick={() => setSourceFilter('rep')} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sourceFilter === 'rep' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              රෙප් (Field Reps)
            </button>
          </div>
          <button
            onClick={loadCloudSales}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-xl text-xs flex items-center transition-all"
          >
            <RefreshCw size={14} className="mr-1" /> යාවත්කාලීන
          </button>
        </div>
      </div>

      {filteredSales.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-100 text-center text-slate-400 font-medium">No active outstanding credit bills found.</div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(dateStr => {
            const daySales = [...groupedByDate[dateStr]].sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
            const dayTotalCredit = daySales.reduce((acc, s) => {
              const amt = Number(s.addedCredit || (s.total ? s.total - (s.partialAmount || 0) : 0) || 0);
              return acc + amt;
            }, 0);
            return (
              <div key={dateStr} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                    <h4 className="font-display font-bold text-slate-800 text-lg">{dateStr}</h4>
                    <span className="text-xs bg-slate-200 text-slate-700 font-semibold px-2.5 py-0.5 rounded-full">{daySales.length} Bills</span>
                  </div>
                  <div className="text-sm font-bold text-rose-600">
                    Day Credit Total: Rs {dayTotalCredit.toLocaleString()}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-6">ID / Time</th>
                        <th className="py-3 px-6">Customer</th>
                        <th className="py-3 px-6">Issued By</th>
                        <th className="py-3 px-6 text-right">Total Invoice</th>
                        <th className="py-3 px-6 text-right">Added Credit</th>
                        <th className="py-3 px-6 text-right">Remaining Balance</th>
                        <th className="py-3 px-6 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                      {daySales.map((sale, idx) => {
                        const addedCred = Number(sale.addedCredit || (sale.total ? sale.total - (sale.partialAmount || 0) : 0) || 0);
                        const isAdminBill = sale.issuedByAdmin || sale.repId === 'admin';
                        return (
                          <tr key={sale.id || idx} className="hover:bg-slate-50/50">
                            <td className="py-3 px-6 text-slate-500 text-xs">
                              {sale.id || 'INV'} <span className="block text-[10px] text-slate-400">{new Date(sale.createdAt || sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </td>
                            <td className="py-3 px-6 font-semibold text-slate-900">{sale.customer}</td>
                            <td className="py-3 px-6">
                              {isAdminBill ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  ඇඩ්මින් (Head Office)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  රෙප් ({sale.repId})
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-6 text-right">Rs {Number(sale.total || 0).toLocaleString()}</td>
                            <td className="py-3 px-6 text-right text-rose-600 font-bold">Rs {addedCred.toLocaleString()}</td>
                            <td className="py-3 px-6 text-right font-bold text-slate-900">Rs {Number(sale.newBalance || sale.remainingBalance || addedCred).toLocaleString()}</td>
                            <td className="py-3 px-6 text-center">
                              <button
                                onClick={() => handleOpenEditBill(sale)}
                                className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-all"
                              >
                                <Edit2 size={13} /> Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Bill Modal */}
      {editingBill && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-lg w-full p-8 shadow-2xl border border-slate-100 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display text-xl font-bold text-slate-800">Edit Credit Bill / Transaction</h3>
                <p className="text-slate-500 text-xs mt-0.5">Modify bill details, previous arrears, or balance.</p>
              </div>
              <button onClick={() => setEditingBill(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveBillEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Customer Name (ගනුදෙනුකරු)</label>
                <input
                  type="text"
                  value={editCustomer}
                  onChange={e => setEditCustomer(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 text-sm focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Total Invoice (මුළු මුදල)</label>
                  <input
                    type="number"
                    value={editTotal}
                    onChange={e => setEditTotal(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 text-sm focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Added Credit (ණය ප්‍රමාණය)</label>
                  <input
                    type="number"
                    value={editAddedCredit}
                    onChange={e => setEditAddedCredit(e.target.value)}
                    className="w-full p-3 bg-rose-50 border border-rose-200 rounded-xl font-bold text-rose-900 text-sm focus:outline-none focus:border-rose-500"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Partial Paid (ගෙවූ මුදල)</label>
                  <input
                    type="number"
                    value={editPartial}
                    onChange={e => setEditPartial(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Remaining Balance (ඉතිරි ශේෂය)</label>
                  <input
                    type="number"
                    value={editBalance}
                    onChange={e => setEditBalance(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-sm focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBill(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
                >
                  <Save size={14} /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 9. EXPENSES & PAYMENT VOUCHERS TAB ---
export function ExpensesTab() {
  const orgId = getActiveOrgId();
  const orgSettings = getOrganizationSettings();

  const [expenses, setExpenses] = useState<any[]>(() => {
    const stored = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1');
    return stored ? JSON.parse(stored) : [];
  });

  const loadCloudExpenses = async () => {
    try {
      const data = await fetchTableData('expenses');
      if (data && Array.isArray(data)) {
        localStorage.setItem(`bizflow_${orgId}_expenses_v1`, JSON.stringify(data));
        localStorage.setItem('bizflow_expenses_v1', JSON.stringify(data));
        setExpenses(data);
      }
    } catch (err) {
      console.warn("Failed to fetch expenses", err);
    }
  };

  useEffect(() => {
    loadCloudExpenses();

    const handleSync = (e: any) => {
      if (e.detail?.table === 'expenses') {
        const stored = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1');
        if (stored) {
          setExpenses(JSON.parse(stored));
        } else if (e.detail?.data && Array.isArray(e.detail.data)) {
          setExpenses(e.detail.data);
        }
      }
    };
    window.addEventListener('bizflow_sync', handleSync);
    return () => window.removeEventListener('bizflow_sync', handleSync);
  }, [orgId]);

  // Form State for Payment Voucher / Expense
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('General Overhead');
  const [paymentMethod, setPaymentMethod] = useState('Cash / මුදලින්');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState('');
  const [deductFromSettlement, setDeductFromSettlement] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // Toggle Expense Deduction Status
  const toggleExpenseDeduction = (expId: string) => {
    const updated = expenses.map(e => {
      if (e.id === expId) {
        const newStatus = e.deductFromSettlement === false ? true : false;
        return { ...e, deductFromSettlement: newStatus };
      }
      return e;
    });
    setExpenses(updated);
    localStorage.setItem(`bizflow_${orgId}_expenses_v1`, JSON.stringify(updated));
    localStorage.setItem('bizflow_expenses_v1', JSON.stringify(updated));
    const changed = updated.find(e => e.id === expId);
    if (changed) {
      import('../lib/sync').then(({ addToSyncQueue }) => {
        addToSyncQueue({ table: 'expenses', action: 'update', data: changed });
      });
    }
  };

  // Active Voucher Modal for viewing & printing
  const [activeVoucher, setActiveVoucher] = useState<any | null>(null);

  const handleAddExpenseAndGenerateVoucher = (e: React.FormEvent, shouldPrintVoucher = true) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      alert('කරුණාකර වලංගු ගෙවූ මුදලක් ඇතුළත් කරන්න (Please enter a valid paid amount).');
      return;
    }

    const voucherNo = 'PV-' + Math.floor(100000 + Math.random() * 900000);
    const finalPayee = payeeName.trim() || 'General Payee / වෙනත්';

    const newExp = {
      id: 'EXP-' + Date.now(),
      voucherNo,
      payeeName: finalPayee,
      category: category || 'General Overhead',
      amount: parseFloat(amount),
      paymentMethod,
      desc: desc.trim() || 'Payment Outflow / ගෙවීම',
      date: paymentDate || new Date().toLocaleDateString(),
      createdAt: new Date().toISOString(),
      deductFromSettlement,
      organizationId: orgId,
      issuedBy: 'Head Office Admin',
      orgName: orgSettings.name || 'Core System',
      orgAddress: orgSettings.address || '',
      orgPhone: orgSettings.phone || ''
    };

    const updated = [newExp, ...expenses];
    setExpenses(updated);
    localStorage.setItem(`bizflow_${orgId}_expenses_v1`, JSON.stringify(updated));
    localStorage.setItem('bizflow_expenses_v1', JSON.stringify(updated));

    // Sync to cloud
    import('../lib/sync').then(({ addToSyncQueue }) => {
      addToSyncQueue({ table: 'expenses', action: 'insert', data: newExp });
    });

    // Reset Form
    setPayeeName('');
    setAmount('');
    setDesc('');
    setCategory('General Overhead');
    setPaymentMethod('Cash / මුදලින්');
    setIsAdding(false);

    if (shouldPrintVoucher) {
      setActiveVoucher(newExp);
    } else {
      alert(`ගෙවීම් ලේඛනය (${voucherNo}) සාර්ථකව සටහන් විය!`);
    }
  };

  const totalExpenseAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-bold text-slate-800 flex items-center gap-2">
            <DollarSign className="text-rose-600" size={28} />
            ගෙවීම් සහ වියදම් ලේඛනය (Payment Vouchers & Overhead Expenses)
          </h3>
          <p className="text-slate-500 text-sm mt-0.5">
            ආයතනය විසින් සිදුකරන ඕනෑම ගෙවීමකට ගෙවීම් ඉන්වොයිසියක් (Payment Invoice/Voucher) සාදා මුද්‍රණය කරන්න.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-rose-50 border border-rose-100 p-3 rounded-2xl text-rose-800 font-mono font-bold text-xs">
            මුළු වියදම් එකතුව: Rs {totalExpenseAmount.toLocaleString()}
          </div>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-3 rounded-2xl flex items-center shadow-lg shadow-rose-500/20 text-xs transition-all active:scale-95 gap-2"
          >
            <Plus size={18} /> + නව ගෙවීම් බිල්පතක් සාදන්න (New Payment Voucher)
          </button>
        </div>
      </div>

      {/* Payment Voucher Creator Form */}
      {isAdding && (
        <form onSubmit={(e) => handleAddExpenseAndGenerateVoucher(e, true)} className="bg-white p-6 rounded-3xl border-2 border-rose-200 shadow-xl space-y-6 animate-in fade-in zoom-in duration-200">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <FileText className="text-rose-600" size={22} />
                ගෙවීම් ඉන්වොයිසි විස්තර (Create Payment Invoice / Voucher)
              </h4>
              <p className="text-xs text-slate-500">ගෙවීම ලැබූ තැනැත්තා සහ මුදල ඇතුළත් කර ඉන්වොයිසිය මුද්‍රණය කරන්න.</p>
            </div>
            <button type="button" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-700 p-2">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Payee Name */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-700 uppercase mb-1">
                1. කාටද ගෙව්වේ (Paid To / Payee Name) *
              </label>
              <input
                type="text"
                placeholder="Ex: K. Silva, Ceylon Electricity Board, Landlord..."
                value={payeeName}
                onChange={e => setPayeeName(e.target.value)}
                className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 ring-rose-500/20 focus:border-rose-500 text-sm"
                required
              />
            </div>

            {/* Amount Paid */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-700 uppercase mb-1">
                2. ගෙවූ මුදල (Amount Paid Rs) *
              </label>
              <input
                type="number"
                placeholder="0.00"
                step="any"
                min="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl font-mono font-black text-rose-600 text-lg focus:outline-none focus:ring-2 ring-rose-500/20 focus:border-rose-500"
                required
              />
            </div>

            {/* Category */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-700 uppercase mb-1">
                3. ගෙවීම් වර්ගය (Payment Category)
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 ring-rose-500/20 text-sm"
              >
                <option value="General Overhead">General Overhead / සාමාන්‍ය පිරිවැය</option>
                <option value="Electricity & Utilities">Electricity & Utilities / විදුලි, ජල, දුරකථන</option>
                <option value="Building Rent">Building Rent / ගොඩනැගිලි කුලී</option>
                <option value="Transport & Fuel">Transport & Fuel / ප්‍රවාහන සහ ඉන්ධන</option>
                <option value="Supplier Payment">Supplier Payment / සැපයුම්කරු ගෙවීම්</option>
                <option value="Salary / Advance">Salary / Advance / වේතන සහ අත්තිකාරම්</option>
                <option value="Maintenance & Repair">Maintenance & Repair / නඩත්තු සහ අලුත්වැඩියා</option>
                <option value="Printing & Stationery">Printing & Stationery / මුද්‍රණ සහ ලිපිද්‍රව්‍ය</option>
                <option value="Other">Other / වෙනත්</option>
              </select>
            </div>

            {/* Payment Method */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-700 uppercase mb-1">
                4. ගෙවීම් ආකාරය (Payment Method)
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl font-semibold text-slate-800 text-sm"
              >
                <option value="Cash / මුදලින්">Cash / මුදලින්</option>
                <option value="Bank Transfer / බැංකු හුවමාරුව">Bank Transfer / බැංකු හුවමාරුව</option>
                <option value="Cheque / චෙක්පතින්">Cheque / චෙක්පතින්</option>
              </select>
            </div>

            {/* Payment Date */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-700 uppercase mb-1">
                5. දිනය (Payment Date)
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl font-medium text-slate-800 text-sm"
              />
            </div>

            {/* Description / Reason */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-700 uppercase mb-1">
                6. ගෙවීමට හේතුව / විස්තරය (Description)
              </label>
              <input
                type="text"
                placeholder="Ex: Electricity Bill July 2026, Office Maintenance..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
                className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl text-sm"
              />
            </div>

            {/* Deduction Status Selector */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-700 uppercase mb-1">
                7. සෙට්ල්මන්ට් / ලාභයෙන් අඩු කිරීම
              </label>
              <select
                value={deductFromSettlement ? 'true' : 'false'}
                onChange={e => setDeductFromSettlement(e.target.value === 'true')}
                className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl font-semibold text-slate-800 text-sm"
              >
                <option value="true">සෙට්ල්මන්ට් & ලාභයෙන් අඩු කරන්න (Deduct from Settlement & Profit)</option>
                <option value="false">වෙනත් වියදම් - සෙට්ල්මන්ට්/ලාභයෙන් නොඅඩු කරන්න (Don't Deduct - Other Expense)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700 text-xs transition-all"
            >
              අවලංගු කරන්න (Cancel)
            </button>
            <button
              type="button"
              onClick={(e) => handleAddExpenseAndGenerateVoucher(e, false)}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Save size={16} /> සටහන් කරන්න පමණක් (Save Record Only)
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-2"
            >
              <Printer size={16} /> ඉන්වොයිසිය සාදා මුද්‍රණය කරන්න (Generate & Print Invoice)
            </button>
          </div>
        </form>
      )}

      {/* Expense & Payment Vouchers History Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <th className="py-4 px-5">Voucher No</th>
              <th className="py-4 px-5">දිනය (Date)</th>
              <th className="py-4 px-5">කාටද ගෙව්වේ (Paid To)</th>
              <th className="py-4 px-5">ගෙවීම් වර්ගය (Category)</th>
              <th className="py-4 px-5">ක්‍රමය (Method)</th>
              <th className="py-4 px-5">විස්තරය (Description)</th>
              <th className="py-4 px-5 text-center">සෙට්ල්මන්ට් Status</th>
              <th className="py-4 px-5 text-right">ගෙවූ මුදල (Amount)</th>
              <th className="py-4 px-5 text-center">ඉන්වොයිසිය</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                  තවමත් කිසිදු ගෙවීම් බිල්පතක් සාදා නැත. උඩින් "+ නව ගෙවීම් බිල්පතක් සාදන්න" එකතු කරන්න.
                </td>
              </tr>
            ) : (
              expenses.map((exp, idx) => (
                <tr key={exp.id || idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-5 font-mono font-bold text-rose-600">
                    {exp.voucherNo || `EXP-${String(idx + 1).padStart(4, '0')}`}
                  </td>
                  <td className="py-3.5 px-5 text-slate-500 font-medium">{exp.date}</td>
                  <td className="py-3.5 px-5 font-bold text-slate-900">{exp.payeeName || exp.payee || 'General Overhead'}</td>
                  <td className="py-3.5 px-5 font-semibold text-slate-700">{exp.category || 'General'}</td>
                  <td className="py-3.5 px-5 text-slate-500">{exp.paymentMethod || 'Cash'}</td>
                  <td className="py-3.5 px-3 text-slate-500">{exp.desc || exp.description || '-'}</td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => toggleExpenseDeduction(exp.id)}
                      title="ක්ලික් කර සෙට්ල්මන්ට්/ලාභයෙන් අඩු කිරීම වෙනස් කරන්න"
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        exp.deductFromSettlement !== false
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                      }`}
                    >
                      {exp.deductFromSettlement !== false ? '✓ සෙට්ල්මන්ට් වියදම් (Deducted)' : '⚠️ වෙනත් වියදම් (Non-Deducted)'}
                    </button>
                  </td>
                  <td className="py-3.5 px-5 text-right font-mono font-bold text-rose-600 text-sm">
                    Rs {Number(exp.amount).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    <button
                      onClick={() => setActiveVoucher(exp)}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-xl border border-blue-200 transition-all flex items-center justify-center gap-1.5 mx-auto text-[11px]"
                    >
                      <Printer size={13} /> View / Print Invoice
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* --- PAYMENT VOUCHER / INVOICE PRINT MODAL --- */}
      {activeVoucher && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-slate-200 space-y-6 relative animate-in fade-in zoom-in duration-200">
            {/* Modal Controls (Non-printable) */}
            <div className="print:hidden flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                <Check size={18} /> ගෙවීම් ඉන්වොයිසිය සූදානම් (Payment Invoice Ready)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 text-xs"
                >
                  <Printer size={16} /> 🖨️ Print Invoice (මුද්‍රණය කරන්න)
                </button>
                <button
                  onClick={() => setActiveVoucher(null)}
                  className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* PRINTABLE PAYMENT VOUCHER INVOICE */}
            <div id="payment-voucher-invoice" className="bg-white p-6 rounded-2xl border border-slate-300 space-y-6 text-slate-900 font-sans">
              {/* Header */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-wider text-slate-900">
                    {activeVoucher.orgName || orgSettings.name || 'CORE SYSTEM'}
                  </h2>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">{activeVoucher.orgAddress || orgSettings.address}</p>
                  {activeVoucher.orgPhone && <p className="text-xs text-slate-600 font-medium">Tel: {activeVoucher.orgPhone || orgSettings.phone}</p>}
                </div>

                <div className="text-right">
                  <div className="inline-block bg-slate-900 text-white font-black text-xs px-3 py-1 uppercase rounded tracking-widest mb-1">
                    PAYMENT VOUCHER / INVOICE
                  </div>
                  <p className="text-sm font-mono font-bold text-rose-600">{activeVoucher.voucherNo || activeVoucher.id}</p>
                  <p className="text-xs text-slate-500 font-semibold">{activeVoucher.date}</p>
                </div>
              </div>

              {/* Payee Details Grid */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">ගෙවීම ලැබූ පුද්ගලයා / ආයතනය (PAID TO):</span>
                  <span className="text-base font-bold text-slate-900">{activeVoucher.payeeName || activeVoucher.payee || 'General Payee'}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">ගෙවීම් ආකාරය (PAYMENT METHOD):</span>
                  <span className="text-sm font-semibold text-slate-800">{activeVoucher.paymentMethod || 'Cash / මුදලින්'}</span>
                </div>
              </div>

              {/* Table of Details */}
              <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="py-2.5 px-3 border-r border-slate-300">ගෙවීම් වර්ගය (Category)</th>
                    <th className="py-2.5 px-3 border-r border-slate-300">විස්තරය / හේතුව (Reason / Description)</th>
                    <th className="py-2.5 px-3 text-right">ගෙවූ මුදල (Amount Paid Rs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  <tr>
                    <td className="py-3 px-3 border-r border-slate-200 font-bold text-slate-800">
                      {activeVoucher.category || 'General Overhead'}
                    </td>
                    <td className="py-3 px-3 border-r border-slate-200 text-slate-700">
                      {activeVoucher.desc || activeVoucher.description || 'Outflow Payment'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 text-sm">
                      Rs {Number(activeVoucher.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-bold">
                    <td colSpan={2} className="py-3 px-4 text-right uppercase text-xs tracking-wider border-r border-slate-800">
                      ගෙවූ මුළු මුදල (TOTAL AMOUNT PAID):
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-base text-rose-400">
                      Rs {Number(activeVoucher.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Signatures */}
              <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs text-slate-600 font-semibold">
                <div>
                  <div className="border-t-2 border-slate-800 pt-1.5 font-bold text-slate-900 uppercase">
                    අනුමත කළේ (Authorized / Prepared By)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{activeVoucher.issuedBy || 'Head Office Admin'}</div>
                </div>

                <div>
                  <div className="border-t-2 border-slate-800 pt-1.5 font-bold text-slate-900 uppercase">
                    ගෙවීම් මුදල ලබාගත්තේ (Received By Payee Signature)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Payee Signature & Date</div>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center text-[10px] text-slate-400 border-t border-slate-100 pt-3">
                * Official Payment Voucher generated by {activeVoucher.orgName || orgSettings.name}.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 10. CASH BOOK TAB ---
export function CashBookTab() {
  const orgId = getActiveOrgId();
  const [selectedDate, setSelectedDate] = useState<string>('all'); // 'all', 'today', or YYYY-MM-DD
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedRepId, setSelectedRepId] = useState<string>('admin');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState('IN');
  const [amount, setAmount] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const allUsers = getUsers();
  const repsList = allUsers.filter(u => u.role !== 'admin');

  // Clear legacy fake cashbook data from localStorage if present
  useEffect(() => {
    const legacy = localStorage.getItem('bizflow_cashbook_v1');
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        const hasFake = parsed.some((item: any) => item.id === '1' || item.id === '2' || item.desc === 'Direct Sale Inflow');
        if (hasFake) {
          localStorage.removeItem('bizflow_cashbook_v1');
        }
      } catch (e) {
        localStorage.removeItem('bizflow_cashbook_v1');
      }
    }
  }, []);

  // 1. Load Custom Manual Cashbook Entries
  const [manualEntries, setManualEntries] = useState<any[]>(() => {
    const stored = localStorage.getItem(`bizflow_${orgId}_manual_cashbook_v1`) || localStorage.getItem('bizflow_manual_cashbook_v1');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.filter((e: any) => e.id !== '1' && e.id !== '2' && e.desc !== 'Direct Sale Inflow');
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  // 2. Real System Transactions Reactive State
  const [allSales, setAllSales] = useState<any[]>(() => {
    const salesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
    try { return JSON.parse(salesStr); } catch (e) { return []; }
  });

  const [allExpenses, setAllExpenses] = useState<any[]>(() => {
    const expStr = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1') || '[]';
    try { return JSON.parse(expStr); } catch (e) { return []; }
  });

  const [aiActionRequests, setAiActionRequests] = useState<any[]>(() => getAIActionRequests());

  // Function to reload & sync data from local and Firestore cloud
  const reloadData = async () => {
    setIsRefreshing(true);
    // Sync local storage state
    const salesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
    try { setAllSales(JSON.parse(salesStr)); } catch (e) {}

    const expStr = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1') || '[]';
    try { setAllExpenses(JSON.parse(expStr)); } catch (e) {}

    const manualStored = localStorage.getItem(`bizflow_${orgId}_manual_cashbook_v1`) || localStorage.getItem('bizflow_manual_cashbook_v1');
    if (manualStored) {
      try {
        setManualEntries(JSON.parse(manualStored).filter((e: any) => e.id !== '1' && e.id !== '2' && e.desc !== 'Direct Sale Inflow'));
      } catch (e) {}
    }

    setAiActionRequests(getAIActionRequests());

    // Fetch live from Firestore
    try {
      const [fetchedSales, fetchedExpenses, fetchedRequests, fetchedCashbook] = await Promise.all([
        fetchTableData('sales'),
        fetchTableData('expenses'),
        fetchTableData('aiactions'),
        fetchTableData('cashbook')
      ]);

      if (fetchedSales && Array.isArray(fetchedSales)) setAllSales(fetchedSales);
      if (fetchedExpenses && Array.isArray(fetchedExpenses)) setAllExpenses(fetchedExpenses);
      if (fetchedRequests && Array.isArray(fetchedRequests)) setAiActionRequests(fetchedRequests);
      
      if (fetchedCashbook && Array.isArray(fetchedCashbook) && fetchedCashbook.length > 0) {
        const cloudManuals = fetchedCashbook.filter((e: any) => e.id !== '1' && e.id !== '2' && e.desc !== 'Direct Sale Inflow');
        if (cloudManuals.length > 0) {
          const mergedMap = new Map<string, any>();
          manualEntries.forEach(m => { if (m && m.id) mergedMap.set(String(m.id), m); });
          cloudManuals.forEach(m => { if (m && m.id) mergedMap.set(String(m.id), m); });
          const finalManuals = Array.from(mergedMap.values());
          setManualEntries(finalManuals);
          localStorage.setItem(`bizflow_${orgId}_manual_cashbook_v1`, JSON.stringify(finalManuals));
        }
      }
    } catch (err) {
      console.warn('CashBook sync notice:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    reloadData();

    const handleSync = (e: any) => {
      const table = e.detail?.table;
      if (!table || table === 'sales' || table === 'expenses' || table === 'aiactions' || table === 'cashbook') {
        const salesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
        try { setAllSales(JSON.parse(salesStr)); } catch (e) {}

        const expStr = localStorage.getItem(`bizflow_${orgId}_expenses_v1`) || localStorage.getItem('bizflow_expenses_v1') || '[]';
        try { setAllExpenses(JSON.parse(expStr)); } catch (e) {}

        setAiActionRequests(getAIActionRequests());
      }
    };

    window.addEventListener('bizflow_sync', handleSync);
    return () => window.removeEventListener('bizflow_sync', handleSync);
  }, []);

  const saveManualEntries = (updated: any[]) => {
    setManualEntries(updated);
    localStorage.setItem(`bizflow_${orgId}_manual_cashbook_v1`, JSON.stringify(updated));
  };

  const handleAddFlow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amount) return;

    const now = new Date();
    const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const newFlow = {
      id: 'manual_' + Date.now().toString(),
      timestamp: Date.now(),
      dateStr: now.toLocaleString(),
      dateKey: todayYMD,
      desc,
      type,
      amount: parseFloat(amount),
      category: type === 'IN' ? 'කාර්යාල ලැබීම් (Manual Inflow)' : 'කාර්යාල පිටවීම් (Manual Outflow)'
    };
    const updated = [newFlow, ...manualEntries];
    saveManualEntries(updated);
    addToSyncQueue({ table: 'cashbook', action: 'insert', data: newFlow });

    setDesc(''); setAmount(''); setIsAdding(false);
  };

  const handleDeleteManual = (id: string) => {
    if (window.confirm('මෙම සටහන මකා දැමීමට තහවුරු කරන්න (Delete entry?)')) {
      const updated = manualEntries.filter(m => m.id !== id);
      saveManualEntries(updated);
      addToSyncQueue({ table: 'cashbook', action: 'delete', data: { id } });
    }
  };

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

  // Approved Handovers
  const approvedHandovers = aiActionRequests.filter(r => r.actionType === 'handover_admin' && r.status === 'Approved');

  // Build Transaction Journal Entries
  const allJournalEntries: any[] = [];

  // (A) Real Sales & Collections Inflows
  allSales.filter(s => s.status !== 'cancelled').filter(s => {
    if (selectedRepId === 'admin') {
      return s.issuedByAdmin || s.repId === 'admin' || !s.repId;
    }
    return s.repId === selectedRepId || s.coRepId === selectedRepId;
  }).forEach(s => {
    const rawDate = s.createdAt || s.date || Date.now();
    const d = typeof rawDate === 'number' ? new Date(rawDate) : new Date(rawDate);
    const timestamp = isNaN(d.getTime()) ? Date.now() : d.getTime();
    const dateKey = getItemDateKey(s);

    if (s.mode === 'sale') {
      const cashIn = getSaleCashInflow(s);
      if (cashIn > 0) {
        allJournalEntries.push({
          id: 'sale_' + s.id,
          timestamp,
          dateKey,
          dateStr: formatSinhalaDate(timestamp, { includeTime: true }),
          desc: `අලෙවි බිල්පත (Sales Invoice): ${s.customer || 'Cash Customer'} (${s.id})`,
          type: 'IN',
          amount: cashIn,
          category: 'අලෙවිය (Sale)',
          isManual: false
        });
      }
    } else if (s.mode === 'credit' || s.creditReceivedAmount > 0) {
      const cashIn = Number(s.creditReceivedAmount || s.partialAmount || 0);
      if (cashIn > 0 && s.paymentType !== 'Cheque') {
        allJournalEntries.push({
          id: 'coll_' + s.id,
          timestamp,
          dateKey,
          dateStr: formatSinhalaDate(timestamp, { includeTime: true }),
          desc: `ණය ලැබීම (Credit Collection): ${s.customer || 'Customer'} (${s.id})`,
          type: 'IN',
          amount: cashIn,
          category: 'ණය ලැබීම් (Collection)',
          isManual: false
        });
      }
    }
  });

  // (B) Real Expenses Outflows
  allExpenses.filter(e => {
    if (selectedRepId === 'admin') {
      return !e.repId || e.repId === 'admin';
    }
    return e.repId === selectedRepId || e.rep === repsList.find(r => r.id === selectedRepId)?.name;
  }).forEach(e => {
    const rawDate = e.createdAt || e.date || Date.now();
    const d = typeof rawDate === 'number' ? new Date(rawDate) : new Date(rawDate);
    const timestamp = isNaN(d.getTime()) ? Date.now() : d.getTime();
    const dateKey = getItemDateKey(e);

    allJournalEntries.push({
      id: 'exp_' + (e.id || timestamp),
      timestamp,
      dateKey,
      dateStr: formatSinhalaDate(timestamp, { includeTime: true }),
      desc: e.description || e.category || 'වියදම (Expense)',
      type: 'OUT',
      amount: Number(e.amount || 0),
      category: 'වියදම් (Expense)',
      isManual: false
    });
  });

  // (C) Rep Cash Handover Inflows to Admin
  approvedHandovers.filter(r => {
    if (selectedRepId === 'admin') return true;
    return r.repId === selectedRepId;
  }).forEach(r => {
    const timestamp = Number(r.timestamp || Date.now());
    const dateKey = getItemDateKey(r);

    const isRep = selectedRepId !== 'admin';

    allJournalEntries.push({
      id: 'ho_' + r.id,
      timestamp,
      dateKey,
      dateStr: formatSinhalaDate(timestamp, { includeTime: true }),
      desc: isRep ? 'ඇඩ්මින්ට මුදල් භාරදීම (Admin Cash Handover)' : `අලෙවි නියෝජිත මුදල් භාරදීම: ${r.repName || 'Rep'}`,
      type: isRep ? 'OUT' : 'IN',
      amount: Number(r.payload?.amount || 0),
      category: 'නියෝජිත භාරදීම් (Rep Handover)',
      isManual: false
    });
  });

  // (D) Custom Manual Cashbook Entries
  if (selectedRepId === 'admin') {
    manualEntries.forEach(m => {
      allJournalEntries.push({
        id: m.id,
        timestamp: m.timestamp || Date.now(),
        dateKey: getItemDateKey(m),
        dateStr: m.dateStr || formatSinhalaDate(m.timestamp || Date.now(), { includeTime: true }),
        desc: m.desc,
        type: m.type,
        amount: Number(m.amount || 0),
        category: m.category || 'කාර්යාල සටහන් (Office Ledger)',
        isManual: true
      });
    });
  }

  // Sort chronologically ascending to compute running balance correctly
  allJournalEntries.sort((a, b) => a.timestamp - b.timestamp);

  let runningBalance = 0;
  const entriesWithBalance = allJournalEntries.map(entry => {
    if (entry.type === 'IN') {
      runningBalance += entry.amount;
    } else {
      runningBalance -= entry.amount;
    }
    return { ...entry, runningBalance };
  });

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Filter entries based on selectedDate
  const filteredEntries = entriesWithBalance.filter(entry => {
    if (selectedDate === 'today') {
      return entry.dateKey === todayStr;
    } else if (selectedDate !== 'all' && selectedDate) {
      return entry.dateKey === selectedDate;
    }
    return true;
  }).filter(entry => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return entry.desc.toLowerCase().includes(q) || entry.category.toLowerCase().includes(q);
  });

  // Calculate totals for displayed view
  const totalIn = filteredEntries.filter(c => c.type === 'IN').reduce((acc, curr) => acc + curr.amount, 0);
  const totalOut = filteredEntries.filter(c => c.type === 'OUT').reduce((acc, curr) => acc + curr.amount, 0);
  const netBalance = runningBalance; // Net overall system cash balance

  // Calculate Gross Profit, Expenses & Net Profit for selected view
  const adminInventory = getAdminInventory();
  const adminCostMap = new Map<string, number>();
  (adminInventory || []).forEach((item: any) => {
    if (item && item.id) adminCostMap.set(String(item.id), Number(item.costPrice) || Number(item.maxPrice) || 0);
  });

  let computedGrossProfit = 0;
  const filteredSalesForProfit = (allSales || []).filter(s => s.status !== 'cancelled').filter(s => {
    if (selectedRepId === 'admin') {
      return s.issuedByAdmin || s.repId === 'admin' || !s.repId;
    }
    return s.repId === selectedRepId || s.coRepId === selectedRepId;
  }).filter(s => {
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
    if (selectedRepId === 'admin') {
      return !e.repId || e.repId === 'admin';
    }
    return e.repId === selectedRepId || e.rep === repsList.find(r => r.id === selectedRepId)?.name;
  }).filter(e => {
    if (selectedDate === 'today') return getItemDateKey(e) === todayStr;
    if (selectedDate !== 'all' && selectedDate) return getItemDateKey(e) === selectedDate;
    return true;
  });

  const deductibleExpensesList = filteredExpensesForProfit.filter(e => e.deductFromSettlement !== false);
  const nonDeductibleExpensesList = filteredExpensesForProfit.filter(e => e.deductFromSettlement === false);

  const computedExpensesTotal = deductibleExpensesList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const computedOtherExpensesTotal = nonDeductibleExpensesList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const computedNetProfit = computedGrossProfit - computedExpensesTotal;

  // Reverse for newest first view in table
  const displayEntries = [...filteredEntries].reverse();

  return (
    <div className="space-y-6">
      {/* Header & Date Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h3 className="font-display text-2xl font-bold text-slate-800">මුදල් පොත (Cash Book)</h3>
          <p className="text-xs text-slate-500 mt-0.5">සජීවී අලෙවි, ණය ලැබීම්, වියදම් සහ භාරදීම් සටහන් (දවස ගානේ අප්ඩේට් වේ)</p>
        </div>
        
        {/* Rep & Date Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={reloadData}
            disabled={isRefreshing}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all flex items-center gap-1.5 mr-2"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            යාවත්කාලීන කරන්න
          </button>
          <select
            value={selectedRepId}
            onChange={(e) => setSelectedRepId(e.target.value)}
            className="px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white mr-2"
          >
            <option value="admin">Head Office (කාර්යාලය)</option>
            {repsList.map(r => (
              <option key={r.id} value={r.id}>{r.name} (නියෝජිත)</option>
            ))}
          </select>
          <button 
            onClick={() => setSelectedDate('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${selectedDate === 'all' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            සියල්ල (All Time)
          </button>
          <button 
            onClick={() => setSelectedDate('today')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${selectedDate === 'today' ? 'bg-blue-600 text-white shadow-md' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
          >
            අද දින (Today)
          </button>
          <input 
            type="date"
            value={selectedDate !== 'all' && selectedDate !== 'today' ? selectedDate : ''}
            onChange={e => setSelectedDate(e.target.value || 'all')}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Profit & Loss Breakdown Card */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl font-bold text-sm">📊</span>
            <h4 className="font-bold text-base sm:text-lg text-slate-100">
              ලාභය සහ වියදම් සාරාංශය (Profit & Loss Breakdown)
            </h4>
          </div>
          <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-full w-fit">
            {selectedRepId === 'admin' ? 'Head Office' : (repsList.find(r => r.id === selectedRepId)?.name || selectedRepId)} • {selectedDate === 'all' ? 'සියලු කාලයම' : selectedDate === 'today' ? 'අද දින' : selectedDate}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
              අලෙවි ලාභය (Gross Profit)
            </span>
            <div className="text-2xl font-black text-emerald-400">Rs {computedGrossProfit.toLocaleString()}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              බිල්පත් අලෙවි ලාභයේ එකතුව
            </span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60">
            <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider block mb-1">
              සෙට්ල්මන්ට් වියදම් (Deducted)
            </span>
            <div className="text-2xl font-black text-rose-400">- Rs {computedExpensesTotal.toLocaleString()}</div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              ලාභයෙන් අඩු කළ වියදම්
            </span>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/80 to-teal-900/80 p-4 rounded-2xl border border-emerald-500/40">
            <span className="text-xs font-semibold text-emerald-200 uppercase tracking-wider block mb-1">
              ශුද්ධ ලාභය (Net Profit)
            </span>
            <div className="text-2xl font-black text-white">Rs {computedNetProfit.toLocaleString()}</div>
            <span className="text-[11px] text-emerald-200/80 mt-1 block font-medium">
              = අලෙවි ලාභය - සෙට්ල්මන්ට් වියදම්
            </span>
          </div>

          <div className="bg-amber-950/40 p-4 rounded-2xl border border-amber-500/40">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block mb-1">
              වෙනත් වියදම් (Non-Deducted)
            </span>
            <div className="text-2xl font-black text-amber-300">Rs {computedOtherExpensesTotal.toLocaleString()}</div>
            <span className="text-[11px] text-amber-200/70 mt-1 block font-medium">
              සෙට්ල්මන්ට්/ලාභයෙන් නොඅඩු කළ
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex justify-between items-center shadow-sm">
          <div>
            <span className="text-emerald-800 text-xs font-bold uppercase tracking-wider">
              {selectedDate === 'today' ? 'අද මුළු ලැබීම් (Today Inflows)' : 'මුළු එකතු වූ ලැබීම් (Inflows)'}
            </span>
            <h3 className="text-2xl font-black text-emerald-900 mt-1">Rs {totalIn.toLocaleString()}</h3>
          </div>
          <ArrowDownLeft className="text-emerald-600" size={32} />
        </div>
        
        <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl flex justify-between items-center shadow-sm">
          <div>
            <span className="text-rose-800 text-xs font-bold uppercase tracking-wider">
              {selectedDate === 'today' ? 'අද මුළු පිටවීම් (Today Outflows)' : 'මුළු වියදම්/පිටවීම් (Outflows)'}
            </span>
            <h3 className="text-2xl font-black text-rose-900 mt-1">Rs {totalOut.toLocaleString()}</h3>
          </div>
          <ArrowUpRight className="text-rose-600" size={32} />
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 rounded-2xl flex justify-between items-center shadow-lg relative overflow-hidden">
          <div className="z-10">
            <span className="text-blue-100 text-xs font-bold uppercase tracking-wider">වත්මන් මුළු ශේෂය (Current Cash Balance)</span>
            <h3 className="text-2xl font-black mt-1">Rs {netBalance.toLocaleString()}</h3>
          </div>
          <DollarSign className="text-white/80 z-10" size={36} />
          <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-white/10 rounded-full blur-xl"></div>
        </div>
      </div>

      {/* Actions & Search */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-2">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="සටහන් සොයන්න (Search ledger)..." 
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 shadow-sm"
          />
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)} 
          className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5"
        >
          <Plus size={16} /> කාර්යාල සටහනක් ඇතුළත් කරන්න (Manual Entry)
        </button>
      </div>

      {/* Manual Entry Form */}
      {isAdding && (
        <form onSubmit={handleAddFlow} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-inner">
          <input 
            type="text" 
            placeholder="විස්තරය (Description)" 
            value={desc} 
            onChange={e => setDesc(e.target.value)} 
            className="bg-white p-3 border border-slate-200 rounded-xl text-xs font-bold" 
            required 
          />
          <input 
            type="number" 
            placeholder="මුදල (Rs)" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            className="bg-white p-3 border border-slate-200 rounded-xl text-xs font-bold" 
            required 
          />
          <select 
            value={type} 
            onChange={e => setType(e.target.value)} 
            className="bg-white p-3 border border-slate-200 rounded-xl text-xs font-bold"
          >
            <option value="IN">ලැබීමක් (Cash Inflow)</option>
            <option value="OUT">පිටවීමක් (Cash Outflow)</option>
          </select>
          <div className="md:col-span-3 flex justify-end gap-2 mt-2">
            <button 
              type="button" 
              onClick={() => setIsAdding(false)} 
              className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-slate-700 text-xs"
            >
              අවලංගු කරන්න
            </button>
            <button 
              type="submit" 
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5"
            >
              <Save size={16} /> එකතු කරන්න (Save Entry)
            </button>
          </div>
        </form>
      )}

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        {displayEntries.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-xs">තෝරාගත් දිනය සඳහා මුදල් පොතේ සටහන් කිසිවක් නැත</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-4 px-6">දිනය සහ වේලාව</th>
                <th className="py-4 px-6">විස්තරය</th>
                <th className="py-4 px-6 text-center">වර්ගය</th>
                <th className="py-4 px-6 text-right">ලැබීම් (+)</th>
                <th className="py-4 px-6 text-right">පිටවීම් (-)</th>
                <th className="py-4 px-6 text-right">ශේෂය (Running Bal)</th>
                <th className="py-4 px-6 text-center">ක්‍රියාමාර්ග</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-slate-700 text-xs">
              {displayEntries.map((flow) => (
                <tr key={flow.id} className="hover:bg-slate-50/50">
                  <td className="py-4 px-6 text-slate-500 whitespace-nowrap">{flow.dateStr}</td>
                  <td className="py-4 px-6 font-semibold text-slate-900">{flow.desc}</td>
                  <td className="py-4 px-6 text-center whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${flow.type === 'IN' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                      {flow.category}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right font-bold text-emerald-600 whitespace-nowrap">
                    {flow.type === 'IN' ? `+ Rs ${flow.amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="py-4 px-6 text-right font-bold text-rose-600 whitespace-nowrap">
                    {flow.type === 'OUT' ? `- Rs ${flow.amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="py-4 px-6 text-right font-extrabold text-slate-900 bg-slate-50/50 whitespace-nowrap">
                    Rs {flow.runningBalance.toLocaleString()}
                  </td>
                  <td className="py-4 px-6 text-center whitespace-nowrap">
                    {flow.isManual ? (
                      <button 
                        onClick={() => handleDeleteManual(flow.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-300 italic">පද්ධති සටහනකි</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- 11. PAYMENT HISTORY TAB ---
export function PaymentHistoryTab({ repsList }: { repsList: any[] }) {
  const orgId = getActiveOrgId();
  const [viewMode, setViewMode] = useState<'payments' | 'settlements'>('payments');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'admin' | 'rep'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [payments, setPayments] = useState<any[]>(() => {
    const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
    if (stored) return JSON.parse(stored);
    return [];
  });

  const loadCloudPayments = async () => {
    try {
      const data = await fetchTableData('sales');
      if (data && Array.isArray(data)) {
        setPayments(data);
      }
    } catch (err) {
      console.warn("Failed to fetch payments", err);
    }
  };

  useEffect(() => {
    loadCloudPayments();

    const handleSync = (e: any) => {
      if (e.detail?.table === 'sales') {
        if (e.detail?.data && Array.isArray(e.detail.data)) {
          setPayments(e.detail.data);
        } else {
          const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
          if (stored) setPayments(JSON.parse(stored));
        }
      }
    };

    window.addEventListener('bizflow_sync', handleSync);
    return () => window.removeEventListener('bizflow_sync', handleSync);
  }, [orgId]);

  const filteredPayments = payments
    .filter(p => {
      const isAdmin = p.issuedByAdmin || p.repId === 'admin';
      if (sourceFilter === 'admin' && !isAdmin) return false;
      if (sourceFilter === 'rep' && isAdmin) return false;

      if (statusFilter === 'active' && p.status === 'cancelled') return false;
      if (statusFilter === 'cancelled' && p.status !== 'cancelled') return false;

      return true;
    })
    .sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex bg-slate-200/80 p-1 rounded-2xl w-fit border border-slate-300/50">
        <button
          onClick={() => setViewMode('payments')}
          className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
            viewMode === 'payments' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          💳 පාරිභෝගික ගෙවීම් (Customer Payments)
        </button>
        <button
          onClick={() => setViewMode('settlements')}
          className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
            viewMode === 'settlements' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📊 දිනපතා රෙප් ගිණුම් බේරීම් (Daily Rep Settlements)
        </button>
      </div>

      {viewMode === 'settlements' ? (
        <DailySettlementsTab lang="si" repsList={repsList} />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl font-bold text-slate-800">Customers Payment History</h3>
              <p className="text-slate-500 text-sm mt-0.5">Audit log of payments, cheque clearances, and credit settlements.</p>
            </div>
            <div className="flex flex-wrap gap-2 self-start sm:self-auto">
              <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
                <button 
                  onClick={() => setSourceFilter('all')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sourceFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  සියල්ල (All)
                </button>
                <button 
                  onClick={() => setSourceFilter('admin')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sourceFilter === 'admin' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  ඇඩ්මින් (Head Office)
                </button>
                <button 
                  onClick={() => setSourceFilter('rep')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sourceFilter === 'rep' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  රෙප් (Field Reps)
                </button>
              </div>

              <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
                <button 
                  onClick={() => setStatusFilter('all')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  සියලු බිල්
                </button>
                <button 
                  onClick={() => setStatusFilter('active')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  සක්‍රීය (Active)
                </button>
                <button 
                  onClick={() => setStatusFilter('cancelled')} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === 'cancelled' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  ❌ අවලංගු කළ බිල් (Cancelled)
                </button>
              </div>
            </div>
          </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        {filteredPayments.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-medium">No payment history found.</div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-4 px-6">Date</th>
                <th className="py-4 px-6">Invoice / Receipt No</th>
                <th className="py-4 px-6">Customer</th>
                <th className="py-4 px-6">Issued By</th>
                <th className="py-4 px-6">Pay Mode</th>
                <th className="py-4 px-6 text-right">Amount Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
              {filteredPayments.map((p, idx) => {
                const isAdmin = p.issuedByAdmin || p.repId === 'admin';
                const isCancelled = p.status === 'cancelled';
                return (
                  <tr key={p.id || idx} className={`hover:bg-slate-50/50 ${isCancelled ? 'bg-rose-50/30' : ''}`}>
                    <td className="py-4 px-6 text-slate-500">
                      {new Date(p.createdAt || p.date || Date.now()).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 font-mono text-xs uppercase">
                      <span className={isCancelled ? 'line-through text-slate-400' : 'text-slate-600 font-bold'}>{p.id}</span>
                      {isCancelled && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 block w-fit mt-1">
                          ❌ අවලංගු කළ බිලක් (Cancelled)
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-slate-900">{p.customer}</div>
                      {isCancelled && (
                        <div className="mt-1 p-2 bg-rose-100/70 border border-rose-200 rounded-lg text-xs text-rose-950 font-medium max-w-xs">
                          <span className="font-bold text-rose-800 block">⚠️ අවලංගු කළ හේතුව:</span>
                          <span className="font-bold text-slate-900">{p.cancelReason || 'හේතුවක් ඇතුළත් කර නැත'}</span>
                          {p.cancelledBy && (
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              අවලංගු කළේ: {p.cancelledBy} {p.cancelledAt ? `(${new Date(p.cancelledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {isAdmin ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          ඇඩ්මින් (Head Office)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          රෙප් ({p.repId})
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-slate-500">{p.paymentType || 'Credit Settlement'}</td>
                    <td className="py-4 px-6 text-right font-bold">
                      <span className={isCancelled ? 'line-through text-rose-400' : 'text-emerald-600'}>
                        Rs {Number(p.mode === 'credit' ? p.creditReceivedAmount || 0 : (p.partialAmount && p.partialAmount > 0 ? p.partialAmount : p.total || 0)).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
        </>
      )}
    </div>
  );
}

// --- 12. REPS TAB ---
export function RepsTab({ items, setItems, suppliers, setSuppliers }: { items: any[], setItems: any, suppliers: any[], setSuppliers: any }) {
  const [confirmRepId, setConfirmRepId] = useState<string | null>(null);
  const [reps, setReps] = useState<SystemUser[]>(() => getUsers().filter(u => u.role === 'rep'));
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [area, setArea] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const handleSync = () => {
      setReps(getUsers().filter(u => u.role === 'rep'));
    };
    window.addEventListener('bizflow_sync', handleSync);
    const interval = setInterval(handleSync, 5000);
    return () => {
      window.removeEventListener('bizflow_sync', handleSync);
      clearInterval(interval);
    };
  }, []);
  
  // State for Load Goods Modal
  const [loadingRep, setLoadingRep] = useState<SystemUser | null>(null);
  const [loadQuantities, setLoadQuantities] = useState<Record<string, string>>({});
  const [loadSearchQuery, setLoadSearchQuery] = useState('');
  const [loadMethod, setLoadMethod] = useState<'from_main' | 'direct'>('from_main');
  const [doubleLoadConfirm, setDoubleLoadConfirm] = useState<any | null>(null);
  const [isSubmittingLoad, setIsSubmittingLoad] = useState(false);

  const handleAddRep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !pin) return;

    const newRep: SystemUser = {
      id: 'rep_' + Date.now(),
      name,
      pin,
      role: 'rep',
      activeArea: area,
      organizationId: 'MYM-BIZFLOW'
    };

    const allUsers = [...getUsers(), newRep];
    saveUsers(allUsers);
    setReps(allUsers.filter(u => u.role === 'rep'));

    // Bootstrap rep inventory with blank copy
    const blankRepInv = items.map(i => ({
      id: i.id,
      name: i.name,
      minPrice: i.minPrice,
      maxPrice: i.maxPrice,
      stockInMain: i.stock,
      myStock: 0,
      returnStock: 0,
      costPrice: i.costPrice
    }));
    saveRepInventory(newRep.id, blankRepInv);

    setName(''); setPin(''); setArea(''); setIsAdding(false);
    alert(`Rep ${name} added successfully and default inventory initialized!`);
  };

  const handleDeleteRep = (id: string) => {
    deleteSystemUser(id);
    const allUsers = getUsers().filter(u => u.id !== id);
    setReps(allUsers.filter(u => u.role === 'rep'));
    setConfirmRepId(null);
  };

  const executeLoad = (bypassDoubleCheck = false) => {
    if (!loadingRep || isSubmittingLoad) return;
    setIsSubmittingLoad(true);

    const repInv = getRepInventory(loadingRep.id) || [];
    let newAdminItems = [...items];
    let newRepInv = [...repInv];
    let loadedItems: any[] = [];

    Object.entries(loadQuantities).forEach(([itemId, qtyStr]) => {
      const qty = parseFloat(qtyStr);
      if (qty > 0) {
        // Find in admin items
        const adminItemIndex = newAdminItems.findIndex(i => String(i.id) === String(itemId));
        if (adminItemIndex >= 0) {
          if (loadMethod === 'from_main') {
            // Deduct from admin
            newAdminItems[adminItemIndex].stock = Math.max(0, newAdminItems[adminItemIndex].stock - qty);
          }
          
          loadedItems.push({ id: itemId, name: newAdminItems[adminItemIndex].name, qty });
          
          // Add to rep
          const repArea = loadingRep.activeArea || 'Mirigama';
          const repItemIndex = newRepInv.findIndex(i => String(i.id) === String(itemId) && (i.area === repArea || !i.area));
          if (repItemIndex >= 0) {
            newRepInv[repItemIndex].myStock = (newRepInv[repItemIndex].myStock || 0) + qty;
            newRepInv[repItemIndex].stockInMain = newAdminItems[adminItemIndex].stock;
            if (!newRepInv[repItemIndex].area) newRepInv[repItemIndex].area = repArea;
          } else {
            newRepInv.push({
              ...newAdminItems[adminItemIndex],
              stockInMain: newAdminItems[adminItemIndex].stock,
              myStock: qty,
              returnStock: 0,
              area: repArea
            });
          }
        }
      }
    });

    if (loadedItems.length === 0) {
      alert("Please enter quantities to load.");
      setIsSubmittingLoad(false);
      return;
    }

    if (loadMethod === 'from_main') {
      setItems(newAdminItems);
      saveAdminInventory(newAdminItems);
    }
    
    saveRepInventory(loadingRep.id, newRepInv);

    // Save transaction record
    const loadRequest: AIActionRequest = {
      id: 'load_' + Date.now(),
      repId: loadingRep.id,
      repName: loadingRep.name,
      actionType: 'rep_load',
      description: `Stock ${bypassDoubleCheck ? '[DOUBLE LOAD] ' : ''}manually loaded by admin to ${loadingRep.name} (${loadMethod === 'from_main' ? 'From Main' : 'Direct'})`,
      payload: { items: loadedItems, doubleLoadApproved: bypassDoubleCheck },
      status: 'Completed',
      timestamp: Date.now()
    };
    const reqs = [loadRequest, ...getAIActionRequests()];
    saveAIActionRequests(reqs);
    addToSyncQueue({ table: 'aiactions', action: 'insert', data: loadRequest });
    addToSyncQueue({ table: 'inventory', action: 'update', data: { repId: loadingRep.id, items: newRepInv } });

    setLoadingRep(null);
    setLoadQuantities({});
    setLoadSearchQuery('');
    setDoubleLoadConfirm(null);
    setIsSubmittingLoad(false);
    let alertMsg = `Stock successfully loaded to ${loadingRep.name}! Message sent.`;
    if (bypassDoubleCheck) {
      alertMsg = `⚠️ [ද්විත්ව තොගය සාර්ථකව පටවන ලදී / Double Load Authorized] ${alertMsg}`;
    }
    alert(alertMsg);
  };

  const handleLoadSubmit = () => {
    if (!loadingRep || isSubmittingLoad) return;

    let loadedItems: any[] = [];
    Object.entries(loadQuantities).forEach(([itemId, qtyStr]) => {
      const qty = parseFloat(qtyStr);
      if (qty > 0) {
        const adminItem = items.find(i => String(i.id) === String(itemId));
        if (adminItem) {
          loadedItems.push({ id: itemId, name: adminItem.name, qty });
        }
      }
    });

    if (loadedItems.length === 0) {
      alert("Please enter quantities to load.");
      return;
    }

    // Check for recent stock load within last 10 minutes for this rep
    const recentReqs = getAIActionRequests().filter(r =>
      r.repId === loadingRep.id &&
      ['rep_load', 'stock_load', 'stock_load_rep'].includes(r.actionType || '') &&
      (Date.now() - Number(r.timestamp || 0)) < 10 * 60 * 1000
    );

    if (recentReqs.length > 0) {
      setDoubleLoadConfirm({
        rep: loadingRep,
        loadedItems,
        recentReq: recentReqs[0]
      });
      return;
    }

    executeLoad(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-xl flex items-center shadow-lg shadow-blue-500/15 text-sm transition-all active:scale-95"
        >
          <Plus size={18} className="mr-1.5" /> Add Sales Representative
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddRep} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <input type="text" placeholder="Rep Name" value={name} onChange={e => setName(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" required />
          <input type="password" placeholder="Login PIN (4 digits)" value={pin} onChange={e => setPin(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" maxLength={4} required />
          <input type="text" placeholder="Route / Sales Area" value={area} onChange={e => setArea(e.target.value)} className="bg-white p-3 border border-slate-200 rounded-xl" />
          <div className="md:col-span-3 flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setIsAdding(false)} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-slate-700 text-sm">Cancel</button>
            <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm flex items-center"><Save size={16} className="mr-1.5" /> Initialize Rep</button>
          </div>
        </form>
      )}

      {loadingRep && (
        <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl shadow-sm mb-6 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-display text-xl font-bold text-blue-900">Load Goods to {loadingRep.name}</h4>
            <button onClick={() => { setLoadingRep(null); setLoadQuantities({}); setLoadSearchQuery(''); }} className="text-blue-500 hover:text-blue-700 p-1 bg-white rounded-full"><X size={20} /></button>
          </div>

          <div className="mb-4 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Search items..."
                value={loadSearchQuery}
                onChange={e => setLoadSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-blue-200 rounded-xl focus:outline-none focus:border-blue-500 bg-white"
              />
            </div>
            <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-blue-200">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input 
                  type="radio" 
                  name="loadMethod" 
                  value="from_main" 
                  checked={loadMethod === 'from_main'} 
                  onChange={() => setLoadMethod('from_main')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                From Main Inventory
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input 
                  type="radio" 
                  name="loadMethod" 
                  value="direct" 
                  checked={loadMethod === 'direct'} 
                  onChange={() => setLoadMethod('direct')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                Direct to Vehicle
              </label>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto bg-white rounded-xl border border-blue-100 mb-4 p-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            {items.filter(item => (item.name || '').toLowerCase().includes((loadSearchQuery || '').toLowerCase()) || (item.sku && item.sku.toLowerCase().includes((loadSearchQuery || '').toLowerCase()))).map((item, itemIdx) => {
              const currentRepInv = loadingRep ? (getRepInventory(loadingRep.id) || []) : [];
              const repStockVal = currentRepInv
                .filter((r: any) => String(r.id) === String(item.id))
                .reduce((sum: number, r: any) => sum + (r.myStock || 0), 0);

              return (
                <div key={`item_${item.id}_${itemIdx}`} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
                      <span>Main Stock: <span className="font-bold text-blue-600">{item.stock}</span></span>
                      <span className="text-slate-300">|</span>
                      <span>Rep Stock (රෙප් ළඟ තොගය): <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">{repStockVal}</span></span>
                    </div>
                  </div>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="Qty"
                    value={loadQuantities[item.id] || ''}
                    onChange={e => setLoadQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="w-20 bg-slate-50 border border-slate-200 p-2 rounded-lg text-center font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setLoadingRep(null); setLoadQuantities({}); }} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-xl font-bold text-sm">Cancel</button>
            <button onClick={handleLoadSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-sm flex items-center"><Check size={16} className="mr-1.5" /> Confirm Load</button>
          </div>
        </div>
      )}

      {doubleLoadConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-amber-200">
            <div className="p-5 bg-gradient-to-r from-amber-500 to-orange-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-2xl">
                  <AlertTriangle size={24} className="text-white animate-bounce" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">⚠️ ද්විත්ව තොග පැටවීමේ අවධානය!</h3>
                  <p className="text-xs text-amber-100 mt-0.5">Double Stock Load Warning for Admin</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setDoubleLoadConfirm(null);
                  alert("ද්විත්ව තොග පැටවීම අවලංගු කරන ලදී. (Double load cancelled)");
                }} 
                className="p-1.5 text-amber-100 hover:text-white hover:bg-white/20 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-900 text-xs leading-relaxed space-y-1">
                <p className="font-bold text-sm text-amber-950">
                  අවධානයයි: නියෝජිත <span className="underline">{doubleLoadConfirm.rep.name}</span> වෙත මීට සුළු මොහොතකට පෙර තොග පටවා ඇත!
                </p>
                <p>
                  ඔබ නැවතත් මෙම තොගය <strong>දෙගුණයක් (Double Load)</strong> ලෙස වාහනයට පැටවීමට කැමතිද?
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">පැටවීමට සැරසෙන තොග ලැයිස්තුව:</h4>
                <div className="bg-white rounded-2xl border border-slate-200 p-3 max-h-40 overflow-y-auto space-y-2">
                  {doubleLoadConfirm.loadedItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                      <span className="font-semibold text-slate-800">{item.name}</span>
                      <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">+{item.qty}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    executeLoad(true);
                  }}
                  className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Check size={18} />
                  ඔව්, දෙගුණයක් (Double Load) ලෙස පටවන්න
                </button>
                <button
                  onClick={() => {
                    setDoubleLoadConfirm(null);
                    setLoadingRep(null);
                    setLoadQuantities({});
                    alert("ද්විත්ව තොග පැටවීම අවලංගු කරන ලදී. සාමාන්‍ය තොගය පමණක් පවතී. (Double load cancelled)");
                  }}
                  className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  නැත, එපා (සාමාන්‍ය පරිදි පමණක් තබන්න / අවලංගු කරන්න)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-4 px-6">Rep Name</th>
              <th className="py-4 px-6">Active Area / Route</th>
              <th className="py-4 px-6 text-center">Last Online / Activity</th>
              <th className="py-4 px-6 text-center">App PIN</th>
              <th className="py-4 px-6 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
            {reps.map((rep, idx) => {
              const onlineInfo = formatLastOnline(rep.lastOnline);
              return (
                <tr key={`rep_${rep.id || 'new'}_${idx}`} className="hover:bg-slate-50/50">
                  <td className="py-4 px-6 font-semibold text-slate-900 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-xs uppercase">{rep.name[0]}</div>
                    {rep.name}
                  </td>
                  <td className="py-4 px-6 text-slate-500">{rep.activeArea || 'No Route Allocated'}</td>
                  <td className="py-4 px-6 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${onlineInfo.badgeColor}`}>
                      <span className={`w-2 h-2 rounded-full ${onlineInfo.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                      <span>{onlineInfo.text}</span>
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center font-mono font-bold text-slate-400">••••</td>
                  <td className="py-4 px-6 text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => setLoadingRep(rep)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Load Stock"><Truck size={16} /></button>
                      {confirmRepId === rep.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDeleteRep(rep.id)} className="p-1 bg-rose-600 text-white rounded text-xs font-bold px-2">Yes</button>
                          <button onClick={() => setConfirmRepId(null)} className="p-1 bg-slate-200 text-slate-700 rounded text-xs font-bold px-2">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRepId(rep.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- 13. RETURNS TAB ---
export function ReturnsTab({ returnStock, setReturnStock, pendingRequests, setPendingRequests }: { returnStock: any[], setReturnStock: any, pendingRequests: any[], setPendingRequests: any }) {
  const [items] = useState<any[]>(() => getAdminInventory());

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-2xl font-bold text-slate-800">Return Stock Management</h3>
        <p className="text-slate-500 text-sm mt-0.5">Monitor returning market stocks and samples from reps or retail shops.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        {returnStock.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-medium">No returned products in main returns storage.</div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-4 px-6">Product</th>
                <th className="py-4 px-6 text-center">Return Qty</th>
                <th className="py-4 px-6 text-right">Value (Cost Price)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
              {returnStock.map((ret, idx) => {
                const prod = items.find(i => String(i.id) === String(ret.id));
                return (
                  <tr key={ret.id || idx} className="hover:bg-slate-50/50">
                    <td className="py-4 px-6 font-semibold text-slate-900">{ret.name}</td>
                    <td className="py-4 px-6 text-center font-bold text-rose-600 bg-rose-50/30">
                      {ret.stock || ret.returnStock || 0} units
                    </td>
                    <td className="py-4 px-6 text-right">
                      Rs {( (ret.stock || ret.returnStock || 0) * (prod?.costPrice || 0) ).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- 14. APPROVALS TAB ---
export function ApprovalsTab() {
  const [requests, setRequests] = useState<any[]>(() => getAIActionRequests());

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail?.table === 'aiactions') {
        setRequests(getAIActionRequests());
      }
    };
    window.addEventListener('bizflow_sync', handleSync);
    return () => window.removeEventListener('bizflow_sync', handleSync);
  }, []);

  const handleAction = (id: string, status: 'Approved' | 'Rejected') => {
    const target = requests.find(r => r.id === id);
    if (target && target.actionType === 'handover_admin') {
      const amt = Number(target.payload?.amount || 0);
      const repId = target.repId;
      const allUsers = getUsers();
      const updatedUsers = allUsers.map(u => {
        if (u.id === repId) {
          if (status === 'Approved') {
            return {
              ...u,
              pendingAdminHandover: Math.max(0, (u.pendingAdminHandover || 0) - amt),
              cashBookBalance: Math.max(0, (u.cashBookBalance || 0) - amt)
            };
          } else {
            return {
              ...u,
              pendingAdminHandover: Math.max(0, (u.pendingAdminHandover || 0) - amt)
            };
          }
        }
        return u;
      });
      saveUsers(updatedUsers);
    }
    const updated = requests.map(r => r.id === id ? { ...r, status } : r);
    setRequests(updated);
    saveAIActionRequests(updated);
    alert(`Request marked as ${status}!`);
  };

  const pending = requests.filter(r => r.status === 'Pending');

  return (
    <div className="space-y-4">
      <h3 className="font-display text-2xl font-bold text-slate-800">Pending Load approvals</h3>
      {pending.length === 0 ? (
        <div className="bg-white p-8 text-center text-slate-400 font-medium border border-slate-100 rounded-2xl">
          No pending rep loads or attendance transactions await authorization.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pending.map(req => (
            <div key={req.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <span className="bg-blue-100 text-blue-700 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-widest">{req.actionType || 'Request'}</span>
                  <span className="text-slate-400 text-[10px]">{new Date(Number(req.timestamp)).toLocaleString()}</span>
                </div>
                <h4 className="font-bold text-slate-800 text-base mt-2">{req.description}</h4>
                <p className="text-slate-500 text-xs mt-1">Submitted by Rep: <span className="font-semibold text-slate-700">{req.repName}</span></p>
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-50">
                <button onClick={() => handleAction(req.id, 'Rejected')} className="bg-rose-50 text-rose-600 hover:bg-rose-100 px-4 py-2 rounded-xl text-xs font-bold transition-all"><X size={14} className="inline mr-1" /> Reject</button>
                <button onClick={() => handleAction(req.id, 'Approved')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm"><Check size={14} className="inline mr-1" /> Approve & Load</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- 15. SPECIAL APPROVALS TAB ---
export function SpecialApprovalsTab({ items, setItems }: { items: any[], setItems: any }) {
  const [requests, setRequests] = useState<AIActionRequest[]>(() => getAIActionRequests());

  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail?.table === 'aiactions') {
        setRequests(getAIActionRequests());
      }
    };
    window.addEventListener('bizflow_sync', handleSync);
    return () => window.removeEventListener('bizflow_sync', handleSync);
  }, []);

  const handleAction = (id: string, status: 'Approved' | 'Rejected') => {
    const updated = requests.map(r => r.id === id ? { ...r, status } : r);
    setRequests(updated);
    saveAIActionRequests(updated);
  };

  const priceApprovalPending = requests.filter(r => (r.type === 'price_approval' || r.actionType === 'price_approval') && r.status === 'Pending');

  return (
    <div className="space-y-4 pt-6 border-t border-slate-100">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-display text-2xl font-bold text-slate-800">Special Price & Credit Approvals / අඩු මිල අනුමැති</h3>
          <p className="text-slate-500 text-xs mt-0.5">Reps requesting custom lower prices or credit overrides</p>
        </div>
        {priceApprovalPending.length > 0 && (
          <span className="bg-amber-100 text-amber-800 font-bold text-xs px-3 py-1 rounded-full border border-amber-200">
            {priceApprovalPending.length} Pending Requests
          </span>
        )}
      </div>

      {priceApprovalPending.length === 0 ? (
        <div className="bg-white p-8 text-center text-slate-400 font-medium border border-slate-100 rounded-2xl">
          No active custom pricing requests or over-credit exceptions are pending admin intervention.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {priceApprovalPending.map(req => (
            <div key={req.id} className="bg-white p-6 rounded-2xl border-2 border-amber-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="bg-amber-100 text-amber-800 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                    Price Approval Request
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {req.timestamp ? new Date(req.timestamp).toLocaleString() : ''}
                  </span>
                </div>
                <h4 className="font-bold text-slate-800 text-base">{req.description}</h4>
                <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                  <p className="text-slate-600">Rep: <span className="font-bold text-slate-800">{req.repName}</span></p>
                  {req.metadata?.customerName && (
                    <p className="text-slate-600">Customer: <span className="font-bold text-slate-800">{req.metadata.customerName}</span></p>
                  )}
                  {req.metadata?.requestedPrice !== undefined && (
                    <p className="text-amber-700 font-bold">Requested Price: Rs {req.metadata.requestedPrice} (Min Price: Rs {req.metadata.minPrice || 'N/A'})</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => handleAction(req.id, 'Rejected')} 
                  className="bg-rose-50 text-rose-600 hover:bg-rose-100 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                >
                  <X size={14} /> Reject
                </button>
                <button 
                  onClick={() => handleAction(req.id, 'Approved')} 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1"
                >
                  <Check size={14} /> Approve Price
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- 16. ALERTS TAB ---
export function AlertsTab() {
  const [items] = useState<any[]>(() => getAdminInventory());
  const [reps] = useState<SystemUser[]>(() => getUsers().filter(u => u.role === 'rep'));
  const [targetRepId, setTargetRepId] = useState<string>('all');
  const [notifTitle, setNotifTitle] = useState('📦 ඇඩ්මින් වෙතින් හදිසි පණිවිඩයක්');
  const [notifBody, setNotifBody] = useState('කරුණාකර ඔබගේ නවතම තොග සටහන් සහ පද්ධතිය පරීක්ෂා කරන්න.');
  const [sentSuccess, setSentSuccess] = useState(false);

  const lowStock = items.filter(i => i.stock <= 5);

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifBody.trim()) return;

    const targetReps = targetRepId === 'all' ? reps : reps.filter(r => r.id === targetRepId);
    
    // Save as AI Action Requests (Push Messages) so reps receive them in real-time
    const existingReqs = getAIActionRequests();
    const newReqs: AIActionRequest[] = [];

    targetReps.forEach(rep => {
      const newReq: AIActionRequest = {
        id: 'push_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        repId: rep.id,
        actionType: 'stock_load_admin',
        payload: {
          itemName: notifTitle,
          notes: notifBody,
          isBroadcastNotif: true
        },
        status: 'Pending',
        timestamp: Date.now(),
        createdRole: 'admin'
      };
      newReqs.push(newReq);
      addToSyncQueue({ table: 'aiactions', action: 'insert', data: newReq });
    });

    saveAIActionRequests([...existingReqs, ...newReqs]);
    
    // Also trigger local notification if admin is testing on same device
    sendTopPhoneNotification(`🔔 ${notifTitle}`, notifBody, 'system');

    setSentSuccess(true);
    setTimeout(() => setSentSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-2xl font-bold text-slate-800">System Notification Desk</h3>
        <p className="text-slate-500 text-sm mt-0.5">Automated alerts, critical stock levels, and rep push notifications.</p>
      </div>

      {/* Broadcast Push Notification Form */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-indigo-500/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
            <CloudLightning size={22} className="animate-pulse" />
          </div>
          <div>
            <h4 className="font-bold text-base text-white">📱 නියෝජිතයින්ගේ ෆෝන් එකට නොටිෆිකේෂන් යැවීම (Push Broadcast)</h4>
            <p className="text-xs text-slate-300 mt-0.5">ඇඩ්මින් විසින් ඩේටා/පණිවිඩ යැවූ සැනින් Repගේ ෆෝන් එකේ උඩින් පෙනෙන සේ නොටිෆිකේෂන් යවන්න.</p>
          </div>
        </div>

        <form onSubmit={handleSendBroadcast} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">ලැබිය යුතු Rep (Target Rep)</label>
              <select
                value={targetRepId}
                onChange={e => setTargetRepId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">📢 සියලුම නියෝජිතයින් (All Reps)</option>
                {reps.map(r => (
                  <option key={r.id} value={r.id}>👤 {r.name} ({r.activeArea || 'No Area'})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">නොටිෆිකේෂන් මාතෘකාව (Title)</label>
              <input
                type="text"
                value={notifTitle}
                onChange={e => setNotifTitle(e.target.value)}
                placeholder="උදා: 📦 නව තොග නිකුත් කිරීමක්"
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-300 mb-1">පණිවිඩය (Message Body)</label>
              <input
                type="text"
                value={notifBody}
                onChange={e => setNotifBody(e.target.value)}
                placeholder="උදා: ඔබගේ තොගයට අයිතම එකතු කරන ලදී."
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            {sentSuccess ? (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-500/30 flex items-center gap-1.5">
                <Check size={14} /> නොටිෆිකේෂන් නියෝජිතයින්ගේ ෆෝන් වලට සාර්ථකව යවන ලදී!
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">ෆෝන් එකේ සද්දය (Audio) සහ Vibration සමඟ උඩින් පෙන්වයි.</span>
            )}

            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 active:scale-95 transition-all flex items-center gap-2"
            >
              <CloudLightning size={16} /> නොටිෆිකේෂන් යවන්න (Send Push)
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h4 className="font-bold text-sm text-slate-700">පද්ධතියේ හදිසි නිවේදන (System Alerts)</h4>
        {lowStock.map((item, idx) => (
          <div key={`load_${item.id}_${idx}`} className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
            <AlertTriangle className="text-amber-600 flex-shrink-0" size={24} />
            <div>
              <h5 className="font-bold text-amber-900 text-sm">Low Stock Alert: {item.name}</h5>
              <p className="text-amber-700 text-xs mt-0.5">Main store stock is critical: <span className="font-bold font-mono bg-amber-200/50 px-1.5 py-0.5 rounded text-amber-900">{item.stock}</span> units remaining. Consider buying from supplier.</p>
            </div>
          </div>
        ))}
        {lowStock.length === 0 && (
          <div className="bg-white p-8 text-center text-slate-400 font-medium border border-slate-100 rounded-2xl">
            Everything is running smoothly! No critical alerts are logged.
          </div>
        )}
      </div>
    </div>
  );
}

// --- 17. SETTINGS TAB ---
export function SettingsTab({ lang }: { lang: 'en' | 'si' }) {
  const [settings, setSettings] = useState<OrganizationSettings>(() => getOrganizationSettings());
  const [name, setName] = useState(settings.name);
  const [address, setAddress] = useState(settings.address || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [fontSize, setFontSize] = useState(settings.printerFontSize || 13);
  const [printerSize, setPrinterSize] = useState<'58' | '80'>(settings.printerSize || '58');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearInput, setClearInput] = useState('');
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');
  const [storageKB, setStorageKB] = useState(() => getStorageUsageKB());
  const [isPurging, setIsPurging] = useState(false);

  const handleCleanCacheNow = async () => {
    setIsPurging(true);
    try {
      const res = await purgeAppCache();
      setStorageKB(getStorageUsageKB());
      alert(lang === 'si' 
        ? `සාර්ථකයි! පද්ධති Cache සහ IndexedDB මතකය පිරිසිදු කරන ලදී. (නිදහස් කළ ඉඩ: ${res.freedKB} KB). ඇප් එක වේගවත්ව ක්‍රියාත්මක වේ.` 
        : `Success! System cache & IndexedDB purged (${res.freedKB} KB freed). App is now optimized.`
      );
    } catch (e) {
      alert(lang === 'si' ? 'Cache පිරිසිදු කිරීම සාර්ථකයි!' : 'Cache cleaned successfully!');
    } finally {
      setIsPurging(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...settings,
      name,
      address,
      phone,
      logoUrl,
      printerFontSize: Number(fontSize),
      printerSize
    };
    setSettings(updated);
    saveOrganizationSettings(updated);
    alert('Organization settings saved and synchronized successfully!');
  };

  const handleClearAllData = () => {
    if (clearInput !== 'DELETE') {
      alert(lang === 'si' ? 'කරුණාකර DELETE ලෙස ටයිප් කරන්න' : 'Please type DELETE exactly');
      return;
    }
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('bizflow_')) {
        localStorage.removeItem(key);
      }
    }
    alert(lang === 'si' ? 'සියලුම දත්ත මකා දමන ලදී. පද්ධතිය නැවත ආරම්භ වේ.' : 'All data deleted. System restarting.');
    window.location.href = '/';
  };

  const orgId = getActiveOrgId();
  const salesStr = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1') || '[]';
  let sales: any[] = [];
  try { sales = JSON.parse(salesStr); } catch(e) {}

  const yearBreakdown: { [year: string]: { count: number, sizeBytes: number } } = {};
  sales.forEach(s => {
    const d = new Date(s.createdAt || s.date || Date.now());
    const y = isNaN(d.getFullYear()) ? 'Unknown' : d.getFullYear().toString();
    if (!yearBreakdown[y]) yearBreakdown[y] = { count: 0, sizeBytes: 0 };
    yearBreakdown[y].count++;
    yearBreakdown[y].sizeBytes += JSON.stringify(s).length;
  });

  const totalSalesBytes = JSON.stringify(sales).length;
  const totalSalesKB = (totalSalesBytes / 1024).toFixed(2);
  const freeTierMB = 1000;
  const freeTierBytes = freeTierMB * 1024 * 1024;
  const percentageUsed = ((totalSalesBytes / freeTierBytes) * 100).toFixed(4);

  const handleCleanBills = (yearsOld: number) => {
    const cutoff = Date.now() - (yearsOld * 365 * 24 * 60 * 60 * 1000);
    const kept = sales.filter(s => {
      const t = new Date(s.createdAt || s.date || 0).getTime();
      return t >= cutoff;
    });
    const removedCount = sales.length - kept.length;
    if (removedCount === 0) {
      alert(lang === 'si' ? 'මකා දැමීමට පැරණි බිල් කිසිවක් හමු නොවීය.' : 'No bills found older than specified years.');
      return;
    }
    const msgSi = `වසර ${yearsOld}කට වඩා පැරණි බිල් ${removedCount}ක් ඉවත් කර දත්ත ගබඩාව කුඩාවට තබා ගැනීමට අවශ්‍යද?`;
    const msgEn = `Remove ${removedCount} bills older than ${yearsOld} year(s) to optimize storage?`;
    if (confirm(lang === 'si' ? msgSi : msgEn)) {
      const removedSales = sales.filter(s => {
        const t = new Date(s.createdAt || s.date || 0).getTime();
        return t < cutoff;
      });
      removedSales.forEach(s => {
        const targetId = s.id || s.docId || s._id;
        if (targetId) {
          addToSyncQueue({ table: 'sales', action: 'delete', data: { id: targetId, docId: s.docId } });
        }
      });

      localStorage.setItem(`bizflow_${orgId}_sales_v1`, JSON.stringify(kept));
      localStorage.setItem(`bizflow_sales_v1`, JSON.stringify(kept));
      window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'sales', data: kept } }));
      alert(lang === 'si' ? `සාර්ථකව පැරණි බිල් ${removedCount}ක් ඉවත් කරන ලදී!` : `Successfully removed ${removedCount} old bills!`);
      window.location.reload();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <FirebaseQuotaWidget lang={lang} />

      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white p-6 rounded-3xl shadow-xl space-y-6 border border-emerald-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 border border-emerald-500/30">
              <Database size={24} />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold">{lang === 'si' ? 'Firebase දත්ත ගබඩා ධාරිතාව (Storage Monitor)' : 'Firebase Storage & Usage Monitor'}</h3>
              <p className="text-xs text-emerald-300/80">{lang === 'si' ? 'නොමිලේ (Free Tier) සීමාවන් තුළ සදහටම පවත්වා ගැනීමට දත්ත පාලනය කරන්න' : 'Manage records & keep your app 100% free forever on Spark tier'}</p>
            </div>
          </div>
          <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold font-mono">
            {percentageUsed}% {lang === 'si' ? 'භාවිතයයි' : 'Used'} (1 GB Free)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
          <div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">{lang === 'si' ? 'මුළු බිල් / වාර්තා ගණන' : 'Total Bills / Records'}</span>
            <h4 className="text-2xl font-black font-mono mt-0.5 text-white">{sales.length}</h4>
          </div>
          <div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">{lang === 'si' ? 'භාවිත වන ඉඩ ප්‍රමාණය' : 'Estimated Size'}</span>
            <h4 className="text-2xl font-black font-mono mt-0.5 text-emerald-400">{totalSalesKB} KB</h4>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{lang === 'si' ? 'අවුරුදු අනුව බිල් බෙදීයාම (Year-wise Breakdown):' : 'Year-wise Bill Breakdown:'}</h4>
          <div className="space-y-2">
            {Object.keys(yearBreakdown).sort().reverse().map(yr => (
              <div key={yr} className="flex justify-between items-center bg-white/5 px-4 py-3 rounded-xl border border-white/5 text-sm">
                <span className="font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  {yr === 'Unknown' ? (lang === 'si' ? 'වෙනත් දිනයන්' : 'Other') : yr}
                </span>
                <span className="text-slate-300 font-mono text-xs">
                  {yearBreakdown[yr].count} {lang === 'si' ? 'බිල්' : 'bills'} • {(yearBreakdown[yr].sizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
            {Object.keys(yearBreakdown).length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-2">{lang === 'si' ? 'තවම බිල් වාර්තා නොමැත.' : 'No sales records yet.'}</p>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-white/10 space-y-3">
          <p className="text-xs text-slate-300 leading-relaxed">
            {lang === 'si' 
              ? 'පැරණි බිල් ඉවත් කිරීමෙන් Firebase දත්ත ගබඩාව කුඩාවට තබාගත හැකි අතර Google හි නොමිලේ (Spark Plan 1GB) සීමාවන් තුළ සදහටම කිසිදු මාසික ගාස්තුවකින් තොරව පවත්වා ගත හැක.' 
              : 'Cleaning up old bills reduces your database footprint, ensuring you remain permanently within Google Firebase Free Tier limits with zero monthly fees.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => handleCleanBills(1)}
              className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold py-3 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2"
            >
              <Trash2 size={16} />
              {lang === 'si' ? 'වසර 1කට වඩා පැරණි මකන්න' : 'Delete > 1 Year Old'}
            </button>
            <button 
              onClick={() => handleCleanBills(2)}
              className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold py-3 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2"
            >
              <Trash2 size={16} />
              {lang === 'si' ? 'වසර 2කට වඩා පැරණි මකන්න' : 'Delete > 2 Years Old'}
            </button>
          </div>
        </div>
      </div>

      {/* --- HIGH-SPEED APP CACHE & RAM CLEANER CARD --- */}
      <div className="bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl space-y-4 border border-blue-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 border border-blue-500/30">
              <Zap size={24} />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold">
                {lang === 'si' ? 'පද්ධති මතකය සහ Cache පාලනය (RAM & Cache Optimizer)' : 'App Cache & RAM Optimizer'}
              </h3>
              <p className="text-xs text-blue-200/80">
                {lang === 'si' 
                  ? 'ඇප් එක හිරවීම (Freeze වීම) සහ 17MB-18MB Cache පිරීම වැළැක්වීමට තාවකාලික මතකය පිරිසිදු කරන්න' 
                  : 'Purge bloated browser cache & temporary RAM to keep app lightning-fast'}
              </p>
            </div>
          </div>
          <span className="bg-blue-500/20 border border-blue-500/30 text-blue-300 px-3 py-1 rounded-full text-xs font-bold font-mono">
            {storageKB} KB {lang === 'si' ? 'සක්‍රීය මතකය' : 'Active Storage'}
          </span>
        </div>

        <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs text-slate-300 font-semibold">
              {lang === 'si' ? '🛡️ ආරක්ෂිත මතක පිරිසිදු කිරීම (Safe Memory Flush)' : '🛡️ Safe Memory & Cache Flush'}
            </span>
            <p className="text-[11px] text-slate-400">
              {lang === 'si' 
                ? 'ඔබගේ බිල්පත්, බඩු ලැයිස්තු හෝ පාරිභෝගික දත්ත වලට කිසිදු හානියක් සිදු නොවේ.' 
                : 'Your real business sales, inventory, and customers remain 100% untouched.'}
            </p>
          </div>
          <button
            type="button"
            disabled={isPurging}
            onClick={handleCleanCacheNow}
            className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-lg transition-all text-xs flex items-center gap-2 shrink-0 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isPurging ? 'animate-spin' : ''} />
            {isPurging 
              ? (lang === 'si' ? 'පිරිසිදු කරමින්...' : 'Purging...') 
              : (lang === 'si' ? 'Cache පිරිසිදු කර Speed Up කරන්න' : 'Clean Cache & Speed Up')}
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
        <div>
          <h3 className="font-display text-2xl font-bold text-slate-800">Organization Settings</h3>
          <p className="text-slate-500 text-sm mt-0.5">Configure organization identity, header print layout, and global defaults.</p>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Business Name (printed on invoice header)</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none" required />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Address (printed on invoice header)</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Hotline Phone</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none" />
          </div>
          
          <div className="flex flex-col gap-2 bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <label className="text-xs font-semibold text-slate-600 uppercase flex items-center justify-between">
              <span>ආයතනයේ Logo එක (App Logo)</span>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setLogoUrl('');
                    localStorage.removeItem('app_logo');
                    window.dispatchEvent(new Event('logoUpdated'));
                  }}
                  className="text-rose-600 hover:text-rose-700 text-xs font-bold underline"
                >
                  Logo එක ඉවත් කරන්න (Remove Logo)
                </button>
              )}
            </label>

            <div className="flex flex-col sm:flex-row gap-4 items-center mt-1">
              <div className="w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-sm relative group">
                {logoUrl ? (
                  <img src={logoUrl} alt="App Logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center text-slate-400 p-1">
                    <Database size={24} className="mx-auto mb-1 text-slate-300" />
                    <span className="text-[10px] font-bold block">No Logo</span>
                  </div>
                )}
              </div>

              <div className="flex-1 w-full space-y-2">
                <label className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3.5 rounded-xl cursor-pointer font-bold text-sm flex items-center justify-center transition-all shadow-md shadow-emerald-600/20 active:scale-95">
                  <Upload size={18} className="mr-2" />
                  ෆෝන් එකෙන් ෆොටෝ එකක් තෝරන්න (Choose Photo)
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const MAX_SIZE = 400;
                            let width = img.width;
                            let height = img.height;
                            
                            if (width > height) {
                              if (width > MAX_SIZE) {
                                height *= MAX_SIZE / width;
                                width = MAX_SIZE;
                              }
                            } else {
                              if (height > MAX_SIZE) {
                                width *= MAX_SIZE / height;
                                height = MAX_SIZE;
                              }
                            }
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                              ctx.fillStyle = '#FFFFFF';
                              ctx.fillRect(0, 0, width, height);
                              ctx.drawImage(img, 0, 0, width, height);
                              const compressedUrl = canvas.toDataURL('image/jpeg', 0.85);
                              setLogoUrl(compressedUrl);
                              localStorage.setItem('app_logo', compressedUrl);
                              window.dispatchEvent(new Event('logoUpdated'));
                            }
                          };
                          img.src = reader.result as string;
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
                <p className="text-[11px] text-slate-500 italic">
                  ඔබගේ පෝන් එකෙන් හෝ පරිගණකයෙන් ඕනෑම ජායාරූපයක් (JPG/PNG) තෝරාගත හැක.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Printer Font Size (Optimal: 11-14)</label>
            <input type="number" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none" required />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Printer Paper Size</label>
            <select value={printerSize} onChange={e => setPrinterSize(e.target.value as '58'|'80')} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none">
               <option value="58">58mm (Portable / Narrow)</option>
               <option value="80">80mm (Desktop / Wide)</option>
            </select>
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/15 flex items-center justify-center">
            <Save size={18} className="mr-1.5" /> Save Configuration
          </button>
        </form>
      </div>

      <div className="bg-rose-50 border-2 border-rose-200 p-6 rounded-2xl shadow-sm">
        <h3 className="font-display text-xl font-bold text-rose-700 mb-2 flex items-center gap-2">
          <Trash2 size={24} />
          Danger Zone
        </h3>
        <p className="text-rose-600/80 text-sm mb-6 font-medium">
          Once you delete all data, there is no going back. Please be certain. This will clear all inventory, customers, sales history, and settings from this device.
        </p>
        {showClearConfirm ? (
          <div className="bg-rose-50 p-4 rounded-xl border border-rose-200">
            <p className="text-rose-700 font-bold mb-2 text-sm">Type "DELETE" to confirm:</p>
            <input type="text" value={clearInput} onChange={e => setClearInput(e.target.value)} className="w-full p-3 border border-rose-300 rounded-xl mb-3 focus:outline-none" placeholder="DELETE" />
            <div className="flex gap-2">
              <button onClick={handleClearAllData} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl">Confirm Delete</button>
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 bg-slate-200 text-slate-700 font-bold py-3 rounded-xl">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button 
              onClick={(e) => { e.preventDefault(); setShowClearConfirm(true); }}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-rose-500/15 transition-all"
            >
              {lang === 'si' ? 'සියලුම දත්ත මකා දමන්න (Delete All Data)' : 'Delete All Data'}
            </button>
            
            <button 
              onClick={(e) => { 
                e.preventDefault(); 
                import('../lib/cacheUtils').then(m => m.clearAppCache());
              }}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-amber-500/15 transition-all"
            >
              {lang === 'si' ? 'කැෂේ (Cache) ඉවත් කර නැවත ආරම්භ කරන්න' : 'Clear App Cache & Reload'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- 19. DEPLOY TAB ---
export function DeployTab() {
  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm max-w-xl mx-auto space-y-6 text-center">
      <div className="p-4 bg-blue-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto text-blue-600">
        <Settings size={32} className="animate-spin duration-[4s]" />
      </div>

      <div className="space-y-2">
        <h3 className="font-display text-2xl font-bold text-slate-800">Deployment Console</h3>
        <p className="text-slate-500 text-sm">Trigger cloud redeployments, Firestore rules updates, or database backups.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button className="p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100/50 transition-all text-slate-700 font-bold text-sm">
          Backup Databases
        </button>
        <button className="p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100/50 transition-all text-slate-700 font-bold text-sm">
          Optimize Indexing
        </button>
      </div>

      <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/15">
        Push Firestore Security Rules
      </button>
    </div>
  );
}

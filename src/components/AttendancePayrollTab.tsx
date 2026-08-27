import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ScanLine, CheckCircle, Printer, Edit, RefreshCw, DollarSign, Clock, Calendar, X, Save, UserCheck, UserX, AlertTriangle, Lock } from 'lucide-react';
import { SystemUser, StaffAttendance, getStaffAttendance, saveStaffAttendance, getUsers, saveUsers, getOrganizationSettings, getActiveOrgId, saveAttendanceRecords, getSettledDates } from '../lib/store';
import { fetchTableData } from '../lib/sync';
import { formatSinhalaMonthYear } from '../i18n';

export default function AttendancePayrollTab({ lang }: { lang: 'en' | 'si' }) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [records, setRecords] = useState<StaffAttendance[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [view, setView] = useState<'attendance' | 'payroll'>('attendance');
  const [payrollSubView, setPayrollSubView] = useState<'individual' | 'combined'>('individual');
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const orgSettings = getOrganizationSettings();

  // Modal States
  const [editingSalaryUser, setEditingSalaryUser] = useState<SystemUser | null>(null);
  const [salaryForm, setSalaryForm] = useState<{
    payModel: 'monthly' | 'daily' | 'hourly';
    baseSalary: number;
    attendanceAllowance: number;
    dailyWage: number;
    hourlyRate: number;
    otRate: number;
    advances: number;
    assignedPartnerId: string;
    assignedVehicle: string;
  }>({
    payModel: 'monthly',
    baseSalary: 0,
    attendanceAllowance: 0,
    dailyWage: 0,
    hourlyRate: 0,
    otRate: 0,
    advances: 0,
    assignedPartnerId: '',
    assignedVehicle: ''
  });

  const [editingAttendance, setEditingAttendance] = useState<{
    user: SystemUser;
    record: StaffAttendance | null;
    workingHours: string;
    otHours: string;
  } | null>(null);

  const loadAllData = () => {
    const allU = getUsers().filter(u => u.role !== 'admin' && u.role !== 'super_admin');
    setUsers(allU);
    setRecords(getStaffAttendance());
    const orgId = getActiveOrgId();
    const stored = localStorage.getItem(`bizflow_${orgId}_sales_v1`) || localStorage.getItem('bizflow_sales_v1');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setSalesData(parsed);
      } catch (e) {}
    }
  };

  useEffect(() => {
    loadAllData();
    fetchTableData('sales').then(data => {
      if (data && Array.isArray(data)) setSalesData(data);
    });

    const handleSync = (e: any) => {
      loadAllData();
      if (e?.detail?.data && e?.detail?.table === 'sales' && Array.isArray(e.detail.data)) {
        setSalesData(e.detail.data);
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
  }, []);

  const handleMarkIn = (user: SystemUser) => {
    const existing = records.find(r => r.userId === user.id && r.date === selectedDate);
    if (existing && existing.checkIn) {
      alert(lang === 'si' ? 'දැනටමත් පැමිණීම සටහන් කර ඇත.' : 'Already checked in for this date.');
      return;
    }

    const now = Date.now();
    const newRec: StaffAttendance = existing ? { ...existing, checkIn: now } : {
      id: 'att_' + Date.now(),
      userId: user.id,
      userName: user.name,
      date: selectedDate,
      checkIn: now,
      organizationId: getActiveOrgId()
    };

    const updated = existing ? records.map(r => r.id === existing.id ? newRec : r) : [...records, newRec];
    setRecords(updated);
    saveStaffAttendance(updated);
  };

  const handleMarkOut = (user: SystemUser) => {
    const existing = records.find(r => r.userId === user.id && r.date === selectedDate);
    if (!existing || !existing.checkIn) {
      alert(lang === 'si' ? 'පළමුව පැමිණීම (Arrival) සටහන් කරන්න.' : 'Please mark arrival first.');
      return;
    }

    const now = Date.now();
    const hours = Math.max(1, (now - existing.checkIn) / (1000 * 60 * 60));
    
    const newRec: StaffAttendance = {
      ...existing,
      checkOut: now,
      workingHours: parseFloat(hours.toFixed(1)),
      otHours: hours > 8 ? parseFloat((hours - 8).toFixed(1)) : 0
    };

    const updated = records.map(r => r.id === existing.id ? newRec : r);
    setRecords(updated);
    saveStaffAttendance(updated);
  };

  const handleSaveAttendanceEdit = () => {
    if (!editingAttendance) return;
    const { user, record, workingHours, otHours } = editingAttendance;
    const wH = parseFloat(workingHours) || 0;
    const otH = parseFloat(otHours) || 0;

    const existing = record || records.find(r => r.userId === user.id && r.date === selectedDate);

    const newRec: StaffAttendance = {
      id: existing?.id || 'att_' + Date.now(),
      userId: user.id,
      userName: user.name,
      date: selectedDate,
      checkIn: existing?.checkIn || Date.now(),
      checkOut: Date.now(),
      workingHours: wH,
      otHours: otH,
      organizationId: getActiveOrgId()
    };

    const updated = records.filter(r => !(r.userId === user.id && r.date === selectedDate));
    updated.push(newRec);
    setRecords(updated);
    saveStaffAttendance(updated);
    setEditingAttendance(null);
  };

  const handleOpenSalaryEdit = (user: SystemUser) => {
    setEditingSalaryUser(user);
    setSalaryForm({
      payModel: user.payModel || (user.baseSalary && user.baseSalary > 0 ? 'monthly' : 'monthly'),
      baseSalary: user.baseSalary || 0,
      attendanceAllowance: user.attendanceAllowance || 0,
      dailyWage: user.dailyWage || 0,
      hourlyRate: user.hourlyRate || 0,
      otRate: user.otRate || 0,
      advances: user.advances || 0,
      assignedPartnerId: user.assignedPartnerId || '',
      assignedVehicle: user.assignedVehicle || ''
    });
  };

  const handleSaveSalarySettings = () => {
    if (!editingSalaryUser) return;
    const allUsers = getUsers();
    const updatedUsers = allUsers.map(u => {
      if (u.id === editingSalaryUser.id) {
        return {
          ...u,
          payModel: salaryForm.payModel,
          baseSalary: Number(salaryForm.baseSalary) || 0,
          attendanceAllowance: Number(salaryForm.attendanceAllowance) || 0,
          dailyWage: Number(salaryForm.dailyWage) || 0,
          hourlyRate: Number(salaryForm.hourlyRate) || 0,
          otRate: Number(salaryForm.otRate) || 0,
          advances: Number(salaryForm.advances) || 0,
          assignedPartnerId: salaryForm.assignedPartnerId || undefined,
          assignedVehicle: salaryForm.assignedVehicle || undefined
        };
      }
      return u;
    });

    saveUsers(updatedUsers);
    setUsers(updatedUsers.filter(u => u.role !== 'super_admin'));
    setEditingSalaryUser(null);
  };

  const calculatePayroll = (user: SystemUser) => {
    const monthRecords = records.filter(r => (r.userId === user.id || (r as any).repId === user.id) && r.date.startsWith(payrollMonth));

    // Get all unique dates where employee was present
    const allAttendedDates = Array.from(new Set(
      monthRecords
        .filter(r => r.checkIn || (r as any).timestamp || (r.workingHours && r.workingHours > 0))
        .map(r => r.date)
    ));

    // All attended dates are counted for salary calculation
    const validPaidDates = allAttendedDates;

    const validRecords = monthRecords.filter(r => validPaidDates.includes(r.date));

    const attendedDays = validPaidDates.length;
    const totalHours = validRecords.reduce((acc, r) => acc + (Number(r.workingHours) || 0), 0);
    
    const explicitOt = validRecords.reduce((acc, r) => acc + (Number(r.otHours) || 0), 0);
    const standardHours = attendedDays * 8;
    const otHours = explicitOt > 0 ? explicitOt : Math.max(0, totalHours - standardHours);
    const otPay = otHours * (user.otRate || 0);

    const model = user.payModel || (user.baseSalary && user.baseSalary > 0 ? 'monthly' : (user.dailyWage ? 'daily' : (user.hourlyRate ? 'hourly' : 'monthly')));
    
    let salary = 0;
    if (model === 'monthly') {
      const baseVal = user.baseSalary || 0;
      if (baseVal > 0) {
        salary = attendedDays >= 25 ? baseVal : Math.round((baseVal / 25) * attendedDays);
      } else {
        salary = attendedDays * (user.dailyWage || 1600);
      }
      salary += (attendedDays * (user.attendanceAllowance || 150));
    } else if (model === 'daily') {
      salary = attendedDays * (user.dailyWage || 1600);
    } else if (model === 'hourly') {
      salary = totalHours * (user.hourlyRate || 200);
    }

    // Sales bonus calculation for Rep
    let salesBonus = 0;
    const repSales = (salesData || []).filter(s => (s.repId === user.id || s.coRepId === user.id) && s.status !== 'cancelled' && s.mode === 'sale');
    
    const salesByDate: Record<string, number> = {};
    repSales.forEach(s => {
      const rawDate = s.createdAt || s.date || '';
      const d = typeof rawDate === 'string' ? rawDate.slice(0, 10) : new Date(rawDate).toISOString().slice(0, 10);
      if (d && d.startsWith(payrollMonth)) {
        salesByDate[d] = (salesByDate[d] || 0) + (Number(s.total) || 0);
      }
    });

    Object.values(salesByDate).forEach(dailyTotal => {
      if (dailyTotal >= 100000) salesBonus += 800;
      else if (dailyTotal >= 60000) salesBonus += 400;
      else if (dailyTotal >= 35000) salesBonus += 200;
    });

    const advances = user.advances || 0;
    const netSalary = Math.max(0, salary + otPay + salesBonus - advances);

    return {
      attendedDays,
      unsettledDaysCount: 0,
      unsettledDates: [],
      totalAttendedDays: allAttendedDates.length,
      totalHours,
      salary,
      otHours,
      otPay,
      salesBonus,
      advances,
      netSalary,
      model
    };
  };

  const [triggerPrint, setTriggerPrint] = useState(0);
  const [printData, setPrintData] = useState<any>(null);

  useEffect(() => {
    if (triggerPrint > 0) {
      const timer = setTimeout(() => {
        window.print();
        setTimeout(() => setTriggerPrint(0), 1000);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [triggerPrint]);

  const handlePrintPayroll = (user: SystemUser) => {
    const payroll = calculatePayroll(user);
    setPrintData({ isCombined: false, isMonthlyReport: false, user, payroll, month: payrollMonth });
    setTriggerPrint(prev => prev + 1);
  };

  const handlePrintCombinedPayroll = (vehicleName: string, members: SystemUser[]) => {
    const memberPayrolls = members.map(m => ({
      user: m,
      payroll: calculatePayroll(m)
    }));
    const combinedTotal = memberPayrolls.reduce((sum, mp) => sum + mp.payroll.netSalary, 0);
    setPrintData({
      isCombined: true,
      isMonthlyReport: false,
      vehicleName,
      memberPayrolls,
      combinedTotal,
      month: payrollMonth
    });
    setTriggerPrint(prev => prev + 1);
  };

  const handlePrintFullMonthlyPaysheet = () => {
    const allStaffPayrolls = users.map(u => ({
      user: u,
      payroll: calculatePayroll(u)
    }));
    const grandTotal = allStaffPayrolls.reduce((sum, sp) => sum + sp.payroll.netSalary, 0);
    setPrintData({
      isCombined: false,
      isMonthlyReport: true,
      allStaffPayrolls,
      grandTotal,
      month: payrollMonth
    });
    setTriggerPrint(prev => prev + 1);
  };

  // Group users into Lorry / Vehicle teams
  const getLorryTeams = () => {
    const teams: { id: string; vehicleName: string; members: SystemUser[] }[] = [];
    const processedIds = new Set<string>();

    // 1. Group by assignedVehicle first
    const vehicleGroups: Record<string, SystemUser[]> = {};
    users.forEach(u => {
      if (u.assignedVehicle && u.assignedVehicle.trim() !== '') {
        const vKey = u.assignedVehicle.trim().toUpperCase();
        if (!vehicleGroups[vKey]) vehicleGroups[vKey] = [];
        vehicleGroups[vKey].push(u);
      }
    });

    Object.entries(vehicleGroups).forEach(([vName, vMembers]) => {
      teams.push({
        id: 'v_' + vName,
        vehicleName: `${lang === 'si' ? 'වාහනය / ලොරිය' : 'Vehicle / Lorry'}: ${vName}`,
        members: vMembers
      });
      vMembers.forEach(m => processedIds.add(m.id));
    });

    // 2. Group paired users via assignedPartnerId
    users.forEach(u => {
      if (!processedIds.has(u.id) && u.assignedPartnerId) {
        const partner = users.find(p => p.id === u.assignedPartnerId);
        if (partner && !processedIds.has(partner.id)) {
          teams.push({
            id: 'pair_' + u.id + '_' + partner.id,
            vehicleName: `${lang === 'si' ? 'ලොරි කණ්ඩායම' : 'Lorry Pair'}: ${u.name} + ${partner.name}`,
            members: [u, partner]
          });
          processedIds.add(u.id);
          processedIds.add(partner.id);
        }
      }
    });

    // 3. Remaining unassigned staff
    users.forEach(u => {
      if (!processedIds.has(u.id)) {
        teams.push({
          id: 'single_' + u.id,
          vehicleName: `${u.name} (${u.customRoleName || u.role})`,
          members: [u]
        });
        processedIds.add(u.id);
      }
    });

    return teams;
  };

  // Payroll Totals for all users
  const totalPayrollCost = users.reduce((acc, u) => acc + calculatePayroll(u).netSalary, 0);
  const totalAttendedDaysSum = users.reduce((acc, u) => acc + calculatePayroll(u).attendedDays, 0);
  const totalOtHoursSum = users.reduce((acc, u) => acc + calculatePayroll(u).otHours, 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-md shadow-blue-500/20">
            <ScanLine size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{lang === 'si' ? 'පැමිණීම සහ පේයිරෝල්' : 'Attendance & Payroll'}</h2>
            <p className="text-slate-500 text-sm">{lang === 'si' ? 'සේවක පැමිණීම සහ වැටුප් ස්වයංක්‍රීයව සකසන්න' : 'Employee attendance tracking and automated payroll management'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={loadAllData}
            title="Refresh Data"
            className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all active:scale-95"
          >
            <RefreshCw size={18} />
          </button>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setView('attendance')}
              className={`px-6 py-2.5 rounded-lg font-bold transition-all ${view === 'attendance' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {lang === 'si' ? 'පැමිණීම (Attendance)' : 'Attendance'}
            </button>
            <button 
              onClick={() => setView('payroll')}
              className={`px-6 py-2.5 rounded-lg font-bold transition-all ${view === 'payroll' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {lang === 'si' ? 'පේයිරෝල් (Payroll)' : 'Payroll'}
            </button>
          </div>
        </div>
      </div>

      {view === 'attendance' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
               <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{lang === 'si' ? 'සේවක පැමිණීම සටහන් කරන්න' : 'Employee Attendance Log'}</h3>
                    <p className="text-slate-400 text-xs">Date: <span className="font-semibold text-slate-700">{selectedDate}</span></p>
                  </div>
                  <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider border border-blue-100">
                     {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-100">
                     <tr>
                       <th className="px-6 py-4">Employee</th>
                       <th className="px-6 py-4">Role</th>
                       <th className="px-6 py-4">Check In</th>
                       <th className="px-6 py-4">Hours / OT</th>
                       <th className="px-6 py-4">Status</th>
                       <th className="px-6 py-4 text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                     {users.length === 0 ? (
                       <tr>
                         <td colSpan={6} className="px-6 py-8 text-center text-slate-400 font-medium">No staff members found.</td>
                       </tr>
                     ) : users.map(user => {
                       const rec = records.find(r => (r.userId === user.id || (r as any).repId === user.id) && r.date === selectedDate);
                       return (
                         <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                           <td className="px-6 py-4">
                             <div className="font-bold text-slate-800">{user.name}</div>
                             <div className="text-[10px] text-slate-400 font-medium">ID: {user.id}</div>
                           </td>
                           <td className="px-6 py-4">
                             <span className="text-xs font-bold text-slate-500 uppercase bg-slate-100 px-2.5 py-1 rounded-lg">
                               {user.customRoleName || user.role}
                             </span>
                           </td>
                           <td className="px-6 py-4 font-mono text-sm">
                             {rec?.checkIn ? new Date(rec.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                           </td>
                           <td className="px-6 py-4 font-mono text-sm">
                             {rec ? (
                               <div>
                                 <span className="font-bold text-slate-700">{rec.workingHours || 0} hrs</span>
                                 {rec.otHours ? <span className="text-xs text-emerald-600 font-bold ml-1.5">(+{rec.otHours} OT)</span> : null}
                               </div>
                             ) : '--'}
                           </td>
                           <td className="px-6 py-4">
                             {rec?.checkIn ? (
                               <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold text-xs px-2.5 py-1 rounded-full inline-flex items-center">
                                 <CheckCircle size={13} className="mr-1" /> {lang === 'si' ? 'පැමිණ ඇත' : 'Present'}
                               </span>
                             ) : (
                               <span className="text-slate-400 bg-slate-100 font-bold text-xs px-2.5 py-1 rounded-full">
                                 {lang === 'si' ? 'පැමිණ නැත' : 'Absent'}
                               </span>
                             )}
                           </td>
                           <td className="px-6 py-4 text-right">
                             <div className="flex gap-2 justify-end items-center">
                                {!rec?.checkIn && (
                                  <button 
                                    onClick={() => handleMarkIn(user)}
                                    className="px-3.5 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all shadow-sm active:scale-95"
                                  >
                                    Arrival
                                  </button>
                                )}
                                {rec?.checkIn && !rec.checkOut && (
                                  <button 
                                    onClick={() => handleMarkOut(user)}
                                    className="px-3.5 py-1.5 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-all shadow-sm active:scale-95"
                                  >
                                    Exit
                                  </button>
                                )}
                                <button
                                  onClick={() => setEditingAttendance({
                                    user,
                                    record: rec || null,
                                    workingHours: (rec?.workingHours || 8).toString(),
                                    otHours: (rec?.otHours || 0).toString()
                                  })}
                                  title="Edit Working / OT Hours"
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                >
                                  <Edit size={16} />
                                </button>
                             </div>
                           </td>
                         </tr>
                       )
                     })}
                   </tbody>
                 </table>
               </div>
            </div>
          </div>

          {/* Right Panel Summary & Date Selection */}
          <div className="space-y-6">
             <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Calendar size={18} className="text-blue-600" />
                  {lang === 'si' ? 'දිනය තෝරන්න' : 'Select Attendance Date'}
                </h3>
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold text-slate-700"
                />
             </div>

             <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl shadow-xl text-white">
                <h3 className="font-bold mb-1 text-lg">{lang === 'si' ? 'පැමිණීමේ සාරාංශය' : 'Attendance Summary'}</h3>
                <p className="text-blue-100 text-xs mb-6 font-medium">{selectedDate}</p>
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
                      <div className="text-3xl font-black">{records.filter(r => r.date === selectedDate && (r.checkIn || (r as any).timestamp)).length}</div>
                      <div className="text-[11px] uppercase font-bold text-blue-200 mt-1 flex items-center gap-1">
                        <UserCheck size={14} /> Present
                      </div>
                   </div>
                   <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
                      <div className="text-3xl font-black">{Math.max(0, users.length - records.filter(r => r.date === selectedDate && (r.checkIn || (r as any).timestamp)).length)}</div>
                      <div className="text-[11px] uppercase font-bold text-blue-200 mt-1 flex items-center gap-1">
                        <UserX size={14} /> Absent
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      ) : (
        /* Payroll View */
        <div className="space-y-6">
          <div className="bg-emerald-50 border-2 border-emerald-300 text-emerald-950 rounded-3xl p-5 flex items-center justify-between gap-4 shadow-sm">
             <div className="flex items-center gap-3.5">
                <div className="p-3 bg-emerald-500 text-white rounded-2xl shrink-0 shadow-md">
                   <UserCheck size={22} />
                </div>
                <div>
                   <h4 className="font-bold text-sm text-emerald-950">
                      {lang === 'si' ? 'ස්වයංක්‍රීය වැටුප් ගණනය කිරීම (Auto-Calculated Payroll)' : 'Automatic Smart Payroll System'}
                   </h4>
                   <p className="text-xs text-emerald-900 mt-0.5 leading-relaxed">
                      {lang === 'si'
                         ? 'පැමිණීම (Attendance), දිනපතා සෙටල්මන්ට් (Settlement) හෝ බිල්පත් අලෙවි වාර්තා මඟින් වැඩ කළ සියලුම දින සඳහා වැටුප්, අතිකාල (OT) සහ ප්‍රසාද දීමනා නිවැරදිව ස්වයංක්‍රීයව ගණනය වේ.'
                         : 'Salaries, overtime (OT), and sales bonuses are automatically calculated from logged attendance, daily settlements, and verified sales records.'}
                   </p>
                </div>
             </div>
          </div>

          {/* Top Bar Month Selector & Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 flex flex-col justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{lang === 'si' ? 'මාසය තෝරන්න' : 'Payroll Month'}</h3>
                <input 
                  type="month" 
                  value={payrollMonth}
                  onChange={e => setPayrollMonth(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-blue-500/20 font-bold text-slate-800"
                />
             </div>

             <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{lang === 'si' ? 'මුළු වැටුප් පිරිවැය' : 'Total Net Payroll'}</div>
                <div className="text-2xl font-black text-blue-600 font-mono">Rs. {totalPayrollCost.toLocaleString()}</div>
                <div className="text-[11px] text-slate-400 mt-1">{users.length} Employees total</div>
             </div>

             <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{lang === 'si' ? 'එකතුව පැමිණි දින' : 'Total Attended Days'}</div>
                <div className="text-2xl font-black text-emerald-600">{totalAttendedDaysSum} Days</div>
                <div className="text-[11px] text-slate-400 mt-1">Month {payrollMonth}</div>
             </div>

             <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{lang === 'si' ? 'මුළු අතිකාල (OT)' : 'Total OT Hours'}</div>
                <div className="text-2xl font-black text-amber-600">{totalOtHoursSum.toFixed(1)} Hrs</div>
                <div className="text-[11px] text-slate-400 mt-1">Accumulated OT</div>
             </div>
          </div>

          {/* Payroll Table / Combined View */}
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
             <div className="p-6 border-b border-slate-50 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">
                    {payrollSubView === 'individual' 
                      ? (lang === 'si' ? 'තනි සේවක වැටුප් විස්තර' : 'Individual Employee Payroll') 
                      : (lang === 'si' ? 'ලොරි/කණ්ඩායම් එක්සත් පේයිරෝල් (Ref + Miroga)' : 'Lorry / Team Combined Payroll')}
                  </h3>
                  <p className="text-xs text-slate-400">Calculated for {payrollMonth}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex bg-slate-200/70 p-1 rounded-xl">
                    <button
                      onClick={() => setPayrollSubView('individual')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${payrollSubView === 'individual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      {lang === 'si' ? 'තනි සේවක පේයිරෝල්' : 'Individual Staff'}
                    </button>
                    <button
                      onClick={() => setPayrollSubView('combined')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${payrollSubView === 'combined' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      {lang === 'si' ? 'එක්සත් වාහන පේයිරෝල්' : 'Combined Lorry/Team'}
                    </button>
                  </div>

                  <button
                    onClick={handlePrintFullMonthlyPaysheet}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 flex items-center gap-2 transition-all"
                  >
                    <Printer size={16} />
                    {lang === 'si' ? 'සම්පූර්ණ මාසික පේයිශීට් එක ප්‍රින්ට් කරන්න' : 'Print Full Monthly Paysheet'}
                  </button>
                </div>
             </div>

             {payrollSubView === 'individual' ? (
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-100">
                     <tr>
                       <th className="px-6 py-4">Employee</th>
                       <th className="px-6 py-4">Attend Days</th>
                       <th className="px-6 py-4">Total Hrs</th>
                       <th className="px-6 py-4">Base Pay</th>
                       <th className="px-6 py-4">OT Pay</th>
                       <th className="px-6 py-4">Advances</th>
                       <th className="px-6 py-4 bg-blue-50/50 text-blue-900">Net Salary</th>
                       <th className="px-6 py-4 text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                     {users.length === 0 ? (
                       <tr>
                         <td colSpan={8} className="px-6 py-8 text-center text-slate-400 font-medium">No active staff members found.</td>
                       </tr>
                     ) : users.map(user => {
                       const payroll = calculatePayroll(user);
                       const partner = users.find(u => u.id === user.assignedPartnerId);
                       return (
                         <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                           <td className="px-6 py-4">
                             <div className="font-bold text-slate-800">{user.name}</div>
                             <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                               <span className="text-[10px] text-slate-500 font-bold uppercase bg-slate-100 px-2 py-0.5 rounded">
                                 {user.customRoleName || user.role}
                               </span>
                               {user.assignedVehicle && (
                                 <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-bold">
                                   🚛 {user.assignedVehicle}
                                 </span>
                               )}
                               {partner && (
                                 <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-bold">
                                   🤝 With: {partner.name}
                                 </span>
                               )}
                             </div>
                           </td>
                           <td className="px-6 py-4">
                             <div className="font-bold text-slate-800 flex items-center gap-1">
                               <span>{payroll.attendedDays} Days</span>
                               <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-200">
                                 ✓ Settled
                               </span>
                             </div>
                             {payroll.unsettledDaysCount > 0 && (
                               <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                                 <AlertTriangle size={12} className="shrink-0" />
                                 <span>{payroll.unsettledDaysCount} days unsettled (No Pay)</span>
                               </div>
                             )}
                           </td>
                           <td className="px-6 py-4 text-slate-700">
                             {payroll.totalHours.toFixed(1)} hrs
                             {payroll.otHours > 0 && <span className="block text-xs font-semibold text-amber-600">({payroll.otHours.toFixed(1)} OT)</span>}
                           </td>
                           <td className="px-6 py-4 font-mono font-medium text-slate-800">Rs. {payroll.salary.toLocaleString()}</td>
                           <td className="px-6 py-4 font-mono text-emerald-600 font-semibold">
                             {payroll.otPay > 0 ? `+Rs. ${payroll.otPay.toLocaleString()}` : 'Rs. 0'}
                           </td>
                           <td className="px-6 py-4 font-mono text-rose-500 font-semibold">
                             {payroll.advances > 0 ? `-Rs. ${payroll.advances.toLocaleString()}` : 'Rs. 0'}
                           </td>
                           <td className="px-6 py-4 bg-blue-50/30">
                             <div className="font-black text-blue-600 font-mono text-base">Rs. {payroll.netSalary.toLocaleString()}</div>
                           </td>
                           <td className="px-6 py-4 text-right">
                             <div className="flex items-center justify-end gap-2">
                               <button
                                 onClick={() => handleOpenSalaryEdit(user)}
                                 title="Edit Salary Settings"
                                 className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
                               >
                                 <Edit size={16} />
                               </button>
                               <button 
                                 onClick={() => handlePrintPayroll(user)}
                                 title="Print Pay Slip"
                                 className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors active:scale-95"
                               >
                                 <Printer size={16} />
                               </button>
                             </div>
                           </td>
                         </tr>
                       )
                     })}
                   </tbody>
                 </table>
               </div>
             ) : (
               /* COMBINED LORRY / TEAM PAYROLL VIEW */
               <div className="p-6 space-y-6 bg-slate-50/50">
                 {getLorryTeams().map(team => {
                   const teamTotalNet = team.members.reduce((sum, m) => sum + calculatePayroll(m).netSalary, 0);
                   const teamTotalOt = team.members.reduce((sum, m) => sum + calculatePayroll(m).otHours, 0);
                   return (
                     <div key={team.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden">
                       <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
                         <div>
                           <div className="flex items-center gap-2">
                             <span className="text-xl">🚛</span>
                             <h4 className="font-bold text-base tracking-wide">{team.vehicleName}</h4>
                           </div>
                           <p className="text-xs text-slate-400 mt-0.5">
                             {lang === 'si' ? 'එක්සත් වාහන පේයිරෝල් සාරාංශය (Ref + Miroga)' : 'Combined Lorry Payroll Breakdown'} • {team.members.length} {team.members.length === 1 ? 'Member' : 'Members'}
                           </p>
                         </div>

                         <div className="flex items-center gap-4">
                           <div className="text-right">
                             <span className="text-[10px] uppercase font-bold text-slate-400 block">{lang === 'si' ? 'වාහනයේ මුළු වැටුප' : 'Lorry Net Total'}</span>
                             <span className="text-xl font-black text-emerald-400 font-mono">Rs. {teamTotalNet.toLocaleString()}</span>
                           </div>
                           <button
                             onClick={() => handlePrintCombinedPayroll(team.vehicleName, team.members)}
                             className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all"
                           >
                             <Printer size={16} />
                             {lang === 'si' ? 'එක්සත් පේයිරෝල් පත්‍රිකාව' : 'Print Lorry Payslip'}
                           </button>
                         </div>
                       </div>

                       <div className="p-4 overflow-x-auto">
                         <table className="w-full text-left text-xs">
                           <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-100">
                             <tr>
                               <th className="p-3">Staff Member & Role</th>
                               <th className="p-3">Model</th>
                               <th className="p-3">Attended</th>
                               <th className="p-3">Base Earnings</th>
                               <th className="p-3">OT Pay</th>
                               <th className="p-3">Advances</th>
                               <th className="p-3 bg-blue-50/50 text-blue-900 font-black">Net Salary</th>
                               <th className="p-3 text-right">Settings</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 font-medium">
                             {team.members.map(member => {
                               const p = calculatePayroll(member);
                               return (
                                 <tr key={member.id} className="hover:bg-slate-50/50">
                                   <td className="p-3">
                                     <div className="font-bold text-slate-800 text-sm">{member.name}</div>
                                     <span className="text-[10px] text-slate-500 uppercase font-semibold bg-slate-100 px-2 py-0.5 rounded inline-block mt-0.5">
                                       {member.customRoleName || member.role}
                                     </span>
                                   </td>
                                   <td className="p-3 font-semibold uppercase text-slate-600">{p.model}</td>
                                   <td className="p-3">
                                     <div className="font-bold text-slate-800">{p.attendedDays} Days ({p.totalHours.toFixed(1)}h)</div>
                                     {p.unsettledDaysCount > 0 && (
                                       <div className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                         ⚠️ {p.unsettledDaysCount} unsettled (No Pay)
                                       </div>
                                     )}
                                   </td>
                                   <td className="p-3 font-mono font-bold text-slate-800">Rs. {p.salary.toLocaleString()}</td>
                                   <td className="p-3 font-mono font-bold text-emerald-600">+{p.otPay.toLocaleString()}</td>
                                   <td className="p-3 font-mono font-bold text-rose-500">-{p.advances.toLocaleString()}</td>
                                   <td className="p-3 bg-blue-50/30 font-mono font-black text-blue-600 text-sm">
                                     Rs. {p.netSalary.toLocaleString()}
                                   </td>
                                   <td className="p-3 text-right">
                                     <button
                                       onClick={() => handleOpenSalaryEdit(member)}
                                       className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg"
                                     >
                                       <Edit size={14} />
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
          </div>
        </div>
      )}

      {/* MODAL: Edit Attendance Record */}
      {editingAttendance && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
               <div>
                 <h3 className="font-bold text-slate-800 text-lg">Edit Working Hours</h3>
                 <p className="text-xs text-slate-400">{editingAttendance.user.name} ({selectedDate})</p>
               </div>
               <button onClick={() => setEditingAttendance(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                 <X size={18} />
               </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Standard Working Hours</label>
                <input 
                  type="number"
                  value={editingAttendance.workingHours}
                  onChange={e => setEditingAttendance({ ...editingAttendance, workingHours: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold"
                  placeholder="8"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Overtime (OT) Hours</label>
                <input 
                  type="number"
                  value={editingAttendance.otHours}
                  onChange={e => setEditingAttendance({ ...editingAttendance, otHours: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setEditingAttendance(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveAttendanceEdit}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 shadow-md shadow-blue-500/20"
              >
                Save Attendance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Salary Settings */}
      {editingSalaryUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
               <div>
                 <h3 className="font-bold text-slate-800 text-lg">{lang === 'si' ? 'වැටුප් සැකසුම් සකසන්න' : 'Salary Configuration'}</h3>
                 <p className="text-xs text-slate-400">{editingSalaryUser.name} ({editingSalaryUser.customRoleName || editingSalaryUser.role})</p>
               </div>
               <button onClick={() => setEditingSalaryUser(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                 <X size={18} />
               </button>
            </div>

            <div className="space-y-4 mb-6">
               <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Payment Model (ගෙවීම් මාදිලිය)</label>
                  <select 
                    value={salaryForm.payModel}
                    onChange={e => setSalaryForm({ ...salaryForm, payModel: e.target.value as any })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold"
                  >
                     <option value="monthly">Monthly Salary (මාසික වැටුප්)</option>
                     <option value="daily">Daily Wage (දෛනික වැටුප්)</option>
                     <option value="hourly">Hourly Rate (පැයකට වැටුප්)</option>
                  </select>
               </div>

               {salaryForm.payModel === 'monthly' && (
                 <>
                   <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1">Base Monthly Salary (මූලික මාසික වැටුප LKR)</label>
                     <input 
                       type="number"
                       value={salaryForm.baseSalary}
                       onChange={e => setSalaryForm({ ...salaryForm, baseSalary: parseFloat(e.target.value) || 0 })}
                       className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold"
                     />
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1">Daily Attendance Allowance (දිනපතා පැමිණීමේ දීමනාව LKR)</label>
                     <input 
                       type="number"
                       value={salaryForm.attendanceAllowance}
                       onChange={e => setSalaryForm({ ...salaryForm, attendanceAllowance: parseFloat(e.target.value) || 0 })}
                       className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold"
                     />
                   </div>
                 </>
               )}

               {salaryForm.payModel === 'daily' && (
                 <div>
                   <label className="block text-xs font-bold text-slate-600 mb-1">Daily Wage Rate (දෛනික ගෙවීම LKR)</label>
                   <input 
                     type="number"
                     value={salaryForm.dailyWage}
                     onChange={e => setSalaryForm({ ...salaryForm, dailyWage: parseFloat(e.target.value) || 0 })}
                     className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold"
                   />
                 </div>
               )}

               {salaryForm.payModel === 'hourly' && (
                 <div>
                   <label className="block text-xs font-bold text-slate-600 mb-1">Hourly Rate (පැයක ගෙවීම LKR)</label>
                   <input 
                     type="number"
                     value={salaryForm.hourlyRate}
                     onChange={e => setSalaryForm({ ...salaryForm, hourlyRate: parseFloat(e.target.value) || 0 })}
                     className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold"
                   />
                 </div>
               )}

               <div>
                 <label className="block text-xs font-bold text-slate-600 mb-1">Overtime (OT) Hourly Rate (අතිකාල පැයකට LKR)</label>
                 <input 
                   type="number"
                   value={salaryForm.otRate}
                   onChange={e => setSalaryForm({ ...salaryForm, otRate: parseFloat(e.target.value) || 0 })}
                   className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold"
                 />
               </div>

               <div>
                 <label className="block text-xs font-bold text-slate-600 mb-1">Current Advances / Deductions (ලබාගත් අත්තිකාරම් LKR)</label>
                 <input 
                   type="number"
                   value={salaryForm.advances}
                   onChange={e => setSalaryForm({ ...salaryForm, advances: parseFloat(e.target.value) || 0 })}
                   className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold text-rose-600"
                 />
               </div>

               <div className="pt-4 border-t border-slate-100">
                 <h4 className="text-xs font-bold uppercase text-purple-700 tracking-wider mb-2 flex items-center gap-1">
                   🚛 Lorry & Co-Worker Pairing (එක්සත් වාහන යුගලය)
                 </h4>
                 
                 <div className="space-y-3">
                   <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1">Vehicle / Lorry Name (වාහන / ලොරි අංකය)</label>
                     <input 
                       type="text"
                       value={salaryForm.assignedVehicle}
                       onChange={e => setSalaryForm({ ...salaryForm, assignedVehicle: e.target.value })}
                       placeholder="e.g. Lorry 01 (LKR-5421)"
                       className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-purple-500/20 font-bold text-slate-800 text-xs"
                     />
                   </div>

                   <div>
                     <label className="block text-xs font-bold text-slate-600 mb-1">Assigned Co-Worker / Miroga (එකම ලොරියේ වැඩකරන අනෙක් සේවකයා)</label>
                     <select 
                       value={salaryForm.assignedPartnerId}
                       onChange={e => setSalaryForm({ ...salaryForm, assignedPartnerId: e.target.value })}
                       className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-purple-500/20 font-bold text-slate-800 text-xs"
                     >
                       <option value="">-- No Assigned Partner --</option>
                       {users.filter(u => u.id !== editingSalaryUser?.id).map(u => (
                         <option key={u.id} value={u.id}>
                           {u.name} ({u.customRoleName || u.role})
                         </option>
                       ))}
                     </select>
                     <p className="text-[10px] text-slate-400 mt-1">
                       Ref / Sales Rep සහ Driver/Helper එකම ලොරියේ වැඩ කරන විට දෙදෙනාම එක් වාහනයකට සම්බන්ධ කරන්න.
                     </p>
                   </div>
                 </div>
               </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setEditingSalaryUser(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveSalarySettings}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5"
              >
                <Save size={18} /> Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printer Area for Payroll Pay-slips */}
      {createPortal(
      <div id="payroll-print-area" className="hidden print:block fixed inset-0 bg-white z-[9999]">
        {printData && (
          <div className="p-8 w-full max-w-[80mm] mx-auto font-mono border border-dashed border-black/20" style={{ fontSize: `${orgSettings.printerFontSize || 12}px`, fontWeight: orgSettings.printerFontWeight || 400, color: '#000' }}>
             <div className="text-center mb-6">
                <h2 className="text-xl font-black uppercase tracking-widest">{orgSettings.name}</h2>
                <p>{orgSettings.address}</p>
                <p>{orgSettings.phone}</p>
                <div className="my-4 border-y border-black py-2 font-bold bg-slate-50 uppercase">
                  {printData.isMonthlyReport ? 'FULL MONTHLY PAYROLL REPORT' : (printData.isCombined ? 'COMBINED LORRY PAY SLIP' : 'PAY SLIP')} - {formatSinhalaMonthYear(printData.month)}
                </div>
             </div>

             {printData.isMonthlyReport ? (
               <div className="space-y-4">
                 <table className="w-full text-left text-[10px] border-collapse">
                   <thead>
                     <tr className="border-b border-black font-bold uppercase">
                       <th className="py-1">STAFF</th>
                       <th className="py-1 text-center">DAYS</th>
                       <th className="py-1 text-right">BASE</th>
                       <th className="py-1 text-right">OT</th>
                       <th className="py-1 text-right">ADV</th>
                       <th className="py-1 text-right">NET PAY</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-black/20">
                     {printData.allStaffPayrolls.map((sp: any, idx: number) => (
                       <tr key={sp.user.id || idx}>
                         <td className="py-1.5 font-bold">
                           {sp.user.name}
                           <div className="text-[8px] opacity-70">{sp.user.customRoleName || sp.user.role}</div>
                         </td>
                         <td className="py-1.5 text-center">{sp.payroll.attendedDays}d</td>
                         <td className="py-1.5 text-right">{sp.payroll.salary.toLocaleString()}</td>
                         <td className="py-1.5 text-right">+{sp.payroll.otPay.toLocaleString()}</td>
                         <td className="py-1.5 text-right">-{sp.payroll.advances.toLocaleString()}</td>
                         <td className="py-1.5 text-right font-black">Rs.{sp.payroll.netSalary.toLocaleString()}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>

                 <div className="border-t-2 border-black pt-3 flex justify-between text-base font-black">
                   <span>COMPANY TOTAL:</span>
                   <span>Rs.{printData.grandTotal.toLocaleString()}</span>
                 </div>

                 <div className="mt-8 pt-4 text-center text-[9px] space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                     <div className="border-t border-black/40 pt-1">PREPARED BY (ACCOUNTANT)</div>
                     <div className="border-t border-black/40 pt-1">APPROVED BY (DIRECTOR)</div>
                   </div>
                   <div className="text-[8px] opacity-60">Printed on {new Date().toLocaleString()}</div>
                 </div>
               </div>
             ) : printData.isCombined ? (
               <div className="space-y-6">
                 <div className="text-center border-b border-black/20 pb-2">
                   <span className="font-bold uppercase text-xs">{printData.vehicleName}</span>
                 </div>

                 {printData.memberPayrolls.map((mp: any, idx: number) => (
                   <div key={mp.user.id} className="border-b border-black/40 pb-4 space-y-1.5">
                     <div className="font-bold uppercase bg-black/5 p-1 flex justify-between">
                       <span>{idx + 1}. {mp.user.name}</span>
                       <span>({mp.user.customRoleName || mp.user.role})</span>
                     </div>
                     <div className="flex justify-between text-[11px]"><span>SETTLED DAYS:</span> <span>{mp.payroll.attendedDays} Days ({mp.payroll.totalHours.toFixed(1)}h)</span></div>
                     {mp.payroll.unsettledDaysCount > 0 && (
                       <div className="flex justify-between text-[11px] font-bold"><span>UNSETTLED DAYS (NO PAY):</span> <span>{mp.payroll.unsettledDaysCount} Days</span></div>
                     )}
                     <div className="flex justify-between text-[11px]"><span>BASE EARNINGS:</span> <span>Rs.{mp.payroll.salary.toLocaleString()}</span></div>
                     <div className="flex justify-between text-[11px]"><span>OT PAY:</span> <span>+Rs.{mp.payroll.otPay.toLocaleString()}</span></div>
                     <div className="flex justify-between text-[11px]"><span>ADVANCES:</span> <span>-Rs.{mp.payroll.advances.toLocaleString()}</span></div>
                     <div className="flex justify-between font-bold pt-1 border-t border-dotted border-black">
                       <span>NET PAYABLE:</span>
                       <span>Rs.{mp.payroll.netSalary.toLocaleString()}</span>
                     </div>
                   </div>
                 ))}

                 <div className="border-t-2 border-black pt-3 flex justify-between text-base font-black">
                   <span>LORRY TOTAL:</span>
                   <span>Rs.{printData.combinedTotal.toLocaleString()}</span>
                 </div>

                 <div className="mt-8 pt-4 text-center text-[9px] space-y-6">
                   <div className="grid grid-cols-2 gap-2">
                     <div className="border-t border-black/40 pt-1">REF SIGNATURE</div>
                     <div className="border-t border-black/40 pt-1">MIROGA/DRIVER SIGN</div>
                   </div>
                   <div className="border-t border-black/40 pt-1">AUTHORIZED BY: {orgSettings.name}</div>
                   <div className="text-[8px] opacity-60">Printed on {new Date().toLocaleString()}</div>
                 </div>
               </div>
             ) : (
               <>
                 <div className="space-y-2 mb-6">
                    <div className="flex justify-between"><span>NAME:</span> <span className="font-bold">{printData.user.name.toUpperCase()}</span></div>
                    <div className="flex justify-between"><span>ROLE:</span> <span className="font-bold">{printData.user.customRoleName || printData.user.role}</span></div>
                    <div className="flex justify-between"><span>PAY MODEL:</span> <span className="font-bold uppercase">{printData.payroll.model}</span></div>
                 </div>

                 <div className="border-t border-black pt-4 space-y-3">
                    <div className="flex justify-between"><span>PAID SETTLED DAYS:</span> <strong>{printData.payroll.attendedDays} Days</strong></div>
                    {printData.payroll.unsettledDaysCount > 0 && (
                      <div className="flex justify-between font-bold"><span>UNSETTLED DAYS (WITHHELD):</span> <strong>{printData.payroll.unsettledDaysCount} Days</strong></div>
                    )}
                    <div className="flex justify-between"><span>TOTAL HOURS:</span> <strong>{printData.payroll.totalHours}</strong></div>
                    <div className="flex justify-between"><span>BASE EARNINGS:</span> <strong>Rs.{printData.payroll.salary.toLocaleString()}</strong></div>
                    <div className="flex justify-between"><span>OT PAY:</span> <strong>Rs.{printData.payroll.otPay.toLocaleString()}</strong></div>
                    <div className="flex justify-between text-rose-600"><span>ADVANCES:</span> <strong>-Rs.{printData.payroll.advances.toLocaleString()}</strong></div>
                    <div className="border-t border-black pt-4 flex justify-between text-lg font-black">
                       <span>NET PAYABLE:</span>
                       <span>Rs.{printData.payroll.netSalary.toLocaleString()}</span>
                    </div>
                 </div>

                 <div className="mt-12 pt-8 text-center text-[10px]">
                    <div className="border-t border-black/40 pt-2 mb-8">EMPLOYEE SIGNATURE</div>
                    <div className="border-t border-black/40 pt-2">AUTHORIZED BY: {orgSettings.name}</div>
                    <div className="mt-6 text-[8px] opacity-60">Printed on {new Date().toLocaleString()}</div>
                 </div>
               </>
             )}
          </div>
        )}
      </div>
      , document.body)}
    </div>
  );
}

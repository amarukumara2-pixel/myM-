import React, { useState, useEffect } from 'react';
import { getSettlementRecords, SettlementRecord, getActiveOrgId, getOrganizationSettings } from '../lib/store';
import { fetchTableData } from '../lib/sync';
import { DollarSign, Calendar, Search, Filter, Printer, FileText, User, CheckCircle, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';

interface DailySettlementsTabProps {
  lang?: 'en' | 'si';
  repsList?: any[];
}

export const DailySettlementsTab: React.FC<DailySettlementsTabProps> = ({ lang = 'si', repsList = [] }) => {
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [selectedRepId, setSelectedRepId] = useState<string>('all');
  const [searchDate, setSearchDate] = useState<string>('');
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementRecord | null>(null);
  const [triggerPrint, setTriggerPrint] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const orgId = getActiveOrgId();
  const orgSettings = getOrganizationSettings();

  const loadSettlements = async () => {
    setIsRefreshing(true);
    // Read local cache immediately for snappy UI
    const records = getSettlementRecords();
    if (records.length > 0) {
      setSettlements(records);
    }
    // Fetch from Firestore cloud to get latest rep submissions
    try {
      const cloudRecords = await fetchTableData('settlements');
      if (cloudRecords && Array.isArray(cloudRecords) && cloudRecords.length > 0) {
        setSettlements(cloudRecords);
      } else {
        setSettlements(getSettlementRecords());
      }
    } catch (e) {
      console.warn('Failed to fetch settlement records from cloud:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadSettlements();

    const handleSync = (e: any) => {
      const table = e.detail?.table;
      if (!table || table === 'settlements' || table === 'sales' || table === 'expenses') {
        const records = getSettlementRecords();
        setSettlements(records);
      }
    };

    window.addEventListener('bizflow_sync', handleSync);
    return () => window.removeEventListener('bizflow_sync', handleSync);
  }, [orgId]);

  useEffect(() => {
    if (triggerPrint > 0) {
      const timer = setTimeout(() => {
        window.print();
        setTimeout(() => setTriggerPrint(0), 1000);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [triggerPrint]);

  const filteredSettlements = settlements
    .filter(s => {
      if (selectedRepId !== 'all' && s.repId !== selectedRepId) return false;
      if (searchDate && !s.date.includes(searchDate)) return false;
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const totalCashCollected = filteredSettlements.reduce((sum, s) => sum + (s.totalCash || 0), 0);
  const totalChequesCollected = filteredSettlements.reduce((sum, s) => sum + (s.totalCheque || 0), 0);
  const totalNetCashHanded = filteredSettlements.reduce((sum, s) => sum + (s.netCashHandedOver || s.totalCash || 0), 0);
  const totalDeductions = filteredSettlements.reduce((sum, s) => sum + ((s.expensesDeduction || 0) + (s.advancesDeduction || 0)), 0);

  const handlePrintSlip = (settlement: SettlementRecord) => {
    setSelectedSettlement(settlement);
    setTriggerPrint(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl font-bold text-slate-800">
            {lang === 'si' ? 'දිනපතා රෙප් ගිණුම් බේරීම් (Daily Settlements)' : 'Daily Rep Settlements'}
          </h3>
          <p className="text-slate-500 text-sm mt-0.5">
            {lang === 'si'
              ? 'ක්ෂේත්‍ර අලෙවි නියෝජිතයන්ගේ දිනපතා එකතු වූ මුදල්, චෙක්පත්, වියදම් සහ අත්තිකාරම් ගිණුම් වාර්තාව'
              : 'Audit log of daily rep cash collection, cheque collection, expenses, and net cash handover.'}
          </p>
        </div>

        <button
          onClick={loadSettlements}
          disabled={isRefreshing}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all self-start sm:self-auto flex items-center gap-2"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          {lang === 'si' ? 'යාවත්කාලීන කරන්න' : 'Refresh Data'}
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign size={24} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">
              {lang === 'si' ? 'මුළු භාරදුන් මුදල (Net Cash)' : 'Net Cash Handed'}
            </div>
            <div className="text-xl font-black text-emerald-600 font-mono">
              Rs. {totalNetCashHanded.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText size={24} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">
              {lang === 'si' ? 'එකතු වූ චෙක්පත් (Cheques)' : 'Total Cheques'}
            </div>
            <div className="text-xl font-black text-blue-600 font-mono">
              Rs. {totalChequesCollected.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <ArrowDownRight size={24} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">
              {lang === 'si' ? 'වියදම්/අත්තිකාරම් (Deductions)' : 'Total Deductions'}
            </div>
            <div className="text-xl font-black text-rose-500 font-mono">
              Rs. {totalDeductions.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <CheckCircle size={24} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">
              {lang === 'si' ? 'සෙටල්මන්ට් ගණන (Settlements)' : 'Settlement Count'}
            </div>
            <div className="text-xl font-black text-slate-800">
              {filteredSettlements.length} Records
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <User size={16} className="text-slate-400" />
            <select
              value={selectedRepId}
              onChange={e => setSelectedRepId(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">{lang === 'si' ? 'සියලුම රෙප්වරුන් (All Reps)' : 'All Field Reps'}</option>
              {repsList.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.customRoleName || r.role})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={searchDate}
              onChange={e => setSearchDate(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-700 outline-none"
            />
            {searchDate && (
              <button onClick={() => setSearchDate('')} className="text-xs text-slate-400 hover:text-slate-600 font-bold ml-1">✕</button>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-400 font-medium">
          Showing {filteredSettlements.length} settlement entries
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        {filteredSettlements.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-medium">
            {lang === 'si' ? 'සෙටල්මන්ට් වාර්තා කිසිවක් හමු නොවීය.' : 'No daily settlement records found for selected filters.'}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-4 px-6">දින/වේලාව (Date & Time)</th>
                <th className="py-4 px-6">රෙප් නම (Rep Name)</th>
                <th className="py-4 px-6 text-right">එකතු වූ මුදල් (Gross Cash)</th>
                <th className="py-4 px-6 text-right">එකතු වූ චෙක්පත් (Cheques)</th>
                <th className="py-4 px-6 text-right">අඩු කිරීම් (Deductions)</th>
                <th className="py-4 px-6 text-right">භාරදුන් ශුද්ධ මුදල (Net Cash)</th>
                <th className="py-4 px-6 text-center">තත්ත්වය (Status)</th>
                <th className="py-4 px-6 text-right">ක්‍රියාමාර්ග (Action)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
              {filteredSettlements.map((s, idx) => {
                const repObj = repsList.find(r => r.id === s.repId);
                const repName = s.repName || repObj?.name || s.repId;
                const grossCash = s.totalCash || 0;
                const cheque = s.totalCheque || 0;
                const deductions = (s.expensesDeduction || 0) + (s.advancesDeduction || 0);
                const netCash = s.netCashHandedOver !== undefined ? s.netCashHandedOver : grossCash - deductions;

                return (
                  <tr key={s.id || idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-800">{s.date}</div>
                      <div className="text-[10px] text-slate-400">{new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td className="py-4 px-6 font-semibold text-slate-900">
                      {repName}
                      <div className="text-[10px] text-slate-400">{repObj?.customRoleName || 'Sales Rep'}</div>
                    </td>
                    <td className="py-4 px-6 text-right font-mono text-slate-800 font-semibold">
                      Rs. {grossCash.toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-right font-mono text-blue-600 font-semibold">
                      Rs. {cheque.toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-right font-mono text-rose-500 font-semibold">
                      {deductions > 0 ? `-Rs. ${deductions.toLocaleString()}` : 'Rs. 0'}
                    </td>
                    <td className="py-4 px-6 text-right font-mono font-black text-emerald-600 text-base">
                      Rs. {netCash.toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                        ✓ Settled
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handlePrintSlip(s)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-all inline-flex items-center gap-1"
                      >
                        <Printer size={13} /> {lang === 'si' ? 'රිසිට්පත' : 'Print Slip'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Printable Thermal/A4 Slip for Settlement */}
      {createPortal(
        <div id="settlement-print-area" className="hidden print:block fixed inset-0 bg-white z-[9999]">
          {selectedSettlement && (
            <div className="p-8 w-full max-w-[80mm] mx-auto font-mono border border-dashed border-black/20 text-xs text-black">
              <div className="text-center mb-6">
                <h2 className="text-xl font-black uppercase tracking-widest">{orgSettings.name}</h2>
                <p>{orgSettings.address}</p>
                <p>{orgSettings.phone}</p>
                <div className="my-4 border-y border-black py-2 font-bold bg-slate-50 uppercase">
                  DAILY REP SETTLEMENT SLIP
                </div>
              </div>

              <div className="space-y-2 mb-6 text-[11px]">
                <div className="flex justify-between"><span>DATE:</span> <strong className="font-bold">{selectedSettlement.date}</strong></div>
                <div className="flex justify-between"><span>TIME:</span> <span>{new Date(selectedSettlement.timestamp).toLocaleTimeString()}</span></div>
                <div className="flex justify-between"><span>REP NAME:</span> <strong className="font-bold">{selectedSettlement.repName || selectedSettlement.repId}</strong></div>
                <div className="flex justify-between"><span>REF ID:</span> <span className="font-mono text-[9px]">{selectedSettlement.id}</span></div>
              </div>

              <div className="border-t border-black pt-4 space-y-2 text-[11px]">
                <div className="flex justify-between"><span>GROSS CASH COLLECTED:</span> <strong>Rs.{(selectedSettlement.totalCash || 0).toLocaleString()}</strong></div>
                <div className="flex justify-between"><span>CHEQUES COLLECTED:</span> <strong>Rs.{(selectedSettlement.totalCheque || 0).toLocaleString()}</strong></div>
                {(selectedSettlement.expensesDeduction || 0) > 0 && (
                  <div className="flex justify-between text-rose-600"><span>EXPENSES DEDUCTED:</span> <strong>-Rs.{selectedSettlement.expensesDeduction?.toLocaleString()}</strong></div>
                )}
                {(selectedSettlement.advancesDeduction || 0) > 0 && (
                  <div className="flex justify-between text-rose-600"><span>ADVANCES DEDUCTED:</span> <strong>-Rs.{selectedSettlement.advancesDeduction?.toLocaleString()}</strong></div>
                )}
                
                <div className="border-t-2 border-black pt-3 flex justify-between text-sm font-black">
                  <span>NET CASH HANDED OVER:</span>
                  <span>Rs.{(selectedSettlement.netCashHandedOver !== undefined ? selectedSettlement.netCashHandedOver : (selectedSettlement.totalCash || 0)).toLocaleString()}</span>
                </div>
              </div>

              <div className="mt-12 pt-8 text-center text-[10px] space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="border-t border-black/40 pt-1">REP SIGNATURE</div>
                  <div className="border-t border-black/40 pt-1">ADMIN VERIFIED SIGN</div>
                </div>
                <div className="text-[8px] opacity-60">Printed on {new Date().toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

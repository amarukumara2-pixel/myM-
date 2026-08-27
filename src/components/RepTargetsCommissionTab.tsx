import { useState, useEffect } from 'react';
import { Target, Award, DollarSign, TrendingUp, Users, Save, CheckCircle2, ShieldAlert } from 'lucide-react';
import { getRepTargets, saveRepTargets, calculateRepPerformance, RepTargetConfig, RepPerformanceSummary } from '../lib/targets';
import { SystemUser } from '../lib/store';

export default function RepTargetsCommissionTab({ 
  sales, 
  users,
  lang = 'en'
}: { 
  sales: any[]; 
  users: SystemUser[];
  lang?: 'en' | 'si';
}) {
  const reps = users.filter(u => u.role === 'rep' || !u.role || u.role === 'other');
  const [targets, setTargets] = useState<Record<string, RepTargetConfig>>({});
  const [performances, setPerformances] = useState<RepPerformanceSummary[]>([]);
  const [editingRepId, setEditingRepId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RepTargetConfig>({
    repId: '',
    repName: '',
    dailyTarget: 35000,
    monthlyTarget: 1000000,
    commissionRate: 2.0,
    targetBonus: 5000
  });
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    loadData();
  }, [sales, users]);

  const loadData = () => {
    const currentTargets = getRepTargets();
    setTargets(currentTargets);

    const perfs = reps.map(r => {
      return calculateRepPerformance(sales, r.id, r.name);
    });
    setPerformances(perfs);
  };

  const handleOpenEdit = (rep: SystemUser) => {
    const existing = targets[rep.id] || {
      repId: rep.id,
      repName: rep.name,
      dailyTarget: 35000,
      monthlyTarget: 1000000,
      commissionRate: 2.0,
      targetBonus: 5000
    };
    setEditForm({ ...existing, repName: rep.name });
    setEditingRepId(rep.id);
  };

  const handleSaveTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRepId) return;

    const updated = {
      ...targets,
      [editingRepId]: editForm
    };
    setTargets(updated);
    saveRepTargets(updated);
    
    // Refresh calculations
    const perfs = reps.map(r => calculateRepPerformance(sales, r.id, r.name));
    setPerformances(perfs);

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setEditingRepId(null);
    }, 1200);
  };

  const totalMonthlySales = performances.reduce((acc, p) => acc + p.monthSales, 0);
  const totalCommissionPayable = performances.reduce((acc, p) => acc + p.totalEarnings, 0);
  const topPerformer = [...performances].sort((a, b) => b.monthAchievementPct - a.monthAchievementPct)[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Target className="text-blue-600" />
            {lang === 'si' ? 'රෙෆ් ඉලක්ක සහ විකුණුම් කොමිස්' : 'Sales Targets & Commission'}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {lang === 'si' 
              ? 'රෙෆ්වරුන්ගේ දෛනික/මාසික Target නියම කිරීම සහ කොමිස් මුදල් ස්වයංක්‍රීයව ගණනය කිරීම' 
              : 'Set daily & monthly revenue targets per Rep and automate commission payouts'}
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>{lang === 'si' ? 'මේ මාසයේ මුළු විකුණුම්' : 'Total Monthly Sales'}</span>
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-800">
            Rs. {totalMonthlySales.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {performances.reduce((acc, p) => acc + p.monthBillsCount, 0)} {lang === 'si' ? 'බිල්පත් නිකුත් කර ඇත' : 'bills issued this month'}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>{lang === 'si' ? 'ගෙවිය යුතු මුළු කොමිස් මුදල' : 'Total Commission Payable'}</span>
            <DollarSign size={16} className="text-blue-500" />
          </div>
          <div className="text-2xl font-black text-blue-600">
            Rs. {totalCommissionPayable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {lang === 'si' ? 'සියලුම රෙෆ්වරුන් සඳහා' : 'Combined for all active reps'}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>{lang === 'si' ? 'ඉහළම දස්කම් දැක්වූ රෙෆ්' : 'Top Performing Rep'}</span>
            <Award size={16} className="text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-800 truncate">
            {topPerformer ? topPerformer.repName : '-'}
          </div>
          <div className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            {topPerformer && topPerformer.monthAchievementPct > 0 ? (
              <>🎯 {topPerformer.monthAchievementPct}% {lang === 'si' ? 'ඉලක්කය සම්පූර්ණයි' : 'of monthly target'}</>
            ) : (
              lang === 'si' ? 'තවම දත්ත නැත' : 'No activity yet'
            )}
          </div>
        </div>
      </div>

      {/* Rep Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h4 className="font-bold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-slate-500" />
            {lang === 'si' ? 'රෙෆ් කාර්යසාධනය සහ කොමිස් ලැයිස්තුව' : 'Rep Performance & Payout Breakdown'}
          </h4>
          <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
            {reps.length} {lang === 'si' ? 'රෙෆ්වරු' : 'Active Reps'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">{lang === 'si' ? 'රෙෆ්' : 'Rep'}</th>
                <th className="py-3 px-4">{lang === 'si' ? 'අද විකුණුම් / Target' : 'Today Sales / Target'}</th>
                <th className="py-3 px-4">{lang === 'si' ? 'මාසික විකුණුම් / Target' : 'Monthly Sales / Target'}</th>
                <th className="py-3 px-4">{lang === 'si' ? 'සාර්ථකත්වය' : 'Achievement'}</th>
                <th className="py-3 px-4">{lang === 'si' ? 'කොමිස් අනුපාතය' : 'Rate'}</th>
                <th className="py-3 px-4">{lang === 'si' ? 'ගෙවිය යුතු කොමිස්' : 'Earned Commission'}</th>
                <th className="py-3 px-4 text-right">{lang === 'si' ? 'ක්‍රියා' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {performances.map(p => {
                const repUser = reps.find(r => r.id === p.repId);
                const cfg = targets[p.repId] || { dailyTarget: 35000, monthlyTarget: 1000000, commissionRate: 2.0, targetBonus: 5000 };

                return (
                  <tr key={p.repId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{p.repName}</div>
                      <div className="text-xs text-slate-400">ID: {p.repId}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-700">Rs. {p.todaySales.toLocaleString()}</div>
                      <div className="text-xs text-slate-400">Target: Rs. {cfg.dailyTarget.toLocaleString()}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-700">Rs. {p.monthSales.toLocaleString()}</div>
                      <div className="text-xs text-slate-400">Target: Rs. {cfg.monthlyTarget.toLocaleString()}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${p.monthAchievementPct >= 100 ? 'bg-emerald-500' : p.monthAchievementPct >= 60 ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, p.monthAchievementPct)}%` }}
                          />
                        </div>
                        <span className="font-bold text-xs text-slate-700">{p.monthAchievementPct}%</span>
                        {p.isTargetAchieved && (
                          <span title="Target Completed Bonus!">
                            <Award size={16} className="text-amber-500" />
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-semibold text-slate-600">
                      {cfg.commissionRate}%
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-blue-600">
                        Rs. {p.totalEarnings.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      {p.targetBonusEarned > 0 && (
                        <div className="text-[11px] text-emerald-600 font-semibold">
                          + Rs. {p.targetBonusEarned.toLocaleString()} Bonus!
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => repUser && handleOpenEdit(repUser)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-500 hover:text-blue-600 transition-colors"
                      >
                        {lang === 'si' ? 'Target වෙනස් කරන්න' : 'Set Targets'}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {performances.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {lang === 'si' ? 'ලියාපදිංචි රෙෆ්වරුන් නොමැත' : 'No sales reps found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Target Edit Modal */}
      {editingRepId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <Target className="text-blue-600" size={20} />
                {lang === 'si' ? 'ඉලක්ක නියම කිරීම' : 'Configure Rep Targets'} - {editForm.repName}
              </h4>
              <button 
                onClick={() => setEditingRepId(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTarget} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {lang === 'si' ? 'දෛනික විකුණුම් ඉලක්කය (Daily Target Rs.)' : 'Daily Sales Target (Rs.)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  required
                  value={editForm.dailyTarget}
                  onChange={e => setEditForm({ ...editForm, dailyTarget: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {lang === 'si' ? 'මාසික විකුණුම් ඉලක්කය (Monthly Target Rs.)' : 'Monthly Sales Target (Rs.)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  required
                  value={editForm.monthlyTarget}
                  onChange={e => setEditForm({ ...editForm, monthlyTarget: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-semibold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {lang === 'si' ? 'කොමිස් ප්‍රතිශතය (%)' : 'Commission Rate (%)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                    value={editForm.commissionRate}
                    onChange={e => setEditForm({ ...editForm, commissionRate: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {lang === 'si' ? '100% Target Bonus (Rs.)' : 'Target Bonus (Rs.)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={editForm.targetBonus || 0}
                    onChange={e => setEditForm({ ...editForm, targetBonus: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-semibold text-slate-800"
                  />
                </div>
              </div>

              {savedSuccess ? (
                <div className="p-3 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-xl flex items-center justify-center gap-2">
                  <CheckCircle2 size={18} />
                  {lang === 'si' ? 'සාර්ථකව සුරකින ලදී!' : 'Targets Saved Successfully!'}
                </div>
              ) : (
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingRepId(null)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
                  >
                    {lang === 'si' ? 'අවලංගු කරන්න' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <Save size={16} />
                    {lang === 'si' ? 'සුරකින්න' : 'Save Targets'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

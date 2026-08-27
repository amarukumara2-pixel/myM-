import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Building2, Plus, Trash2, Calendar, ShieldCheck, ArrowLeft, RefreshCw, Globe, Activity, DollarSign, Bot, DownloadCloud, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchAllOrganizations, saveOrganization, deleteOrganization } from '../lib/sync';
import { setActiveOrgId } from '../lib/store';

export default function SuperAdmin() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newOrg, setNewOrg] = useState({ 
    id: '', 
    name: '', 
    phone: '',
    status: 'Active', 
    subscriptionExpiry: '', 
    repCount: 0, 
    hasStockKeeper: false 
  });

  useEffect(() => {
    loadOrgs();
  }, []);

  const calculateCost = (org: any) => {
    if (org.status === 'Trial') return 0;
    
    let total = 500; // Base Admin
    total += (org.repCount || 0) * 500;
    if (org.hasStockKeeper) total += 1000;
    
    return total;
  };

  const toggleLockOrg = async (org: any) => {
    const updatedOrg = { ...org, isLocked: !org.isLocked };
    await saveOrganization(updatedOrg);
    loadOrgs();
  };

  const loadOrgs = async () => {
    setLoading(true);
    const data = await fetchAllOrganizations();
    setOrgs(data);
    setLoading(false);
  };

  const handleSaveOrg = async () => {
    if (!newOrg.id || !newOrg.name || !newOrg.phone) return;
    const existingOrg = orgs.find(o => o.id === newOrg.id);
    const orgData = {
      ...existingOrg,
      ...newOrg,
      createdAt: existingOrg?.createdAt || Date.now(),
      subscriptionExpiry: newOrg.subscriptionExpiry || existingOrg?.subscriptionExpiry || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Default 30 days
    };
    await saveOrganization(orgData);
    setNewOrg({ id: '', name: '', phone: '', status: 'Active', subscriptionExpiry: '', repCount: 0, hasStockKeeper: false });
    setIsEditing(false);
    setShowAddModal(false);
    loadOrgs();
  };

  const handleEditClick = (org: any) => {
    setIsEditing(true);
    setNewOrg({
      id: org.id || '',
      name: org.name || '',
      phone: org.phone || '',
      status: org.status || 'Active',
      subscriptionExpiry: org.subscriptionExpiry || '',
      repCount: org.repCount || 0,
      hasStockKeeper: org.hasStockKeeper || false
    });
    setShowAddModal(true);
  };

  const getOrgStatus = (org: any) => {
    if (org.isLocked) return { label: 'Locked', color: 'bg-rose-500/20 text-rose-400' };
    
    const createdAt = typeof org.createdAt === 'string' ? new Date(org.createdAt).getTime() : org.createdAt;
    if (createdAt) {
      const trialDays = 7;
      const trialEnd = createdAt + (trialDays * 24 * 60 * 60 * 1000);
      if (Date.now() < trialEnd) {
        return { label: 'Trial', color: 'bg-blue-500/20 text-blue-400' };
      }
    }
    
    return { label: org.status || 'Active', color: 'bg-emerald-500/20 text-emerald-400' };
  };

  const loginAsOrg = (id: string) => {
    setActiveOrgId(id);
    navigate('/');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-white p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-4xl font-display font-black tracking-tighter text-blue-400">BIZFLOW <span className="text-white">MASTER</span></h1>
              <p className="text-slate-500">Global Infrastructure & Organization Management</p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={() => window.location.href = '/api/download-app'}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-bold flex items-center gap-2 transition-all"
              title="Download Source Code for Netlify"
            >
              <DownloadCloud size={20} /> Download for Netlify (ZIP)
            </button>
            <button 
              onClick={loadOrgs}
              className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 text-slate-400"
            >
              <RefreshCw size={24} className={loading ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={() => {
                setIsEditing(false);
                setNewOrg({ id: '', name: '', phone: '', status: 'Active', subscriptionExpiry: '', repCount: 0, hasStockKeeper: false });
                setShowAddModal(true);
              }}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-2xl font-bold flex items-center gap-2 transition-all"
            >
              <Plus size={20} /> Add New Company
            </button>
          </div>
        </header>



        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
           <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-4">
                 <Building2 className="text-blue-400" size={32} />
                 <span className="text-3xl font-display font-bold">{orgs.length}</span>
              </div>
              <p className="text-slate-400 font-medium">Total Registered Institutions</p>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-4">
                 <Activity className="text-emerald-400" size={32} />
                 <span className="text-3xl font-display font-bold">{orgs.filter(o => o.status === 'Active').length}</span>
              </div>
              <p className="text-slate-400 font-medium">Active Operations</p>
           </div>
           <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-4">
                 <DollarSign className="text-amber-400" size={32} />
                 <span className="text-3xl font-display font-bold">LKR {orgs.reduce((sum, o) => sum + calculateCost(o), 0).toLocaleString()}</span>
              </div>
              <p className="text-slate-400 font-medium">Monthly Potential Revenue</p>
           </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-8 py-6 text-slate-400 font-medium text-sm uppercase tracking-wider">Institution</th>
                <th className="px-8 py-6 text-slate-400 font-medium text-sm uppercase tracking-wider">Plan / Status</th>
                <th className="px-8 py-6 text-slate-400 font-medium text-sm uppercase tracking-wider">Managed Users</th>
                <th className="px-8 py-6 text-slate-400 font-medium text-sm uppercase tracking-wider">Monthly Fee</th>
                <th className="px-8 py-6 text-slate-400 font-medium text-sm uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {orgs.map(org => (
                <tr key={org.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center font-bold text-blue-400">
                        {org.name?.[0]}
                      </div>
                      <div>
                        <div className="font-bold text-lg">{org.name}</div>
                        <div className="text-xs font-mono text-slate-500">{org.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <span className={`w-fit px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getOrgStatus(org).color}`}>
                        {getOrgStatus(org).label}
                      </span>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Reg: {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex gap-2">
                       <div title="Reps" className="px-2 py-1 bg-white/5 rounded-lg border border-white/10 text-xs flex items-center gap-1">
                          <Activity size={10} className="text-blue-400" /> {org.repCount || 0}
                       </div>
                       {org.hasStockKeeper && (
                          <div title="Stock Keeper" className="px-2 py-1 bg-white/5 rounded-lg border border-white/10 text-xs flex items-center gap-1">
                             <Building2 size={10} className="text-amber-400" /> 1
                          </div>
                       )}
                       {org.hasAI && (
                          <div title="AI Enabled" className="px-2 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">
                             AI
                          </div>
                       )}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="font-mono font-bold text-emerald-400">
                      LKR {calculateCost(org).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => handleEditClick(org)}
                        className="px-4 py-2 bg-amber-600/20 text-amber-400 border border-amber-400/30 rounded-xl hover:bg-amber-600 hover:text-white transition-all text-sm font-bold flex items-center gap-1.5"
                        title="Edit Details"
                      >
                        <Edit size={16} /> Edit
                      </button>
                      <button 
                        onClick={() => toggleLockOrg(org)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          org.isLocked ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-400/30 hover:bg-emerald-600 hover:text-white' : 
                                         'bg-rose-600/20 text-rose-400 border border-rose-400/30 hover:bg-rose-600 hover:text-white'
                        }`}
                      >
                        {org.isLocked ? 'Unlock Access' : 'Lock Account'}
                      </button>
                      <button 
                        onClick={() => loginAsOrg(org.id)}
                        className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-400/30 rounded-xl hover:bg-blue-600 hover:text-white transition-all text-sm font-bold"
                      >
                        Login As
                      </button>
                      <button 
                        onClick={() => setConfirmDeleteOrg(org)}
                        className="px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-all text-sm font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20"
                        title="Delete Organization"
                      >
                        <Trash2 size={16} /> <span>Delete Organization</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && !loading && (

                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-4">
                      <Globe size={48} className="opacity-20" />
                      <div>
                        <p className="text-xl font-bold text-slate-300 mb-1">No Organizations Found</p>
                        <p className="text-sm opacity-60">වහන්සේගේ පද්ධතියේ කිසිදු ආයතනයක් තවමත් ලියාපදිංචි කර නැත.</p>
                        <button 
                          onClick={() => setShowAddModal(true)}
                          className="mt-6 px-6 py-3 bg-blue-600/20 text-blue-400 border border-blue-400/30 rounded-2xl hover:bg-blue-600 hover:text-white transition-all font-bold"
                        >
                          පළමු ආයතනය ඇතුළත් කරන්න (Add First Company)
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

        {confirmDeleteOrg && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#111827] border border-white/10 rounded-[2.5rem] p-10 max-w-sm w-full"
            >
              <h2 className="text-2xl font-display font-bold mb-4 text-rose-400">Permanently Delete?</h2>
              <p className="text-slate-400 mb-8">Are you sure you want to delete <span className="font-bold text-white">{confirmDeleteOrg.name}</span>? This action cannot be undone and will permanently erase all data for this organization.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setConfirmDeleteOrg(null)}
                  className="py-4 rounded-2xl border border-white/10 font-bold hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    await deleteOrganization(confirmDeleteOrg.id);
                    setConfirmDeleteOrg(null);
                    loadOrgs();
                  }}
                  className="py-4 rounded-2xl bg-rose-600 font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
                >
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </div>
        )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#111827] border border-white/10 rounded-[2.5rem] p-10 max-w-lg w-full"
          >
            <h2 className="text-3xl font-display font-bold mb-8">
              {isEditing ? 'Edit Institution Details' : 'Register New Institution'}
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Company Name</label>
                <input 
                  autoFocus
                  type="text"
                  placeholder="e.g. Royal Fresh Distributors"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 transition-all focus:border-blue-500 outline-none select-text"
                  onPaste={e => e.stopPropagation()}
                  value={newOrg.name}
                  onChange={e => setNewOrg({...newOrg, name: e.target.value})}
                />
              </div>
               <div>
                <label className="block text-sm text-slate-400 mb-2">Company Phone Number</label>
                <input 
                  type="tel"
                  placeholder="e.g. 07XXXXXXXX"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 transition-all focus:border-blue-500 outline-none select-text"
                  onPaste={e => e.stopPropagation()}
                  value={newOrg.phone}
                  onChange={e => setNewOrg({...newOrg, phone: e.target.value.replace(/[^0-9+]/g, '')})}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Internal Business ID (UID)</label>
                <input 
                  type="text"
                  placeholder="e.g. ROYAL-FRESH-001"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 transition-all focus:border-blue-500 outline-none font-mono select-text disabled:opacity-50 disabled:cursor-not-allowed"
                  onPaste={e => e.stopPropagation()}
                  value={newOrg.id}
                  onChange={e => setNewOrg({...newOrg, id: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')})}
                  disabled={isEditing}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Initial Status</label>
                <select 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 outline-none"
                  value={newOrg.status}
                  onChange={e => setNewOrg({...newOrg, status: e.target.value})}
                >
                   <option value="Active">Active Subscription</option>
                   <option value="Trial">Free Trial</option>
                   <option value="Inactive">Inactive</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2 font-medium">Service Components</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl">
                    <div className="text-sm">Sales Reps</div>
                    <input 
                      type="number"
                      className="w-16 bg-white/10 rounded-lg p-2 text-center text-sm font-bold outline-none"
                      value={newOrg.repCount}
                      onChange={e => setNewOrg({...newOrg, repCount: parseInt(e.target.value) || 0})}
                    />
                  </div>
                  <button 
                    onClick={() => setNewOrg({...newOrg, hasStockKeeper: !newOrg.hasStockKeeper})}
                    className={`flex items-center justify-between p-4 border rounded-2xl transition-all ${
                      newOrg.hasStockKeeper ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    <span className="text-sm">Stock Keeper</span>
                    <input type="checkbox" checked={newOrg.hasStockKeeper} readOnly className="sr-only" />
                    <div className={`w-10 h-6 rounded-full relative transition-colors ${newOrg.hasStockKeeper ? 'bg-amber-500' : 'bg-slate-700'}`}>
                       <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${newOrg.hasStockKeeper ? 'left-5' : 'left-1'}`} />
                    </div>
                  </button>

                </div>
              </div>

              <div className="p-6 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex justify-between items-center">
                 <div className="text-blue-400 font-bold uppercase tracking-tighter text-xs">Calculated Monthly Revenue</div>
                 <div className="text-2xl font-display font-black text-white">LKR {calculateCost(newOrg).toLocaleString()}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-8">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="py-4 rounded-2xl border border-white/10 font-bold hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveOrg}
                  className="py-4 rounded-2xl bg-blue-600 font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
                >
                  {isEditing ? 'Save Changes' : 'Confirm Registration'}
                </button>
              </div>
            </div>
          </motion.div>
          </div>
      )}
    </div>
  );
}

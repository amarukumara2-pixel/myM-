import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Building2, ArrowRight, ShieldCheck, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { saveOrganization } from '../lib/sync';
import { setActiveOrgId } from '../lib/store';

export default function RegisterOrg() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    adminPin: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Ensure ID format is clean
    const formattedId = formData.id.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    
    if (!formattedId || !formData.name || !formData.phone || formData.adminPin.length !== 4) {
      alert("Please ensure all fields are filled securely, including a 4-digit PIN.");
      return;
    }
    
    setLoading(true);
    try {
      const orgData = {
        id: formattedId,
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        createdAt: Date.now(),
        subscriptionExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 day trial
        status: 'Active',
        repCount: 0,
        hasStockKeeper: false,
        hasAI: false,
        isLocked: false
      };
      
      await saveOrganization(orgData);

      // Initialize Organization Settings in the settings document too
      const initialSettings = {
        id: formattedId,
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        logoUrl: '',
        printerFontSize: 13,
        printerSize: '58',
        isLocked: false
      };
      
      // We can use safeSetDoc here
      const { db, safeSetDoc } = await import('../lib/sync');
      const { doc } = await import('firebase/firestore');
      await safeSetDoc(doc(db, 'system', `org_${formattedId}_settings`), initialSettings, { merge: true });

      // Create Admin User with their chosen PIN
      const adminUser = {
        id: `admin_${formattedId}`,
        name: 'Admin',
        pin: formData.adminPin,
        role: 'admin',
        organizationId: formattedId
      };
      
      // Save it locally and trigger sync so when they login it is ready
      localStorage.setItem(`bizflow_${formattedId}_users_v2`, JSON.stringify([adminUser]));
      
      setSuccess(true);
    } catch (error) {
      console.error("Error creating organization:", error);
      alert("Failed to register. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0A0F1C] flex flex-col items-center justify-center p-6 font-sans text-white">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-emerald-500/30 rounded-[2.5rem] p-10 text-center"
        >
          <div className="mb-6 flex justify-center">
            <CheckCircle2 size={80} className="text-emerald-500" />
          </div>
          <h2 className="text-3xl font-display font-bold mb-4 text-emerald-400">Registration Successful!</h2>
          <p className="text-slate-300 mb-6">
            Your organization has been successfully registered. You now have a 7-day free trial.
          </p>
          <div className="bg-black/30 rounded-xl p-4 mb-8">
            <p className="text-sm text-slate-400 mb-1">Your Business ID</p>
            <p className="text-2xl font-mono font-bold text-white tracking-wider">{formData.id.toUpperCase()}</p>
          </div>
          <button
            onClick={() => {
              setActiveOrgId(formData.id.toUpperCase());
              window.location.href = '/';
            }}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all"
          >
            Access Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0F1C] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans text-white">
      <div className="absolute top-8 left-8">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center text-slate-400 hover:text-white transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-full"
        >
          <ArrowLeft size={24} />
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-10"
      >
        <div className="mb-6 flex justify-center">
          <Building2 size={64} className="text-blue-400" />
        </div>
        <h2 className="text-3xl font-display font-bold mb-2 text-center">Register Organization</h2>
        <p className="text-slate-400 mb-6 text-center text-sm">Create an account for your business to get started with BizFlow.</p>
        
        <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-4 mb-8">
          <h3 className="text-blue-400 font-semibold mb-2 text-sm text-center">පිළිගන්නවා BizFlow වෙත!</h3>
          <p className="text-slate-300 text-xs text-center leading-relaxed">
            මෙමගින් ඔබට ඔබේ ව්‍යාපාරයේ Sales Reps ලාට Inventory, Attendance සහ Routes කළමනාකරණය කිරීමටත්, Admin වෙතට සියලු තොරතුරු තත්‍ය කාලීනව (Real-time) ලබා ගැනීමටත් හැකිවේ. 
          </p>
          <div className="mt-3 text-center">
            <span className="inline-block bg-blue-500/20 text-blue-300 text-[10px] uppercase font-bold px-2 py-1 rounded">මුලින්ම ව්‍යාපාරයේ නම සහ තොරතුරු ඇතුලත් කරන්න</span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Business ID (Unique Login Code)</label>
            <input 
              type="text"
              required
              placeholder="e.g. MYM-DISTRIBUTORS"
              value={formData.id}
              onChange={(e) => setFormData({...formData, id: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')})}
              className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-blue-500 focus:ring-1 ring-blue-500 outline-none transition-all placeholder:text-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Business Name</label>
            <input 
              type="text"
              required
              placeholder="Full Business Name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white focus:border-blue-500 focus:ring-1 ring-blue-500 outline-none transition-all placeholder:text-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Phone Number</label>
            <input 
              type="tel"
              required
              placeholder="Contact Number (Admin)"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white focus:border-blue-500 focus:ring-1 ring-blue-500 outline-none transition-all placeholder:text-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Admin Login PIN</label>
            <input 
              type="password"
              required
              maxLength={4}
              placeholder="4-Digit PIN e.g. 1234"
              value={formData.adminPin}
              onChange={(e) => setFormData({...formData, adminPin: e.target.value.replace(/\D/g, '').slice(0, 4)})}
              className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white focus:border-blue-500 focus:ring-1 ring-blue-500 outline-none transition-all placeholder:text-slate-600 font-mono tracking-widest text-center"
            />
            <p className="text-[10px] text-slate-500 mt-2 text-center text-amber-500/80">කරුණාකර ඉලක්කම් 4ක PIN අංකයක් ඇතුලත් කරන්න. මෙය ඔබව Admin ලෙස Log වීමට භාවිතා වේ.</p>
          </div>

          <button 
            type="submit"
            disabled={!formData.id || !formData.name || !formData.phone || formData.adminPin.length !== 4 || loading}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 flex items-center justify-center gap-2 rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? 'Registering...' : 'Register Now'}
            {!loading && <ArrowRight size={20} />}
          </button>
        </form>
        
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span>Includes a 7-day free trial</span>
        </div>
      </motion.div>
    </div>
  );
}

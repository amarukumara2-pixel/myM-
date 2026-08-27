import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Activity, ArrowRight, X, Lock, ChevronRight, Building2, ExternalLink, Users, Fingerprint } from 'lucide-react';
import AdminDashboard from './pages/AdminDashboard';
import RepDashboard from './pages/RepDashboard';
import SuperAdmin from './pages/SuperAdmin';
import RegisterOrg from './pages/RegisterOrg';
import AnimatedLogo from './components/Logo';
import { getUsers, SystemUser, getActiveOrgId, setActiveOrgId, getOrganizationSettings } from './lib/store';
import { isBiometricSupported, hasBiometricRegistered, verifyBiometric } from './lib/biometrics';
// import { processSyncQueue } from './lib/sync'; // Removed static import
import { FireworksBackground } from './components/Fireworks';
import { DialogContainer } from './components/Dialogs';
import { Watermark } from './components/Watermark';
import { TopNotificationBanner } from './components/TopNotificationBanner';

function Home() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'rep' | 'stock_keeper' | 'other' | null>(null);
  const [selectedRep, setSelectedRep] = useState<SystemUser | null>(null);
  const [pinMode, setPinMode] = useState<boolean>(false);
  const [pin, setPin] = useState('');
  const [errorText, setErrorText] = useState('');
  const [showSplash, setShowSplash] = useState(true);
  const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);
  const [orgSettings, setOrgSettings] = useState(getOrganizationSettings());
  const navigate = useNavigate();

  useEffect(() => {
    // Check for global lock status from Master Admin
    const activeOrg = getActiveOrgId();
    if (navigator.onLine && activeOrg !== 'default') {
      import('./lib/sync').then(async ({ db }) => {
        const { doc, getDoc } = await import('firebase/firestore');
        try {
          const orgDoc = await getDoc(doc(db, 'organizations', activeOrg));
          if (orgDoc.exists()) {
             const data = orgDoc.data();
             if (data.isLocked !== orgSettings.isLocked) {
                setOrgSettings(prev => ({ ...prev, isLocked: data.isLocked }));
             }
          }
        } catch(e) {}
      });
    }
  }, [getActiveOrgId()]);

  useEffect(() => {
    const loadData = () => {
      try {
        setUsers(getUsers());
      } catch (e) {
        console.error("Error initializing users:", e);
      }
    };

    loadData();
    
    // Auto-sync from cloud if online
    if (navigator.onLine) {
      import('./lib/store').then(mod => {
        mod.syncAllFromCloud().then(() => {
          loadData();
        });
      });
      import('./lib/sync').then(mod => {
        mod.initRealtimeSyncListeners();
      });
    }

    const handleSync = (e: any) => {
      if (e.detail?.table === 'users') loadData();
      if (e.detail?.table === 'settings') setOrgSettings(e.detail.data);
    };
    window.addEventListener('bizflow_sync', handleSync);

    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 4000);
    return () => {
      clearTimeout(splashTimer);
      window.removeEventListener('bizflow_sync', handleSync);
    };
  }, []);

  const handleAdminClick = () => {
    setSelectedRole('admin');
    setSelectedRep(null);
    setPin('');
    setErrorText('');
    setPinMode(true);
  };

  const handleStockClick = () => {
    setSelectedRole('stock_keeper');
    setSelectedRep(null);
    setPin('');
    setErrorText('');
    setPinMode(true);
  };

  const handleRepClick = () => {
    setSelectedRole('rep');
    setSelectedRep(null);
    setPin('');
    setErrorText('');
    setPinMode(true);
  };

  const handleStaffClick = () => {
    setSelectedRole('other');
    setSelectedRep(null);
    setPin('');
    setErrorText('');
    setPinMode(true);
  };

  const closePinModal = () => {
    setPinMode(false);
    setPin('');
    setErrorText('');
    setIsSuperAdminMode(false);
    setSelectedRole(null);
  };

  const targetBiometricUser = selectedRep || (selectedRole ? users.find(u => u.role === selectedRole) : null);

  const handleBiometricSubmit = async () => {
    if (!targetBiometricUser) return;
    setErrorText('');
    const res = await verifyBiometric(targetBiometricUser.id);
    if (res.success) {
      if (selectedRole === 'admin' || selectedRole === 'stock_keeper') {
        sessionStorage.setItem('current_user', JSON.stringify(targetBiometricUser));
        navigate('/admin');
      } else {
        sessionStorage.setItem('current_rep', JSON.stringify(targetBiometricUser));
        navigate('/rep');
      }
    } else {
      setErrorText(res.error || "Biometric authentication failed");
    }
  };

  const handlePinSubmit = () => {
    if (isSuperAdminMode) {
      if (pin === '07612') { // Super Admin Secret PIN
        setIsSuperAdminMode(false);
        setPinMode(false);
        navigate('/master-control'); // Navigate directly
      } else {
        setErrorText("Invalid Master PIN");
      }
      return;
    }

    if (selectedRole === 'admin' || selectedRole === 'stock_keeper') {
      const user = users.find(u => u.role === selectedRole);
      if (user && user.pin === pin) {
        sessionStorage.setItem('current_user', JSON.stringify(user));
        navigate('/admin');
      } else {
        setErrorText(`Incorrect ${selectedRole === 'admin' ? 'Admin' : 'Stock Keeper'} PIN`);
        setPin('');
      }
    } else if (selectedRole === 'rep') {
      if (selectedRep && selectedRep.pin === pin) {
        sessionStorage.setItem('current_rep', JSON.stringify(selectedRep));
        navigate('/rep');
      } else {
        setErrorText("Incorrect PIN");
        setPin('');
      }
    }
  };



  if (showSplash) {
    return (
      <div className="min-h-screen bg-[#0A0F1C] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        <FireworksBackground />
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[20%] left-[20%] w-[400px] h-[400px] bg-blue-600/30 blur-[150px] rounded-full mix-blend-screen animate-pulse"></div>
          <div className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] bg-emerald-500/20 blur-[150px] rounded-full mix-blend-screen animate-pulse"></div>
        </div>
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }} 
          animate={{ opacity: 1, scale: 1 }} 
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="z-10 flex flex-col items-center justify-center"
        >
          {/* Custom MYM Logo */}
          <div className="mb-6">
            <AnimatedLogo className="w-48 h-48 md:w-64 md:h-64" />
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tighter text-white mb-2 uppercase">
            {orgSettings.name.split(' ')[0]} <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-indigo-400">{orgSettings.name.split(' ').slice(1).join(' ') || 'CORE'}</span>
          </h2>
          <div className="flex items-center gap-3 mt-6">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Immersive Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-600/20 blur-[150px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-emerald-500/10 blur-[150px] rounded-full mix-blend-screen"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.8, ease: "easeOut" }} 
        className="z-10 text-center max-w-4xl mb-20 flex flex-col items-center"
      >
        <div className="mb-4">
          <AnimatedLogo className="w-32 h-32 md:w-40 md:h-40" />
        </div>
        <h1 className="font-display text-5xl md:text-7xl font-bold mb-4 tracking-tighter">
          {orgSettings.name.split(' ')[0]} <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-indigo-400">{orgSettings.name.split(' ').slice(1).join(' ') || 'CORE'}</span>
        </h1>
        <p className="text-xl md:text-2xl text-slate-400 font-light mb-4">
          Intelligent Supply & Distribution Management
        </p>
        <p className="text-sm md:text-base text-slate-500 tracking-widest uppercase mb-4">
          {orgSettings.address || 'Business Intelligence & Management'}{orgSettings.phone ? ` • ${orgSettings.phone}` : ''}
        </p>

      </motion.div>

      <div className={`grid gap-6 w-full max-w-7xl z-10 ${
        (orgSettings.hasStockKeeper && orgSettings.hasStaff) 
          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" 
          : (orgSettings.hasStockKeeper || orgSettings.hasStaff)
            ? "grid-cols-1 md:grid-cols-3 max-w-6xl mx-auto" 
            : "grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto"
      }`}>
        <motion.div 
          onClick={handleAdminClick}
          whileHover={{ scale: 1.02, y: -5 }} 
          whileTap={{ scale: 0.98 }} 
          className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 hover:bg-white/10 transition-all cursor-pointer overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity text-white duration-500 transform group-hover:scale-110">
              <ShieldCheck size={120} />
          </div>
          <div className="bg-white/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 backdrop-blur-md">
            <ShieldCheck className="text-white" size={24} />
          </div>
          <h2 className="font-display text-2xl font-semibold mb-3 flex items-center">
            Admin
            <ArrowRight className="ml-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all w-5 h-5" />
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Full oversight. Manage inventory, financials, and staff.
          </p>
        </motion.div>

        {orgSettings.hasStockKeeper && (
          <motion.div 
            onClick={handleStockClick}
            whileHover={{ scale: 1.02, y: -5 }} 
            whileTap={{ scale: 0.98 }} 
            className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 hover:bg-white/10 transition-all cursor-pointer overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity text-white duration-500 transform group-hover:scale-110">
                <Building2 size={120} />
            </div>
            <div className="bg-amber-500/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 backdrop-blur-md">
              <Building2 className="text-amber-400" size={24} />
            </div>
            <h2 className="font-display text-2xl font-semibold mb-3 flex items-center">
              Stock Keeper
              <ArrowRight className="ml-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all w-5 h-5" />
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Manage inventory arrivals, returns, and rep loading.
            </p>
          </motion.div>
        )}
        
        <motion.div 
          onClick={handleRepClick}
          whileHover={{ scale: 1.02, y: -5 }} 
          whileTap={{ scale: 0.98 }} 
          className="group relative bg-gradient-to-br from-blue-600/20 to-blue-900/40 backdrop-blur-xl border border-blue-500/30 rounded-[2rem] p-8 hover:border-blue-400/50 transition-all cursor-pointer overflow-hidden shadow-[0_0_40px_rgba(37,99,235,0.15)]"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-blue-300 duration-500 transform group-hover:scale-110">
              <Activity size={120} />
          </div>
          <div className="bg-blue-500/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6 backdrop-blur-md">
            <Activity className="text-blue-300" size={24} />
          </div>
          <h2 className="font-display text-2xl font-semibold mb-3 text-blue-50 flex items-center">
            Sales Rep
            <ArrowRight className="ml-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all w-5 h-5" />
          </h2>
          <p className="text-blue-200/80 text-sm leading-relaxed">
            Issue bills, manage collections and settlements.
          </p>
        </motion.div>

        {orgSettings.hasStaff && (
          <motion.div 
            onClick={handleStaffClick}
            whileHover={{ scale: 1.02, y: -5 }} 
            whileTap={{ scale: 0.98 }} 
            className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 hover:bg-white/10 transition-all cursor-pointer overflow-hidden shadow-[0_0_40px_rgba(255,255,255,0.05)]"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-slate-300 duration-500 transform group-hover:scale-110">
                <Users size={120} />
            </div>
            <div className="bg-slate-500/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6 backdrop-blur-md">
              <Users className="text-slate-300" size={24} />
            </div>
            <h2 className="font-display text-2xl font-semibold mb-3 flex items-center">
              Staff 
              <ArrowRight className="ml-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all w-5 h-5" />
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Other roles like Drivers, Assistants and Logistics.
            </p>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {pinMode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full text-slate-800 shadow-2xl relative"
            >
              <button 
                onClick={closePinModal}
                className="absolute top-4 right-4 p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                  <Lock size={32} />
                </div>
                
                {isSuperAdminMode ? (
                  <>
                    <h2 className="font-display font-bold text-2xl mb-2 text-rose-600">Master System</h2>
                    <p className="text-slate-500 text-center mb-6 text-sm">Enter 5-digit super admin PIN</p>
                  </>
                ) : selectedRole === 'admin' ? (
                  <>
                    <h2 className="font-display font-bold text-2xl mb-2">Admin Login</h2>
                    <p className="text-slate-500 text-center mb-6 text-sm">Enter your 4-digit master PIN</p>
                  </>
                ) : selectedRole === 'stock_keeper' ? (
                  <>
                    <h2 className="font-display font-bold text-2xl mb-2 text-amber-600">Stock Keeper</h2>
                    <p className="text-slate-500 text-center mb-6 text-sm">Enter your 4-digit PIN</p>
                  </>
                ) : !selectedRep ? (
                   <>
                    <h2 className="font-display font-bold text-2xl mb-2">Select Your Profile</h2>
                    <p className="text-slate-500 text-center mb-6 text-sm">Choose your name to login</p>
                  </>
                ) : (
                  <>
                    <h2 className="font-display font-bold text-2xl mb-2">{selectedRep.name}</h2>
                    <p className="text-[10px] uppercase font-bold text-blue-600 mb-2 tracking-widest">{selectedRep.role.replace('_', ' ')}</p>
                    <p className="text-slate-500 text-center mb-6 text-sm">Enter your 4-digit PIN</p>
                    <button onClick={() => setSelectedRep(null)} className="text-blue-600 text-sm hover:underline mb-4 shrink-0">Change User</button>
                  </>
                )}

                {(selectedRole === 'rep' || selectedRole === 'other') && !selectedRep ? (
                  <div className="w-full space-y-2 mb-4 max-h-[300px] overflow-y-auto pr-2">
                    {users.filter(u => selectedRole === 'rep' ? u.role === 'rep' : (u.role !== 'admin' && u.role !== 'rep')).length === 0 ? (
                       <p className="text-center text-rose-500 font-medium py-4">No employees found. Please contact Admin.</p>
                    ) : (
                      users.filter(u => selectedRole === 'rep' ? u.role === 'rep' : (u.role !== 'admin' && u.role !== 'rep')).map(rep => (
                        <button 
                          key={rep.id} 
                          onClick={() => setSelectedRep(rep)}
                          className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors font-medium flex justify-between items-center"
                        >
                           <div className="flex flex-col">
                             <span className="font-bold">{rep.name}</span>
                             <span className="text-[10px] text-slate-400 uppercase tracking-wider">{rep.role === 'other' ? (rep.customRoleName || 'Staff') : rep.role.replace('_', ' ')}</span>
                           </div>
                           <ChevronRight size={18} className="text-slate-400" />
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="w-full">
                    {targetBiometricUser && hasBiometricRegistered(targetBiometricUser.id) && (
                      <div className="mb-5">
                        <button
                          type="button"
                          onClick={handleBiometricSubmit}
                          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm py-3.5 px-4 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 uppercase tracking-wider"
                        >
                          <Fingerprint size={20} className="text-emerald-100" />
                          <span>Unlock with Fingerprint / Face ID</span>
                        </button>
                        <div className="flex items-center gap-3 my-4">
                          <div className="h-[1px] bg-slate-200 flex-1"></div>
                          <span className="text-[10px] uppercase font-bold text-slate-400">OR WITH PIN</span>
                          <div className="h-[1px] bg-slate-200 flex-1"></div>
                        </div>
                      </div>
                    )}

                    <input 
                      type="password" 
                      maxLength={isSuperAdminMode ? 5 : 4}
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value.replace(/\D/g, ''));
                        setErrorText('');
                      }}
                      onPaste={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.key === 'Enter' && pin.length >= 4 && handlePinSubmit()}
                      placeholder={isSuperAdminMode ? "• • • • •" : "• • • •"}
                      className="w-full bg-slate-50 border border-slate-200 text-center text-3xl tracking-[1em] p-4 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 ring-blue-500/20 font-mono select-text"
                      autoFocus
                    />
                    
                    {errorText && <p className="text-rose-500 text-sm text-center mt-3 font-medium">{errorText}</p>}
                    
                    <button 
                      onClick={handlePinSubmit}
                      disabled={isSuperAdminMode ? pin.length !== 5 : pin.length < 4}
                      className="w-full mt-6 bg-blue-600 text-white font-bold text-lg py-4 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-[0.98]"
                    >
                      Unlock
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="mt-4 text-slate-400 text-xs">Build: 2026-05-07 05:20</p>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    // Start listening for cloud changes to sync data across devices in real-time
    let unsubscribe: (() => void) | undefined;
    
    import('./lib/store').then(mod => {
      mod.listenToCloudChanges((table, data) => {
        console.log(`Cloud sync triggered for ${table}`);
        window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table, data } }));
      }).then(unsub => {
        unsubscribe = unsub;
      });
    });

    let lastReconnectSync = 0;
    let reconnectSyncInFlight = false;
    const triggerSyncQueue = async () => {
      if (typeof navigator === 'undefined' || !navigator.onLine || reconnectSyncInFlight) return;
      const now = Date.now();
      if (now - lastReconnectSync < 30000) return;
      lastReconnectSync = now;
      reconnectSyncInFlight = true;
      try {
        const [{ processSyncQueue, isQuotaPaused }, { syncAllFromCloud }] = await Promise.all([
          import('./lib/sync'),
          import('./lib/store')
        ]);
        if (!isQuotaPaused()) {
          await processSyncQueue();
          await syncAllFromCloud();
        }
      } catch (err) {
        console.warn('Reconnect sync notice:', err);
      } finally {
        reconnectSyncInFlight = false;
      }
    };

    // Reconnect is the only automatic network trigger. Focus, visibility and
    // periodic polling caused unnecessary reads whenever the phone woke up.
    window.addEventListener('online', triggerSyncQueue);
    return () => window.removeEventListener('online', triggerSyncQueue);
  }, []);

  return (
    <>
      <TopNotificationBanner />
      <DialogContainer />
      <BrowserRouter>
        <Watermark />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
          <Route path="/rep/*" element={<RepDashboard />} />
          <Route path="/master-control" element={<SuperAdmin />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

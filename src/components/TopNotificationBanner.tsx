import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BellOff, X, CheckCircle2, Package, ShieldCheck, DollarSign, AlertCircle, Sparkles } from 'lucide-react';
import { 
  AppNotification, 
  onAppNotification, 
  requestPhoneNotificationPermission, 
  getNotificationPermissionState 
} from '../lib/notificationService';

export function TopNotificationBanner() {
  const [currentNotif, setCurrentNotif] = useState<AppNotification | null>(null);
  const [permissionState, setPermissionState] = useState(getNotificationPermissionState());
  const [showPermPrompt, setShowPermPrompt] = useState(false);

  useEffect(() => {
    // Check permission state
    const state = getNotificationPermissionState();
    setPermissionState(state);
    if (state === 'default') {
      setShowPermPrompt(true);
    }

    // Subscribe to notification service
    const unsubscribe = onAppNotification((notif) => {
      setCurrentNotif(notif);

      // Auto dismiss after 6 seconds
      const timer = setTimeout(() => {
        setCurrentNotif(prev => prev?.id === notif.id ? null : prev);
      }, 6500);

      return () => clearTimeout(timer);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleEnablePermission = async () => {
    const granted = await requestPhoneNotificationPermission();
    setPermissionState(granted ? 'granted' : 'denied');
    setShowPermPrompt(false);
  };

  const getIcon = (type?: AppNotification['type']) => {
    switch (type) {
      case 'stock':
        return <Package className="text-emerald-400" size={22} />;
      case 'approval':
        return <CheckCircle2 className="text-blue-400" size={22} />;
      case 'sale':
        return <DollarSign className="text-amber-400" size={22} />;
      case 'system':
        return <ShieldCheck className="text-indigo-400" size={22} />;
      default:
        return <Bell className="text-teal-400" size={22} />;
    }
  };

  return (
    <div className="fixed top-2 left-3 right-3 z-[99999] pointer-events-none flex flex-col items-center gap-2 max-w-md mx-auto">
      {/* 1. Permission Request Prompt (Discreet Pill) */}
      <AnimatePresence>
        {showPermPrompt && permissionState === 'default' && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="pointer-events-auto bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-indigo-500/40 w-full flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400 shrink-0">
                <Bell size={18} className="animate-pulse" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-xs text-white leading-tight">ෆෝන් නොටිෆිකේෂන් සක්‍රීය කරන්න</p>
                <p className="text-[11px] text-slate-300 truncate">ඇඩ්මින් ඩේටා වෙනස් කළ වහාම නොටිෆිකේෂන් ලබාගන්න</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleEnablePermission}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all active:scale-95 flex items-center gap-1"
              >
                <Sparkles size={12} /> සක්‍රීය කරන්න
              </button>
              <button
                onClick={() => setShowPermPrompt(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Top App Push Notification Banner (Heads-up banner) */}
      <AnimatePresence>
        {currentNotif && (
          <motion.div
            initial={{ y: -80, scale: 0.9, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -80, scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="pointer-events-auto w-full bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700/60 flex items-start justify-between gap-3 relative overflow-hidden"
          >
            {/* Ambient accent background glow */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-500" />

            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="p-2.5 bg-slate-800 rounded-2xl border border-slate-700 shrink-0 mt-0.5 shadow-inner">
                {getIcon(currentNotif.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-xs text-white truncate leading-tight">{currentNotif.title}</h4>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">දැන් (Just now)</span>
                </div>
                <p className="text-xs text-slate-200 mt-1 leading-snug break-words font-medium">{currentNotif.body}</p>
              </div>
            </div>

            <button
              onClick={() => setCurrentNotif(null)}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

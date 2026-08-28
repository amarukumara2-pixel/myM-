import { getActiveOrgId } from './store';

export interface NetworkSignalLog {
  id: string;
  repId: string;
  repName: string;
  organizationId: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS AM/PM
  isOnline: boolean;
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'offline' | string;
  downlinkMbps?: number;
  rttMs?: number;
  signalQuality: 'Strong 4G' | 'Moderate 3G/4G' | 'Weak Connection' | 'No Signal (Offline)';
  signalPercentage: number;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  batteryLevel?: number;
  isCharging?: boolean;
  notes?: string;
}

// Store key
const getStorageKey = () => {
  const orgId = getActiveOrgId();
  return `bizflow_${orgId}_network_logs_v1`;
};

// Save to local storage with robust quota management and trimming
const saveNetworkLogsSafely = (logs: NetworkSignalLog[]) => {
  if (typeof window === 'undefined') return;
  const key = getStorageKey();

  // Try to remove redundant legacy duplicate key to immediately reclaim storage space
  try {
    localStorage.removeItem('bizflow_network_logs_v1');
    localStorage.removeItem('bizflow_network_logs');
  } catch (e) {}

  // Cap logs to recent 25 items by default to prevent storage bloating
  const trimmed = (logs || []).slice(0, 25);

  try {
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (quotaErr) {
    // If quota exceeded, trim more aggressively to 10 logs
    try {
      const ultraTrimmed = trimmed.slice(0, 10);
      localStorage.setItem(key, JSON.stringify(ultraTrimmed));
    } catch (secondErr) {
      // If still exceeding, keep only 3 most recent entries
      try {
        const minimal = trimmed.slice(0, 3);
        localStorage.setItem(key, JSON.stringify(minimal));
      } catch (finalErr) {
        // Suppress gracefully without crashing or throwing
      }
    }
  }
};

export const getNetworkSignalLogs = (repId?: string, date?: string): NetworkSignalLog[] => {
  if (typeof window === 'undefined') return [];
  try {
    const key = getStorageKey();
    const raw = localStorage.getItem(key) || localStorage.getItem('bizflow_network_logs_v1');
    if (!raw) return [];
    let list: NetworkSignalLog[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    if (repId) {
      list = list.filter(l => l.repId === repId);
    }
    if (date) {
      list = list.filter(l => l.date === date);
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    return [];
  }
};

export const recordNetworkSignalLog = async (
  repId: string,
  repName: string,
  customNotes?: string
): Promise<NetworkSignalLog> => {
  const orgId = getActiveOrgId();
  const now = new Date();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : false;

  // Read Network Information API if available
  const navAny = typeof navigator !== 'undefined' ? (navigator as any) : {};
  const conn = navAny.connection || navAny.mozConnection || navAny.webkitConnection || {};

  let effectiveType: string = isOnline ? (conn.effectiveType || '4g') : 'offline';
  let downlinkMbps: number | undefined = conn.downlink ? Number(conn.downlink) : undefined;
  let rttMs: number | undefined = conn.rtt ? Number(conn.rtt) : undefined;

  // Calculate quality & percentage
  let signalQuality: NetworkSignalLog['signalQuality'] = 'No Signal (Offline)';
  let signalPercentage = 0;

  if (!isOnline) {
    signalQuality = 'No Signal (Offline)';
    signalPercentage = 0;
    effectiveType = 'offline';
  } else if (effectiveType === '4g') {
    if (rttMs && rttMs > 300) {
      signalQuality = 'Moderate 3G/4G';
      signalPercentage = 65;
    } else {
      signalQuality = 'Strong 4G';
      signalPercentage = 95;
    }
  } else if (effectiveType === '3g') {
    signalQuality = 'Moderate 3G/4G';
    signalPercentage = 55;
  } else if (effectiveType === '2g' || effectiveType === 'slow-2g') {
    signalQuality = 'Weak Connection';
    signalPercentage = 25;
  } else {
    signalQuality = 'Moderate 3G/4G';
    signalPercentage = 60;
  }

  // Attempt battery API if supported
  let batteryLevel: number | undefined;
  let isCharging: boolean | undefined;
  if (navAny.getBattery) {
    try {
      const b = await navAny.getBattery();
      batteryLevel = Math.round(b.level * 100);
      isCharging = b.charging;
    } catch (e) {}
  }

  // Position fallback
  let location: NetworkSignalLog['location'] | undefined;
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          () => resolve(null),
          { timeout: 3000, enableHighAccuracy: false }
        );
      });
      if (pos && pos.coords) {
        location = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy || 0)
        };
      }
    } catch (e) {}
  }

  const log: NetworkSignalLog = {
    id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    repId,
    repName: repName || 'Rep',
    organizationId: orgId,
    timestamp: now.getTime(),
    date: now.toISOString().slice(0, 10),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    isOnline,
    effectiveType,
    downlinkMbps,
    rttMs,
    signalQuality,
    signalPercentage,
    location,
    batteryLevel,
    isCharging,
    notes: customNotes || (isOnline ? `4G Check: ${effectiveType.toUpperCase()} (${downlinkMbps ? downlinkMbps + ' Mbps' : 'Active'})` : 'Device disconnected from mobile data/internet')
  };

  // Debounce/throttle duplicate frequent logs within 15 minutes
  try {
    const existing = getNetworkSignalLogs(repId);
    const lastLog = existing[0];
    const nowMs = now.getTime();
    if (lastLog && (nowMs - lastLog.timestamp < 15 * 60 * 1000) && !customNotes?.includes('Opened') && !customNotes?.includes('Restored') && !customNotes?.includes('Lost')) {
      return lastLog;
    }
  } catch (e) {}

  // Save to local storage safely with automatic trimming
  try {
    const existing = getNetworkSignalLogs();
    const updated = [log, ...existing];
    saveNetworkLogsSafely(updated);
  } catch (err) {
    // Suppress quota failures
  }

  return log;
};

// Auto logger setup for Reps
let loggerInterval: any = null;
let lastRepIdLogged = '';

export const startNetworkLogger = (repId: string, repName: string) => {
  if (typeof window === 'undefined' || !repId) return;

  // Avoid duplicate listeners for same rep
  if (lastRepIdLogged === repId && loggerInterval) return;
  lastRepIdLogged = repId;

  // Log on initial launch
  recordNetworkSignalLog(repId, repName, 'App Opened / Shift Started');

  // Listen to online & offline events
  const handleOnline = () => {
    recordNetworkSignalLog(repId, repName, '📶 Connection Restored (Online)');
  };
  const handleOffline = () => {
    recordNetworkSignalLog(repId, repName, '⚠️ Connection Lost / Offline (No Signal)');
  };

  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Network connection change
  const navAny = navigator as any;
  if (navAny.connection) {
    try {
      navAny.connection.removeEventListener('change', handleOnline);
      navAny.connection.addEventListener('change', handleOnline);
    } catch (e) {}
  }

  // Periodic check every 5 minutes
  if (loggerInterval) clearInterval(loggerInterval);
  loggerInterval = setInterval(() => {
    recordNetworkSignalLog(repId, repName, 'Periodic 4G Background Signal Check');
  }, 5 * 60 * 1000);
};

// Phone & App Top Notification Service

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  type?: 'stock' | 'approval' | 'system' | 'sale' | 'general';
  actionUrl?: string;
}

type NotificationCallback = (notification: AppNotification) => void;
const listeners: Set<NotificationCallback> = new Set();

export function onAppNotification(cb: NotificationCallback) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Synthetic pleasant chime sound using Web Audio API (works 100% offline & reliable)
export function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Play double chime
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now + 0.15); // D6
    gain2.gain.setValueAtTime(0.4, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  } catch (e) {
    console.warn("Audio chime notice:", e);
  }
}

// Request Phone Native Notification Permission
export async function requestPhoneNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop/phone notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const res = await Notification.requestPermission();
    return res === 'granted';
  }

  return false;
}

export function getNotificationPermissionState(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// Send Top Phone + App Push Notification
export function sendTopPhoneNotification(title: string, body: string, type: AppNotification['type'] = 'general') {
  const notif: AppNotification = {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
    title,
    body,
    timestamp: Date.now(),
    type
  };

  // 1. Play Sound
  playNotificationSound();

  // 2. Vibrate Phone
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch (e) {}
  }

  // 3. Trigger Native Mobile OS Notification if granted
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const nativeNotif = new Notification(title, {
        body,
        icon: '/icon.png',
        badge: '/icon.png',
        tag: notif.id,
        requireInteraction: false
      });
      nativeNotif.onclick = () => {
        window.focus();
      };
    } catch (e) {
      // Fallback for Android PWA / Service Worker context if raw Notification throws
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, {
            body,
            icon: '/icon.png',
            badge: '/icon.png',
            tag: notif.id
          }).catch(() => {});
        }).catch(() => {});
      }
    }
  }

  // 4. Notify all internal listeners for in-app floating banner
  listeners.forEach(cb => cb(notif));

  // 5. Store in notification history log
  try {
    const stored = localStorage.getItem('bizflow_notifications_history_v1') || '[]';
    const history = JSON.parse(stored);
    const updated = [notif, ...history].slice(0, 50); // Keep last 50
    localStorage.setItem('bizflow_notifications_history_v1', JSON.stringify(updated));
  } catch (e) {}
}

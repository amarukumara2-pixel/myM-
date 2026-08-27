/**
 * GPS Shop Location & Route Tracking Engine
 * Captures high-accuracy GPS coordinates on bill creation,
 * computes route distance & pinpoints, and creates direct Google Maps navigation links.
 */

export interface GPSLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  recordedAt: number;
  addressName?: string;
}

let lastKnownPosition: GPSLocation | null = null;

export const captureCurrentGPSLocation = (timeoutMs: number = 8000): Promise<GPSLocation | null> => {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(lastKnownPosition);
      return;
    }

    const timer = setTimeout(() => {
      resolve(lastKnownPosition);
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        const loc: GPSLocation = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
          recordedAt: Date.now()
        };
        lastKnownPosition = loc;
        try {
          localStorage.setItem('bizflow_last_gps_location', JSON.stringify(loc));
        } catch (e) {}
        resolve(loc);
      },
      (err) => {
        clearTimeout(timer);
        console.warn('GPS location capture notice:', err.message);
        // Return cached position if fresh (< 2 hours)
        try {
          const cached = localStorage.getItem('bizflow_last_gps_location');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - (parsed.recordedAt || 0) < 7200000) {
              resolve(parsed);
              return;
            }
          }
        } catch (e) {}
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 60000 // 1 minute cached pos
      }
    );
  });
};

/**
 * Format location string for easy storage and display ("lat, lng")
 */
export const formatLocationString = (loc: GPSLocation | null): string => {
  if (!loc) return '';
  return `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
};

/**
 * Parse lat/lng from location string
 */
export const parseLocationCoords = (str?: string): { lat: number; lng: number } | null => {
  if (!str) return null;
  const parts = str.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
};

/**
 * Calculate distance between two coordinates in Kilometers (Haversine formula)
 */
export const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
};

/**
 * Generate Google Maps navigation URL
 */
export const getGoogleMapsNavUrl = (lat: number, lng: number): string => {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
};

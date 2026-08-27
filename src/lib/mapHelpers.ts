export const parseLocation = (locStr: string): { lat: number; lng: number } | null => {
  if (!locStr) return null;
  const parts = locStr.split(',');
  if (parts.length === 2) {
    const lat = parseFloat(parts[0].trim());
    const lng = parseFloat(parts[1].trim());
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }
  return null;
};

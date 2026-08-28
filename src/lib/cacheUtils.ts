
export const clearAppCache = async () => {
  // Clear all caches
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
  
  // Clear local storage
  localStorage.clear();
  
  // Reload the page
  window.location.reload();
};

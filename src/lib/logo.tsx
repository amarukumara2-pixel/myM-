import React from 'react';
import { getOrganizationSettings } from './store';

export function getLogo() {
  const saved = localStorage.getItem('app_logo');
  if (saved) return saved;
  try {
    const orgSettings = getOrganizationSettings();
    if (orgSettings && orgSettings.logoUrl) return orgSettings.logoUrl;
  } catch (e) {}
  return '/logo.svg';
}

export function useLogo() {
  const [logo, setLogo] = React.useState(getLogo());
  React.useEffect(() => {
    const handleStorage = () => setLogo(getLogo());
    window.addEventListener('storage', handleStorage);
    window.addEventListener('logoUpdated', handleStorage);
    return () => {
       window.removeEventListener('storage', handleStorage);
       window.removeEventListener('logoUpdated', handleStorage);
    }
  }, []);
  return logo;
}

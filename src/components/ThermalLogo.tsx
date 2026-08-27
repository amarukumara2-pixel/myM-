import React, { useState, useEffect } from 'react';
import { getLogo } from '../lib/logo';

export default function ThermalPrinterLogo() {
  const [logo, setLogo] = useState<string>(getLogo());

  useEffect(() => {
    const loadLogo = () => {
      setLogo(getLogo());
    };

    loadLogo();
    
    window.addEventListener('logoUpdated', loadLogo);
    return () => window.removeEventListener('logoUpdated', loadLogo);
  }, []);

  const currentLogo = logo || "/logo.svg";

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
      <img 
        src={currentLogo} 
        alt="MYM Logo" 
        style={{ width: '80px', height: '80px', objectFit: 'contain', filter: 'grayscale(100%) contrast(150%) brightness(1.2)' }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );
}

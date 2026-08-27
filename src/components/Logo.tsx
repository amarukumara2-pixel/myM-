import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Upload } from 'lucide-react';

export default function AnimatedLogo({ className = "w-32 h-32" }: { className?: string }) {
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('app_logo');
    if (saved) setLogo(saved);
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        
        // Resize using Canvas to avoid LocalStorage Quota Exceeded error from high-res phone pics
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max width 500px to keep quality but reduce file size significantly
          if (width > 500) {
            height = Math.round((height * 500) / width);
            width = 500;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          // Fill white background in case of transparency issues
          if (ctx) {
             ctx.fillStyle = '#FFFFFF';
             ctx.fillRect(0, 0, width, height);
             ctx.drawImage(img, 0, 0, width, height);
          }
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85); // use jpeg for smaller base64
          try {
            localStorage.setItem('app_logo', compressedDataUrl);
            setLogo(compressedDataUrl);
            
            // Dispatch a custom event so other components (like ThermalLogo) can update instantly
            window.dispatchEvent(new Event('logoUpdated'));
            alert("Logo එක සාර්ථකව ඇතුලත් කරන ලදී! (Logo uploaded successfully!)");
          } catch (e) {
            console.error("Storage error:", e);
            alert("Image is still too large to save. Please try a smaller image.");
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const currentLogo = logo || "/logo.svg";

  return (
    <div className={`relative flex items-center justify-center overflow-visible group ${className} ${!logo ? 'bg-white/5 backdrop-blur-sm rounded-[2rem] p-4' : ''}`}>
      {/* Zoom and spin in animation for the logo */}
      <motion.img 
        src={currentLogo} 
        alt="MYM Bizflow Logo" 
        className="w-full h-full object-contain drop-shadow-2xl z-20 rounded-[2rem]"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
        key={currentLogo}
      />

      {/* Upload/Change overlay on hover/tap */}
      <div className="absolute inset-0 z-30 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center bg-black/60 rounded-[2rem] transition-opacity cursor-pointer">
        <input 
          type="file" 
          accept="image/*" 
          onChange={handleUpload} 
          className="absolute inset-0 opacity-0 cursor-pointer z-40" 
          title="Tap to change Logo"
        />
        <Upload className="w-8 h-8 text-white mb-2" />
        <span className="text-white text-[10px] font-bold text-center px-4">
          {logo ? 'CHANGE LOGO' : 'UPLOAD CUSTOM LOGO'}
        </span>
        {logo && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if(confirm("Default logo එකට මාරු කරන්නද? (Switch to default?)")) {
                localStorage.removeItem('app_logo');
                setLogo(null);
                window.dispatchEvent(new Event('logoUpdated'));
              }
            }}
            className="mt-4 p-2 bg-rose-500/80 text-white rounded-lg text-[10px] font-bold z-50 hover:bg-rose-600 transition-colors"
          >
            RESTORE DEFAULT
          </button>
        )}
      </div>
    </div>
  );
}

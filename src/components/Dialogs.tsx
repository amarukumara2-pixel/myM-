import React, { useState, useEffect } from 'react';

let uid = 0;
type DialogTask = {
  id: number;
  type: 'confirm' | 'prompt';
  message: string;
  defaultValue?: string;
  resolve: (val: any) => void;
};

let addDialog: (d: DialogTask) => void = () => {};

export const appConfirm = (message: string): Promise<boolean> => {
  return new Promise(resolve => {
    addDialog({ id: uid++, type: 'confirm', message, resolve });
  });
};

export const appPrompt = (message: string, defaultValue?: string): Promise<string | null> => {
  return new Promise(resolve => {
    addDialog({ id: uid++, type: 'prompt', message, defaultValue, resolve });
  });
};

export function DialogContainer() {
  const [dialogs, setDialogs] = useState<DialogTask[]>([]);

  useEffect(() => {
    addDialog = (d) => setDialogs(prev => [...prev, d]);
  }, []);

  if (dialogs.length === 0) return null;

  const current = dialogs[0];

  const handleClose = (val: any) => {
    current.resolve(val);
    setDialogs(prev => prev.slice(1));
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full animate-in fade-in zoom-in duration-200">
        <h3 className="font-bold text-lg text-slate-800 mb-4">{current.message}</h3>
        
        {current.type === 'prompt' && (
          <input 
            type="text"
            id="prompt-input"
            defaultValue={current.defaultValue}
            className="w-full border-slate-200 border rounded-xl p-3 mb-6 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleClose((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') handleClose(null);
            }}
          />
        )}
        
        <div className="flex gap-3 justify-end mt-4">
          <button 
            onClick={() => handleClose(current.type === 'confirm' ? false : null)}
            className="px-4 py-2 font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              if (current.type === 'confirm') {
                handleClose(true);
              } else {
                handleClose((document.getElementById('prompt-input') as HTMLInputElement).value);
              }
            }}
            className="px-4 py-2 font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

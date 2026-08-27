const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

// Add states
code = code.replace(/const \[printerSize, setPrinterSize\] = useState<'58' \| '80'>\(settings\.printerSize \|\| '58'\);/, "const [printerSize, setPrinterSize] = useState<'58' | '80'>(settings.printerSize || '58');\n  const [showClearConfirm, setShowClearConfirm] = useState(false);\n  const [clearInput, setClearInput] = useState('');");

// Replace handleClearAllData
code = code.replace(/const handleClearAllData = \(\) => \{[\s\S]*?window\.location\.href = '\/';\s*\}\s*\}\s*\};/g, `const handleClearAllData = () => {
    if (clearInput !== 'DELETE') {
      alert(lang === 'si' ? 'කරුණාකර DELETE ලෙස ටයිප් කරන්න' : 'Please type DELETE exactly');
      return;
    }
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('bizflow_')) {
        localStorage.removeItem(key);
      }
    }
    alert(lang === 'si' ? 'සියලුම දත්ත මකා දමන ලදී. පද්ධතිය නැවත ආරම්භ වේ.' : 'All data deleted. System restarting.');
    window.location.href = '/';
  };`);

// Replace the UI part
code = code.replace(/<button\s*onClick=\{handleClearAllData\}\s*className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-rose-500\/15 transition-all"\s*>\s*\{lang === 'si' \? 'සියලුම දත්ත මකා දමන්න \(Delete All Data\)' : 'Delete All Data'\}\s*<\/button>/g, `{showClearConfirm ? (
          <div className="bg-rose-50 p-4 rounded-xl border border-rose-200">
            <p className="text-rose-700 font-bold mb-2 text-sm">Type "DELETE" to confirm:</p>
            <input type="text" value={clearInput} onChange={e => setClearInput(e.target.value)} className="w-full p-3 border border-rose-300 rounded-xl mb-3 focus:outline-none" placeholder="DELETE" />
            <div className="flex gap-2">
              <button onClick={handleClearAllData} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl">Confirm Delete</button>
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 bg-slate-200 text-slate-700 font-bold py-3 rounded-xl">Cancel</button>
            </div>
          </div>
        ) : (
          <button 
            onClick={(e) => { e.preventDefault(); setShowClearConfirm(true); }}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-rose-500/15 transition-all"
          >
            {lang === 'si' ? 'සියලුම දත්ත මකා දමන්න (Delete All Data)' : 'Delete All Data'}
          </button>
        )}`);

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

code = code.replace(/<label className="text-xs font-semibold text-slate-500 uppercase mb-1\.5">Printer Font Size \(Optimal: 11-14\)<\/label>\s*<input type="number" value=\{fontSize\} onChange=\{e => setFontSize\(Number\(e\.target\.value\)\)\} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none" required \/>/, 
`<label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Printer Font Size (Optimal: 11-14)</label>
            <input type="number" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none" required />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Printer Paper Size</label>
            <select value={printerSize} onChange={e => setPrinterSize(e.target.value as '58'|'80')} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none">
               <option value="58">58mm (Portable / Narrow)</option>
               <option value="80">80mm (Desktop / Wide)</option>
            </select>`);

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

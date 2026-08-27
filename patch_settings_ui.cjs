const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

const regex = /<label className="text-xs font-semibold text-slate-500 uppercase mb-1\.5">Hotline Phone<\/label>\s*<input type="text" value=\{phone\} onChange=\{e => setPhone\(e\.target\.value\)\} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none" \/>\s*<\/div>/;

const replacement = `<label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Hotline Phone</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none" />
          </div>
          
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5">{lang === 'si' ? 'AI Assistant සඳහා Gemini API Key' : 'Gemini API Key for AI Assistant'}</label>
            <input type="password" placeholder="AI Studio එකෙන් ගත් API Key එක මෙහි ඇතුලත් කරන්න" value={customApiKey} onChange={e => setCustomApiKey(e.target.value)} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl focus:outline-none font-mono text-sm" />
            <p className="text-[10px] text-slate-400 mt-1">{lang === 'si' ? 'MYM AI Assistant භාවිතයට සහ දත්ත විශ්ලේෂණයට මෙය අවශ්‍ය වේ. (ඔබේම key එකක් ලබාගන්න aistudio.google.com හරහා)' : 'Required for AI Assistant and smart data queries. (Get your own key at aistudio.google.com)'}</p>
          </div>`;

code = code.replace(regex, replacement);

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

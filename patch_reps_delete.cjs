const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

// Add confirmRepId state
code = code.replace(/const \[isAdding, setIsAdding\] = useState\(false\);/, "const [isAdding, setIsAdding] = useState(false);\n  const [confirmRepId, setConfirmRepId] = useState<string | null>(null);");

// Modify handleDeleteRep
code = code.replace(/const handleDeleteRep = \(id: string\) => \{\s*if \(window\.confirm\('Delete this Sales Rep\? This will remove their credentials and inventory log\.'\)\) \{\s*deleteSystemUser\(id\);\s*const allUsers = getUsers\(\)\.filter\(u => u\.id !== id\);\s*setReps\(allUsers\.filter\(u => u\.role === 'rep'\)\);\s*\}\s*\};/g, `const handleDeleteRep = (id: string) => {
    deleteSystemUser(id);
    const allUsers = getUsers().filter(u => u.id !== id);
    setReps(allUsers.filter(u => u.role === 'rep'));
    setConfirmRepId(null);
  };`);

// Modify the button in the UI
code = code.replace(/<button onClick=\{\(\) => handleDeleteRep\(rep\.id\)\} className="p-1\.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size=\{16\} \/><\/button>/g, `{confirmRepId === rep.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDeleteRep(rep.id)} className="p-1 bg-rose-600 text-white rounded text-xs font-bold px-2">Yes</button>
                        <button onClick={() => setConfirmRepId(null)} className="p-1 bg-slate-200 text-slate-700 rounded text-xs font-bold px-2">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmRepId(rep.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
                    )}`);

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

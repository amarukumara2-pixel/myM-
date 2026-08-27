const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

// Add confirmItemId state
code = code.replace(/const \[isAdding, setIsAdding\] = useState\(false\);/, "const [isAdding, setIsAdding] = useState(false);\n  const [confirmItemId, setConfirmItemId] = useState<any>(null);");

// Modify handleDeleteItem
code = code.replace(/const handleDeleteItem = \(id: any\) => \{\s*if \(window\.confirm\('Are you sure you want to delete this item\?'\)\) \{\s*const updated = items\.filter\(i => i\.id !== id\);\s*setItems\(updated\);\s*saveAdminInventory\(updated\);\s*\}\s*\};/g, `const handleDeleteItem = (id: any) => {
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    saveAdminInventory(updated);
    setConfirmItemId(null);
  };`);

// Modify the button in the UI
code = code.replace(/<button onClick=\{\(\) => handleDeleteItem\(item\.id\)\} className="p-1\.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size=\{15\} \/><\/button>/g, `{confirmItemId === item.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDeleteItem(item.id)} className="p-1 bg-rose-600 text-white rounded text-[10px] font-bold px-1.5">Yes</button>
                        <button onClick={() => setConfirmItemId(null)} className="p-1 bg-slate-200 text-slate-700 rounded text-[10px] font-bold px-1.5">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmItemId(item.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={15} /></button>
                    )}`);

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

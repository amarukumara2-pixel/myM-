const fs = require('fs');

let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

// The logic from RepsTab
const loadGoodsStateLogic = `  // State for Load Goods Modal
  const [loadingRep, setLoadingRep] = useState<SystemUser | null>(null);
  const [loadQuantities, setLoadQuantities] = useState<Record<string, string>>({});
  const [loadSearchQuery, setLoadSearchQuery] = useState('');
  const [loadMethod, setLoadMethod] = useState<'from_main' | 'direct'>('from_main');
  const reps = getUsers().filter(u => u.role === 'rep');
`;

const handleLoadSubmitLogic = `  const handleLoadSubmit = () => {
    if (!loadingRep) return;
    const repInv = getRepInventory(loadingRep.id) || [];
    let newAdminItems = [...items];
    let newRepInv = [...repInv];
    let loadedItems: any[] = [];

    Object.entries(loadQuantities).forEach(([itemId, qtyStr]) => {
      const qty = parseFloat(qtyStr);
      if (qty > 0) {
        // Find in admin items
        const adminItemIndex = newAdminItems.findIndex(i => String(i.id) === String(itemId));
        if (adminItemIndex >= 0) {
          if (loadMethod === 'from_main') {
            // Deduct from admin
            newAdminItems[adminItemIndex].stock = Math.max(0, newAdminItems[adminItemIndex].stock - qty);
          }
          
          loadedItems.push({ id: itemId, name: newAdminItems[adminItemIndex].name, qty });
          
          // Add to rep
          const repItemIndex = newRepInv.findIndex(i => String(i.id) === String(itemId));
          if (repItemIndex >= 0) {
            newRepInv[repItemIndex].myStock = (newRepInv[repItemIndex].myStock || 0) + qty;
            newRepInv[repItemIndex].stockInMain = newAdminItems[adminItemIndex].stock;
          } else {
            newRepInv.push({
              ...newAdminItems[adminItemIndex],
              stockInMain: newAdminItems[adminItemIndex].stock,
              myStock: qty,
              returnStock: 0
            });
          }
        }
      }
    });

    if (loadedItems.length === 0) {
      alert("Please enter quantities to load.");
      return;
    }

    if (loadMethod === 'from_main') {
      setItems(newAdminItems);
      saveAdminInventory(newAdminItems);
    }
    saveRepInventory(loadingRep.id, newRepInv);
    
    let msg = \`Successfully loaded \\\${loadedItems.length} items to \\\${loadingRep.name}.\\n\`;
    alert(msg);
    setLoadingRep(null);
    setLoadQuantities({});
  };
`;

const modalJsxStr = `      {loadingRep && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Package size={20} className="text-blue-600" />
                Load Goods to {loadingRep.name}
              </h3>
              <button onClick={() => setLoadingRep(null)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 border-b border-slate-100 bg-white">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Search Products</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Search by name or code..." 
                      value={loadSearchQuery}
                      onChange={e => setLoadSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Loading Method</label>
                  <select 
                    value={loadMethod}
                    onChange={(e: any) => setLoadMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                  >
                    <option value="from_main">Deduct from Main Warehouse</option>
                    <option value="direct">Direct Load (Don't deduct)</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
              <div className="space-y-2">
                {items.filter(item => (item.name || '').toLowerCase().includes((loadSearchQuery || '').toLowerCase()) || (item.sku && item.sku.toLowerCase().includes((loadSearchQuery || '').toLowerCase()))).map(item => (
                   <div key={item.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-white bg-slate-50/50 transition-colors">
                     <div>
                       <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                       <div className="text-xs text-slate-500 mt-0.5">Warehouse Stock: <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{item.stock}</span></div>
                     </div>
                     <input 
                       type="number" 
                       min="0"
                       placeholder="Qty"
                       value={loadQuantities[item.id] || ''}
                       onChange={(e) => setLoadQuantities({...loadQuantities, [item.id]: e.target.value})}
                       className="w-24 text-center border-2 border-slate-200 rounded-lg p-2 text-sm font-bold focus:border-blue-500 focus:outline-none"
                     />
                   </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-2">
              <button onClick={() => setLoadingRep(null)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors">
                Cancel
              </button>
              <button onClick={handleLoadSubmit} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm flex items-center shadow-md shadow-blue-500/20 transition-all active:scale-95">
                <Package size={16} className="mr-2" /> Submit Load
              </button>
            </div>
          </div>
        </div>
      )}`;

// We need to insert these pieces into InventoryTab
const inventoryStart = code.indexOf('export function InventoryTab');
const handleSaveProductIndex = code.indexOf('const handleSaveProduct', inventoryStart);

if (handleSaveProductIndex > -1) {
    code = code.slice(0, handleSaveProductIndex) + loadGoodsStateLogic + '\n' + handleLoadSubmitLogic + '\n' + code.slice(handleSaveProductIndex);
}

const addProductButtonIndex = code.indexOf('</button>', code.indexOf('<Plus size={18} className="mr-1.5" /> Add New Product'));
if (addProductButtonIndex > -1) {
    const injectStr = `
        <button 
          onClick={() => { 
            const rep = reps.length > 0 ? reps[0] : null; 
            if(rep) setLoadingRep(rep); else alert('No Reps available'); 
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-3 rounded-xl flex items-center shadow-lg shadow-purple-500/15 text-sm transition-all active:scale-95 flex-shrink-0"
        >
          <Truck size={18} className="mr-1.5" /> Load Goods To Rep
        </button>`;
    code = code.slice(0, addProductButtonIndex + 9) + injectStr + code.slice(addProductButtonIndex + 9);
}

const inventoryTabReturnEnd = code.indexOf('</div>', code.indexOf('</table>', inventoryStart)) + 6;
// insert modal at end of InventoryTab return
code = code.slice(0, inventoryTabReturnEnd) + '\n' + modalJsxStr + '\n' + code.slice(inventoryTabReturnEnd);

// Now we need to remove the "Load Goods" logic from RepsTab.
// Because it's hard to safely regex remove the whole thing, we just won't bother removing it from RepsTab as it's safe to keep it, but we can remove the button at least to hide it.
// The button in RepsTab:
const loadButtonRepTab = code.indexOf('<button onClick={() => { setLoadingRep(rep); setLoadQuantities({}); }}');
if (loadButtonRepTab > -1) {
   const endLoadButton = code.indexOf('</button>', loadButtonRepTab) + 9;
   code = code.slice(0, loadButtonRepTab) + code.slice(endLoadButton);
}

fs.writeFileSync('src/pages/AdminTabs.tsx', code);
console.log('Migrated Load Goods successfully.');

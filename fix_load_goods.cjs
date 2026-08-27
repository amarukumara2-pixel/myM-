const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

// 1. Add loadArea state
code = code.replace(
  "const [loadMethod, setLoadMethod] = useState<'from_main' | 'direct'>('from_main');",
  "const [loadMethod, setLoadMethod] = useState<'from_main' | 'direct'>('from_main');\n  const [loadArea, setLoadArea] = useState('Mirigama');"
);

// 2. Replace handleLoadSubmit for InventoryTab
const oldHandleLoadSubmit = `  const handleLoadSubmit = () => {
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
  };`;

const newHandleLoadSubmit = `  const handleLoadSubmit = () => {
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
          
          // Add to rep for the specific area
          const repItemIndex = newRepInv.findIndex(i => String(i.id) === String(itemId) && (i.area === loadArea || (!i.area && !loadArea)));
          if (repItemIndex >= 0) {
            newRepInv[repItemIndex].myStock = (newRepInv[repItemIndex].myStock || 0) + qty;
            newRepInv[repItemIndex].stockInMain = newAdminItems[adminItemIndex].stock;
          } else {
            newRepInv.push({
              ...newAdminItems[adminItemIndex],
              stockInMain: newAdminItems[adminItemIndex].stock,
              myStock: qty,
              returnStock: 0,
              area: loadArea
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
    
    let msg = \`Successfully loaded \\\${loadedItems.length} items to \\\${loadingRep.name} (Area: \\\${loadArea}).\\n\`;
    alert(msg);
    setLoadingRep(null);
    setLoadQuantities({});
  };`;

code = code.replace(oldHandleLoadSubmit, newHandleLoadSubmit);

// 3. Update the modal JSX to add the Area dropdown
const searchProductJSX = `<label className="block text-xs font-bold text-slate-500 mb-1">Search Products</label>`;

// We'll replace the Loading Method container with Loading Method + Area
const oldMethodJSX = `<div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Loading Method</label>
                  <select 
                    value={loadMethod}
                    onChange={(e: any) => setLoadMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                  >
                    <option value="from_main">Deduct from Main Warehouse</option>
                    <option value="direct">Direct Load (Don't deduct)</option>
                  </select>
                </div>`;

const newMethodJSX = `<div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Target Area</label>
                  <select 
                    value={loadArea}
                    onChange={(e: any) => setLoadArea(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                  >
                    <option value="Mirigama">Mirigama / මීරීගම</option>
                    <option value="Galewela">Galewela / ගලේවෙල</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Loading Method</label>
                  <select 
                    value={loadMethod}
                    onChange={(e: any) => setLoadMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                  >
                    <option value="from_main">Deduct from Main</option>
                    <option value="direct">Direct Load</option>
                  </select>
                </div>`;

code = code.replace(oldMethodJSX, newMethodJSX);

fs.writeFileSync('src/pages/AdminTabs.tsx', code);
console.log('Modified AdminTabs successfully.');

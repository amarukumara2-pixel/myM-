const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

// First, remove confirmRepId and confirmItemId from wherever they were incorrectly placed
code = code.replace(/const \[confirmRepId, setConfirmRepId\] = useState<string \| null>\(null\);\n?/, '');
code = code.replace(/const \[confirmItemId, setConfirmItemId\] = useState<any>\(null\);\n?/, '');

// Now place confirmItemId in AdminInventoryTab (which might be the first one, but let's be safe)
code = code.replace(/export function InventoryTab\([^)]*\) \{/, (match) => {
    return match + "\n  const [confirmItemId, setConfirmItemId] = useState<any>(null);";
});

// Now place confirmRepId in RepsTab
code = code.replace(/export function RepsTab\([^)]*\) \{/, (match) => {
    return match + "\n  const [confirmRepId, setConfirmRepId] = useState<string | null>(null);";
});

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

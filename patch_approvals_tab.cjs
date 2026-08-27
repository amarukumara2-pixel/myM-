const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

code = code.replace(/subTabs: \['reps', 'routes', 'attendance'\] \},/g, "subTabs: ['reps', 'routes', 'attendance', 'approvals'] },");

// Allow stock_keepers to see it too?
code = code.replace(/return \['inventory', 'returns', 'reps', 'alerts', 'dashboard', 'settings', 'attendance'\]\.includes\(tabId\);/g, "return ['inventory', 'returns', 'reps', 'alerts', 'dashboard', 'settings', 'attendance', 'approvals'].includes(tabId);");

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);

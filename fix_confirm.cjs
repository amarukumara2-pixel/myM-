const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

code = code.replace(/if \(confirm\(/g, "if (window.confirm(");

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

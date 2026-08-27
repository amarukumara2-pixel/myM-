const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/logging: false,/g, "logging: false, onclone: (doc) => { const el = doc.getElementById('thermal-print-area'); if(el) { el.style.position = 'relative'; el.style.zIndex = '9999'; } },");

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

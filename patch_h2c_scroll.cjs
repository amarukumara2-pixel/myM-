const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/logging: false, onclone: [^}]+\} \},/g, "logging: false, x: 0, y: 0, scrollY: 0, scrollX: 0,");
// Also update the fallback if logging: false wasn't there
code = code.replace(/windowHeight: el\.scrollHeight,/g, "windowHeight: el.scrollHeight, x: 0, y: 0, scrollY: 0, scrollX: 0,");

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

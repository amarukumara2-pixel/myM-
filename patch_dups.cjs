const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/windowHeight: el\.scrollHeight, x: 0, y: 0, scrollY: 0, scrollX: 0,/g, "windowHeight: el.scrollHeight,");

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

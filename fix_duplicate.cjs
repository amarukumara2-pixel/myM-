const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/zIndex: -9999,\s*left: '0'\s*\}/g, "zIndex: -9999 }");

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

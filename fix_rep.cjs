const fs = require('fs');

let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/windowHeight: el.scrollHeight, width: 384,/g, "windowHeight: el.scrollHeight,");

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

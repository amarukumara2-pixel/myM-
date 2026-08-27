const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/el\.style\.left = '0px'; el\.style\.top = '0px';/g, "el.style.left = '0px'; el.style.top = '0px'; el.style.margin = '0px'; el.style.padding = '0px'; el.style.transform = 'none';");

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

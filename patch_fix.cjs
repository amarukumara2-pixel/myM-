const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace('{createPortal(\\n        <div \\n          id="thermal-print-area"', '<div \\n          id="thermal-print-area"');
code = code.replace('{createPortal(\\n        <div \\n          id=\\"thermal-print-area\\"', '<div \\n          id=\\"thermal-print-area\\"');

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

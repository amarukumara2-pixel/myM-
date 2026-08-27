const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/await printCanvasViaBluetooth\(canvas\);/g, "await printCanvasViaBluetooth(canvas, orgSettings?.printerSize);");
fs.writeFileSync('src/pages/RepDashboard.tsx', code);

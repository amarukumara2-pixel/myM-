const fs = require('fs');

// Patch BillPrintLayout.tsx
let billPrint = fs.readFileSync('src/components/BillPrintLayout.tsx', 'utf8');
billPrint = billPrint.replace(/width: '384px'/g, "width: orgSettings.printerSize === '80' ? '576px' : '384px'");
fs.writeFileSync('src/components/BillPrintLayout.tsx', billPrint);

// Patch RepDashboard.tsx
let repDash = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');
repDash = repDash.replace(/maxWidth: '384px'/g, "maxWidth: orgSettings?.printerSize === '80' ? '576px' : '384px'");
repDash = repDash.replace(/width: '384px'/g, "width: orgSettings?.printerSize === '80' ? '576px' : '384px'");
repDash = repDash.replace(/width: 384/g, "width: orgSettings?.printerSize === '80' ? 576 : 384");
// also pass printerSize to generateEscPosImage? Actually we need to change generateEscPosImage signature.
fs.writeFileSync('src/pages/RepDashboard.tsx', repDash);


const fs = require('fs');
let code = fs.readFileSync('src/components/BillPreviewModal.tsx', 'utf8');

code = code.replace(/windowHeight: printRef\.current!\.scrollHeight,/g, "windowHeight: printRef.current!.scrollHeight, x: 0, y: 0, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff',");

fs.writeFileSync('src/components/BillPreviewModal.tsx', code);

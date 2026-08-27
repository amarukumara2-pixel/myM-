const fs = require('fs');

function patchFile(path) {
  if (!fs.existsSync(path)) return;
  let code = fs.readFileSync(path, 'utf8');
  
  // Replace RepDashboard
  code = code.replace(/windowWidth: 400, onclone: [^}]+} },/g, "width: 384, onclone: (doc) => { const el = doc.getElementById('thermal-print-area'); if(el) { el.style.position = 'relative'; el.style.left = '0px'; el.style.top = '0px'; } },");
  
  // In BillPreviewModal, it might not have windowWidth but let's add width: 384
  code = code.replace(/windowHeight: (printRef\.current!\.scrollHeight),/g, "windowHeight: $1, width: 384,");
  code = code.replace(/windowHeight: (el\.scrollHeight),/g, "windowHeight: $1, width: 384,");
  
  fs.writeFileSync(path, code);
}

patchFile('src/pages/RepDashboard.tsx');
patchFile('src/components/BillPreviewModal.tsx');

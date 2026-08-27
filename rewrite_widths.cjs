const fs = require('fs');

function replaceFile(path) {
  if (!fs.existsSync(path)) return;
  let code = fs.readFileSync(path, 'utf8');
  code = code.replace(/'58mm'/g, "'384px'");
  fs.writeFileSync(path, code);
}

replaceFile('src/pages/RepDashboard.tsx');
replaceFile('src/pages/AdminDashboard.tsx');
replaceFile('src/components/BillPreviewModal.tsx');

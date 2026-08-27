const fs = require('fs');
function patchFile(file) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/left: '-9999px'/g, "left: '0'");
  fs.writeFileSync(file, code);
}
patchFile('src/pages/RepDashboard.tsx');
patchFile('src/pages/AdminDashboard.tsx');

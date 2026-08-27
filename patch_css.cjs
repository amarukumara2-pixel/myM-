const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');

code = code.replace(
  '    height: auto !important;\n    overflow: visible !important;',
  '    height: auto !important;\n    overflow: visible !important;\n    page-break-inside: avoid !important;\n    break-inside: avoid !important;'
);

fs.writeFileSync('src/index.css', code);

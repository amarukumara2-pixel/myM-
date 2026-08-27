const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(
  "zIndex: -100,\n            opacity: 0.01,\n            pointerEvents: 'none',\n            overflow: 'visible'",
  "zIndex: -9999,\n            left: '-9999px'"
);

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

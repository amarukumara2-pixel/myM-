const fs = require('fs');
let code = fs.readFileSync('src/components/RepRoutes.tsx', 'utf8');

code = code.replace(/return \(\) => window\.removeEventListener\('bizflow_sync', handleSync\);/, `return () => { window.removeEventListener('bizflow_sync', handleSync); unsubLocs(); };`);

fs.writeFileSync('src/components/RepRoutes.tsx', code);

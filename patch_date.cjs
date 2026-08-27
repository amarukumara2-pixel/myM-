const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/s\.createdAt && s\.createdAt\.startsWith\(todayStr\)/g, "s.createdAt && (typeof s.createdAt === 'string' ? s.createdAt : new Date(s.createdAt).toISOString()).startsWith(todayStr)");

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

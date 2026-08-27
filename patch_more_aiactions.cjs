const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/addToSyncQueue\(\{\s*table: 'ai_action_requests',\s*action: 'update',\s*data: \{ \.\.\.reqObj, status: 'Completed' \}\s*\}\);/g, "");

code = code.replace(/addToSyncQueue\(\{\s*table: 'ai_action_requests',\s*action: 'insert',\s*data: request\s*\}\);/g, "");

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

code = code.replace(/addToSyncQueue\(\{ table: 'ai_action_requests', action: 'insert', data: handoverRequest \}\);/g, `const allReqs = getAIActionRequests();
    saveAIActionRequests([...allReqs, handoverRequest]);`);

code = code.replace(/addToSyncQueue\(\{ table: 'ai_action_requests', action: 'update', data: updatedReq \}\);/g, `const allReqs = getAIActionRequests();
                        saveAIActionRequests(allReqs.map(r => r.id === req.id ? updatedReq : r));`);

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

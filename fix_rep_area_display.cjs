const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

const targetStr = `<div className="text-[10px] font-black text-blue-600 uppercase tracking-wider">{currentRep?.name || 'REP'}</div>`;
const replacementStr = `<div className="text-[10px] font-black text-blue-600 uppercase tracking-wider">{currentRep?.name || 'REP'} {currentRep?.activeArea ? \`- \${currentRep.activeArea}\` : ''}</div>`;

code = code.replace(targetStr, replacementStr);
fs.writeFileSync('src/pages/RepDashboard.tsx', code);
console.log('Modified area display successfully.');

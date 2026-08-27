const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

// Replace specific setInventory calls with handleUpdateInventory
const linesToReplace = [1398, 1442, 1610, 1918, 3467, 3745, 3809];
let lines = code.split('\n');
linesToReplace.forEach(ln => {
    let idx = ln - 1;
    if (lines[idx].includes('setInventory(')) {
        lines[idx] = lines[idx].replace('setInventory(', 'handleUpdateInventory(');
    }
});

fs.writeFileSync('src/pages/RepDashboard.tsx', lines.join('\n'));

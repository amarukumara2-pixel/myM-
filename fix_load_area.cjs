const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

const targetStr = `saveRepInventory(loadingRep.id, newRepInv);`;
const replacementStr = `saveRepInventory(loadingRep.id, newRepInv);
    
    // Auto-update the rep's active area to the area we just loaded goods to
    const allUsers = getUsers();
    const repIndex = allUsers.findIndex(u => u.id === loadingRep.id);
    if (repIndex >= 0) {
      allUsers[repIndex].activeArea = loadArea;
      saveUsers(allUsers);
    }`;

code = code.replace(targetStr, replacementStr);
fs.writeFileSync('src/pages/AdminTabs.tsx', code);
console.log('Modified loadArea update successfully.');

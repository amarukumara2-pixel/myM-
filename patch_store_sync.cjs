const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

const targetStr = `const mergedMap = new Map<string, any>();
      localUsers.forEach(u => { if (u && u.id) mergedMap.set(u.id, u); });
      dbUsers.forEach(u => { if (u && u.id) mergedMap.set(u.id, u); });`;

const replacement = `const mergedMap = new Map<string, any>();
      localUsers.forEach(u => { if (u && u.id) mergedMap.set(u.id, u); });
      
      // Handle explicit deletions from other devices
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          mergedMap.delete(change.doc.id);
        }
      });

      dbUsers.forEach(u => { if (u && u.id) mergedMap.set(u.id, u); });`;

code = code.replace(targetStr, replacement);
fs.writeFileSync('src/lib/store.ts', code);

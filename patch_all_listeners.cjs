const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

function patchListener(collectionName, varName) {
  const targetStr = `local\${varName}.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });
      db\${varName}.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });`;
      
  const replacementStr = `local\${varName}.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });
      
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          mergedMap.delete(String(change.doc.id));
        }
      });
      
      db\${varName}.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });`;
      
  code = code.replace(targetStr, replacementStr);
}

patchListener('suppliers', 'Sups');
patchListener('sales', 'Sales');
patchListener('customers', 'Custs');

fs.writeFileSync('src/lib/store.ts', code);

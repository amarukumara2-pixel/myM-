const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

code = code.replace(/deleteDoc\(doc\(db, 'users', userId\)\)\.catch\(\(\) => \{\}\);/g, "deleteDoc(doc(db, 'users', userId)).catch(() => {});\n    deleteDoc(doc(db, 'system', `org_${orgId}_repinv_${userId}`)).catch(() => {});");

fs.writeFileSync('src/lib/store.ts', code);

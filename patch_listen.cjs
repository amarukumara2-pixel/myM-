const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

code = code.replace(/onSnapshot\(collection\(db, 'users'\)/g, "onSnapshot(query(collection(db, 'users'), where('organizationId', '==', orgId))");
code = code.replace(/onSnapshot\(collection\(db, 'suppliers'\)/g, "onSnapshot(query(collection(db, 'suppliers'), where('organizationId', '==', orgId))");
code = code.replace(/onSnapshot\(collection\(db, 'customers'\)/g, "onSnapshot(query(collection(db, 'customers'), where('organizationId', '==', orgId))");
code = code.replace(/onSnapshot\(collection\(db, 'main_return_stock'\)/g, "onSnapshot(query(collection(db, 'main_return_stock'), where('organizationId', '==', orgId))");
code = code.replace(/onSnapshot\(collection\(db, 'sales'\)/g, "onSnapshot(query(collection(db, 'sales'), where('organizationId', '==', orgId))");

fs.writeFileSync('src/lib/store.ts', code);

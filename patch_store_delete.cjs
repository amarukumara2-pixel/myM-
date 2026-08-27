const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

const newFunc = `
export const deleteSystemUser = (userId: string) => {
  const orgId = getActiveOrgId();
  const currentUsers = getUsers().filter(u => u.id !== userId);
  localStorage.setItem(\`bizflow_\${orgId}_users_v2\`, JSON.stringify(currentUsers));
  
  Promise.all([import('firebase/firestore'), import('./sync')]).then(async ([ {doc, setDoc, deleteDoc}, {db} ]) => {
    const sanitize = (obj: any): any => JSON.parse(JSON.stringify(obj));
    // 1. Update legacy single-doc
    setDoc(doc(db, 'system', \`org_\${orgId}_users\`), { 
      data: sanitize(currentUsers),
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true }).catch(() => {});

    // 2. Delete individual user doc
    deleteDoc(doc(db, 'users', userId)).catch(() => {});
  });
};
`;

code = code.replace(/export const saveUsers = /, newFunc + "\nexport const saveUsers = ");
fs.writeFileSync('src/lib/store.ts', code);

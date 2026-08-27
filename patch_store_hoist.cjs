const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

const newFuncs = `export const getActiveOrgId = (): string => {
  return 'MYM-BIZFLOW';
};

export const setActiveOrgId = (_id: string) => {
  // No longer needed for single organization app
};

`;

code = newFuncs + code;

fs.writeFileSync('src/lib/store.ts', code);

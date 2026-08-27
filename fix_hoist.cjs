const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

code = code.replace(/export const getActiveOrgId = \(\): string => \{/, 'export function getActiveOrgId(): string {');
code = code.replace(/export const setActiveOrgId = \(_id: string\) => \{/, 'export function setActiveOrgId(_id: string) {');

fs.writeFileSync('src/lib/store.ts', code);

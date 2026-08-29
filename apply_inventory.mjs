import { readFileSync, writeFileSync } from 'fs';

const jsonContent = readFileSync('full_inventory_result.json', 'utf8');
let storeContent = readFileSync('src/lib/store.ts', 'utf8');

const regex = /export const REAL_INVENTORY = \[[\s\S]*?\];/;
const replacement = `export const REAL_INVENTORY = ${jsonContent};`;

storeContent = storeContent.replace(regex, replacement);

writeFileSync('src/lib/store.ts', storeContent);
console.log('Successfully updated src/lib/store.ts!');

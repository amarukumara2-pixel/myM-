import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const allFoundMap = new Map();

function searchDir(dir) {
  const files = readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === 'dist' || f === '.git') continue;
    const full = path.join(dir, f);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      searchDir(full);
    } else if (stat.isFile() && (f.endsWith('.mjs') || f.endsWith('.cjs') || f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.txt') || f.endsWith('.diff') || f.endsWith('.json'))) {
      try {
        const content = readFileSync(full, 'utf8');
        // Look for items with "name", "costPrice", etc.
        const matches = content.match(/\{[^{}]*"name"\s*:\s*"[^"]+"[^{}]*\}/g);
        if (matches) {
          for (const m of matches) {
            try {
              const obj = JSON.parse(m);
              if (obj.name && typeof obj.name === 'string') {
                const norm = obj.name.trim().toLowerCase();
                if (!allFoundMap.has(norm)) {
                  allFoundMap.set(norm, obj);
                }
              }
            } catch (e) {
              // try eval if single quotes or unquoted keys
            }
          }
        }
      } catch (e) {}
    }
  }
}

searchDir('.');
console.log(`Total unique JSON objects with 'name' found across all workspace files: ${allFoundMap.size}`);
console.log(Array.from(allFoundMap.keys()));

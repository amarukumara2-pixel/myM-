import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

function searchForReps(dir) {
  const files = readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === 'dist' || f === '.git') continue;
    const full = path.join(dir, f);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      searchForReps(full);
    } else if (stat.isFile()) {
      try {
        const content = readFileSync(full, 'utf8');
        if (content.includes('rep_') || content.includes('role') || content.includes('sales_rep') || content.includes('Rep 1') || content.includes('Chamod') || content.includes('Chaminda') || content.includes('Kasun') || content.includes('Lahiru')) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('rep_') || lines[i].includes('role') || lines[i].includes('Rep ') || lines[i].includes('Chamod')) {
              console.log(`${full}:${i+1}: ${lines[i].slice(0, 120)}`);
            }
          }
        }
      } catch (e) {}
    }
  }
}

searchForReps('.');

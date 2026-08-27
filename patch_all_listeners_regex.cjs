const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

code = code.replace(/local([A-Za-z]+)\.forEach\((.*?)\s*=>\s*\{\s*if\s*\((.*?)\)\s*mergedMap\.set\((.*?)\);\s*\}\);\s*db\1\.forEach\(\2\s*=>\s*\{\s*if\s*\(\3\)\s*mergedMap\.set\((.*?)\);\s*\}\);/g, (match, p1, p2, p3, p4, p5) => {
  return `local${p1}.forEach(${p2} => { if (${p3}) mergedMap.set(${p4}); });
      
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          mergedMap.delete(String(change.doc.id));
        }
      });
      
      db${p1}.forEach(${p2} => { if (${p3}) mergedMap.set(${p5}); });`;
});

fs.writeFileSync('src/lib/store.ts', code);

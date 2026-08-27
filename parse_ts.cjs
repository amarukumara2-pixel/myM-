const ts = require('typescript');
const fs = require('fs');

const fileName = 'src/pages/RepDashboard.tsx';
const fileContent = fs.readFileSync(fileName, 'utf8');

const sourceFile = ts.createSourceFile(
  fileName,
  fileContent,
  ts.ScriptTarget.Latest,
  true
);

const diagnostics = sourceFile.parseDiagnostics;
console.log(`Found ${diagnostics.length} parse diagnostics:`);
diagnostics.forEach(diag => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(diag.start);
  console.log(`Error on Line ${line + 1}, Col ${character + 1}: ${diag.messageText}`);
});

const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

const oldLine = "const rawbtUrl = `intent:${imgData}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;";
const newLine = "const b64 = imgData.split(',')[1];\n                const rawbtUrl = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;";

if (code.includes(oldLine)) {
    code = code.replace(oldLine, newLine);
    fs.writeFileSync('src/pages/RepDashboard.tsx', code);
    console.log("Patched rawbt intent to use base64,...");
} else {
    console.log("Not found");
}

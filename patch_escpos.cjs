const fs = require('fs');
let code = fs.readFileSync('src/lib/bluetoothPrinter.ts', 'utf8');

code = code.replace(/commands\.push\(0x1B, 0x64, 0x03\);/g, "commands.push(0x1B, 0x64, 0x05); // Feed 5 lines to clear tear bar");

fs.writeFileSync('src/lib/bluetoothPrinter.ts', code);

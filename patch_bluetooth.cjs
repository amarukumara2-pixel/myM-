const fs = require('fs');
let code = fs.readFileSync('src/lib/bluetoothPrinter.ts', 'utf8');

code = code.replace("} catch (error: any) {\n    console.error(error);\n    const msg", "} catch (error: any) {\n    const msg");
code = code.replace("} catch (error: any) {\n    console.error(error);\n    alert", "} catch (error: any) {\n    alert");

fs.writeFileSync('src/lib/bluetoothPrinter.ts', code);

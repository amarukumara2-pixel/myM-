const fs = require('fs');
let code = fs.readFileSync('src/lib/bluetoothPrinter.ts', 'utf8');

const regex = /\/\/ GS v 0 : Print raster bit image[\s\S]*?commands\.push\(byte\);\n        }\n    }/;

const replaceStr = `const sliceHeight = 250;
    for (let currentY = 0; currentY < targetHeight; currentY += sliceHeight) {
        const currentSliceHeight = Math.min(sliceHeight, targetHeight - currentY);
        
        commands.push(0x1D, 0x76, 0x30, 0x00);
        commands.push(bytesWidth & 0xFF, (bytesWidth >> 8) & 0xFF);
        commands.push(currentSliceHeight & 0xFF, (currentSliceHeight >> 8) & 0xFF);
        
        for (let y = 0; y < currentSliceHeight; y++) {
            const absoluteY = currentY + y;
            for (let xByte = 0; xByte < bytesWidth; xByte++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const x = xByte * 8 + bit;
                    if (x < targetWidth) {
                        const index = (absoluteY * targetWidth + x) * 4;
                        const r = data[index];
                        const g = data[index + 1];
                        const b = data[index + 2];
                        const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
                        if (brightness < 160) {
                            byte |= (1 << (7 - bit));
                        }
                    }
                }
                commands.push(byte);
            }
        }
    }`;

code = code.replace(regex, replaceStr);
fs.writeFileSync('src/lib/bluetoothPrinter.ts', code);

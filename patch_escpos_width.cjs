const fs = require('fs');
let code = fs.readFileSync('src/lib/bluetoothPrinter.ts', 'utf8');

code = code.replace(/export function generateEscPosImage\(canvas: HTMLCanvasElement\): Uint8Array \{/g, "export function generateEscPosImage(canvas: HTMLCanvasElement, printerSize: '58' | '80' = '58'): Uint8Array {");

code = code.replace(/const targetWidth = 384;/g, "const targetWidth = printerSize === '80' ? 576 : 384;");

code = code.replace(/export async function printCanvasViaBluetooth\(canvas: HTMLCanvasElement\): Promise<boolean> \{/g, "export async function printCanvasViaBluetooth(canvas: HTMLCanvasElement, printerSize: '58' | '80' = '58'): Promise<boolean> {");

code = code.replace(/const data = generateEscPosImage\(canvas\);/g, "const data = generateEscPosImage(canvas, printerSize);");

fs.writeFileSync('src/lib/bluetoothPrinter.ts', code);

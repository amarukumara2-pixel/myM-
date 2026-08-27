/**
 * Bluetooth Thermal Printer (POS) Engine for 58mm & 80mm ESC/POS Printers
 * Supports Web Bluetooth API (Direct Bluetooth pairing) + ESC/POS raw commands
 * and Raster Canvas conversion for perfect Sinhala & English thermal printing.
 */

export interface BluetoothPrinterDevice {
  device: any;
  server?: any;
  characteristic?: any;
  name?: string;
  connected: boolean;
}

let activePrinter: BluetoothPrinterDevice | null = null;

// Standard Bluetooth ESC/POS Service UUIDs used by mobile thermal printers
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Android POS
  '0000ff00-0000-1000-8000-00805f9b34fb', // Custom ESC
  '000018f0-0000-1000-8000-00805f9b34fb'
];

export const isBluetoothAvailable = (): boolean => {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
};

export const getConnectedPrinterName = (): string | null => {
  if (activePrinter && activePrinter.connected) {
    return activePrinter.name || 'Bluetooth Printer';
  }
  return localStorage.getItem('bizflow_bt_printer_name') || null;
};

/**
 * Connect to a nearby Bluetooth Thermal Printer
 */
export const connectBluetoothPrinter = async (): Promise<{ success: boolean; name?: string; error?: string }> => {
  if (!isBluetoothAvailable()) {
    return { success: false, error: 'Web Bluetooth is not supported in this browser. Please use Chrome/Edge on Android/PC or standard System Print.' };
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000ae00-0000-1000-8000-00805f9b34fb'
      ]
    });

    const server = await device.gatt.connect();
    
    // Discover printable characteristic
    let printerChar: any = null;
    const services = await server.getPrimaryServices();

    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            printerChar = char;
            break;
          }
        }
      } catch (e) {}
      if (printerChar) break;
    }

    if (!printerChar) {
      throw new Error('No writable printer characteristic found on this Bluetooth device.');
    }

    activePrinter = {
      device,
      server,
      characteristic: printerChar,
      name: device.name || 'POS-Printer',
      connected: true
    };

    localStorage.setItem('bizflow_bt_printer_name', activePrinter.name || 'Bluetooth Printer');

    device.addEventListener('gattserverdisconnected', () => {
      if (activePrinter) activePrinter.connected = false;
    });

    return { success: true, name: activePrinter.name };
  } catch (err: any) {
    console.warn('Bluetooth printer connect failed:', err);
    return { success: false, error: err.message || String(err) };
  }
};

export const disconnectBluetoothPrinter = async () => {
  try {
    if (activePrinter?.device?.gatt?.connected) {
      activePrinter.device.gatt.disconnect();
    }
  } catch (e) {}
  activePrinter = null;
  localStorage.removeItem('bizflow_bt_printer_name');
};

/**
 * Send raw binary chunks to Bluetooth Printer
 */
export const sendRawBytesToPrinter = async (bytes: Uint8Array): Promise<boolean> => {
  if (!activePrinter?.characteristic || !activePrinter.connected) {
    return false;
  }

  const chunkSize = 100; // BLE characteristic packet limit
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    if (activePrinter.characteristic.writeValueWithoutResponse) {
      await activePrinter.characteristic.writeValueWithoutResponse(chunk);
    } else {
      await activePrinter.characteristic.writeValue(chunk);
    }
    await new Promise(r => setTimeout(r, 25)); // slight delay for buffer clearance
  }
  return true;
};

/**
 * Build ESC/POS raw receipt bytes
 */
export const buildEscPosReceipt = (sale: any, orgSettings: any, paperSize: '58' | '80' = '58'): Uint8Array => {
  const is80 = paperSize === '80';
  const widthChars = is80 ? 48 : 32;

  const buffer: number[] = [];
  const addBytes = (...b: number[]) => buffer.push(...b);
  const addText = (txt: string) => {
    for (let i = 0; i < txt.length; i++) {
      buffer.push(txt.charCodeAt(i) & 0xFF);
    }
  };

  const padLine = (left: string, right: string, maxLen: number = widthChars): string => {
    const spaces = Math.max(1, maxLen - left.length - right.length);
    return left + ' '.repeat(spaces) + right + '\n';
  };

  const divider = '-'.repeat(widthChars) + '\n';
  const dblDivider = '='.repeat(widthChars) + '\n';

  // Initialize printer
  addBytes(0x1B, 0x40); // ESC @
  
  // Center Header
  addBytes(0x1B, 0x61, 0x01); // Center
  addBytes(0x1B, 0x45, 0x01); // Bold ON
  addBytes(0x1D, 0x21, 0x11); // Double width & height
  addText((orgSettings.name || 'MYM BIZFLOW').toUpperCase() + '\n');
  
  addBytes(0x1D, 0x21, 0x00); // Normal size
  addBytes(0x1B, 0x45, 0x00); // Bold OFF
  
  if (orgSettings.address) addText(orgSettings.address + '\n');
  if (orgSettings.phone) addText(`Hotline: ${orgSettings.phone}\n`);
  
  addBytes(0x1B, 0x61, 0x00); // Align Left
  addText(dblDivider);

  // Metadata
  const dateStr = new Date(sale.createdAt || Date.now()).toLocaleDateString();
  const timeStr = new Date(sale.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const invNo = String(sale.id || '').replace('INV-', '').replace('CR-', '').substring(0, 8);
  
  addText(padLine(`Date: ${dateStr} ${timeStr}`, `Inv: #${invNo}`));
  addText(`Customer: ${String(sale.customer || 'CASH CUSTOMER').toUpperCase()}\n`);
  if (sale.address) addText(`Address: ${sale.address}\n`);
  
  const pTypeStr = sale.paymentType === 'Credit' ? 'CREDIT' : 
                   sale.paymentType === 'Cash + Cheque' ? 'CASH + CHEQUE' : 
                   sale.paymentType === 'Cheque' ? 'CHEQUE' : 'CASH';
  addText(padLine(`Type: ${pTypeStr}`, `Rep: ${sale.repId || 'Staff'}`));
  addText(divider);

  // Items List
  if (sale.mode === 'sale' && Array.isArray(sale.items) && sale.items.length > 0) {
    addBytes(0x1B, 0x45, 0x01); // Bold
    if (is80) {
      addText(padLine('ITEM / QTY x PRICE', 'AMOUNT', 48));
    } else {
      addText(padLine('ITEM / QTY x PRICE', 'AMOUNT', 32));
    }
    addBytes(0x1B, 0x45, 0x00); // Normal
    addText(divider);

    const normalItems = sale.items.filter((i: any) => !i.isReturn);
    const returnItems = sale.items.filter((i: any) => i.isReturn);

    normalItems.forEach((it: any) => {
      const name = it.name || 'Item';
      const qty = it.qty || 0;
      const price = Number(it.price || 0).toFixed(2);
      const total = it.isSample ? '0.00' : (qty * Number(it.price || 0)).toFixed(2);
      
      addText(`${name}\n`);
      addText(padLine(`  ${qty} x ${price}`, total));
      if (it.freeQty > 0) {
        addText(`  * FREE: +${it.freeQty} units\n`);
      }
    });

    if (returnItems.length > 0) {
      addText(divider);
      addBytes(0x1B, 0x45, 0x01);
      addText('[RETURNS / DEDUCTIONS]\n');
      addBytes(0x1B, 0x45, 0x00);
      returnItems.forEach((r: any) => {
        const retTot = (Number(r.qty || 0) * Number(r.price || 0)).toFixed(2);
        addText(`[R] ${r.name}\n`);
        addText(padLine(`  ${r.qty} x ${Number(r.price || 0).toFixed(2)}`, `-${retTot}`));
      });
    }

    addText(divider);
    
    // Net Total
    addBytes(0x1B, 0x45, 0x01);
    addBytes(0x1D, 0x21, 0x01); // Double height
    addText(padLine('NET TOTAL:', `Rs. ${Number(sale.total || 0).toFixed(2)}`));
    addBytes(0x1D, 0x21, 0x00);
    addBytes(0x1B, 0x45, 0x00);
  }

  // Credit & Balance Statement
  if (sale.previousBalance !== undefined || sale.mode === 'credit' || sale.paymentType === 'Credit') {
    addText(divider);
    addBytes(0x1B, 0x45, 0x01);
    addText('--- DEBT STATEMENT / NAYA ---\n');
    addBytes(0x1B, 0x45, 0x00);

    const prevBal = Number(sale.previousBalance || 0) + Number(sale.initialCredit || 0);
    addText(padLine('Previous Debt:', `Rs. ${prevBal.toFixed(2)}`));

    if (sale.mode === 'credit') {
      addText(padLine('Paid Today:', `-Rs. ${Number(sale.creditReceivedAmount || 0).toFixed(2)}`));
    } else {
      addText(padLine('Today Bill:', `+Rs. ${Number(sale.total || 0).toFixed(2)}`));
      const paidNow = Math.max(0, (prevBal + Number(sale.total || 0)) - Number(sale.newBalance || 0));
      addText(padLine('Paid Today:', `-Rs. ${paidNow.toFixed(2)}`));
    }

    addText(dblDivider);
    addBytes(0x1B, 0x45, 0x01);
    addBytes(0x1D, 0x21, 0x11); // Double width & height
    addBytes(0x1B, 0x61, 0x01); // Center
    addText(`FINAL: Rs ${Number(sale.newBalance || 0).toFixed(2)}\n`);
    addBytes(0x1D, 0x21, 0x00);
    addBytes(0x1B, 0x45, 0x00);
    addBytes(0x1B, 0x61, 0x00); // Left
  }

  // Footer
  addText(divider);
  addBytes(0x1B, 0x61, 0x01); // Center
  addText('THANK YOU! COME AGAIN\n');
  addText('Powered by MYM BizFlow Cloud\n\n\n\n');
  
  // Cut paper (GS V 66 0)
  addBytes(0x1D, 0x56, 0x42, 0x00);

  return new Uint8Array(buffer);
};

/**
 * Print directly using Bluetooth or trigger Native System Print
 */
export const printReceiptThermal = async (
  sale: any, 
  orgSettings: any, 
  copies: number = 1, 
  preferredMethod: 'bluetooth' | 'system' = 'bluetooth'
): Promise<{ success: boolean; method: string; message: string }> => {
  const paperSize = orgSettings?.printerSize === '80' ? '80' : '58';

  // 1. Try direct Web Bluetooth if connected or available
  if (preferredMethod === 'bluetooth' && isBluetoothAvailable()) {
    if (!activePrinter?.connected) {
      const conn = await connectBluetoothPrinter();
      if (!conn.success) {
        // Fallback to window print
        triggerSystemPrint();
        return { success: true, method: 'system', message: 'Bluetooth not connected. Opened standard print dialog.' };
      }
    }

    if (activePrinter?.connected) {
      try {
        for (let i = 0; i < copies; i++) {
          const rawBytes = buildEscPosReceipt(sale, orgSettings, paperSize);
          await sendRawBytesToPrinter(rawBytes);
          if (i < copies - 1) await new Promise(r => setTimeout(r, 600));
        }
        return { success: true, method: 'bluetooth', message: `Printed ${copies} copies via Bluetooth (${activePrinter.name})` };
      } catch (err: any) {
        console.warn('Bluetooth print error, falling back to system print:', err);
        triggerSystemPrint();
        return { success: true, method: 'system', message: 'Bluetooth print failed. Opened standard print dialog.' };
      }
    }
  }

  // 2. Default System Print
  triggerSystemPrint();
  return { success: true, method: 'system', message: 'Opened standard print dialog.' };
};

export const triggerSystemPrint = () => {
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      window.print();
    }, 150);
  }
};

/**
 * Convert Canvas to 1-bit Monochrome ESC/POS Raster bit-image commands
 */
export const generateEscPosImage = (canvas: HTMLCanvasElement): Uint8Array => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array();

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const widthBytes = Math.ceil(width / 8);
  const buffer: number[] = [];

  // ESC @ (Initialize)
  buffer.push(0x1B, 0x40);

  // Center align
  buffer.push(0x1B, 0x61, 0x01);

  // GS v 0 m xL xH yL yH d1...dk (Raster bit image)
  // m = 0 (Normal)
  const xL = widthBytes & 0xFF;
  const xH = (widthBytes >> 8) & 0xFF;
  const yL = height & 0xFF;
  const yH = (height >> 8) & 0xFF;

  buffer.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < widthBytes; x++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        const px = x * 8 + b;
        if (px < width) {
          const idx = (y * width + px) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const bVal = data[idx + 2];
          const a = data[idx + 3];
          
          // Luminance threshold
          const luminance = (0.299 * r + 0.587 * g + 0.114 * bVal);
          if (a > 128 && luminance < 160) {
            byte |= (1 << (7 - b)); // Black dot
          }
        }
      }
      buffer.push(byte);
    }
  }

  // Line feeds & Cut
  buffer.push(0x0A, 0x0A, 0x0A, 0x0A);
  buffer.push(0x1D, 0x56, 0x42, 0x00);

  return new Uint8Array(buffer);
};

export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const printCanvasViaBluetooth = async (canvas: HTMLCanvasElement, _paperSize?: string): Promise<boolean> => {
  const bytes = generateEscPosImage(canvas);
  return await sendRawBytesToPrinter(bytes);
};


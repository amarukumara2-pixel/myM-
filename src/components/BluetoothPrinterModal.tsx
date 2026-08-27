import { useState, useEffect } from 'react';
import { Printer, Bluetooth, CheckCircle2, AlertCircle, RefreshCw, Smartphone } from 'lucide-react';
import { 
  connectBluetoothPrinter, 
  disconnectBluetoothPrinter, 
  getConnectedPrinterName, 
  isBluetoothAvailable,
  sendRawBytesToPrinter,
  buildEscPosReceipt,
  triggerSystemPrint 
} from '../lib/bluetoothPrinter';
import { getOrganizationSettings, saveOrganizationSettings } from '../lib/store';

export default function BluetoothPrinterModal({
  isOpen,
  onClose,
  lang = 'en'
}: {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'en' | 'si';
}) {
  const [printerName, setPrinterName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [orgSettings, setOrgSettings] = useState(getOrganizationSettings());

  useEffect(() => {
    if (isOpen) {
      setPrinterName(getConnectedPrinterName());
      setOrgSettings(getOrganizationSettings());
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setConnecting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await connectBluetoothPrinter();
    setConnecting(false);

    if (res.success) {
      setPrinterName(res.name || 'POS Printer');
      setSuccessMsg(lang === 'si' ? 'බ්ලූටූත් ප්‍රින්ටරය සාර්ථකව සම්බන්ධ විය!' : 'Bluetooth Printer connected successfully!');
    } else {
      setErrorMsg(res.error || 'Failed to connect');
    }
  };

  const handleDisconnect = async () => {
    await disconnectBluetoothPrinter();
    setPrinterName(null);
    setSuccessMsg(lang === 'si' ? 'ප්‍රින්ටරය ඉවත් කරන ලදී' : 'Printer disconnected');
  };

  const handleTestPrint = async () => {
    const testSale = {
      id: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
      customer: 'TEST PRINT RECEIPT',
      mode: 'sale',
      paymentType: 'Cash',
      items: [
        { name: 'Sample Item 01', qty: 2, price: 150, freeQty: 0 },
        { name: 'Sample Item 02 (Free)', qty: 1, price: 500, freeQty: 1 }
      ],
      total: 800,
      previousBalance: 0,
      newBalance: 0,
      createdAt: Date.now()
    };

    if (printerName) {
      try {
        const raw = buildEscPosReceipt(testSale, orgSettings, orgSettings.printerSize || '58');
        const ok = await sendRawBytesToPrinter(raw);
        if (ok) {
          setSuccessMsg(lang === 'si' ? 'පරීක්ෂණ බිල්පත මුද්‍රණය විය!' : 'Test bill printed via Bluetooth!');
          return;
        }
      } catch (e) {}
    }

    triggerSystemPrint();
    setSuccessMsg(lang === 'si' ? 'System Print විවෘත විය' : 'Opened System Print dialog');
  };

  const handlePaperSizeChange = (size: '58' | '80') => {
    const updated = { ...orgSettings, printerSize: size };
    setOrgSettings(updated);
    saveOrganizationSettings(updated);
  };

  const btAvailable = isBluetoothAvailable();

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
              <Printer size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">
                {lang === 'si' ? 'බ්ලූටූත් / POS ප්‍රින්ටර් සැකසුම්' : 'Thermal POS Printer Settings'}
              </h4>
              <p className="text-xs text-slate-500">58mm & 80mm ESC/POS Mini Printers</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 font-bold p-1"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Status banner */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            printerName 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className="flex items-center gap-3">
              <Bluetooth size={20} className={printerName ? 'text-emerald-600 animate-pulse' : 'text-slate-400'} />
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">
                  {lang === 'si' ? 'වත්මන් තත්ත්වය' : 'Connection Status'}
                </div>
                <div className="font-bold text-sm">
                  {printerName ? `${printerName} (Connected)` : (lang === 'si' ? 'සම්බන්ධ වී නොමැත' : 'Disconnected')}
                </div>
              </div>
            </div>
            {printerName && (
              <button
                onClick={handleDisconnect}
                className="text-xs text-rose-600 font-semibold hover:underline"
              >
                {lang === 'si' ? 'ඉවත් කරන්න' : 'Disconnect'}
              </button>
            )}
          </div>

          {/* Paper Size selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              {lang === 'si' ? 'කඩදාසි ප්‍රමාණය (Paper Roll Size)' : 'Paper Roll Width'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handlePaperSizeChange('58')}
                className={`py-3 px-4 rounded-xl border text-center font-bold text-sm transition-all ${
                  orgSettings.printerSize !== '80'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-700 ring-2 ring-blue-500/20'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                58 mm (2-inch Mini)
                <span className="block text-[11px] font-normal text-slate-500 mt-0.5">Standard Mobile POS</span>
              </button>
              <button
                type="button"
                onClick={() => handlePaperSizeChange('80')}
                className={`py-3 px-4 rounded-xl border text-center font-bold text-sm transition-all ${
                  orgSettings.printerSize === '80'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-700 ring-2 ring-blue-500/20'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                80 mm (3-inch Large)
                <span className="block text-[11px] font-normal text-slate-500 mt-0.5">Desktop POS Roll</span>
              </button>
            </div>
          </div>

          {/* Connect Action */}
          <div>
            {btAvailable ? (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-sm disabled:opacity-50"
              >
                {connecting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    {lang === 'si' ? 'සොයමින් පවතී...' : 'Scanning for Bluetooth Printers...'}
                  </>
                ) : (
                  <>
                    <Bluetooth size={18} />
                    {lang === 'si' ? 'බ්ලූටූත් ප්‍රින්ටරය යුගලනය කරන්න (Pair)' : 'Scan & Pair Bluetooth Printer'}
                  </>
                )}
              </button>
            ) : (
              <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <span>
                  {lang === 'si' 
                    ? 'මෙම Browser එකේ Web Bluetooth සහය නොදක්වයි. System Print භාවිත කරන්න හෝ Chrome/Edge මත විවෘත කරන්න.' 
                    : 'Web Bluetooth is not supported on this browser. System Print will be used.'}
                </span>
              </div>
            )}
          </div>

          {/* Test print */}
          <button
            type="button"
            onClick={handleTestPrint}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition"
          >
            <Smartphone size={16} />
            {lang === 'si' ? 'පරීක්ෂණ බිල්පතක් මුද්‍රණය කරන්න (Test Print)' : 'Send Test Receipt'}
          </button>

          {/* Messages */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 text-white font-semibold rounded-xl text-sm hover:bg-slate-900 transition"
          >
            {lang === 'si' ? 'වසන්න' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}

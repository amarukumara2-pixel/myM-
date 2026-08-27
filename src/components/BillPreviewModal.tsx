import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Send, Printer, FileText, X, Edit, Save } from 'lucide-react';
import { BillPrintLayout } from './BillPrintLayout';
import { withOklchBypass } from '../lib/canvasUtils';
import { connectBluetoothPrinter } from '../lib/bluetoothPrinter';
import { appPrompt } from '../components/Dialogs';

export function BillPreviewModal({ 
  previewSale, 
  onClose, 
  onConfirmPrint, 
  onConfirmShareImage, 
  onConfirmShareText,
  onEdit,
  orgSettings 
}: { 
  previewSale: any; 
  onClose: () => void; 
  onConfirmPrint: (saleData: any, imageBlob?: Blob, canvas?: HTMLCanvasElement, copies?: number) => Promise<void>; 
  onConfirmShareImage: (saleData: any, imageBlob: Blob) => Promise<void>; 
  onConfirmShareText: (saleData: any) => Promise<void>;
  onEdit?: (saleData: any) => void;
  orgSettings: any;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copies, setCopies] = useState<number>(1);
  const [preGeneratedBlob, setPreGeneratedBlob] = useState<Blob | null>(null);
  const [preGeneratedCanvas, setPreGeneratedCanvas] = useState<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    if (!previewSale) {
      setPreGeneratedBlob(null);
      setPreGeneratedCanvas(null);
      return;
    }

    const timer = setTimeout(async () => {
      if (!printRef.current) return;
      try {
        const canvas = await withOklchBypass(async () => {
          return await html2canvas(printRef.current!, { 
            scale: 3, 
            useCORS: true, 
            logging: false,
            windowHeight: printRef.current!.scrollHeight, width: 384, x: 0, y: 0, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff',
            height: printRef.current!.scrollHeight
          });
        });
        setPreGeneratedCanvas(canvas);
        canvas.toBlob((blob) => {
          if (blob) {
            setPreGeneratedBlob(blob);
          }
        }, 'image/png', 1.0);
      } catch (err) {
        console.error('Error pre-generating invoice image', err);
      }
    }, 450); // Give the modal DOM 450ms to render properly

    return () => clearTimeout(timer);
  }, [previewSale]);

  if (!previewSale) return null;

  const handleShareImage = async () => {
    if (preGeneratedBlob) {
      setIsProcessing(true);
      try {
        await onConfirmShareImage(previewSale, preGeneratedBlob);
      } catch (err) {
        console.error(err);
      } finally {
        setIsProcessing(false);
      }
    } else {
      if (!printRef.current) return;
      setIsProcessing(true);
      try {
        const canvas = await withOklchBypass(async () => {
          return await html2canvas(printRef.current!, { 
            scale: 3, 
            useCORS: true, 
            logging: false,
            windowHeight: printRef.current!.scrollHeight, width: 384, x: 0, y: 0, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff',
            height: printRef.current!.scrollHeight
          });
        });
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await onConfirmShareImage(previewSale, blob);
            } catch (err) {
              console.error(err);
            }
          }
          setIsProcessing(false);
        }, 'image/png', 1.0);
      } catch (err) {
        console.error(err);
        setIsProcessing(false);
      }
    }
  };

  const handleShareText = async () => {
    setIsProcessing(true);
    await onConfirmShareText(previewSale);
    setIsProcessing(false);
  };

  const handlePrint = async () => {
    setIsProcessing(true);
    try {
      let canvasToUse = preGeneratedCanvas;
      let blobToUse = preGeneratedBlob;
      if (!canvasToUse && printRef.current) {
        try {
          canvasToUse = await withOklchBypass(async () => {
            return await html2canvas(printRef.current!, { 
              scale: 3, 
              useCORS: true, 
              logging: false,
              windowHeight: printRef.current!.scrollHeight, width: 384, x: 0, y: 0, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff',
              height: printRef.current!.scrollHeight
            });
          });
        } catch (err) {
          console.error("Canvas generation on print error:", err);
        }
      }
      await onConfirmPrint(previewSale, blobToUse || undefined, canvasToUse || undefined, Math.min(6, Math.max(1, copies)));
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = async () => {
    if (isProcessing) return;
    if (window.confirm('මෙම බිල්පත පද්ධතියට සුරකින්නද? / Save this bill before closing?')) {
      await handleSaveOnly();
    } else {
      onClose();
    }
  };

  const handleSaveOnly = async () => {
    setIsProcessing(true);
    try {
      await onConfirmPrint(previewSale, undefined, undefined, 0); // 0 copies means save/finalize but do not print
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const salesItems = (previewSale.items || []).filter((i: any) => !i.isReturn);
  const returnItems = (previewSale.items || []).filter((i: any) => i.isReturn);

  const subTotalAmount = salesItems.reduce((acc: number, c: any) => acc + (c.isSample ? 0 : Number(c.price) * (Number(c.qty) || 0)), 0);
  const returnAmount = returnItems.reduce((acc: number, c: any) => acc + (Number(c.price) * (Number(c.qty) || 0)), 0);
  const discountRs = ((subTotalAmount - returnAmount) * (Number(previewSale.invoiceDiscount) || 0)) / 100;

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header Options */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50 rounded-t-3xl">
          <h3 className="font-bold text-slate-800 text-lg">Bill Preview</h3>
          <div className="flex gap-2">
            {onEdit && (
                <button onClick={() => onEdit(previewSale)} disabled={isProcessing} className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full transition-colors">
                  <Edit size={20} />
                </button>
            )}
            <button onClick={handleClose} disabled={isProcessing} className="p-2 bg-slate-200 hover:bg-rose-100 hover:text-rose-600 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>
        


        {/* Copies Selector Bar */}
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">මුද්‍රණය වන පිටපත් ගණන</span>
            <span className="text-[12px] font-semibold text-slate-700">Copies to Print</span>
          </div>
          <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
            <button 
              type="button"
              disabled={copies <= 1 || isProcessing}
              onClick={() => setCopies(prev => Math.max(1, prev - 1))}
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg"
            >
              -
            </button>
            <span className="w-12 text-center font-extrabold text-slate-800 text-lg">
              {copies}
            </span>
            <button 
              type="button"
              disabled={copies >= 6 || isProcessing}
              onClick={() => setCopies(prev => Math.min(6, prev + 1))}
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-lg"
            >
              +
            </button>
          </div>
        </div>
        
        {/* Scrollable Preview Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center">
          
          {/* Exactly 58mm width container styled like paper */}
            <div id="thermal-print-modal-area" ref={printRef}>
              <BillPrintLayout previewSale={previewSale} orgSettings={orgSettings} />
            </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-white border-t border-slate-100 flex flex-col gap-2.5">
           {/* Row 1: Core Billing Actions */}
           <div className="flex gap-2">
             <button 
               disabled={isProcessing}
               onClick={handlePrint} 
               className="flex-1 bg-blue-600 text-white rounded-xl py-3 px-2 font-bold flex items-center justify-center hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-md shadow-blue-100 cursor-pointer text-[13px]"
             >
               <Printer size={16} className="mr-1.5" /> 
               <span>ප්‍රින්ට් (Print)</span>
             </button>
             
             <button 
               disabled={isProcessing}
               onClick={handleSaveOnly} 
               className="flex-1 bg-slate-900 text-white rounded-xl py-3 px-2 font-bold flex items-center justify-center hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 shadow-md shadow-slate-100 cursor-pointer text-[13px]"
             >
               <Save size={16} className="mr-1.5" /> 
               <span>සේව් (Save Only)</span>
             </button>
           </div>

           {/* Row 2: Secondary / Sharing Actions */}
           <div className="flex gap-2">
             <button 
               disabled={isProcessing}
               onClick={handleShareImage} 
               className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 font-bold flex items-center justify-center hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50 text-xs cursor-pointer"
             >
               <Send size={15} className="mr-1.5" /> Share Image (ඡායාරූපය)
             </button>
             <button 
               disabled={isProcessing}
               onClick={handleShareText} 
               className="flex-1 bg-blue-50 text-blue-700 rounded-xl py-2.5 font-bold flex items-center justify-center hover:bg-blue-100 active:scale-[0.98] transition-all disabled:opacity-50 text-xs cursor-pointer"
             >
               <FileText size={15} className="mr-1.5" /> Share Text
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}

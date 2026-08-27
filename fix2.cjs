const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

// I will manually recreate lines 2650-2679 that I corrupted
const originalCode = `                         {idx === 0 && sale.status !== 'cancelled' && (
                            <button onClick={() => handleEditLastSale(sale)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Edit Bill (බිල්පත සංස්කරණය කරන්න)">
                               <Edit size={16} />
                            </button>
                         )}
                         {idx === 0 && sale.status !== 'cancelled' && (
                            <button onClick={() => handleCancelSale(sale)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg" title="Cancel/Delete Bill">
                               <Trash2 size={16} />
                            </button>
                         )}
                         {sale.status !== 'cancelled' && (
                            <button onClick={() => handlePrintSale(sale)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Print">
                               <Printer size={16} />
                            </button>
                         )}
                         {sale.status !== 'cancelled' && (
                            <button onClick={() => {
                               // Re-share logic
                               let text = \`📄 *MYM BIZFLOW - INVOICE*\\n\`;
                               text += \`66, Alhena Bokalagama Mirigama\\n\`;
                               text += \`Hotline: 0787314139\\n\`;
                               if (currentRep?.name?.toLowerCase().includes('ruwan')) {
                                 text += \`Sales: 076 1265005\\n\`;
                               }
                               text += \`--------------------------------\\n\`;
                               text += \`*Date:* \${new Date(sale.createdAt).toLocaleDateString()}\\n\`;
                               text += \`*Bill No:* \${sale.id}\\n\`;
                               text += \`*Customer:* \${sale.customer}\\n\`;
                               text += \`--------------------------------\\n\`;
                               if (sale.mode === 'sale') {`;

// The broken code from the file:
const brokenCode = `                         {idx === 0 && sale.status !== 'cancelled' && (
                         {/* Hidden thermal print area (Rep) */}
        {createPortal(
        <div 
          id="thermal-print-area" 
          className="print-only"
          style={printImageSrc ? {
            position: 'fixed',
            left: '0',
            top: '0',
            width: '100%',
            maxWidth: '58mm',
            background: 'white',
            zIndex: 9999
          } : {
            position: 'fixed',
            left: '0',
            top: '0',
            width: '58mm',
            background: 'white',
            zIndex: -100,
            opacity: 0.01,
            pointerEvents: 'none',
            overflow: 'visible'
          }}
        >
          {printImageSrc ? (
            <img src={printImageSrc} style={{ width: '58mm', display: 'block', margin: '0 auto' }} referrerPolicy="no-referrer" />
          ) : (
            printData && Array.from({ length: requestedCopies || 1 }).map((_, idx) => {
              const copyNum = idx + 1;
              return (
                <div key={\`print-copy-\${copyNum}\`} style={{ marginBottom: idx < (requestedCopies - 1) ? '30px' : '0' }}>
                  <BillPrintLayout previewSale={printData} orgSettings={orgSettings} />
                  {idx < (requestedCopies - 1) ? (
                    <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderTop: '2px dashed black', borderBottom: '2px dashed black', padding: '15px 0', margin: '20px 0', width: '58mm' }}>- - - - - CUT - - - - -</div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        , document.body)}) {`;

code = code.replace(brokenCode, originalCode);

const printTarget = `        {/* Hidden thermal print area (Rep) */}
                <div 
          id="thermal-print-area" 
          className="print-only"`;

const printReplacement = `        {/* Hidden thermal print area (Rep) */}
        {createPortal(
        <div 
          id="thermal-print-area" 
          className="print-only"`;

code = code.replace(printTarget, printReplacement);


const printEndTarget = `          )}
        </div>
      </div>`;

const printEndReplacement = `          )}
        </div>
        , document.body)}
      </div>`;

code = code.replace(printEndTarget, printEndReplacement);

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

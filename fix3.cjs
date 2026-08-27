const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

// I'll find `<div className="mt-12 space-y-8">`
const startIdx = code.indexOf('<div className="mt-12 space-y-8">');
if (startIdx !== -1) {
  // Let's replace the whole div block and correctly insert createPortal
  const beforeDiv = code.substring(0, startIdx);
  const afterDivSearch = code.substring(startIdx);
  
  // Find the end of this div which is before `{/* Pending Approvals */}`
  const pendingApprovalsIdx = afterDivSearch.indexOf('{/* Pending Approvals */}');
  
  const divContent = afterDivSearch.substring(0, pendingApprovalsIdx);
  
  // Reconstruct correctly
  const reconstructed = `<div className="mt-12 space-y-8">
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
        , document.body)}
      </div>
        `;
        
  fs.writeFileSync('src/pages/RepDashboard.tsx', beforeDiv + reconstructed + afterDivSearch.substring(pendingApprovalsIdx));
}

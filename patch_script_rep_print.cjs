const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

const importHtml2canvas = "import html2canvas from 'html2canvas';\n";
if (!code.includes(importHtml2canvas)) {
    code = code.replace("import { FireworksBackground } from '../components/Fireworks';", importHtml2canvas + "import { FireworksBackground } from '../components/Fireworks';");
}

const printUseEffectStr = `  useEffect(() => {
    if (printData && triggerPrint > 0) {
      console.log("Triggering print with data:", printData);
      const timer = setTimeout(() => {
        window.print();
        // Reset trigger but keep data for a moment so print area stays populated
        setTimeout(() => setTriggerPrint(0), 1000);
      }, 500); // Reduced timeout for snappier print
      return () => clearTimeout(timer);
    }
  }, [printData, triggerPrint]);`;

const newPrintUseEffectStr = `  useEffect(() => {
    if (printData && triggerPrint > 0) {
      console.log("Triggering print with data:", printData);
      const pMethod = localStorage.getItem('bizflow_print_method') || 'system';
      const timer = setTimeout(async () => {
        if (pMethod === 'rawbt') {
            try {
              const el = document.getElementById('thermal-print-area');
              if (el) {
                const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                const imgData = canvas.toDataURL('image/png');
                const rawbtUrl = \`intent:\${imgData}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;\`;
                window.location.href = rawbtUrl;
              }
            } catch (err) {
              console.error("RawBT Image Print Error", err);
              alert("Error generating print image. Falling back to system print.");
              window.print();
            }
        } else {
            window.print();
        }
        // Reset trigger but keep data for a moment so print area stays populated
        setTimeout(() => setTriggerPrint(0), 1000);
      }, 500); // Reduced timeout for snappier print
      return () => clearTimeout(timer);
    }
  }, [printData, triggerPrint]);`;

code = code.replace(printUseEffectStr, newPrintUseEffectStr);

fs.writeFileSync('src/pages/RepDashboard.tsx', code);
console.log("Patched RepDashboard print useEffect");

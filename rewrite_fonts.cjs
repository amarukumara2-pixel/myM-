const fs = require('fs');

let code = fs.readFileSync('src/components/BillPrintLayout.tsx', 'utf8');

// Replace width
code = code.replace(/width: '58mm'/g, "width: '384px'");

// Replace font sizes by multiplying by 1.75 (roughly)
code = code.replace(/fontSize: `\$\{\(orgSettings\.printerFontSize \|\| 13\) - 2\.5\}px`/g, "fontSize: `${Math.round(((orgSettings.printerFontSize || 13) - 2.5) * 1.75)}px`");
code = code.replace(/fontSize: `\$\{\(orgSettings\.printerFontSize \|\| 13\) - 1\}px`/g, "fontSize: `${Math.round(((orgSettings.printerFontSize || 13) - 1) * 1.75)}px`");

const pxRegex = /fontSize: '([0-9.]+)px'/g;
code = code.replace(pxRegex, (match, p1) => {
  const scaled = Math.round(parseFloat(p1) * 1.75);
  return `fontSize: '${scaled}px'`;
});

fs.writeFileSync('src/components/BillPrintLayout.tsx', code);

const fs = require('fs');
let code = fs.readFileSync('src/components/AttendancePayrollTab.tsx', 'utf8');

const lastDivIdx = code.lastIndexOf('</div>');
if (lastDivIdx !== -1) {
  // Wait, there are multiple divs at the end.
  // We want to insert before the second to last closing div.
  // Because it's:
  //       </div> <-- #payroll-print-area end
  //     </div> <-- container end
  //   );
  // }
  
  // Actually, we can just replace the opening tag `{/* Printer Area for Payroll Pay-slips */}\n      <div id="payroll-print-area"` with the portal, and find the matching closing tag.
}

code = code.replace('{/* Printer Area for Payroll Pay-slips */}\\n      <div id="payroll-print-area"', '{/* Printer Area for Payroll Pay-slips */}\\n      {createPortal(\\n      <div id="payroll-print-area"');

// I'll just write it with Regex!
code = code.replace(/\{\/\* Printer Area for Payroll Pay-slips \*\/}[\s\S]*?<div id="payroll-print-area"/, '{/* Printer Area for Payroll Pay-slips */}\n      {createPortal(\n      <div id="payroll-print-area"');

code = code.replace(/        \)}\s*<\/div>\s*<\/div>\s*\);\s*}/, '        )}\n      </div>\n      , document.body)}\n    </div>\n  );\n}');

fs.writeFileSync('src/components/AttendancePayrollTab.tsx', code);

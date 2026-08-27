const fs = require('fs');
let code = fs.readFileSync('src/components/AttendancePayrollTab.tsx', 'utf8');

if (!code.includes("import { createPortal }")) {
  code = code.replace("import React,", "import React, { useState, useEffect } from 'react';\nimport { createPortal } from 'react-dom';\n//");
}

const target = `{/* Printer Area for Payroll Pay-slips */}
      <div id="payroll-print-area" className="hidden print:block fixed inset-0 bg-white z-[9999]">`;

const replacement = `{/* Printer Area for Payroll Pay-slips */}
      {createPortal(
      <div id="payroll-print-area" className="hidden print:block fixed inset-0 bg-white z-[9999]">`;

const endTarget = `          </div>
        )}
      </div>
    </div>
  );
}`;

const endReplacement = `          </div>
        )}
      </div>
      , document.body)}
    </div>
  );
}`;

code = code.replace(target, replacement);
code = code.replace(endTarget, endReplacement);

fs.writeFileSync('src/components/AttendancePayrollTab.tsx', code);

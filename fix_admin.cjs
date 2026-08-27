const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

// 1. Add createPortal import
if (!code.includes("import { createPortal }")) {
  code = code.replace("import React,", "import React, { useState, useEffect, useRef } from 'react';\nimport { createPortal } from 'react-dom';\n//");
}

// 2. Replace the thermal print area
const startStr = "{/* Hidden thermal print area (Admin) */}";
const startIdx = code.indexOf(startStr);

if (startIdx !== -1) {
  const beforePrint = code.substring(0, startIdx);
  const afterPrintSearch = code.substring(startIdx);
  
  // Find the end of the thermal print area
  // It's the closing tag of the <div id="thermal-print-area">
  // Let's find the next sibling or end of main wrapper
  // It's probably followed by `{/* Footer */}` or just `</div>` of the main container.
  
  // To be safe, I'll use regex or find exact end
  // Let's first just print what's after startIdx to understand it.
  fs.writeFileSync('admin_tail.txt', afterPrintSearch.substring(0, 2000));
}

fs.writeFileSync('src/pages/AdminDashboard.tsx', code);

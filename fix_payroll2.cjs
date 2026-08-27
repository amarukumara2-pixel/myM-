const fs = require('fs');
let code = fs.readFileSync('src/components/AttendancePayrollTab.tsx', 'utf8');

// The replacement that probably failed or partially matched:
code = code.replace("      </div>\n    </div>\n  );\n}", "      </div>\n      , document.body)}\n    </div>\n  );\n}");

fs.writeFileSync('src/components/AttendancePayrollTab.tsx', code);

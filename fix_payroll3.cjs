const fs = require('fs');
let code = fs.readFileSync('src/components/AttendancePayrollTab.tsx', 'utf8');

// Find the very last `  );`
const lastIdx = code.lastIndexOf('  );');
if (lastIdx !== -1) {
  // we want to put `, document.body)}` before the closing div, which is probably above `  );`
  // Actually, I can just replace `        )}\n      </div>\n    </div>` with `        )}\n      </div>\n      , document.body)}\n    </div>`
  
  code = code.replace(/        \)}\n      <\/div>\n    <\/div>/, '        )}\n      </div>\n      , document.body)}\n    </div>');
  
  fs.writeFileSync('src/components/AttendancePayrollTab.tsx', code);
}

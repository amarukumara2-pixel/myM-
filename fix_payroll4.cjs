const fs = require('fs');
let code = fs.readFileSync('src/components/AttendancePayrollTab.tsx', 'utf8');

// I need to change:
//         )}
//       </div>
//     </div>
//   );
// }

// To:
//         )}
//       </div>
//       , document.body)}
//     </div>
//   );
// }

const target = `        )}
      </div>
    </div>
  );
}`;

const rep = `        )}
      </div>
      , document.body)}
    </div>
  );
}`;

code = code.replace(target, rep);
fs.writeFileSync('src/components/AttendancePayrollTab.tsx', code);

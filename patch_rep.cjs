const fs = require('fs');
let code = fs.readFileSync('src/pages/RepDashboard.tsx', 'utf8');

const target = `        {/* Hidden thermal print area (Rep) */}
        <div 
          id="thermal-print-area" 
          className="print-only"`;

const replacement = `        {/* Hidden thermal print area (Rep) */}
        {createPortal(
        <div 
          id="thermal-print-area" 
          className="print-only"`;

code = code.replace(target, replacement);

const targetEnd = `          )}
        </div>
      </div>
    </div>
  );
}

function BillingTab`;

const replacementEnd = `          )}
        </div>
        , document.body)}
      </div>
    </div>
  );
}

function BillingTab`;

code = code.replace(targetEnd, replacementEnd);

fs.writeFileSync('src/pages/RepDashboard.tsx', code);

const fs = require('fs');

function patchFile(file) {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/s\.createdAt && s\.createdAt\.startsWith\((.*?)\)/g, "s.createdAt && (typeof s.createdAt === 'string' ? s.createdAt : new Date(s.createdAt).toISOString()).startsWith($1)");
    fs.writeFileSync(file, code);
}

patchFile('src/components/AttendancePayrollTab.tsx');
patchFile('src/components/RepRoutes.tsx');

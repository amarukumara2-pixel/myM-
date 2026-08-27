const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

code = code.replace(/getOrganizationSettings, saveOrganizationSettings, OrganizationSettings, AIActionRequest/g, "getOrganizationSettings, saveOrganizationSettings, OrganizationSettings, AIActionRequest, deleteSystemUser");

code = code.replace(/const handleDeleteRep = \(id: string\) => \{\s*if \(confirm\('Delete this Sales Rep\? This will remove their credentials and inventory log\.'\)\) \{\s*const allUsers = getUsers\(\)\.filter\(u => u\.id !== id\);\s*saveUsers\(allUsers\);\s*setReps\(allUsers\.filter\(u => u\.role === 'rep'\)\);\s*\}\s*\};/g, `const handleDeleteRep = (id: string) => {
    if (confirm('Delete this Sales Rep? This will remove their credentials and inventory log.')) {
      deleteSystemUser(id);
      const allUsers = getUsers().filter(u => u.id !== id);
      setReps(allUsers.filter(u => u.role === 'rep'));
    }
  };`);

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

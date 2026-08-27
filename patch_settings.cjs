const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

code = code.replace(/const \[logoUrl, setLogoUrl\] = useState\(settings.logoUrl \|\| ''\);/g, "const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');\n  const [customApiKey, setCustomApiKey] = useState(localStorage.getItem('gemini_api_key_custom') || '');");

code = code.replace(/saveOrganizationSettings\(updated\);\n/g, "saveOrganizationSettings(updated);\n    if (customApiKey) {\n      localStorage.setItem('gemini_api_key_custom', customApiKey);\n    } else {\n      localStorage.removeItem('gemini_api_key_custom');\n    }\n");

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

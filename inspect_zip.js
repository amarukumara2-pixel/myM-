import AdmZip from 'adm-zip';
import fs from 'fs';

try {
  const zip = new AdmZip('public/mym-website.zip');
  const entries = zip.getEntries();
  console.log(`Found ${entries.length} files in mym-website.zip:`);
  entries.slice(0, 50).forEach(entry => {
    console.log(`  ${entry.entryName}`);
  });
  if (entries.length > 50) {
    console.log(`  ... and ${entries.length - 50} more files`);
  }
} catch (e) {
  console.error("Error reading zip:", e);
}

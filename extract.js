import AdmZip from 'adm-zip';

try {
  const zip = new AdmZip('dist/mym-source.zip');
  const zipEntries = zip.getEntries();
  console.log(`Found ${zipEntries.length} entries in dist/mym-source.zip`);
  
  // Find AdminDashboard.tsx
  const entry = zipEntries.find(e => e.entryName.includes('AdminDashboard.tsx'));
  if (entry) {
    console.log(`Found AdminDashboard.tsx in zip: ${entry.entryName}`);
    zip.extractEntryTo(entry, 'temp_extracted', false, true);
    console.log('Extracted successfully to temp_extracted!');
  } else {
    console.log('AdminDashboard.tsx not found in zip');
  }
} catch (e) {
  console.error('Error reading zip:', e);
}

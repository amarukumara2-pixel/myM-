import fs from 'fs';
import path from 'path';
import archiverPkg from 'archiver';
const archiver = archiverPkg;

const output = fs.createWriteStream(path.join(process.cwd(), 'dist.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log('Archive created: ' + archive.pointer() + ' total bytes');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory('dist/', false);
archive.finalize();

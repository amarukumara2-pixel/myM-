import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

const zip = new AdmZip();

const excluded = [
  "node_modules", 
  "dist", 
  ".git", 
  ".netlify", 
  ".env", 
  ".env.local", 
  ".DS_Store"
];

function addFiles(dir, zipPath = "") {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (excluded.includes(file) || file.endsWith(".zip")) continue;
    
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      addFiles(fullPath, path.join(zipPath, file));
    } else {
      zip.addLocalFile(fullPath, zipPath);
    }
  }
}

console.log("Generating Source ZIP file...");
addFiles(".");

const zipPathDist = "./dist/mym-source.zip";
const zipPathPublic = "./public/mym-source.zip";

zip.writeZip(zipPathDist);
fs.copyFileSync(zipPathDist, zipPathPublic);

console.log(`Source ZIP successfully created at ${zipPathDist} and ${zipPathPublic}`);

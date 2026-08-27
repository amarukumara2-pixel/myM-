import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

const zip = new AdmZip();

// Function to add files recursively
function addFiles(dir, zipPath = "") {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    // Skip ZIP files and certain folders
    if (file.endsWith(".zip") || file === "node_modules" || file === ".git") {
      continue;
    }

    if (stat.isDirectory()) {
      addFiles(fullPath, path.join(zipPath, file));
    } else {
      zip.addLocalFile(fullPath, zipPath);
    }
  }
}

console.log("Generating Website ZIP file...");

// Add everything from dist
if (fs.existsSync("./dist")) {
    console.log("Adding contents of ./dist to ZIP root...");
    addFiles("./dist"); // Use the helper to add contents at root
} else {
    console.error("Error: ./dist directory not found. Run 'npm run build' first.");
    process.exit(1);
}

// Ensure critical deployment files are present at root
const rootFiles = ["_redirects"];
rootFiles.forEach(file => {
    if (fs.existsSync(file)) {
        const zipEntries = zip.getEntries().map(e => e.entryName);
        if (!zipEntries.includes(file)) {
            console.log(`Adding ${file} from root to ZIP...`);
            zip.addLocalFile(file);
        }
    }
});

// Add specific netlify.toml for pre-built dist
if (fs.existsSync("netlify-dist.toml")) {
    console.log("Adding netlify-dist.toml as netlify.toml...");
    zip.addLocalFile("netlify-dist.toml", "", "netlify.toml");
}


// Generate the zip
const zipPathDist = "./dist/mym-website.zip";
const zipPathPublic = "./public/mym-website.zip";

zip.writeZip(zipPathDist);
// Copy to public as well
fs.copyFileSync(zipPathDist, zipPathPublic);

console.log(`Website ZIP successfully created at ${zipPathDist} and ${zipPathPublic}`);

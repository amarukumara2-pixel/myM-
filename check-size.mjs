import fs from "fs";
const files = ["./dist/mym-website.zip", "./dist/assets/index-Bc4C3JkW.js"];
files.forEach(f => {
  if (fs.existsSync(f)) {
    console.log(`${f}: ${fs.statSync(f).size} bytes`);
  } else {
    console.log(`${f}: NOT FOUND`);
  }
});

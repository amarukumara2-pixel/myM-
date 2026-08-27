const AdmZip = require('adm-zip');
const zip = new AdmZip();
zip.addLocalFolder("dist");
zip.writeZip("dist.zip");
console.log("dist.zip successfully created!");

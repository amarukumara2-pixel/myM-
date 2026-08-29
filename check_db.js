import { readFileSync } from 'fs';
const config = JSON.parse(readFileSync('./firebase-applet-config.json'));
console.log(config);

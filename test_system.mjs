import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  const sysSnap = await getDocs(collection(db, 'system'));
  console.log("SYSTEM collection docs:");
  for (const d of sysSnap.docs) {
    console.log(`Doc ID: ${d.id}, data keys: ${Object.keys(d.data())}`);
    if (d.data().data) {
      console.log(`  Array length in '${d.id}': ${d.data().data.length}`);
      if (d.data().data.length > 0) {
        console.log(`  Sample item:`, JSON.stringify(d.data().data[0]).slice(0, 150));
      }
    }
  }

  process.exit(0);
}

test();

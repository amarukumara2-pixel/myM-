import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  console.log("Checking collections...");
  for (const colName of ['inventory', 'system', 'sales', 'organizations', 'users', 'customers', 'suppliers']) {
    try {
      const snap = await getDocs(collection(db, colName));
      console.log(`Collection '${colName}': ${snap.size} docs`);
      snap.docs.forEach(d => {
        console.log(`  Doc ID: ${d.id}`, JSON.stringify(d.data()).slice(0, 150));
      });
    } catch (e) {
      console.error(`Error fetching '${colName}':`, e.message);
    }
  }
  process.exit(0);
}

test();

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  console.log("=== INVENTORY COLLECTION ===");
  const invSnap = await getDocs(query(collection(db, 'inventory'), limit(50)));
  console.log(`Inventory doc count (limit 50): ${invSnap.size}`);
  invSnap.docs.forEach(d => {
    console.log(`Inventory Doc [${d.id}]:`, JSON.stringify(d.data()));
  });

  console.log("\n=== SYSTEM COLLECTION ===");
  const sysSnap = await getDocs(query(collection(db, 'system'), limit(10)));
  console.log(`System doc count: ${sysSnap.size}`);
  sysSnap.docs.forEach(d => {
    const data = d.data();
    console.log(`System Doc [${d.id}]: keys=${Object.keys(data)}, dataArrayLen=${data.data ? data.data.length : 'none'}`);
  });

  console.log("\n=== SALES COLLECTION COUNT ===");
  const salesSnap = await getDocs(query(collection(db, 'sales'), limit(5)));
  console.log(`Sales doc count (limit 5): ${salesSnap.size}`);
  salesSnap.docs.forEach(d => {
    console.log(`Sales Doc [${d.id}]:`, JSON.stringify(d.data()).slice(0, 200));
  });

  process.exit(0);
}

test();

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  console.log("=== INVENTORY COLLECTION ===");
  const invSnap = await getDocs(collection(db, 'inventory'));
  console.log(`Inventory doc count: ${invSnap.size}`);
  invSnap.docs.forEach(d => {
    console.log(`Inventory Doc [${d.id}]:`, JSON.stringify(d.data()));
  });

  console.log("\n=== SYSTEM COLLECTION ===");
  const sysSnap = await getDocs(collection(db, 'system'));
  console.log(`System doc count: ${sysSnap.size}`);
  sysSnap.docs.forEach(d => {
    console.log(`System Doc [${d.id}]:`, JSON.stringify(d.data()).slice(0, 300));
  });

  console.log("\n=== SALES COLLECTION COUNT ===");
  const salesSnap = await getDocs(collection(db, 'sales'));
  console.log(`Sales doc count: ${salesSnap.size}`);
  salesSnap.docs.slice(0, 5).forEach(d => {
    console.log(`Sales Doc [${d.id}]:`, JSON.stringify(d.data()).slice(0, 200));
  });

  process.exit(0);
}

test();

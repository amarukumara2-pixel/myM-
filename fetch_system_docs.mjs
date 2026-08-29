import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, limit, query } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  const orgIds = ['MYM-BIZFLOW', 'default', 'main', 'admin'];
  for (const orgId of orgIds) {
    try {
      const dRef = doc(db, 'system', `org_${orgId}_inventory`);
      const snap = await getDoc(dRef);
      if (snap.exists()) {
        console.log(`FOUND org_${orgId}_inventory! Count:`, snap.data()?.data?.length);
        console.log("Sample 3 items:", JSON.stringify(snap.data()?.data?.slice(0, 3)));
      } else {
        console.log(`Not found: org_${orgId}_inventory`);
      }
    } catch (e) {
      console.error(`Err org_${orgId}_inventory:`, e.message);
    }
  }

  // Also check direct doc system/inventory
  try {
    const snap = await getDoc(doc(db, 'system', 'inventory'));
    if (snap.exists()) {
      console.log("FOUND system/inventory! Count:", snap.data()?.data?.length);
      console.log("Sample 3 items:", JSON.stringify(snap.data()?.data?.slice(0, 3)));
    }
  } catch (e) {
    console.error("Err system/inventory:", e.message);
  }

  process.exit(0);
}

test();

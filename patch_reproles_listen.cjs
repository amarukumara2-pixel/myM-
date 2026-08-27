const fs = require('fs');
let code = fs.readFileSync('src/components/RepRoutes.tsx', 'utf8');

const replacement = `    let unsubLocs = () => {};
    // Load live locations directly from Firestore
    import('firebase/firestore').then(({ collection, query, where, onSnapshot, getFirestore }) => {
       const db = getFirestore();
       const orgId = localStorage.getItem('bizflow_active_org') || 'MYM-BIZFLOW';
       unsubLocs = onSnapshot(query(collection(db, 'rep_locations'), where('organizationId', '==', orgId)), (snap) => {
           const locs: any[] = [];
           snap.forEach(doc => locs.push(doc.data()));
           setLiveLocations(locs);
       });
    });

    const handleSync = (e: any) => {`;

code = code.replace(/import\('firebase\/firestore'\)\.then\(\(\{\s*collection,\s*query,\s*where,\s*getDocs,\s*getFirestore\s*\}\) => \{[\s\S]*?const handleSync = \(e: any\) => \{/, replacement);

fs.writeFileSync('src/components/RepRoutes.tsx', code);

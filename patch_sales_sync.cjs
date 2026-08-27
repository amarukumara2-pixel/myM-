const fs = require('fs');
let code = fs.readFileSync('src/lib/store.ts', 'utf8');

const salesListener = `    onSnapshot(query(collection(db, 'sales'), where('organizationId', '==', orgId)), (snapshot) => {
      const dbSales: any[] = [];
      snapshot.forEach(d => dbSales.push(d.data()));
      
      const localSalesStr = localStorage.getItem(\`bizflow_\${orgId}_sales_v1\`) || localStorage.getItem('bizflow_sales_v1');
      let localSales: any[] = [];
      try { if (localSalesStr) localSales = JSON.parse(localSalesStr); } catch(e) {}
      
      const mergedMap = new Map<string, any>();
      localSales.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });
      dbSales.forEach(s => { if (s && s.id) mergedMap.set(String(s.id), s); });
      
      const finalSales = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);
      localStorage.setItem(\`bizflow_\${orgId}_sales_v1\`, JSON.stringify(finalSales));
      localStorage.setItem(\`bizflow_sales_v1\`, JSON.stringify(finalSales));
      callback('sales', finalSales);
    }, (error) => {
      console.warn("Real-time sync inactive or denied for sales. Operating on robust local cache fallback.", error);
    }),`;

code = code.replace(/onSnapshot\(query\(collection\(db, 'customers'\)/, salesListener + "\n    onSnapshot(query(collection(db, 'customers')");

fs.writeFileSync('src/lib/store.ts', code);

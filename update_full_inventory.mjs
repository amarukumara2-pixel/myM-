import { readFileSync, writeFileSync } from 'fs';

const rawList = `
ඥානකතා 20 පොඩි	චමෝද්	Rs 440.00	Rs 550.00	Rs 530.00	6
ටොෆි-මිල්ක්	බින්ගො	Rs 425.00	Rs 550.00	Rs 500.00	70
ටොෆි	බින්ගො	Rs 336.00	Rs 550.00	Rs 450.00	10
ටිෆිටිප්-100	බින්ගො	Rs 60.00	Rs 80.00	Rs 70.00	144
සුවදපහ	අනූෂා	Rs 450.00	Rs 500.00	Rs 480.00	10
ටිෆිටිප්-1kg	බින්ගො	Rs 1175.00	Rs 1300.00	Rs 1200.00	7
මුරුක්කු-5	රන්මල්	Rs 500.00	Rs 650.00	Rs 580.00	20
කිරිටොෆි 10	-	Rs 450.00	Rs 630.00	Rs 580.00	22
තල බෝල	-	Rs 450.00	Rs 650.00	Rs 580.00	5
නූඩ්ල්ස් 400g	බින්ගො	Rs 155.00	Rs 210.00	Rs 190.00	70
රටකජු-මසාලා	දේදුණු	Rs 890.00	Rs 1150.00	Rs 1050.00	10
රටකජු-අවන්	දේදුණු	Rs 890.00	Rs 1150.00	Rs 1050.00	7
රටකජු-තෙල්	දේදුණු	Rs 890.00	Rs 1150.00	Rs 1050.00	10
බයිට් මුරුක්කු	දේදුණු	Rs 490.00	Rs 610.00	Rs 580.00	9
මිෂර්	දේදුණු	Rs 490.00	Rs 620.00	Rs 580.00	18
බේබි මිෂර්	දේදුණු	Rs 490.00	Rs 620.00	Rs 580.00	9
බැදපු තුනපහ 50g	අනූෂා	Rs 71.25	Rs 85.00	Rs 78.00	27
අමු තුනපහ 50g	අනූෂා	Rs 67.50	Rs 85.00	Rs 78.00	8
සෝයා උම්මලකඩ	හිරු	Rs 80.00	Rs 110.00	Rs 100.00	130
සෝයා 70	හිරු	Rs 40.00	Rs 60.00	Rs 50.00	405
කහ කුඩු 25g	අනූෂා	Rs 108.75	Rs 135.00	Rs 125.00	9
කෑලි මිරිස් 50g	අනූෂා	Rs 63.75	Rs 75.00	Rs 70.00	53
ගම්මිරිස් 25g	අනූෂා	Rs 97.50	Rs 120.00	Rs 110.00	23
කජු බෝතල්	NSR	Rs 370.00	Rs 500.00	Rs 450.00	8
බීම 350ml	C cola	Rs 78.00	Rs 110.00	Rs 95.00	624
බීම 750ml	C cola	Rs 117.00	Rs 162.00	Rs 144.00	456
බීම 1.5L	C cola	Rs 227.50	Rs 310.00	Rs 280.00	144
මුරුක්කු-10	-	Rs 500.00	Rs 650.00	Rs 580.00	20
මිනි චිප්ස්	බින්ගෝ	Rs 33.00	Rs 44.00	Rs 35.00	200
සෝයා 60	හිරු	Rs 35.00	Rs 50.00	Rs 40.00	0
ටිපිටිප්-20	බින්ගො	Rs 14.00	Rs 18.00	Rs 17.00	0
ලුණු කැට 1kg	ලලිත්	Rs 100.00	Rs 130.00	Rs 115.00	0
ලොලිපොප් 10	මිරිගම	Rs 600.00	Rs 850.00	Rs 750.00	0
සැමන්	මල්ටි	Rs 450.00	Rs 510.00	Rs 490.00	0
නූඩ්ල්ස් 5kg	තිලිණි	Rs 1200.00	Rs 1350.00	Rs 1300.00	0
පපඩම්-ලොකු 1kg	තිලිණි	Rs 520.00	Rs 650.00	Rs 600.00	0
මිරිස්කුඩු 50g	අනූෂා	Rs 63.75	Rs 75.00	Rs 70.00	0
එනසාල්	අනූෂා	Rs 960.00	Rs 1100.00	Rs 1000.00	0
උම්බලකඩ	අනූෂා	Rs 712.50	Rs 850.00	Rs 800.00	0
තේ කොල 50g	ලලිත්	Rs 60.00	Rs 85.00	Rs 75.00	0
ලුණු කුඩු 400g	ලලිත්	Rs 58.00	Rs 85.00	Rs 75.00	0
නූඩ්ල්ස් 200g	හිරු	Rs 120.00	Rs 150.00	Rs 145.00	0
කොච්චි	දේදුණු	Rs 540.00	Rs 650.00	Rs 600.00	0
බබල් ගම්	ලලිත්	Rs 300.00	Rs 420.00	Rs 380.00	0
සෝයා 160	හිරු	Rs 110.00	Rs 140.00	Rs 130.00	0
පපඩම්-බේබි 1kg	තිලිණි	Rs 520.00	Rs 650.00	Rs 600.00	0
ගී බිස්කට්	රන්මල්	Rs 450.00	Rs 630.00	Rs 580.00	0
සෝයා කූනිස්සො	හිරු	Rs 45.00	Rs 70.00	Rs 58.00	0
බීඩී	හෙට්ටි	Rs 2300.00	Rs 3200.00	Rs 2700.00	0
`;

const lines = rawList.trim().split('\n').filter(l => l.trim().length > 0);
let baseId = 1780000000000;

const parsedItems = lines.map((line, idx) => {
  const parts = line.split('\t').map(p => p.trim());
  const name = parts[0];
  const supplier = parts[1] === '-' ? '' : parts[1];
  const parseRs = (str) => parseFloat((str || '').replace('Rs', '').replace(',', '').trim()) || 0;
  const costPrice = parseRs(parts[2]);
  const maxPrice = parseRs(parts[3]);
  const minPrice = parseRs(parts[4]);
  const stockVal = parseInt((parts[5] || '0').replace('u', '').trim(), 10) || 0;
  const stock = Math.max(0, stockVal);

  return {
    id: baseId + idx + 1,
    name: name,
    category: 'General',
    supplier: supplier,
    costPrice: costPrice,
    minPrice: minPrice,
    maxPrice: maxPrice,
    price: minPrice || maxPrice,
    wholesalePrice: costPrice,
    sellingPrice: minPrice || maxPrice,
    stock: stock,
    mainStock: stock,
    mainStockQty: stock,
    stockInMain: stock,
    availableStock: stock,
    myStock: stock,
    returnStock: 0
  };
});

// Combine with existing non-duplicate items from previous database log
const existingLog = [
  {"id":1782914438101,"name":"ජෙලි 10","category":"General","supplier":"රන්මල්","costPrice":450,"minPrice":580,"maxPrice":620,"price":580,"stock":12,"availableStock":21,"myStock":21},
  {"id":1782914540166,"name":"ජෙලි 20","category":"General","supplier":"රන්මල්","costPrice":420,"minPrice":530,"maxPrice":580,"price":530,"stock":0,"availableStock":0,"myStock":0},
  {"id":1782914589202,"name":"ජෙලි 50","category":"General","supplier":"රන්මල්","costPrice":450,"minPrice":580,"maxPrice":620,"price":580,"stock":7,"availableStock":14,"myStock":14},
  {"id":1782957431238,"name":"මුදු බයිට්","category":"General","supplier":"දේදුණු","costPrice":530,"minPrice":600,"maxPrice":650,"price":600,"stock":6,"availableStock":10,"myStock":10},
  {"id":1783839707052,"name":"චොකලට් බිස්කට් 100","category":"Biscuits","supplier":"දබුල්ල","costPrice":75,"minPrice":85,"maxPrice":90,"price":85,"stock":68,"availableStock":28,"myStock":128},
  {"id":1783839785790,"name":"ෂෝටීස් බිස්කට් ","category":"Biscuits","supplier":"දබුල්ල","costPrice":75,"minPrice":115,"maxPrice":130,"price":115,"stock":24,"availableStock":0,"myStock":0},
  {"id":1783839861302,"name":"පොල් ටොෆී ","category":"Sweets","supplier":"රන්මල්","costPrice":450,"minPrice":550,"maxPrice":620,"price":550,"stock":8,"availableStock":0,"myStock":0},
  {"id":1783839911018,"name":"කටු බයිට්","category":"Snacks","supplier":"දේදුණු","costPrice":520,"minPrice":580,"maxPrice":630,"price":580,"stock":2,"availableStock":2,"myStock":2},
  {"id":1783839978348,"name":"මාස්මෙලෝස් 20","category":"Sweets","supplier":"ලක්රස","costPrice":650,"minPrice":750,"maxPrice":830,"price":750,"stock":29,"availableStock":20,"myStock":20},
  {"id":1783956882790,"name":"ගල් මස්කට්","category":"Sweets","supplier":"දබුල්ල","costPrice":650,"minPrice":780,"maxPrice":850,"price":780,"stock":24,"availableStock":5,"myStock":5},
  {"id":1783956913252,"name":"තෙල් මස්කට්","category":"Sweets","supplier":"දබුල්ල","costPrice":650,"minPrice":780,"maxPrice":850,"price":780,"stock":23,"availableStock":6,"myStock":6},
  {"id":1785318334414,"name":"මඤ්ඤොක්කා","category":"Snacks","supplier":"දේදුණු","costPrice":780,"minPrice":850,"maxPrice":860,"price":850,"stock":4,"availableStock":3,"myStock":3},
  {"id":1785736874520,"name":"අයිස්කෝන්","category":"Sweets","supplier":"රන්මල්","costPrice":360,"minPrice":450,"maxPrice":500,"price":450,"stock":6,"availableStock":8,"myStock":8},
  {"id":1785829454031,"name":"වේපස් බිස්කට්","category":"Biscuits","supplier":"","costPrice":320,"minPrice":370,"maxPrice":420,"price":370,"stock":14,"availableStock":5,"myStock":5},
  {"id":1786073488999,"name":"කිරිටොෆි-5","category":"Sweets","supplier":"රන්මල්","costPrice":450,"minPrice":580,"maxPrice":630,"price":580,"stock":20,"availableStock":0,"myStock":0},
  {"id":1786073703244,"name":"ජෙලි ස්ටික්","category":"Sweets","supplier":"රන්මල්","costPrice":600,"minPrice":750,"maxPrice":830,"price":750,"stock":10,"availableStock":0,"myStock":0},
  {"id":1786692515952,"name":"වයින් බිස්කට් ","category":"Biscuits","supplier":"දබුල්ල","costPrice":650,"minPrice":850,"maxPrice":900,"price":850,"stock":5,"availableStock":3,"myStock":3},
  {"id":1786768395581,"name":"සෝයා 500g","category":"Grocery","supplier":"හිරු","costPrice":200,"minPrice":250,"maxPrice":270,"price":250,"stock":5,"availableStock":5,"myStock":5},
  {"id":1786768941263,"name":"සුදුලූනූ ","category":"Grocery","supplier":"දේදුණු","costPrice":540,"minPrice":600,"maxPrice":650,"price":600,"stock":11,"availableStock":15,"myStock":15}
];

const existingMap = new Map();
parsedItems.forEach(item => {
  existingMap.set(item.name.trim().toLowerCase(), item);
});

existingLog.forEach(item => {
  const normName = item.name.trim().toLowerCase();
  if (!existingMap.has(normName)) {
    existingMap.set(normName, {
      ...item,
      wholesalePrice: item.costPrice,
      sellingPrice: item.minPrice || item.price,
      mainStock: item.stock,
      mainStockQty: item.stock,
      stockInMain: item.stock,
      returnStock: 0
    });
  }
});

const finalInventoryList = Array.from(existingMap.values());

console.log(`Total items parsed and merged: ${finalInventoryList.length}`);

writeFileSync('full_inventory_result.json', JSON.stringify(finalInventoryList, null, 2));

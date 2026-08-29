import { readFileSync } from 'fs';

// Let's inspect log files in task logs if any or parse the JSON string from background log
const rawData = [
  {"id":1777918770351,"name":"බීඩී ","category":"General","supplier":"හෙට්ටි","costPrice":2300,"minPrice":3000,"maxPrice":3200,"price":3000,"stock":5,"stockInMain":5,"availableStock":1,"myStock":1,"returnStock":0},
  {"id":1778314945668,"name":"මිනි චිප්ස් ","category":"General","supplier":"බිංගෝ","costPrice":660,"minPrice":700,"maxPrice":880,"price":700,"stock":60,"stockInMain":60,"availableStock":20,"myStock":20,"returnStock":0},
  {"id":1778335464914,"name":"ටොෆී ","category":"General","supplier":"බින්ගො","costPrice":227.2,"minPrice":4500,"maxPrice":5500,"price":4500,"stock":35,"stockInMain":35,"availableStock":15,"myStock":15,"returnStock":0},
  {"id":1782914438101,"name":"ජෙලි 10","category":"General","supplier":"රන්මල්","costPrice":450,"minPrice":580,"maxPrice":620,"price":580,"stock":12,"stockInMain":12,"availableStock":21,"myStock":21,"returnStock":0},
  {"id":1782914540166,"name":"ජෙලි 20","category":"General","supplier":"රන්මල්","costPrice":420,"minPrice":530,"maxPrice":580,"price":530,"stock":0,"stockInMain":0,"availableStock":0,"myStock":0,"returnStock":0},
  {"id":1782914589202,"name":"ජෙලි 50","category":"General","supplier":"රන්මල්","costPrice":450,"minPrice":580,"maxPrice":620,"price":580,"stock":7,"stockInMain":7,"availableStock":14,"myStock":14,"returnStock":0},
  {"id":1782957431238,"name":"මුදු බයිට්","category":"General","supplier":"දේදුණු","costPrice":530,"minPrice":600,"maxPrice":650,"price":600,"stock":6,"stockInMain":6,"availableStock":10,"myStock":10,"returnStock":0},
  {"id":1783839707052,"name":"චොකලට් බිස්කට් 100","category":"Biscuits","supplier":"දබුල්ල","costPrice":75,"minPrice":85,"maxPrice":90,"price":85,"stock":68,"stockInMain":68,"availableStock":28,"myStock":128,"returnStock":0},
  {"id":1783839785790,"name":"ෂෝටීස් බිස්කට් ","category":"Biscuits","supplier":"දබුල්ල","costPrice":75,"minPrice":115,"maxPrice":130,"price":115,"stock":24,"stockInMain":24,"availableStock":0,"myStock":0,"returnStock":0},
  {"id":1783839861302,"name":"පොල් ටොෆී ","category":"Sweets","supplier":"රන්මල්","costPrice":450,"minPrice":550,"maxPrice":620,"price":550,"stock":8,"stockInMain":8,"availableStock":0,"myStock":0,"returnStock":0},
  {"id":1783839911018,"name":"කටු බයිට්","category":"Snacks","supplier":"දේදුණු","costPrice":520,"minPrice":580,"maxPrice":630,"price":580,"stock":2,"stockInMain":2,"availableStock":2,"myStock":2,"returnStock":0},
  {"id":1783839978348,"name":"මාස්මෙලෝස් 20","category":"Sweets","supplier":"ලක්රස","costPrice":650,"minPrice":750,"maxPrice":830,"price":750,"stock":29,"stockInMain":29,"availableStock":20,"myStock":20,"returnStock":0},
  {"id":1783956882790,"name":"ගල් මස්කට්","category":"Sweets","supplier":"දබුල්ල","costPrice":650,"minPrice":780,"maxPrice":850,"price":780,"stock":24,"stockInMain":24,"availableStock":5,"myStock":5,"returnStock":0},
  {"id":1783956913252,"name":"තෙල් මස්කට්","category":"Sweets","supplier":"දබුල්ල","costPrice":650,"minPrice":780,"maxPrice":850,"price":780,"stock":23,"stockInMain":23,"availableStock":6,"myStock":6,"returnStock":0},
  {"id":1785318334414,"name":"මඤ්ඤොක්කා","category":"Snacks","supplier":"දේදුණු","costPrice":780,"minPrice":850,"maxPrice":860,"price":850,"stock":4,"stockInMain":4,"availableStock":3,"myStock":3,"returnStock":0},
  {"id":1785736874520,"name":"අයිස්කෝන්","category":"Sweets","supplier":"රන්මල්","costPrice":360,"minPrice":450,"maxPrice":500,"price":450,"stock":6,"stockInMain":6,"availableStock":8,"myStock":8,"returnStock":0},
  {"id":1785829454031,"name":"වේපස් බිස්කට්","category":"Biscuits","supplier":"","costPrice":320,"minPrice":370,"maxPrice":420,"price":370,"stock":14,"stockInMain":14,"availableStock":5,"myStock":5,"returnStock":0},
  {"id":1786073488999,"name":"කිරිටොෆි-5","category":"Sweets","supplier":"රන්මල්","costPrice":450,"minPrice":580,"maxPrice":630,"price":580,"stock":20,"stockInMain":20,"availableStock":0,"myStock":0,"returnStock":0},
  {"id":1786073703244,"name":"ජෙලි ස්ටික්","category":"Sweets","supplier":"රන්මල්","costPrice":600,"minPrice":750,"maxPrice":830,"price":750,"stock":10,"stockInMain":10,"availableStock":0,"myStock":0,"returnStock":0},
  {"id":1786692515952,"name":"වයින් බිස්කට් ","category":"Biscuits","supplier":"දබුල්ල","costPrice":650,"minPrice":850,"maxPrice":900,"price":850,"stock":5,"stockInMain":5,"availableStock":3,"myStock":3,"returnStock":0},
  {"id":1786768395581,"name":"සෝයා 500g","category":"Grocery","supplier":"හිරු","costPrice":200,"minPrice":250,"maxPrice":270,"price":250,"stock":5,"stockInMain":5,"availableStock":5,"myStock":5,"returnStock":0},
  {"id":1786768941263,"name":"සුදුලූනූ ","category":"Grocery","supplier":"දේදුණු","costPrice":540,"minPrice":600,"maxPrice":650,"price":600,"stock":11,"stockInMain":11,"availableStock":15,"myStock":15,"returnStock":0}
];

console.log(`Parsed ${rawData.length} real items!`);
console.log(JSON.stringify(rawData, null, 2));

const fs = require('fs');
let code = fs.readFileSync('src/pages/AdminTabs.tsx', 'utf8');

const overviewImports = `import { getActiveOrgId } from '../lib/store';`; // Just in case it's not imported properly. Actually it is imported since we saw it used.

const oldFunc = `export function OverviewTab({ repsList, isGhostMode }: { repsList: any[], isGhostMode: boolean }) {
  const [items] = useState<any[]>(() => getAdminInventory());
  const [requests] = useState<any[]>(() => getAIActionRequests());
  const [attendance] = useState<any[]>(() => getAttendanceRecords());

  const totalProducts = items.length;
  const outOfStock = items.filter(i => i.stock <= 0).length;
  const pendingApprovals = requests.filter(r => r.status === 'Pending').length;
  const activeReps = repsList.length;

  const mockOverviewData = [
    { name: 'Mon', sales: 4000, credit: 2400 },
    { name: 'Tue', sales: 3000, credit: 1398 },
    { name: 'Wed', sales: 2000, credit: 9800 },
    { name: 'Thu', sales: 2780, credit: 3908 },
    { name: 'Fri', sales: 1890, credit: 4800 },
    { name: 'Sat', sales: 2390, credit: 3800 },
    { name: 'Sun', sales: 3490, credit: 4300 },
  ];`;

const newFunc = `export function OverviewTab({ repsList, isGhostMode }: { repsList: any[], isGhostMode: boolean }) {
  const [items] = useState<any[]>(() => getAdminInventory());
  const [requests] = useState<any[]>(() => getAIActionRequests());
  const [attendance] = useState<any[]>(() => getAttendanceRecords());

  const [sales] = useState<any[]>(() => {
    const orgId = getActiveOrgId();
    const stored = localStorage.getItem(\`bizflow_\${orgId}_sales_v1\`) || localStorage.getItem('bizflow_sales_v1');
    return stored ? JSON.parse(stored) : [];
  });

  const [expenses] = useState<any[]>(() => {
    const stored = localStorage.getItem('bizflow_expenses_v1');
    return stored ? JSON.parse(stored) : [];
  });

  const totalProducts = items.length;
  const outOfStock = items.filter(i => i.stock <= 0).length;
  const pendingApprovals = requests.filter(r => r.status === 'Pending').length;
  const activeReps = repsList.length;

  const todayStr = new Date().toLocaleDateString();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  let todayGrossProfit = 0;
  let monthlyGrossProfit = 0;

  sales.forEach(s => {
    if (s.mode !== 'sale' && s.mode !== 'credit') return;
    if (s.status === 'cancelled') return;

    let saleDate = new Date();
    if (s.createdAt) {
      saleDate = new Date(s.createdAt);
    } else if (s.date) {
      saleDate = new Date(s.date);
    }

    const isToday = saleDate.toLocaleDateString() === todayStr;
    const isThisMonth = saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;

    let grossProfit = 0;
    (s.items || []).forEach((item: any) => {
      const sellPrice = Number(item.price) || 0;
      const costPrice = Number(item.costPrice) || 0;
      const qty = Number(item.qty) || 0;
      if (!item.isReturn) {
         grossProfit += (sellPrice - costPrice) * qty;
      }
    });

    if (isToday) todayGrossProfit += grossProfit;
    if (isThisMonth) monthlyGrossProfit += grossProfit;
  });

  let todayExpenses = 0;
  let monthlyExpenses = 0;

  expenses.forEach(e => {
    const expDate = e.date ? new Date(e.date) : new Date();
    const isToday = expDate.toLocaleDateString() === todayStr;
    const isThisMonth = expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;

    if (isToday) todayExpenses += Number(e.amount) || 0;
    if (isThisMonth) monthlyExpenses += Number(e.amount) || 0;
  });

  const todayNetProfit = todayGrossProfit - todayExpenses;
  const monthlyNetProfit = monthlyGrossProfit - monthlyExpenses;

  const mockOverviewData = [
    { name: 'Mon', sales: 4000, credit: 2400 },
    { name: 'Tue', sales: 3000, credit: 1398 },
    { name: 'Wed', sales: 2000, credit: 9800 },
    { name: 'Thu', sales: 2780, credit: 3908 },
    { name: 'Fri', sales: 1890, credit: 4800 },
    { name: 'Sat', sales: 2390, credit: 3800 },
    { name: 'Sun', sales: 3490, credit: 4300 },
  ];`;

code = code.replace(oldFunc, newFunc);

const uiAdd = \`      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 rounded-2xl shadow-lg text-white flex items-center justify-between">
          <div>
            <span className="text-emerald-100 text-sm font-semibold uppercase tracking-wider">Today's Net Profit</span>
            <div className="text-sm text-emerald-200 mb-1">(Gross: Rs \${todayGrossProfit.toLocaleString()} - Exp: Rs \${todayExpenses.toLocaleString()})</div>
            <h3 className="text-4xl font-black mt-1">Rs \${todayNetProfit.toLocaleString()}</h3>
          </div>
          <div className="bg-white/20 p-4 rounded-xl backdrop-blur-sm">
            <DollarSign size={32} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-2xl shadow-lg text-white flex items-center justify-between">
          <div>
            <span className="text-blue-100 text-sm font-semibold uppercase tracking-wider">Monthly Net Profit</span>
            <div className="text-sm text-blue-200 mb-1">(Gross: Rs \${monthlyGrossProfit.toLocaleString()} - Exp: Rs \${monthlyExpenses.toLocaleString()})</div>
            <h3 className="text-4xl font-black mt-1">Rs \${monthlyNetProfit.toLocaleString()}</h3>
          </div>
          <div className="bg-white/20 p-4 rounded-xl backdrop-blur-sm">
            <TrendingUp size={32} />
          </div>
        </div>
      </div>\`;

code = code.replace(/<div className="grid grid-cols-1 md:grid-cols-4 gap-6">/, uiAdd + '\\n\\n      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">');

fs.writeFileSync('src/pages/AdminTabs.tsx', code);

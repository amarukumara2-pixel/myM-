type Translations = {
  [key: string]: {
    en: string;
    si: string;
  };
};

export const translations: Translations = {
  admin_portal: { en: "Admin Portal", si: "පරිපාලක ද්වාරය" },
  rep_portal: { en: "Sales Rep Portal", si: "අලෙවි නියෝජිත ද්වාරය" },
  dashboard: { en: "Dashboard", si: "උපකරණ පුවරුව" },
  inventory: { en: "Inventory", si: "තොග කළමනාකරණය" },
  suppliers: { en: "Suppliers", si: "සැපයුම්කරුවන්" },
  credit_bills: { en: "Credit Bills", si: "ණය බිල්පත්" },
  attendance: { en: "Payroll & Attendance", si: "පැමිණීම සහ වැටුප්" },
  expenses: { en: "Expenses", si: "වියදම්" },
  billing: { en: "Billing", si: "බිල්පත් කිරීම" },
  settlement: { en: "Settlement", si: "පියවීම" },
  stock_loading: { en: "Stock Loading", si: "තොග පැටවීම" },
  ai_assistant: { en: "AI Assistant", si: "AI සහායක" },
  red_alerts: { en: "Red Alerts", si: "රතු අනතුරු ඇඟවීම්" },
  manage_reps: { en: "Manage Reps", si: "නියෝජිත කළමනාකරණය" },
  ocr_scan: { en: "OCR Scan Bills", si: "OCR බිල්පත් ස්කෑන් කරන්න" },
  language: { en: "Language", si: "භාෂාව" },
  english: { en: "English", si: "English" },
  sinhala: { en: "සිංහල", si: "සිංහල" },
  logout: { en: "Back to Home", si: "මුල් පිටුවට" },
  purchasing: { en: "Supplier Purchasing", si: "සැපයුම්කරුවන්ගෙන් බඩු ගැනීම" },
  customers: { en: "Shops & Customers", si: "කඩවල් සහ පාරිභෝගිකයින්" },
  payment_history: { en: "Payment History", si: "ගෙවීම් ඉතිහාසය" },
  approvals: { en: "Approval Requests", si: "අනුමැති ඉල්ලීම්" },
  credit_balance: { en: "Credit Balance", si: "ණය ශේෂය" },
  shop_registry: { en: "Shop Registry", si: "කඩවල් ලේඛනය" },
  location: { en: "Location", si: "ස්ථානය" },
  phone: { en: "Phone", si: "දුරකථනය" },
  save_shop: { en: "Save Shop", si: "කඩය සුරකින්න" },
  edit_shop: { en: "Edit Shop", si: "කඩය වෙනස් කරන්න" },
  delete_shop: { en: "Delete Shop", si: "කඩය මකන්න" },
  payment: { en: "Payment", si: "මුදල් ගෙවීම" },
};

export const SINHALA_MONTHS_LONG = [
  "ජනවාරි",
  "පෙබරවාරි",
  "මාර්තු",
  "අප්‍රේල්",
  "මැයි",
  "ජූනි",
  "ජූලි",
  "අගෝස්තු",
  "සැප්තැම්බර්",
  "ඔක්තෝබර්",
  "නොවැම්බර්",
  "දෙසැම්බර්"
];

export const SINHALA_MONTHS_SHORT = [
  "ජන",
  "පෙබ",
  "මාර්",
  "අප්‍රේ",
  "මැයි",
  "ජූනි",
  "ජූලි",
  "අගෝ",
  "සැප්",
  "ඔක්",
  "නොවැ",
  "දෙසැ"
];

export const SINHALA_WEEKDAYS_LONG = [
  "ඉරිදා",
  "සඳුදා",
  "අඟහරුවාදා",
  "බදාදා",
  "බ්‍රහස්පතින්දා",
  "සිකුරාදා",
  "සෙනසුරාදා"
];

export const SINHALA_WEEKDAYS_SHORT = [
  "ඉරි",
  "සඳු",
  "අඟ",
  "බදා",
  "බ්‍රහ",
  "සිකු",
  "සෙන"
];

export function getSinhalaMonthName(monthIndex: number, short = false): string {
  const idx = ((monthIndex % 12) + 12) % 12;
  return short ? SINHALA_MONTHS_SHORT[idx] : SINHALA_MONTHS_LONG[idx];
}

export function formatSinhalaDate(
  dateInput?: string | number | Date,
  options?: {
    includeWeekday?: boolean;
    shortWeekday?: boolean;
    shortMonth?: boolean;
    includeTime?: boolean;
  }
): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const year = d.getFullYear();
  const monthName = getSinhalaMonthName(d.getMonth(), options?.shortMonth);
  const day = d.getDate();
  const weekdayName = options?.shortWeekday
    ? SINHALA_WEEKDAYS_SHORT[d.getDay()]
    : SINHALA_WEEKDAYS_LONG[d.getDay()];

  let result = `${year} ${monthName} ${day}`;
  if (options?.includeWeekday) {
    result = `${weekdayName}, ${result}`;
  }

  if (options?.includeTime) {
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'ප.ව.' : 'පෙ.ව.';
    const displayHours = hours % 12 || 12;
    result += ` ${ampm} ${displayHours}:${minutes}`;
  }

  return result;
}

export function formatSinhalaMonthYear(yearMonthStr: string): string {
  if (!yearMonthStr) return '';
  const parts = yearMonthStr.split('-');
  if (parts.length >= 2) {
    const year = parts[0];
    const monthNum = parseInt(parts[1], 10);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      return `${year} ${SINHALA_MONTHS_LONG[monthNum - 1]}`;
    }
  }
  return yearMonthStr;
}

export function useTranslation(lang: 'en' | 'si' = 'en') {
  return function t(key: keyof typeof translations | string): string {
    if (translations[key]) {
      return translations[key][lang] || translations[key].en;
    }
    return key as string;
  };
}

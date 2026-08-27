/**
 * Rep Sales Targets & Commission Engine
 * Handles daily/monthly targets, percentage & tiered commission calculation,
 * bonus milestones, and sales achievement tracking.
 */
import { getActiveOrgId } from './store';

export interface RepTargetConfig {
  repId: string;
  repName?: string;
  dailyTarget: number;       // e.g. Rs 35,000
  monthlyTarget: number;     // e.g. Rs 1,000,000
  commissionRate: number;    // Base % (e.g. 2.5)
  targetBonus?: number;      // Fixed bonus upon reaching 100% target (e.g. Rs 5,000)
  minQualifyingSales?: number; // Minimum sales to start earning commission
}

export interface RepPerformanceSummary {
  repId: string;
  repName: string;
  todaySales: number;
  todayTarget: number;
  todayAchievementPct: number;
  todayCommission: number;
  todayBillsCount: number;

  monthSales: number;
  monthTarget: number;
  monthAchievementPct: number;
  monthCommission: number;
  monthBillsCount: number;

  targetBonusEarned: number;
  totalEarnings: number;
  isTargetAchieved: boolean;
}

export const getRepTargets = (): Record<string, RepTargetConfig> => {
  const orgId = getActiveOrgId();
  try {
    const raw = localStorage.getItem(`bizflow_${orgId}_rep_targets_v1`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
};

export const saveRepTargets = (targets: Record<string, RepTargetConfig>) => {
  const orgId = getActiveOrgId();
  localStorage.setItem(`bizflow_${orgId}_rep_targets_v1`, JSON.stringify(targets));
  
  Promise.all([import('firebase/firestore'), import('./sync')]).then(([ {doc}, {db, safeSetDoc} ]) => {
    safeSetDoc(doc(db, 'system', `org_${orgId}_rep_targets`), {
      data: targets,
      organizationId: orgId,
      updatedAt: Date.now()
    }, { merge: true });
  });

  window.dispatchEvent(new CustomEvent('bizflow_sync', { detail: { table: 'rep_targets', data: targets } }));
};

export const getTargetForRep = (repId: string, repName?: string): RepTargetConfig => {
  const all = getRepTargets();
  if (all[repId]) return all[repId];

  // Default smart fallback targets
  return {
    repId,
    repName: repName || repId,
    dailyTarget: 35000,
    monthlyTarget: 1000000,
    commissionRate: 2.0,
    targetBonus: 5000,
    minQualifyingSales: 0
  };
};

/**
 * Calculates real-time performance, achievement rate, and commission earned for a Rep
 */
export const calculateRepPerformance = (
  allSales: any[],
  repId: string,
  repName?: string
): RepPerformanceSummary => {
  const target = getTargetForRep(repId, repName);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7); // 'YYYY-MM'

  const repSales = (allSales || []).filter(s => {
    if (!s || s.status === 'cancelled') return false;
    const sRepId = s.repId || s.coRepId;
    return sRepId === repId;
  });

  let todaySales = 0;
  let todayBillsCount = 0;
  let monthSales = 0;
  let monthBillsCount = 0;

  repSales.forEach(s => {
    const sDate = typeof s.createdAt === 'string' ? s.createdAt : new Date(s.createdAt || s.date || 0).toISOString();
    const val = Number(s.total || 0);

    if (sDate.startsWith(todayStr)) {
      todaySales += val;
      todayBillsCount += 1;
    }

    if (sDate.startsWith(currentMonthStr)) {
      monthSales += val;
      monthBillsCount += 1;
    }
  });

  const rate = (target.commissionRate || 2.0) / 100;
  const todayCommission = Math.max(0, todaySales * rate);
  const monthCommission = Math.max(0, monthSales * rate);

  const todayAchievementPct = target.dailyTarget > 0 ? Math.round((todaySales / target.dailyTarget) * 100) : 0;
  const monthAchievementPct = target.monthlyTarget > 0 ? Math.round((monthSales / target.monthlyTarget) * 100) : 0;

  const isTargetAchieved = monthAchievementPct >= 100;
  const targetBonusEarned = isTargetAchieved ? (target.targetBonus || 0) : 0;
  const totalEarnings = monthCommission + targetBonusEarned;

  return {
    repId,
    repName: target.repName || repName || repId,
    todaySales,
    todayTarget: target.dailyTarget,
    todayAchievementPct,
    todayCommission,
    todayBillsCount,
    monthSales,
    monthTarget: target.monthlyTarget,
    monthAchievementPct,
    monthCommission,
    monthBillsCount,
    targetBonusEarned,
    totalEarnings,
    isTargetAchieved
  };
};

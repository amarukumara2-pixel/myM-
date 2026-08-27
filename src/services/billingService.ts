export interface SubscriptionSettings {
  useFirebase: boolean;
  salesReps: number;
  stockKeepers: number;
  staffCount: number;
  staffRoles: {
    admin: number;
    stockKeeper: number;
    rep: number;
    aiAssistant: number;
  };
}

export function calculateMonthlySubscription(settings: SubscriptionSettings): number {
  let total = 0;

  // Base plan
  if (!settings.useFirebase) {
    total += 500;
  } else {
    total += 1000;
  }

  // Sales Reps and Stock Keepers base cost
  total += settings.salesReps * 1000;
  total += settings.stockKeepers * 1000;

  // Staff Pricing
  if (settings.staffCount > 0) {
    if (settings.staffCount <= 10) {
      total += 500;
    } else if (settings.staffCount <= 20) {
      total += 1500;
    } else {
      total += 2000;
    }
  }

  // Role extras
  const roleCount = settings.staffRoles.admin + 
                    settings.staffRoles.stockKeeper + 
                    settings.staffRoles.rep + 
                    settings.staffRoles.aiAssistant;
  
  total += roleCount * 200;

  return total;
}

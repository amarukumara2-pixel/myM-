export type SubscriptionPlan = 'offline-only' | 'pro' | 'trial';

export interface UserSubscription {
  plan: SubscriptionPlan;
  startDate: number;
}

export const isFeatureAllowed = (plan: SubscriptionPlan, startDate: number, feature: string): boolean => {
  const now = Date.now();
  const trialDuration = 7 * 24 * 60 * 60 * 1000;
  
  // Trial: Everything allowed for 7 days
  if (now - startDate < trialDuration) {
    return true;
  }

  // If plan is 'offline-only', restrict online features
  if (plan === 'offline-only') {
    const offlineAllowedFeatures = ['reps', 'inventory', 'customers', 'suppliers', 'invoicing']; // Define these based on user request
    return offlineAllowedFeatures.includes(feature);
  }

  // Pro plan, everything allowed
  return true;
};

/**
 * Safely runs an asynchronous function with filtered stylesheets to prevent html2canvas 
 * from failing or logging warnings on CSS Color Module Level 4 "oklch" functions.
 */
export async function withOklchBypass<T>(fn: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'cssRules');
  const rulesDescriptor = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'rules');

  if (!descriptor) {
    return await fn();
  }

  try {
    Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
      get() {
        try {
          const rules = descriptor.get?.call(this);
          if (!rules) return rules;
          const filtered = [];
          for (let i = 0; i < rules.length; i++) {
            try {
              const rule = rules[i];
              if (rule && rule.cssText && !rule.cssText.includes('oklch')) {
                filtered.push(rule);
              }
            } catch (ruleErr) {
              // Ignore cross-origin rules access errors
            }
          }
          return filtered;
        } catch (err) {
          return [];
        }
      },
      configurable: true
    });

    if (rulesDescriptor) {
      Object.defineProperty(CSSStyleSheet.prototype, 'rules', {
        get() {
          try {
            const rules = rulesDescriptor.get?.call(this);
            if (!rules) return rules;
            const filtered = [];
            for (let i = 0; i < rules.length; i++) {
              try {
                const rule = rules[i];
                if (rule && rule.cssText && !rule.cssText.includes('oklch')) {
                  filtered.push(rule);
                }
              } catch (ruleErr) {
                // Ignore cross-origin rules access errors
              }
            }
            return filtered;
          } catch (err) {
            return [];
          }
        },
        configurable: true
      });
    }

    return await fn();
  } finally {
    // Restore original property descriptors
    Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', descriptor);
    if (rulesDescriptor) {
      Object.defineProperty(CSSStyleSheet.prototype, 'rules', rulesDescriptor);
    }
  }
}

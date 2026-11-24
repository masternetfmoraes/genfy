export const PLAN_FREE = 'free';
export const PLAN_PRO = 'pro';
export const UNLIMITED = null;

export const PLANS = {
  [PLAN_FREE]: {
    id: PLAN_FREE,
    label: 'Gratuito',
    analysisLimit: 5,
    sampleLimit: 50,
    exports: ['csv'],
    history: false,
    managedKey: false
  },
  [PLAN_PRO]: {
    id: PLAN_PRO,
    label: 'Pro',
    analysisLimit: UNLIMITED,
    sampleLimit: 100,
    exports: ['csv', 'xls', 'pdf'],
    history: true,
    managedKey: false
  }
};

export function normalizePlan(value) {
  return value === PLAN_PRO ? PLAN_PRO : PLAN_FREE;
}

export function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildEntitlement(options = {}) {
  const id = normalizePlan(options.plan);
  const config = PLANS[id];
  const used = Number.isFinite(options.used) && options.used > 0 ? Math.floor(options.used) : 0;
  const limit = config.analysisLimit;
  return {
    plan: id,
    label: config.label,
    status: options.status || 'active',
    source: options.source || 'mock',
    limit,
    used,
    remaining: limit === UNLIMITED ? UNLIMITED : Math.max(0, limit - used),
    month: options.month || currentMonth(),
    features: {
      exports: [...config.exports],
      history: config.history,
      managedKey: config.managedKey,
      sampleLimit: config.sampleLimit
    }
  };
}

export function canExport(entitlement, format) {
  if (!entitlement || !entitlement.features) return false;
  return entitlement.features.exports.includes(format);
}

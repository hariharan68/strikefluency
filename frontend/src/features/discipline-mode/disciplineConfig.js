export const TIER_CAPITAL = {
  TIER_1: 100000,
  TIER_2: 500000,
  TIER_3: 1000000,
}

export const RULE_META = {
  MAX_TRADES_PER_DAY: {
    category: 'risk',
    valueKey: 'max_trades',
    unit: 'trades',
    purpose: 'Prevents overtrading by limiting how many new trades can be placed in one session.',
    effect: 'Blocks new orders after the daily trade limit is reached.',
    trigger: 'Checked before every single-leg or strategy order.',
    severity: 'high',
  },
  MAX_DAILY_LOSS: {
    category: 'risk',
    valueKey: 'loss_pct',
    unit: '% of initial capital',
    purpose: 'Stops a losing session before drawdown becomes emotionally or financially destructive.',
    effect: 'Blocks new orders when realised daily loss reaches the configured percentage.',
    trigger: 'Checked against the current trading session realised P&L.',
    severity: 'critical',
  },
  MANDATORY_SL: {
    category: 'execution',
    valueKey: 'enabled',
    unit: '',
    purpose: 'Makes risk explicit before entry by requiring a valid stop-loss price.',
    effect: 'Rejects orders without a stop loss or with a stop on the wrong side of price.',
    trigger: 'Checked on every single-leg order before execution.',
    severity: 'high',
  },
  MANDATORY_SETUP_TAG: {
    category: 'execution',
    valueKey: 'enabled',
    unit: '',
    purpose: 'Requires every trade to be connected to a named trading setup.',
    effect: 'Rejects orders that do not include a setup tag.',
    trigger: 'Checked before single-leg and strategy orders.',
    severity: 'medium',
  },
  NO_AVERAGING_DOWN: {
    category: 'behaviour',
    valueKey: 'enabled',
    unit: '',
    purpose: 'Prevents adding risk to an existing position while the original thesis is unresolved.',
    effect: 'Blocks a new buy in the same instrument, strike, and option type.',
    trigger: 'Checked when a matching open position already exists.',
    severity: 'medium',
  },
  NO_DIRECTION_FLIP: {
    category: 'behaviour',
    valueKey: 'enabled',
    unit: '',
    purpose: 'Prevents impulsive bullish-to-bearish switching while an opposing position is open.',
    effect: 'Blocks a CE/PE direction flip until the existing position is closed.',
    trigger: 'Checked against all open single-leg positions.',
    severity: 'medium',
  },
  REVENGE_COOLDOWN: {
    category: 'behaviour',
    valueKey: 'cooldown_minutes',
    unit: 'minutes',
    purpose: 'Creates recovery time after a stop-loss exit to reduce revenge trading.',
    effect: 'Delays new entries until the cooldown expires.',
    trigger: 'Activated after an order closes because its stop loss was hit.',
    severity: 'medium',
  },
}

export const CATEGORY_META = {
  risk: {
    label: 'Risk rules',
    description: 'Capital and session-level limits that cap downside.',
  },
  execution: {
    label: 'Execution rules',
    description: 'Requirements that must be satisfied before an order is accepted.',
  },
  behaviour: {
    label: 'Behaviour rules',
    description: 'Guardrails against impulsive re-entry, averaging, and direction changes.',
  },
}

export const PRESETS = {
  beginner: {
    name: 'Beginner',
    description: 'Strict protection while building a repeatable process.',
    rules: {
      MAX_TRADES_PER_DAY: { max_trades: 2 },
      MAX_DAILY_LOSS: { loss_pct: 1.5 },
      MANDATORY_SL: { enabled: true },
      MANDATORY_SETUP_TAG: { enabled: true },
      NO_AVERAGING_DOWN: { enabled: true },
      NO_DIRECTION_FLIP: { enabled: true },
      REVENGE_COOLDOWN: { cooldown_minutes: 30 },
    },
  },
  intermediate: {
    name: 'Intermediate',
    description: 'Balanced limits for traders with a stable playbook.',
    rules: {
      MAX_TRADES_PER_DAY: { max_trades: 4 },
      MAX_DAILY_LOSS: { loss_pct: 2 },
      MANDATORY_SL: { enabled: true },
      MANDATORY_SETUP_TAG: { enabled: true },
      NO_AVERAGING_DOWN: { enabled: true },
      NO_DIRECTION_FLIP: { enabled: true },
      REVENGE_COOLDOWN: { cooldown_minutes: 20 },
    },
  },
  advanced: {
    name: 'Advanced',
    description: 'More flexibility while preserving non-negotiable risk controls.',
    rules: {
      MAX_TRADES_PER_DAY: { max_trades: 6 },
      MAX_DAILY_LOSS: { loss_pct: 3 },
      MANDATORY_SL: { enabled: true },
      MANDATORY_SETUP_TAG: { enabled: true },
      NO_AVERAGING_DOWN: { enabled: true },
      NO_DIRECTION_FLIP: { enabled: false },
      REVENGE_COOLDOWN: { cooldown_minutes: 10 },
    },
  },
}

export const DEFAULT_NOTIFICATIONS = {
  remainingTrade: true,
  riskUsage: true,
  cooldown: true,
  scoreDrop: true,
  blockedTrade: true,
  streakMilestone: true,
  tierProgress: true,
}

export const readRuleValue = rule => {
  const value = rule?.rule_value
  return value && typeof value === 'object' ? value : {}
}

export const isRuleEnabled = rule => {
  const value = readRuleValue(rule)
  return rule?.is_active !== false && value.enabled !== false
}

export const formatRuleValue = rule => {
  const meta = RULE_META[rule?.rule_code]
  const value = readRuleValue(rule)
  if (!meta) return 'Configured'
  const current = value[meta.valueKey]
  if (meta.valueKey === 'enabled') return current === false ? 'Optional' : 'Required'
  if (current == null) return 'Not configured'
  return `${current} ${meta.unit}`.trim()
}

export const tierLabel = tier => tier?.replace('_', ' ') || '—'

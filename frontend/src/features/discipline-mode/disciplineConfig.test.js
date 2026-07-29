import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRuleTogglePayload,
  deriveTodayGuardrails,
} from './disciplineConfig.js'

const rules = [
  {
    rule_code: 'MAX_TRADES_PER_DAY',
    rule_value: { max_trades: 4 },
    is_active: true,
  },
  {
    rule_code: 'MAX_DAILY_LOSS',
    rule_value: { loss_pct: 2 },
    is_active: true,
  },
]

test('derives live guardrail usage from account and rule data', () => {
  const result = deriveTodayGuardrails({
    mode: { enabled: true },
    rules,
    accountSummary: {
      account: { initial_balance: 100000 },
      today_trades: 3,
      today_realized_pnl: -750,
      cooldown_remaining_seconds: 95,
    },
  })

  assert.deepEqual(result.trades, {
    used: 3,
    maximum: 4,
    remaining: 1,
    usedPct: 75,
  })
  assert.equal(result.loss.limit, 2000)
  assert.equal(result.loss.used, 750)
  assert.equal(result.loss.remaining, 1250)
  assert.equal(result.loss.usedPct, 37.5)
  assert.deepEqual(result.cooldown, { active: true, seconds: 95 })
  assert.equal(result.protected, true)
})

test('guardrails fail safely when data is missing and report bypass state', () => {
  const result = deriveTodayGuardrails({ mode: { enabled: false } })

  assert.equal(result.protected, false)
  assert.equal(result.trades.remaining, 0)
  assert.equal(result.loss.limit, 0)
  assert.equal(result.loss.usedPct, 0)
  assert.equal(result.cooldown.active, false)
})

test('boolean rule toggles synchronize effective and stored active state', () => {
  const rule = {
    rule_code: 'MANDATORY_SETUP_TAG',
    rule_value: { enabled: false },
    is_active: true,
  }

  assert.deepEqual(buildRuleTogglePayload(rule, true), {
    is_active: true,
    rule_value: { enabled: true },
  })
  assert.deepEqual(buildRuleTogglePayload(rule, false), {
    is_active: false,
    rule_value: { enabled: false },
  })
})

test('numeric rule toggles preserve its configured value', () => {
  const rule = {
    rule_code: 'MAX_DAILY_LOSS',
    rule_value: { loss_pct: 2 },
    is_active: true,
  }

  assert.deepEqual(buildRuleTogglePayload(rule, false), { is_active: false })
})

import test from 'node:test'
import assert from 'node:assert/strict'

import { livePnl, ltpFromChain, mergeLiveOptionChain } from './livePnl.js'

test('reads a streamed premium and calculates BUY and SELL live P&L', () => {
  const chain = {
    strikes: [{ strike: 24150, ce: { ltp: 112.35 }, pe: { ltp: 88.4 } }],
  }

  assert.equal(ltpFromChain(chain, 24150, 'CE'), 112.35)
  assert.equal(ltpFromChain(chain, 24150, 'PE'), 88.4)
  assert.equal(livePnl({ action: 'BUY', entry: 110, ltp: 112, lots: 2, lotSize: 65 }), 260)
  assert.equal(livePnl({ action: 'SELL', entry: 110, ltp: 112, lots: 2, lotSize: 65 }), -260)
})

test('overlays fast LTPs while preserving slower analytics fields', () => {
  const analytics = {
    expiry_date: '2026-08-04',
    spot: 24100,
    atm_strike: 24100,
    max_pain_strike: 24200,
    chain_rows: [
      { strike: 24150, option_type: 'CE', ltp: 100, oi: 1234, iv: 12.5 },
      { strike: 24150, option_type: 'PE', ltp: 90, oi: 5678, iv: 14.5 },
    ],
  }
  const live = {
    expiry: '2026-08-04',
    spot_price: 24162,
    atm_strike: 24150,
    live_quote_at: '2026-07-29T10:00:00+05:30',
    strikes: [{
      strike: 24150,
      ce: { ltp: 103.25, quote_source: 'fyers_stream' },
      pe: { ltp: 87.75, quote_source: 'fyers_stream' },
    }],
  }

  const merged = mergeLiveOptionChain(analytics, live)

  assert.equal(merged.spot, 24162)
  assert.equal(merged.atm_strike, 24150)
  assert.equal(merged.chain_rows[0].ltp, 103.25)
  assert.equal(merged.chain_rows[0].oi, 1234)
  assert.equal(merged.chain_rows[0].iv, 12.5)
  assert.equal(merged.chain_rows[1].ltp, 87.75)
  assert.equal(analytics.chain_rows[0].ltp, 100)
})

test('does not apply the default-expiry stream to another selected expiry', () => {
  const analytics = {
    expiry_date: '2026-08-11',
    chain_rows: [{ strike: 24150, option_type: 'CE', ltp: 100 }],
  }
  const live = {
    expiry: '2026-08-04',
    strikes: [{ strike: 24150, ce: { ltp: 103.25 } }],
  }

  assert.equal(
    mergeLiveOptionChain(analytics, live, '2026-08-11'),
    analytics,
  )
})

// Live P&L helpers — compute a position's mark from the WebSocket option
// chains in marketStore (1s display ticks) instead of waiting for a REST poll.
// All helpers return null when the chain can't price the contract, so
// callers can fall back to the server's last stored values.

export function ltpFromChain(chain, strike, optionType) {
  if (!chain?.strikes || strike == null) return null
  const target = Math.round(Number(strike))
  const row = chain.strikes.find(r => Math.round(Number(r.strike)) === target)
  if (!row) return null
  const side = optionType === 'CE' ? (row.ce || row.call) : (row.pe || row.put)
  const ltp = side?.ltp
  return ltp != null && Number(ltp) > 0 ? Number(ltp) : null
}

export function livePnl({ action, entry, ltp, lots, lotSize }) {
  if (ltp == null || entry == null) return null
  const units = (Number(lots) || 0) * (Number(lotSize) || 0)
  if (!units) return null
  const diff = action === 'SELL' ? Number(entry) - ltp : ltp - Number(entry)
  return diff * units
}

/**
 * Overlay the raw WebSocket chain's fast LTPs on the slower analytics chain.
 *
 * OI, IV, greeks and buildup remain sourced from the analytics snapshot. Only
 * display-time spot/ATM/LTP fields move on each raw chain frame.
 */
export function mergeLiveOptionChain(analytics, liveChain, selectedExpiry = null) {
  if (!analytics?.chain_rows?.length || !liveChain?.strikes?.length) return analytics

  const targetExpiry = selectedExpiry || analytics.expiry_date
  if (targetExpiry && liveChain.expiry && targetExpiry !== liveChain.expiry) {
    return analytics
  }

  const liveByStrike = new Map(
    liveChain.strikes.map(row => [Math.round(Number(row.strike)), row]),
  )
  const chainRows = analytics.chain_rows.map(row => {
    const liveRow = liveByStrike.get(Math.round(Number(row.strike)))
    const side = row.option_type === 'CE'
      ? (liveRow?.ce || liveRow?.call)
      : (liveRow?.pe || liveRow?.put)
    const ltp = Number(side?.ltp)
    if (!Number.isFinite(ltp) || ltp <= 0) return row
    return {
      ...row,
      ltp,
      quote_at: side.quote_at || liveChain.live_quote_at || null,
      quote_age_ms: side.quote_age_ms ?? liveChain.live_quote_age_ms ?? null,
      quote_source: side.quote_source || liveChain.live_quote_source || 'market_websocket',
    }
  })

  const spot = Number(liveChain.spot_price)
  return {
    ...analytics,
    chain_rows: chainRows,
    spot: Number.isFinite(spot) && spot > 0 ? spot : analytics.spot,
    atm_strike: liveChain.atm_strike ?? analytics.atm_strike,
    live_quote_at: liveChain.live_quote_at || null,
    live_quote_age_ms: liveChain.live_quote_age_ms ?? null,
  }
}

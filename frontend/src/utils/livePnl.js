// Live P&L helpers — compute a position's mark from the WebSocket option
// chains in marketStore (3s ticks) instead of waiting for a REST poll.
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

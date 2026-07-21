import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  getPositions, getOrders, getTradebook, closeOrder,
} from '../../api/trading'
import { listStrategies, squareOff } from '../../api/strategy'
import { getTodayViolations } from '../../api/discipline'
import useMarketStore from '../../store/marketStore'
import useTradingStore from '../../store/tradingStore'
import { ltpFromChain, livePnl } from '../../utils/livePnl'
import { formatCurrency } from '../../utils/formatters'
import { useToast } from '../../components/common/Toast'
import {
  Wallet, BookOpen, Table2, ScrollText, RefreshCw, ArrowDownRight,
  ArrowUpRight, Ban, LogIn, LogOut, Layers,
} from 'lucide-react'

const TABS = [
  { key: 'positions', label: 'Live Positions', icon: Wallet },
  { key: 'orderbook', label: 'Orderbook', icon: BookOpen },
  { key: 'tradebook', label: 'Tradebook', icon: Table2 },
  { key: 'logs', label: 'Logs', icon: ScrollText },
]

const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

const num = (v, dp = 2) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(dp))

// ── small presentational bits ──────────────────────────────────
const Card = ({ children }) => (
  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
    {children}
  </div>
)

const TypeBadge = ({ t }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 12,
    background: t === 'CE' ? 'var(--primary-bg)' : 'var(--loss-bg)',
    color: t === 'CE' ? 'var(--primary)' : 'var(--loss)',
  }}>{t}</span>
)

const ProductBadge = ({ p }) => (
  <span title={p === 'NRML' ? 'Carry-forward — held across trading days' : 'Intraday — auto-squared-off at EOD'} style={{
    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: '0.04em',
    background: p === 'NRML' ? 'var(--primary-bg)' : 'var(--color-surface2)',
    color: p === 'NRML' ? 'var(--primary)' : 'var(--text-muted)',
  }}>{p === 'NRML' ? 'NRML' : 'MIS'}</span>
)

const StatusPill = ({ s }) => {
  const map = {
    OPEN: ['var(--primary-bg)', 'var(--primary)'],
    CLOSED: ['var(--color-surface2)', 'var(--text-sub)'],
    TARGET_HIT: ['var(--gain-bg)', 'var(--gain-text)'],
    SL_HIT: ['var(--loss-bg)', 'var(--loss)'],
    CANCELLED: ['var(--color-surface2)', 'var(--text-muted)'],
  }
  const [bg, fg] = map[s] || map.CLOSED
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: bg, color: fg }}>{s?.replace('_', ' ')}</span>
}

const Th = ({ children, align = 'left' }) => (
  <th style={{ padding: '10px 14px', textAlign: align, color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', background: 'var(--color-surface2)', position: 'sticky', top: 0 }}>{children}</th>
)
const Td = ({ children, align = 'left', style = {} }) => (
  <td style={{ padding: '10px 14px', textAlign: align, fontSize: 12.5, color: 'var(--text-sub)', ...style }}>{children}</td>
)

const Empty = ({ icon: Icon, text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '52px 20px', color: 'var(--text-muted)' }}>
    <Icon size={26} strokeWidth={1.6} />
    <span style={{ fontSize: 13 }}>{text}</span>
  </div>
)

const Contract = ({ o }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    <TypeBadge t={o.option_type} />
    <span className="num" style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{o.instrument} {Number(o.strike_price)}</span>
  </div>
)

// ── page ───────────────────────────────────────────────────────
export default function PositionsPage() {
  const { success, error: toastError } = useToast()
  const [tab, setTab] = useState('positions')
  const [positions, setPositions] = useState([])
  const [strategies, setStrategies] = useState([])   // executed multi-leg strategies
  const [posTotals, setPosTotals] = useState({ pnl: 0, margin: 0 })
  const [orders, setOrders] = useState([])
  const [trades, setTrades] = useState([])
  const [violations, setViolations] = useState([])
  const [loading, setLoading] = useState(false)
  const [closingId, setClosingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, s, o, t, v] = await Promise.all([
        getPositions().catch(() => ({ data: {} })),
        listStrategies('EXECUTED').catch(() => ({ data: {} })),
        getOrders(1, null, 'today').catch(() => ({ data: {} })),
        getTradebook(1, 'today').catch(() => ({ data: {} })),
        getTodayViolations().catch(() => ({ data: [] })),
      ])
      setPositions(p.data?.positions || [])
      setStrategies(s.data?.strategies || [])
      setPosTotals({
        pnl: Number(p.data?.total_unrealized_pnl || 0),
        margin: Number(p.data?.total_margin_blocked || 0),
      })
      setOrders(o.data?.orders || [])
      setTrades(t.data?.orders || [])
      setViolations(Array.isArray(v.data) ? v.data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // WS trading events (order placed/closed, auto-exit, strategy actions) →
  // refetch everything after a short debounce. This is what makes an SL hit
  // appear here within a second instead of waiting for the next poll.
  const eventSeq = useTradingStore(s => s.eventSeq)
  useEffect(() => {
    if (!eventSeq) return
    const t = setTimeout(() => { load() }, 300)
    return () => clearTimeout(t)
  }, [eventSeq, load])

  // Slow fallback poll — display P&L is already live from the WS chains, and
  // trading events trigger instant refetches; this only re-syncs server marks
  // when the socket is down.
  useEffect(() => {
    const id = setInterval(() => {
      getPositions()
        .then(r => {
          setPositions(r.data?.positions || [])
          setPosTotals({
            pnl: Number(r.data?.total_unrealized_pnl || 0),
            margin: Number(r.data?.total_margin_blocked || 0),
          })
        })
        .catch(() => {})
      listStrategies('EXECUTED')
        .then(r => setStrategies(r.data?.strategies || []))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(id)
  }, [])

  const handleClose = async (orderId) => {
    setClosingId(orderId)
    try {
      await closeOrder(orderId)
      success('Position closed')
      await load()
    } catch (e) {
      toastError('Could not close position')
    } finally {
      setClosingId(null)
    }
  }

  const handleSquareOff = async (strategyId) => {
    setClosingId(strategyId)
    try {
      await squareOff(strategyId)
      success('Strategy squared off')
      await load()
    } catch (e) {
      toastError('Could not square off strategy')
    } finally {
      setClosingId(null)
    }
  }

  // Build the activity log from today's orders + blocked violations.
  const logs = useMemo(() => {
    const events = []
    for (const o of orders) {
      events.push({
        id: `${o.id}-in`, at: o.entry_time, kind: 'ENTRY',
        text: `${o.action} ${o.instrument} ${Number(o.strike_price)} ${o.option_type} × ${o.quantity} @ ₹${num(o.entry_price)}`,
        tag: o.product_type,
      })
      if (o.status && o.status !== 'OPEN') {
        events.push({
          id: `${o.id}-out`, at: o.exit_time || o.entry_time, kind: o.status,
          text: `${(o.exit_reason || o.status).replace('_', ' ')} · ${o.instrument} ${Number(o.strike_price)} ${o.option_type}`,
          pnl: o.pnl,
        })
      }
    }
    for (const v of violations) {
      events.push({
        id: `v-${v.id}`, at: v.created_at, kind: 'BLOCKED',
        text: `Blocked by rule ${v.rule_code.replace(/_/g, ' ')}`,
      })
    }
    return events.sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [orders, violations])

  const logMeta = {
    ENTRY: { icon: LogIn, color: 'var(--primary)' },
    CLOSED: { icon: LogOut, color: 'var(--text-sub)' },
    TARGET_HIT: { icon: ArrowUpRight, color: 'var(--gain)' },
    SL_HIT: { icon: ArrowDownRight, color: 'var(--loss)' },
    CANCELLED: { icon: LogOut, color: 'var(--text-muted)' },
    BLOCKED: { icon: Ban, color: 'var(--loss)' },
  }

  // ── live marks from the market WebSocket (3s ticks) ─────────
  const chains = useMarketStore(s => s.chains)
  const lastUpdate = useMarketStore(s => s.lastUpdate)
  const wsLive = lastUpdate != null && Date.now() - lastUpdate < 12000

  // Live LTP + P&L for a single-leg position; falls back to the server's last
  // stored mark when the broadcast chain can't price the contract.
  const liveForPosition = (p) => {
    const ltp = ltpFromChain(chains[p.instrument], p.strike_price, p.option_type)
    const pnl = livePnl({ action: p.action || 'BUY', entry: p.avg_entry_price, ltp, lots: p.quantity, lotSize: p.lot_size })
    return {
      ltp: ltp ?? (p.current_ltp != null ? Number(p.current_ltp) : null),
      pnl: pnl ?? Number(p.unrealized_pnl || 0),
    }
  }

  // Live combined P&L (unrealized + realized) for an executed strategy. If any
  // open leg can't be priced from the broadcast chain, fall back to the
  // server-side mark for the whole strategy (never mix live and stale legs).
  const liveForStrategy = (s) => {
    const chain = chains[s.underlying]
    let unrealized = 0
    let allPriced = true
    let hasOpen = false
    for (const l of s.legs || []) {
      if (l.status !== 'OPEN') continue
      hasOpen = true
      const ltp = l.instrument_type === 'FUT'
        ? (chain?.spot_price != null ? Number(chain.spot_price) : null)
        : ltpFromChain(chain, l.strike_price, l.instrument_type)
      const pnl = livePnl({ action: l.action, entry: l.entry_price, ltp, lots: l.lots, lotSize: l.lot_size })
      if (pnl == null) { allPriced = false; break }
      unrealized += pnl
    }
    if (!hasOpen || !allPriced) unrealized = Number(s.position?.unrealized_pnl || 0)
    return unrealized + Number(s.position?.realized_pnl || 0)
  }

  const singlePnl = positions.reduce((sum, p) => sum + liveForPosition(p).pnl, 0)
  const stratPnl = strategies.reduce((sum, s) => sum + liveForStrategy(s), 0)
  const openPnl = singlePnl + stratPnl

  const counts = {
    positions: positions.length + strategies.length,
    orderbook: orders.length,
    tradebook: trades.length,
    logs: logs.length,
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 className="sf-serif" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Positions &amp; Books</h1>
          <p style={{ color: 'var(--text-sub)', fontSize: 13, marginTop: 4 }}>
            Live positions, today’s orderbook, tradebook, and activity log. Books reset each morning at 08:30 IST.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {wsLive && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--gain)', fontWeight: 700 }}>
                  <span style={{ height: 6, width: 6, borderRadius: '50%', background: 'var(--gain)' }} className="sf-pulse" />
                  Live
                </span>
              )}
              Open P&amp;L
            </div>
            <div className="num" style={{ fontSize: 16, fontWeight: 700, color: openPnl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
              {openPnl >= 0 ? '+' : ''}{formatCurrency(openPnl)}
            </div>
          </div>
          <button onClick={load} disabled={loading} title="Refresh" className="sf-icon-button"
            style={{ display: 'grid', placeItems: 'center', height: 36, width: 36, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--color-surface)', cursor: loading ? 'wait' : 'pointer', color: 'var(--text-sub)' }}>
            <RefreshCw size={16} className={loading ? 'sf-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          return (
            <button key={key} onClick={() => setTab(key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
                border: `1px solid ${active ? 'var(--primary-border)' : 'var(--border)'}`,
                background: active ? 'var(--primary-bg)' : 'var(--color-surface)',
                color: active ? 'var(--primary)' : 'var(--text-sub)',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              <Icon size={15} />
              {label}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: active ? 'var(--primary)' : 'var(--color-surface2)', color: active ? 'var(--on-primary)' : 'var(--text-muted)' }}>{counts[key]}</span>
            </button>
          )
        })}
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          {/* ── Live Positions ── */}
          {tab === 'positions' && positions.length === 0 && strategies.length === 0 && (
            <Empty icon={Wallet} text="No open positions right now." />
          )}

          {/* Executed multi-leg strategies (margin + P&L live at strategy level) */}
          {tab === 'positions' && strategies.length > 0 && (
            <div style={{ borderBottom: positions.length ? '1px solid var(--border)' : 'none' }}>
              <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--color-surface2)', borderBottom: '1px solid var(--border)' }}>
                Strategy Positions
              </div>
              {strategies.map(s => {
                const pnl = liveForStrategy(s)
                const openLegs = (s.legs || []).filter(l => l.status === 'OPEN')
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid var(--color-surface2)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'grid', placeItems: 'center', height: 30, width: 30, flexShrink: 0, borderRadius: 8, background: 'var(--primary-bg)', color: 'var(--primary)' }}>
                      <Layers size={15} />
                    </span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          {s.name || (s.template_id ? s.template_id.replace(/_/g, ' ') : `${s.underlying} strategy`)}
                        </span>
                        <ProductBadge p={s.product_type} />
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                        {openLegs.map(l => `${l.action === 'BUY' ? 'B' : 'S'} ${l.strike_price != null ? Math.round(l.strike_price) : 'FUT'} ${l.instrument_type}`).join(' · ') || 'All legs closed'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>P&amp;L</div>
                      <div className="num" style={{ fontSize: 13.5, fontWeight: 700, color: pnl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Margin</div>
                      <div className="num" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-sub)' }}>₹{num(s.position?.margin_blocked, 0)}</div>
                    </div>
                    <button onClick={() => handleSquareOff(s.id)} disabled={closingId === s.id}
                      style={{ background: 'var(--loss-bg)', border: '1px solid var(--loss)', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', color: 'var(--loss)', fontSize: 11, fontWeight: 600 }}>
                      {closingId === s.id ? '…' : 'Square off'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'positions' && positions.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <Th>Position</Th><Th>Product</Th><Th align="right">Qty</Th>
                    <Th align="right">Avg Entry</Th><Th align="right">LTP</Th>
                    <Th align="right">Unrealized P&amp;L</Th><Th align="right">Margin</Th><Th align="right">Action</Th>
                  </tr></thead>
                  <tbody>
                    {positions.map(p => {
                      const live = liveForPosition(p)
                      const pnl = live.pnl
                      return (
                        <tr key={p.id} className="chain-row" style={{ borderBottom: '1px solid var(--color-surface2)' }}>
                          <Td><Contract o={p} /></Td>
                          <Td><ProductBadge p={p.product_type} /></Td>
                          <Td align="right" style={{ color: 'var(--text)' }}>{p.quantity}</Td>
                          <Td align="right">₹{num(p.avg_entry_price)}</Td>
                          <Td align="right">₹{num(live.ltp)}</Td>
                          <Td align="right" style={{ fontWeight: 700, color: pnl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}</Td>
                          <Td align="right">₹{num(p.margin_blocked, 0)}</Td>
                          <Td align="right">
                            <button onClick={() => handleClose(p.order_id)} disabled={closingId === p.order_id}
                              style={{ background: 'var(--loss-bg)', border: '1px solid var(--loss)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', color: 'var(--loss)', fontSize: 11, fontWeight: 600 }}>
                              {closingId === p.order_id ? '…' : 'Close'}
                            </button>
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
          )}

          {/* ── Orderbook ── */}
          {tab === 'orderbook' && (
            orders.length === 0
              ? <Empty icon={BookOpen} text="No orders yet today. The orderbook resets at 08:30 IST." />
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <Th>Time</Th><Th>Order</Th><Th>Side</Th><Th>Product</Th>
                    <Th align="right">Qty</Th><Th align="right">Entry</Th><Th align="right">SL</Th><Th align="right">Target</Th><Th align="right">Status</Th>
                  </tr></thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} className="chain-row" style={{ borderBottom: '1px solid var(--color-surface2)' }}>
                        <Td style={{ color: 'var(--text-muted)' }} >{fmtTime(o.entry_time)}</Td>
                        <Td><Contract o={o} /></Td>
                        <Td style={{ color: o.action === 'BUY' ? 'var(--gain)' : 'var(--loss)', fontWeight: 600 }}>{o.action}</Td>
                        <Td><ProductBadge p={o.product_type} /></Td>
                        <Td align="right" style={{ color: 'var(--text)' }}>{o.quantity}</Td>
                        <Td align="right">₹{num(o.entry_price)}</Td>
                        <Td align="right">{o.sl_price ? `₹${num(o.sl_price)}` : '—'}</Td>
                        <Td align="right">{o.target_price ? `₹${num(o.target_price)}` : '—'}</Td>
                        <Td align="right"><StatusPill s={o.status} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
          )}

          {/* ── Tradebook ── */}
          {tab === 'tradebook' && (
            trades.length === 0
              ? <Empty icon={Table2} text="No executed trades yet today." />
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <Th>Time</Th><Th>Trade</Th><Th>Side</Th><Th>Product</Th>
                    <Th align="right">Qty</Th><Th align="right">Entry</Th><Th align="right">Exit</Th><Th align="right">P&amp;L</Th><Th align="right">Reason</Th>
                  </tr></thead>
                  <tbody>
                    {trades.map(o => {
                      const pnl = Number(o.pnl || 0)
                      return (
                        <tr key={o.id} className="chain-row" style={{ borderBottom: '1px solid var(--color-surface2)' }}>
                          <Td style={{ color: 'var(--text-muted)' }}>{fmtTime(o.exit_time || o.entry_time)}</Td>
                          <Td><Contract o={o} /></Td>
                          <Td style={{ color: o.action === 'BUY' ? 'var(--gain)' : 'var(--loss)', fontWeight: 600 }}>{o.action}</Td>
                          <Td><ProductBadge p={o.product_type} /></Td>
                          <Td align="right" style={{ color: 'var(--text)' }}>{o.quantity}</Td>
                          <Td align="right">₹{num(o.entry_price)}</Td>
                          <Td align="right">{o.exit_price ? `₹${num(o.exit_price)}` : '—'}</Td>
                          <Td align="right" style={{ fontWeight: 700, color: pnl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}</Td>
                          <Td align="right"><StatusPill s={o.status} /></Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
          )}

          {/* ── Logs ── */}
          {tab === 'logs' && (
            logs.length === 0
              ? <Empty icon={ScrollText} text="No activity logged yet today." />
              : (
                <div style={{ padding: '6px 0' }}>
                  {logs.map(l => {
                    const meta = logMeta[l.kind] || logMeta.ENTRY
                    const Icon = meta.icon
                    return (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--color-surface2)' }}>
                        <span style={{ display: 'grid', placeItems: 'center', height: 28, width: 28, flexShrink: 0, borderRadius: 8, background: 'var(--color-surface2)', color: meta.color }}>
                          <Icon size={15} />
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11.5, width: 66, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(l.at)}</span>
                        <span style={{ color: 'var(--text)', fontSize: 12.5, flex: 1 }}>
                          {l.text}
                          {l.tag && <span style={{ marginLeft: 8 }}><ProductBadge p={l.tag} /></span>}
                        </span>
                        {l.pnl != null && (
                          <span className="num" style={{ fontSize: 12.5, fontWeight: 700, color: Number(l.pnl) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                            {Number(l.pnl) >= 0 ? '+' : ''}{formatCurrency(Number(l.pnl))}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
          )}
        </div>
      </Card>
    </div>
  )
}

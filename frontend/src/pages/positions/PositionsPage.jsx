import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Download,
  Layers,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Table2,
  Wallet,
} from 'lucide-react'
import {
  closeOrder,
  getAccount,
  getOrders,
  getPositions,
  getTradebook,
} from '../../api/trading'
import { getRules, getTodayViolations } from '../../api/discipline'
import { listStrategies, squareOff } from '../../api/strategy'
import { useToast } from '../../components/common/Toast'
import useMarketStore from '../../store/marketStore'
import usePreferencesStore from '../../store/preferencesStore'
import useTradingStore from '../../store/tradingStore'
import { livePnl, ltpFromChain } from '../../utils/livePnl'
import './PositionsPage.css'

const TABS = [
  { key: 'positions', label: 'Live Positions' },
  { key: 'tradebook', label: 'Position Book' },
  { key: 'orderbook', label: 'Orderbook' },
  { key: 'logs', label: 'Logs' },
]

const LOG_META = {
  ENTRY: { icon: LogIn, color: 'var(--primary)' },
  CLOSED: { icon: LogOut, color: 'var(--text-sub)' },
  TARGET_HIT: { icon: ArrowUpRight, color: 'var(--gain)' },
  SL_HIT: { icon: ArrowDownRight, color: 'var(--loss)' },
  CANCELLED: { icon: LogOut, color: 'var(--text-muted)' },
  BLOCKED: { icon: Ban, color: 'var(--loss)' },
}

const asNumber = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const money = (value, digits = 2) => `₹${Math.abs(asNumber(value)).toLocaleString('en-IN', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
})}`

const signedMoney = (value, digits = 2) => {
  const number = asNumber(value)
  return `${number >= 0 ? '+' : '-'}${money(number, digits)}`
}

const percent = value => `${asNumber(value).toFixed(1).replace('.0', '')}%`

const formatTime = iso => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const formatDate = iso => {
  if (!iso) return '—'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const productLabel = product => product === 'NRML' ? 'Carry-forward' : 'Intraday'

function MetricCard({ label, value, note, flag, tone = 'default' }) {
  return (
    <article className="positions-metric-card">
      <div className="positions-metric-label">
        <span>{label}</span>
        <span>{flag}</span>
      </div>
      <strong className={`positions-metric-value ${tone}`}>{value}</strong>
      <p>{note}</p>
    </article>
  )
}

function TypeBadge({ type }) {
  return <span className={`positions-type-badge ${type === 'PE' ? 'pe' : ''}`}>{type || 'OPT'}</span>
}

function SideBadge({ side }) {
  return <span className={`positions-side-badge ${side === 'SELL' ? 'sell' : ''}`}>{side || 'BUY'}</span>
}

function StatusPill({ status = 'OPEN' }) {
  const className = status === 'OPEN'
    ? 'open'
    : status === 'TARGET_HIT'
      ? 'gain'
      : status === 'SL_HIT'
        ? 'loss'
        : ''
  return <span className={`positions-status-pill ${className}`}>{status.replaceAll('_', ' ')}</span>
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="positions-empty-state">
      <span><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

function InstrumentCell({ item }) {
  return (
    <div className="positions-instrument">
      <TypeBadge type={item.option_type} />
      <div>
        <strong>{item.instrument} {Math.round(asNumber(item.strike_price))} {item.option_type}</strong>
        <span>{formatDate(item.expiry_date)} · {productLabel(item.product_type)}</span>
      </div>
    </div>
  )
}

function StrategyCell({ strategy }) {
  const openLegs = (strategy.legs || []).filter(leg => leg.status === 'OPEN')
  return (
    <div className="positions-instrument">
      <span className="positions-type-badge strategy"><Layers size={14} /></span>
      <div>
        <strong>{strategy.name || strategy.template_id?.replaceAll('_', ' ') || `${strategy.underlying} strategy`}</strong>
        <span>{openLegs.length} open legs · {productLabel(strategy.product_type)}</span>
      </div>
    </div>
  )
}

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`

export default function PositionsPage() {
  const navigate = useNavigate()
  const { success, error: toastError } = useToast()
  const confirmClose = usePreferencesStore(state => state.prefs.confirm_close)
  const chains = useMarketStore(state => state.chains)
  const lastUpdate = useMarketStore(state => state.lastUpdate)
  const eventSeq = useTradingStore(state => state.eventSeq)

  const [tab, setTab] = useState('positions')
  const [instrumentFilter, setInstrumentFilter] = useState('ALL')
  const [productFilter, setProductFilter] = useState('ALL')
  const [positions, setPositions] = useState([])
  const [strategies, setStrategies] = useState([])
  const [orders, setOrders] = useState([])
  const [trades, setTrades] = useState([])
  const [violations, setViolations] = useState([])
  const [rules, setRules] = useState([])
  const [account, setAccount] = useState(null)
  const [positionMargin, setPositionMargin] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [closingId, setClosingId] = useState(null)

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setLoadError('')

    const safe = promise => promise
      .then(response => ({ ok: true, data: response.data }))
      .catch(error => ({ ok: false, data: null, error }))

    const [positionsResult, strategiesResult, ordersResult, tradesResult, violationsResult, accountResult, rulesResult] =
      await Promise.all([
        safe(getPositions()),
        safe(listStrategies('EXECUTED')),
        safe(getOrders(1, null, 'today')),
        safe(getTradebook(1, 'today')),
        safe(getTodayViolations()),
        safe(getAccount()),
        safe(getRules()),
      ])

    if (positionsResult.ok) {
      setPositions(positionsResult.data?.positions || [])
      setPositionMargin(asNumber(positionsResult.data?.total_margin_blocked))
    }
    if (strategiesResult.ok) setStrategies(strategiesResult.data?.strategies || [])
    if (ordersResult.ok) setOrders(ordersResult.data?.orders || [])
    if (tradesResult.ok) setTrades(tradesResult.data?.orders || [])
    if (violationsResult.ok) setViolations(Array.isArray(violationsResult.data) ? violationsResult.data : [])
    if (accountResult.ok) setAccount(accountResult.data)
    if (rulesResult.ok) setRules(Array.isArray(rulesResult.data) ? rulesResult.data : [])

    const coreFailed = !positionsResult.ok || !ordersResult.ok || !tradesResult.ok
    if (coreFailed) setLoadError('Some trading data could not be refreshed. Showing the latest available values.')
    if (!quiet) setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!eventSeq) return undefined
    const timeout = setTimeout(() => load({ quiet: true }), 300)
    return () => clearTimeout(timeout)
  }, [eventSeq, load])

  useEffect(() => {
    const interval = setInterval(() => load({ quiet: true }), 30000)
    return () => clearInterval(interval)
  }, [load])

  const orderById = useMemo(
    () => new Map(orders.map(order => [String(order.id), order])),
    [orders],
  )

  const liveForPosition = position => {
    const streamedLtp = ltpFromChain(chains[position.instrument], position.strike_price, position.option_type)
    const pnl = livePnl({
      action: position.action || 'BUY',
      entry: position.avg_entry_price,
      ltp: streamedLtp,
      lots: position.quantity,
      lotSize: position.lot_size,
    })
    return {
      ltp: streamedLtp ?? asNumber(position.current_ltp),
      pnl: pnl ?? asNumber(position.unrealized_pnl),
    }
  }

  const liveForStrategy = strategy => {
    const chain = chains[strategy.underlying]
    let unrealized = 0
    let allPriced = true
    let hasOpenLeg = false

    for (const leg of strategy.legs || []) {
      if (leg.status !== 'OPEN') continue
      hasOpenLeg = true
      const ltp = leg.instrument_type === 'FUT'
        ? (chain?.spot_price != null ? asNumber(chain.spot_price) : null)
        : ltpFromChain(chain, leg.strike_price, leg.instrument_type)
      const pnl = livePnl({
        action: leg.action,
        entry: leg.entry_price,
        ltp,
        lots: leg.lots,
        lotSize: leg.lot_size,
      })
      if (pnl == null) {
        allPriced = false
        break
      }
      unrealized += pnl
    }

    if (!hasOpenLeg || !allPriced) unrealized = asNumber(strategy.position?.unrealized_pnl)
    return unrealized + asNumber(strategy.position?.realized_pnl)
  }

  const filteredPositions = useMemo(() => positions.filter(position => (
    (instrumentFilter === 'ALL' || position.instrument === instrumentFilter)
    && (productFilter === 'ALL' || position.product_type === productFilter)
  )), [instrumentFilter, positions, productFilter])

  const filteredStrategies = useMemo(() => strategies.filter(strategy => (
    (instrumentFilter === 'ALL' || strategy.underlying === instrumentFilter)
    && (productFilter === 'ALL' || strategy.product_type === productFilter)
  )), [instrumentFilter, productFilter, strategies])

  const filterBook = useCallback(items => items.filter(item => (
    (instrumentFilter === 'ALL' || item.instrument === instrumentFilter)
    && (productFilter === 'ALL' || item.product_type === productFilter)
  )), [instrumentFilter, productFilter])

  const visibleOrders = useMemo(() => filterBook(orders), [filterBook, orders])
  const visibleTrades = useMemo(() => filterBook(trades), [filterBook, trades])

  const logs = useMemo(() => {
    const events = []
    orders.forEach(order => {
      events.push({
        id: `${order.id}-entry`,
        at: order.entry_time,
        kind: 'ENTRY',
        instrument: order.instrument,
        product: order.product_type,
        text: `${order.action} ${order.instrument} ${Math.round(asNumber(order.strike_price))} ${order.option_type} × ${order.quantity} lot${order.quantity === 1 ? '' : 's'} @ ${money(order.entry_price)}`,
      })
      if (order.status !== 'OPEN') {
        events.push({
          id: `${order.id}-exit`,
          at: order.exit_time || order.entry_time,
          kind: order.status,
          instrument: order.instrument,
          product: order.product_type,
          text: `${(order.exit_reason || order.status).replaceAll('_', ' ')} · ${order.instrument} ${Math.round(asNumber(order.strike_price))} ${order.option_type}`,
          pnl: order.pnl,
        })
      }
    })
    violations.forEach(violation => {
      events.push({
        id: `violation-${violation.id}`,
        at: violation.created_at,
        kind: 'BLOCKED',
        instrument: violation.attempted_action?.instrument,
        product: violation.attempted_action?.product_type,
        text: `Blocked by ${violation.rule_code.replaceAll('_', ' ').toLowerCase()}`,
      })
    })
    return events
      .filter(event => (
        (instrumentFilter === 'ALL' || event.instrument === instrumentFilter)
        && (productFilter === 'ALL' || event.product === productFilter)
      ))
      .sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [instrumentFilter, orders, productFilter, violations])

  const openPnl = positions.reduce((sum, position) => sum + liveForPosition(position).pnl, 0)
    + strategies.reduce((sum, strategy) => sum + liveForStrategy(strategy), 0)
  const tradebookPnl = trades.reduce((sum, trade) => sum + asNumber(trade.pnl), 0)
  const bookedPnl = account?.today_realized_pnl != null
    ? asNumber(account.today_realized_pnl)
    : tradebookPnl
  const combinedPnl = openPnl + bookedPnl
  const strategyMargin = strategies.reduce((sum, strategy) => sum + asNumber(strategy.position?.margin_blocked), 0)
  const capitalUsed = positionMargin + strategyMargin
  const initialCapital = asNumber(account?.account?.initial_balance) || asNumber(account?.account?.balance)
  const capitalUsedPct = initialCapital > 0 ? capitalUsed / initialCapital * 100 : 0

  const riskAtStop = positions.reduce((sum, position) => {
    const order = orderById.get(String(position.order_id))
    if (order?.sl_price == null) return sum
    return sum + Math.abs(asNumber(position.avg_entry_price) - asNumber(order.sl_price))
      * asNumber(position.quantity) * asNumber(position.lot_size)
  }, 0) + strategies.reduce((sum, strategy) => (
    strategy.max_loss == null ? sum : sum + Math.abs(asNumber(strategy.max_loss))
  ), 0)

  const lossRule = rules.find(rule => rule.rule_code === 'MAX_DAILY_LOSS')
  const dailyLossPct = asNumber(lossRule?.rule_value?.loss_pct) || 2
  const dailyLossLimit = initialCapital * dailyLossPct / 100
  const riskUsedPct = dailyLossLimit > 0 ? Math.min(100, riskAtStop / dailyLossLimit * 100) : 0
  const remainingBuffer = Math.max(0, dailyLossLimit - riskAtStop)
  const riskLevel = riskUsedPct >= 80 ? 'High' : riskUsedPct >= 50 ? 'Moderate' : 'Low'
  const hasOpenExposure = positions.length > 0 || strategies.length > 0
  const allProtected = hasOpenExposure
    && positions.every(position => orderById.get(String(position.order_id))?.sl_price != null)
    && strategies.every(strategy => strategy.max_loss != null)

  const winningTrades = trades.filter(trade => asNumber(trade.pnl) > 0)
  const losingTrades = trades.filter(trade => asNumber(trade.pnl) <= 0)
  const winRate = trades.length ? winningTrades.length / trades.length * 100 : 0
  const bestTrade = trades.length ? Math.max(...trades.map(trade => asNumber(trade.pnl))) : 0
  const maxDrawdown = trades.length ? Math.min(0, ...trades.map(trade => asNumber(trade.pnl))) : 0
  const rewardRiskValues = trades.map(trade => {
    const entry = asNumber(trade.entry_price)
    const risk = Math.abs(entry - asNumber(trade.sl_price))
    const reward = Math.abs(asNumber(trade.target_price) - entry)
    return risk > 0 && reward > 0 ? reward / risk : null
  }).filter(value => value != null)
  const averageRewardRisk = rewardRiskValues.length
    ? rewardRiskValues.reduce((sum, value) => sum + value, 0) / rewardRiskValues.length
    : 0
  const wsLive = lastUpdate != null && Date.now() - lastUpdate < 12000

  const counts = {
    positions: positions.length + strategies.length,
    orderbook: orders.length,
    tradebook: trades.length,
    logs: orders.length + orders.filter(order => order.status !== 'OPEN').length + violations.length,
  }

  const handleClose = async orderId => {
    if (confirmClose && !window.confirm('Exit this virtual position at the current market price?')) return
    setClosingId(orderId)
    try {
      await closeOrder(orderId)
      success('Position closed')
      await load({ quiet: true })
    } catch {
      toastError('Could not close position')
    } finally {
      setClosingId(null)
    }
  }

  const handleSquareOff = async strategyId => {
    if (confirmClose && !window.confirm('Square off every open leg in this strategy?')) return
    setClosingId(strategyId)
    try {
      await squareOff(strategyId)
      success('Strategy squared off')
      await load({ quiet: true })
    } catch {
      toastError('Could not square off strategy')
    } finally {
      setClosingId(null)
    }
  }

  const handleExport = () => {
    let headers = []
    let rows = []

    if (tab === 'positions') {
      headers = ['Instrument', 'Side', 'Quantity', 'Average price', 'LTP', 'Invested', 'Open P&L', 'Stop loss', 'Target', 'Status']
      rows = filteredPositions.map(position => {
        const live = liveForPosition(position)
        const order = orderById.get(String(position.order_id))
        return [
          `${position.instrument} ${Math.round(asNumber(position.strike_price))} ${position.option_type}`,
          position.action,
          asNumber(position.quantity) * asNumber(position.lot_size),
          asNumber(position.avg_entry_price),
          live.ltp,
          asNumber(position.avg_entry_price) * asNumber(position.quantity) * asNumber(position.lot_size),
          live.pnl,
          order?.sl_price,
          order?.target_price,
          'OPEN',
        ]
      })
    } else if (tab === 'orderbook') {
      headers = ['Time', 'Instrument', 'Side', 'Product', 'Lots', 'Entry', 'Stop loss', 'Target', 'Status']
      rows = visibleOrders.map(order => [
        formatTime(order.entry_time),
        `${order.instrument} ${Math.round(asNumber(order.strike_price))} ${order.option_type}`,
        order.action,
        order.product_type,
        order.quantity,
        order.entry_price,
        order.sl_price,
        order.target_price,
        order.status,
      ])
    } else if (tab === 'tradebook') {
      headers = ['Time', 'Instrument', 'Side', 'Lots', 'Entry', 'Exit', 'P&L', 'Reason']
      rows = visibleTrades.map(trade => [
        formatTime(trade.exit_time || trade.entry_time),
        `${trade.instrument} ${Math.round(asNumber(trade.strike_price))} ${trade.option_type}`,
        trade.action,
        trade.quantity,
        trade.entry_price,
        trade.exit_price,
        trade.pnl,
        trade.exit_reason || trade.status,
      ])
    } else {
      headers = ['Time', 'Type', 'Activity', 'P&L']
      rows = logs.map(log => [formatTime(log.at), log.kind, log.text, log.pnl])
    }

    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `strikefluency-${tab}-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const tableContent = () => {
    if (loading) {
      return (
        <div className="positions-loading">
          <RefreshCw size={18} className="sf-spin" />
          Loading your trading book…
        </div>
      )
    }

    if (tab === 'positions') {
      if (!filteredPositions.length && !filteredStrategies.length) {
        return (
          <EmptyState
            icon={Wallet}
            title="No matching open positions"
            description="Place a virtual trade or change the filters to see open exposure."
          />
        )
      }
      return (
        <div className="positions-table-scroll">
          <table className="positions-table">
            <thead>
              <tr>
                <th>Instrument</th><th>Side</th><th className="align-right">Qty</th>
                <th className="align-right">Avg Price</th><th className="align-right">LTP</th>
                <th className="align-right">Invested</th><th className="align-right">Open P&amp;L</th>
                <th>SL / Target</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStrategies.map(strategy => {
                const pnl = liveForStrategy(strategy)
                return (
                  <tr key={`strategy-${strategy.id}`}>
                    <td><StrategyCell strategy={strategy} /></td>
                    <td><span className="positions-side-badge multi">MULTI</span></td>
                    <td className="align-right num">{(strategy.legs || []).filter(leg => leg.status === 'OPEN').length}</td>
                    <td className="align-right num">{strategy.net_premium == null ? '—' : money(strategy.net_premium)}</td>
                    <td className="align-right num">—</td>
                    <td className="align-right num">{money(strategy.position?.margin_blocked, 0)}</td>
                    <td className={`align-right num pnl ${pnl >= 0 ? 'gain' : 'loss'}`}>{signedMoney(pnl)}</td>
                    <td className="positions-protection num">
                      <strong>{strategy.max_loss == null ? 'Uncapped' : money(strategy.max_loss, 0)}</strong>
                      <span>{strategy.max_profit == null ? 'Unlimited target' : `${money(strategy.max_profit, 0)} target`}</span>
                    </td>
                    <td><StatusPill /></td>
                    <td>
                      <div className="positions-row-actions">
                        <button type="button" onClick={() => navigate(`/strategy-builder?strategy=${strategy.id}`)}>Modify</button>
                        <button type="button" className="exit" disabled={closingId === strategy.id} onClick={() => handleSquareOff(strategy.id)}>
                          {closingId === strategy.id ? '…' : 'Exit'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredPositions.map(position => {
                const live = liveForPosition(position)
                const order = orderById.get(String(position.order_id))
                const contracts = asNumber(position.quantity) * asNumber(position.lot_size)
                const invested = asNumber(position.avg_entry_price) * contracts
                return (
                  <tr key={position.id}>
                    <td><InstrumentCell item={position} /></td>
                    <td><SideBadge side={position.action} /></td>
                    <td className="align-right num" title={`${position.quantity} lot${position.quantity === 1 ? '' : 's'} × ${position.lot_size}`}>{contracts}</td>
                    <td className="align-right num">{money(position.avg_entry_price)}</td>
                    <td className="align-right num">{money(live.ltp)}</td>
                    <td className="align-right num">{money(invested)}</td>
                    <td className={`align-right num pnl ${live.pnl >= 0 ? 'gain' : 'loss'}`}>{signedMoney(live.pnl)}</td>
                    <td className="positions-protection num">
                      <strong>{order?.sl_price == null ? 'No SL' : money(order.sl_price, 0)}</strong>
                      <span>{order?.target_price == null ? 'No target' : `${money(order.target_price, 0)} target`}</span>
                    </td>
                    <td><StatusPill /></td>
                    <td>
                      <div className="positions-row-actions">
                        <button type="button" onClick={() => navigate(`/trading?order=${position.order_id}`)}>Modify</button>
                        <button type="button" className="exit" disabled={closingId === position.order_id} onClick={() => handleClose(position.order_id)}>
                          {closingId === position.order_id ? '…' : 'Exit'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
    }

    if (tab === 'orderbook') {
      if (!visibleOrders.length) {
        return <EmptyState icon={Table2} title="No matching orders today" description="The orderbook resets at 08:30 IST each trading day." />
      }
      return (
        <div className="positions-table-scroll">
          <table className="positions-table book-table">
            <thead><tr>
              <th>Time</th><th>Instrument</th><th>Side</th><th>Product</th>
              <th className="align-right">Lots</th><th className="align-right">Entry</th>
              <th className="align-right">Stop Loss</th><th className="align-right">Target</th><th>Status</th>
            </tr></thead>
            <tbody>{visibleOrders.map(order => (
              <tr key={order.id}>
                <td className="num muted">{formatTime(order.entry_time)}</td>
                <td><InstrumentCell item={order} /></td>
                <td><SideBadge side={order.action} /></td>
                <td>{productLabel(order.product_type)}</td>
                <td className="align-right num">{order.quantity}</td>
                <td className="align-right num">{money(order.entry_price)}</td>
                <td className="align-right num">{order.sl_price == null ? '—' : money(order.sl_price)}</td>
                <td className="align-right num">{order.target_price == null ? '—' : money(order.target_price)}</td>
                <td><StatusPill status={order.status} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )
    }

    if (tab === 'tradebook') {
      if (!visibleTrades.length) {
        return <EmptyState icon={Wallet} title="No closed positions today" description="Completed trades will appear here with their realized result." />
      }
      return (
        <div className="positions-table-scroll">
          <table className="positions-table book-table">
            <thead><tr>
              <th>Exit Time</th><th>Instrument</th><th>Side</th><th className="align-right">Lots</th>
              <th className="align-right">Entry</th><th className="align-right">Exit</th>
              <th className="align-right">Booked P&amp;L</th><th>Reason</th>
            </tr></thead>
            <tbody>{visibleTrades.map(trade => {
              const pnl = asNumber(trade.pnl)
              return (
                <tr key={trade.id}>
                  <td className="num muted">{formatTime(trade.exit_time || trade.entry_time)}</td>
                  <td><InstrumentCell item={trade} /></td>
                  <td><SideBadge side={trade.action} /></td>
                  <td className="align-right num">{trade.quantity}</td>
                  <td className="align-right num">{money(trade.entry_price)}</td>
                  <td className="align-right num">{trade.exit_price == null ? '—' : money(trade.exit_price)}</td>
                  <td className={`align-right num pnl ${pnl >= 0 ? 'gain' : 'loss'}`}>{signedMoney(pnl)}</td>
                  <td><StatusPill status={trade.status} /></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )
    }

    if (!logs.length) {
      return <EmptyState icon={ScrollText} title="No activity logged today" description="Orders, exits, and blocked discipline events will appear here." />
    }
    return (
      <div className="positions-log-list">
        {logs.map(log => {
          const meta = LOG_META[log.kind] || LOG_META.ENTRY
          const Icon = meta.icon
          return (
            <div className="positions-log-row" key={log.id}>
              <span className="positions-log-icon" style={{ color: meta.color }}><Icon size={15} /></span>
              <time className="num">{formatTime(log.at)}</time>
              <div>
                <strong>{log.kind.replaceAll('_', ' ')}</strong>
                <p>{log.text}</p>
              </div>
              {log.pnl != null && <span className={`num pnl ${asNumber(log.pnl) >= 0 ? 'gain' : 'loss'}`}>{signedMoney(log.pnl)}</span>}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="positions-page">
      <section className="positions-page-heading">
        <div>
          <h1>Positions &amp; Position Book</h1>
          <p>Track live exposure, review executed trades, and manage every position from one clean workspace.</p>
        </div>
        <div className="positions-page-actions">
          <button type="button" className="positions-secondary-button" onClick={handleExport}>
            <Download size={14} /> Export CSV
          </button>
          <button type="button" className="positions-primary-button" onClick={() => navigate('/trading')}>
            <Plus size={15} /> New Virtual Trade
          </button>
        </div>
      </section>

      <section className="positions-metric-grid" aria-label="Position summary">
        <MetricCard
          label="Open P&L"
          flag={wsLive ? 'Live' : 'Last price'}
          value={signedMoney(openPnl)}
          note={`${openPnl >= 0 ? '+' : ''}${percent(capitalUsed > 0 ? openPnl / capitalUsed * 100 : 0)} on deployed capital`}
          tone={openPnl >= 0 ? 'gain' : 'loss'}
        />
        <MetricCard
          label="Booked P&L"
          flag="Today"
          value={signedMoney(bookedPnl)}
          note={`${trades.length} closed trade${trades.length === 1 ? '' : 's'} · ${percent(winRate)} win rate`}
          tone={bookedPnl >= 0 ? 'default' : 'loss'}
        />
        <MetricCard
          label="Capital Used"
          flag={percent(capitalUsedPct)}
          value={money(capitalUsed, 0)}
          note={`of ${money(initialCapital, 0)} virtual capital`}
        />
        <MetricCard
          label="Risk at Stop"
          flag={!hasOpenExposure ? 'No exposure' : allProtected ? 'Protected' : 'Review'}
          value={money(riskAtStop, 0)}
          note={`${percent(initialCapital > 0 ? riskAtStop / initialCapital * 100 : 0)} of total account`}
          tone={riskAtStop > dailyLossLimit && dailyLossLimit > 0 ? 'loss' : 'risk'}
        />
      </section>

      {loadError && (
        <div className="positions-error-banner">
          <span>{loadError}</span>
          <button type="button" onClick={() => load()}>Try again</button>
        </div>
      )}

      <section className="positions-workspace">
        <article className="positions-book-card">
          <header className="positions-book-header">
            <div>
              <h2>Trading Book</h2>
              <p>Live positions, orders, completed trades, and activity records</p>
            </div>
            <div className="positions-tabs" role="tablist" aria-label="Trading book views">
              {TABS.map(item => (
                <button
                  type="button"
                  key={item.key}
                  className={tab === item.key ? 'active' : ''}
                  onClick={() => setTab(item.key)}
                  role="tab"
                  aria-selected={tab === item.key}
                >
                  {item.label} <span>({counts[item.key]})</span>
                </button>
              ))}
            </div>
          </header>

          <div className="positions-book-controls">
            <div className="positions-filters">
              <label>
                <span className="sr-only">Instrument</span>
                <select value={instrumentFilter} onChange={event => setInstrumentFilter(event.target.value)}>
                  <option value="ALL">All Instruments</option>
                  <option value="NIFTY">NIFTY</option>
                  <option value="BANKNIFTY">BANKNIFTY</option>
                  <option value="SENSEX">SENSEX</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Product</span>
                <select value={productFilter} onChange={event => setProductFilter(event.target.value)}>
                  <option value="ALL">All Products</option>
                  <option value="INTRADAY">Intraday</option>
                  <option value="NRML">Carry-forward</option>
                </select>
              </label>
              <span className="positions-today-filter">Today</span>
            </div>
            <button type="button" className="positions-refresh-button" disabled={loading} onClick={() => load()}>
              <RefreshCw size={13} className={loading ? 'sf-spin' : ''} /> Refresh
            </button>
          </div>

          <div className="positions-book-content">{tableContent()}</div>
        </article>

        <aside className="positions-insights">
          <article className="positions-insight-card">
            <header>
              <div>
                <h2>Today&apos;s Performance</h2>
                <p>Live account snapshot</p>
              </div>
              <span className={`positions-track-pill ${combinedPnl < -dailyLossLimit * 0.8 ? 'off-track' : ''}`}>
                {combinedPnl < -dailyLossLimit * 0.8 ? 'AT RISK' : 'ON TRACK'}
              </span>
            </header>
            <div className="positions-combined-pnl">
              <span>Combined P&amp;L</span>
              <strong className={combinedPnl >= 0 ? 'gain' : 'loss'}>{signedMoney(combinedPnl)}</strong>
              <p>Booked + open profit</p>
            </div>
            <dl className="positions-insight-list">
              <div><dt>Wins / Losses</dt><dd>{winningTrades.length} / {losingTrades.length}</dd></div>
              <div><dt>Average R:R</dt><dd>{averageRewardRisk > 0 ? `1 : ${averageRewardRisk.toFixed(2)}` : '—'}</dd></div>
              <div><dt>Best trade</dt><dd className={bestTrade >= 0 ? 'gain' : 'loss'}>{signedMoney(bestTrade, 0)}</dd></div>
              <div><dt>Max drawdown</dt><dd className="loss">{signedMoney(maxDrawdown, 0)}</dd></div>
            </dl>
          </article>

          <article className="positions-insight-card risk-card">
            <header>
              <div>
                <h2>Risk Monitor</h2>
                <p>Based on current open positions</p>
              </div>
              <strong className={`positions-risk-level ${riskLevel.toLowerCase()}`}>{riskLevel}</strong>
            </header>
            <dl className="positions-insight-list">
              <div><dt>Risk used</dt><dd>{percent(riskUsedPct)}</dd></div>
            </dl>
            <div className="positions-risk-track" aria-label={`${percent(riskUsedPct)} of daily risk used`}>
              <span style={{ width: `${riskUsedPct}%` }} />
            </div>
            <dl className="positions-insight-list">
              <div><dt>Daily loss limit</dt><dd>{money(dailyLossLimit, 0)}</dd></div>
              <div><dt>Remaining buffer</dt><dd className={remainingBuffer > 0 ? 'gain' : 'loss'}>{money(remainingBuffer, 0)}</dd></div>
            </dl>
            <div className="positions-risk-note">
              <ShieldCheck size={15} />
              <span>
                {!hasOpenExposure
                  ? 'No open positions are using the daily risk buffer.'
                  : allProtected
                    ? 'Every open position has defined protection.'
                    : 'One or more positions need stop-loss protection.'}
              </span>
            </div>
          </article>
        </aside>
      </section>
    </div>
  )
}

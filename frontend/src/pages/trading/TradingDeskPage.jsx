import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, AlertTriangle, Ban, LogIn, LogOut, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { getOptionChain } from '../../api/market'
import { closeOrder, getOrders, getPositions, getTradebook } from '../../api/trading'
import { getTodayViolations } from '../../api/discipline'
import OptionChainWorkspace from '../../components/optionchain/OptionChainWorkspace'
import PositionsWorkspace from '../../components/positions/PositionsWorkspace'
import DisciplineModeToggle from '../../components/discipline/DisciplineModeToggle'
import { useToast } from '../../components/common/Toast'
import useDiscipline from '../../hooks/useDiscipline'
import useVirtualTrading from '../../hooks/useVirtualTrading'
import useMarketStore from '../../store/marketStore'
import usePreferencesStore from '../../store/preferencesStore'
import useTradingStore from '../../store/tradingStore'
import { livePnl, ltpFromChain } from '../../utils/livePnl'
import './TradingDeskPage.css'

const BOOK_TABS = [
  { key: 'positions', label: 'Open Positions' },
  { key: 'tradebook', label: 'Position Book' },
  { key: 'orderbook', label: 'Orderbook' },
  { key: 'activity', label: 'Activity' },
]
const VIEWS = [
  { key: 'trade', label: 'Trade', icon: Activity },
  { key: 'positions', label: 'Positions', icon: Wallet },
]

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

const formatTime = iso => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function StatTile({ label, flag, value, note, tone = 'default', accent = false }) {
  return (
    <article className={`trade-stat-tile${accent ? ' accent' : ''}`}>
      <div className="trade-stat-head">
        <span>{label}</span>
        {flag && <span className="trade-stat-flag">{flag}</span>}
      </div>
      <strong className={`trade-stat-value num ${tone}`}>{value}</strong>
      <p>{note}</p>
    </article>
  )
}

function SideBadge({ side }) {
  return <span className={`trade-side-badge ${side === 'SELL' ? 'sell' : ''}`}>{side || 'BUY'}</span>
}

function StatusBadge({ status = 'OPEN' }) {
  const tone = status === 'TARGET_HIT' ? 'gain' : status === 'SL_HIT' ? 'loss' : status === 'OPEN' ? 'open' : ''
  return <span className={`trade-status-badge ${tone}`}>{status.replaceAll('_', ' ')}</span>
}

function EmptyBook({ title, description }) {
  return (
    <div className="trade-book-empty">
      <span><Wallet size={18} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

function PositionRow({ position, chains, confirmClose, onClose }) {
  const [closing, setClosing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const streamLtp = ltpFromChain(chains?.[position.instrument], position.strike_price, position.option_type)
  const calculatedPnl = livePnl({
    action: position.action || 'BUY',
    entry: position.avg_entry_price,
    ltp: streamLtp,
    lots: position.quantity,
    lotSize: position.lot_size,
  })
  const shownLtp = streamLtp ?? asNumber(position.current_ltp)
  const pnl = calculatedPnl ?? asNumber(position.unrealized_pnl)
  const contracts = asNumber(position.quantity) * asNumber(position.lot_size)

  const handleExit = async () => {
    if (confirmClose && !confirming) {
      setConfirming(true)
      return
    }
    setClosing(true)
    try {
      await onClose(position.order_id || position.id)
    } finally {
      setClosing(false)
      setConfirming(false)
    }
  }

  return (
    <tr>
      <td>
        <div className="trade-contract-cell">
          <span className={`trade-option-badge ${position.option_type === 'PE' ? 'pe' : ''}`}>{position.option_type}</span>
          <div>
            <strong>{position.instrument} {Math.round(asNumber(position.strike_price))} {position.option_type}</strong>
            <span>{position.product_type === 'NRML' ? 'Carry-forward' : 'Intraday'} · {position.expiry_date}</span>
          </div>
        </div>
      </td>
      <td><SideBadge side={position.action} /></td>
      <td className="num align-right">{contracts}</td>
      <td className="num align-right">{money(position.avg_entry_price)}</td>
      <td className="num align-right">{money(shownLtp)}</td>
      <td className={`num align-right trade-pnl ${pnl >= 0 ? 'gain' : 'loss'}`}>{signedMoney(pnl)}</td>
      <td className="align-right">
        <button
          type="button"
          className="trade-exit-button"
          disabled={closing}
          onBlur={() => setConfirming(false)}
          onClick={handleExit}
        >
          {closing ? 'Closing…' : confirming ? 'Confirm?' : 'Exit'}
        </button>
      </td>
    </tr>
  )
}

export default function TradingDeskPage() {
  const prefs = usePreferencesStore(state => state.prefs)
  const account = useTradingStore(state => state.account)
  const eventSeq = useTradingStore(state => state.eventSeq)
  const allChains = useMarketStore(state => state.chains)
  const lastUpdate = useMarketStore(state => state.lastUpdate)
  const { loadAccount } = useVirtualTrading()
  const { mode, loadMode } = useDiscipline()
  const { success, error: toastError } = useToast()

  // The desk hosts two views. Keeping the active one in the URL means
  // /trading?view=positions deep-links (and survives a reload) exactly the way
  // the standalone /positions route does.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'positions' ? 'positions' : 'trade'

  // The chain desk owns the instrument selector now; the desk only mirrors it so
  // it can keep the market store seeded for open-position marks.
  const [instrument, setInstrument] = useState(prefs.default_instrument || 'NIFTY')
  const [positions, setPositions] = useState([])
  const [marginBlocked, setMarginBlocked] = useState(0)
  const [orders, setOrders] = useState([])
  const [trades, setTrades] = useState([])
  const [violations, setViolations] = useState([])
  const [bookTab, setBookTab] = useState('positions')
  const [bookLoading, setBookLoading] = useState(true)

  const disciplineOff = mode?.enabled === false

  const changeView = next => {
    const params = new URLSearchParams(searchParams)
    if (next === 'positions') params.set('view', 'positions')
    else params.delete('view')
    setSearchParams(params, { replace: true })
  }

  const loadTradingData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setBookLoading(true)
    const safe = promise => promise.then(response => response.data).catch(() => null)
    const [positionData, orderData, tradeData, violationData] = await Promise.all([
      safe(getPositions()),
      safe(getOrders(1, null, 'today')),
      safe(getTradebook(1, 'today')),
      safe(getTodayViolations()),
    ])
    if (positionData) {
      setPositions(positionData.positions || positionData || [])
      setMarginBlocked(asNumber(positionData.total_margin_blocked))
    }
    if (orderData) setOrders(orderData.orders || [])
    if (tradeData) setTrades(tradeData.orders || [])
    if (Array.isArray(violationData)) setViolations(violationData)
    if (!quiet) setBookLoading(false)
  }, [])

  useEffect(() => {
    loadAccount()
    loadTradingData()
    loadMode()
  }, [])

  useEffect(() => {
    if (!eventSeq) return undefined
    const timeout = setTimeout(() => {
      loadAccount()
      loadTradingData({ quiet: true })
    }, 300)
    return () => clearTimeout(timeout)
  }, [eventSeq, loadTradingData])

  // Seed the market store for the visible instrument so open-position marks have
  // a price before the first WebSocket chain frame lands.
  useEffect(() => {
    getOptionChain(instrument)
      .then(response => useMarketStore.getState().setOptionChain(response.data?.data ?? response.data))
      .catch(() => {})
  }, [instrument])

  const openPositions = positions.filter(position => position.is_open || position.status === 'OPEN')

  const markPosition = position => {
    const streamLtp = ltpFromChain(allChains?.[position.instrument], position.strike_price, position.option_type)
    return livePnl({
      action: position.action || 'BUY',
      entry: position.avg_entry_price,
      ltp: streamLtp,
      lots: position.quantity,
      lotSize: position.lot_size,
    }) ?? asNumber(position.unrealized_pnl)
  }

  const openPnl = openPositions.reduce((sum, position) => sum + markPosition(position), 0)
  const tradebookPnl = trades.reduce((sum, trade) => sum + asNumber(trade.pnl), 0)
  const bookedPnl = account?.today_realized_pnl != null ? asNumber(account.today_realized_pnl) : tradebookPnl
  const winners = trades.filter(trade => asNumber(trade.pnl) > 0).length
  const winRate = trades.length ? winners / trades.length * 100 : 0
  const balance = asNumber(account?.account?.balance)
  const initialCapital = asNumber(account?.account?.initial_balance) || balance
  const disciplineScore = asNumber(account?.account?.discipline_score)
  const disciplineStreak = asNumber(account?.account?.consecutive_disciplined_trades)
  const chainLive = lastUpdate != null && Date.now() - lastUpdate < 12000

  const activity = useMemo(() => {
    const rows = orders.map(order => ({
      id: `order-${order.id}`,
      at: order.entry_time,
      type: 'ORDER',
      icon: LogIn,
      text: `${order.action} ${order.instrument} ${Math.round(asNumber(order.strike_price))} ${order.option_type} · ${order.quantity} lot${order.quantity === 1 ? '' : 's'}`,
      tone: order.action === 'BUY' ? 'gain' : 'loss',
    }))
    orders.filter(order => order.status !== 'OPEN').forEach(order => rows.push({
      id: `exit-${order.id}`,
      at: order.exit_time || order.entry_time,
      type: order.status,
      icon: LogOut,
      text: `${order.instrument} ${Math.round(asNumber(order.strike_price))} ${order.option_type} · ${(order.exit_reason || order.status).replaceAll('_', ' ')}`,
      pnl: order.pnl,
      tone: asNumber(order.pnl) >= 0 ? 'gain' : 'loss',
    }))
    violations.forEach(violation => rows.push({
      id: `violation-${violation.id}`,
      at: violation.created_at,
      type: 'BLOCKED',
      icon: Ban,
      text: violation.rule_code.replaceAll('_', ' '),
      tone: 'loss',
    }))
    return rows.sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [orders, violations])

  const counts = {
    positions: openPositions.length,
    tradebook: trades.length,
    orderbook: orders.length,
    activity: activity.length,
  }

  const handleClose = async orderId => {
    try {
      await closeOrder(orderId)
      success('Paper position closed')
      await Promise.all([loadAccount(), loadTradingData({ quiet: true })])
    } catch {
      toastError('Could not close position')
    }
  }

  const refreshAfterOrder = async () => {
    await Promise.all([loadAccount(), loadTradingData({ quiet: true })])
  }

  const renderBook = () => {
    if (bookLoading) {
      return (
        <div className="trade-book-loading">
          <RefreshCw size={15} className="sf-spin" /> Refreshing trading books…
        </div>
      )
    }

    if (bookTab === 'positions') {
      if (!openPositions.length) {
        return <EmptyBook title="No open positions" description="Hover a strike in the chain above and hit B or S to open a paper trade." />
      }
      return (
        <div className="trade-book-scroll">
          <table className="trade-book-table">
            <thead><tr>
              <th>Position</th><th>Side</th><th className="align-right">Qty</th>
              <th className="align-right">Entry</th><th className="align-right">Current</th>
              <th className="align-right">Open P&amp;L</th><th className="align-right">Action</th>
            </tr></thead>
            <tbody>{openPositions.map(position => (
              <PositionRow
                key={position.id}
                position={position}
                chains={allChains}
                confirmClose={prefs.confirm_close}
                onClose={handleClose}
              />
            ))}</tbody>
          </table>
        </div>
      )
    }

    if (bookTab === 'tradebook') {
      if (!trades.length) return <EmptyBook title="No completed positions today" description="Closed trades will appear here with their realized result." />
      return (
        <div className="trade-book-scroll">
          <table className="trade-book-table">
            <thead><tr>
              <th>Time</th><th>Contract</th><th>Side</th><th className="align-right">Entry</th>
              <th className="align-right">Exit</th><th className="align-right">Booked P&amp;L</th><th>Status</th>
            </tr></thead>
            <tbody>{trades.map(trade => {
              const pnl = asNumber(trade.pnl)
              return (
                <tr key={trade.id}>
                  <td className="num muted">{formatTime(trade.exit_time || trade.entry_time)}</td>
                  <td><strong>{trade.instrument} {Math.round(asNumber(trade.strike_price))} {trade.option_type}</strong></td>
                  <td><SideBadge side={trade.action} /></td>
                  <td className="num align-right">{money(trade.entry_price)}</td>
                  <td className="num align-right">{trade.exit_price == null ? '—' : money(trade.exit_price)}</td>
                  <td className={`num align-right trade-pnl ${pnl >= 0 ? 'gain' : 'loss'}`}>{signedMoney(pnl)}</td>
                  <td><StatusBadge status={trade.status} /></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )
    }

    if (bookTab === 'orderbook') {
      if (!orders.length) return <EmptyBook title="No orders today" description="Accepted and completed virtual orders will appear here." />
      return (
        <div className="trade-book-scroll">
          <table className="trade-book-table">
            <thead><tr>
              <th>Time</th><th>Contract</th><th>Side</th><th>Product</th>
              <th className="align-right">Lots</th><th className="align-right">Entry</th>
              <th className="align-right">SL / Target</th><th>Status</th>
            </tr></thead>
            <tbody>{orders.map(order => (
              <tr key={order.id}>
                <td className="num muted">{formatTime(order.entry_time)}</td>
                <td><strong>{order.instrument} {Math.round(asNumber(order.strike_price))} {order.option_type}</strong></td>
                <td><SideBadge side={order.action} /></td>
                <td>{order.product_type === 'NRML' ? 'Carry' : 'Intraday'}</td>
                <td className="num align-right">{order.quantity}</td>
                <td className="num align-right">{money(order.entry_price)}</td>
                <td className="num align-right">{order.sl_price == null ? '—' : `${money(order.sl_price, 0)} / ${order.target_price == null ? '—' : money(order.target_price, 0)}`}</td>
                <td><StatusBadge status={order.status} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )
    }

    if (!activity.length) return <EmptyBook title="No activity yet" description="Orders, exits, and discipline events will appear here." />
    return (
      <div className="trade-activity-list">
        {activity.map(item => {
          const Icon = item.icon
          return (
            <div className="trade-activity-row" key={item.id}>
              <span className={item.tone}><Icon size={14} /></span>
              <time className="num">{formatTime(item.at)}</time>
              <div><strong>{item.type.replaceAll('_', ' ')}</strong><p>{item.text}</p></div>
              {item.pnl != null && <b className={`num ${item.tone}`}>{signedMoney(item.pnl)}</b>}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="trading-desk-page">
      {/* The top bar already carries the page title, so the desk head is pure
          control surface: which view is showing, and the discipline switch. */}
      <header className="trade-page-head">
        <div className="trade-view-switch" role="tablist" aria-label="Desk view">
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              role="tab"
              key={key}
              aria-selected={view === key}
              className={view === key ? 'active' : ''}
              onClick={() => changeView(key)}
            >
              <Icon size={15} strokeWidth={2} />
              {label}
              {key === 'positions' && counts.positions > 0 && <span>{counts.positions}</span>}
            </button>
          ))}
        </div>
        <DisciplineModeToggle variant="compact" onChange={loadMode} />
      </header>

      {disciplineOff && (
        <div className="trade-free-play-banner">
          <AlertTriangle size={15} />
          Discipline Mode is off. Rules are bypassed, full virtual capital is unlocked, and these trades do not affect your discipline score.
        </div>
      )}

      {view === 'positions' ? (
        <PositionsWorkspace embedded onNewTrade={() => changeView('trade')} />
      ) : (
        <>
          <section className="trade-stat-rail" aria-label="Desk summary">
            <StatTile
              accent
              label="Discipline Score"
              flag={disciplineOff ? 'Paused' : <><ShieldCheck size={11} /> Active</>}
              value={account ? disciplineScore.toFixed(0) : '—'}
              note={`${disciplineStreak} disciplined trade${disciplineStreak === 1 ? '' : 's'} in a row`}
            />
            <StatTile
              label="Open P&L"
              flag={chainLive ? 'Live' : 'Last price'}
              value={signedMoney(openPnl, 0)}
              note={`${openPositions.length} open position${openPositions.length === 1 ? '' : 's'} · ${money(marginBlocked, 0)} margin`}
              tone={openPnl >= 0 ? 'gain' : 'loss'}
            />
            <StatTile
              label="Booked P&L"
              flag="Today"
              value={signedMoney(bookedPnl, 0)}
              note={`${trades.length} closed trade${trades.length === 1 ? '' : 's'} · ${winRate.toFixed(0)}% win rate`}
              tone={bookedPnl >= 0 ? 'default' : 'loss'}
            />
            <StatTile
              label="Available Capital"
              flag="Virtual"
              value={money(balance, 0)}
              note={`of ${money(initialCapital, 0)} sandbox capital`}
            />
          </section>

          {/* The full option-chain desk — instrument, expiry, market stats and
              the chain itself. Buy/Sell on a strike opens the floating ticket. */}
          <OptionChainWorkspace
            onInstrumentChange={setInstrument}
            onOrderPlaced={refreshAfterOrder}
          />

          <section className="trade-books-card">
            <header className="trade-books-header">
              <div className="trade-book-tabs" role="tablist" aria-label="Trading books">
                {BOOK_TABS.map(item => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={bookTab === item.key}
                    className={bookTab === item.key ? 'active' : ''}
                    key={item.key}
                    onClick={() => setBookTab(item.key)}
                  >
                    {item.label} <span>{counts[item.key]}</span>
                  </button>
                ))}
              </div>
              <div className="trade-book-summary">
                <div><span>Open P&amp;L</span><strong className={openPnl >= 0 ? 'gain' : 'loss'}>{signedMoney(openPnl, 0)}</strong></div>
                <div><span>Booked P&amp;L</span><strong className={bookedPnl >= 0 ? 'gain' : 'loss'}>{signedMoney(bookedPnl, 0)}</strong></div>
                <div><span>Win Rate</span><strong>{winRate.toFixed(1)}%</strong></div>
                <button type="button" className="trade-books-link" onClick={() => changeView('positions')}>
                  Full positions view
                </button>
              </div>
            </header>
            <div className="trade-book-content">{renderBook()}</div>
          </section>
        </>
      )}
    </div>
  )
}

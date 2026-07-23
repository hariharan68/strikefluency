import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Ban, LogIn, LogOut, RefreshCw, Wallet } from 'lucide-react'
import { getOptionChain } from '../../api/market'
import { closeOrder, getOrders, getPositions, getTradebook } from '../../api/trading'
import { getTodayViolations } from '../../api/discipline'
import OptionChainTable from '../../components/trading/OptionChainTable'
import OrderFormPanel from '../../components/trading/OrderFormPanel'
import DisciplineModeToggle from '../../components/discipline/DisciplineModeToggle'
import { useToast } from '../../components/common/Toast'
import useDiscipline from '../../hooks/useDiscipline'
import useVirtualTrading from '../../hooks/useVirtualTrading'
import useMarketStore from '../../store/marketStore'
import usePreferencesStore from '../../store/preferencesStore'
import useTradingStore from '../../store/tradingStore'
import { livePnl, ltpFromChain } from '../../utils/livePnl'
import './TradingDeskPage.css'

const INSTRUMENTS = ['NIFTY', 'BANKNIFTY', 'SENSEX']
const WINDOWS = [5, 10, 15, 'All']
const BOOK_TABS = [
  { key: 'positions', label: 'Open Positions' },
  { key: 'tradebook', label: 'Position Book' },
  { key: 'orderbook', label: 'Orderbook' },
  { key: 'activity', label: 'Activity' },
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
  const { loadAccount } = useVirtualTrading()
  const { mode, loadMode } = useDiscipline()
  const { success, error: toastError } = useToast()

  const [instrument, setInstrument] = useState(prefs.default_instrument || 'NIFTY')
  const [strikeCount, setStrikeCount] = useState(5)
  const [prefill, setPrefill] = useState(null)
  const [chainLoading, setChainLoading] = useState(false)
  const [positions, setPositions] = useState([])
  const [orders, setOrders] = useState([])
  const [trades, setTrades] = useState([])
  const [violations, setViolations] = useState([])
  const [bookTab, setBookTab] = useState('positions')
  const [bookLoading, setBookLoading] = useState(true)
  const pickedInstrument = useRef(false)

  const optionChain = useMarketStore(state => state.chains[instrument]) || null
  const disciplineOff = mode?.enabled === false

  useEffect(() => {
    if (!pickedInstrument.current) setInstrument(prefs.default_instrument || 'NIFTY')
  }, [prefs.default_instrument])

  const pickInstrument = value => {
    pickedInstrument.current = true
    setInstrument(value)
  }

  const viewChain = useMemo(() => {
    const strikes = optionChain?.strikes
    if (!strikes?.length || strikeCount === 'All') return optionChain
    const atm = optionChain.atm_strike
    const atmIndex = strikes.reduce(
      (best, row, index) => Math.abs(row.strike - atm) < Math.abs(strikes[best].strike - atm) ? index : best,
      0,
    )
    return {
      ...optionChain,
      strikes: strikes.slice(
        Math.max(0, atmIndex - strikeCount),
        Math.min(strikes.length, atmIndex + strikeCount + 1),
      ),
    }
  }, [optionChain, strikeCount])

  const loadTradingData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setBookLoading(true)
    const safe = promise => promise.then(response => response.data).catch(() => null)
    const [positionData, orderData, tradeData, violationData] = await Promise.all([
      safe(getPositions()),
      safe(getOrders(1, null, 'today')),
      safe(getTradebook(1, 'today')),
      safe(getTodayViolations()),
    ])
    if (positionData) setPositions(positionData.positions || positionData || [])
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

  useEffect(() => {
    setChainLoading(true)
    setPrefill(null)
    getOptionChain(instrument)
      .then(response => useMarketStore.getState().setOptionChain(response.data?.data ?? response.data))
      .catch(() => {})
      .finally(() => setChainLoading(false))
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
      success('Position closed')
      await Promise.all([loadAccount(), loadTradingData({ quiet: true })])
    } catch {
      toastError('Could not close position')
    }
  }

  const refreshAfterOrder = async () => {
    setPrefill(null)
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
        return <EmptyBook title="No open positions" description="Tap an option-chain LTP and place a virtual order to begin." />
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
      <section className="trade-instrument-bar">
        <div className="trade-instrument-tabs" role="tablist" aria-label="Underlying instrument">
          {INSTRUMENTS.map(item => (
            <button
              type="button"
              role="tab"
              aria-selected={instrument === item}
              className={instrument === item ? 'active' : ''}
              key={item}
              onClick={() => pickInstrument(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="trade-status-strip">
          <span>Open P&amp;L:</span>
          <strong className={`num ${openPnl >= 0 ? 'gain' : 'loss'}`}>{signedMoney(openPnl)}</strong>
          <DisciplineModeToggle variant="compact" onChange={loadMode} />
        </div>
      </section>

      {disciplineOff && (
        <div className="trade-free-play-banner">
          <AlertTriangle size={15} />
          Discipline Mode is off. Rules are bypassed, full virtual capital is unlocked, and these trades do not affect your discipline score.
        </div>
      )}

      <section className="trade-execution-grid">
        <article className="trade-chain-card">
          <header className="trade-panel-header">
            <div>
              <h2>Option Chain — {instrument}</h2>
              <p>Tap any LTP to prefill the order ticket</p>
            </div>
            <div className="trade-window-control">
              <span>Strikes ±ATM</span>
              {WINDOWS.map(window => (
                <button
                  type="button"
                  key={window}
                  className={strikeCount === window ? 'active' : ''}
                  onClick={() => setStrikeCount(window)}
                >
                  {window === 'All' ? 'All' : `±${window}`}
                </button>
              ))}
            </div>
          </header>
          <OptionChainTable
            data={viewChain}
            instrument={instrument}
            loading={chainLoading && !optionChain}
            onCellClick={(strike, optionType, ltp) => setPrefill({
              strike,
              optionType,
              ltp: prefs.auto_fill_ltp ? ltp : null,
              expiry: optionChain?.expiry,
              lotSize: optionChain?.lot_size,
            })}
          />
        </article>

        <aside className="trade-order-card">
          <header className="trade-panel-header quick-order-header">
            <h2>Quick Order</h2>
            <span>Virtual</span>
          </header>
          <div className="trade-order-body">
            <OrderFormPanel
              prefill={prefill}
              instrument={instrument}
              disciplineOff={disciplineOff}
              prefs={prefs}
              chainExpiry={optionChain?.expiry}
              chainLotSize={optionChain?.lot_size}
              onSuccess={refreshAfterOrder}
            />
          </div>
        </aside>
      </section>

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
          </div>
        </header>
        <div className="trade-book-content">{renderBook()}</div>
      </section>
    </div>
  )
}

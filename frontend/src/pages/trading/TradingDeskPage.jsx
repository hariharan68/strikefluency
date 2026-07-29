import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, AlertTriangle, ShieldCheck, Wallet } from 'lucide-react'
import { getOptionChain } from '../../api/market'
import { getPositions, getTradebook } from '../../api/trading'
import OptionChainWorkspace from '../../components/optionchain/OptionChainWorkspace'
import PositionsWorkspace from '../../components/positions/PositionsWorkspace'
import DisciplineModeToggle from '../../components/discipline/DisciplineModeToggle'
import useDiscipline from '../../hooks/useDiscipline'
import useVirtualTrading from '../../hooks/useVirtualTrading'
import useMarketStore from '../../store/marketStore'
import usePreferencesStore from '../../store/preferencesStore'
import useTradingStore from '../../store/tradingStore'
import { livePnl, ltpFromChain } from '../../utils/livePnl'
import './TradingDeskPage.css'

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

export default function TradingDeskPage() {
  const prefs = usePreferencesStore(state => state.prefs)
  const account = useTradingStore(state => state.account)
  const eventSeq = useTradingStore(state => state.eventSeq)
  const allChains = useMarketStore(state => state.chains)
  const lastUpdate = useMarketStore(state => state.lastUpdate)
  const { loadAccount } = useVirtualTrading()
  const { mode, loadMode } = useDiscipline()

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
  const [trades, setTrades] = useState([])

  const disciplineOff = mode?.enabled === false

  const changeView = next => {
    const params = new URLSearchParams(searchParams)
    if (next === 'positions') params.set('view', 'positions')
    else params.delete('view')
    setSearchParams(params, { replace: true })
  }

  const loadTradingData = useCallback(async () => {
    const safe = promise => promise.then(response => response.data).catch(() => null)
    const [positionData, tradeData] = await Promise.all([
      safe(getPositions()),
      safe(getTradebook(1, 'today')),
    ])
    if (positionData) {
      setPositions(positionData.positions || positionData || [])
      setMarginBlocked(asNumber(positionData.total_margin_blocked))
    }
    if (tradeData) setTrades(tradeData.orders || [])
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
      loadTradingData()
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
  const completedTrades = trades.filter(trade => trade.status !== 'OPEN')
  const tradebookPnl = completedTrades.reduce((sum, trade) => sum + asNumber(trade.pnl), 0)
  const bookedPnl = account?.today_realized_pnl != null ? asNumber(account.today_realized_pnl) : tradebookPnl
  const winners = completedTrades.filter(trade => asNumber(trade.pnl) > 0).length
  const winRate = completedTrades.length ? winners / completedTrades.length * 100 : 0
  const balance = asNumber(account?.account?.balance)
  const initialCapital = asNumber(account?.account?.initial_balance) || balance
  const disciplineScore = asNumber(account?.account?.discipline_score)
  const disciplineStreak = asNumber(account?.account?.consecutive_disciplined_trades)
  const chainLive = lastUpdate != null && Date.now() - lastUpdate < 12000

  const refreshAfterOrder = async () => {
    await Promise.all([loadAccount(), loadTradingData()])
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
              {key === 'positions' && openPositions.length > 0 && <span>{openPositions.length}</span>}
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
              note={`${completedTrades.length} closed trade${completedTrades.length === 1 ? '' : 's'} · ${winRate.toFixed(0)}% win rate`}
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
        </>
      )}
    </div>
  )
}

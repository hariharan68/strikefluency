import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  CalendarDays,
  CheckCircle2,
  Layers3,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { EMOTION_LABELS, SETUP_TAG_LABELS, SETUP_TAGS } from '../../utils/constants'
import { formatCurrency } from '../../utils/formatters'

const number = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const pnlOf = entry => number(entry.pnl ?? entry.net_pnl)
const signedMoney = value => `${number(value) >= 0 ? '+' : '-'}${formatCurrency(Math.abs(number(value)))}`
const setupName = value => SETUP_TAG_LABELS[value] || value?.replaceAll('_', ' ') || 'Unclassified'

const ratio = (part, total) => total ? part / total * 100 : 0

function InsightEmpty({ icon: Icon, title, copy }) {
  return (
    <div className="journal-insight-empty">
      <span><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  )
}

export function JournalAnalytics({ entries, summary }) {
  const setupRows = useMemo(() => {
    const groups = new Map()
    entries.forEach(entry => {
      const key = entry.setup_tag || 'UNCLASSIFIED'
      const current = groups.get(key) || { key, trades: 0, wins: 0, pnl: 0, compliant: 0 }
      current.trades += 1
      current.pnl += pnlOf(entry)
      if (pnlOf(entry) > 0) current.wins += 1
      if (entry.is_discipline_compliant) current.compliant += 1
      groups.set(key, current)
    })
    return [...groups.values()].sort((a, b) => b.trades - a.trades)
  }, [entries])

  const emotionRows = useMemo(() => {
    const groups = new Map()
    entries.filter(entry => entry.emotion_tag).forEach(entry => {
      const current = groups.get(entry.emotion_tag) || {
        key: entry.emotion_tag,
        trades: 0,
        wins: 0,
        pnl: 0,
      }
      current.trades += 1
      current.pnl += pnlOf(entry)
      if (pnlOf(entry) > 0) current.wins += 1
      groups.set(entry.emotion_tag, current)
    })
    return [...groups.values()].sort((a, b) => b.trades - a.trades)
  }, [entries])

  const bestSetup = setupRows.length
    ? [...setupRows].sort((a, b) => b.pnl - a.pnl)[0]
    : null
  const disciplined = entries.filter(entry => entry.is_discipline_compliant)
  const undisciplined = entries.filter(entry => !entry.is_discipline_compliant)
  const average = rows => rows.length
    ? rows.reduce((sum, entry) => sum + pnlOf(entry), 0) / rows.length
    : 0

  if (!entries.length) {
    return (
      <InsightEmpty
        icon={BarChart3}
        title="Analytics will appear after your first closed trade"
        copy="Close a virtual trade to begin measuring setup quality, discipline, psychology, and net results."
      />
    )
  }

  return (
    <div className="journal-insights-grid">
      <section className="journal-insight-card journal-insight-card--wide">
        <header className="journal-insight-heading">
          <div><BarChart3 size={18} /><span><strong>Performance overview</strong><small>Closed trades only</small></span></div>
        </header>
        <div className="journal-performance-bars" aria-label="Gross profit compared with gross loss">
          <div>
            <span>Gross profit</span>
            <strong className="gain">{formatCurrency(summary?.grossProfit || 0)}</strong>
            <i style={{ width: `${Math.max(4, ratio(summary?.grossProfit || 0, (summary?.grossProfit || 0) + (summary?.grossLoss || 0)))}%` }} />
          </div>
          <div className="loss">
            <span>Gross loss</span>
            <strong className="loss">{formatCurrency(summary?.grossLoss || 0)}</strong>
            <i style={{ width: `${Math.max(4, ratio(summary?.grossLoss || 0, (summary?.grossProfit || 0) + (summary?.grossLoss || 0)))}%` }} />
          </div>
        </div>
        <div className="journal-analytics-kpis">
          <div><span>Average trade</span><strong>{signedMoney(summary?.avgPnl || 0)}</strong></div>
          <div><span>Trading costs</span><strong>{formatCurrency(summary?.totalBrokerage || 0)}</strong></div>
          <div><span>Reviewed</span><strong>{summary?.reviewedCount || 0} / {entries.length}</strong></div>
          <div><span>Avg hold</span><strong>{summary?.avgDurationMinutes == null ? '—' : `${Math.round(summary.avgDurationMinutes)} min`}</strong></div>
        </div>
      </section>

      <section className="journal-insight-card">
        <header className="journal-insight-heading">
          <div><ShieldCheck size={18} /><span><strong>Discipline impact</strong><small>Execution quality vs result</small></span></div>
        </header>
        <div className="journal-discipline-compare">
          <div>
            <span className="journal-mini-icon gain"><CheckCircle2 size={15} /></span>
            <p>Compliant trades<small>{disciplined.length} trades</small></p>
            <strong className={average(disciplined) >= 0 ? 'gain' : 'loss'}>{signedMoney(average(disciplined))}</strong>
          </div>
          <div>
            <span className="journal-mini-icon loss"><TrendingDown size={15} /></span>
            <p>Rule violations<small>{undisciplined.length} trades</small></p>
            <strong className={average(undisciplined) >= 0 ? 'gain' : 'loss'}>{signedMoney(average(undisciplined))}</strong>
          </div>
        </div>
      </section>

      <section className="journal-insight-card journal-insight-card--wide">
        <header className="journal-insight-heading">
          <div><Target size={18} /><span><strong>Setup performance</strong><small>Find the patterns worth repeating</small></span></div>
          {bestSetup && <span className="journal-best-setup"><TrendingUp size={13} /> Best: {setupName(bestSetup.key)}</span>}
        </header>
        <div className="journal-analytics-table-wrap">
          <table className="journal-analytics-table">
            <thead><tr><th>Setup</th><th>Trades</th><th>Win rate</th><th>Net P&amp;L</th><th>Discipline</th></tr></thead>
            <tbody>
              {setupRows.map(row => (
                <tr key={row.key}>
                  <td><strong>{setupName(row.key)}</strong></td>
                  <td className="num">{row.trades}</td>
                  <td className="num">{ratio(row.wins, row.trades).toFixed(0)}%</td>
                  <td className={`num ${row.pnl >= 0 ? 'gain' : 'loss'}`}>{signedMoney(row.pnl)}</td>
                  <td className="num">{ratio(row.compliant, row.trades).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="journal-insight-card">
        <header className="journal-insight-heading">
          <div><Brain size={18} /><span><strong>Psychology snapshot</strong><small>Results by selected emotion</small></span></div>
        </header>
        {emotionRows.length ? (
          <div className="journal-emotion-list">
            {emotionRows.slice(0, 5).map(row => (
              <div key={row.key}>
                <span style={{ '--emotion': EMOTION_LABELS[row.key]?.color || 'var(--primary)' }}>
                  {EMOTION_LABELS[row.key]?.label || row.key}
                </span>
                <small>{row.trades} trades · {ratio(row.wins, row.trades).toFixed(0)}% win</small>
                <strong className={row.pnl >= 0 ? 'gain' : 'loss'}>{signedMoney(row.pnl)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="journal-insight-note">Add an emotion while reviewing trades to reveal psychology patterns.</p>
        )}
      </section>
    </div>
  )
}

const dateKey = value => {
  const date = new Date(value)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function JournalCalendar({ entries }) {
  const latest = entries[0]?.trade_date || entries[0]?.created_at
  const [month, setMonth] = useState(() => {
    const date = latest ? new Date(latest) : new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })

  const byDay = useMemo(() => {
    const map = new Map()
    entries.forEach(entry => {
      const key = dateKey(entry.trade_date || entry.created_at)
      const current = map.get(key) || { trades: 0, pnl: 0, reviewed: 0 }
      current.trades += 1
      current.pnl += pnlOf(entry)
      if (entry.is_reviewed) current.reviewed += 1
      map.set(key, current)
    })
    return map
  }, [entries])

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const lastDate = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: firstDay.getDay() }, () => null),
    ...Array.from({ length: lastDate }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ]
  while (cells.length % 7) cells.push(null)

  const changeMonth = offset => setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1))

  return (
    <section className="journal-calendar-card">
      <header className="journal-calendar-header">
        <div><CalendarDays size={19} /><span><strong>Trading calendar</strong><small>Daily realized results and review completion</small></span></div>
        <div>
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ArrowLeft size={16} /></button>
          <strong>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Next month"><ArrowRight size={16} /></button>
        </div>
      </header>
      <div className="journal-calendar-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}
      </div>
      <div className="journal-calendar-grid">
        {cells.map((date, index) => {
          if (!date) return <span className="journal-calendar-day is-empty" key={`empty-${index}`} />
          const data = byDay.get(dateKey(date))
          return (
            <article className={`journal-calendar-day ${data ? 'has-trades' : ''}`} key={date.toISOString()}>
              <span>{date.getDate()}</span>
              {data ? (
                <>
                  <strong className={data.pnl >= 0 ? 'gain' : 'loss'}>{signedMoney(data.pnl)}</strong>
                  <small>{data.trades} trade{data.trades === 1 ? '' : 's'}</small>
                  <i>{data.reviewed === data.trades ? 'Reviewed' : `${data.trades - data.reviewed} to review`}</i>
                </>
              ) : <small>No trade</small>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

const PLAYBOOK_COPY = {
  OI_BASED: 'Trades built around open-interest structure, writing activity, and support or resistance shifts.',
  PRICE_ACTION: 'Entries based on price structure, confirmation candles, momentum, and clean invalidation.',
  LEVEL_TRADE: 'Pre-planned reactions around mapped support, resistance, VWAP, or previous-session levels.',
  EXPIRY_PLAY: 'Defined-risk trades designed specifically for expiry-session volatility and premium behaviour.',
  OTHER: 'Unclassified ideas that should be reviewed and promoted into a repeatable setup when validated.',
}

export function JournalPlaybook({ entries }) {
  const rows = SETUP_TAGS.map(key => {
    const trades = entries.filter(entry => entry.setup_tag === key)
    const pnl = trades.reduce((sum, entry) => sum + pnlOf(entry), 0)
    const wins = trades.filter(entry => pnlOf(entry) > 0).length
    const compliant = trades.filter(entry => entry.is_discipline_compliant).length
    return { key, trades, pnl, wins, compliant }
  })

  return (
    <div className="journal-playbook-grid">
      {rows.map(row => (
        <article className="journal-playbook-card" key={row.key}>
          <header>
            <span><Layers3 size={18} /></span>
            <div><strong>{setupName(row.key)}</strong><small>{row.trades.length ? `${row.trades.length} linked trades` : 'No linked trades yet'}</small></div>
          </header>
          <p>{PLAYBOOK_COPY[row.key]}</p>
          <div>
            <span><small>Win rate</small><strong>{ratio(row.wins, row.trades.length).toFixed(0)}%</strong></span>
            <span><small>Net P&amp;L</small><strong className={row.pnl >= 0 ? 'gain' : 'loss'}>{signedMoney(row.pnl)}</strong></span>
            <span><small>Discipline</small><strong>{ratio(row.compliant, row.trades.length).toFixed(0)}%</strong></span>
          </div>
          <footer>
            <span>{row.trades.length ? 'Performance updates from reviewed trades' : 'Use this setup on a trade to begin tracking'}</span>
          </footer>
        </article>
      ))}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FilterX,
  Layers3,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import useJournal from '../../hooks/useJournal'
import { SETUP_TAG_LABELS } from '../../utils/constants'
import { formatCurrency, formatDate, formatDuration } from '../../utils/formatters'
import TradeDetailPanel from '../../components/journal/TradeDetailPanel'
import { JournalAnalytics, JournalCalendar, JournalPlaybook } from '../../components/journal/JournalInsights'
import './JournalPage.css'

const PAGE_SIZE = 10

const NAV_ITEMS = [
  { key: 'trades', label: 'Trades', icon: BookOpen },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'playbook', label: 'Playbook', icon: Layers3 },
]

const QUICK_VIEWS = [
  { key: 'all', label: 'All trades' },
  { key: 'needs-review', label: 'Needs review' },
  { key: 'violations', label: 'Rule violations' },
  { key: 'winners', label: 'Winners' },
  { key: 'losses', label: 'Losses' },
]

const number = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const pnlOf = entry => number(entry.pnl ?? entry.net_pnl)
const signedMoney = value => `${number(value) >= 0 ? '+' : '-'}${formatCurrency(Math.abs(number(value)))}`
const setupName = value => SETUP_TAG_LABELS[value] || value?.replaceAll('_', ' ') || 'Unclassified'
const validDate = value => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const tradeDateParts = entry => {
  const date = validDate(entry.trade_date || entry.created_at || entry.entry_time)
  const time = validDate(entry.created_at || entry.entry_time || entry.trade_date)
  return {
    date: date
      ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      : 'Date unavailable',
    time: time && /T|\d{2}:\d{2}/.test(String(entry.created_at || entry.entry_time || ''))
      ? time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '',
  }
}

const summarize = entries => {
  const pnlValues = entries.map(pnlOf)
  const winners = pnlValues.filter(value => value > 0)
  const losses = pnlValues.filter(value => value < 0)
  const grossProfit = winners.reduce((sum, value) => sum + value, 0)
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0))
  return {
    totalPnl: pnlValues.reduce((sum, value) => sum + value, 0),
    winRate: entries.length ? winners.length / entries.length * 100 : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : null,
    ruleAdherence: entries.length
      ? entries.filter(entry => entry.is_discipline_compliant).length / entries.length * 100
      : 0,
    reviewedCount: entries.filter(entry => entry.is_reviewed).length,
    winners: winners.length,
    losers: losses.length,
  }
}

function MetricCard({ icon: Icon, label, value, helper, tone = '', progress }) {
  return (
    <article className={`journal-metric-card ${tone}`}>
      <div className="journal-metric-heading">
        <span><Icon size={16} /></span>
        <p>{label}<small>{helper}</small></p>
      </div>
      <strong className="num">{value}</strong>
      {progress != null && <i><span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></i>}
    </article>
  )
}

function TradeRow({ entry, selected, density, optionalColumns, onSelect }) {
  const pnl = pnlOf(entry)
  const tradeDate = tradeDateParts(entry)
  const reviewStatus = entry.is_reviewed ? 'Reviewed' : (
    entry.emotion_tag || entry.post_trade_review ? 'Review started' : 'Needs review'
  )

  return (
    <button
      type="button"
      className={`journal-trade-row ${selected ? 'selected' : ''} ${density} optional-${optionalColumns.length}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="journal-trade-date">
        <strong>{tradeDate.date}</strong>
        <small>{tradeDate.time || '—'}</small>
      </span>

      <span className="journal-trade-contract">
        <i className={entry.option_type === 'PE' ? 'pe' : ''}>{entry.option_type || 'OPT'}</i>
        <span>
          <strong>{entry.instrument || 'Instrument'} {entry.strike_price != null ? Math.round(number(entry.strike_price)) : ''}</strong>
          <small><b className={entry.action === 'SELL' ? 'sell' : ''}>{entry.action || 'BUY'}</b> · {setupName(entry.setup_tag)}</small>
        </span>
      </span>

      {optionalColumns.includes('prices') && (
        <span className="journal-trade-optional">
          <small>Entry / Exit</small>
          <strong className="num">{number(entry.entry_price).toFixed(2)} / {entry.exit_price == null ? '—' : number(entry.exit_price).toFixed(2)}</strong>
        </span>
      )}

      {optionalColumns.includes('duration') && (
        <span className="journal-trade-optional">
          <small>Hold</small>
          <strong>{formatDuration(entry.duration_minutes)}</strong>
        </span>
      )}

      <span className="journal-trade-result">
        <strong className={`num ${pnl > 0 ? 'gain' : pnl < 0 ? 'loss' : ''}`}>{signedMoney(pnl)}</strong>
        <small>{pnl > 0 ? 'Profit' : pnl < 0 ? 'Loss' : 'Breakeven'}</small>
      </span>

      <span className={`journal-discipline-pill ${entry.is_discipline_compliant ? 'compliant' : 'violation'}`}>
        {entry.is_discipline_compliant ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
        {entry.is_discipline_compliant ? '100%' : '0%'}
      </span>

      <span className={`journal-row-review ${entry.is_reviewed ? 'reviewed' : 'pending'}`}>
        {entry.is_reviewed ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
        {reviewStatus}
      </span>

      <ChevronRight size={17} className="journal-row-chevron" />
    </button>
  )
}

function JournalEmpty({ filtered, onReset, onTrade }) {
  return (
    <div className="journal-empty-state">
      <span>{filtered ? <FilterX size={24} /> : <BookOpen size={24} />}</span>
      <strong>{filtered ? 'No trades match these filters' : 'No journal entries yet'}</strong>
      <p>
        {filtered
          ? 'Clear or adjust your filters to see more closed trades.'
          : 'Journal entries are created automatically after a virtual trade is closed.'}
      </p>
      <div>
        {filtered && <button type="button" className="journal-secondary-button" onClick={onReset}>Clear filters</button>}
        {!filtered && <button type="button" className="journal-primary-button" onClick={onTrade}><Plus size={15} /> Add first trade</button>}
      </div>
    </div>
  )
}

export default function JournalPage() {
  const navigate = useNavigate()
  const { entries, total, summary, loading, error, loadJournal, saveReview } = useJournal()
  const [activeTab, setActiveTab] = useState('trades')
  const [selectedId, setSelectedId] = useState(null)
  const [selectionDismissed, setSelectionDismissed] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [setup, setSetup] = useState('ALL')
  const [result, setResult] = useState('ALL')
  const [review, setReview] = useState('ALL')
  const [compliance, setCompliance] = useState('ALL')
  const [quickView, setQuickView] = useState('all')
  const [density, setDensity] = useState('comfortable')
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [optionalColumns, setOptionalColumns] = useState([])
  const columnMenuRef = useRef(null)

  useEffect(() => {
    loadJournal(1, {}, 100)
  }, [loadJournal])

  useEffect(() => {
    if (!columnMenuOpen) return undefined
    const close = event => {
      if (!columnMenuRef.current?.contains(event.target)) setColumnMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [columnMenuOpen])

  const filteredEntries = useMemo(() => entries.filter(entry => {
    const haystack = [
      entry.instrument,
      entry.strike_price,
      entry.option_type,
      entry.action,
      setupName(entry.setup_tag),
      entry.exit_reason,
    ].join(' ').toLowerCase()
    if (search && !haystack.includes(search.toLowerCase().trim())) return false
    if (setup !== 'ALL' && entry.setup_tag !== setup) return false
    if (result === 'WIN' && pnlOf(entry) <= 0) return false
    if (result === 'LOSS' && pnlOf(entry) >= 0) return false
    if (result === 'BREAKEVEN' && pnlOf(entry) !== 0) return false
    if (review === 'REVIEWED' && !entry.is_reviewed) return false
    if (review === 'NEEDS_REVIEW' && entry.is_reviewed) return false
    if (compliance === 'COMPLIANT' && !entry.is_discipline_compliant) return false
    if (compliance === 'VIOLATION' && entry.is_discipline_compliant) return false
    return true
  }), [entries, search, setup, result, review, compliance])

  const hasFilters = Boolean(search || setup !== 'ALL' || result !== 'ALL' || review !== 'ALL' || compliance !== 'ALL')
  const displayedSummary = hasFilters ? summarize(filteredEntries) : {
    totalPnl: summary?.totalPnl || 0,
    winRate: summary?.winRate || 0,
    profitFactor: summary?.profitFactor,
    ruleAdherence: summary?.ruleAdherence || 0,
    reviewedCount: summary?.reviewedCount || 0,
    winners: summary?.winners || 0,
    losers: summary?.losers || 0,
  }
  const metricTradeCount = hasFilters ? filteredEntries.length : total
  const reviewCompletion = metricTradeCount ? displayedSummary.reviewedCount / metricTradeCount * 100 : 0

  const pages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE))
  const visibleEntries = filteredEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selectedEntry = entries.find(entry => entry.id === selectedId) || null

  useEffect(() => {
    setPage(1)
    setSelectionDismissed(false)
  }, [search, setup, result, review, compliance])

  useEffect(() => {
    if (!filteredEntries.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && !filteredEntries.some(entry => entry.id === selectedId)) {
      setSelectedId(filteredEntries[0].id)
      return
    }
    if (!selectedId && !selectionDismissed) setSelectedId(filteredEntries[0].id)
  }, [filteredEntries, selectedId, selectionDismissed])

  const resetFilters = () => {
    setSearch('')
    setSetup('ALL')
    setResult('ALL')
    setReview('ALL')
    setCompliance('ALL')
    setQuickView('all')
  }

  const applyQuickView = key => {
    resetFilters()
    setQuickView(key)
    if (key === 'needs-review') setReview('NEEDS_REVIEW')
    if (key === 'violations') setCompliance('VIOLATION')
    if (key === 'winners') setResult('WIN')
    if (key === 'losses') setResult('LOSS')
  }

  const exportCsv = () => {
    const headings = ['Date', 'Instrument', 'Strike', 'Type', 'Side', 'Setup', 'Entry', 'Exit', 'P&L', 'Charges', 'Duration', 'Discipline', 'Reviewed']
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = filteredEntries.map(entry => [
      entry.trade_date,
      entry.instrument,
      entry.strike_price,
      entry.option_type,
      entry.action,
      setupName(entry.setup_tag),
      entry.entry_price,
      entry.exit_price,
      pnlOf(entry),
      entry.brokerage,
      entry.duration_minutes,
      entry.is_discipline_compliant ? 'Compliant' : 'Violation',
      entry.is_reviewed ? 'Reviewed' : 'Needs review',
    ].map(quote).join(','))
    const blob = new Blob([[headings.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `strikefluency-journal-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const toggleColumn = key => {
    setOptionalColumns(current => current.includes(key)
      ? current.filter(value => value !== key)
      : [...current, key])
  }

  const handleSave = async (id, data) => {
    const updated = await saveReview(id, data)
    if (updated) await loadJournal(1, {}, 100)
  }

  return (
    <div className="journal-page">
      <header className="journal-page-header">
        <div className="journal-page-title">
          <span><BookOpen size={20} /></span>
          <div>
            <h1>Trade Journal</h1>
            <p>Review execution, discipline, psychology, mistakes, and lessons from every closed trade.</p>
          </div>
        </div>
        <div className="journal-page-actions">
          <button type="button" className="journal-secondary-button" onClick={() => loadJournal(1, {}, 100)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'sf-spin' : ''} /> Refresh
          </button>
          <button type="button" className="journal-secondary-button" onClick={exportCsv} disabled={!filteredEntries.length}>
            <Download size={15} /> Export
          </button>
          <button type="button" className="journal-primary-button" onClick={() => navigate('/trading')}>
            <Plus size={16} /> Add Trade
          </button>
        </div>
      </header>

      <nav className="journal-module-tabs" aria-label="Trade journal sections">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          return (
            <button
              type="button"
              key={item.key}
              className={activeTab === item.key ? 'active' : ''}
              onClick={() => setActiveTab(item.key)}
              aria-current={activeTab === item.key ? 'page' : undefined}
            >
              <Icon size={15} /> {item.label}
              {item.key === 'trades' && total > 0 && <span>{total}</span>}
            </button>
          )
        })}
      </nav>

      {error && (
        <div className="journal-error-banner">
          <AlertCircle size={17} />
          <span><strong>Journal unavailable</strong>{error}</span>
          <button type="button" onClick={() => loadJournal(1, {}, 100)}>Retry</button>
        </div>
      )}

      {activeTab === 'trades' && (
        <>
          <section className="journal-metrics" aria-label="Journal summary">
            <MetricCard
              icon={displayedSummary.totalPnl >= 0 ? TrendingUp : TrendingDown}
              label="Realized P&L"
              helper={`${metricTradeCount} closed trade${metricTradeCount === 1 ? '' : 's'}`}
              value={signedMoney(displayedSummary.totalPnl)}
              tone={displayedSummary.totalPnl >= 0 ? 'gain' : 'loss'}
            />
            <MetricCard
              icon={ListChecks}
              label="Win rate"
              helper={`${displayedSummary.winners} winners · ${displayedSummary.losers} losers`}
              value={`${displayedSummary.winRate.toFixed(1)}%`}
            />
            <MetricCard
              icon={BarChart3}
              label="Profit factor"
              helper="Gross profit ÷ gross loss"
              value={displayedSummary.profitFactor == null ? '—' : displayedSummary.profitFactor.toFixed(2)}
            />
            <MetricCard
              icon={ShieldCheck}
              label="Rule adherence"
              helper="Discipline checks passed"
              value={`${displayedSummary.ruleAdherence.toFixed(0)}%`}
              tone={displayedSummary.ruleAdherence >= 70 ? 'gain' : displayedSummary.ruleAdherence < 50 ? 'loss' : ''}
              progress={displayedSummary.ruleAdherence}
            />
            <MetricCard
              icon={CheckCircle2}
              label="Review completion"
              helper={`${Math.max(0, metricTradeCount - displayedSummary.reviewedCount)} waiting for review`}
              value={`${reviewCompletion.toFixed(0)}%`}
              progress={reviewCompletion}
            />
          </section>

          <section className="journal-filter-card">
            <div className="journal-saved-views" aria-label="Saved journal views">
              {QUICK_VIEWS.map(view => (
                <button
                  type="button"
                  key={view.key}
                  className={quickView === view.key ? 'active' : ''}
                  onClick={() => applyQuickView(view.key)}
                >
                  {view.label}
                  {view.key === 'needs-review' && total > 0 && <span>{Math.max(0, total - (summary?.reviewedCount || 0))}</span>}
                </button>
              ))}
            </div>

            <div className="journal-filter-row">
              <label className="journal-search">
                <Search size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={event => { setSearch(event.target.value); setQuickView('all') }}
                  placeholder="Search instrument, strike, setup..."
                  aria-label="Search journal trades"
                />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}
              </label>
              <select value={setup} onChange={event => { setSetup(event.target.value); setQuickView('all') }} aria-label="Filter by setup">
                <option value="ALL">All setups</option>
                {Object.entries(SETUP_TAG_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <select value={result} onChange={event => { setResult(event.target.value); setQuickView('all') }} aria-label="Filter by result">
                <option value="ALL">All results</option>
                <option value="WIN">Winners</option>
                <option value="LOSS">Losers</option>
                <option value="BREAKEVEN">Breakeven</option>
              </select>
              <select value={review} onChange={event => { setReview(event.target.value); setQuickView('all') }} aria-label="Filter by review status">
                <option value="ALL">All reviews</option>
                <option value="NEEDS_REVIEW">Needs review</option>
                <option value="REVIEWED">Reviewed</option>
              </select>
              <select value={compliance} onChange={event => { setCompliance(event.target.value); setQuickView('all') }} aria-label="Filter by discipline">
                <option value="ALL">All discipline</option>
                <option value="COMPLIANT">Compliant</option>
                <option value="VIOLATION">Rule violations</option>
              </select>
              {hasFilters && (
                <button type="button" className="journal-clear-filters" onClick={resetFilters}>
                  <FilterX size={14} /> Clear
                </button>
              )}
            </div>
          </section>

          <section className={`journal-workspace ${selectedEntry ? 'has-selection' : ''}`}>
            <article className="journal-list-panel">
              <header className="journal-list-header">
                <div>
                  <strong>Closed trades</strong>
                  <span>{filteredEntries.length} of {total} entries</span>
                </div>
                <div>
                  <div className="journal-column-menu" ref={columnMenuRef}>
                    <button type="button" className="journal-icon-text-button" onClick={() => setColumnMenuOpen(current => !current)} aria-expanded={columnMenuOpen}>
                      <Columns3 size={15} /> Columns
                    </button>
                    {columnMenuOpen && (
                      <div>
                        <button type="button" onClick={() => toggleColumn('prices')}>
                          <span>{optionalColumns.includes('prices') && <Check size={13} />}</span> Entry / exit
                        </button>
                        <button type="button" onClick={() => toggleColumn('duration')}>
                          <span>{optionalColumns.includes('duration') && <Check size={13} />}</span> Holding time
                        </button>
                      </div>
                    )}
                  </div>
                  <button type="button" className="journal-density-button" onClick={() => setDensity(current => current === 'compact' ? 'comfortable' : 'compact')} title="Change row density">
                    <SlidersHorizontal size={15} /> {density === 'compact' ? 'Compact' : 'Comfortable'}
                  </button>
                </div>
              </header>

              <div className={`journal-trade-list ${optionalColumns.length ? 'with-optional-columns' : ''}`}>
                {loading ? (
                  <div className="journal-list-loading"><Loader2 size={19} className="sf-spin" /> Loading closed trades…</div>
                ) : visibleEntries.length ? (
                  visibleEntries.map(entry => (
                    <TradeRow
                      key={entry.id}
                      entry={entry}
                      selected={entry.id === selectedId}
                      density={density}
                      optionalColumns={optionalColumns}
                      onSelect={() => {
                        setSelectionDismissed(false)
                        setSelectedId(entry.id)
                      }}
                    />
                  ))
                ) : (
                  <JournalEmpty filtered={hasFilters} onReset={resetFilters} onTrade={() => navigate('/trading')} />
                )}
              </div>

              {filteredEntries.length > PAGE_SIZE && (
                <footer className="journal-pagination">
                  <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredEntries.length)} of {filteredEntries.length}</span>
                  <div>
                    <button type="button" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))} aria-label="Previous page">
                      <ChevronLeft size={16} />
                    </button>
                    <strong>{page} / {pages}</strong>
                    <button type="button" disabled={page === pages} onClick={() => setPage(current => Math.min(pages, current + 1))} aria-label="Next page">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </footer>
              )}
            </article>

            <aside className={`journal-detail-shell ${selectedEntry ? 'open' : ''}`}>
              <TradeDetailPanel
                entry={selectedEntry}
                onSave={handleSave}
                onClose={() => {
                  setSelectionDismissed(true)
                  setSelectedId(null)
                }}
              />
            </aside>
          </section>
        </>
      )}

      {activeTab === 'analytics' && <JournalAnalytics entries={entries} summary={summary} />}
      {activeTab === 'calendar' && <JournalCalendar entries={entries} />}
      {activeTab === 'playbook' && <JournalPlaybook entries={entries} />}
    </div>
  )
}

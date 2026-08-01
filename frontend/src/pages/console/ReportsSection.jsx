import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Search, FileBarChart, ArrowRight } from 'lucide-react'
import { getConsolePnl, getConsoleTrades } from '../../api/console'
import useTradingStore from '../../store/tradingStore'
import { getApiErrorMessage } from '../../utils/apiError'
import { asNumber, signedMoney, dateLabel } from '../../utils/chartFormat'
import { formatCurrency } from '../../utils/formatters'
import Select from '../../components/common/Select'
import Pagination from '../../components/common/Pagination'
import Spinner from '../../components/common/Spinner'
import PnlHeatmap from './PnlHeatmap'
import SummaryTiles from './SummaryTiles'

const PAGE_SIZE = 20
const INSTRUMENTS = [
  { value: 'ALL', label: 'All instruments' },
  { value: 'NIFTY', label: 'NIFTY' },
  { value: 'BANKNIFTY', label: 'BANK NIFTY' },
  { value: 'SENSEX', label: 'SENSEX' },
]
const PNL_VIEWS = [
  { value: 'combined', label: 'Combined' },
  { value: 'realised', label: 'Realised P&L' },
  { value: 'unrealised', label: 'Unrealised P&L' },
]

const contractLabel = row => `${row.instrument} ${asNumber(row.strike_price)} ${row.option_type}`

export default function ReportsSection({ range, refreshKey }) {
  const eventSeq = useTradingStore(state => state.eventSeq)
  const [instrument, setInstrument] = useState('ALL')
  const [view, setView] = useState('combined')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // The report starts unbuilt: show the "Build a report" prompt until the user
  // hits Generate, mirroring the Zerodha Console flow. Once generated it stays
  // live, updating on filter / range / refresh changes.
  const [generated, setGenerated] = useState(false)
  const [pnl, setPnl] = useState(null)
  const [trades, setTrades] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Debounce the free-text search so each keystroke doesn't hit the server.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Any filter change resets to the first page.
  useEffect(() => { setPage(1) }, [range.from, range.to, instrument, search])

  const params = useMemo(() => {
    const p = { from: range.from, to: range.to }
    if (instrument !== 'ALL') p.instrument = instrument
    return p
  }, [range.from, range.to, instrument])

  // Heatmap + tiles: independent of search/page.
  useEffect(() => {
    if (!generated) return undefined
    const controller = new AbortController()
    if (pnl) setRefreshing(true); else setLoading(true)
    setError('')
    getConsolePnl(params, controller.signal)
      .then(res => setPnl(res.data))
      .catch(err => { if (err?.code !== 'ERR_CANCELED') setError(getApiErrorMessage(err, 'Could not load P&L.')) })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setRefreshing(false) } })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, refreshKey, eventSeq, generated])

  // Trades table: also keyed on search + page.
  useEffect(() => {
    if (!generated) return undefined
    const controller = new AbortController()
    getConsoleTrades({ ...params, search: search || undefined, page, page_size: PAGE_SIZE }, controller.signal)
      .then(res => setTrades(res.data))
      .catch(err => { if (err?.code !== 'ERR_CANCELED') setError(getApiErrorMessage(err, 'Could not load trades.')) })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, search, page, refreshKey, eventSeq, generated])

  const downloadCsv = async () => {
    // Pull every filtered row (not just the visible page) for the export.
    const collected = []
    let p = 1
    for (;;) {
      const { data } = await getConsoleTrades({ ...params, search: search || undefined, page: p, page_size: 100 })
      collected.push(...data.rows)
      if (collected.length >= data.total || data.rows.length === 0) break
      p += 1
    }
    const quote = v => `"${String(v ?? '').replaceAll('"', '""')}"`
    const headings = ['Date', 'Contract', 'Action', 'Qty', 'Entry', 'Exit', 'Net P&L', 'Charges', 'Setup', 'Status']
    const lines = collected.map(row => [
      row.trade_date, contractLabel(row), row.action, row.quantity,
      row.entry_price, row.exit_price, row.net_pnl, row.brokerage, row.setup_tag, row.status,
    ].map(quote).join(','))
    const blob = new Blob([[headings.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `strikefluency-console-${range.from}_to_${range.to}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const rows = trades?.rows || []
  const total = trades?.total || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const filterRow = (
    <div className="console-filter-row">
      <div className="console-filter-view">
        <label className="console-field-label">P&amp;L view</label>
        <Select value={view} onChange={e => setView(e.target.value)} options={PNL_VIEWS} />
      </div>
      <div className="console-filter-instrument">
        <label className="console-field-label">Symbol</label>
        <Select value={instrument} onChange={e => setInstrument(e.target.value)} options={INSTRUMENTS} />
      </div>
      <label className="console-search">
        <Search size={15} />
        <input
          type="search"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search instrument or strike…"
        />
      </label>
      <button type="button" className="console-generate" onClick={() => setGenerated(true)}>
        {generated ? 'Update report' : 'Generate report'} <ArrowRight size={15} />
      </button>
    </div>
  )

  // Not built yet: the Zerodha-style "Build a report" prompt.
  if (!generated) {
    return (
      <div className="console-section">
        {filterRow}
        <div className="sf-card console-report-empty">
          <div className="console-report-empty-icon"><FileBarChart size={34} /></div>
          <h3>Build a report</h3>
          <p>Pick your <strong>P&amp;L view</strong> and symbol above, set the date range at the top, then hit <strong>Generate report</strong>.</p>
        </div>
      </div>
    )
  }

  if (loading && !pnl) return <div className="console-section">{filterRow}<Spinner /></div>
  if (error && !pnl) return <div className="console-section">{filterRow}<div className="console-error">{error}</div></div>

  return (
    <div className={`console-section${refreshing ? ' is-refreshing' : ''}`}>
      {filterRow}

      {pnl && view !== 'unrealised' && (
        <div className="sf-card console-heatmap-card">
          <div className="sf-card-header">
            <div><h3>Daily P&amp;L</h3><p>{range.from} → {range.to}</p></div>
          </div>
          <div className="console-heatmap-body">
            <PnlHeatmap from={pnl.period.from_date} to={pnl.period.to_date} calendar={pnl.calendar} />
          </div>
        </div>
      )}

      {pnl && <SummaryTiles summary={pnl.summary} view={view} />}

      <div className="sf-card console-table-card">
        <div className="sf-card-header console-table-header">
          <div>
            <h3>Trades</h3>
            <p>{total} closed {total === 1 ? 'trade' : 'trades'} in range</p>
          </div>
          <button type="button" className="console-download" onClick={downloadCsv} disabled={!total}>
            <Download size={14} /> Download
          </button>
        </div>
        <div className="console-table-scroll">
          <table className="console-table">
            <thead>
              <tr>
                <th>Date</th><th>Contract</th><th>Action</th><th className="num-col">Qty</th>
                <th className="num-col">Entry</th><th className="num-col">Exit</th>
                <th className="num-col">Net P&amp;L</th><th className="num-col">Charges</th><th>Setup</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} className="console-table-empty">No trades match these filters.</td></tr>
              )}
              {rows.map(row => (
                <tr key={row.id}>
                  <td>{dateLabel(row.trade_date)}</td>
                  <td>{contractLabel(row)}</td>
                  <td><span className={`console-action ${row.action === 'BUY' ? 'buy' : 'sell'}`}>{row.action}</span></td>
                  <td className="num-col">{row.quantity}</td>
                  <td className="num-col">{formatCurrency(row.entry_price)}</td>
                  <td className="num-col">{row.exit_price == null ? '—' : formatCurrency(row.exit_price)}</td>
                  <td className={`num-col ${asNumber(row.net_pnl) >= 0 ? 'gain' : 'loss'}`}>{signedMoney(row.net_pnl)}</td>
                  <td className="num-col">{formatCurrency(row.brokerage)}</td>
                  <td>{row.setup_tag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  )
}

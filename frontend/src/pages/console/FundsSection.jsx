import { useEffect, useMemo, useState } from 'react'
import { getConsoleFunds } from '../../api/console'
import useTradingStore from '../../store/tradingStore'
import { getApiErrorMessage } from '../../utils/apiError'
import { asNumber, signedMoney } from '../../utils/chartFormat'
import { formatCurrency, formatDate } from '../../utils/formatters'
import Pagination from '../../components/common/Pagination'
import Spinner from '../../components/common/Spinner'
import Badge from '../../components/common/Badge'

const PAGE_SIZE = 20

const TXN_META = {
  INITIAL_CREDIT: { label: 'Opening', color: 'var(--primary)' },
  TRADE_CREDIT: { label: 'Trade credit', color: 'var(--gain)' },
  TRADE_DEBIT: { label: 'Trade debit', color: 'var(--loss)' },
  CHARGE: { label: 'Charge', color: 'var(--warn)' },
  REFUND: { label: 'Refund', color: 'var(--gain)' },
  MANUAL_ADJUSTMENT: { label: 'Adjustment', color: 'var(--primary)' },
  RESET: { label: 'Reset', color: 'var(--text-muted)' },
}

export default function FundsSection({ range, refreshKey }) {
  const eventSeq = useTradingStore(state => state.eventSeq)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setPage(1) }, [range.from, range.to])

  useEffect(() => {
    const controller = new AbortController()
    if (data) setRefreshing(true); else setLoading(true)
    setError('')
    getConsoleFunds({ from: range.from, to: range.to, page, page_size: PAGE_SIZE }, controller.signal)
      .then(res => setData(res.data))
      .catch(err => { if (err?.code !== 'ERR_CANCELED') setError(getApiErrorMessage(err, 'Could not load funds.')) })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setRefreshing(false) } })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, page, refreshKey, eventSeq])

  const accountCards = useMemo(() => {
    const a = data?.account
    if (!a) return []
    return [
      { label: 'Balance', value: formatCurrency(a.balance) },
      { label: 'Blocked margin', value: formatCurrency(a.blocked_margin) },
      { label: 'Initial capital', value: formatCurrency(a.initial_capital) },
      { label: 'Tier', value: String(a.tier || '').replace('TIER_', 'Tier ') },
    ]
  }, [data])

  if (loading && !data) return <Spinner />
  if (error && !data) return <div className="console-error">{error}</div>

  const s = data.summary
  const rows = data.ledger_rows || []
  const totalPages = Math.ceil((data.ledger_total || 0) / PAGE_SIZE)
  const summaryStrip = [
    { label: 'Trade credits', value: signedMoney(s.trade_credit) },
    { label: 'Trade debits', value: signedMoney(s.trade_debit) },
    { label: 'Charges', value: signedMoney(s.charges) },
    { label: 'Refunds', value: signedMoney(s.refund) },
    { label: 'Adjustments', value: signedMoney(s.adjustment) },
    { label: 'Net change', value: signedMoney(s.net_change), strong: true },
  ]

  return (
    <div className={`console-section${refreshing ? ' is-refreshing' : ''}`}>
      <div className="console-fund-cards">
        {accountCards.map(card => (
          <div key={card.label} className="sf-card console-fund-card">
            <span className="console-tile-label">{card.label}</span>
            <strong className="console-tile-value num">{card.value}</strong>
          </div>
        ))}
      </div>

      <div className="sf-card console-fund-summary">
        <div className="sf-card-header"><div><h3>Statement summary</h3><p>{range.from} → {range.to}</p></div></div>
        <div className="console-fund-summary-grid">
          {summaryStrip.map(item => (
            <div key={item.label} className={item.strong ? 'strong' : ''}>
              <span>{item.label}</span>
              <strong className={`num ${asNumber(item.value.replace(/[^0-9.-]/g, '')) >= 0 ? 'gain' : 'loss'}`}>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="sf-card console-table-card">
        <div className="sf-card-header"><div><h3>Fund statement</h3><p>{data.ledger_total} entries in range</p></div></div>
        <div className="console-table-scroll">
          <table className="console-table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Description</th><th className="num-col">Amount</th><th className="num-col">Balance</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="console-table-empty">No fund movements in this range.</td></tr>}
              {rows.map(row => {
                const meta = TXN_META[row.transaction_type] || { label: row.transaction_type, color: 'var(--text-muted)' }
                return (
                  <tr key={row.seq}>
                    <td>{formatDate(row.created_at)}</td>
                    <td><Badge color={meta.color}>{meta.label}</Badge></td>
                    <td className="console-desc">{row.description}</td>
                    <td className={`num-col ${asNumber(row.amount) >= 0 ? 'gain' : 'loss'}`}>{signedMoney(row.amount)}</td>
                    <td className="num-col">{formatCurrency(row.balance_after)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  )
}

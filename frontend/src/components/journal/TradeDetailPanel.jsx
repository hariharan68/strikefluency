import { formatCurrency, formatDate, formatPnL, formatDuration } from '../../utils/formatters'
import { SETUP_TAG_LABELS } from '../../utils/constants'

export default function TradeDetailPanel({ entry }) {
  const pnl = formatPnL(entry.net_pnl ?? 0)

  const rows = [
    ['Instrument', `${entry.instrument} ${entry.strike} ${entry.option_type}`],
    ['Action', entry.action],
    ['Lots', entry.lots],
    ['Entry Price', `₹${entry.entry_price}`],
    ['Exit Price', entry.exit_price ? `₹${entry.exit_price}` : '-'],
    ['Stop Loss', entry.stop_loss ? `₹${entry.stop_loss}` : '-'],
    ['Target', entry.target_price ? `₹${entry.target_price}` : '-'],
    ['Setup Tag', entry.setup_tag ? (SETUP_TAG_LABELS[entry.setup_tag] || entry.setup_tag) : '-'],
    ['Duration', formatDuration(entry.duration_minutes)],
    ['Placed At', formatDate(entry.placed_at || entry.created_at)]
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginTop: 12 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
          <span style={{ color: '#717784', fontSize: 12 }}>{label}</span>
          <span style={{ color: '#fff', fontSize: 12 }}>{value}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gridColumn: '1 / -1' }}>
        <span style={{ color: '#717784', fontSize: 13 }}>Net P&L</span>
        <span style={{ color: pnl.color, fontSize: 14, fontWeight: 500 }}>{pnl.signed}</span>
      </div>
    </div>
  )
}

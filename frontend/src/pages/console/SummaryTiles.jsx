import { asNumber, signedMoney } from '../../utils/chartFormat'
import { formatCurrency } from '../../utils/formatters'

// Tone by sign, using theme tokens (never the hardcoded formatPnL colors).
const toneOf = value => (asNumber(value) > 0 ? 'gain' : asNumber(value) < 0 ? 'loss' : 'flat')

// `view` (from the report form) decides which tiles are relevant:
//   combined   → everything
//   realised   → realised legs only (no live mark-to-market)
//   unrealised → just the open-position mark-to-market
const VIEW_TILES = {
  combined: ['realised', 'charges', 'other', 'net', 'unrealised'],
  realised: ['realised', 'charges', 'other', 'net'],
  unrealised: ['unrealised'],
}

export default function SummaryTiles({ summary, view = 'combined' }) {
  const s = summary || {}
  const byKey = {
    realised: { label: 'Realised P&L', value: signedMoney(s.realized_gross), tone: toneOf(s.realized_gross) },
    // Charges are always a cost — show the magnitude, tinted as a debit.
    charges: { label: 'Charges & taxes', value: formatCurrency(Math.abs(asNumber(s.charges))), tone: 'loss' },
    other: { label: 'Other credits & debits', value: signedMoney(s.other_credits_debits), tone: toneOf(s.other_credits_debits) },
    net: { label: 'Net realised P&L', value: signedMoney(s.net_realized), tone: toneOf(s.net_realized), strong: true },
    unrealised: { label: 'Unrealised P&L', value: signedMoney(s.unrealized), tone: toneOf(s.unrealized) },
  }
  const tiles = (VIEW_TILES[view] || VIEW_TILES.combined).map(key => byKey[key])

  return (
    <div className="console-tiles">
      {tiles.map(tile => (
        <div key={tile.label} className={`sf-card console-tile ${tile.strong ? 'strong' : ''}`}>
          <span className="console-tile-label">{tile.label}</span>
          <strong className={`console-tile-value num ${tile.tone}`}>{tile.value}</strong>
        </div>
      ))}
    </div>
  )
}

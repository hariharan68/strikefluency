import { useMemo } from 'react'
import { asNumber, signedMoney } from '../../utils/chartFormat'

// Zerodha-Console-style daily P&L calendar. Days are grouped into SEPARATE
// month blocks (a grid of week-columns × 7 weekday-rows) laid out left-to-right
// with the month name below each block. A DIVERGING scale: profit tinted from
// --gain, loss from --loss, no-trade days a neutral grey. Because those two hues
// sit only ~4 ΔE apart under red-green colour blindness in the light themes,
// every cell also carries its signed value in the title/aria-label — that sign
// is the mandatory secondary encoding, not decoration.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parseISO = s => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const isoLocal = date => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
// Monday-based weekday index (0 = Mon … 6 = Sun).
const mondayIndex = date => (date.getDay() + 6) % 7

// 4 intensity steps per arm, so a huge day isn't the same shade as a tiny one.
const intensity = (magnitude, max) => {
  if (!max || magnitude <= 0) return 0
  return Math.min(4, Math.ceil((magnitude / max) * 4))
}

export default function PnlHeatmap({ from, calendar }) {
  // Always render the full Indian financial year (Apr → Mar) that contains the
  // selected range, so the strip reads Apr, May, … Mar like the Zerodha panel.
  // Months outside the queried range simply have no trade data → neutral grey.
  // Each month is a list of week columns; days before the 1st that share the
  // first week column are emitted as `pad` placeholders so the coloured cells
  // land on the right weekday row.
  const { blocks, maxAbs } = useMemo(() => {
    const byDate = new Map(calendar.map(row => [row.date, row]))
    const anchor = parseISO(from)
    // FY starts 1 April: months Jan–Mar belong to the FY that began the prior year.
    const fyStartYear = anchor.getMonth() >= 3 ? anchor.getFullYear() : anchor.getFullYear() - 1
    let max = 0

    const blocks = []
    for (let i = 0; i < 12; i += 1) {
      const month = new Date(fyStartYear, 3 + i, 1) // 3 = April; rolls into next year past Dec
      const y = month.getFullYear()
      const m = month.getMonth()
      const monthEnd = new Date(y, m + 1, 0) // last day of this month

      // Grid begins on the Monday of the week containing the 1st.
      const cursor = new Date(month)
      cursor.setDate(cursor.getDate() - mondayIndex(month))

      const weeks = []
      let week = []
      while (cursor <= monthEnd || week.length > 0) {
        const inMonth = cursor.getMonth() === m && cursor.getFullYear() === y
        if (!inMonth) {
          week.push({ pad: true, key: `pad-${isoLocal(cursor)}` })
        } else {
          const iso = isoLocal(cursor)
          const row = byDate.get(iso)
          const pnl = row ? asNumber(row.net_pnl) : 0
          if (row) max = Math.max(max, Math.abs(pnl))
          week.push({
            key: iso,
            iso,
            hasTrade: !!row,
            pnl,
            tradeCount: row ? row.trade_count : 0,
          })
        }
        if (week.length === 7) {
          weeks.push(week)
          week = []
          if (cursor >= monthEnd) break
        }
        cursor.setDate(cursor.getDate() + 1)
      }

      blocks.push({ key: `${y}-${m}`, label: MONTHS[m], weeks })
    }

    return { blocks, maxAbs: max }
  }, [from, calendar])

  const cellStyle = cell => {
    if (!cell.hasTrade) return { background: 'var(--border-light)' }
    if (cell.pnl === 0) return { background: 'var(--text-muted)', opacity: 0.35 }
    const base = cell.pnl > 0 ? 'var(--gain)' : 'var(--loss)'
    const pct = 32 + intensity(Math.abs(cell.pnl), maxAbs) * 17 // 49 → 100%
    return { background: `color-mix(in srgb, ${base} ${pct}%, transparent)` }
  }

  return (
    <div className="console-heatmap">
      <div className="console-heatmap-scroll">
        <div className="console-heatmap-months">
          {blocks.map(block => (
            <div key={block.key} className="console-heatmap-month">
              <div className="console-heatmap-weeks">
                {block.weeks.map((week, wi) => (
                  <div key={wi} className="console-heatmap-week">
                    {week.map(cell =>
                      cell.pad ? (
                        <div key={cell.key} className="console-heatmap-cell is-pad" />
                      ) : (
                        <div
                          key={cell.key}
                          className="console-heatmap-cell"
                          style={cellStyle(cell)}
                          title={cell.hasTrade
                            ? `${cell.iso} · ${signedMoney(cell.pnl)} · ${cell.tradeCount} trade${cell.tradeCount === 1 ? '' : 's'}`
                            : `${cell.iso} · no trades`}
                          aria-label={cell.hasTrade
                            ? `${cell.iso}: ${signedMoney(cell.pnl)} across ${cell.tradeCount} trades`
                            : undefined}
                        />
                      ),
                    )}
                  </div>
                ))}
              </div>
              <span className="console-heatmap-month-label">{block.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="console-heatmap-legend">
        <span>Loss</span>
        <i style={{ background: 'color-mix(in srgb, var(--loss) 100%, transparent)' }} />
        <i style={{ background: 'color-mix(in srgb, var(--loss) 49%, transparent)' }} />
        <i style={{ background: 'var(--border-light)' }} />
        <i style={{ background: 'color-mix(in srgb, var(--gain) 49%, transparent)' }} />
        <i style={{ background: 'color-mix(in srgb, var(--gain) 100%, transparent)' }} />
        <span>Profit</span>
      </div>
    </div>
  )
}

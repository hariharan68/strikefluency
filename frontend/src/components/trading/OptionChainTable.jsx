import { useRef, useState, useEffect } from 'react'

function fmt(n) { return n != null ? Number(n).toFixed(2) : '—' }
function fmtOI(n) {
  if (!n) return '—'
  if (n >= 1e7) return (n/1e7).toFixed(1)+'Cr'
  if (n >= 1e5) return (n/1e5).toFixed(1)+'L'
  if (n >= 1e3) return (n/1e3).toFixed(1)+'K'
  return String(n)
}

function OIBar({ value, max, side }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: side === 'ce' ? 'flex-end' : 'flex-start' }}>
      <div style={{
        position: 'absolute',
        [side === 'ce' ? 'right' : 'left']: 0, top: 4, bottom: 4,
        width: pct + '%', minWidth: pct > 0 ? 1 : 0,
        background: side === 'ce' ? 'rgba(37,99,235,0.12)' : 'rgba(239,68,68,0.15)',
        borderRadius: side === 'ce' ? '4px 0 0 4px' : '0 4px 4px 0',
        transition: 'width 0.4s ease'
      }} />
      <span className="num" style={{ position: 'relative', color: 'var(--text-sub)', fontSize: 11, padding: '0 8px', zIndex: 1 }}>
        {fmtOI(value)}
      </span>
    </div>
  )
}

function PriceCell({ price, onClick, side }) {
  const [flash, setFlash] = useState(null)
  const prev = useRef(price)
  useEffect(() => {
    if (prev.current !== price && prev.current != null) {
      setFlash(price > prev.current ? 'green' : 'red')
      const t = setTimeout(() => setFlash(null), 700)
      prev.current = price
      return () => clearTimeout(t)
    }
    prev.current = price
  }, [price])

  return (
    <td
      onClick={onClick}
      className={flash === 'green' ? 'flash-green' : flash === 'red' ? 'flash-red' : ''}
      style={{
        padding: '0 10px', height: 36, textAlign: 'center',
        cursor: 'pointer', userSelect: 'none',
        color: side === 'ce' ? 'var(--primary-dark)' : 'var(--loss)',
        fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 500,
      }}
    >
      {price != null ? fmt(price) : '—'}
    </td>
  )
}

const TH = ({ children, align = 'center', color }) => (
  <th style={{
    padding: '8px 10px', textAlign: align, whiteSpace: 'nowrap',
    color: color || 'var(--text-muted)', fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: '1px solid var(--border)', background: 'var(--color-surface2)'
  }}>{children}</th>
)

export default function OptionChainTable({ data, onCellClick, instrument, loading }) {
  if (loading && !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: 'var(--text-muted)', fontSize: 13 }}>
      Loading option chain…
    </div>
  )
  if (!data?.strikes) return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
      No data — market may be closed or in mock mode
    </div>
  )

  const atmStrike = data.atm_strike
  const spotPrice = data.spot_price
  const maxCeOI = Math.max(...data.strikes.map(r => r.call?.open_interest || 0))
  const maxPeOI = Math.max(...data.strikes.map(r => r.put?.open_interest || 0))

  return (
    <div>
      {/* Spot strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, padding: '10px 14px',
        background: 'var(--color-surface2)', borderBottom: '1px solid var(--border)'
      }}>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>SPOT</span>
          <span className="num" style={{ color: 'var(--text)', fontSize: 16, fontWeight: 600 }}>
            {spotPrice ? spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
          </span>
        </div>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>ATM</span>
          <span className="num" style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>{atmStrike}</span>
        </div>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>EXPIRY</span>
          <span className="num" style={{ color: 'var(--text-sub)', fontSize: 12 }}>{data.expiry || 'Weekly'}</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Click LTP to prefill order →</span>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '11%' }} /><col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} /><col style={{ width: '11%' }} />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
            <tr>
              <TH align="right" color="var(--primary-dark)">OI (CE)</TH>
              <TH color="var(--primary-dark)">Chg%</TH>
              <TH color="var(--primary-dark)">IV</TH>
              <TH color="var(--primary-dark)">Vol</TH>
              <TH color="var(--primary-dark)">LTP ▼</TH>
              <TH color="var(--text)">STRIKE</TH>
              <TH color="var(--loss)">LTP ▼</TH>
              <TH color="var(--loss)">Vol</TH>
              <TH color="var(--loss)">IV</TH>
              <TH align="left" color="var(--loss)">OI (PE)</TH>
            </tr>
          </thead>
          <tbody>
            {data.strikes.map(row => {
              const isATM = row.strike === atmStrike
              const ceChg = row.call?.change_pct
              const peChg = row.put?.change_pct
              return (
                <tr key={row.strike} className="chain-row" style={{
                  background: isATM ? 'var(--primary-bg)' : 'transparent',
                  borderBottom: '1px solid var(--color-surface2)',
                  borderLeft: isATM ? '3px solid var(--primary)' : '3px solid transparent'
                }}>
                  <td style={{ padding: 0, height: 36 }}>
                    <OIBar value={row.call?.open_interest} max={maxCeOI} side="ce" />
                  </td>
                  <td className="num" style={{ padding: '0 6px', textAlign: 'center', fontSize: 11, color: (ceChg ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                    {ceChg != null ? `${ceChg > 0 ? '+' : ''}${ceChg.toFixed(1)}%` : '—'}
                  </td>
                  <td className="num" style={{ padding: '0 6px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                    {row.call?.iv ? row.call.iv.toFixed(1) : '—'}
                  </td>
                  <td className="num" style={{ padding: '0 6px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                    {fmtOI(row.call?.volume)}
                  </td>
                  <PriceCell price={row.call?.ltp} side="ce"
                    onClick={() => onCellClick && onCellClick(row.strike, 'CE', row.call?.ltp)} />
                  {/* Strike */}
                  <td style={{
                    padding: '0 6px', textAlign: 'center', height: 36,
                    fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600,
                    color: isATM ? 'var(--primary-dark)' : 'var(--text)',
                    background: isATM ? 'rgba(37,99,235,0.08)' : 'transparent'
                  }}>
                    {row.strike}
                    {isATM && (
                      <span style={{ fontSize: 8, background: 'var(--primary)', color: 'var(--on-primary)', padding: '1px 4px', borderRadius: 3, marginLeft: 4, verticalAlign: 'middle' }}>ATM</span>
                    )}
                  </td>
                  <PriceCell price={row.put?.ltp} side="pe"
                    onClick={() => onCellClick && onCellClick(row.strike, 'PE', row.put?.ltp)} />
                  <td className="num" style={{ padding: '0 6px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                    {fmtOI(row.put?.volume)}
                  </td>
                  <td className="num" style={{ padding: '0 6px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                    {row.put?.iv ? row.put.iv.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: 0, height: 36 }}>
                    <OIBar value={row.put?.open_interest} max={maxPeOI} side="pe" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

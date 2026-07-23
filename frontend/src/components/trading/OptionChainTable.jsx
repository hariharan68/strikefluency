import { useEffect, useRef, useState } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'

const number = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatPrice = value => value == null ? '—' : number(value).toFixed(2)

const formatOI = value => {
  const amount = number(value)
  if (!amount) return '—'
  if (amount >= 1e7) return `${(amount / 1e7).toFixed(1)}Cr`
  if (amount >= 1e5) return `${(amount / 1e5).toFixed(1)}L`
  if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`
  return String(amount)
}

const formatExpiry = value => {
  if (!value) return 'Weekly'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function OIBar({ value, max, side }) {
  const width = max > 0 ? Math.min(100, number(value) / max * 100) : 0
  return (
    <div className={`trade-oi-cell ${side}`}>
      <span className="trade-oi-bar" style={{ width: `${width}%` }} />
      <b className="num">{formatOI(value)}</b>
    </div>
  )
}

function PriceCell({ price, onClick, side, inTheMoney }) {
  const [flash, setFlash] = useState('')
  const previous = useRef(price)

  useEffect(() => {
    if (previous.current !== price && previous.current != null && price != null) {
      setFlash(number(price) > number(previous.current) ? 'flash-green' : 'flash-red')
      const timeout = setTimeout(() => setFlash(''), 700)
      previous.current = price
      return () => clearTimeout(timeout)
    }
    previous.current = price
    return undefined
  }, [price])

  return (
    <td className={`${inTheMoney ? 'itm' : ''} ${flash}`}>
      <button
        type="button"
        className={`trade-chain-price ${side}`}
        onClick={onClick}
        aria-label={`Select ${side === 'ce' ? 'call' : 'put'} at ${formatPrice(price)}`}
      >
        {formatPrice(price)}
      </button>
    </td>
  )
}

export default function OptionChainTable({ data, onCellClick, instrument, loading }) {
  if (loading && !data) {
    return (
      <div className="trade-chain-state">
        <RefreshCw size={17} className="sf-spin" />
        Loading {instrument} option chain…
      </div>
    )
  }

  if (!data?.strikes?.length) {
    return (
      <div className="trade-chain-state empty">
        <span><BarChart3 size={22} /></span>
        <strong>No option-chain data</strong>
        <p>The market may be closed or the selected provider has not returned strikes yet.</p>
      </div>
    )
  }

  const atmStrike = number(data.atm_strike)
  const spotPrice = number(data.spot_price)
  const legOI = leg => number(leg?.oi ?? leg?.open_interest)
  const maxCeOI = Math.max(0, ...data.strikes.map(row => legOI(row.ce || row.call)))
  const maxPeOI = Math.max(0, ...data.strikes.map(row => legOI(row.pe || row.put)))

  return (
    <div className="trade-chain">
      <div className="trade-chain-market-strip">
        <div><span>Spot</span><strong className="num">{spotPrice ? spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</strong></div>
        <div><span>ATM</span><strong className="num accent">{atmStrike || '—'}</strong></div>
        <div><span>Expiry</span><strong>{formatExpiry(data.expiry)}</strong></div>
        <p>Live virtual market data</p>
      </div>

      <div className="trade-chain-scroll">
        <table className="trade-chain-table">
          <colgroup>
            <col style={{ width: '10%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} /><col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="align-right ce">OI (CE)</th>
              <th className="ce">Chg%</th>
              <th className="ce">IV</th>
              <th className="ce">Vol</th>
              <th className="ce">LTP</th>
              <th>Strike</th>
              <th className="pe">LTP</th>
              <th className="pe">Vol</th>
              <th className="pe">IV</th>
              <th className="align-left pe">OI (PE)</th>
            </tr>
          </thead>
          <tbody>
            {data.strikes.map(row => {
              const strike = number(row.strike)
              const isAtm = strike === atmStrike
              const ce = row.ce || row.call || {}
              const pe = row.pe || row.put || {}
              const ceOI = legOI(ce)
              const peOI = legOI(pe)
              const ceChange = ce.oi_change != null && ceOI
                ? number(ce.oi_change) / ceOI * 100
                : ce.change_pct != null ? number(ce.change_pct) : null
              const peChange = pe.oi_change != null && peOI
                ? number(pe.oi_change) / peOI * 100
                : pe.change_pct != null ? number(pe.change_pct) : null
              const callItm = !isAtm && spotPrice > 0 && strike < spotPrice
              const putItm = !isAtm && spotPrice > 0 && strike > spotPrice

              return (
                <tr key={row.strike} className={isAtm ? 'atm' : ''}>
                  <td className={callItm ? 'itm' : ''}><OIBar value={ceOI} max={maxCeOI} side="ce" /></td>
                  <td className={`num ${callItm ? 'itm' : ''} ${(ceChange ?? 0) >= 0 ? 'gain' : 'loss'}`}>
                    {ceChange == null ? '—' : `${ceChange > 0 ? '+' : ''}${ceChange.toFixed(1)}%`}
                  </td>
                  <td className={`num muted ${callItm ? 'itm' : ''}`}>{ce.iv == null ? '—' : number(ce.iv).toFixed(1)}</td>
                  <td className={`num muted ${callItm ? 'itm' : ''}`}>{formatOI(ce.volume)}</td>
                  <PriceCell
                    price={ce.ltp}
                    side="ce"
                    inTheMoney={callItm}
                    onClick={() => onCellClick?.(strike, 'CE', ce.ltp)}
                  />
                  <td className="trade-strike-cell">
                    <strong className="num">{strike}</strong>
                    {isAtm && <span>ATM</span>}
                  </td>
                  <PriceCell
                    price={pe.ltp}
                    side="pe"
                    inTheMoney={putItm}
                    onClick={() => onCellClick?.(strike, 'PE', pe.ltp)}
                  />
                  <td className={`num muted ${putItm ? 'itm' : ''}`}>{formatOI(pe.volume)}</td>
                  <td className={`num muted ${putItm ? 'itm' : ''}`}>{pe.iv == null ? '—' : number(pe.iv).toFixed(1)}</td>
                  <td className={putItm ? 'itm' : ''}><OIBar value={peOI} max={maxPeOI} side="pe" /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

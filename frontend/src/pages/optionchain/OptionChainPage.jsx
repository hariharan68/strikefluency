import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Clock,
  ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown } from 'lucide-react'
import { getOptionMetrics, getOptionChainData } from '../../api/options'

const INSTRUMENTS = [
  { name: 'NIFTY', badge: '50' },
  { name: 'BANKNIFTY', badge: 'BNK' },
  { name: 'SENSEX', badge: 'BSE' },
]
const WINDOWS = [5, 10, 15, 20, 'All']
const POLL_MS = 15000

// ── Indian number formatting (K / L / Cr) ────────────────────
function fmtOI(n) {
  if (n == null) return '—'
  const a = Math.abs(n)
  if (a >= 1e7) return (n / 1e7).toFixed(2) + ' Cr'
  if (a >= 1e5) return (n / 1e5).toFixed(2) + ' L'
  if (a >= 1e3) return (n / 1e3).toFixed(1) + ' K'
  return String(Math.round(n))
}
const fmtNum = (n, d = 2) => (n == null ? '—' : Number(n).toFixed(d))

// ── Buildup pills (arrow icon + code, colored) ───────────────
const BUILDUP = {
  LONG_BUILDUP:   { code: 'L',  Icon: ArrowUpRight,   fg: '#0b3d1f', bg: '#31dd6a', label: 'Long Build-up' },
  SHORT_COVERING: { code: 'SC', Icon: ArrowUp,        fg: '#0b3d1f', bg: '#4fe483', label: 'Short Covering' },
  SHORT_BUILDUP:  { code: 'S',  Icon: ArrowDownRight, fg: '#3d0b0b', bg: '#ff5c5c', label: 'Short Build-up' },
  LONG_UNWINDING: { code: 'LU', Icon: ArrowDown,      fg: '#3d0b0b', bg: '#ff7b7b', label: 'Long Unwinding' },
}

function BuildupPill({ label }) {
  const b = BUILDUP[label]
  if (!b) return null
  const { Icon } = b
  return (
    <span title={b.label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10.5, fontWeight: 800,
      padding: '2px 7px', borderRadius: 6, background: b.bg, color: b.fg,
    }}>
      <Icon size={11} strokeWidth={3} />{b.code}
    </span>
  )
}

const Card = ({ children, style = {} }) => (
  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 14, ...style }}>{children}</div>
)

function HeaderStat({ label, value, sub, subColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{label}</span>
      <span className="num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{value}</span>
      {sub != null && <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: subColor }}>{sub}</span>}
    </div>
  )
}

function Chip({ label, value, tone }) {
  const color = tone === 'gain' ? 'var(--gain-text)' : tone === 'loss' ? 'var(--loss-text)' : tone === 'warn' ? 'var(--warn)' : 'var(--text)'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <span className="eyebrow" style={{ fontSize: 9 }}>{label}</span>
      <span className="num" style={{ fontSize: 13.5, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

// center-anchored OI bar under the value
function OIBar({ value, max, side }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color = side === 'ce' ? 'var(--gain-bar)' : 'var(--loss-bar)'
  const anchor = side === 'ce' ? { right: 0 } : { left: 0 }
  return (
    <div style={{ position: 'relative', height: 4, background: 'var(--color-surface2)', borderRadius: 3, marginTop: 4, width: '100%' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, ...anchor, width: `${pct}%`, background: color, borderRadius: 3, opacity: 0.85 }} />
    </div>
  )
}

function ChgPct({ oi, oiChange }) {
  const base = Math.abs((oi || 0) - (oiChange || 0))
  const pct = base > 0 ? (oiChange / base) * 100 : 0
  const c = pct >= 0 ? 'var(--gain)' : 'var(--loss)'
  return <span className="num" style={{ fontSize: 11.5, color: c }}>{pct >= 0 ? '+' : ''}{pct.toFixed(0)}%</span>
}

// volume cell with top-3 rank highlight
function VolCell({ value, rank, align }) {
  const highlighted = rank != null && rank <= 3
  return (
    <span className="num" title={highlighted ? `Volume Rank ${rank}` : undefined} style={{
      fontSize: 12, color: highlighted ? 'var(--gain-text)' : 'var(--text-muted)',
      background: highlighted ? 'var(--gain-bg)' : 'transparent',
      padding: highlighted ? '2px 8px' : 0, borderRadius: 6, fontWeight: highlighted ? 700 : 400,
      display: 'inline-block', textAlign: align,
    }}>{fmtOI(value)}</span>
  )
}

export default function OptionChainPage() {
  const [idx, setIdx] = useState(0)
  const [expiry, setExpiry] = useState(null)
  const [expiryOpen, setExpiryOpen] = useState(false)
  const [metrics, setMetrics] = useState(null)
  const [chain, setChain] = useState(null)
  const [strikeCount, setStrikeCount] = useState(5)
  const [now, setNow] = useState(new Date())
  const [err, setErr] = useState('')
  const timer = useRef(null)
  const instrument = INSTRUMENTS[idx].name

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const load = async (inst, exp) => {
    try {
      const [m, c] = await Promise.all([getOptionMetrics(inst, exp), getOptionChainData(inst, exp)])
      setMetrics(m.data)
      setChain(c.data)
      setErr('')
    } catch (e) {
      setErr(e.response?.data?.detail || 'Unable to load option chain')
    }
  }

  // reset expiry when instrument changes
  useEffect(() => { setExpiry(null) }, [idx])

  useEffect(() => {
    load(instrument, expiry)
    clearInterval(timer.current)
    timer.current = setInterval(() => load(instrument, expiry), POLL_MS)
    return () => clearInterval(timer.current)
  }, [instrument, expiry])

  const cycle = (dir) => setIdx(i => (i + dir + INSTRUMENTS.length) % INSTRUMENTS.length)

  const model = useMemo(() => {
    if (!chain?.chain_rows?.length) return null
    const byStrike = new Map()
    for (const r of chain.chain_rows) {
      if (!byStrike.has(r.strike)) byStrike.set(r.strike, { strike: r.strike, ce: null, pe: null })
      byStrike.get(r.strike)[r.option_type === 'CE' ? 'ce' : 'pe'] = r
    }
    let all = [...byStrike.values()].sort((a, b) => a.strike - b.strike)
    const atm = chain.atm_strike
    const atmIdx = all.reduce((best, row, i) => Math.abs(row.strike - atm) < Math.abs(all[best].strike - atm) ? i : best, 0)
    if (strikeCount !== 'All') {
      all = all.slice(Math.max(0, atmIdx - strikeCount), Math.min(all.length, atmIdx + strikeCount + 1))
    }
    const maxCe = Math.max(1, ...all.map(r => r.ce?.oi || 0))
    const maxPe = Math.max(1, ...all.map(r => r.pe?.oi || 0))
    // volume ranks per side
    const rankMap = (key) => {
      const sorted = [...all].filter(r => r[key]?.volume).sort((a, b) => b[key].volume - a[key].volume)
      const m = new Map()
      sorted.forEach((r, i) => m.set(r.strike, i + 1))
      return m
    }
    return { rows: all, atm, maxCe, maxPe, maxPain: chain.max_pain_strike, ceRank: rankMap('ce'), peRank: rankMap('pe') }
  }, [chain, strikeCount])

  const change = metrics?.change_pct ?? 0
  const chgColor = change >= 0 ? 'var(--gain)' : 'var(--loss)'
  const futChange = 0
  const ist = now.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' })
  const expiries = metrics?.expiries || []
  const curExpiry = expiry || metrics?.expiry_date
  const expLabel = (() => {
    if (!curExpiry) return '—'
    const d = new Date(curExpiry)
    const days = Math.max(0, Math.round((d - new Date()) / 86400000))
    return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} (${days}d)`
  })()

  const th = { padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const td = { padding: '9px 12px', fontSize: 12.5 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Header card ── */}
      <Card style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {/* instrument cycling pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 6px' }}>
            <button onClick={() => cycle(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><ChevronLeft size={16} /></button>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--warn)', color: '#131313', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{INSTRUMENTS[idx].badge}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', padding: '0 4px' }}>{instrument}</span>
            <button onClick={() => cycle(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><ChevronRight size={16} /></button>
          </div>

          {/* expiry dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setExpiryOpen(o => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
              {expLabel} <ChevronDown size={14} color="var(--text-muted)" />
            </button>
            {expiryOpen && expiries.length > 0 && (
              <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 10, background: 'var(--color-surface)', border: '1px solid var(--border2, var(--border))', borderRadius: 10, boxShadow: 'var(--shadow-md)', padding: 4, minWidth: 150 }}>
                {expiries.map(e => {
                  const d = new Date(e)
                  const days = Math.max(0, Math.round((d - new Date()) / 86400000))
                  return (
                    <button key={e} onClick={() => { setExpiry(e); setExpiryOpen(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: e === curExpiry ? 'var(--primary-bg)' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 12.5, padding: '7px 10px', borderRadius: 6 }}>
                      {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} <span style={{ color: 'var(--text-muted)' }}>({days}d)</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {metrics && <>
            <HeaderStat label="Spot" value={fmtNum(metrics.spot)} sub={`${change >= 0 ? '' : ''}${change.toFixed(2)}%`} subColor={chgColor} />
            <HeaderStat label="Future" value={fmtNum(metrics.future)} sub={`${futChange.toFixed(2)}%`} subColor="var(--text-muted)" />
            <HeaderStat label="VIX" value={metrics.vix != null ? fmtNum(metrics.vix) : '—'} />
          </>}

          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: 12.5 }}>
            <Clock size={13} /> <span className="num">{now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, {ist}</span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gain)', boxShadow: '0 0 6px var(--gain)' }} />
          </div>
        </div>
      </Card>

      {/* ── Presets + chips bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Strikes ±ATM</span>
          <div style={{ display: 'flex', background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
            {WINDOWS.map(w => (
              <button key={w} onClick={() => setStrikeCount(w)} className="toggle-btn"
                style={{ fontSize: 12, padding: '4px 12px', minWidth: 0, background: strikeCount === w ? 'var(--primary)' : 'transparent', color: strikeCount === w ? 'var(--on-primary)' : 'var(--text-sub)' }}>
                {w === 'All' ? 'All' : `±${w}`}
              </button>
            ))}
          </div>
        </div>
        {metrics && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="PCR" value={fmtNum(metrics.pcr_oi)} tone={metrics.pcr_oi >= 1 ? 'gain' : 'loss'} />
            <Chip label="Max Pain" value={Math.round(metrics.max_pain_strike)} tone="warn" />
            <Chip label="ATM IV" value={metrics.atm_iv != null ? `${metrics.atm_iv}%` : '—'} />
          </div>
        )}
      </div>

      {err && <div style={{ background: 'var(--loss-bg)', border: '1px solid var(--loss)', borderRadius: 8, padding: '10px 14px', color: 'var(--loss-text)', fontSize: 13 }}>{err}</div>}

      {/* ── Chain table ── */}
      <Card style={{ overflow: 'hidden' }}>
        {!model ? (
          <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading chain…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th colSpan={5} style={{ ...th, textAlign: 'center', color: 'var(--gain-text)', background: 'var(--gain-bg)', padding: '9px 12px', fontSize: 12 }}>CALL</th>
                  <th colSpan={2} style={{ ...th, background: 'var(--color-surface2)' }}></th>
                  <th colSpan={5} style={{ ...th, textAlign: 'center', color: 'var(--loss-text)', background: 'var(--loss-bg)', padding: '9px 12px', fontSize: 12 }}>PUT</th>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Buildup</th>
                  <th style={{ ...th, textAlign: 'right' }}>Volume</th>
                  <th style={{ ...th, textAlign: 'right' }}>OI Chg%</th>
                  <th style={{ ...th, textAlign: 'right' }}>OI</th>
                  <th style={{ ...th, textAlign: 'right' }}>LTP</th>
                  <th style={{ ...th, textAlign: 'center', background: 'var(--color-surface2)' }}>Strike</th>
                  <th style={{ ...th, textAlign: 'center', background: 'var(--color-surface2)' }}>IV</th>
                  <th style={{ ...th, textAlign: 'left' }}>LTP</th>
                  <th style={{ ...th, textAlign: 'left' }}>OI</th>
                  <th style={{ ...th, textAlign: 'left' }}>OI Chg%</th>
                  <th style={{ ...th, textAlign: 'left' }}>Volume</th>
                  <th style={{ ...th, textAlign: 'right' }}>Buildup</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map(row => {
                  const isAtm = row.strike === model.atm
                  const isPain = row.strike === model.maxPain
                  const iv = row.ce?.iv ?? row.pe?.iv
                  // ITM wash: a call is in-the-money below spot, a put above it.
                  const spot = metrics?.spot ?? model.atm
                  const ceBg = !isAtm && spot > 0 && row.strike < spot ? 'var(--itm-bg)' : undefined
                  const peBg = !isAtm && spot > 0 && row.strike > spot ? 'var(--itm-bg)' : undefined
                  return (
                    <tr key={row.strike} className="chain-row" style={{ borderBottom: '1px solid var(--color-surface2)', background: isAtm ? 'rgba(245,196,81,0.07)' : 'transparent' }}>
                      {/* CALL */}
                      <td style={{ ...td, background: ceBg }}><BuildupPill label={row.ce?.buildup_label} /></td>
                      <td style={{ ...td, textAlign: 'right', background: ceBg }}><VolCell value={row.ce?.volume} rank={model.ceRank.get(row.strike)} align="right" /></td>
                      <td style={{ ...td, textAlign: 'right', background: ceBg }}>{row.ce && <ChgPct oi={row.ce.oi} oiChange={row.ce.oi_change} />}</td>
                      <td style={{ ...td, textAlign: 'right', minWidth: 96, background: ceBg }}>
                        {row.ce && <><span className="num" style={{ fontSize: 12, color: 'var(--text-sub)' }}>{fmtOI(row.ce.oi)}</span><OIBar value={row.ce.oi} max={model.maxCe} side="ce" /></>}
                      </td>
                      <td className="num" style={{ ...td, textAlign: 'right', color: 'var(--gain-text)', fontWeight: 600, background: ceBg }}>{fmtNum(row.ce?.ltp)}</td>
                      {/* STRIKE + IV */}
                      <td style={{ ...td, textAlign: 'center', background: isAtm ? 'rgba(245,196,81,0.13)' : 'var(--color-surface2)' }}>
                        <span className="num" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{Math.round(row.strike)}</span>
                        {isAtm && <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 800, color: 'var(--warn)', background: 'var(--warn-bg)', borderRadius: 4, padding: '1px 5px' }}>ATM</span>}
                        {isPain && <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 800, color: 'var(--warn)', background: 'rgba(245,196,81,0.22)', borderRadius: 4, padding: '1px 5px' }}>MAX PAIN</span>}
                      </td>
                      <td className="num" style={{ ...td, textAlign: 'center', color: 'var(--text-sub)', background: isAtm ? 'rgba(245,196,81,0.13)' : 'var(--color-surface2)' }}>{iv && iv > 0 ? iv.toFixed(1) : '—'}</td>
                      {/* PUT */}
                      <td className="num" style={{ ...td, textAlign: 'left', color: 'var(--loss-text)', fontWeight: 600, background: peBg }}>{fmtNum(row.pe?.ltp)}</td>
                      <td style={{ ...td, textAlign: 'left', minWidth: 96, background: peBg }}>
                        {row.pe && <><span className="num" style={{ fontSize: 12, color: 'var(--text-sub)' }}>{fmtOI(row.pe.oi)}</span><OIBar value={row.pe.oi} max={model.maxPe} side="pe" /></>}
                      </td>
                      <td style={{ ...td, textAlign: 'left', background: peBg }}>{row.pe && <ChgPct oi={row.pe.oi} oiChange={row.pe.oi_change} />}</td>
                      <td style={{ ...td, textAlign: 'left', background: peBg }}><VolCell value={row.pe?.volume} rank={model.peRank.get(row.strike)} align="left" /></td>
                      <td style={{ ...td, textAlign: 'right', background: peBg }}><BuildupPill label={row.pe?.buildup_label} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '11px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
          {Object.values(BUILDUP).map(b => {
            const { Icon } = b
            return (
              <span key={b.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 5, background: b.bg, color: b.fg }}><Icon size={10} strokeWidth={3} />{b.code}</span>
                {b.label}
              </span>
            )
          })}
          <span style={{ marginLeft: 'auto' }}>Top-3 volumes highlighted · Refreshes every 15s · OI lags exchange 1–3 min</span>
        </div>
      </Card>
    </div>
  )
}

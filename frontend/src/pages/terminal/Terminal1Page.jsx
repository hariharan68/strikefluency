import { useEffect, useRef, useState } from 'react'
import { getSpot, getStatus } from '../../api/market'
import { Radio, ArrowUp, ArrowDown, Minus, Clock, Activity } from 'lucide-react'

const INDICES = [
  { key: 'NIFTY', label: 'NIFTY 50', accent: '#adc9ff' },
  { key: 'BANKNIFTY', label: 'BANK NIFTY', accent: '#dbbdff' },
  { key: 'SENSEX', label: 'SENSEX', accent: '#31dd6a' },
]

const POLL_MS = 3000
const MAX_TICKS = 40

function fmt(n) {
  if (n == null || Number.isNaN(n) || n === 0) return '—'
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Tick sparkline ────────────────────────────────────────────────
function Sparkline({ data = [], color = 'var(--primary)', w = 240, h = 52 }) {
  if (!data || data.length < 2) {
    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke={color} strokeWidth="1.5" opacity="0.3" strokeLinecap="round" />
      </svg>
    )
  }
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1, pad = 4
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  })
  const gid = `sg-${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`${pad},${h} ${pts.join(' ')} ${w - pad},${h}`} fill={`url(#${gid})`} stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Index card ────────────────────────────────────────────────────
function IndexCard({ label, accent, tick, isOpen }) {
  const { ltp, dir, chg, chgPct, hist = [], high, low, ts } = tick || {}
  const dirColor = dir === 'up' ? 'var(--gain)' : dir === 'down' ? 'var(--loss)' : 'var(--text-muted)'
  const DirIcon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus
  const flash = dir === 'up' ? 'flash-green' : dir === 'down' ? 'flash-red' : ''

  return (
    <div className="sf-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOpen ? 'var(--gain)' : 'var(--text-muted)' }}
            className={isOpen ? 'blink' : ''} />
          <span className="eyebrow" style={{ color: accent, letterSpacing: '0.14em' }}>{label}</span>
        </div>
        <span className="eyebrow" style={{ fontSize: 10, color: isOpen ? 'var(--gain)' : 'var(--text-muted)' }}>
          {isOpen ? 'LIVE' : 'CLOSED'}
        </span>
      </div>

      {/* price */}
      <div>
        <div key={ts || 0} className={flash} style={{ borderRadius: 8, display: 'inline-block', padding: '2px 6px', margin: '-2px -6px' }}>
          <span className="num" style={{ fontSize: 38, fontWeight: 700, color: 'var(--text)', lineHeight: 1.05, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
            {fmt(ltp)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: dirColor, fontSize: 14, fontWeight: 600 }}>
            <DirIcon size={15} strokeWidth={2.4} />
            <span className="num">{chg == null ? '—' : `${chg >= 0 ? '+' : ''}${fmt(Math.abs(chg))}`}</span>
          </span>
          {chgPct != null && (
            <span className="num" style={{ fontSize: 12, fontWeight: 600, color: dirColor, background: `color-mix(in srgb, ${dirColor} 14%, transparent)`, padding: '2px 8px', borderRadius: 999 }}>
              {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%
            </span>
          )}
          <span className="eyebrow" style={{ marginLeft: 'auto', fontSize: 10 }}>since open</span>
        </div>
      </div>

      {/* sparkline */}
      <Sparkline data={hist} color={accent} />

      {/* footer stats */}
      <div style={{ display: 'flex', gap: 18, borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>Session High</div>
          <div className="num" style={{ color: 'var(--gain)', fontSize: 13, fontWeight: 600, marginTop: 3 }}>{fmt(high)}</div>
        </div>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>Session Low</div>
          <div className="num" style={{ color: 'var(--loss)', fontSize: 13, fontWeight: 600, marginTop: 3 }}>{fmt(low)}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="eyebrow" style={{ fontSize: 10 }}>Updated</div>
          <div className="num" style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, marginTop: 3 }}>
            {ts ? new Date(ts).toLocaleTimeString('en-IN', { hour12: false }) : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function Terminal1Page() {
  const [ticks, setTicks] = useState({})   // { NIFTY: {ltp,dir,chg,chgPct,hist,high,low,ts}, ... }
  const [status, setStatus] = useState(null)
  const [connected, setConnected] = useState(false)
  const baselineRef = useRef({})            // first observed price per index

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const [statusRes, ...spotRes] = await Promise.all([
          getStatus(),
          ...INDICES.map(i => getSpot(i.key)),
        ])
        if (cancelled) return
        setStatus(statusRes.data)
        setConnected(true)

        setTicks(prev => {
          const next = { ...prev }
          INDICES.forEach((idx, i) => {
            const ltp = Number(spotRes[i]?.data?.spot_price ?? 0)
            if (!ltp) { next[idx.key] = prev[idx.key]; return }
            if (baselineRef.current[idx.key] == null) baselineRef.current[idx.key] = ltp
            const base = baselineRef.current[idx.key]
            const before = prev[idx.key]
            const prevLtp = before?.ltp
            const dir = prevLtp == null ? 'flat' : ltp > prevLtp ? 'up' : ltp < prevLtp ? 'down' : (before?.dir || 'flat')
            const hist = [...(before?.hist || []), ltp].slice(-MAX_TICKS)
            next[idx.key] = {
              ltp, dir,
              chg: ltp - base,
              chgPct: base ? ((ltp - base) / base) * 100 : 0,
              hist,
              high: Math.max(before?.high ?? ltp, ltp),
              low: Math.min(before?.low ?? ltp, ltp),
              ts: Date.now(),
            }
          })
          return next
        })
      } catch {
        if (!cancelled) setConnected(false)
      }
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const isOpen = !!status?.is_open

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* status bar */}
      <div className="sf-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--tile)', display: 'grid', placeItems: 'center' }}>
            <Radio size={16} color="var(--primary)" />
          </span>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', fontFamily: "'Inter', sans-serif" }}>Live Index Feed</span>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
          color: isOpen ? 'var(--gain)' : 'var(--loss)',
          background: isOpen ? 'var(--gain-bg)' : 'var(--loss-bg)', borderRadius: 999, padding: '4px 12px' }}>
          <span className={`sf-market-dot ${isOpen ? 'open' : ''}`} style={{ background: isOpen ? 'var(--gain)' : 'var(--loss)' }} />
          Market {isOpen ? 'Open' : 'Closed'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-sub)', fontSize: 12 }}>
          <Clock size={13} /> <span className="num">{status?.time_ist || '--:--:--'}</span> IST
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: connected ? 'var(--gain-text)' : 'var(--text-muted)' }}>
          <Activity size={13} className={connected ? 'blink' : ''} />
          {connected ? `Streaming · ${status?.provider || 'feed'}` : 'Connecting…'}
        </span>
      </div>

      {/* index cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        {INDICES.map(idx => (
          <IndexCard key={idx.key} label={idx.label} accent={idx.accent} tick={ticks[idx.key]} isOpen={isOpen} />
        ))}
      </div>

      <p className="eyebrow" style={{ fontSize: 10, textAlign: 'center', opacity: 0.7 }}>
        Spot prices update every {POLL_MS / 1000}s · session high/low and change are measured since this terminal was opened
      </p>
    </div>
  )
}

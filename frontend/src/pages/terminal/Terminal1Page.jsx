import { useEffect, useRef, useState, useCallback } from 'react'
import { getSpot, getStatus } from '../../api/market'
import { getOptionMetrics } from '../../api/options'
import useMarketStore from '../../store/marketStore'
import { Radio, ArrowUp, ArrowDown, Minus, Clock, Activity, Scale, Target } from 'lucide-react'

const INDICES = [
  { key: 'NIFTY', label: 'NIFTY 50', short: 'NIFTY', accent: '#adc9ff' },
  { key: 'BANKNIFTY', label: 'BANK NIFTY', short: 'BANKNIFTY', accent: '#dbbdff' },
  { key: 'SENSEX', label: 'SENSEX', short: 'SENSEX', accent: '#31dd6a' },
]

const POLL_MS = 3000
const METRICS_POLL_MS = 15000
const MAX_TICKS = 40
// WS freshness windows — REST polling only kicks in when frames stop arriving.
const CHAIN_FRESH_MS = 10000     // chains tick every 3s
const SLOW_FRESH_MS = 45000      // metrics/status tick every 15s / 3s

function fmt(n) {
  if (n == null || Number.isNaN(n) || n === 0) return '—'
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtInt(n) {
  if (n == null || Number.isNaN(n) || n === 0) return '—'
  return Math.round(Number(n)).toLocaleString('en-IN')
}

// PCR reading → sentiment label (put-heavy = downside protection / bullish support)
function pcrSentiment(pcr) {
  if (pcr == null || pcr === 0) return { label: '—', tone: 'var(--text-muted)' }
  if (pcr >= 1.2) return { label: 'Put-heavy', tone: 'var(--gain-text)' }
  if (pcr <= 0.8) return { label: 'Call-heavy', tone: 'var(--loss-text)' }
  return { label: 'Balanced', tone: 'var(--text-sub)' }
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

// ── Essential metric tile ─────────────────────────────────────────
function MetricTile({ label, value, sub, subColor, accent }) {
  return (
    <div style={{ flex: '1 1 130px', minWidth: 130, background: 'var(--tile)', border: '1px solid var(--border-light)', borderRadius: 12, padding: '13px 15px' }}>
      <div className="eyebrow" style={{ fontSize: 9.5, color: accent || 'var(--text-muted)' }}>{label}</div>
      <div className="num" style={{ fontSize: 21, fontWeight: 700, color: 'var(--text)', marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub != null && <div style={{ fontSize: 11, fontWeight: 600, color: subColor || 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── Essentials strip (PCR / Max Pain / … for the selected index) ───
function Essentials({ label, accent, metrics, loading, err }) {
  const pcr = metrics?.pcr_oi
  const sentiment = pcrSentiment(pcr)
  const ivPct = metrics?.iv_percentile_label

  return (
    <div className="sf-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--tile)', display: 'grid', placeItems: 'center' }}>
          <Scale size={15} color="var(--primary)" />
        </span>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', fontFamily: "'Inter', sans-serif" }}>Option Essentials</span>
        <span className="eyebrow" style={{ fontSize: 10, color: accent, letterSpacing: '0.12em' }}>{label}</span>
        {metrics?.expiry_date && (
          <span className="eyebrow" style={{ fontSize: 10, marginLeft: 'auto' }}>
            <Target size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            Expiry {new Date(metrics.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>

      {err ? (
        <div style={{ background: 'var(--loss-bg)', border: '1px solid var(--loss)', borderRadius: 8, padding: '10px 14px', color: 'var(--loss-text)', fontSize: 12.5 }}>{err}</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, opacity: loading && !metrics ? 0.5 : 1 }}>
          <MetricTile
            label="PCR (OI)" accent={accent}
            value={pcr != null && pcr !== 0 ? pcr.toFixed(2) : '—'}
            sub={sentiment.label} subColor={sentiment.tone}
          />
          <MetricTile
            label="PCR (Volume)"
            value={metrics?.pcr_volume != null && metrics.pcr_volume !== 0 ? metrics.pcr_volume.toFixed(2) : '—'}
          />
          <MetricTile
            label="Max Pain" accent="var(--warn)"
            value={fmtInt(metrics?.max_pain_strike)}
            sub={metrics?.spot ? `Spot ${fmtInt(metrics.spot)}` : null}
          />
          <MetricTile
            label="ATM IV"
            value={metrics?.atm_iv != null ? `${metrics.atm_iv}%` : '—'}
            sub={ivPct} subColor="var(--text-sub)"
          />
          <MetricTile
            label="Support"
            value={fmtInt(metrics?.support_strike)} subColor="var(--gain-text)"
          />
          <MetricTile
            label="Resistance"
            value={fmtInt(metrics?.resistance_strike)} subColor="var(--loss-text)"
          />
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function Terminal1Page() {
  const [ticks, setTicks] = useState({})   // { NIFTY: {ltp,dir,chg,chgPct,hist,high,low,ts}, ... }
  const [status, setStatus] = useState(null)
  const [connected, setConnected] = useState(false)
  const [selected, setSelected] = useState('NIFTY')   // index driving the essentials strip
  const [metrics, setMetrics] = useState(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsErr, setMetricsErr] = useState('')
  const baselineRef = useRef({})            // first observed price per index

  // Shared tick reducer — both the WS feed and the REST fallback funnel their
  // spot prices through this, so direction/history/high-low logic lives once.
  const applySpots = useCallback((spotsByKey) => {
    setTicks(prev => {
      const next = { ...prev }
      INDICES.forEach((idx) => {
        const ltp = Number(spotsByKey[idx.key] ?? 0)
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
  }, [])

  // ── WS feed: spots from the 3s chain broadcast, status from its own frame ──
  const chains = useMarketStore(s => s.chains)
  const chainAt = useMarketStore(s => s.lastUpdate)
  const wsStatus = useMarketStore(s => s.status)
  const statusAt = useMarketStore(s => s.statusAt)
  const wsMetrics = useMarketStore(s => s.metrics[selected])

  useEffect(() => {
    if (!chainAt || Date.now() - chainAt > CHAIN_FRESH_MS) return
    const spots = {}
    INDICES.forEach(idx => { spots[idx.key] = chains[idx.key]?.spot_price })
    if (Object.values(spots).some(v => v != null)) {
      applySpots(spots)
      setConnected(true)
    }
  }, [chains, chainAt, applySpots])

  useEffect(() => {
    if (wsStatus && statusAt && Date.now() - statusAt < SLOW_FRESH_MS) {
      setStatus(wsStatus)
      setConnected(true)
    }
  }, [wsStatus, statusAt])

  // ── REST fallback: identical behavior to before, but only when WS is stale ──
  useEffect(() => {
    let cancelled = false

    async function poll() {
      const { lastUpdate } = useMarketStore.getState()
      if (lastUpdate && Date.now() - lastUpdate < CHAIN_FRESH_MS) return
      try {
        const [statusRes, ...spotRes] = await Promise.all([
          getStatus(),
          ...INDICES.map(i => getSpot(i.key)),
        ])
        if (cancelled) return
        setStatus(statusRes.data)
        setConnected(true)
        const spots = {}
        INDICES.forEach((idx, i) => { spots[idx.key] = spotRes[i]?.data?.spot_price })
        applySpots(spots)
      } catch {
        if (!cancelled) setConnected(false)
      }
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [applySpots])

  // ── essentials (PCR / max pain / IV …) for the selected index ──
  // WS metrics frames feed the panel directly; REST fills in when stale.
  useEffect(() => {
    if (wsMetrics?.data && Date.now() - wsMetrics.at < SLOW_FRESH_MS) {
      setMetrics(wsMetrics.data)
      setMetricsErr('')
      setMetricsLoading(false)
    }
  }, [wsMetrics])

  useEffect(() => {
    let cancelled = false
    setMetricsLoading(true)
    setMetrics(null)

    async function pollMetrics() {
      const ws = useMarketStore.getState().metrics[selected]
      if (ws?.data && Date.now() - ws.at < SLOW_FRESH_MS) {
        if (!cancelled) { setMetrics(ws.data); setMetricsErr(''); setMetricsLoading(false) }
        return
      }
      try {
        const res = await getOptionMetrics(selected)
        if (cancelled) return
        setMetrics(res.data)
        setMetricsErr('')
      } catch (e) {
        if (!cancelled) setMetricsErr(e.response?.data?.detail || 'Unable to load option metrics')
      } finally {
        if (!cancelled) setMetricsLoading(false)
      }
    }

    pollMetrics()
    const id = setInterval(pollMetrics, METRICS_POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [selected])

  const isOpen = !!status?.is_open
  const selectedMeta = INDICES.find(i => i.key === selected) || INDICES[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* index selector bar */}
      <div className="sf-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>Index</span>
        <div style={{ display: 'flex', gap: 4, background: 'var(--tile)', border: '1px solid var(--border-light)', borderRadius: 10, padding: 4 }}>
          {INDICES.map(i => {
            const active = i.key === selected
            return (
              <button key={i.key} onClick={() => setSelected(i.key)} className="toggle-btn"
                style={{
                  fontSize: 12.5, fontWeight: 700, padding: '6px 16px', border: 'none', borderRadius: 7, cursor: 'pointer',
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--on-primary)' : 'var(--text-sub)',
                }}>
                {i.short}
              </button>
            )
          })}
        </div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
          <span className="eyebrow" style={{ fontSize: 10, color: selectedMeta.accent }}>{selectedMeta.label}</span>
          <span className="num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(ticks[selected]?.ltp)}
          </span>
        </span>
      </div>

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
          <div key={idx.key} onClick={() => setSelected(idx.key)} style={{ cursor: 'pointer', borderRadius: 16, outline: idx.key === selected ? `2px solid ${idx.accent}` : 'none', outlineOffset: 2 }}>
            <IndexCard label={idx.label} accent={idx.accent} tick={ticks[idx.key]} isOpen={isOpen} />
          </div>
        ))}
      </div>

      {/* option essentials for the selected index */}
      <Essentials label={selectedMeta.label} accent={selectedMeta.accent} metrics={metrics} loading={metricsLoading} err={metricsErr} />

      <p className="eyebrow" style={{ fontSize: 10, textAlign: 'center', opacity: 0.7 }}>
        Spot prices update every {POLL_MS / 1000}s · option essentials every {METRICS_POLL_MS / 1000}s · PCR &amp; Max Pain reflect the {selectedMeta.label} nearest expiry
      </p>
    </div>
  )
}

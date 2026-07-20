import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Minus, Trash2, Layers, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { getOptionChainData, getOptionMetrics } from '../../api/options'
import { getTemplates, expandTemplate, analyzeLegs } from '../../api/strategy'
import PayoffChart from '../../components/strategy/PayoffChart'
import { formatCurrency } from '../../utils/formatters'
import { useToast } from '../../components/common/Toast'

const INSTRUMENTS = [
  { name: 'NIFTY', badge: '50' },
  { name: 'BANKNIFTY', badge: 'BNK' },
  { name: 'SENSEX', badge: 'BSE' },
]
const CATEGORIES = [
  { key: 'BULLISH', label: 'Bullish' }, { key: 'BEARISH', label: 'Bearish' },
  { key: 'NEUTRAL', label: 'Neutral' }, { key: 'OTHER', label: 'Other' },
]
const WINDOWS = [5, 10, 15, 20, 'All']
let LEG_SEQ = 1

// days from today for an ISO expiry (never negative)
const daysTo = (iso) => Math.max(0, Math.round((new Date(iso) - new Date()) / 86400000))
// last expiry within each calendar month, soonest n months
const monthlyExpiries = (list, n = 3) => {
  const byMonth = new Map()
  for (const e of (list || [])) { const k = String(e).slice(0, 7); if (!byMonth.has(k) || e > byMonth.get(k)) byMonth.set(k, e) }
  return [...byMonth.values()].sort().slice(0, n)
}

const Card = ({ children, style = {} }) => (
  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', ...style }}>{children}</div>
)
const money = (v) => (v == null ? '∞' : formatCurrency(v))
const pnlColor = (v) => (v == null ? 'var(--text)' : v >= 0 ? 'var(--gain)' : 'var(--loss)')
const num = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d))
const expLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—')

// group a raw chain payload into strike rows {strike, ce, pe}
function groupRows(data) {
  const m = new Map()
  for (const r of (data?.chain_rows || [])) {
    if (!m.has(r.strike)) m.set(r.strike, { strike: r.strike, ce: null, pe: null })
    m.get(r.strike)[r.option_type === 'CE' ? 'ce' : 'pe'] = r
  }
  return [...m.values()].sort((a, b) => a.strike - b.strike)
}
function priceFromRows(rows, strike, type) {
  const row = (rows || []).find(r => r.strike === strike)
  const side = type === 'CE' ? row?.ce : row?.pe
  return { ltp: side?.ltp ?? null, iv: side?.iv ?? null }
}

function BSButtons({ onBuy, onSell }) {
  const base = { width: 20, height: 20, borderRadius: 5, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: '1px solid transparent', lineHeight: 1 }
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      <button onClick={onBuy} title="Buy" style={{ ...base, background: 'var(--gain-bg)', color: 'var(--gain-text)', borderColor: 'rgba(49,221,106,0.3)' }}>B</button>
      <button onClick={onSell} title="Sell" style={{ ...base, background: 'var(--loss-bg)', color: 'var(--loss-text)', borderColor: 'rgba(255,92,92,0.3)' }}>S</button>
    </span>
  )
}

function Stat({ label, value, pct, color }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 9 }}>{label}</div>
      <div className="num" style={{ fontSize: 15, fontWeight: 700, color: color || 'var(--text)', marginTop: 2 }}>
        {value}{pct != null && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 4, color: 'var(--text-muted)' }}>({pct})</span>}
      </div>
    </div>
  )
}

const stepBtn = { width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--color-surface2)', color: 'var(--text-sub)', cursor: 'pointer', display: 'grid', placeItems: 'center' }

export default function StrategyBuilderPage() {
  const { error } = useToast()
  const [idx, setIdx] = useState(0)
  const [expiry, setExpiry] = useState(null)          // top-tab expiry (drives the left chain + default for new legs)
  const [meta, setMeta] = useState(null)
  const [chain, setChain] = useState(null)
  const [legs, setLegs] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [templates, setTemplates] = useState([])
  const [category, setCategory] = useState('NEUTRAL')
  const [showTemplates, setShowTemplates] = useState(true)
  const [expiryOpen, setExpiryOpen] = useState(false)  // chain-box expiry dropdown
  const [futOpen, setFutOpen] = useState(false)        // top-bar futures month dropdown
  const [chainHidden, setChainHidden] = useState(false)
  const [strikeCount, setStrikeCount] = useState(10)
  const [futLtp, setFutLtp] = useState({})             // expiry ISO -> future price
  const debounce = useRef(null)
  const chainCache = useRef({})                        // expiry ISO -> grouped rows
  const instrument = INSTRUMENTS[idx].name

  useEffect(() => { getTemplates().then(r => setTemplates(r.data || [])).catch(() => {}) }, [])
  useEffect(() => { setExpiry(null); setLegs([]); setAnalysis(null); setShowTemplates(true); setFutLtp({}); setFutOpen(false); setExpiryOpen(false); chainCache.current = {} }, [idx])

  useEffect(() => {
    let live = true
    const load = () => Promise.all([getOptionMetrics(instrument, expiry), getOptionChainData(instrument, expiry)])
      .then(([m, c]) => {
        if (!live) return
        setMeta(m.data); setChain(c.data)
        const key = c.data.expiry_date || expiry
        if (key) chainCache.current[key] = groupRows(c.data)
      }).catch(() => {})
    load()
    const t = setInterval(load, 15000)
    return () => { live = false; clearInterval(t) }
  }, [instrument, expiry])

  const spot = meta?.spot ?? chain?.spot
  const curExpiry = expiry || meta?.expiry_date
  const expiries = meta?.expiries || []

  const rowsByStrike = useMemo(() => groupRows(chain), [chain])
  const step = rowsByStrike.length > 1 ? rowsByStrike[1].strike - rowsByStrike[0].strike : 50

  // strike window (±ATM) applied to the visible chain
  const visibleRows = useMemo(() => {
    if (strikeCount === 'All' || !rowsByStrike.length) return rowsByStrike
    const atm = chain?.atm_strike ?? spot
    const atmIdx = rowsByStrike.reduce((best, row, i) =>
      Math.abs(row.strike - atm) < Math.abs(rowsByStrike[best].strike - atm) ? i : best, 0)
    return rowsByStrike.slice(Math.max(0, atmIdx - strikeCount), Math.min(rowsByStrike.length, atmIdx + strikeCount + 1))
  }, [rowsByStrike, strikeCount, chain, spot])

  // futures months (front month reuses the live metric; farther months fetched lazily)
  const monthlies = useMemo(() => monthlyExpiries(expiries, 3), [expiries])
  const frontMonth = monthlies[0]
  const futPriceFor = (e) => (e && e === frontMonth ? meta?.future : futLtp[e])
  useEffect(() => {
    if (!futOpen) return
    monthlies.slice(1).forEach(e => {
      if (futLtp[e] != null) return
      getOptionMetrics(instrument, e).then(r => setFutLtp(p => ({ ...p, [e]: r.data?.future ?? null }))).catch(() => {})
    })
  }, [futOpen, monthlies, instrument]) // eslint-disable-line react-hooks/exhaustive-deps

  // analyze (debounced)
  useEffect(() => {
    if (!legs.length) { setAnalysis(null); return }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      analyzeLegs({ underlying: instrument, spot, legs: legs.map(l => ({
        action: l.action, instrument_type: l.type, strike: l.strike, lots: l.lots, expiry: l.expiry, ltp: l.ltp, iv: l.iv,
      })) }).then(r => setAnalysis(r.data)).catch(e => error(e.response?.data?.message || 'Analyze failed'))
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [legs, instrument, spot])

  // ensure a given expiry's chain is cached (fetch if missing), return its rows
  const ensureChain = async (exp) => {
    if (chainCache.current[exp]) return chainCache.current[exp]
    try {
      const { data } = await getOptionChainData(instrument, exp)
      const rows = groupRows(data)
      chainCache.current[exp] = rows
      return rows
    } catch { return [] }
  }

  const addLeg = (strike, type, action) => {
    const { ltp, iv } = priceFromRows(rowsByStrike, strike, type)
    setLegs(ls => [...ls, { id: LEG_SEQ++, action, type, strike, lots: 1, expiry: curExpiry, ltp, iv }])
    setShowTemplates(false)
  }
  const updateLeg = (id, patch) => setLegs(ls => ls.map(l => {
    if (l.id !== id) return l
    const merged = { ...l, ...patch }
    if (patch.strike != null || patch.type != null) {
      const p = priceFromRows(chainCache.current[merged.expiry] || rowsByStrike, merged.strike, merged.type)
      merged.ltp = p.ltp; merged.iv = p.iv
    }
    return merged
  }))
  const removeLeg = (id) => setLegs(ls => ls.filter(l => l.id !== id))
  const bumpStrike = (id, dir) => setLegs(ls => ls.map(l => {
    if (l.id !== id) return l
    const strike = l.strike + dir * step
    const p = priceFromRows(chainCache.current[l.expiry] || rowsByStrike, strike, l.type)
    return { ...l, strike, ltp: p.ltp, iv: p.iv }
  }))

  // per-leg expiry change → re-price from that expiry's chain
  const changeLegExpiry = async (id, exp) => {
    const rows = await ensureChain(exp)
    setLegs(ls => ls.map(l => {
      if (l.id !== id) return l
      const p = priceFromRows(rows, l.strike, l.type)
      return { ...l, expiry: exp, ltp: p.ltp, iv: p.iv }
    }))
  }

  const loadTemplate = async (t) => {
    try {
      const { data } = await expandTemplate(t.id, instrument, curExpiry)
      setLegs((data.legs || []).map(l => ({
        id: LEG_SEQ++, action: l.action, type: l.instrument_type, strike: l.strike, lots: l.lots, expiry: l.expiry, ltp: l.ltp, iv: l.iv,
      })))
      setShowTemplates(false)
    } catch (e) { error(e.response?.data?.message || 'Could not load template') }
  }

  // metric %s (max P/L vs margin, breakevens vs spot)
  const margin = analysis?.margin || 0
  const pctOfMargin = (v) => (v != null && margin > 0 ? `${(v / margin * 100).toFixed(2)}%` : null)
  const bePct = (be) => (spot ? `${((be - spot) / spot * 100).toFixed(2)}%` : '')

  const change = meta?.change_pct ?? 0
  const th = { padding: '6px 8px', fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const td = { padding: '5px 8px', fontSize: 12 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <Card style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 6px' }}>
            <button onClick={() => setIdx(i => (i + INSTRUMENTS.length - 1) % INSTRUMENTS.length)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><ChevronLeft size={15} /></button>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--warn)', color: '#131313', fontSize: 9.5, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{INSTRUMENTS[idx].badge}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', padding: '0 4px' }}>{instrument}</span>
            <button onClick={() => setIdx(i => (i + 1) % INSTRUMENTS.length)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><ChevronRight size={15} /></button>
          </div>
          {meta && <>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>SPOT <b className="num" style={{ color: 'var(--text)', fontSize: 14 }}>{num(meta.spot)}</b> <span className="num" style={{ color: change >= 0 ? 'var(--gain)' : 'var(--loss)' }}>{change.toFixed(2)}%</span></span>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>VIX <b className="num" style={{ color: 'var(--text)' }}>{meta.vix != null ? num(meta.vix) : '—'}</b></span>
            {/* FUT → futures-month dropdown */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setFutOpen(o => !o)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                FUT {frontMonth && <span style={{ color: 'var(--text-sub)' }}>({expLabel(frontMonth)})</span>} <b className="num" style={{ color: 'var(--text)' }}>{num(meta.future)}</b>
                <ChevronDown size={13} color="var(--text-muted)" style={{ transform: futOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {futOpen && monthlies.length > 0 && (
                <div style={{ position: 'absolute', top: '150%', left: 0, zIndex: 20, background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-md)', padding: 4, minWidth: 200 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 6, padding: '5px 10px 6px', fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <span /><span>Expiry</span><span style={{ textAlign: 'right' }}>LTP</span>
                  </div>
                  {monthlies.map(e => {
                    const active = e === curExpiry
                    const ltp = futPriceFor(e)
                    return (
                      <button key={e} onClick={() => { setExpiry(e); setFutOpen(false) }}
                        style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', background: active ? 'var(--primary-bg)' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 12.5, padding: '7px 10px', borderRadius: 6 }}>
                        <span style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`, boxShadow: active ? 'inset 0 0 0 2.5px var(--primary)' : 'none' }} />
                        <span>{expLabel(e)} <span style={{ color: 'var(--text-muted)' }}>({daysTo(e)}d)</span></span>
                        <span className="num" style={{ textAlign: 'right', color: 'var(--text-sub)', fontWeight: 600 }}>{ltp != null ? num(ltp) : '…'}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>}
          <button onClick={() => setChainHidden(h => !h)} title={chainHidden ? 'Show Option Chain' : 'Hide Option Chain'} className="sf-btn-outline"
            style={{ marginLeft: 'auto', padding: '6px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {chainHidden ? <Eye size={14} /> : <EyeOff size={14} />} {chainHidden ? 'Show Option Chain' : 'Hide Chain'}
          </button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: chainHidden ? '1fr' : 'minmax(0, 500px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        {/* LEFT chain */}
        {!chainHidden && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 14px', borderBottom: '1px solid var(--border)', background: 'var(--color-surface2)' }}>
            {/* expiry dropdown (drives the chain + default for new legs) */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setExpiryOpen(o => !o)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}>
                {curExpiry ? `${expLabel(curExpiry)} (${daysTo(curExpiry)}d)` : 'Expiry'}
                <ChevronDown size={13} color="var(--text-muted)" style={{ transform: expiryOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {expiryOpen && expiries.length > 0 && (
                <div style={{ position: 'absolute', top: '112%', left: 0, zIndex: 20, background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-md)', padding: 4, minWidth: 160, maxHeight: 280, overflowY: 'auto' }}>
                  {expiries.map(e => (
                    <button key={e} onClick={() => { setExpiry(e); setExpiryOpen(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: e === curExpiry ? 'var(--primary-bg)' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 12.5, padding: '7px 10px', borderRadius: 6 }}>
                      {expLabel(e)} <span style={{ color: 'var(--text-muted)' }}>({daysTo(e)}d)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* strike window (±ATM) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 'auto' }}>
              <span className="eyebrow" style={{ fontSize: 9 }}>Strikes ±ATM</span>
              <div style={{ display: 'flex', background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
                {WINDOWS.map(w => (
                  <button key={w} onClick={() => setStrikeCount(w)} className="toggle-btn"
                    style={{ fontSize: 11, padding: '3px 8px', minWidth: 0, background: strikeCount === w ? 'var(--primary)' : 'transparent', color: strikeCount === w ? 'var(--on-primary)' : 'var(--text-sub)' }}>
                    {w === 'All' ? 'All' : `±${w}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ maxHeight: 700, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface2)', zIndex: 1 }}>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Call Δ</th>
                  <th style={{ ...th, textAlign: 'right' }}>Call LTP</th>
                  <th style={{ ...th, textAlign: 'center' }}></th>
                  <th style={{ ...th, textAlign: 'center' }}>Strike</th>
                  <th style={{ ...th, textAlign: 'center' }}></th>
                  <th style={{ ...th, textAlign: 'left' }}>Put LTP</th>
                  <th style={{ ...th, textAlign: 'right' }}>Put Δ</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => {
                  const isAtm = row.strike === chain?.atm_strike
                  return (
                    <tr key={row.strike} className="chain-row" style={{ borderBottom: '1px solid var(--color-surface2)', background: isAtm ? 'rgba(245,196,81,0.06)' : (row.strike < spot ? 'rgba(49,221,106,0.03)' : 'transparent') }}>
                      <td className="num" style={{ ...td, color: 'var(--text-muted)' }}>{num(row.ce?.delta)}</td>
                      <td className="num" style={{ ...td, textAlign: 'right', color: 'var(--gain-text)', fontWeight: 600 }}>{num(row.ce?.ltp)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{row.ce && <BSButtons onBuy={() => addLeg(row.strike, 'CE', 'BUY')} onSell={() => addLeg(row.strike, 'CE', 'SELL')} />}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, background: isAtm ? 'rgba(245,196,81,0.12)' : 'var(--color-surface2)' }}>
                        <span className="num">{Math.round(row.strike)}</span>{isAtm && <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 800, color: 'var(--warn)' }}>ATM</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>{row.pe && <BSButtons onBuy={() => addLeg(row.strike, 'PE', 'BUY')} onSell={() => addLeg(row.strike, 'PE', 'SELL')} />}</td>
                      <td className="num" style={{ ...td, color: 'var(--loss-text)', fontWeight: 600 }}>{num(row.pe?.ltp)}</td>
                      <td className="num" style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{num(row.pe?.delta)}</td>
                    </tr>
                  )
                })}
                {visibleRows.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading chain…</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        )}

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setShowTemplates(s => !s)} className="sf-btn-outline" style={{ padding: '6px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Layers size={14} /> {showTemplates ? 'Hide' : 'Ready-Made'} Strategies
            </button>
            {legs.length > 0 && <button onClick={() => { setLegs([]); setShowTemplates(true) }} className="sf-btn-outline" style={{ padding: '6px 14px', fontSize: 12.5 }}>Reset</button>}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{legs.length} leg{legs.length !== 1 ? 's' : ''}</span>
          </div>

          {showTemplates && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--color-surface2)' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Ready-Made Strategies</span>
                <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
                  {CATEGORIES.map(c => (
                    <button key={c.key} onClick={() => setCategory(c.key)} className="toggle-btn"
                      style={{ fontSize: 11.5, minWidth: 58, padding: '4px 8px', background: category === c.key ? 'var(--primary)' : 'transparent', color: category === c.key ? 'var(--on-primary)' : 'var(--text-sub)' }}>{c.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {templates.filter(t => t.category === category).map(t => (
                  <button key={t.id} onClick={() => loadTemplate(t)} style={{ textAlign: 'left', background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 12px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><Layers size={13} style={{ color: 'var(--primary)' }} /><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{t.name}</span></div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{t.description}</div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {legs.length > 0 && (
            <>
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px', borderRight: '1px solid var(--border)' }}>
                    <Stat label="Net Premium" value={analysis ? formatCurrency(analysis.net_premium ?? 0) : '…'} color={pnlColor(analysis?.net_premium)} />
                    <Stat label="Est. Margin" value={analysis ? formatCurrency(analysis.margin ?? 0) : '…'} />
                    <Stat label="POP" value={analysis?.pop != null ? `${analysis.pop}%` : '—'} />
                    <Stat label="Max Profit" value={analysis ? money(analysis.max_profit) : '…'} pct={pctOfMargin(analysis?.max_profit)} color="var(--gain)" />
                    <Stat label="Max Loss" value={analysis ? money(analysis.max_loss) : '…'} pct={analysis?.max_loss != null ? pctOfMargin(analysis.max_loss) : null} color="var(--loss)" />
                    <div>
                      <div className="eyebrow" style={{ fontSize: 9 }}>Breakevens</div>
                      {(analysis?.breakevens || []).map((b, i) => (
                        <div key={i} className="num" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{Math.round(b)} <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>({bePct(b)})</span></div>
                      ))}
                      {!analysis?.breakevens?.length && <div className="num" style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</div>}
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px 4px' }}>
                    {analysis?.prices?.length ? <PayoffChart payoff={analysis} spot={analysis.spot} /> : <div style={{ height: 300, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Computing payoff…</div>}
                    {analysis?.is_defined_risk && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px', color: 'var(--gain-text)', fontSize: 11 }}><ShieldCheck size={13} /> Defined-risk</div>}
                  </div>
                </div>
              </Card>

              {/* positions */}
              <Card>
                <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)', background: 'var(--color-surface2)', fontSize: 12.5, fontWeight: 600 }}>Positions</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['B/S', 'Lots', 'Expiry', 'Strike', 'Type', 'Entry', 'IV', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 0 ? 'left' : 'center' }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {legs.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--color-surface2)' }}>
                          <td style={td}>
                            <button onClick={() => updateLeg(l.id, { action: l.action === 'BUY' ? 'SELL' : 'BUY' })}
                              style={{ width: 24, height: 22, borderRadius: 5, fontWeight: 800, fontSize: 11, cursor: 'pointer', border: '1px solid transparent',
                                background: l.action === 'BUY' ? 'var(--gain-bg)' : 'var(--loss-bg)', color: l.action === 'BUY' ? 'var(--gain-text)' : 'var(--loss-text)' }}>{l.action === 'BUY' ? 'B' : 'S'}</button>
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <button onClick={() => updateLeg(l.id, { lots: Math.max(1, l.lots - 1) })} style={stepBtn}><Minus size={11} /></button>
                              <span className="num" style={{ minWidth: 16, textAlign: 'center' }}>{l.lots}</span>
                              <button onClick={() => updateLeg(l.id, { lots: l.lots + 1 })} style={stepBtn}><Plus size={11} /></button>
                            </span>
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <select value={l.expiry || ''} onChange={e => changeLegExpiry(l.id, e.target.value)}
                              className="sf-input" style={{ minHeight: 26, padding: '2px 6px', fontSize: 11.5, width: 82 }}>
                              {expiries.map(e => <option key={e} value={e}>{expLabel(e)}</option>)}
                              {!expiries.includes(l.expiry) && l.expiry && <option value={l.expiry}>{expLabel(l.expiry)}</option>}
                            </select>
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            {l.type === 'FUT' ? <span className="num">FUT</span> : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <button onClick={() => bumpStrike(l.id, -1)} style={stepBtn}><Minus size={11} /></button>
                                <span className="num" style={{ minWidth: 46, textAlign: 'center', fontWeight: 600 }}>{Math.round(l.strike)}</span>
                                <button onClick={() => bumpStrike(l.id, 1)} style={stepBtn}><Plus size={11} /></button>
                              </span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            {l.type !== 'FUT' ? (
                              <button onClick={() => updateLeg(l.id, { type: l.type === 'CE' ? 'PE' : 'CE' })}
                                style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, cursor: 'pointer', border: '1px solid var(--border)',
                                  background: l.type === 'CE' ? 'var(--gain-bg)' : 'var(--loss-bg)', color: l.type === 'CE' ? 'var(--gain-text)' : 'var(--loss-text)' }}>{l.type}</button>
                            ) : <span className="num" style={{ color: 'var(--text-muted)' }}>FUT</span>}
                          </td>
                          <td className="num" style={{ ...td, textAlign: 'center', color: 'var(--text-sub)' }}>{num(l.ltp)}</td>
                          <td className="num" style={{ ...td, textAlign: 'center', color: 'var(--text-muted)' }}>{l.iv != null ? l.iv.toFixed(1) : '—'}</td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <button onClick={() => removeLeg(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

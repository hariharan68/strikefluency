import { useState, useEffect, useRef } from 'react'
import { LOT_SIZES, SETUP_TAG_LABELS, SETUP_TAGS } from '../../utils/constants'
import { nearestThursday } from '../../utils/formatters'
import { placeOrder } from '../../api/trading'
import { useToast } from '../common/Toast'
import { AlertTriangle, Minus, Plus, ChevronDown, Check, Zap } from 'lucide-react'

const lbl = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }
const Field = ({ label, children }) => (<div><label style={lbl}>{label}</label>{children}</div>)

// Segmented pill control — one rounded track, the active option filled.
function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 3 }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{
              flex: 1, border: 'none', cursor: 'pointer', borderRadius: 7, padding: '8px 0',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', transition: 'all 0.12s',
              background: active ? (o.color || 'var(--primary)') : 'transparent',
              color: active ? (o.textColor || 'var(--on-primary)') : 'var(--text-sub)',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function OrderFormPanel({ prefill, instrument = 'NIFTY', disciplineOff = false, prefs = {}, onSuccess }) {
  const { success } = useToast()
  const [strike, setStrike] = useState('')
  const [optionType, setOptionType] = useState('CE')
  const [action, setAction] = useState('BUY')
  const [productType, setProductType] = useState('INTRADAY')
  const [lots, setLots] = useState(prefs.default_lots || 1)
  const [ltp, setLtp] = useState('')
  const [sl, setSl] = useState('')
  const [target, setTarget] = useState('')
  const [expiry, setExpiry] = useState(nearestThursday())
  const [setupTag, setSetupTag] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const setupRef = useRef(null)

  useEffect(() => {
    if (prefill) {
      setStrike(prefill.strike?.toString() || '')
      setOptionType(prefill.optionType || 'CE')
      setLtp(prefill.ltp != null ? Number(prefill.ltp).toFixed(2) : '')
      // Use the contract's real expiry (NIFTY=Tue, BANKNIFTY=monthly, SENSEX)
      // instead of the generic Thursday fallback, so the order matches the chain.
      if (prefill.expiry) setExpiry(prefill.expiry)
      setError(null)
    }
  }, [prefill])

  // Close the setup-tag dropdown on an outside click.
  useEffect(() => {
    if (!setupOpen) return
    const onDoc = (e) => { if (setupRef.current && !setupRef.current.contains(e.target)) setSetupOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [setupOpen])

  const lotSize = prefill?.lotSize || LOT_SIZES[instrument] || 65
  const qty = lots * lotSize
  const ltpNum = parseFloat(ltp) || 0
  const slNum = parseFloat(sl) || 0
  const risk = Math.abs(ltpNum - slNum) * qty
  const rr = target ? (Math.abs(parseFloat(target) - ltpNum) / Math.max(0.01, Math.abs(ltpNum - slNum))).toFixed(1) : null
  // Leverage setting: ON → 5x margin; OFF → full contract value (1x).
  const leverage = prefs.leverage_enabled === false ? 1 : 5
  const margin = (qty * ltpNum / leverage).toFixed(0)
  const isBuy = action === 'BUY'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!strike) { setError('Strike price is required'); return }
    if (!ltp || ltpNum <= 0) { setError('LTP is required'); return }
    // In free-play mode (Discipline OFF) SL + setup tag are optional.
    if (!disciplineOff) {
      if (!sl || slNum <= 0) { setError('Stop Loss is mandatory'); return }
      if (!setupTag) { setError('Setup tag is mandatory'); return }
    }
    setLoading(true)
    try {
      await placeOrder({
        instrument, strike_price: parseInt(strike),
        option_type: optionType, action, quantity: lots,
        product_type: productType,
        ltp: ltpNum,
        sl_price: sl && slNum > 0 ? slNum : null,
        target_price: target ? parseFloat(target) : null,
        expiry_date: expiry, setup_tag: setupTag || null, notes: notes || null,
      })
      // "Trade Confirmation Toast" preference gates this success toast.
      if (prefs.notify_trade_confirm) success(`Order placed — ${instrument} ${strike} ${optionType}`)
      setStrike(''); setLtp(''); setSl(''); setTarget(''); setNotes(''); setSetupTag(''); setProductType('INTRADAY')
      onSuccess?.()
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : d?.message || 'Order failed — check discipline rules')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {/* BUY / SELL */}
      <Segmented value={action} onChange={setAction} options={[
        { value: 'BUY', label: 'BUY', color: 'var(--gain)', textColor: '#08260f' },
        { value: 'SELL', label: 'SELL', color: 'var(--loss)', textColor: '#fff' },
      ]} />

      {/* CE / PE */}
      <Segmented value={optionType} onChange={setOptionType} options={[
        { value: 'CE', label: 'CALL (CE)' },
        { value: 'PE', label: 'PUT (PE)' },
      ]} />

      {/* Product: Intraday (auto square-off at EOD) vs NRML (carry forward) */}
      <Segmented value={productType} onChange={setProductType} options={[
        { value: 'INTRADAY', label: 'INTRADAY' },
        { value: 'NRML', label: 'NRML (Carry)' },
      ]} />

      {/* Strike + LTP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Strike Price">
          <input className="sf-input" type="number" placeholder="24850" value={strike} onChange={e => setStrike(e.target.value)} style={{ minHeight: 40 }} />
        </Field>
        <Field label="LTP / Entry">
          <input className="sf-input" type="number" step="0.05" placeholder="0.00" value={ltp} onChange={e => setLtp(e.target.value)} style={{ minHeight: 40 }} />
        </Field>
      </div>

      {/* SL + Target */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={disciplineOff ? 'Stop Loss (optional)' : 'Stop Loss ★'}>
          <input className="sf-input" type="number" step="0.05" placeholder="0.00" value={sl} onChange={e => setSl(e.target.value)}
            style={{ minHeight: 40, borderColor: prefs.show_risk_warnings && sl && slNum > 0 && action === 'BUY' && slNum >= ltpNum ? 'var(--loss)' : undefined }} />
        </Field>
        <Field label="Target (optional)">
          <input className="sf-input" type="number" step="0.05" placeholder="0.00" value={target} onChange={e => setTarget(e.target.value)} style={{ minHeight: 40 }} />
        </Field>
      </div>

      {/* Lots + Expiry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={`Lots · 1 lot = ${lotSize}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 40, padding: '0 5px', background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <button type="button" aria-label="Decrease" className="sf-stepper-btn" onClick={() => setLots(l => Math.max(1, l - 1))}><Minus size={15} /></button>
            <input value={lots} onChange={e => setLots(Math.max(1, parseInt(e.target.value) || 1))} className="num"
              style={{ flex: 1, minWidth: 0, textAlign: 'center', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 15, fontWeight: 700, outline: 'none', padding: 0 }} />
            <button type="button" aria-label="Increase" className="sf-stepper-btn" onClick={() => setLots(l => l + 1)}><Plus size={15} /></button>
          </div>
        </Field>
        <Field label="Expiry Date">
          <input className="sf-input" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} style={{ minHeight: 40 }} />
        </Field>
      </div>

      {/* Setup Tag — custom dropdown (opens upward so the sidebar card never clips it) */}
      <Field label={disciplineOff ? 'Setup Tag (optional)' : 'Setup Tag ★'}>
        <div ref={setupRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setSetupOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
              height: 40, padding: '0 12px', borderRadius: 10,
              border: `1px solid ${setupOpen ? 'var(--primary-border)' : 'var(--border)'}`,
              background: 'var(--color-surface)', cursor: 'pointer',
              color: setupTag ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 13, fontWeight: setupTag ? 600 : 400,
            }}>
            {setupTag ? SETUP_TAG_LABELS[setupTag] : 'Select your setup'}
            <ChevronDown size={15} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: setupOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          {setupOpen && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 5,
              background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: 'var(--shadow-md)', padding: 5,
            }}>
              {SETUP_TAGS.map(t => {
                const active = t === setupTag
                return (
                  <button key={t} type="button" className="sf-dd-option"
                    onClick={() => { setSetupTag(t); setSetupOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
                      textAlign: 'left', padding: '9px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: active ? 'var(--primary-bg)' : 'transparent',
                      color: active ? 'var(--primary)' : 'var(--text-sub)',
                      fontSize: 13, fontWeight: active ? 700 : 500,
                    }}>
                    {SETUP_TAG_LABELS[t]}
                    {active && <Check size={14} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Field>

      {/* Risk summary */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden'
      }}>
        {[
          { label: 'QTY', value: qty.toLocaleString('en-IN') },
          { label: 'RISK', value: risk > 0 ? `₹${risk.toFixed(0)}` : '—', color: 'var(--loss)' },
          { label: 'R:R', value: rr ? `1 : ${rr}` : '—', color: 'var(--gain)' },
        ].map((item, i) => (
          <div key={i} style={{ padding: '10px 0', textAlign: 'center', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{item.label}</div>
            <div className="num" style={{ color: item.color || 'var(--text)', fontSize: 14, fontWeight: 700 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: 'var(--loss-bg)', border: '1px solid var(--loss)',
          borderRadius: 10, padding: '9px 12px'
        }}>
          <AlertTriangle size={14} color="var(--loss)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ color: 'var(--loss-text)', fontSize: 12, lineHeight: 1.5 }}>{error}</span>
        </div>
      )}

      <button type="submit" disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', height: 46, borderRadius: 12, border: 'none',
          background: loading ? 'var(--text-muted)' : (isBuy ? 'var(--gain)' : 'var(--loss)'),
          color: '#fff', fontFamily: 'Inter,sans-serif', fontSize: 13.5, fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer', transition: 'all 0.15s', letterSpacing: '0.02em',
          boxShadow: loading ? 'none' : `0 10px 24px -10px ${isBuy ? 'rgba(49,221,106,0.6)' : 'rgba(255,92,92,0.6)'}`,
        }}>
        <Zap size={16} /> {loading ? 'Placing…' : `${action} ${instrument} ${strike || '——'} ${optionType}`}
      </button>

      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
        Est. margin ≈ <span className="num" style={{ color: 'var(--text-sub)', fontWeight: 600 }}>₹{parseInt(margin).toLocaleString('en-IN')}</span> <span style={{ color: 'var(--text-muted)' }}>({leverage}x)</span>
      </div>
    </form>
  )
}

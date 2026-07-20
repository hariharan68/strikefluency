import { useState, useEffect } from 'react'
import { LOT_SIZES, SETUP_TAG_LABELS, SETUP_TAGS } from '../../utils/constants'
import { nearestThursday } from '../../utils/formatters'
import { placeOrder } from '../../api/trading'
import { useToast } from '../common/Toast'
import { AlertTriangle } from 'lucide-react'

const Field = ({ label, children }) => (
  <div>
    <label className="sf-label">{label}</label>
    {children}
  </div>
)

const ToggleGroup = ({ value, options, onChange, fullWidth }) => (
  <div className="toggle-group" style={{ width: fullWidth ? '100%' : 'auto', display: 'flex' }}>
    {options.map(opt => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className="toggle-btn"
        style={{
          flex: 1,
          background: value === opt.value ? opt.activeColor : 'transparent',
          color: value === opt.value ? '#131313' : 'var(--text-sub)',
        }}
      >
        {opt.label}
      </button>
    ))}
  </div>
)

export default function OrderFormPanel({ prefill, instrument = 'NIFTY', disciplineOff = false, onSuccess }) {
  const { success } = useToast()
  const [strike, setStrike] = useState('')
  const [optionType, setOptionType] = useState('CE')
  const [action, setAction] = useState('BUY')
  const [lots, setLots] = useState(1)
  const [ltp, setLtp] = useState('')
  const [sl, setSl] = useState('')
  const [target, setTarget] = useState('')
  const [expiry, setExpiry] = useState(nearestThursday())
  const [setupTag, setSetupTag] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (prefill) {
      setStrike(prefill.strike?.toString() || '')
      setOptionType(prefill.optionType || 'CE')
      setLtp(prefill.ltp?.toFixed(2) || '')
      setError(null)
    }
  }, [prefill])

  const lotSize = LOT_SIZES[instrument] || 65
  const qty = lots * lotSize
  const ltpNum = parseFloat(ltp) || 0
  const slNum = parseFloat(sl) || 0
  const risk = Math.abs(ltpNum - slNum) * qty
  const rr = target ? (Math.abs(parseFloat(target) - ltpNum) / Math.max(0.01, Math.abs(ltpNum - slNum))).toFixed(1) : null
  const margin = (qty * ltpNum * 0.1).toFixed(0)
  const isCE = optionType === 'CE'

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
        ltp: ltpNum,
        sl_price: sl && slNum > 0 ? slNum : null,
        target_price: target ? parseFloat(target) : null,
        expiry_date: expiry, setup_tag: setupTag || null, notes: notes || null,
      })
      success(`Order placed — ${instrument} ${strike} ${optionType}`)
      setStrike(''); setLtp(''); setSl(''); setTarget(''); setNotes(''); setSetupTag('')
      onSuccess?.()
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : d?.message || 'Order failed — check discipline rules')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* BUY / SELL */}
      <ToggleGroup fullWidth value={action} onChange={setAction} options={[
        { value: 'BUY', label: 'BUY', activeColor: 'var(--gain)' },
        { value: 'SELL', label: 'SELL', activeColor: 'var(--loss)' },
      ]} />

      {/* CE / PE */}
      <ToggleGroup fullWidth value={optionType} onChange={setOptionType} options={[
        { value: 'CE', label: 'CALL (CE)', activeColor: 'var(--primary)' },
        { value: 'PE', label: 'PUT (PE)', activeColor: 'var(--loss)' },
      ]} />

      {/* Strike + LTP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Strike Price">
          <input className="sf-input" type="number" placeholder="24850" value={strike} onChange={e => setStrike(e.target.value)} />
        </Field>
        <Field label="LTP / Entry">
          <input className="sf-input" type="number" step="0.05" placeholder="0.00" value={ltp} onChange={e => setLtp(e.target.value)} />
        </Field>
      </div>

      {/* SL + Target */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={disciplineOff ? 'Stop Loss (optional)' : 'Stop Loss ★'}>
          <input className="sf-input" type="number" step="0.05" placeholder="0.00" value={sl} onChange={e => setSl(e.target.value)}
            style={{ borderColor: sl && slNum > 0 && action === 'BUY' && slNum >= ltpNum ? 'var(--loss)' : undefined }} />
        </Field>
        <Field label="Target (optional)">
          <input className="sf-input" type="number" step="0.05" placeholder="0.00" value={target} onChange={e => setTarget(e.target.value)} />
        </Field>
      </div>

      {/* Lots + Expiry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={`Lots  (1 lot = ${lotSize} qty)`}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button type="button" onClick={() => setLots(l => Math.max(1, l-1))}
              style={{ width: 34, height: 38, background: 'var(--border)', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '8px 0 0 8px', cursor: 'pointer', color: 'var(--text-sub)', fontSize: 16, fontWeight: 300 }}>−</button>
            <input className="sf-input" type="number" min={1} value={lots}
              onChange={e => setLots(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ borderRadius: 0, textAlign: 'center', width: '100%' }} />
            <button type="button" onClick={() => setLots(l => l+1)}
              style={{ width: 34, height: 38, background: 'var(--border)', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 8px 8px 0', cursor: 'pointer', color: 'var(--text-sub)', fontSize: 16, fontWeight: 300 }}>+</button>
          </div>
        </Field>
        <Field label="Expiry Date">
          <input className="sf-input" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
        </Field>
      </div>

      {/* Setup Tag */}
      <Field label={disciplineOff ? 'Setup Tag (optional)' : 'Setup Tag ★'}>
        <select className="sf-input" value={setupTag} onChange={e => setSetupTag(e.target.value)} style={{ cursor: 'pointer' }}>
          <option value="">— select your setup —</option>
          {SETUP_TAGS.map(t => <option key={t} value={t}>{SETUP_TAG_LABELS[t]}</option>)}
        </select>
      </Field>

      {/* Risk summary */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden'
      }}>
        {[
          { label: 'QTY', value: qty.toLocaleString('en-IN') },
          { label: 'RISK', value: risk > 0 ? `₹${risk.toFixed(0)}` : '—', color: 'var(--loss)' },
          { label: 'R:R', value: rr ? `1 : ${rr}` : '—', color: 'var(--gain)' },
        ].map((item, i) => (
          <div key={i} style={{ padding: '8px 0', textAlign: 'center', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{item.label}</div>
            <div className="num" style={{ color: item.color || 'var(--text)', fontSize: 13, fontWeight: 600 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: '#fee2e2', border: '1px solid var(--loss)',
          borderRadius: 8, padding: '9px 12px'
        }}>
          <AlertTriangle size={14} color="var(--loss)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ color: 'var(--loss-text)', fontSize: 12, lineHeight: 1.5 }}>{error}</span>
        </div>
      )}

      <button type="submit" disabled={loading}
        style={{
          width: '100%', height: 40, borderRadius: 8, border: 'none',
          background: loading ? 'var(--border)' : (action === 'BUY' ? 'var(--gain)' : 'var(--loss)'),
          color: loading ? 'var(--text-muted)' : '#fff',
          fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer', transition: 'background 0.15s',
          letterSpacing: '0.02em'
        }}>
        {loading ? 'Placing…' : `${action} ${instrument} ${strike || '——'} ${optionType}`}
      </button>

      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
        Est. margin ≈ <span className="num" style={{ color: 'var(--text-sub)' }}>₹{parseInt(margin).toLocaleString('en-IN')}</span>
      </div>
    </form>
  )
}

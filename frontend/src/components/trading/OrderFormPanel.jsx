import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Minus, Plus, Zap } from 'lucide-react'
import { placeOrder } from '../../api/trading'
import { LOT_SIZES, SETUP_TAG_LABELS, SETUP_TAGS } from '../../utils/constants'
import { nearestThursday } from '../../utils/formatters'
import { useToast } from '../common/Toast'

const money = (value, digits = 0) => `₹${Math.abs(Number(value) || 0).toLocaleString('en-IN', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
})}`

function SegmentedControl({ value, onChange, options, tone }) {
  return (
    <div className={`trade-order-segment ${tone || ''}`}>
      {options.map(option => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="trade-order-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export default function OrderFormPanel({
  prefill,
  instrument = 'NIFTY',
  disciplineOff = false,
  prefs = {},
  chainExpiry,
  chainLotSize,
  onSuccess,
}) {
  const { success } = useToast()
  const [strike, setStrike] = useState('')
  const [optionType, setOptionType] = useState('CE')
  const [action, setAction] = useState('BUY')
  const [productType, setProductType] = useState('INTRADAY')
  const [lots, setLots] = useState(prefs.default_lots || 1)
  const [ltp, setLtp] = useState('')
  const [sl, setSl] = useState('')
  const [target, setTarget] = useState('')
  const [expiry, setExpiry] = useState(chainExpiry || nearestThursday())
  const [setupTag, setSetupTag] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const setupRef = useRef(null)

  useEffect(() => {
    if (!prefill) return
    setStrike(prefill.strike?.toString() || '')
    setOptionType(prefill.optionType || 'CE')
    setLtp(prefill.ltp != null ? Number(prefill.ltp).toFixed(2) : '')
    if (prefill.expiry) setExpiry(prefill.expiry)
    setError('')
  }, [prefill])

  useEffect(() => {
    if (chainExpiry) setExpiry(chainExpiry)
  }, [chainExpiry])

  useEffect(() => {
    setStrike('')
    setLtp('')
    setSl('')
    setTarget('')
    setOptionType('CE')
    setError('')
  }, [instrument])

  useEffect(() => {
    if (!setupOpen) return undefined
    const handleDocumentClick = event => {
      if (setupRef.current && !setupRef.current.contains(event.target)) setSetupOpen(false)
    }
    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [setupOpen])

  const lotSize = Number(prefill?.lotSize || chainLotSize || LOT_SIZES[instrument] || 65)
  const quantity = lots * lotSize
  const entry = Number.parseFloat(ltp) || 0
  const stop = Number.parseFloat(sl) || 0
  const targetValue = Number.parseFloat(target) || 0
  const risk = stop > 0 ? Math.abs(entry - stop) * quantity : 0
  const rewardRisk = targetValue > 0 && risk > 0
    ? Math.abs(targetValue - entry) / Math.max(0.01, Math.abs(entry - stop))
    : 0
  const leverage = prefs.leverage_enabled === false ? 1 : 5
  const margin = quantity * entry / leverage

  const submitOrder = async event => {
    event.preventDefault()
    setError('')

    if (!strike) {
      setError('Select a strike price from the chain.')
      return
    }
    if (!ltp || entry <= 0) {
      setError('A valid entry price is required.')
      return
    }
    if (!disciplineOff && (!sl || stop <= 0)) {
      setError('Stop loss is mandatory while Discipline Mode is on.')
      return
    }
    if (!disciplineOff && !setupTag) {
      setError('Select the setup behind this trade.')
      return
    }

    setLoading(true)
    try {
      await placeOrder({
        instrument,
        expiry_date: expiry,
        strike_price: Number.parseInt(strike, 10),
        option_type: optionType,
        action,
        quantity: lots,
        product_type: productType,
        sl_price: sl && stop > 0 ? stop : null,
        target_price: target && targetValue > 0 ? targetValue : null,
        setup_tag: setupTag || null,
      })
      if (prefs.notify_trade_confirm) success(`Order placed — ${instrument} ${strike} ${optionType}`)
      setStrike('')
      setLtp('')
      setSl('')
      setTarget('')
      setSetupTag('')
      setProductType('INTRADAY')
      await onSuccess?.()
    } catch (requestError) {
      const detail = requestError.response?.data?.detail
      setError(typeof detail === 'string' ? detail : detail?.message || 'Order failed — review the discipline checks and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="trade-order-form" onSubmit={submitOrder}>
      <SegmentedControl
        value={action}
        onChange={setAction}
        tone={action === 'BUY' ? 'buy' : 'sell'}
        options={[
          { value: 'BUY', label: 'BUY' },
          { value: 'SELL', label: 'SELL' },
        ]}
      />

      <SegmentedControl
        value={optionType}
        onChange={setOptionType}
        options={[
          { value: 'CE', label: 'CALL (CE)' },
          { value: 'PE', label: 'PUT (PE)' },
        ]}
      />

      <SegmentedControl
        value={productType}
        onChange={setProductType}
        options={[
          { value: 'INTRADAY', label: 'INTRADAY' },
          { value: 'NRML', label: 'NRML' },
        ]}
      />

      <div className="trade-order-field-grid">
        <Field label="Strike Price">
          <input type="number" placeholder="23950" value={strike} onChange={event => setStrike(event.target.value)} />
        </Field>
        <Field label="LTP / Entry">
          <input type="number" step="0.05" placeholder="0.00" value={ltp} onChange={event => setLtp(event.target.value)} />
        </Field>
      </div>

      <div className="trade-order-field-grid">
        <Field label={disciplineOff ? 'Stop Loss · Optional' : 'Stop Loss'}>
          <input
            type="number"
            step="0.05"
            placeholder="0.00"
            value={sl}
            className={prefs.show_risk_warnings && sl && action === 'BUY' && stop >= entry ? 'invalid' : ''}
            onChange={event => setSl(event.target.value)}
          />
        </Field>
        <Field label="Target">
          <input type="number" step="0.05" placeholder="0.00" value={target} onChange={event => setTarget(event.target.value)} />
        </Field>
      </div>

      <Field label={`Lots · 1 lot = ${lotSize}`}>
        <div className="trade-lot-stepper">
          <button type="button" aria-label="Decrease lots" onClick={() => setLots(current => Math.max(1, current - 1))}>
            <Minus size={15} />
          </button>
          <input
            className="num"
            value={lots}
            aria-label="Lots"
            onChange={event => setLots(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
          />
          <button type="button" aria-label="Increase lots" onClick={() => setLots(current => current + 1)}>
            <Plus size={16} />
          </button>
        </div>
      </Field>

      <Field label={disciplineOff ? 'Setup Tag · Optional' : 'Setup Tag'}>
        <div className="trade-setup-picker" ref={setupRef}>
          <button type="button" className="trade-setup-trigger" onClick={() => setSetupOpen(current => !current)}>
            <span>{setupTag ? SETUP_TAG_LABELS[setupTag] : 'Select your setup'}</span>
            <ChevronDown size={15} className={setupOpen ? 'open' : ''} />
          </button>
          {setupOpen && (
            <div className="trade-setup-menu">
              {SETUP_TAGS.map(tag => (
                <button
                  type="button"
                  key={tag}
                  className={setupTag === tag ? 'active' : ''}
                  onClick={() => {
                    setSetupTag(tag)
                    setSetupOpen(false)
                  }}
                >
                  {SETUP_TAG_LABELS[tag]}
                  {setupTag === tag && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      <div className="trade-order-risk-summary">
        <div><span>Qty</span><strong className="num">{quantity.toLocaleString('en-IN')}</strong></div>
        <div><span>Risk</span><strong className="num loss">{risk > 0 ? money(risk, 0) : '—'}</strong></div>
        <div><span>R:R</span><strong className="num gain">{rewardRisk > 0 ? `1 : ${rewardRisk.toFixed(1)}` : '—'}</strong></div>
      </div>

      {error && (
        <div className="trade-order-error">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className={`trade-place-order ${action.toLowerCase()}`} disabled={loading}>
        <Zap size={15} />
        {loading ? 'Placing order…' : `${action} ${instrument} ${strike || '—'} ${optionType}`}
      </button>

      <p className="trade-margin-estimate">
        Estimated margin ≈ <strong className="num">{money(margin, 0)}</strong> ({leverage}x)
      </p>
    </form>
  )
}

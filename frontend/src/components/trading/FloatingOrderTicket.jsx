import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Minus, Plus, ChevronDown, ChevronUp, Zap, Check } from 'lucide-react'
import { placeOrder, getAccount } from '../../api/trading'
import useMarketStore from '../../store/marketStore'
import { ltpFromChain } from '../../utils/livePnl'
import { SETUP_TAGS, SETUP_TAG_LABELS } from '../../utils/constants'
import { useToast } from '../common/Toast'

const money = (n) => (n == null || isNaN(n) ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }))

/**
 * A floating, draggable order ticket (Kite-style). Opened from a chain B/S
 * click; places a live order via placeOrder — which fires the WS trading_update
 * event, so the position shows in Positions immediately.
 */
export default function FloatingOrderTicket({ ticket, disciplineOff = false, prefs = {}, onClose, onPlaced }) {
  const { instrument, strike, optionType, expiry, lotSize = 50 } = ticket
  const { success } = useToast()

  const [action, setAction] = useState(ticket.action || 'BUY')
  const [product, setProduct] = useState('INTRADAY')
  const [orderType, setOrderType] = useState('MARKET')
  const [lots, setLots] = useState(1)
  const [limitPrice, setLimitPrice] = useState(ticket.ltp != null ? Number(ticket.ltp).toFixed(2) : '')
  const [sl, setSl] = useState('')
  const [target, setTarget] = useState('')
  const [setupTag, setSetupTag] = useState('')
  const [advanced, setAdvanced] = useState(!disciplineOff)   // discipline ON → SL/tag required, show them
  const [setupOpen, setSetupOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [balance, setBalance] = useState(null)
  const setupRef = useRef(null)

  // Live LTP straight off the market WebSocket chain (3s ticks).
  const chains = useMarketStore(s => s.chains)
  const liveLtp = ltpFromChain(chains[instrument], strike, optionType) ?? Number(ticket.ltp) ?? 0

  const qty = lots * lotSize
  const priceUsed = orderType === 'LIMIT' ? (parseFloat(limitPrice) || liveLtp) : liveLtp
  const gross = priceUsed * qty
  // Leverage setting: ON → 5x margin; OFF → full contract value (1x) from funds.
  const leverage = prefs?.leverage_enabled === false ? 1 : 5
  const marginReq = gross / leverage
  const estCharges = Math.max(20, gross * 0.0006)   // rough estimate
  const isBuy = action === 'BUY'
  const insufficient = balance != null && marginReq > balance

  useEffect(() => {
    getAccount().then(r => setBalance(Number(r.data?.account?.balance ?? 0))).catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Close the setup-tag dropdown on an outside click.
  useEffect(() => {
    if (!setupOpen) return
    const onDoc = (e) => { if (setupRef.current && !setupRef.current.contains(e.target)) setSetupOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [setupOpen])

  // ── draggable window ──
  const [pos, setPos] = useState(() => ({
    x: Math.max(12, Math.round(window.innerWidth / 2 - 305)),
    y: 110,
  }))
  const dragging = useRef(false)
  const onHeaderDown = (e) => {
    if (e.target.closest('button')) return   // don't drag when hitting a header control
    dragging.current = true
    const startX = e.clientX, startY = e.clientY
    const origin = { ...pos }
    const move = (ev) => {
      setPos({
        x: Math.min(window.innerWidth - 90, Math.max(-40, origin.x + ev.clientX - startX)),
        y: Math.min(window.innerHeight - 70, Math.max(0, origin.y + ev.clientY - startY)),
      })
    }
    const up = () => {
      dragging.current = false
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const expLabel = expiry
    ? new Date(expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : ''

  const submit = async () => {
    setError('')
    if (!disciplineOff) {
      if (!sl || parseFloat(sl) <= 0) { setError('Stop Loss is mandatory when Discipline is ON.'); setAdvanced(true); return }
      if (!setupTag) { setError('Setup tag is mandatory when Discipline is ON.'); setAdvanced(true); return }
    }
    setLoading(true)
    try {
      await placeOrder({
        instrument, strike_price: parseInt(strike), option_type: optionType,
        action, quantity: lots, product_type: product,
        ltp: priceUsed,
        sl_price: sl && parseFloat(sl) > 0 ? parseFloat(sl) : null,
        target_price: target ? parseFloat(target) : null,
        expiry_date: expiry, setup_tag: setupTag || null,
      })
      // Always confirm — the ticket closes on success, so this is the only cue.
      success(`${action} order placed — ${instrument} ${Math.round(strike)} ${optionType} · ${qty} qty`)
      onPlaced?.()
      onClose?.()
    } catch (e) {
      const d = e.response?.data?.detail
      setError(typeof d === 'string' ? d : d?.message || 'Order failed — check discipline rules, margin, or market hours.')
    } finally {
      setLoading(false)
    }
  }

  const seg = (active) => ({
    flex: 1, border: 'none', cursor: 'pointer', borderRadius: 7, padding: '7px 0',
    fontSize: 12, fontWeight: 700, transition: 'all 0.12s',
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? 'var(--on-primary)' : 'var(--text-sub)',
  })
  const fieldLabel = { fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block' }

  return createPortal(
    <div
      role="dialog"
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000,
        width: 'min(610px, 94vw)', background: 'var(--color-surface)',
        border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-pop)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header (drag handle) ── */}
      <div onMouseDown={onHeaderDown}
        style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          padding: '13px 16px', cursor: 'move', userSelect: 'none',
          background: `linear-gradient(180deg, ${isBuy ? 'rgba(49,221,106,0.10)' : 'rgba(255,92,92,0.10)'} 0%, transparent 100%)`,
          borderBottom: '1px solid var(--border)',
        }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {instrument} {Math.round(strike)} {optionType}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>NSE · {expLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{Number(liveLtp).toFixed(2)}</div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>LTP</div>
          </div>
          {/* BUY / SELL flip */}
          <div style={{ display: 'flex', background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
            <button onClick={() => setAction('BUY')} style={{ border: 'none', cursor: 'pointer', borderRadius: 6, width: 26, height: 26, fontSize: 12, fontWeight: 800, background: isBuy ? 'var(--gain)' : 'transparent', color: isBuy ? '#08260f' : 'var(--gain-text)' }}>B</button>
            <button onClick={() => setAction('SELL')} style={{ border: 'none', cursor: 'pointer', borderRadius: 6, width: 26, height: 26, fontSize: 12, fontWeight: 800, background: !isBuy ? 'var(--loss)' : 'transparent', color: !isBuy ? '#2a0808' : 'var(--loss-text)' }}>S</button>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ display: 'grid', placeItems: 'center', height: 28, width: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--color-surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Product tabs ── */}
      <div style={{ display: 'flex', gap: 18, padding: '10px 16px 0' }}>
        {[['INTRADAY', 'Intraday'], ['NRML', 'Positional']].map(([v, label]) => (
          <button key={v} onClick={() => setProduct(v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 9px',
              fontSize: 12.5, fontWeight: 700,
              color: product === v ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: `2px solid ${product === v ? 'var(--primary)' : 'transparent'}`,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* left: qty + price */}
        <div>
          <label style={fieldLabel}>Quantity <span style={{ color: 'var(--text-muted)', fontWeight: 500, textTransform: 'none' }}>· {lots} lot{lots !== 1 ? 's' : ''} × {lotSize}</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 40, padding: '0 5px', background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <button type="button" aria-label="Decrease" className="sf-stepper-btn" onClick={() => setLots(l => Math.max(1, l - 1))}><Minus size={15} /></button>
            <input value={qty}
              onChange={e => { const v = parseInt(e.target.value); setLots(Math.max(1, Math.round((v || lotSize) / lotSize))) }}
              className="num"
              style={{ flex: 1, minWidth: 0, textAlign: 'center', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 15, fontWeight: 700, outline: 'none', padding: 0 }} />
            <button type="button" aria-label="Increase" className="sf-stepper-btn" onClick={() => setLots(l => l + 1)}><Plus size={15} /></button>
          </div>

          <label style={{ ...fieldLabel, marginTop: 12 }}>Price</label>
          <input className="sf-input num" value={orderType === 'LIMIT' ? limitPrice : Number(liveLtp).toFixed(2)}
            onChange={e => setLimitPrice(e.target.value)}
            readOnly={orderType !== 'LIMIT'}
            style={{ minHeight: 34, textAlign: 'right', fontWeight: 700 }} />
          {orderType === 'MARKET' && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Fills at live premium.</div>}
        </div>

        {/* right: order type */}
        <div>
          <label style={fieldLabel}>Order Type</label>
          <div style={{ display: 'flex', background: 'var(--color-surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: 3, gap: 3 }}>
            <button onClick={() => setOrderType('MARKET')} style={seg(orderType === 'MARKET')}>Market</button>
            <button onClick={() => setOrderType('LIMIT')} style={seg(orderType === 'LIMIT')}>Limit</button>
          </div>

          <button onClick={() => setAdvanced(a => !a)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 700, padding: 0 }}>
            {advanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {advanced ? 'Hide' : 'Show'} Advanced
          </button>
        </div>
      </div>

      {/* ── Advanced (SL / Target / Setup) ── */}
      {advanced && (
        <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={fieldLabel}>Stop Loss{!disciplineOff && ' ★'}</label>
            <input className="sf-input num" value={sl} onChange={e => setSl(e.target.value)} placeholder="0.00" style={{ minHeight: 34, textAlign: 'right' }} />
          </div>
          <div>
            <label style={fieldLabel}>Target</label>
            <input className="sf-input num" value={target} onChange={e => setTarget(e.target.value)} placeholder="0.00" style={{ minHeight: 34, textAlign: 'right' }} />
          </div>
          <div>
            <label style={fieldLabel}>Setup Tag{!disciplineOff && ' ★'}</label>
            <div ref={setupRef} style={{ position: 'relative' }}>
              <button type="button" onClick={() => setSetupOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
                  height: 34, padding: '0 11px', borderRadius: 8,
                  border: `1px solid ${setupOpen ? 'var(--primary-border)' : 'var(--border)'}`,
                  background: 'var(--color-surface)', cursor: 'pointer',
                  color: setupTag ? 'var(--text)' : 'var(--text-muted)',
                  fontSize: 12.5, fontWeight: setupTag ? 600 : 400,
                }}>
                {setupTag ? SETUP_TAG_LABELS[setupTag] : 'Select setup'}
                <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: setupOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
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
                          textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                          background: active ? 'var(--primary-bg)' : 'transparent',
                          color: active ? 'var(--primary)' : 'var(--text-sub)',
                          fontSize: 12.5, fontWeight: active ? 700 : 500,
                        }}>
                        {SETUP_TAG_LABELS[t]}
                        {active && <Check size={13} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ margin: '0 16px 12px', background: 'var(--loss-bg)', border: '1px solid var(--loss)', borderRadius: 8, padding: '8px 11px', color: 'var(--loss-text)', fontSize: 11.5, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--color-surface2)' }}>
        <div style={{ display: 'flex', gap: 18, fontSize: 11 }}>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Funds required</div>
            <div className="num" style={{ fontWeight: 700, color: insufficient ? 'var(--loss)' : 'var(--text)' }}>{money(marginReq)} <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>({leverage}x)</span></div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Available</div>
            <div className="num" style={{ fontWeight: 700, color: 'var(--text-sub)' }}>{balance != null ? money(balance) : '…'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Est. charges</div>
            <div className="num" style={{ fontWeight: 700, color: 'var(--text-sub)' }}>{money(estCharges)}</div>
          </div>
        </div>
        <button onClick={submit} disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 22px', borderRadius: 10,
            border: 'none', cursor: loading ? 'wait' : 'pointer', fontSize: 13.5, fontWeight: 700, color: '#fff',
            background: loading ? 'var(--text-muted)' : (isBuy ? 'var(--gain)' : 'var(--loss)'),
            boxShadow: loading ? 'none' : `0 8px 20px -8px ${isBuy ? 'rgba(49,221,106,0.6)' : 'rgba(255,92,92,0.6)'}`,
          }}>
          <Zap size={15} /> {loading ? 'Placing…' : `${isBuy ? 'BUY' : 'SELL'} · ${qty} qty`}
        </button>
      </div>
    </div>,
    document.body
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Check,
  Clock3,
  GripHorizontal,
  LogOut,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react'
import './PositionActionPanel.css'

const asNumber = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const money = (value, digits = 2) => `₹${Math.abs(asNumber(value)).toLocaleString('en-IN', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
})}`

const signedMoney = value => {
  const number = asNumber(value)
  return `${number >= 0 ? '+' : '-'}${money(number)}`
}

const parseOptionalPrice = value => {
  if (String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export default function PositionActionPanel({
  mode,
  position,
  order,
  live,
  busy = false,
  error = '',
  slRequired = true,
  onClose,
  onSave,
  onExitLimit,
  onExit,
}) {
  const [stopLoss, setStopLoss] = useState(order.sl_price ?? '')
  const [targetPrice, setTargetPrice] = useState(order.target_price ?? '')
  const [exitMode, setExitMode] = useState(
    order.exit_limit_price == null ? 'MARKET' : 'LIMIT',
  )
  const [limitPrice, setLimitPrice] = useState(order.exit_limit_price ?? '')
  const [validationError, setValidationError] = useState('')
  const panelRef = useRef(null)
  const primaryRef = useRef(null)
  const dragRef = useRef(null)
  const [panelPosition, setPanelPosition] = useState(() => ({
    x: Math.max(12, window.innerWidth - 484),
    y: Math.min(96, Math.max(12, window.innerHeight - 620)),
  }))

  const isModify = mode === 'modify'
  const ltp = asNumber(live?.ltp || position.current_ltp)
  const entry = asNumber(position.avg_entry_price)
  const contracts = asNumber(position.quantity) * asNumber(position.lot_size)
  const closingSide = position.action === 'BUY' ? 'SELL' : 'BUY'
  const sideTone = position.action === 'BUY' ? 'buy' : 'sell'

  const stop = parseOptionalPrice(stopLoss)
  const target = parseOptionalPrice(targetPrice)
  const limit = parseOptionalPrice(limitPrice)
  const projectedAt = level => {
    if (level == null || !Number.isFinite(level)) return null
    const points = position.action === 'BUY' ? level - entry : entry - level
    return points * contracts
  }
  const stopOutcome = projectedAt(stop)
  const targetOutcome = projectedAt(target)
  const limitOutcome = projectedAt(limit)
  const hasActiveLimit = order.exit_limit_price != null
  const isLimitExit = !isModify && exitMode === 'LIMIT'
  const isMarketableLimit = (
    limit != null
    && Number.isFinite(limit)
    && (
      (position.action === 'BUY' && limit <= ltp)
      || (position.action === 'SELL' && limit >= ltp)
    )
  )

  const directionHint = position.action === 'BUY'
    ? `For this BUY position, SL must stay below ${money(ltp)} and target above it.`
    : `For this SELL position, SL must stay above ${money(ltp)} and target below it.`
  const limitTriggerHint = limit == null || Number.isNaN(limit)
    ? 'Enter the premium you want.'
    : position.action === 'BUY'
      ? `SELL to close when the premium reaches ${money(limit)} or higher.`
      : `BUY to close when the premium reaches ${money(limit)} or lower.`

  const subtitle = `${position.instrument} ${Math.round(asNumber(position.strike_price))} ${position.option_type}`
  const displayError = validationError || error

  useEffect(() => {
    primaryRef.current?.focus()
  }, [exitMode, mode])

  useEffect(() => {
    const handleKey = event => {
      if (event.key === 'Escape' && !busy) onClose?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [busy, onClose])

  useEffect(() => () => {
    if (!dragRef.current) return
    document.removeEventListener('mousemove', dragRef.current.move)
    document.removeEventListener('mouseup', dragRef.current.up)
  }, [])

  const startDrag = event => {
    if (event.target.closest('button, input')) return
    const origin = panelRef.current?.getBoundingClientRect()
    if (!origin) return
    const startX = event.clientX
    const startY = event.clientY
    const move = moveEvent => {
      const width = panelRef.current?.offsetWidth || 460
      const height = panelRef.current?.offsetHeight || 560
      setPanelPosition({
        x: Math.min(
          Math.max(12, window.innerWidth - width - 12),
          Math.max(12, origin.left + moveEvent.clientX - startX),
        ),
        y: Math.min(
          Math.max(12, window.innerHeight - height - 12),
          Math.max(12, origin.top + moveEvent.clientY - startY),
        ),
      })
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      dragRef.current = null
    }
    dragRef.current = { move, up }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const submitProtection = event => {
    event.preventDefault()
    setValidationError('')

    if (slRequired && stop == null) {
      setValidationError('Stop Loss is mandatory while Discipline Mode is ON.')
      return
    }
    if (Number.isNaN(stop) || Number.isNaN(target)) {
      setValidationError('Enter valid numeric prices or leave an optional field blank.')
      return
    }
    if (stop != null && stop <= 0) {
      setValidationError('Stop Loss must be greater than zero.')
      return
    }
    if (target != null && target <= 0) {
      setValidationError('Target Price must be greater than zero.')
      return
    }
    if (position.action === 'BUY' && stop != null && stop >= ltp) {
      setValidationError(`Stop Loss must be below the current premium of ${money(ltp)}.`)
      return
    }
    if (position.action === 'BUY' && target != null && target <= ltp) {
      setValidationError(`Target Price must be above the current premium of ${money(ltp)}.`)
      return
    }
    if (position.action === 'SELL' && stop != null && stop <= ltp) {
      setValidationError(`Stop Loss must be above the current premium of ${money(ltp)}.`)
      return
    }
    if (position.action === 'SELL' && target != null && target >= ltp) {
      setValidationError(`Target Price must be below the current premium of ${money(ltp)}.`)
      return
    }

    onSave?.({
      sl_price: stop,
      target_price: target,
    })
  }

  const submitExitLimit = event => {
    event.preventDefault()
    setValidationError('')
    if (limit == null || Number.isNaN(limit)) {
      setValidationError('Enter a valid limit premium.')
      return
    }
    if (limit <= 0) {
      setValidationError('Limit premium must be greater than zero.')
      return
    }
    onExitLimit?.(limit)
  }

  const selectExitMode = nextMode => {
    setValidationError('')
    setExitMode(nextMode)
    if (
      nextMode === 'LIMIT'
      && String(limitPrice).trim() === ''
      && ltp > 0
    ) {
      setLimitPrice(ltp.toFixed(2))
    }
  }

  const summary = useMemo(() => [
    { label: 'Side', value: position.action, tone: sideTone },
    { label: 'Quantity', value: `${contracts} qty`, note: `${position.quantity} lot${position.quantity === 1 ? '' : 's'}` },
    { label: 'Entry', value: money(entry) },
    { label: 'LTP', value: money(ltp), tone: 'live' },
    { label: 'Open P&L', value: signedMoney(live?.pnl), tone: asNumber(live?.pnl) >= 0 ? 'gain' : 'loss' },
  ], [contracts, entry, live?.pnl, ltp, position.action, position.quantity, sideTone])

  return createPortal(
    <section
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="position-action-title"
      className={`position-action-panel ${isModify ? 'modify' : 'exit'}`}
      style={{
        left: panelPosition.x,
        '--position-panel-top': `${panelPosition.y}px`,
      }}
    >
      <header className="position-action-header" onMouseDown={startDrag}>
        <div className="position-action-title">
          <span className="position-action-icon">
            {isModify ? <ShieldCheck size={17} /> : <LogOut size={17} />}
          </span>
          <div>
            <h2 id="position-action-title">
              {isModify ? 'Modify protection' : 'Exit position'}
            </h2>
            <p>{subtitle} · {position.product_type === 'NRML' ? 'Carry-forward' : 'Intraday'}</p>
          </div>
        </div>
        <div className="position-action-header-controls">
          <span className="position-action-drag-hint"><GripHorizontal size={15} /> Drag</span>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close panel">
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="position-action-summary">
        {summary.map(item => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong className={item.tone || ''}>{item.value}</strong>
            {item.note && <small>{item.note}</small>}
          </div>
        ))}
      </div>

      {isModify ? (
        <form onSubmit={submitProtection}>
          <div className="position-action-body">
            <div className="position-action-section-heading">
              <div>
                <h3>Protection levels</h3>
                <p>{directionHint}</p>
              </div>
              <Target size={17} />
            </div>

            <div className="position-action-fields">
              <label>
                <span>Stop Loss {slRequired && <em>Required</em>}</span>
                <div className="position-action-input">
                  <span>₹</span>
                  <input
                    ref={primaryRef}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={stopLoss}
                    onChange={event => setStopLoss(event.target.value)}
                    placeholder="Not set"
                  />
                </div>
                <small>
                  {stopOutcome == null
                    ? 'No stop-loss protection'
                    : `Projected P&L at SL: ${signedMoney(stopOutcome)}`}
                </small>
              </label>
              <label>
                <span>Target Price <em className="optional">Optional</em></span>
                <div className="position-action-input">
                  <span>₹</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={targetPrice}
                    onChange={event => setTargetPrice(event.target.value)}
                    placeholder="Not set"
                  />
                </div>
                <small>
                  {targetOutcome == null
                    ? 'No automatic profit target'
                    : `Projected P&L at target: ${signedMoney(targetOutcome)}`}
                </small>
              </label>
            </div>

            <div className="position-action-info">
              <Check size={14} />
              <span>Saved levels are monitored by the 5-second auto-exit sweep during market hours.</span>
            </div>

            {displayError && (
              <div className="position-action-error" role="alert">
                <AlertTriangle size={15} />
                <span>{displayError}</span>
              </div>
            )}
          </div>

          <footer className="position-action-footer">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>
              <ShieldCheck size={15} />
              {busy ? 'Saving…' : 'Update protection'}
            </button>
          </footer>
        </form>
      ) : (
        <form onSubmit={isLimitExit ? submitExitLimit : event => event.preventDefault()}>
          <div className="position-action-body">
            <div className="position-action-section-heading">
              <div>
                <h3>Review exit order</h3>
                <p>The closing side and full quantity are fixed to flatten this position.</p>
              </div>
              <LogOut size={17} />
            </div>

            <div className="position-exit-type-tabs" role="tablist" aria-label="Exit order type">
              <button
                type="button"
                role="tab"
                aria-selected={exitMode === 'MARKET'}
                className={exitMode === 'MARKET' ? 'active market' : ''}
                onClick={() => selectExitMode('MARKET')}
                disabled={busy}
              >
                <LogOut size={14} />
                <span><strong>Market</strong><small>Exit now</small></span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={exitMode === 'LIMIT'}
                className={exitMode === 'LIMIT' ? 'active limit' : ''}
                onClick={() => selectExitMode('LIMIT')}
                disabled={busy}
              >
                <Clock3 size={14} />
                <span><strong>Limit</strong><small>Exit at your price</small></span>
                {hasActiveLimit && <em>Active</em>}
              </button>
            </div>

            {isLimitExit ? (
              <>
                <div className="position-exit-limit-editor">
                  <div className="position-exit-limit-label">
                    <span>Limit premium</span>
                    {hasActiveLimit && <em>Resting at {money(order.exit_limit_price)}</em>}
                  </div>
                  <div className="position-action-input">
                    <span>₹</span>
                    <input
                      ref={primaryRef}
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={limitPrice}
                      onChange={event => {
                        setLimitPrice(event.target.value)
                        setValidationError('')
                      }}
                      placeholder="Enter exit premium"
                    />
                  </div>
                  <div className="position-exit-limit-meta">
                    <span>{limitTriggerHint}</span>
                    <strong className={limitOutcome == null ? '' : limitOutcome >= 0 ? 'gain' : 'loss'}>
                      {limitOutcome == null ? 'Projected P&L —' : `Projected P&L ${signedMoney(limitOutcome)}`}
                    </strong>
                  </div>
                </div>

                <dl className="position-exit-order compact">
                  <div><dt>Transaction</dt><dd className={closingSide === 'BUY' ? 'buy' : 'sell'}>{closingSide} to close</dd></div>
                  <div><dt>Order type</dt><dd>Limit · Full quantity</dd></div>
                  <div><dt>Quantity</dt><dd>{contracts} qty · {position.quantity} lot{position.quantity === 1 ? '' : 's'}</dd></div>
                  <div><dt>Current premium</dt><dd>{money(ltp)}</dd></div>
                </dl>

                <div className={isMarketableLimit ? 'position-action-warning' : 'position-action-info'}>
                  {isMarketableLimit ? <AlertTriangle size={16} /> : <Clock3 size={15} />}
                  <span>
                    {isMarketableLimit
                      ? 'The current premium already satisfies this limit, so it can close on the next eligible 5-second scan.'
                      : 'The instruction stays active until the premium reaches your price, you cancel it, or the position closes.'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <dl className="position-exit-order">
                  <div><dt>Transaction</dt><dd className={closingSide === 'BUY' ? 'buy' : 'sell'}>{closingSide} to close</dd></div>
                  <div><dt>Order type</dt><dd>Market</dd></div>
                  <div><dt>Quantity</dt><dd>{contracts} qty · {position.quantity} lot{position.quantity === 1 ? '' : 's'}</dd></div>
                  <div><dt>Reference premium</dt><dd>{money(ltp)}</dd></div>
                  <div><dt>Estimated P&L</dt><dd className={asNumber(live?.pnl) >= 0 ? 'gain' : 'loss'}>{signedMoney(live?.pnl)}</dd></div>
                </dl>

                <div className="position-action-warning">
                  <AlertTriangle size={16} />
                  <span>
                    Confirming exits at the current available premium. The final fill includes configured slippage and exit charges, so final P&L may differ from this estimate.
                  </span>
                </div>
              </>
            )}

            {displayError && (
              <div className="position-action-error" role="alert">
                <AlertTriangle size={15} />
                <span>{displayError}</span>
              </div>
            )}
          </div>

          <footer className="position-action-footer">
            {isLimitExit && hasActiveLimit && (
              <button
                type="button"
                className="secondary cancel-limit"
                onClick={() => onExitLimit?.(null)}
                disabled={busy}
              >
                Cancel active limit
              </button>
            )}
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              Keep position
            </button>
            <button
              ref={isLimitExit ? undefined : primaryRef}
              type={isLimitExit ? 'submit' : 'button'}
              className={isLimitExit ? 'primary' : 'exit'}
              onClick={isLimitExit ? undefined : onExit}
              disabled={busy}
            >
              {isLimitExit ? <Clock3 size={15} /> : <LogOut size={15} />}
              {busy
                ? isLimitExit ? 'Saving…' : 'Exiting…'
                : isLimitExit
                  ? hasActiveLimit ? 'Update limit exit' : 'Place limit exit'
                  : `Exit ${contracts} at market`}
            </button>
          </footer>
        </form>
      )}
    </section>,
    document.body,
  )
}

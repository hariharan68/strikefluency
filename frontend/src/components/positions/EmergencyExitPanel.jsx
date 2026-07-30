import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, LogOut, ShieldAlert, X } from 'lucide-react'
import './EmergencyExitPanel.css'

const asNumber = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const money = value => `₹${Math.abs(asNumber(value)).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`

const signedMoney = value => {
  const number = asNumber(value)
  return `${number >= 0 ? '+' : '-'}${money(number)}`
}

export default function EmergencyExitPanel({
  positions,
  busy = false,
  error = '',
  onClose,
  onConfirm,
}) {
  const confirmRef = useRef(null)
  const totalLots = positions.reduce(
    (sum, position) => sum + asNumber(position.quantity),
    0,
  )
  const totalContracts = positions.reduce(
    (sum, position) => (
      sum
      + asNumber(position.quantity) * asNumber(position.lot_size)
    ),
    0,
  )
  const estimatedPnl = positions.reduce(
    (sum, position) => sum + asNumber(position.live_pnl),
    0,
  )

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKey = event => {
      if (event.key === 'Escape' && !busy) onClose?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [busy, onClose])

  return createPortal(
    <div
      className="emergency-exit-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose?.()
      }}
    >
      <section
        className="emergency-exit-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="emergency-exit-title"
        aria-describedby="emergency-exit-description"
      >
        <header>
          <span className="emergency-exit-icon">
            <ShieldAlert size={19} />
          </span>
          <div>
            <h2 id="emergency-exit-title">Emergency exit</h2>
            <p>Standalone option-buying positions only</p>
          </div>
          <button
            type="button"
            className="emergency-exit-close"
            aria-label="Close emergency exit panel"
            onClick={onClose}
            disabled={busy}
          >
            <X size={17} />
          </button>
        </header>

        <div className="emergency-exit-body">
          <div className="emergency-exit-warning">
            <AlertTriangle size={17} />
            <div>
              <strong>
                Exit {positions.length} open BUY position{positions.length === 1 ? '' : 's'} at market?
              </strong>
              <p id="emergency-exit-description">
                This is one immediate instruction. Every eligible position is
                closed in one transaction using the current available premium.
              </p>
            </div>
          </div>

          <dl className="emergency-exit-summary">
            <div>
              <dt>Positions</dt>
              <dd>{positions.length}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{totalContracts} qty</dd>
              <small>{totalLots} lot{totalLots === 1 ? '' : 's'}</small>
            </div>
            <div>
              <dt>Open P&amp;L</dt>
              <dd className={estimatedPnl >= 0 ? 'gain' : 'loss'}>
                {signedMoney(estimatedPnl)}
              </dd>
            </div>
          </dl>

          <div className="emergency-exit-list" aria-label="Positions to exit">
            {positions.slice(0, 4).map(position => (
              <div key={position.order_id}>
                <span>
                  <strong>
                    {position.instrument} {Math.round(asNumber(position.strike_price))} {position.option_type}
                  </strong>
                  <small>
                    {asNumber(position.quantity) * asNumber(position.lot_size)} qty
                    {' · '}
                    {position.product_type === 'NRML' ? 'Carry-forward' : 'Intraday'}
                  </small>
                </span>
                <strong className={asNumber(position.live_pnl) >= 0 ? 'gain' : 'loss'}>
                  {signedMoney(position.live_pnl)}
                </strong>
              </div>
            ))}
            {positions.length > 4 && (
              <p>+{positions.length - 4} more eligible position{positions.length - 4 === 1 ? '' : 's'}</p>
            )}
          </div>

          <div className="emergency-exit-exclusion">
            <ShieldAlert size={15} />
            <span>
              Strategy positions and standalone SELL positions are excluded and
              will remain open.
            </span>
          </div>

          {error && (
            <div className="emergency-exit-error" role="alert">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer>
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Keep positions
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="confirm"
            onClick={onConfirm}
            disabled={busy || positions.length === 0}
          >
            <LogOut size={16} />
            {busy
              ? 'Exiting…'
              : `Exit ${positions.length} position${positions.length === 1 ? '' : 's'} now`}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

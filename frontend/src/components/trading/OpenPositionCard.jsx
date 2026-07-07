import { useState } from 'react'
import { formatCurrency, formatPnL, formatDate } from '../../utils/formatters'
import Button from '../common/Button'
import { TrendingUp, TrendingDown, X } from 'lucide-react'

export default function OpenPositionCard({ position, onClose }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  const pnl = formatPnL(position.unrealized_pnl ?? position.net_pnl ?? 0)
  const isCall = position.option_type === 'CE'

  const handleClose = async () => {
    if (!confirming) { setConfirming(true); return }
    setLoading(true)
    try {
      await onClose(position.id || position.order_id)
    } catch {}
    setLoading(false)
    setConfirming(false)
  }

  return (
    <div style={{
      background: '#181b25',
      border: '1px solid #2b303b',
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: isCall ? 'rgba(62,224,137,0.12)' : 'rgba(233,53,68,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {isCall
              ? <TrendingUp size={16} color="#3ee089" />
              : <TrendingDown size={16} color="#ff6875" />
            }
          </div>
          <div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
              {position.instrument} {position.strike} {position.option_type}
            </div>
            <div style={{ color: '#717784', fontSize: 11 }}>
              {position.action} · {position.lots} lot{position.lots !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: pnl.color, fontSize: 15, fontWeight: 500 }}>
            {pnl.signed}
          </div>
          <div style={{ color: '#717784', fontSize: 11 }}>Unrealized P&L</div>
        </div>
      </div>

      {/* Details */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: '#99a0ae', fontSize: 12 }}>
          Entry: <span style={{ color: '#fff' }}>₹{position.entry_price}</span>
        </span>
        {position.stop_loss && (
          <span style={{ color: '#99a0ae', fontSize: 12 }}>
            SL: <span style={{ color: '#ff6875' }}>₹{position.stop_loss}</span>
          </span>
        )}
        {position.target_price && (
          <span style={{ color: '#99a0ae', fontSize: 12 }}>
            Target: <span style={{ color: '#3ee089' }}>₹{position.target_price}</span>
          </span>
        )}
      </div>

      {/* Close button */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {confirming && (
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        )}
        <Button
          variant="danger"
          size="sm"
          onClick={handleClose}
          disabled={loading}
          style={{ flex: 1 }}
        >
          {loading ? 'Closing...' : confirming ? 'Confirm Close' : 'Close Position'}
        </Button>
      </div>
    </div>
  )
}

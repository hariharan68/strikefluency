import { XCircle } from 'lucide-react'
import { toDisplayMessage } from '../../utils/apiError'

export default function ErrorMessage({ message }) {
  if (!message) return null
  const displayMessage = toDisplayMessage(message)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px',
      background: 'rgba(251,55,72,0.12)',
      border: '1px solid rgba(233,53,68,0.3)',
      borderRadius: 10,
      color: '#ff6875',
      fontSize: 14,
      fontFamily: 'Inter,sans-serif'
    }}>
      <XCircle size={16} color="#ff6875" style={{ flexShrink: 0 }} />
      <span>{displayMessage}</span>
    </div>
  )
}

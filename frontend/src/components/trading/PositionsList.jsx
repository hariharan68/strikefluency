import OpenPositionCard from './OpenPositionCard'
import EmptyState from '../common/EmptyState'
import { TrendingUp } from 'lucide-react'
import useTradingStore from '../../store/tradingStore'

export default function PositionsList({ onClose }) {
  const positions = useTradingStore(s => s.positions)
  const openPositions = positions.filter(p => p.status === 'OPEN' || !p.status)

  if (openPositions.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp size={28} color="#714B67" />}
        title="No open positions"
        subtitle="Place a trade from the option chain"
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {openPositions.map((pos, i) => (
        <OpenPositionCard
          key={pos.id || pos.order_id || i}
          position={pos}
          onClose={onClose}
        />
      ))}
    </div>
  )
}

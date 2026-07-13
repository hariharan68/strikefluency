import { Flame } from 'lucide-react'

export default function DisciplineStreakBadge({ streak = 0 }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px',
      background: streak > 0 ? 'rgba(233,125,53,0.16)' : 'rgba(43,48,59,0.5)',
      border: `1px solid ${streak > 0 ? 'rgba(233,125,53,0.4)' : 'var(--border)'}`,
      borderRadius: 20
    }}>
      <Flame size={14} color={streak > 0 ? '#e97d35' : '#717784'} />
      <span style={{
        color: streak > 0 ? '#e97d35' : '#717784',
        fontSize: 13, fontWeight: 500
      }}>
        {streak} day{streak !== 1 ? 's' : ''} streak
      </span>
    </div>
  )
}

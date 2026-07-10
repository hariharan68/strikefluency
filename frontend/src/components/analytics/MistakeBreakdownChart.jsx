import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { MISTAKE_LABELS } from '../../utils/constants'
import EmptyState from '../common/EmptyState'
import { AlertTriangle } from 'lucide-react'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div style={{
      background: '#F3F4F6', border: '1px solid #E5E7EB',
      borderRadius: 8, padding: '10px 14px'
    }}>
      <div style={{ color: item.payload.color, fontSize: 13, fontWeight: 500 }}>
        {item.name}
      </div>
      <div style={{ color: '#6B7280', fontSize: 12 }}>
        {item.value} occurrence{item.value !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

export default function MistakeBreakdownChart({ data = [] }) {
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} color="#e97d35" />}
        title="No mistake data yet"
        subtitle="Review your trades to log mistakes"
      />
    )
  }

  const chartData = data.map(item => ({
    name: MISTAKE_LABELS[item.category]?.label || item.category,
    value: item.count,
    color: MISTAKE_LABELS[item.category]?.color || '#717784'
  })).filter(d => d.value > 0)

  if (chartData.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} color="#e97d35" />}
        title="No mistakes logged"
        subtitle="Great discipline!"
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={85}
          paddingAngle={3}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (
            <span style={{ color: '#6B7280', fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

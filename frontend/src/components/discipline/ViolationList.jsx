import { RULE_LABELS } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'
import EmptyState from '../common/EmptyState'
import { Shield } from 'lucide-react'

export default function ViolationList({ violations = [] }) {
  if (violations.length === 0) {
    return (
      <EmptyState
        icon={<Shield size={28} color="#3ee089" />}
        title="No violations"
        subtitle="Your discipline is on point!"
      />
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2b303b' }}>
            {['Rule', 'Type', 'Time'].map(h => (
              <th key={h} style={{
                textAlign: 'left', color: '#717784', fontSize: 12,
                padding: '8px 12px', fontWeight: 500
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {violations.map((v, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #181b25' }}>
              <td style={{ padding: '10px 12px', color: '#fff', fontSize: 13 }}>
                {RULE_LABELS[v.rule_code] || v.rule_code}
              </td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 500,
                  background: v.was_blocked ? 'rgba(233,53,68,0.12)' : 'rgba(233,125,53,0.12)',
                  color: v.was_blocked ? '#ff6875' : '#e97d35'
                }}>
                  {v.was_blocked ? 'Blocked' : 'Warning'}
                </span>
              </td>
              <td style={{ padding: '10px 12px', color: '#717784', fontSize: 12 }}>
                {formatDate(v.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

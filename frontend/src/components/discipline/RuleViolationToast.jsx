import { AlertTriangle } from 'lucide-react'
import { RULE_LABELS } from '../../utils/constants'

export default function RuleViolationToast({ ruleCode, wasBlocked }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px',
      background: wasBlocked ? 'rgba(233,53,68,0.12)' : 'rgba(233,125,53,0.12)',
      border: `1px solid ${wasBlocked ? 'rgba(233,53,68,0.4)' : 'rgba(233,125,53,0.4)'}`,
      borderRadius: 10
    }}>
      <AlertTriangle size={16} color={wasBlocked ? '#ff6875' : '#e97d35'} />
      <div>
        <div style={{ color: wasBlocked ? '#ff6875' : '#e97d35', fontSize: 13, fontWeight: 500 }}>
          Rule {wasBlocked ? 'Violated' : 'Warning'}
        </div>
        <div style={{ color: '#6B7280', fontSize: 12 }}>
          {RULE_LABELS[ruleCode] || ruleCode}
        </div>
      </div>
    </div>
  )
}

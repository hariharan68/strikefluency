import { useEffect, useState } from 'react'
import useDiscipline from '../../hooks/useDiscipline'
import { RULE_LABELS } from '../../utils/constants'
import { formatDate } from '../../utils/formatters'
import { X } from 'lucide-react'

const Card = ({ children, style = {} }) => (
  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', ...style }}>
    {children}
  </div>
)
const CardHeader = ({ title }) => (
  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
    <span style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>{title}</span>
  </div>
)

function ScoreRing({ score = 0 }) {
  const r = 44, cx = 52, cy = 52, circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626'
  return (
    <svg width={104} height={104} viewBox="0 0 104 104">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={9} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 52 52)" style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="20" fontFamily="'JetBrains Mono',monospace" fontWeight="600">
        {Math.round(score)}
      </text>
      <text x={cx} y={cy + 15} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="Inter,sans-serif" fontWeight="500">
        SCORE
      </text>
    </svg>
  )
}

function RuleRow({ rule, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const rv = typeof rule.rule_value === 'object' ? rule.rule_value : {}
  const label = RULE_LABELS[rule.rule_code] || rule.rule_code
  const isEnabled = rv.enabled !== false
  const numKey = Object.keys(rv).find(k => typeof rv[k] === 'number' && k !== 'enabled')
  const numVal = numKey ? rv[numKey] : null

  const save = async () => {
    try {
      const nv = { ...rv }
      const n = parseFloat(val)
      if (!isNaN(n) && numKey) nv[numKey] = n
      await onUpdate(rule.rule_code, nv)
    } catch {}
    setEditing(false)
  }

  return (
    <tr className="chain-row" style={{ borderBottom: '1px solid #f8fafc' }}>
      <td style={{ padding: '11px 16px' }}>
        <div style={{ color: '#1e293b', fontSize: 13 }}>{label}</div>
        <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>{rule.rule_code}</div>
      </td>
      <td style={{ padding: '11px 8px', textAlign: 'center' }}>
        <span style={{
          fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
          background: isEnabled ? '#dcfce7' : '#f1f5f9',
          color: isEnabled ? '#15803d' : '#94a3b8'
        }}>{isEnabled ? 'ACTIVE' : 'OFF'}</span>
      </td>
      <td className="num" style={{ padding: '11px 8px', textAlign: 'center', color: '#374151', fontSize: 13, fontWeight: 500 }}>
        {numVal != null ? numVal : '—'}
      </td>
      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <input className="sf-input" style={{ width: 80, height: 32, padding: '4px 8px' }} type="number" step="0.5"
              defaultValue={numVal} onChange={e => setVal(e.target.value)} autoFocus />
            <button onClick={save} className="sf-btn-primary" style={{ height: 32, padding: '0 12px', fontSize: 12 }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <button onClick={() => { setEditing(true); setVal(numVal?.toString() || '') }} className="sf-btn-outline">Edit</button>
        )}
      </td>
    </tr>
  )
}

export default function DisciplinePage() {
  const { rules, score, violations, loading, loadRules, loadScore, loadViolations, updateRule } = useDiscipline()
  useEffect(() => { loadRules(); loadScore(); loadViolations() }, [])
  const scoreVal = score?.score ?? score?.discipline_score ?? 0
  const streak = score?.consecutive_disciplined_trades ?? score?.streak ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Score strip */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 22px', gap: 28 }}>
          <ScoreRing score={Number(scoreVal)} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Discipline Metrics</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {[
                { label: 'Compliance Score', value: `${Math.round(Number(scoreVal))}%`, color: Number(scoreVal) >= 70 ? '#16a34a' : '#d97706' },
                { label: 'Disciplined Streak', value: `${streak} trades`, color: '#1e293b' },
                { label: 'Active Rules', value: `${rules.filter(r => r.rule_value?.enabled !== false).length} / ${rules.length}`, color: '#1e293b' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{item.label}</div>
                  <div className="num" style={{ color: item.color, fontSize: 18, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Rules */}
      <Card>
        <CardHeader title="Trading Rules" />
        {rules.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>No rules found. Rules are created when you first register.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Rule', 'Status', 'Value', ''].map((h, i) => (
                  <th key={i} style={{ padding: '8px 16px', textAlign: i === 3 ? 'right' : i >= 1 ? 'center' : 'left', color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => <RuleRow key={rule.rule_code || rule.id} rule={rule} onUpdate={updateRule} />)}
            </tbody>
          </table>
        )}
      </Card>

      {/* Violations */}
      <Card>
        <CardHeader title={`Recent Violations (${violations.length})`} />
        {violations.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>No violations — excellent discipline!</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Rule', 'Status', 'Time'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {violations.slice(0, 20).map((v, i) => (
                <tr key={i} className="chain-row" style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '9px 16px', color: '#374151', fontSize: 12 }}>{RULE_LABELS[v.rule_code] || v.rule_code}</td>
                  <td style={{ padding: '9px 16px' }}>
                    <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 600, background: v.was_blocked ? '#fee2e2' : '#fef3c7', color: v.was_blocked ? '#b91c1c' : '#92400e' }}>
                      {v.was_blocked ? 'BLOCKED' : 'WARNED'}
                    </span>
                  </td>
                  <td className="num" style={{ padding: '9px 16px', color: '#94a3b8', fontSize: 11 }}>{formatDate(v.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

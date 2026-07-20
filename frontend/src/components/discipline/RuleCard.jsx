import { useState } from 'react'
import { RULE_LABELS } from '../../utils/constants'
import Button from '../common/Button'
import { Edit2, Check, X } from 'lucide-react'

function parseRuleValue(ruleCode, ruleValue) {
  if (!ruleValue) return 'Not set'
  try {
    const parsed = typeof ruleValue === 'string' ? JSON.parse(ruleValue) : ruleValue
    if (ruleCode === 'MANDATORY_SL' || ruleCode === 'NO_AVERAGING_DOWN' ||
      ruleCode === 'NO_DIRECTION_FLIP' || ruleCode === 'MANDATORY_SETUP_TAG') {
      return parsed === true || parsed === 'true' ? 'Enabled' : 'Disabled'
    }
    if (ruleCode === 'MAX_TRADES_PER_DAY') return `${parsed} trades`
    if (ruleCode === 'MAX_DAILY_LOSS') return `₹${parsed}`
    if (ruleCode === 'REVENGE_COOLDOWN') return `${parsed} minutes`
    return String(parsed)
  } catch {
    return String(ruleValue)
  }
}

function getInputType(ruleCode) {
  if (['MANDATORY_SL', 'NO_AVERAGING_DOWN', 'NO_DIRECTION_FLIP', 'MANDATORY_SETUP_TAG'].includes(ruleCode)) {
    return 'boolean'
  }
  return 'number'
}

export default function RuleCard({ rule, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const label = RULE_LABELS[rule.rule_code] || rule.rule_code
  const displayValue = parseRuleValue(rule.rule_code, rule.rule_value)
  const inputType = getInputType(rule.rule_code)

  const startEdit = () => {
    try {
      const v = typeof rule.rule_value === 'string' ? JSON.parse(rule.rule_value) : rule.rule_value
      setEditValue(String(v))
    } catch {
      setEditValue(String(rule.rule_value || ''))
    }
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      let value = editValue
      if (inputType === 'boolean') value = editValue === 'true' || editValue === true
      else value = Number(editValue)
      await onUpdate(rule.rule_code, JSON.stringify(value))
      setEditing(false)
    } catch {} finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: 'var(--border)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>{label}</div>
        {!editing && (
          <div style={{ color: 'var(--text-sub)', fontSize: 12, marginTop: 4 }}>{displayValue}</div>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {inputType === 'boolean' ? (
            <select
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              style={{
                background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text)', padding: '6px 10px', fontSize: 13, fontFamily: 'Inter,sans-serif'
              }}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          ) : (
            <input
              type="number"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              style={{
                width: 80, background: 'var(--color-surface)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', padding: '6px 10px',
                fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none'
              }}
            />
          )}
          <button onClick={save} disabled={saving} style={{
            background: 'rgba(51,92,255,0.2)', border: 'none', borderRadius: 6,
            padding: '6px', cursor: 'pointer', display: 'flex'
          }}>
            <Check size={14} color="var(--primary)" />
          </button>
          <button onClick={() => setEditing(false)} style={{
            background: 'rgba(233,53,68,0.2)', border: 'none', borderRadius: 6,
            padding: '6px', cursor: 'pointer', display: 'flex'
          }}>
            <X size={14} color="#e93544" />
          </button>
        </div>
      ) : (
        <button onClick={startEdit} style={{
          background: 'var(--border)', border: 'none', borderRadius: 6,
          padding: '6px', cursor: 'pointer', display: 'flex'
        }}>
          <Edit2 size={14} color="var(--text-sub)" />
        </button>
      )}
    </div>
  )
}

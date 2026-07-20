import { useEffect, useState } from 'react'
import { Wallet, SlidersHorizontal, Info } from 'lucide-react'
import useDiscipline from '../../hooks/useDiscipline'
import DisciplineModeToggle from '../../components/discipline/DisciplineModeToggle'
import { RULE_LABELS, FULL_SANDBOX_CAPITAL } from '../../utils/constants'

const fmtMoney = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

const Card = ({ children, style = {} }) => (
  <div className="sf-card" style={{ padding: 18, ...style }}>{children}</div>
)

const SectionTitle = ({ icon: Icon, title, sub }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
    <Icon size={17} color="var(--primary)" />
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: "'Inter', sans-serif" }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  </div>
)

// One editable rule (value + enable toggle when the rule supports it)
function RuleCard({ rule, onUpdate, dimmed }) {
  const rv = typeof rule.rule_value === 'object' ? rule.rule_value : {}
  const label = RULE_LABELS[rule.rule_code] || rule.rule_code
  const hasEnabled = Object.prototype.hasOwnProperty.call(rv, 'enabled')
  const isEnabled = rv.enabled !== false
  const numKey = Object.keys(rv).find(k => typeof rv[k] === 'number' && k !== 'enabled')
  const numVal = numKey ? rv[numKey] : null

  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  const saveNum = async () => {
    const n = parseFloat(val)
    if (!isNaN(n) && numKey) await onUpdate(rule.rule_code, { ...rv, [numKey]: n })
    setEditing(false)
  }
  const toggleEnabled = () => onUpdate(rule.rule_code, { ...rv, enabled: !isEnabled })

  return (
    <div style={{
      background: 'var(--tile)', border: '1px solid var(--border-light)', borderRadius: 12,
      padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12,
      opacity: dimmed ? 0.55 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{rule.rule_code}</div>
      </div>

      {numKey && (
        editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input className="sf-input" style={{ width: 72, height: 30, padding: '4px 8px' }} type="number" step="0.5"
              defaultValue={numVal} onChange={e => setVal(e.target.value)} autoFocus />
            <button onClick={saveNum} className="sf-btn-primary" style={{ height: 30, padding: '0 10px', fontSize: 12 }}>Save</button>
          </div>
        ) : (
          <button onClick={() => { setEditing(true); setVal(numVal?.toString() || '') }}
            className="num" style={{ background: 'none', border: '1px solid var(--border-light)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
            {numVal}
          </button>
        )
      )}

      {hasEnabled && (
        <button onClick={toggleEnabled} style={{
          fontSize: 10, padding: '4px 11px', borderRadius: 20, fontWeight: 700, border: 'none', cursor: 'pointer',
          background: isEnabled ? 'var(--gain-bg)' : 'var(--border-light)',
          color: isEnabled ? 'var(--gain-text)' : 'var(--text-muted)',
        }}>{isEnabled ? 'ACTIVE' : 'OFF'}</button>
      )}
    </div>
  )
}

export default function DisciplineModePage() {
  const { rules, mode, loadRules, loadMode, updateRule } = useDiscipline()
  const [tick, setTick] = useState(0)

  useEffect(() => { loadRules(); loadMode() }, [tick])

  const off = mode?.enabled === false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero master switch — re-fetches page state after a toggle */}
      <DisciplineModeToggle variant="full" onChange={() => setTick(t => t + 1)} />

      {/* Capital status */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionTitle icon={Wallet} title="Sandbox Capital" sub="Discipline earns capital tiers; free-play unlocks it all." />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {[
            { label: 'Balance', value: fmtMoney(mode?.balance) },
            { label: 'Tier', value: mode?.tier || '—' },
            { label: 'Full Capital', value: mode?.capital_unlocked ? 'Unlocked' : 'Locked', tone: mode?.capital_unlocked ? 'var(--warn)' : 'var(--text-muted)' },
          ].map(t => (
            <div key={t.label} style={{ flex: '1 1 140px', background: 'var(--tile)', border: '1px solid var(--border-light)', borderRadius: 12, padding: '13px 15px' }}>
              <div className="eyebrow" style={{ fontSize: 9.5 }}>{t.label}</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 700, color: t.tone || 'var(--text)', marginTop: 5 }}>{t.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Rule customization */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SectionTitle icon={SlidersHorizontal} title="Discipline Rules"
          sub={off ? 'Rules are bypassed while Discipline Mode is OFF.' : 'Tune the 7 guardrails that gate every order.'} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {rules.length === 0
            ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No rules found.</div>
            : rules.map(r => <RuleCard key={r.rule_code} rule={r} onUpdate={updateRule} dimmed={off} />)}
        </div>
      </Card>

      {/* Explainer */}
      <Card style={{ display: 'flex', gap: 12 }}>
        <Info size={17} color="var(--primary)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text-sub)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>When Discipline Mode is OFF:</strong> all 7 rules are bypassed —
          you can place orders with no stop-loss or setup tag, with no trade/loss limits or cooldowns. Your
          full {fmtMoney(FULL_SANDBOX_CAPITAL)} sandbox capital is unlocked, and any trades you take are flagged as free-play so they
          never affect your discipline score or tier streak. Turn it back ON at any time to resume the
          disciplined sandbox — your capital is kept, not reset.
        </div>
      </Card>
    </div>
  )
}

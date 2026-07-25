import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Flame,
  Info,
  Layers3,
  LockKeyhole,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { RULE_LABELS } from '../../utils/constants'
import {
  CATEGORY_META,
  DEFAULT_NOTIFICATIONS,
  PRESETS,
  RULE_META,
  TIER_CAPITAL,
  formatRuleValue,
  isRuleEnabled,
  readRuleValue,
  tierLabel,
} from './disciplineConfig'

const money = value => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(Number(value || 0))

const safeDate = value => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const dateTime = value => {
  const parsed = safeDate(value)
  if (!parsed) return 'Time unavailable'
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const severityFor = violation => RULE_META[violation?.rule_code]?.severity || (
  violation?.was_blocked ? 'high' : 'low'
)

const mostViolated = violations => {
  const counts = violations.reduce((map, violation) => {
    map[violation.rule_code] = (map[violation.rule_code] || 0) + 1
    return map
  }, {})
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
}

function CardHeader({ icon: Icon, title, description, action }) {
  return (
    <header className="discipline-card-header">
      <span className="discipline-card-icon"><Icon size={17} /></span>
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="discipline-card-action">{action}</div>}
    </header>
  )
}

function ProgressBar({ value, tone = '' }) {
  const width = Math.max(0, Math.min(100, Number(value || 0)))
  return (
    <div className={`discipline-progress-bar ${tone}`} aria-label={`${Math.round(width)} percent`}>
      <span style={{ width: `${width}%` }} />
    </div>
  )
}

export function OverviewTab({
  mode,
  score,
  rules,
  violations,
  progress,
  onTabChange,
  onSelectRule,
}) {
  const scoreValue = Number(score?.score || 0)
  const tier = progress?.tier_progress
  const activeRules = rules.filter(isRuleEnabled)
  const categories = Object.keys(CATEGORY_META).map(key => ({
    key,
    ...CATEGORY_META[key],
    active: activeRules.filter(rule => RULE_META[rule.rule_code]?.category === key).length,
    total: rules.filter(rule => RULE_META[rule.rule_code]?.category === key).length,
  }))
  const frequent = mostViolated(violations)

  return (
    <div className="discipline-overview-layout">
      <section className="discipline-overview-main">
        <article className="discipline-panel discipline-capital-card">
          <CardHeader
            icon={CircleDollarSign}
            title="Sandbox capital"
            description="Capital access grows through consistent disciplined trading."
            action={<span className="discipline-status-badge info">{tierLabel(mode?.tier)}</span>}
          />
          <div className="discipline-capital-primary">
            <div>
              <small>Current balance</small>
              <strong className="num">{money(mode?.balance)}</strong>
              <span>{mode?.capital_unlocked ? 'Full sandbox capital unlocked' : 'Protected by your current tier'}</span>
            </div>
            <div className="discipline-capital-lock">
              {mode?.capital_unlocked ? <ShieldCheck size={28} /> : <LockKeyhole size={28} />}
              <b>{mode?.capital_unlocked ? 'Unlocked' : 'Tier protected'}</b>
            </div>
          </div>
          <div className="discipline-capital-grid">
            <div><span>Tier allocation</span><strong className="num">{money(tier?.current_capital_limit || TIER_CAPITAL[mode?.tier])}</strong></div>
            <div><span>Next allocation</span><strong className="num">{tier?.next_capital_limit ? money(tier.next_capital_limit) : 'Maximum tier'}</strong></div>
            <div><span>Trades remaining</span><strong className="num">{tier?.streak_remaining ?? score?.trades_to_next_tier ?? 0}</strong></div>
          </div>
          <div className="discipline-tier-progress">
            <div><span>{tier?.next_tier ? `${tierLabel(tier.current_tier)} → ${tierLabel(tier.next_tier)}` : 'Maximum tier reached'}</span><b>{Math.round(tier?.progress_pct || 0)}%</b></div>
            <ProgressBar value={tier?.progress_pct || 0} />
            <p>{tier?.next_tier
              ? `Complete ${tier.streak_remaining} more consecutive disciplined trades to reach ${tierLabel(tier.next_tier)}.`
              : 'Your account currently has the maximum configured sandbox allocation.'}</p>
          </div>
        </article>

        <article className="discipline-panel">
          <CardHeader
            icon={Layers3}
            title="Active rule coverage"
            description={`${activeRules.length} of ${rules.length} configured guardrails are currently enforced.`}
            action={<button className="discipline-text-button" onClick={() => onTabChange('rules')}>Manage rules <ArrowRight size={13} /></button>}
          />
          <div className="discipline-category-summary">
            {categories.map(category => (
              <button key={category.key} onClick={() => onTabChange('rules')}>
                <span className={`discipline-category-mark ${category.key}`}><Shield size={17} /></span>
                <span><b>{category.label}</b><small>{category.description}</small></span>
                <strong className="num">{category.active}/{category.total}</strong>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          {activeRules.length > 0 && (
            <div className="discipline-rule-chips">
              {activeRules.map(rule => (
                <button key={rule.rule_code} onClick={() => onSelectRule(rule)}>
                  <Check size={12} /> {RULE_LABELS[rule.rule_code] || rule.rule_code}
                </button>
              ))}
            </div>
          )}
        </article>
      </section>

      <aside className="discipline-overview-side">
        <article className="discipline-panel discipline-score-card">
          <CardHeader icon={Target} title="Discipline score" description="Rolling compliance across the latest 20 closed disciplined trades." />
          <div className="discipline-score-orbit" style={{ '--score': scoreValue }}>
            <div><strong className="num">{Math.round(scoreValue)}</strong><small>/100</small></div>
          </div>
          <div className="discipline-score-facts">
            <div><span>Risk controls</span><b>{rules.filter(rule => RULE_META[rule.rule_code]?.category === 'risk' && isRuleEnabled(rule)).length} active</b></div>
            <div><span>Execution controls</span><b>{rules.filter(rule => RULE_META[rule.rule_code]?.category === 'execution' && isRuleEnabled(rule)).length} active</b></div>
            <div><span>Behaviour controls</span><b>{rules.filter(rule => RULE_META[rule.rule_code]?.category === 'behaviour' && isRuleEnabled(rule)).length} active</b></div>
            <div><span>Free-play trades</span><b>Excluded</b></div>
          </div>
          <button className="discipline-secondary-button full" onClick={() => onTabChange('progress')}>View score progress</button>
        </article>

        <article className="discipline-panel discipline-streak-card">
          <CardHeader icon={Flame} title="Consistency streak" description="Consecutive compliant closed trades—not calendar days." />
          <div className="discipline-streak-value"><strong className="num">{score?.consecutive_disciplined_trades || 0}</strong><span>trades</span></div>
          <div className="discipline-streak-row"><span>Best recorded streak</span><b className="num">{progress?.best_streak || score?.consecutive_disciplined_trades || 0}</b></div>
          <div className="discipline-streak-row"><span>Violations this week</span><b className="num">{progress?.violations_this_week || 0}</b></div>
        </article>

        <article className="discipline-panel discipline-insight-card">
          <CardHeader icon={Sparkles} title="Behaviour insight" />
          {frequent ? (
            <>
              <p>Your most frequently triggered guardrail is <strong>{RULE_LABELS[frequent[0]] || frequent[0]}</strong>, recorded {frequent[1]} time{frequent[1] === 1 ? '' : 's'} in the current history.</p>
              <button className="discipline-text-button" onClick={() => onTabChange('violations')}>Review violation pattern <ArrowRight size={13} /></button>
            </>
          ) : (
            <p>No violations are recorded. Keep using the same deliberate entry process.</p>
          )}
        </article>
      </aside>
    </div>
  )
}

function RuleCard({ rule, selected, modeOff, onSelect, onToggle }) {
  const meta = RULE_META[rule.rule_code] || {}
  const enabled = isRuleEnabled(rule)
  return (
    <article className={`discipline-rule-card ${selected ? 'selected' : ''} ${modeOff ? 'bypassed' : ''}`}>
      <button className="discipline-rule-card-main" onClick={onSelect}>
        <span className={`discipline-category-mark ${meta.category}`}><Shield size={17} /></span>
        <span>
          <b>{RULE_LABELS[rule.rule_code] || rule.rule_code}</b>
          <small>{meta.purpose || 'Configured discipline guardrail.'}</small>
        </span>
        <span className={`discipline-status-badge ${enabled ? 'active' : 'disabled'}`}>
          {modeOff ? 'Bypassed' : enabled ? 'Enforced' : 'Disabled'}
        </span>
        <ChevronRight size={16} />
      </button>
      <div className="discipline-rule-card-footer">
        <span><small>Current value</small><b>{formatRuleValue(rule)}</b></span>
        <span><small>System action</small><b>{meta.effect?.split('.')[0] || 'Order validation'}</b></span>
        <button
          type="button"
          className={`discipline-mini-switch ${rule.is_active !== false ? 'on' : ''}`}
          role="switch"
          aria-checked={rule.is_active !== false}
          aria-label={`${rule.is_active !== false ? 'Disable' : 'Enable'} ${RULE_LABELS[rule.rule_code]}`}
          onClick={() => onToggle(rule, rule.is_active === false)}
        ><span /></button>
      </div>
    </article>
  )
}

export function RulesTab({ rules, modeOff, selectedRule, onSelectRule, onSaveRule }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const visible = useMemo(() => rules.filter(rule => {
    const matchesSearch = `${RULE_LABELS[rule.rule_code] || ''} ${rule.rule_code}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'all' || RULE_META[rule.rule_code]?.category === filter
    return matchesSearch && matchesFilter
  }), [rules, query, filter])

  const toggleRule = async (rule, isActive) => {
    await onSaveRule(rule.rule_code, { is_active: isActive })
  }

  return (
    <div className="discipline-rules-layout">
      <section className="discipline-rules-main">
        <div className="discipline-toolbar">
          <label className="discipline-search-field"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search rules…" /></label>
          <div className="discipline-filter-pills" role="group" aria-label="Rule category">
            {['all', ...Object.keys(CATEGORY_META)].map(key => (
              <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                {key === 'all' ? 'All rules' : CATEGORY_META[key].label}
              </button>
            ))}
          </div>
        </div>
        {Object.entries(CATEGORY_META).map(([key, category]) => {
          const categoryRules = visible.filter(rule => RULE_META[rule.rule_code]?.category === key)
          if (!categoryRules.length) return null
          return (
            <section className="discipline-rule-category" key={key}>
              <header><div><h3>{category.label}</h3><p>{category.description}</p></div><span>{categoryRules.length} rules</span></header>
              <div className="discipline-rule-list">
                {categoryRules.map(rule => (
                  <RuleCard
                    key={rule.rule_code}
                    rule={rule}
                    selected={selectedRule?.rule_code === rule.rule_code}
                    modeOff={modeOff}
                    onSelect={() => onSelectRule(rule)}
                    onToggle={toggleRule}
                  />
                ))}
              </div>
            </section>
          )
        })}
        {!visible.length && (
          <div className="discipline-empty-state"><Search size={24} /><h3>No matching rules</h3><p>Change the search or category filter.</p></div>
        )}
      </section>
      <RuleDetailPanel rule={selectedRule} modeOff={modeOff} onClose={() => onSelectRule(null)} onSave={onSaveRule} />
    </div>
  )
}

function RuleDetailPanel({ rule, modeOff, onClose, onSave }) {
  const [draft, setDraft] = useState('')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const meta = RULE_META[rule?.rule_code]
  const value = readRuleValue(rule)

  useEffect(() => {
    if (!rule || !meta) return
    setDraft(String(value[meta.valueKey] ?? (meta.valueKey === 'enabled' ? true : '')))
    setActive(rule.is_active !== false)
  }, [rule?.rule_code, rule?.updated_at])

  if (!rule || !meta) {
    return (
      <aside className="discipline-context-panel placeholder">
        <Shield size={26} />
        <h3>Select a rule</h3>
        <p>Choose a guardrail to inspect its trigger, system action, and editable value.</p>
      </aside>
    )
  }

  const save = async () => {
    const nextValue = meta.valueKey === 'enabled'
      ? draft === 'true'
      : Number(draft)
    if (meta.valueKey !== 'enabled' && (!Number.isFinite(nextValue) || nextValue < 0)) return
    setSaving(true)
    try {
      await onSave(rule.rule_code, {
        rule_value: { ...value, [meta.valueKey]: nextValue },
        is_active: active,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="discipline-context-panel open" aria-label="Rule details">
      <header>
        <div><small>{CATEGORY_META[meta.category]?.label}</small><h3>{RULE_LABELS[rule.rule_code] || rule.rule_code}</h3></div>
        <button onClick={onClose} aria-label="Close rule details"><X size={16} /></button>
      </header>
      <div className="discipline-context-scroll">
        <div className={`discipline-context-state ${active ? 'active' : 'disabled'}`}>
          {active ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
          <span><b>{modeOff ? 'Configured but bypassed' : active ? 'Rule enforced' : 'Rule disabled'}</b><small>{modeOff ? 'Discipline Mode is currently OFF.' : 'Changes apply to the next order check.'}</small></span>
        </div>
        <section><h4>Purpose</h4><p>{meta.purpose}</p></section>
        <section><h4>Trigger</h4><p>{meta.trigger}</p></section>
        <section><h4>System action</h4><p>{meta.effect}</p></section>
        <section className="discipline-rule-editor">
          <h4>Rule configuration</h4>
          <label>
            <span>Current value</span>
            {meta.valueKey === 'enabled' ? (
              <select value={draft} onChange={event => setDraft(event.target.value)}>
                <option value="true">Required</option>
                <option value="false">Optional</option>
              </select>
            ) : (
              <div className="discipline-number-input"><input type="number" min="0" step={meta.valueKey === 'loss_pct' ? '0.5' : '1'} value={draft} onChange={event => setDraft(event.target.value)} /><span>{meta.unit}</span></div>
            )}
          </label>
          <label className="discipline-setting-row compact">
            <span><b>Rule active</b><small>Exclude this rule from pre-trade validation when disabled.</small></span>
            <button className={`discipline-mini-switch ${active ? 'on' : ''}`} role="switch" aria-checked={active} onClick={() => setActive(current => !current)}><span /></button>
          </label>
        </section>
        <section><h4>Last updated</h4><p>{dateTime(rule.updated_at)}</p></section>
      </div>
      <footer><button className="discipline-primary-button full" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</button></footer>
    </aside>
  )
}

export function ViolationsTab({ violations, selectedViolation, onSelectViolation }) {
  const [period, setPeriod] = useState('month')
  const [severity, setSeverity] = useState('all')
  const [outcome, setOutcome] = useState('all')

  const filtered = useMemo(() => {
    const now = new Date()
    const days = period === 'today' ? 1 : period === 'week' ? 7 : 31
    const cutoff = new Date(now.getTime() - days * 86400000)
    return violations.filter(violation => {
      const occurred = safeDate(violation.created_at)
      const periodMatch = occurred ? occurred >= cutoff : true
      const severityMatch = severity === 'all' || severityFor(violation) === severity
      const outcomeMatch = outcome === 'all' || (outcome === 'blocked' ? violation.was_blocked : !violation.was_blocked)
      return periodMatch && severityMatch && outcomeMatch
    })
  }, [violations, period, severity, outcome])

  return (
    <div className="discipline-violations-layout">
      <section className="discipline-panel discipline-violations-main">
        <div className="discipline-toolbar">
          <div className="discipline-filter-pills">
            {[['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([key, label]) => (
              <button key={key} className={period === key ? 'active' : ''} onClick={() => setPeriod(key)}>{label}</button>
            ))}
          </div>
          <div className="discipline-select-filters">
            <select value={severity} onChange={event => setSeverity(event.target.value)} aria-label="Violation severity">
              <option value="all">All severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select value={outcome} onChange={event => setOutcome(event.target.value)} aria-label="System outcome">
              <option value="all">All outcomes</option>
              <option value="blocked">Blocked</option>
              <option value="warning">Warning</option>
            </select>
          </div>
        </div>
        <div className="discipline-table-wrap">
          <table className="discipline-violation-table">
            <thead><tr><th>Time</th><th>Rule</th><th>Severity</th><th>System action</th><th>Score impact</th><th aria-label="Open details" /></tr></thead>
            <tbody>
              {filtered.map(violation => (
                <tr key={violation.id} className={selectedViolation?.id === violation.id ? 'selected' : ''} onClick={() => onSelectViolation(violation)}>
                  <td className="num">{dateTime(violation.created_at)}</td>
                  <td><b>{RULE_LABELS[violation.rule_code] || violation.rule_code}</b><small>{violation.rule_code}</small></td>
                  <td><span className={`discipline-severity ${severityFor(violation)}`}>{severityFor(violation)}</span></td>
                  <td><span className={`discipline-status-badge ${violation.was_blocked ? 'blocked' : 'warning'}`}>{violation.was_blocked ? 'Order blocked' : 'Warning recorded'}</span></td>
                  <td><span className="discipline-score-impact">Tracked</span></td>
                  <td><ChevronRight size={15} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="discipline-empty-state"><ShieldCheck size={27} /><h3>No rule violations found</h3><p>You followed all active rules during the selected period.</p></div>
        )}
      </section>
      <ViolationDetailPanel violation={selectedViolation} onClose={() => onSelectViolation(null)} />
    </div>
  )
}

function ViolationDetailPanel({ violation, onClose }) {
  if (!violation) {
    return (
      <aside className="discipline-context-panel placeholder">
        <AlertTriangle size={26} />
        <h3>Select an event</h3>
        <p>Choose a violation to inspect the attempted order and system response.</p>
      </aside>
    )
  }
  const action = violation.attempted_action || {}
  return (
    <aside className="discipline-context-panel open">
      <header><div><small>Violation details</small><h3>{RULE_LABELS[violation.rule_code] || violation.rule_code}</h3></div><button onClick={onClose} aria-label="Close violation details"><X size={16} /></button></header>
      <div className="discipline-context-scroll">
        <div className={`discipline-context-state ${violation.was_blocked ? 'blocked' : 'warning'}`}>
          {violation.was_blocked ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
          <span><b>{violation.was_blocked ? 'Trade was blocked' : 'Warning was recorded'}</b><small>{dateTime(violation.created_at)}</small></span>
        </div>
        <section><h4>Why it triggered</h4><p>{RULE_META[violation.rule_code]?.purpose || 'The attempted order did not satisfy the configured rule.'}</p></section>
        <section><h4>System action</h4><p>{violation.was_blocked ? 'The order was rejected before any sandbox capital was committed.' : 'The event was recorded and the order flow continued.'}</p></section>
        <section>
          <h4>Attempted order</h4>
          <div className="discipline-detail-grid">
            <span>Instrument<b>{action.instrument || '—'}</b></span>
            <span>Contract<b>{action.strike_price ? `${action.strike_price} ${action.option_type || ''}` : '—'}</b></span>
            <span>Action<b>{action.action || '—'}</b></span>
            <span>Quantity<b>{action.quantity ?? '—'}</b></span>
            <span>Stop loss<b>{action.sl_price ?? 'Not provided'}</b></span>
            <span>Setup<b>{action.setup_tag || 'Not provided'}</b></span>
          </div>
        </section>
        <section><h4>Score treatment</h4><p>Violation attempts are retained in history. The current score is calculated from the rolling compliance of closed disciplined trades, so no fixed point deduction is invented here.</p></section>
      </div>
    </aside>
  )
}

function ModeComparison({ progress }) {
  const on = progress?.discipline_on || {}
  const off = progress?.discipline_off || {}
  const rows = [
    ['Closed trades', on.total_trades ?? 0, off.total_trades ?? 0],
    ['Win rate', `${on.win_rate || 0}%`, `${off.win_rate || 0}%`],
    ['Average loss', on.average_loss == null ? '—' : money(on.average_loss), off.average_loss == null ? '—' : money(off.average_loss)],
    ['Total P&L', money(on.total_pnl), money(off.total_pnl)],
    ['Compliance rate', on.compliance_rate == null ? '—' : `${on.compliance_rate}%`, 'Not scored'],
  ]
  return (
    <div className="discipline-comparison-table">
      <div className="head"><span>Metric</span><b><ShieldCheck size={14} /> Discipline ON</b><b><ShieldAlert size={14} /> Free play</b></div>
      {rows.map(row => <div key={row[0]}><span>{row[0]}</span><strong className="num">{row[1]}</strong><strong className="num">{row[2]}</strong></div>)}
    </div>
  )
}

export function ProgressTab({ score, progress }) {
  const history = progress?.score_history || []
  const chartData = history.map(point => ({
    date: new Date(point.score_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    score: Number(point.score),
  }))
  const tier = progress?.tier_progress
  return (
    <div className="discipline-progress-layout">
      <section className="discipline-progress-main">
        <article className="discipline-panel discipline-chart-card">
          <CardHeader icon={TrendingUp} title="Discipline score trend" description="Daily score snapshots are recorded after disciplined trades close." />
          {chartData.length ? (
            <div className="discipline-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 12, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 11 }} />
                  <Line type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--primary)' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="discipline-empty-state compact"><BarChart3 size={25} /><h3>Progress data will appear after your next disciplined session</h3><p>Your current score is {Math.round(Number(score?.score || 0))}/100.</p></div>
          )}
        </article>
        <article className="discipline-panel">
          <CardHeader icon={BarChart3} title="Discipline ON versus OFF" description="Calculated only from your real closed virtual orders." />
          <ModeComparison progress={progress} />
        </article>
      </section>
      <aside className="discipline-progress-side">
        <article className="discipline-panel">
          <CardHeader icon={Flame} title="Streak health" />
          <div className="discipline-progress-stat-grid">
            <div><span>Current streak</span><strong className="num">{score?.consecutive_disciplined_trades || 0}</strong><small>closed trades</small></div>
            <div><span>Best streak</span><strong className="num">{progress?.best_streak || 0}</strong><small>closed trades</small></div>
            <div><span>Sessions tracked</span><strong className="num">{progress?.sessions_tracked || 0}</strong><small>score snapshots</small></div>
            <div><span>Clean sessions</span><strong className="num">{progress?.disciplined_sessions || 0}</strong><small>no violations</small></div>
          </div>
        </article>
        <article className="discipline-panel">
          <CardHeader icon={CircleDollarSign} title="Capital unlock progress" />
          <div className="discipline-tier-large"><span>{tierLabel(tier?.current_tier)}</span><ArrowRight size={16} /><b>{tier?.next_tier ? tierLabel(tier.next_tier) : 'Maximum'}</b></div>
          <ProgressBar value={tier?.progress_pct || 0} />
          <p className="discipline-muted-copy">{tier?.next_tier ? `${tier.streak_remaining} consecutive disciplined trades remain.` : 'Maximum configured tier reached.'}</p>
        </article>
        <article className="discipline-panel discipline-insight-card">
          <CardHeader icon={Sparkles} title="Progress insight" />
          <p>{Number(progress?.discipline_on?.total_trades || 0) > 0
            ? `Your disciplined sample contains ${progress.discipline_on.total_trades} closed trades with a ${progress.discipline_on.win_rate}% win rate.`
            : 'Close disciplined trades to build a meaningful comparison with free-play performance.'}</p>
        </article>
      </aside>
    </div>
  )
}

export function SettingsTab({ rules, notifications, onNotificationsChange, onRequestPreset }) {
  return (
    <div className="discipline-settings-layout">
      <section className="discipline-settings-main">
        <article className="discipline-panel">
          <CardHeader icon={SlidersHorizontal} title="Discipline presets" description="Apply a complete rule template, then fine-tune individual rules." />
          <div className="discipline-preset-grid">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button key={key} onClick={() => onRequestPreset(key)} className="discipline-preset-card">
                <span className="discipline-preset-icon">{key === 'beginner' ? <Shield size={20} /> : key === 'intermediate' ? <Target size={20} /> : <TrendingUp size={20} />}</span>
                <span><b>{preset.name}</b><small>{preset.description}</small></span>
                <span>Review preset <ArrowRight size={13} /></span>
              </button>
            ))}
          </div>
        </article>
        <article className="discipline-panel">
          <CardHeader icon={Bell} title="Notifications and warnings" description="Stored on this device until server-side notification preferences are available." />
          <div className="discipline-settings-list">
            {[
              ['remainingTrade', 'Trade limit warning', 'Notify when only one trade remains in the session.'],
              ['riskUsage', 'Daily loss usage', 'Warn when 80% of the daily loss cap is used.'],
              ['cooldown', 'Cooldown countdown', 'Show when a revenge-trade cooldown is active.'],
              ['scoreDrop', 'Score health', 'Notify when the discipline score drops below 70.'],
              ['blockedTrade', 'Blocked order', 'Explain immediately which rule stopped an order.'],
              ['streakMilestone', 'Streak milestone', 'Celebrate meaningful disciplined-trade streaks.'],
              ['tierProgress', 'Tier progress', 'Notify when the next capital tier is close.'],
            ].map(([key, title, description]) => (
              <label className="discipline-setting-row" key={key}>
                <span><b>{title}</b><small>{description}</small></span>
                <button className={`discipline-mini-switch ${notifications[key] ? 'on' : ''}`} role="switch" aria-checked={notifications[key]} onClick={() => onNotificationsChange({ ...notifications, [key]: !notifications[key] })}><span /></button>
              </label>
            ))}
          </div>
        </article>
      </section>
      <aside className="discipline-settings-side">
        <article className="discipline-panel discipline-freeplay-card">
          <CardHeader icon={ShieldAlert} title="Free-play behaviour" />
          <ul>
            <li><CheckCircle2 size={15} /> All active rules are bypassed.</li>
            <li><CheckCircle2 size={15} /> Full sandbox capital may be unlocked.</li>
            <li><CheckCircle2 size={15} /> Trades are marked as free-play.</li>
            <li><CheckCircle2 size={15} /> Score and streak are not improved.</li>
            <li><CheckCircle2 size={15} /> Existing progress is not reset.</li>
          </ul>
        </article>
        <article className="discipline-panel">
          <CardHeader icon={Info} title="Current configuration" />
          <div className="discipline-config-count"><strong className="num">{rules.filter(isRuleEnabled).length}</strong><span>of {rules.length} rules enforced</span></div>
          <button className="discipline-secondary-button full" onClick={() => onRequestPreset('beginner')}>Reset to safe defaults</button>
        </article>
      </aside>
    </div>
  )
}

export function ModeOffDialog({ open, busy, onCancel, onConfirm }) {
  const [phrase, setPhrase] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) {
      setPhrase('')
      setReason('')
    }
  }, [open])
  if (!open) return null
  return (
    <div className="discipline-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
      <section className="discipline-modal" role="dialog" aria-modal="true" aria-labelledby="discipline-off-title">
        <header><span className="danger"><ShieldAlert size={20} /></span><div><h2 id="discipline-off-title">Turn Discipline Mode OFF?</h2><p>This starts free-play and disables every trading guardrail.</p></div><button onClick={onCancel} aria-label="Close"><X size={17} /></button></header>
        <div className="discipline-modal-body">
          <div className="discipline-modal-warning"><AlertTriangle size={17} /><span><b>Your full sandbox capital can be unlocked.</b><small>Free-play trades do not improve score, streak, or tier progress.</small></span></div>
          <h3>The following protections will be disabled</h3>
          <div className="discipline-protection-list">
            {['Daily loss limits', 'Maximum trade limits', 'Mandatory stop loss', 'Setup requirements', 'Revenge-trade cooldown', 'Direction-flip protection', 'No-averaging-down protection'].map(item => <span key={item}><X size={12} />{item}</span>)}
          </div>
          <label><span>Reason for free play <small>(optional)</small></span><textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Why are you disabling protection?" rows={2} /></label>
          <label><span>Type <b>FREE PLAY</b> to confirm</span><input autoFocus value={phrase} onChange={event => setPhrase(event.target.value)} placeholder="FREE PLAY" /></label>
        </div>
        <footer><button className="discipline-secondary-button" onClick={onCancel}>Cancel</button><button className="discipline-danger-button" disabled={phrase.trim().toUpperCase() !== 'FREE PLAY' || busy} onClick={() => onConfirm(reason)}>{busy ? 'Turning off…' : 'Turn off Discipline Mode'}</button></footer>
      </section>
    </div>
  )
}

export function PresetDialog({ presetKey, rules, busy, onCancel, onApply }) {
  if (!presetKey || !PRESETS[presetKey]) return null
  const preset = PRESETS[presetKey]
  const changes = Object.entries(preset.rules).map(([code, next]) => {
    const rule = rules.find(item => item.rule_code === code)
    const meta = RULE_META[code]
    const previous = readRuleValue(rule)[meta.valueKey]
    return {
      code,
      label: RULE_LABELS[code] || code,
      previous: meta.valueKey === 'enabled' ? (previous === false ? 'Optional' : 'Required') : `${previous ?? '—'} ${meta.unit}`,
      next: meta.valueKey === 'enabled' ? (next[meta.valueKey] === false ? 'Optional' : 'Required') : `${next[meta.valueKey]} ${meta.unit}`,
    }
  })
  return (
    <div className="discipline-modal-backdrop">
      <section className="discipline-modal preset" role="dialog" aria-modal="true" aria-labelledby="preset-title">
        <header><span><SlidersHorizontal size={20} /></span><div><h2 id="preset-title">Apply {preset.name} preset?</h2><p>{preset.description}</p></div><button onClick={onCancel} aria-label="Close"><X size={17} /></button></header>
        <div className="discipline-modal-body">
          <div className="discipline-preset-changes">
            {changes.map(change => <div key={change.code}><span>{change.label}</span><small>{change.previous}</small><ArrowRight size={13} /><b>{change.next}</b></div>)}
          </div>
          <p className="discipline-modal-note"><Info size={14} /> All seven values are saved to your discipline profile and apply to the next order validation.</p>
        </div>
        <footer><button className="discipline-secondary-button" onClick={onCancel}>Cancel</button><button className="discipline-primary-button" onClick={() => onApply(presetKey)} disabled={busy}>{busy ? 'Applying…' : 'Apply preset'}</button></footer>
      </section>
    </div>
  )
}

export { DEFAULT_NOTIFICATIONS, PRESETS, money }

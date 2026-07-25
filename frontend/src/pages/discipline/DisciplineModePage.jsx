import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  BellRing,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleHelp,
  Flame,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Wallet,
} from 'lucide-react'
import useDiscipline from '../../hooks/useDiscipline'
import { useToast } from '../../components/common/Toast'
import {
  DEFAULT_NOTIFICATIONS,
  ModeOffDialog,
  OverviewTab,
  PRESETS,
  PresetDialog,
  ProgressTab,
  RulesTab,
  SettingsTab,
  ViolationsTab,
  money,
} from '../../features/discipline-mode/DisciplineSections'
import {
  RULE_META,
  isRuleEnabled,
  tierLabel,
} from '../../features/discipline-mode/disciplineConfig'
import './DisciplineModePage.css'

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'rules', label: 'Rules', icon: SlidersHorizontal },
  { key: 'violations', label: 'Violations', icon: ShieldAlert },
  { key: 'progress', label: 'Progress', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
]

const NOTIFICATION_KEY = 'sf_discipline_notifications'

const readNotifications = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTIFICATION_KEY))
    return { ...DEFAULT_NOTIFICATIONS, ...(saved || {}) }
  } catch {
    return DEFAULT_NOTIFICATIONS
  }
}

const todayCount = violations => {
  const today = new Date().toDateString()
  return violations.filter(item => new Date(item.created_at).toDateString() === today).length
}

function Metric({ icon: Icon, label, value, helper, tone = '' }) {
  return (
    <article className={`discipline-metric ${tone}`}>
      <span><Icon size={16} /></span>
      <div><small>{label}</small><strong className="num">{value}</strong><p>{helper}</p></div>
    </article>
  )
}

export default function DisciplineModePage() {
  const {
    rules,
    score,
    violations,
    mode,
    progress,
    loading,
    error,
    loadAll,
    updateRule,
    applyRuleChanges,
    toggleMode,
  } = useDiscipline()
  const toast = useToast()
  const [tab, setTab] = useState('overview')
  const [selectedRule, setSelectedRule] = useState(null)
  const [selectedViolation, setSelectedViolation] = useState(null)
  const [showModeDialog, setShowModeDialog] = useState(false)
  const [presetKey, setPresetKey] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [notifications, setNotifications] = useState(readNotifications)

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (!selectedRule) return
    const fresh = rules.find(rule => rule.rule_code === selectedRule.rule_code)
    if (fresh) setSelectedRule(fresh)
  }, [rules])

  const enabled = mode?.enabled !== false
  const activeRules = useMemo(() => rules.filter(isRuleEnabled), [rules])
  const violationsToday = todayCount(violations)
  const blockedToday = violations.filter(item => (
    item.was_blocked && new Date(item.created_at).toDateString() === new Date().toDateString()
  )).length
  const scoreValue = Math.round(Number(score?.score || 0))

  const changeTab = next => {
    setTab(next)
    if (next !== 'rules') setSelectedRule(null)
    if (next !== 'violations') setSelectedViolation(null)
  }

  const saveRule = async (code, changes) => {
    try {
      await updateRule(code, changes)
      toast.success('Rule saved')
    } catch {
      toast.error('Could not save this rule')
      throw new Error('Rule save failed')
    }
  }

  const turnOn = async () => {
    setActionBusy(true)
    try {
      await toggleMode(true)
      toast.success('Discipline Mode is ON')
    } catch {
      toast.error('Could not enable Discipline Mode')
    } finally {
      setActionBusy(false)
    }
  }

  const turnOff = async () => {
    setActionBusy(true)
    try {
      await toggleMode(false)
      setShowModeDialog(false)
      toast.success('Free-play mode is active')
    } catch {
      toast.error('Could not disable Discipline Mode')
    } finally {
      setActionBusy(false)
    }
  }

  const applyPreset = async key => {
    const preset = PRESETS[key]
    if (!preset) return
    setActionBusy(true)
    try {
      const changes = Object.entries(preset.rules).map(([ruleCode, ruleValue]) => ({
        ruleCode,
        rule_value: ruleValue,
        is_active: true,
      }))
      await applyRuleChanges(changes)
      setPresetKey(null)
      toast.success(`${preset.name} preset applied`)
    } catch {
      toast.error('Could not apply this preset')
    } finally {
      setActionBusy(false)
    }
  }

  const saveNotifications = next => {
    setNotifications(next)
    localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(next))
  }

  if (loading && !mode) {
    return (
      <div className="discipline-control-center discipline-loading">
        <Loader2 size={27} className="spin" />
        <h2>Loading Discipline Control Center</h2>
        <p>Checking capital, rules, score, and violation history…</p>
      </div>
    )
  }

  return (
    <div className="discipline-control-center">
      <header className="discipline-page-header">
        <div className="discipline-page-heading">
          <span><ShieldCheck size={22} /></span>
          <div>
            <div className="discipline-eyebrow">Trading safety system</div>
            <h1>Discipline Control Center</h1>
            <p>Trading guardrails that protect your capital, enforce your rules, and improve behavioural consistency.</p>
          </div>
        </div>
        <div className="discipline-header-actions">
          <button className="discipline-icon-button" onClick={() => setShowHelp(value => !value)} aria-label="Explain Discipline Mode" title="How Discipline Mode works"><CircleHelp size={17} /></button>
          <button className="discipline-secondary-button" onClick={() => changeTab('settings')}><Settings size={15} /> Settings</button>
          <button className="discipline-secondary-button" onClick={loadAll} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>
        </div>
      </header>

      {showHelp && (
        <section className="discipline-help-banner">
          <BookOpenCheck size={19} />
          <div><b>How it works</b><p>Every order is checked against your active rules before sandbox capital is committed. Closed disciplined trades update the rolling score and streak; free-play trades remain visible but are excluded from progress.</p></div>
          <button onClick={() => setShowHelp(false)} aria-label="Dismiss explanation">Dismiss</button>
        </section>
      )}

      {error && <div className="discipline-load-warning"><AlertCircle size={16} />{error}<button onClick={loadAll}>Retry</button></div>}

      <section className={`discipline-status-hero ${enabled ? 'on' : 'off'}`}>
        <div className="discipline-status-copy">
          <span className="discipline-status-symbol">{enabled ? <ShieldCheck size={27} /> : <ShieldAlert size={27} />}</span>
          <div>
            <div className="discipline-status-title-row">
              <h2>Discipline Mode: {enabled ? 'ON' : 'OFF'}</h2>
              <span className={`discipline-live-pill ${enabled ? 'protected' : 'freeplay'}`}>{enabled ? 'Protected' : 'Free play'}</span>
            </div>
            <p>{enabled
              ? 'Your trading rules are actively protecting your sandbox capital.'
              : 'Rules are bypassed and full sandbox capital access is available.'}</p>
            <div className="discipline-protection-grid">
              {(enabled ? [
                'Daily risk and trade limits enforced',
                'Stop loss and setup checks active',
                'Behavioural cooldowns active',
                'Closed trades update score and streak',
              ] : [
                'All seven guardrails are bypassed',
                'Trades are marked as free-play',
                'Score and streak do not improve',
                'Existing progress remains preserved',
              ]).map(item => <span key={item}>{enabled ? <Check size={13} /> : <AlertCircle size={13} />}{item}</span>)}
            </div>
          </div>
        </div>
        <div className="discipline-status-actions">
          <div className="discipline-master-control">
            <span><small>Master protection</small><b>{enabled ? 'Enabled' : 'Disabled'}</b></span>
            <button
              className={`discipline-master-switch ${enabled ? 'on' : ''}`}
              role="switch"
              aria-checked={enabled}
              aria-label={`${enabled ? 'Disable' : 'Enable'} Discipline Mode`}
              onClick={() => enabled ? setShowModeDialog(true) : turnOn()}
              disabled={actionBusy}
            ><span /></button>
          </div>
          <div>
            {enabled ? (
              <button className="discipline-secondary-button" onClick={() => setShowModeDialog(true)}>Pause protection</button>
            ) : (
              <button className="discipline-primary-button" onClick={turnOn} disabled={actionBusy}>Turn Discipline Mode ON</button>
            )}
            <button className="discipline-text-button" onClick={() => changeTab(enabled ? 'rules' : 'settings')}>{enabled ? 'View active rules' : 'Review what changes'} <ChevronRight size={13} /></button>
          </div>
        </div>
      </section>

      <section className="discipline-metric-strip">
        <Metric icon={enabled ? ShieldCheck : ShieldAlert} label="Status" value={enabled ? 'ON' : 'OFF'} helper={enabled ? `${activeRules.length} enforced rules` : 'Rules bypassed'} tone={enabled ? 'gain' : 'warn'} />
        <Metric icon={Target} label="Discipline score" value={`${scoreValue}%`} helper="Last 20 disciplined trades" tone={scoreValue >= 75 ? 'gain' : 'warn'} />
        <Metric icon={Flame} label="Current streak" value={`${score?.consecutive_disciplined_trades || 0}`} helper="Consecutive compliant trades" />
        <Metric icon={Shield} label="Current tier" value={tierLabel(mode?.tier)} helper={`${score?.trades_to_next_tier || 0} trades to next tier`} />
        <Metric icon={Wallet} label="Available capital" value={money(mode?.balance)} helper={mode?.capital_unlocked ? 'Full capital unlocked' : 'Current sandbox balance'} />
        <Metric icon={ShieldAlert} label="Violations today" value={violationsToday} helper={`${blockedToday} orders blocked`} tone={violationsToday ? 'loss' : ''} />
      </section>

      <nav className="discipline-tabs" aria-label="Discipline Control Center sections">
        {TABS.map(item => {
          const Icon = item.icon
          return (
            <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => changeTab(item.key)} aria-current={tab === item.key ? 'page' : undefined}>
              <Icon size={15} /> {item.label}
              {item.key === 'rules' && <span>{activeRules.length}</span>}
              {item.key === 'violations' && violationsToday > 0 && <span className="alert">{violationsToday}</span>}
            </button>
          )
        })}
      </nav>

      <main className="discipline-tab-content">
        {tab === 'overview' && (
          <OverviewTab
            mode={mode}
            score={score}
            rules={rules}
            violations={violations}
            progress={progress}
            onTabChange={changeTab}
            onSelectRule={rule => { setSelectedRule(rule); setTab('rules') }}
          />
        )}
        {tab === 'rules' && (
          <RulesTab
            rules={rules}
            modeOff={!enabled}
            selectedRule={selectedRule}
            onSelectRule={setSelectedRule}
            onSaveRule={saveRule}
          />
        )}
        {tab === 'violations' && (
          <ViolationsTab
            violations={violations}
            selectedViolation={selectedViolation}
            onSelectViolation={setSelectedViolation}
          />
        )}
        {tab === 'progress' && <ProgressTab score={score} progress={progress} />}
        {tab === 'settings' && (
          <SettingsTab
            rules={rules}
            notifications={notifications}
            onNotificationsChange={saveNotifications}
            onRequestPreset={setPresetKey}
          />
        )}
      </main>

      <ModeOffDialog open={showModeDialog} busy={actionBusy} onCancel={() => setShowModeDialog(false)} onConfirm={turnOff} />
      <PresetDialog presetKey={presetKey} rules={rules} busy={actionBusy} onCancel={() => setPresetKey(null)} onApply={applyPreset} />
    </div>
  )
}

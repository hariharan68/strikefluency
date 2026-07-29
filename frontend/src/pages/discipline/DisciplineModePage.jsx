import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import useDiscipline from '../../hooks/useDiscipline'
import useTradingStore from '../../store/tradingStore'
import { useToast } from '../../components/common/Toast'
import {
  DEFAULT_NOTIFICATIONS,
  ModeOffDialog,
  PRESETS,
  PresetDialog,
  ProgressTab,
  RulesTab,
  SettingsTab,
  TodayTab,
  ViolationsTab,
} from '../../features/discipline-mode/DisciplineSections'
import { isRuleEnabled } from '../../features/discipline-mode/disciplineConfig'
import './DisciplineModePage.css'

const TABS = [
  { key: 'today', label: 'Today', icon: LayoutDashboard },
  { key: 'rules', label: 'Rules', icon: SlidersHorizontal },
  { key: 'violations', label: 'Violations', icon: ShieldAlert },
  { key: 'progress', label: 'Progress', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
]

const VALID_TABS = new Set(TABS.map(tab => tab.key))
const NOTIFICATION_KEY = 'sf_discipline_notifications'

const readNotifications = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTIFICATION_KEY))
    return { ...DEFAULT_NOTIFICATIONS, ...(saved || {}) }
  } catch {
    return DEFAULT_NOTIFICATIONS
  }
}

const todayViolations = violations => {
  const today = new Date().toDateString()
  return violations.filter(item => new Date(item.created_at).toDateString() === today)
}

const timeLabel = value => value?.toLocaleTimeString('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
}) || 'Not refreshed'

export default function DisciplineModePage() {
  const {
    rules,
    score,
    violations,
    mode,
    progress,
    accountSummary,
    loading,
    refreshing,
    error,
    lastUpdated,
    loadAll,
    updateRule,
    applyRuleChanges,
    toggleMode,
  } = useDiscipline()
  const eventSeq = useTradingStore(state => state.eventSeq)
  const seenEventSeq = useRef(eventSeq)
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedRule, setSelectedRule] = useState(null)
  const [selectedViolation, setSelectedViolation] = useState(null)
  const [showModeDialog, setShowModeDialog] = useState(false)
  const [presetKey, setPresetKey] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [notifications, setNotifications] = useState(readNotifications)

  const requestedTab = searchParams.get('tab') || 'today'
  const tab = VALID_TABS.has(requestedTab) ? requestedTab : 'today'

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    if (seenEventSeq.current === eventSeq) return undefined
    seenEventSeq.current = eventSeq
    const timer = setTimeout(() => loadAll(), 250)
    return () => clearTimeout(timer)
  }, [eventSeq])

  useEffect(() => {
    if (!selectedRule) return
    const fresh = rules.find(rule => rule.rule_code === selectedRule.rule_code)
    if (fresh) setSelectedRule(fresh)
  }, [rules])

  useEffect(() => {
    if (VALID_TABS.has(requestedTab)) return
    const next = new URLSearchParams(searchParams)
    next.delete('tab')
    setSearchParams(next, { replace: true })
  }, [requestedTab])

  const enabled = mode?.enabled
    ?? accountSummary?.account?.discipline_mode_enabled
    ?? true
  const activeRules = useMemo(() => rules.filter(isRuleEnabled), [rules])
  const violationsToday = todayViolations(violations)
  const blockedToday = violationsToday.filter(item => item.was_blocked).length

  const changeTab = nextTab => {
    const next = new URLSearchParams(searchParams)
    if (nextTab === 'today') next.delete('tab')
    else next.set('tab', nextTab)
    setSearchParams(next)
    if (nextTab !== 'rules') setSelectedRule(null)
    if (nextTab !== 'violations') setSelectedViolation(null)
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
      await loadAll()
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
      await loadAll()
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

  if (loading && !mode && !accountSummary) {
    return (
      <div className="discipline-control-center discipline-loading" aria-live="polite">
        <div className="discipline-loading-mark"><Loader2 size={25} className="spin" /></div>
        <h2>Loading your protection settings</h2>
        <p>Checking today’s limits, active rules, and progress.</p>
        <div className="discipline-loading-grid" aria-hidden="true">
          <span /><span /><span />
        </div>
      </div>
    )
  }

  return (
    <div className="discipline-control-center">
      {error && (
        <div className="discipline-load-warning" role="status">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={loadAll}>Retry</button>
        </div>
      )}

      <section className={`discipline-command-bar ${enabled ? 'on' : 'off'}`} aria-label="Discipline protection status">
        <div className="discipline-command-status">
          <span className="discipline-command-icon">
            {enabled ? <ShieldCheck size={23} /> : <ShieldAlert size={23} />}
          </span>
          <div>
            <div className="discipline-command-title">
              <h2>{enabled ? 'Protection is active' : 'Free play is active'}</h2>
              <span>{enabled ? 'Protected' : 'Rules bypassed'}</span>
            </div>
            <p>
              {enabled
                ? `${activeRules.length} guardrails are checking every new paper trade.`
                : 'Orders can bypass every configured guardrail and will not improve your score.'}
            </p>
          </div>
        </div>

        <div className="discipline-command-actions">
          <div className="discipline-command-meta">
            <span>{activeRules.length}/{rules.length || 7} rules effective</span>
            <small>Updated {timeLabel(lastUpdated)}</small>
          </div>
          <button
            className="discipline-icon-button"
            onClick={() => setShowHelp(current => !current)}
            aria-label="Explain Discipline Mode"
            aria-expanded={showHelp}
            title="How Discipline Mode works"
          >
            <CircleHelp size={17} />
          </button>
          <button
            className="discipline-icon-button"
            onClick={loadAll}
            disabled={refreshing || loading}
            aria-label="Refresh discipline data"
            title="Refresh"
          >
            <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
          </button>
          <div className="discipline-master-control">
            <span><small>Master protection</small><b>{enabled ? 'On' : 'Off'}</b></span>
            <button
              className={`discipline-master-switch ${enabled ? 'on' : ''}`}
              role="switch"
              aria-checked={enabled}
              aria-label={`${enabled ? 'Disable' : 'Enable'} Discipline Mode`}
              onClick={() => enabled ? setShowModeDialog(true) : turnOn()}
              disabled={actionBusy}
            >
              <span />
            </button>
          </div>
        </div>
      </section>

      {showHelp && (
        <section className="discipline-help-banner">
          <BookOpenCheck size={19} />
          <div>
            <b>How protection works</b>
            <p>Every order is checked before sandbox capital is committed. Closed disciplined trades update your rolling score and streak; free-play trades remain visible but are excluded from progress.</p>
          </div>
          <button onClick={() => setShowHelp(false)}>Dismiss</button>
        </section>
      )}

      {!enabled && (
        <section className="discipline-freeplay-notice" role="status">
          <ShieldAlert size={18} />
          <div>
            <b>Your safety rules are not gating orders</b>
            <span>Progress is preserved, but new free-play trades do not improve your discipline score or streak.</span>
          </div>
          <button className="discipline-primary-button" onClick={turnOn} disabled={actionBusy}>
            <CheckCircle2 size={15} /> Restore protection
          </button>
        </section>
      )}

      <nav className="discipline-tabs" aria-label="Discipline Mode sections">
        {TABS.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              className={tab === item.key ? 'active' : ''}
              onClick={() => changeTab(item.key)}
              aria-current={tab === item.key ? 'page' : undefined}
            >
              <Icon size={15} />
              <span>{item.label}</span>
              {item.key === 'rules' && <em>{activeRules.length}</em>}
              {item.key === 'violations' && violationsToday.length > 0 && (
                <em className="alert">{violationsToday.length}</em>
              )}
            </button>
          )
        })}
      </nav>

      <main className="discipline-tab-content">
        {tab === 'today' && (
          <TodayTab
            mode={mode}
            score={score}
            rules={rules}
            violations={violations}
            progress={progress}
            accountSummary={accountSummary}
            onTabChange={changeTab}
            onSelectRule={rule => {
              setSelectedRule(rule)
              changeTab('rules')
            }}
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

      <ModeOffDialog
        open={showModeDialog}
        busy={actionBusy}
        onCancel={() => setShowModeDialog(false)}
        onConfirm={turnOff}
      />
      <PresetDialog
        presetKey={presetKey}
        rules={rules}
        busy={actionBusy}
        onCancel={() => setPresetKey(null)}
        onApply={applyPreset}
      />
    </div>
  )
}

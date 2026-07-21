import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import usePreferencesStore from '../../store/preferencesStore'
import { useToast } from '../../components/common/Toast'
import { clearFyersToken, getFyersProfile, getFyersStatus, revokeFyersCredentials } from '../../api/broker'
import FyersSetupWizard from '../../components/broker/FyersSetupWizard'
import DisciplineModeToggle from '../../components/discipline/DisciplineModeToggle'
import { getSessions, logout, logoutAll, revokeSession, updateProfile } from '../../api/auth'
import { User, Bell, Shield, ShieldCheck, Globe, LogOut, ChevronRight, Link as LinkIcon, RefreshCw, Unplug, Trash2 } from 'lucide-react'

const Card = ({ children, style = {} }) => (
  <div style={{
    background: 'var(--color-surface)', border: '1px solid var(--border)',
    borderRadius: 14, boxShadow: 'var(--shadow)',
    overflow: 'hidden', ...style
  }}>
    {children}
  </div>
)

const SectionHeader = ({ icon: Icon, title, subtitle }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', borderBottom: '1px solid var(--border)', background: 'var(--color-surface2)' }}>
    {Icon && (
      <span style={{ display: 'grid', placeItems: 'center', height: 36, width: 36, flexShrink: 0, borderRadius: 11, background: 'var(--primary-bg)', color: 'var(--primary)' }}>
        <Icon size={18} />
      </span>
    )}
    <div>
      <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700 }}>{title}</div>
      {subtitle && <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 2 }}>{subtitle}</div>}
    </div>
  </div>
)

const SettingRow = ({ label, description, children, noBorder }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: noBorder ? 'none' : '1px solid var(--color-surface2)'
  }}>
    <div style={{ flex: 1, paddingRight: 24 }}>
      <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{label}</div>
      {description && <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{description}</div>}
    </div>
    <div style={{ flexShrink: 0 }}>{children}</div>
  </div>
)

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: value ? 'var(--primary)' : 'var(--border)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: 'var(--color-surface)',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </button>
  )
}

function ProfileSection({ user }) {
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email] = useState(user?.email || '')
  const [saving, setSaving] = useState(false)
  const { success, error } = useToast()
  const setUser = useAuthStore(s => s.setUser)

  const save = async () => {
    const name = fullName.trim()
    if (!name) { error('Full name cannot be empty'); return }
    setSaving(true)
    try {
      const r = await updateProfile(name)
      setUser(r.data)          // refresh name app-wide (sidebar/topbar)
      success('Profile updated')
    } catch (err) {
      error(err.response?.data?.detail || 'Could not update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionHeader icon={User} title="Profile" subtitle="Your personal information" />
      <div style={{ padding: 20 }}>
        {/* Identity banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
          padding: '18px 20px', borderRadius: 14, border: '1px solid var(--primary-border)',
          background: 'radial-gradient(120% 180% at 0% 0%, rgba(var(--primary-glow-rgb),0.12) 0%, var(--color-surface2) 60%)',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 8px 20px -8px rgba(var(--primary-glow-rgb),0.7)'
          }}>
            <span style={{ color: 'var(--on-primary)', fontSize: 22, fontWeight: 800 }}>{(user?.full_name || user?.email || 'T').charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>{user?.full_name || 'Trader'}</div>
            <div style={{ color: 'var(--text-sub)', fontSize: 12.5, marginTop: 2 }}>{user?.email}</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', padding: '3px 11px', borderRadius: 999, background: 'var(--primary)', color: 'var(--on-primary)' }}>
                {user?.tier || 'BRONZE'} TIER
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="sf-label">Full Name</label>
            <input className="sf-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="sf-label">Email Address</label>
            <input className="sf-input" value={email} readOnly style={{ background: 'var(--color-surface2)', color: 'var(--text-muted)', cursor: 'not-allowed' }} />
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={saving} className="sf-btn-primary" style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Card>
  )
}

function TradingPreferences() {
  const stored = usePreferencesStore(s => s.prefs)
  const savePrefs = usePreferencesStore(s => s.save)
  const { success, error } = useToast()
  const [prefs, setPrefs] = useState(stored)
  const [saving, setSaving] = useState(false)
  // Re-sync when the store finishes loading from the backend.
  useEffect(() => { setPrefs(stored) }, [stored])
  const set = (key, val) => setPrefs(p => ({ ...p, [key]: val }))

  const save = async () => {
    setSaving(true)
    try {
      await savePrefs({
        default_instrument: prefs.default_instrument,
        default_lots: prefs.default_lots,
        confirm_close: prefs.confirm_close,
        show_risk_warnings: prefs.show_risk_warnings,
        auto_fill_ltp: prefs.auto_fill_ltp,
        leverage_enabled: prefs.leverage_enabled,
      })
      success('Trading preferences saved')
    } catch {
      error('Could not save preferences')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionHeader icon={Globe} title="Trading Preferences" subtitle="Defaults for your trading desk" />

      <SettingRow label="Default Instrument" description="Pre-selected instrument on Trading Desk">
        <select className="sf-input" style={{ width: 130, height: 34 }} value={prefs.default_instrument} onChange={e => set('default_instrument', e.target.value)}>
          {['NIFTY', 'BANKNIFTY', 'SENSEX'].map(i => <option key={i}>{i}</option>)}
        </select>
      </SettingRow>

      <SettingRow label="Default Lots" description="Number of lots pre-filled in order form">
        <input className="sf-input" type="number" min={1} max={50} style={{ width: 80, height: 34, textAlign: 'center' }} value={prefs.default_lots} onChange={e => set('default_lots', Math.max(1, parseInt(e.target.value) || 1))} />
      </SettingRow>

      <SettingRow label="Confirm Before Closing" description="Show confirmation dialog when closing positions">
        <Toggle value={prefs.confirm_close} onChange={v => set('confirm_close', v)} />
      </SettingRow>

      <SettingRow label="Show Risk Warnings" description="Display SL validation warnings in order form">
        <Toggle value={prefs.show_risk_warnings} onChange={v => set('show_risk_warnings', v)} />
      </SettingRow>

      <SettingRow label="Auto-fill LTP from Chain" description="Prefill LTP when clicking option chain cells">
        <Toggle value={prefs.auto_fill_ltp} onChange={v => set('auto_fill_ltp', v)} />
      </SettingRow>

      <SettingRow
        label="Trading Margin — Leverage"
        description={prefs.leverage_enabled === false
          ? 'OFF · orders block the full contract value from your sandbox funds (1x)'
          : 'ON · orders block only the leveraged margin (5x), freeing up sandbox funds'}
        noBorder
      >
        <Toggle value={prefs.leverage_enabled !== false} onChange={v => set('leverage_enabled', v)} />
      </SettingRow>

      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={save} disabled={saving} className="sf-btn-primary" style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
      </div>
    </Card>
  )
}

function NotificationSettings() {
  const stored = usePreferencesStore(s => s.prefs)
  const savePrefs = usePreferencesStore(s => s.save)
  const { success, error } = useToast()
  const [notifs, setNotifs] = useState(stored)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setNotifs(stored) }, [stored])
  const set = (key, val) => setNotifs(p => ({ ...p, [key]: val }))

  const save = async () => {
    setSaving(true)
    try {
      await savePrefs({
        notify_discipline: notifs.notify_discipline,
        notify_cooldown: notifs.notify_cooldown,
        notify_daily_loss: notifs.notify_daily_loss,
        notify_trade_confirm: notifs.notify_trade_confirm,
      })
      success('Notification settings saved')
    } catch {
      error('Could not save notification settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionHeader icon={Bell} title="Notifications" subtitle="Control in-app alerts and toasts" />
      <SettingRow label="Discipline Rule Violations" description="Alert when an order is blocked by a discipline rule">
        <Toggle value={notifs.notify_discipline} onChange={v => set('notify_discipline', v)} />
      </SettingRow>
      <SettingRow label="Revenge Cooldown Active" description="Remind you when you're in cooldown period">
        <Toggle value={notifs.notify_cooldown} onChange={v => set('notify_cooldown', v)} />
      </SettingRow>
      <SettingRow label="Daily Loss Limit Approaching" description="Warn when you're 80% of max daily loss">
        <Toggle value={notifs.notify_daily_loss} onChange={v => set('notify_daily_loss', v)} />
      </SettingRow>
      <SettingRow label="Trade Confirmation Toast" description="Show toast on every successful order" noBorder>
        <Toggle value={notifs.notify_trade_confirm} onChange={v => set('notify_trade_confirm', v)} />
      </SettingRow>
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={save} disabled={saving} className="sf-btn-primary" style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
          {saving ? 'Saving…' : 'Save Notifications'}
        </button>
      </div>
    </Card>
  )
}

function BrokerIntegrationSection() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const { success, error } = useToast()

  const loadStatus = async () => {
    try {
      const res = await getFyersStatus()
      setStatus(res.data)
    } catch (err) {
      setStatus({
        configured: false,
        connected: false,
        has_token: false,
        message: err.response?.data?.detail || 'Unable to load Fyers status',
      })
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const refreshProfile = async () => {
    setLoading(true)
    try {
      const res = await getFyersProfile()
      setStatus(prev => ({
        ...(prev || {}),
        connected: true,
        has_token: true,
        message: 'Connected',
        profile: res.data?.data || res.data,
      }))
      success('Fyers profile refreshed')
    } catch (err) {
      error(err.response?.data?.detail || 'Unable to fetch Fyers profile')
    } finally {
      setLoading(false)
    }
  }

  // DISCONNECT — drop the session/token but keep credentials in .env.
  // Reconnect needs only OAuth (no key re-entry).
  const disconnect = async () => {
    setLoading(true)
    try {
      const res = await clearFyersToken()
      success(res.data?.message || 'Fyers disconnected — credentials kept, reconnect anytime')
      await loadStatus()
    } catch (err) {
      error(err.response?.data?.detail || 'Unable to disconnect Fyers')
    } finally {
      setLoading(false)
    }
  }

  // REVOKE — wipe App ID + Secret ID from .env. Reconnect needs new keys.
  const revoke = async () => {
    if (!window.confirm('Revoke Fyers credentials? Your App ID and Secret ID will be removed from the server and you will need to re-enter them to reconnect.')) return
    setLoading(true)
    try {
      const res = await revokeFyersCredentials()
      success(res.data?.message || 'Fyers credentials revoked')
      await loadStatus()
    } catch (err) {
      error(err.response?.data?.detail || 'Unable to revoke Fyers credentials')
    } finally {
      setLoading(false)
    }
  }

  const configured = !!status?.configured
  const connected = !!status?.connected
  const badgeLabel = connected ? 'Connected' : status?.has_token ? 'Token saved' : 'Not connected'
  const badgeColor = connected ? 'var(--gain-text)' : status?.has_token ? 'var(--warn)' : 'var(--text-sub)'
  const badgeBg = connected ? 'var(--gain-bg)' : status?.has_token ? 'var(--warn-bg)' : 'var(--color-surface2)'
  const profileName = status?.profile?.name || status?.profile?.display_name

  return (
    <Card>
      <SectionHeader icon={LinkIcon} title="Broker Integration" subtitle="Connect your Fyers account for live market data" />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: 'var(--primary-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <LinkIcon size={20} color="var(--primary)" />
            </div>
            <div>
              <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
                Fyers{profileName ? ` — ${profileName}` : ''}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>
                {connected
                  ? `Live market data active · token ${status?.token_preview || ''}`
                  : status?.message || 'Connect your Fyers account in a guided 3-step setup.'}
              </div>
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: badgeBg, color: badgeColor }}>
            {badgeLabel}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {!configured ? (
            // First time — no credentials stored. Full guided setup.
            <button type="button" className="sf-btn-primary" onClick={() => setWizardOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <LinkIcon size={15} />
              Add Fyers Broker
            </button>
          ) : !connected ? (
            // Credentials stored but no live session — connect via OAuth only
            // (the wizard opens straight at the Connect step), or Revoke to wipe keys.
            <>
              <button type="button" className="sf-btn-primary" onClick={() => setWizardOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <LinkIcon size={15} />
                Connect
              </button>
              <button type="button" className="sf-btn-outline" disabled={loading} onClick={revoke}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--loss)' }}>
                <Trash2 size={15} />
                Revoke
              </button>
            </>
          ) : (
            // Connected — Disconnect (keep keys) or Revoke (wipe keys).
            <>
              <button type="button" className="sf-btn-outline" disabled={loading} onClick={refreshProfile}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={15} />
                Refresh Profile
              </button>
              <button type="button" className="sf-btn-outline" disabled={loading} onClick={disconnect}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--warn, #f5c451)' }}>
                <Unplug size={15} />
                Disconnect
              </button>
              <button type="button" className="sf-btn-outline" disabled={loading} onClick={revoke}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--loss)' }}>
                <Trash2 size={15} />
                Revoke
              </button>
            </>
          )}
        </div>

        {connected && status?.profile && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--color-surface2)', padding: 14 }}>
            <div style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Profile</div>
            <pre style={{ margin: 0, color: 'var(--text-sub)', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(status.profile, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <FyersSetupWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onConnected={loadStatus}
      />
    </Card>
  )
}

function SessionsSection({ clearAuth }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const { success, error } = useToast()

  const load = async () => {
    try { setSessions((await getSessions()).data) } catch (_) { error('Unable to load active sessions') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const revoke = async (familyId) => {
    try { await revokeSession(familyId); success('Session revoked'); await load() } catch (_) { error('Unable to revoke session') }
  }

  const revokeAll = async () => {
    try { await logoutAll(); clearAuth(); window.location.href = '/login' } catch (_) { error('Unable to sign out everywhere') }
  }

  return (
    <Card>
      <SectionHeader icon={Shield} title="Active Sessions" subtitle="Review and revoke devices with access to your account" />
      <div style={{ padding: 20 }}>
        {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading sessions...</div> : sessions.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No active sessions found.</div> : sessions.map(session => (
          <div key={session.family_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{session.current ? 'This device' : 'Active device'}</div>
              <div style={{ color: 'var(--text-sub)', fontSize: 11, marginTop: 3 }}>{session.device_info || 'Unknown browser'} · {session.session_policy}</div>
            </div>
            <button className="sf-btn-outline" onClick={() => revoke(session.family_id)} style={{ height: 30, fontSize: 11 }}>Revoke</button>
          </div>
        ))}
        <button onClick={revokeAll} className="sf-btn-outline" style={{ marginTop: 16, color: 'var(--loss)', borderColor: 'var(--loss)' }}>Sign out everywhere</button>
      </div>
    </Card>
  )
}

function AccountSection({ clearAuth }) {
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <Card>
      <SectionHeader icon={Shield} title="Account" subtitle="Manage your account and session" />
      <SettingRow label="Account Type" description="Your current plan">
        <span className="badge-primary" style={{ fontSize: 11 }}>Free Beta</span>
      </SettingRow>
      <SettingRow label="Data & Privacy" description="Your trade data is stored locally and on server" noBorder>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Encrypted</span>
      </SettingRow>
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--loss-bg)' }}>
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--loss)', fontSize: 13, fontWeight: 500, fontFamily: 'Inter,sans-serif', padding: 0
            }}
          >
            <LogOut size={15} />
            Sign out of StrikeFluency
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--text-sub)', fontSize: 13 }}>Are you sure?</span>
            <button
              onClick={async () => { clearAuth(); try { await logout() } catch (_) {} window.location.href = '/login' }}
              style={{ background: 'var(--loss)', border: 'none', borderRadius: 7, padding: '6px 16px', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
            >
              Yes, sign out
            </button>
            <button onClick={() => setShowConfirm(false)} className="sf-btn-outline" style={{ height: 32, fontSize: 12 }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}

function DisciplineModeSection() {
  return (
    <Card>
      <SectionHeader icon={ShieldCheck} title="Discipline Mode" subtitle="Master switch for the trading rules that gate your orders" />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <DisciplineModeToggle variant="full" />
        <Link to="/discipline-mode" style={{ fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
          Open the Discipline Mode control center →
        </Link>
      </div>
    </Card>
  )
}

const SECTIONS = [
  { id: 'profile', icon: User, label: 'Profile' },
  { id: 'trading', icon: Globe, label: 'Trading Preferences' },
  { id: 'discipline', icon: ShieldCheck, label: 'Discipline Mode' },
  { id: 'notifications', icon: Bell, label: 'Notifications' },
  { id: 'broker', icon: LinkIcon, label: 'Broker Integration' },
  { id: 'account', icon: Shield, label: 'Account & Security' },
]

const SECTION_META = {
  profile: 'Your personal information',
  trading: 'Desk defaults & margin',
  discipline: 'Rules that gate your orders',
  notifications: 'In-app alerts & toasts',
  broker: 'Live market data via Fyers',
  account: 'Sessions & sign-out',
}

export default function SettingsPage() {
  const [active, setActive] = useState('profile')
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clearAuth)

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto' }}>
      {/* Page heading */}
      <div style={{ marginBottom: 18 }}>
        <h1 className="sf-serif" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>Settings</h1>
        <p style={{ color: 'var(--text-sub)', fontSize: 13, marginTop: 4 }}>
          Manage your profile, trading defaults, broker integration, and account controls.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* ── Nav rail ── */}
        <Card style={{ position: 'sticky', top: 12 }}>
          <div style={{ padding: 8 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '8px 12px 10px' }}>
              Settings
            </div>
            {SECTIONS.map(({ id, icon: Icon, label }) => {
              const on = active === id
              return (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                    padding: '9px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: on ? 'var(--primary-bg)' : 'transparent',
                    marginBottom: 3, transition: 'background 0.13s', textAlign: 'left',
                    fontFamily: 'Inter,sans-serif',
                  }}
                  onMouseEnter={e => !on && (e.currentTarget.style.background = 'var(--color-surface2)')}
                  onMouseLeave={e => !on && (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{
                    display: 'grid', placeItems: 'center', height: 32, width: 32, flexShrink: 0, borderRadius: 9,
                    background: on ? 'var(--primary)' : 'var(--color-surface2)',
                    color: on ? 'var(--on-primary)' : 'var(--text-muted)',
                    transition: 'all 0.13s',
                  }}>
                    <Icon size={15} strokeWidth={2} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: on ? 700 : 600, color: on ? 'var(--primary)' : 'var(--text)' }}>{label}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{SECTION_META[id]}</span>
                  </span>
                  {on && <ChevronRight size={14} color="var(--primary)" style={{ flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </Card>

        {/* ── Content ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {active === 'profile' && <ProfileSection user={user} />}
          {active === 'trading' && <TradingPreferences />}
          {active === 'discipline' && <DisciplineModeSection />}
          {active === 'notifications' && <NotificationSettings />}
          {active === 'broker' && <BrokerIntegrationSection />}
          {active === 'account' && <SessionsSection clearAuth={clearAuth} />}
          {active === 'account' && <AccountSection clearAuth={clearAuth} />}
        </div>
      </div>
    </div>
  )
}


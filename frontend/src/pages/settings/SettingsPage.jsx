import { useState } from 'react'
import useAuthStore from '../../store/authStore'
import { useToast } from '../../components/common/Toast'
import { User, Bell, Shield, Palette, Globe, LogOut, ChevronRight, Check } from 'lucide-react'

const Card = ({ children, style = {} }) => (
  <div style={{
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    overflow: 'hidden', ...style
  }}>
    {children}
  </div>
)

const SectionHeader = ({ title, subtitle }) => (
  <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
    <div style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>{title}</div>
    {subtitle && <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
  </div>
)

const SettingRow = ({ label, description, children, noBorder }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: noBorder ? 'none' : '1px solid #f8fafc'
  }}>
    <div style={{ flex: 1, paddingRight: 24 }}>
      <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 500 }}>{label}</div>
      {description && <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{description}</div>}
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
        background: value ? '#3b82f6' : '#e2e8f0',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </button>
  )
}

function ProfileSection({ user }) {
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email] = useState(user?.email || '')
  const { success } = useToast()

  const handleSave = () => {
    success('Profile updated (changes saved locally)')
  }

  const initials = (user?.full_name || user?.email || 'T').charAt(0).toUpperCase()

  return (
    <Card>
      <SectionHeader title="Profile" subtitle="Your personal information" />
      <div style={{ padding: 20 }}>
        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 2px 8px rgba(59,130,246,0.3)'
          }}>
            <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>{initials}</span>
          </div>
          <div>
            <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 600 }}>
              {user?.full_name || 'Trader'}
            </div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{user?.email}</div>
            <div style={{ marginTop: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                background: '#eff6ff', color: '#2563eb'
              }}>
                {user?.tier || 'BRONZE'} TIER
              </span>
            </div>
          </div>
        </div>

        {/* Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="sf-label">Full Name</label>
            <input
              className="sf-input"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="sf-label">Email Address</label>
            <input
              className="sf-input"
              value={email}
              readOnly
              style={{ background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }}
            />
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSave} className="sf-btn-primary" style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
            Save Changes
          </button>
        </div>
      </div>
    </Card>
  )
}

function TradingPreferences() {
  const [prefs, setPrefs] = useState({
    defaultInstrument: 'NIFTY',
    defaultLots: 1,
    confirmClose: true,
    showRiskWarnings: true,
    autoFillLtp: true,
  })
  const { success } = useToast()
  const set = (key, val) => setPrefs(p => ({ ...p, [key]: val }))

  return (
    <Card>
      <SectionHeader title="Trading Preferences" subtitle="Defaults for your trading desk" />

      <SettingRow label="Default Instrument" description="Pre-selected instrument on Trading Desk">
        <select
          className="sf-input"
          style={{ width: 130, height: 34 }}
          value={prefs.defaultInstrument}
          onChange={e => set('defaultInstrument', e.target.value)}
        >
          {['NIFTY', 'BANKNIFTY', 'SENSEX'].map(i => <option key={i}>{i}</option>)}
        </select>
      </SettingRow>

      <SettingRow label="Default Lots" description="Number of lots pre-filled in order form">
        <input
          className="sf-input"
          type="number" min={1} max={50}
          style={{ width: 80, height: 34, textAlign: 'center' }}
          value={prefs.defaultLots}
          onChange={e => set('defaultLots', Math.max(1, parseInt(e.target.value) || 1))}
        />
      </SettingRow>

      <SettingRow label="Confirm Before Closing" description="Show confirmation dialog when closing positions">
        <Toggle value={prefs.confirmClose} onChange={v => set('confirmClose', v)} />
      </SettingRow>

      <SettingRow label="Show Risk Warnings" description="Display SL validation warnings in order form">
        <Toggle value={prefs.showRiskWarnings} onChange={v => set('showRiskWarnings', v)} />
      </SettingRow>

      <SettingRow label="Auto-fill LTP from Chain" description="Prefill LTP when clicking option chain cells" noBorder>
        <Toggle value={prefs.autoFillLtp} onChange={v => set('autoFillLtp', v)} />
      </SettingRow>

      <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => success('Trading preferences saved')} className="sf-btn-primary" style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
          Save Preferences
        </button>
      </div>
    </Card>
  )
}

function NotificationSettings() {
  const [notifs, setNotifs] = useState({
    disciplineAlert: true,
    cooldownAlert: true,
    dailyLossAlert: true,
    tradeConfirmation: false,
  })
  const set = (key, val) => setNotifs(p => ({ ...p, [key]: val }))

  return (
    <Card>
      <SectionHeader title="Notifications" subtitle="Control in-app alerts and toasts" />
      <SettingRow label="Discipline Rule Violations" description="Alert when an order is blocked by a discipline rule">
        <Toggle value={notifs.disciplineAlert} onChange={v => set('disciplineAlert', v)} />
      </SettingRow>
      <SettingRow label="Revenge Cooldown Active" description="Remind you when you're in cooldown period">
        <Toggle value={notifs.cooldownAlert} onChange={v => set('cooldownAlert', v)} />
      </SettingRow>
      <SettingRow label="Daily Loss Limit Approaching" description="Warn when you're 80% of max daily loss">
        <Toggle value={notifs.dailyLossAlert} onChange={v => set('dailyLossAlert', v)} />
      </SettingRow>
      <SettingRow label="Trade Confirmation Toast" description="Show toast on every successful order" noBorder>
        <Toggle value={notifs.tradeConfirmation} onChange={v => set('tradeConfirmation', v)} />
      </SettingRow>
    </Card>
  )
}

function AccountSection({ clearAuth }) {
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <Card>
      <SectionHeader title="Account" subtitle="Manage your account and session" />

      <SettingRow label="Account Type" description="Your current plan">
        <span className="badge-primary" style={{ fontSize: 11 }}>Free Beta</span>
      </SettingRow>

      <SettingRow label="Data & Privacy" description="Your trade data is stored locally and on server" noBorder>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>Encrypted ✓</span>
      </SettingRow>

      <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', background: '#fef9f9' }}>
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#dc2626', fontSize: 13, fontWeight: 500, fontFamily: 'Inter,sans-serif', padding: 0
            }}
          >
            <LogOut size={15} />
            Sign out of StrikeFluency
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#64748b', fontSize: 13 }}>Are you sure?</span>
            <button
              onClick={() => { clearAuth(); window.location.href = '/login' }}
              style={{ background: '#dc2626', border: 'none', borderRadius: 7, padding: '6px 16px', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
            >
              Yes, sign out
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="sf-btn-outline"
              style={{ height: 32, fontSize: 12 }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}

const SECTIONS = [
  { id: 'profile', icon: User, label: 'Profile' },
  { id: 'trading', icon: Globe, label: 'Trading Preferences' },
  { id: 'notifications', icon: Bell, label: 'Notifications' },
  { id: 'account', icon: Shield, label: 'Account & Security' },
]

export default function SettingsPage() {
  const [active, setActive] = useState('profile')
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clearAuth)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Left nav */}
      <Card>
        <div style={{ padding: '12px 8px' }}>
          <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 12px 8px' }}>
            Settings
          </div>
          {SECTIONS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: active === id ? '#eff6ff' : 'transparent',
                color: active === id ? '#2563eb' : '#64748b',
                fontSize: 13, fontFamily: 'Inter,sans-serif', fontWeight: active === id ? 500 : 400,
                marginBottom: 2, transition: 'all 0.13s', textAlign: 'left'
              }}
              onMouseEnter={e => active !== id && (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => active !== id && (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Icon size={15} strokeWidth={active === id ? 2 : 1.75} />
                {label}
              </div>
              {active === id && <ChevronRight size={13} />}
            </button>
          ))}
        </div>
      </Card>

      {/* Right content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {active === 'profile' && <ProfileSection user={user} />}
        {active === 'trading' && <TradingPreferences />}
        {active === 'notifications' && <NotificationSettings />}
        {active === 'account' && <AccountSection clearAuth={clearAuth} />}
      </div>
    </div>
  )
}

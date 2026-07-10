import { useEffect, useState } from 'react'
import useAuthStore from '../../store/authStore'
import { useToast } from '../../components/common/Toast'
import { clearFyersToken, exchangeFyersAuthCode, getFyersLogin, getFyersProfile, getFyersStatus } from '../../api/broker'
import { User, Bell, Shield, Globe, LogOut, ChevronRight, Link as LinkIcon, RefreshCw, Unplug } from 'lucide-react'

const Card = ({ children, style = {} }) => (
  <div style={{
    background: '#fff', border: '1px solid #E5E7EB',
    borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    overflow: 'hidden', ...style
  }}>
    {children}
  </div>
)

const SectionHeader = ({ title, subtitle }) => (
  <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0EDF1', background: '#F8F7F9' }}>
    <div style={{ color: '#111827', fontSize: 13, fontWeight: 600 }}>{title}</div>
    {subtitle && <div style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
  </div>
)

const SettingRow = ({ label, description, children, noBorder }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: noBorder ? 'none' : '1px solid #F8F7F9'
  }}>
    <div style={{ flex: 1, paddingRight: 24 }}>
      <div style={{ color: '#111827', fontSize: 13, fontWeight: 500 }}>{label}</div>
      {description && <div style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>{description}</div>}
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
        background: value ? '#714B67' : '#E5E7EB',
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

  return (
    <Card>
      <SectionHeader title="Profile" subtitle="Your personal information" />
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #714B67, #5A3A52)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 2px 8px rgba(113,75,103,0.22)'
          }}>
            <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>{(user?.full_name || user?.email || 'T').charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <div style={{ color: '#111827', fontSize: 15, fontWeight: 600 }}>{user?.full_name || 'Trader'}</div>
            <div style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{user?.email}</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: '#F3EEF3', color: '#5A3A52' }}>
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
            <input className="sf-input" value={email} readOnly style={{ background: '#F8F7F9', color: '#9CA3AF', cursor: 'not-allowed' }} />
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => success('Profile updated (changes saved locally)')} className="sf-btn-primary" style={{ height: 36, padding: '0 20px', fontSize: 13 }}>
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
        <select className="sf-input" style={{ width: 130, height: 34 }} value={prefs.defaultInstrument} onChange={e => set('defaultInstrument', e.target.value)}>
          {['NIFTY', 'BANKNIFTY', 'SENSEX'].map(i => <option key={i}>{i}</option>)}
        </select>
      </SettingRow>

      <SettingRow label="Default Lots" description="Number of lots pre-filled in order form">
        <input className="sf-input" type="number" min={1} max={50} style={{ width: 80, height: 34, textAlign: 'center' }} value={prefs.defaultLots} onChange={e => set('defaultLots', Math.max(1, parseInt(e.target.value) || 1))} />
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

      <div style={{ padding: '12px 20px', borderTop: '1px solid #F0EDF1', display: 'flex', justifyContent: 'flex-end' }}>
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

function BrokerIntegrationSection() {
  const [status, setStatus] = useState(null)
  const [authCode, setAuthCode] = useState('')
  const [loading, setLoading] = useState(false)
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

  const openAuthUrl = async () => {
    setLoading(true)
    const popup = window.open('', 'fyers-connect', 'width=520,height=720')
    if (!popup) {
      setLoading(false)
      error('Popup blocked. Allow popups for this site and try again.')
      return
    }

    let poll = null
    try {
      const res = await getFyersLogin()
      popup.location.href = res.data.login_url || res.data.auth_url
      success('Fyers login opened')

      const startedAt = Date.now()
      poll = window.setInterval(async () => {
        if (Date.now() - startedAt > 180000) {
          window.clearInterval(poll)
          setLoading(false)
          error('Fyers connection timed out')
          return
        }

        try {
          const statusRes = await getFyersStatus()
          setStatus(statusRes.data)
          if (statusRes.data?.connected) {
            window.clearInterval(poll)
            try { popup.close() } catch (_) {}
            setLoading(false)
            success('Fyers connected')
          }
        } catch (_) {}
      }, 3000)
    } catch (err) {
      if (poll) window.clearInterval(poll)
      try { popup.close() } catch (_) {}
      setLoading(false)
      error(err.response?.data?.detail || 'Unable to generate Fyers login URL')
    }
  }
  const submitAuthCode = async () => {
    const trimmed = authCode.trim()
    if (!trimmed) {
      error('Paste the Fyers auth code first')
      return
    }

    setLoading(true)
    try {
      const res = await exchangeFyersAuthCode(trimmed)
      success(res.data?.message || 'Fyers token saved')
      setAuthCode('')
      await loadStatus()
    } catch (err) {
      error(err.response?.data?.detail || 'Fyers token exchange failed')
    } finally {
      setLoading(false)
    }
  }

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

  const disconnect = async () => {
    setLoading(true)
    try {
      const res = await clearFyersToken()
      success(res.data?.message || 'Fyers disconnected')
      setAuthCode('')
      await loadStatus()
    } catch (err) {
      error(err.response?.data?.detail || 'Unable to disconnect Fyers')
    } finally {
      setLoading(false)
    }
  }

  const connected = !!status?.connected
  const badgeLabel = connected ? 'Connected' : status?.has_token ? 'Token saved' : 'Not connected'
  const badgeColor = connected ? '#15803d' : '#92400e'
  const badgeBg = connected ? '#f0fdf4' : '#fffbeb'

  return (
    <Card>
      <SectionHeader title="Broker Integration" subtitle="Connect your Fyers account for live market data and broker token management" />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#111827', fontSize: 14, fontWeight: 600 }}>Fyers</div>
            <div style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>
              {status?.message || 'Generate an auth URL, sign in with Fyers, and paste the auth code here.'}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: badgeBg, color: badgeColor }}>
            {badgeLabel}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
          <div>
            <label className="sf-label">Fyers auth code</label>
            <input className="sf-input" value={authCode} onChange={e => setAuthCode(e.target.value)} placeholder="Paste the code returned by Fyers" />
          </div>
          <div>
            <label className="sf-label">Saved token</label>
            <input className="sf-input" value={status?.token_preview || 'Not available'} readOnly style={{ background: '#F8F7F9', color: '#9CA3AF' }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="sf-btn-primary" disabled={loading} onClick={openAuthUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <LinkIcon size={15} />
            Open Fyers Login
          </button>
          <button type="button" className="sf-btn-outline" disabled={loading} onClick={submitAuthCode} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={15} />
            Save Auth Code
          </button>
          <button type="button" className="sf-btn-outline" disabled={loading} onClick={refreshProfile} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={15} />
            Refresh Profile
          </button>
          <button type="button" className="sf-btn-outline" disabled={loading} onClick={disconnect} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#dc2626' }}>
            <Unplug size={15} />
            Disconnect
          </button>
        </div>

        {status?.profile && (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, background: '#F8F7F9', padding: 14 }}>
            <div style={{ color: '#111827', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Profile</div>
            <pre style={{ margin: 0, color: '#6B7280', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(status.profile, null, 2)}
            </pre>
          </div>
        )}
      </div>
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
        <span style={{ color: '#9CA3AF', fontSize: 12 }}>Encrypted</span>
      </SettingRow>
      <div style={{ padding: '14px 20px', borderTop: '1px solid #F0EDF1', background: '#fef9f9' }}>
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
            <span style={{ color: '#6B7280', fontSize: 13 }}>Are you sure?</span>
            <button
              onClick={() => { clearAuth(); window.location.href = '/login' }}
              style={{ background: '#dc2626', border: 'none', borderRadius: 7, padding: '6px 16px', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
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

const SECTIONS = [
  { id: 'profile', icon: User, label: 'Profile' },
  { id: 'trading', icon: Globe, label: 'Trading Preferences' },
  { id: 'notifications', icon: Bell, label: 'Notifications' },
  { id: 'broker', icon: LinkIcon, label: 'Broker Integration' },
  { id: 'account', icon: Shield, label: 'Account & Security' },
]

export default function SettingsPage() {
  const [active, setActive] = useState('profile')
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clearAuth)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>
      <Card>
        <div style={{ padding: '12px 8px' }}>
          <div style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 12px 8px' }}>
            Settings
          </div>
          {SECTIONS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: active === id ? '#F3EEF3' : 'transparent',
                color: active === id ? '#5A3A52' : '#6B7280',
                fontSize: 13, fontFamily: 'Inter,sans-serif', fontWeight: active === id ? 500 : 400,
                marginBottom: 2, transition: 'all 0.13s', textAlign: 'left'
              }}
              onMouseEnter={e => active !== id && (e.currentTarget.style.background = '#F8F7F9')}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {active === 'profile' && <ProfileSection user={user} />}
        {active === 'trading' && <TradingPreferences />}
        {active === 'notifications' && <NotificationSettings />}
        {active === 'broker' && <BrokerIntegrationSection />}
        {active === 'account' && <AccountSection clearAuth={clearAuth} />}
      </div>
    </div>
  )
}


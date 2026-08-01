import { useEffect, useRef, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import useMarketStore from '../../store/marketStore'
import { getMode } from '../../api/discipline'
import {
  AlertTriangle, ChevronDown, LogOut, Moon,
  Settings, Shield, ShieldOff, Sun, Terminal, UserRound,
} from 'lucide-react'
import useTheme from '../../hooks/useTheme'
import Avatar from '../common/Avatar'
import { presetSrc } from '../../utils/presetAvatars'
import useAuthStore from '../../store/authStore'
import { logout as logoutApi } from '../../api/auth'
import { isAdminRole } from './AdminRoute'

const PAGE_META = {
  '/positions': { title: 'Positions & Books', subtitle: 'Trading workspace' },
  '/dashboard': { title: 'Dashboard', subtitle: 'Track performance, risk, and today\'s trading discipline.' },
  '/terminal-1': { title: 'Terminal 1', subtitle: 'Live spot index prices — NIFTY, BANK NIFTY, and SENSEX.' },
  '/trading': { title: 'Trading Desk', subtitle: 'Scan the option chain, place virtual orders, and manage positions.' },
  '/strategy-builder': { title: 'Strategy Builder', subtitle: 'Build, model, and paper-trade multi-leg option strategies.' },
  '/option-chain': { title: 'Option Chain', subtitle: 'Analyze strikes, open interest, volume, and market positioning.' },
  '/tools': { title: 'Tools', subtitle: 'Trading utilities and calculators.' },
  '/journal': { title: 'Trade Journal', subtitle: 'Review setups, emotions, mistakes, and lessons from each trade.' },
  '/analytics': { title: 'Analytics', subtitle: 'Measure P&L, discipline trends, and execution quality over time.' },
  '/discipline': { title: 'Reports', subtitle: 'Monitor rule compliance, violations, and discipline score health.' },
  '/discipline-mode': { title: 'Discipline Mode', subtitle: 'Master switch for the rules that gate your trades — and free-play capital.' },
  '/settings': { title: 'Settings', subtitle: 'Manage profile, broker integration, preferences, and account controls.' },
  '/api-key': { title: 'API Key', subtitle: 'Manage application credentials and API access.' },
  '/console': { title: 'Console', subtitle: 'P&L, funds, and account overview.' },
  '/profile': { title: 'Profile', subtitle: 'Your account profile.' },
  '/admin': { title: 'Administration', subtitle: 'Read-only operator view: audit trail, users, funds ledger, and system health.' },
}

export default function TopBar() {
  const location = useLocation()
  const isMarketOpen = useMarketStore(s => s.isMarketOpen)
  const marketStatus = useMarketStore(s => s.status)
  const brokerStatus = useMarketStore(s => s.brokerStatus)
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clearAuth)
  const meta = PAGE_META[location.pathname] || { title: 'StrikeFluency', subtitle: 'Virtual options trading dashboard.' }
  const { isDark, toggleTheme } = useTheme()
  const [time, setTime] = useState('')
  const [disciplineOff, setDisciplineOff] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileMenuRef = useRef(null)
  const providerStatus = brokerStatus || marketStatus
  const kiteProblem = providerStatus?.selected_provider === 'kite'
    && ['connecting', 'reconnect_required', 'feed_reconnecting', 'stale', 'unavailable'].includes(providerStatus?.state)
  const isAdmin = isAdminRole(user?.role)
  const profileName = user?.full_name || user?.email || 'Trader'

  // Revoke the server-side refresh-token family / HttpOnly cookie first so the
  // session can't silently refresh back in; then clear local state and leave.
  const handleSignOut = async () => {
    setProfileOpen(false)
    try { await logoutApi() } catch (_) { /* offline — local clear still signs out */ }
    clearAuth()
    window.location.href = '/login'
  }

  // Reflect the master Discipline Mode state globally; re-check on navigation
  // so toggling it on any page updates the pill.
  useEffect(() => {
    let active = true
    getMode().then(r => { if (active) setDisciplineOff(r.data?.enabled === false) }).catch(() => {})
    const onModeChanged = event => setDisciplineOff(event.detail?.enabled === false)
    window.addEventListener('sf:discipline-mode-changed', onModeChanged)
    return () => {
      active = false
      window.removeEventListener('sf:discipline-mode-changed', onModeChanged)
    }
  }, [location.pathname])

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
    }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setProfileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!profileOpen) return undefined

    const closeOnOutsideClick = event => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setProfileOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileOpen])

  return (
    <header className="sf-topbar">
      <div className={`sf-page-title-block${meta.compact ? ' compact' : ''}${meta.dense ? ' dense' : ''}`}>
        {meta.compact && <p>{meta.subtitle}</p>}
        <h1>{meta.title}</h1>
        {!meta.compact && <p>{meta.subtitle}</p>}
      </div>

      <div className="sf-topbar-actions">
        {kiteProblem && (
          <Link
            to={isAdmin ? '/settings' : location.pathname}
            title={providerStatus?.message}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
              background: 'var(--warn-bg)', color: 'var(--warn)',
              border: '1px solid color-mix(in srgb, var(--warn) 45%, transparent)',
              borderRadius: 8, padding: '5px 9px', fontSize: 10.5, fontWeight: 700,
            }}
          >
            <AlertTriangle size={13} />
            {isAdmin ? 'Reconnect Zerodha' : 'Live data unavailable — waiting for administrator'}
          </Link>
        )}
        {disciplineOff && (
          <Link to="/discipline-mode" title="Discipline Mode is OFF — free play"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
              background: 'var(--warn-bg)', color: 'var(--warn)', border: '1px solid var(--warn)',
              borderRadius: 999, padding: '5px 12px', fontSize: 11.5, fontWeight: 700 }}>
            <ShieldOff size={14} /> DISCIPLINE OFF
          </Link>
        )}
        <div className="sf-market-pill">
          <span className={isMarketOpen ? 'sf-market-dot open blink' : 'sf-market-dot'} />
          <span>{isMarketOpen ? 'Market Open' : 'Market Closed'}</span>
          <strong>{time} IST</strong>
        </div>

        <button
          type="button"
          className="sf-icon-button"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
          title={isDark ? 'Light theme' : 'Dark theme'}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <Link to="/settings" className="sf-icon-button" aria-label="Settings" title="Settings">
          <Settings size={17} />
        </Link>
        <div className="sf-profile-menu-wrap" ref={profileMenuRef}>
          <button
            type="button"
            className={`sf-profile-trigger${profileOpen ? ' active' : ''}`}
            aria-label="Open profile menu"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen(open => !open)}
          >
            <Avatar name={profileName} photoSrc={user?.avatar_url} presetSrc={presetSrc(user?.avatar_preset)} className="sf-profile-avatar" />
            <ChevronDown size={13} className={profileOpen ? 'open' : ''} />
          </button>

          {profileOpen && (
            <div className="sf-profile-dropdown" role="menu" aria-label="Profile navigation">
              <div className="sf-profile-dropdown-header">
                <Avatar name={profileName} photoSrc={user?.avatar_url} presetSrc={presetSrc(user?.avatar_preset)} className="sf-profile-dropdown-avatar" />
                <div className="sf-profile-dropdown-id">
                  <strong>{user?.full_name || 'Trader'}</strong>
                  <span>{user?.email || 'StrikeFluency account'}</span>
                  <em className="sf-profile-dropdown-plan">{String(user?.plan || 'free').replace(/^\w/, c => c.toUpperCase())} plan</em>
                </div>
              </div>
              <Link to="/profile" className="sf-profile-menu-item" role="menuitem">
                <UserRound size={16} />
                <span>Profile</span>
              </Link>
              {isAdmin && (
                <Link to="/admin" className="sf-profile-menu-item" role="menuitem">
                  <Shield size={16} />
                  <span>Admin Page</span>
                </Link>
              )}
              <Link to="/settings" className="sf-profile-menu-item" role="menuitem">
                <Settings size={16} />
                <span>Settings</span>
              </Link>
              <Link to="/console" className="sf-profile-menu-item" role="menuitem">
                <Terminal size={16} />
                <span>Console</span>
              </Link>
              <button
                type="button"
                className="sf-profile-menu-item sf-profile-menu-signout"
                role="menuitem"
                onClick={handleSignOut}
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

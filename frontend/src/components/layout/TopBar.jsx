import { useEffect, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import useMarketStore from '../../store/marketStore'
import { getMode } from '../../api/discipline'
import { Bell, Mail, Moon, Search, Settings, Sun, ShieldOff } from 'lucide-react'

const PAGE_META = {
  '/positions': { title: 'Positions & Books', subtitle: 'Trading workspace', compact: true },
  '/dashboard': { title: 'Dashboard', subtitle: 'Track performance, risk, and today\'s trading discipline.' },
  '/terminal-1': { title: 'Terminal 1', subtitle: 'Live spot index prices — NIFTY, BANK NIFTY, and SENSEX.' },
  '/trading': { title: 'Trading Desk', subtitle: 'Scan the option chain, place virtual orders, and manage positions.', dense: true },
  '/journal': { title: 'Trade Journal', subtitle: 'Review setups, emotions, mistakes, and lessons from each trade.' },
  '/analytics': { title: 'Analytics', subtitle: 'Measure P&L, discipline trends, and execution quality over time.' },
  '/discipline': { title: 'Reports', subtitle: 'Monitor rule compliance, violations, and discipline score health.' },
  '/discipline-mode': { title: 'Discipline Mode', subtitle: 'Master switch for the rules that gate your trades — and free-play capital.' },
  '/settings': { title: 'Settings', subtitle: 'Manage profile, broker integration, preferences, and account controls.' },
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  return localStorage.getItem('sf-theme') || 'dark'
}

export default function TopBar() {
  const location = useLocation()
  const isMarketOpen = useMarketStore(s => s.isMarketOpen)
  const meta = PAGE_META[location.pathname] || { title: 'StrikeFluency', subtitle: 'Virtual options trading dashboard.' }
  const [theme, setTheme] = useState(getInitialTheme)
  const [time, setTime] = useState('')
  const [disciplineOff, setDisciplineOff] = useState(false)

  // Reflect the master Discipline Mode state globally; re-check on navigation
  // so toggling it on any page updates the pill.
  useEffect(() => {
    let active = true
    getMode().then(r => { if (active) setDisciplineOff(r.data?.enabled === false) }).catch(() => {})
    return () => { active = false }
  }, [location.pathname])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.classList.toggle('light', theme === 'light')
    localStorage.setItem('sf-theme', theme)
  }, [theme])

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
    }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="sf-topbar">
      <div className={`sf-page-title-block${meta.compact ? ' compact' : ''}${meta.dense ? ' dense' : ''}`}>
        {meta.compact && <p>{meta.subtitle}</p>}
        <h1>{meta.title}</h1>
        {!meta.compact && <p>{meta.subtitle}</p>}
      </div>

      <div className="sf-topbar-actions">
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

        <label className="sf-search-box">
          <Search size={16} />
          <input type="search" placeholder="Search trades, reports..." />
        </label>

        <button
          type="button"
          className="sf-icon-button"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <Link to="/settings" className="sf-icon-button" aria-label="Settings" title="Settings">
          <Settings size={17} />
        </Link>
        <button type="button" className="sf-icon-button" aria-label="Notifications" title="Notifications">
          <Bell size={18} />
        </button>
        <button type="button" className="sf-icon-button has-badge" aria-label="Messages" title="Messages">
          <Mail size={18} />
          <span>4</span>
        </button>
      </div>
    </header>
  )
}

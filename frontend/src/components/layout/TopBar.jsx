import { useEffect, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import useMarketStore from '../../store/marketStore'
import { Bell, Mail, Moon, Search, Settings, Sun } from 'lucide-react'

const PAGE_META = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Track performance, risk, and today\'s trading discipline.' },
  '/trading': { title: 'Trading Desk', subtitle: 'Scan the option chain, place virtual orders, and manage positions.' },
  '/journal': { title: 'Trade Journal', subtitle: 'Review setups, emotions, mistakes, and lessons from each trade.' },
  '/analytics': { title: 'Analytics', subtitle: 'Measure P&L, discipline trends, and execution quality over time.' },
  '/discipline': { title: 'Reports', subtitle: 'Monitor rule compliance, violations, and discipline score health.' },
  '/settings': { title: 'Settings', subtitle: 'Manage profile, broker integration, preferences, and account controls.' },
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  return localStorage.getItem('sf-theme') || 'light'
}

export default function TopBar() {
  const location = useLocation()
  const isMarketOpen = useMarketStore(s => s.isMarketOpen)
  const meta = PAGE_META[location.pathname] || { title: 'StrikeFluency', subtitle: 'Virtual options trading dashboard.' }
  const [theme, setTheme] = useState(getInitialTheme)
  const [time, setTime] = useState('')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
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
      <div className="sf-page-title-block">
        <h1>{meta.title}</h1>
        <p>{meta.subtitle}</p>
      </div>

      <div className="sf-topbar-actions">
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
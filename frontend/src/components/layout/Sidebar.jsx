import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Shield, BookOpen, BarChart2, LogOut,
  TrendingUp, Settings, HelpCircle, Zap
} from 'lucide-react'
import useAuthStore from '../../store/authStore'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/trading', icon: Activity, label: 'Trade' },
  { to: '/journal', icon: BookOpen, label: 'Journal' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/discipline', icon: Shield, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clearAuth)
  const initials = (user?.full_name || user?.email || 'T').charAt(0).toUpperCase()
  const displayName = user?.full_name || 'Trader'

  return (
    <aside className="sf-sidebar">
      <div className="sf-brand">
        <div className="sf-brand-mark">
          <TrendingUp size={17} strokeWidth={2.5} />
        </div>
        <span>StrikeFluency</span>
      </div>

      <nav className="sf-side-nav" aria-label="Primary navigation">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `sf-nav-link${isActive ? ' active' : ''}`}>
            <Icon size={17} strokeWidth={1.9} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button type="button" className="sf-nav-link sf-nav-button">
          <HelpCircle size={17} strokeWidth={1.9} />
          <span>Help Center</span>
        </button>
      </nav>

      <div className="sf-sidebar-spacer" />

      <section className="sf-upgrade-card" aria-label="Premium features">
        <div>
          <h3>Unlock Premium Features</h3>
          <p>Get advanced analytics, discipline reports and more.</p>
        </div>
        <Zap size={16} />
        <button type="button">Upgrade Now</button>
      </section>

      <section className="sf-user-card">
        <div className="sf-user-avatar">{initials}</div>
        <div className="sf-user-name">{displayName}</div>
        <div className="sf-user-plan">Virtual Account</div>
        <button
          type="button"
          onClick={() => { clearAuth(); window.location.href = '/login' }}
          className="sf-signout-button"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </section>
    </aside>
  )
}
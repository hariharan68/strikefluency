import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Shield, BookOpen, BarChart2, LogOut,
  TrendingUp, Settings, Radio, Layers, Table2
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import * as authApi from '../../api/auth'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/terminal-1', icon: Radio, label: 'Terminal 1' },
  { to: '/strategy-builder', icon: Layers, label: 'Strategy Builder' },
  { to: '/option-chain', icon: Table2, label: 'Option Chain' },
  { to: '/trading', icon: Activity, label: 'Trade' },
  { to: '/journal', icon: BookOpen, label: 'Journal' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/discipline', icon: Shield, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const clearAuth = useAuthStore(s => s.clearAuth)

  const handleSignOut = async () => {
    // Revoke the server-side refresh-token family and clear the HttpOnly
    // cookie FIRST — otherwise the session survives and the next page load
    // silently refreshes straight back into the app. Best-effort: even if the
    // request fails we still clear local state and leave.
    try {
      await authApi.logout()
    } catch (_) {
      /* network/offline — local clear below still signs the user out here */
    }
    clearAuth()
    window.location.href = '/login'
  }

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
      </nav>

      <div className="sf-sidebar-spacer" />

      <button
        type="button"
        onClick={handleSignOut}
        className="sf-nav-link sf-nav-button"
        style={{ margin: '0 8px 16px', width: 'calc(100% - 16px)' }}
      >
        <LogOut size={17} strokeWidth={1.9} />
        <span>Sign out</span>
      </button>
    </aside>
  )
}

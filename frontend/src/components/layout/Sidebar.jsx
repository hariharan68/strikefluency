import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Activity, Shield, BookOpen, BarChart2, ChevronDown, LogOut, TrendingUp, Settings } from 'lucide-react'
import useAuthStore from '../../store/authStore'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Overview' },
  { to: '/trading',    icon: Activity,         label: 'Trading Desk' },
  { to: '/journal',    icon: BookOpen,          label: 'Trade Journal' },
  { to: '/analytics',  icon: BarChart2,         label: 'Analytics' },
  { to: '/discipline', icon: Shield,            label: 'Discipline' },
  { to: '/settings',   icon: Settings,          label: 'Settings' },
]

export default function Sidebar() {
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clearAuth)
  const initials = (user?.full_name || user?.email || 'T').charAt(0).toUpperCase()

  return (
    <div style={{
      width: 220, height: '100vh', background: '#f8fafc',
      borderRight: '1px solid #e2e8f0',
      display: 'flex', flexDirection: 'column',
      position: 'fixed', left: 0, top: 0, zIndex: 50
    }}>
      {/* Logo — matches reference style */}
      <div style={{
        height: 52, padding: '0 14px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          boxShadow: '0 2px 6px rgba(59,130,246,0.35)'
        }}>
          <TrendingUp size={14} color="#fff" strokeWidth={2.5} />
        </div>
        <span style={{ color: '#1e293b', fontSize: 13, fontWeight: 600, flex: 1 }}>StrikeFluency</span>
        <ChevronDown size={13} color="#94a3b8" />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2,
              textDecoration: 'none',
              background: isActive ? '#3b82f6' : 'transparent',
              color: isActive ? '#ffffff' : '#64748b',
              fontWeight: isActive ? 500 : 400,
              fontSize: 13, transition: 'all 0.13s',
            })}
            onMouseEnter={(e) => {
              if (!e.currentTarget.dataset.active) {
                e.currentTarget.style.background = '#eff6ff'
                e.currentTarget.style.color = '#3b82f6'
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.dataset.active) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#64748b'
              }
            }}
          >
            {({ isActive }) => (
              <>
                <Icon size={16} strokeWidth={isActive ? 2 : 1.75} style={{ flexShrink: 0 }} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '10px 8px 12px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 8, background: '#f1f5f9', marginBottom: 4
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: '#eff6ff', border: '1px solid #bfdbfe',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <span style={{ color: '#3b82f6', fontSize: 11, fontWeight: 600 }}>{initials}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#1e293b', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name?.split(' ')[0] || 'Trader'}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email || ''}
            </div>
          </div>
        </div>
        <button
          onClick={() => { clearAuth(); window.location.href = '/login' }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', borderRadius: 8, border: 'none',
            background: 'transparent', cursor: 'pointer', color: '#94a3b8',
            fontSize: 12, fontFamily: 'Inter,sans-serif', transition: 'all 0.13s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#b91c1c' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  )
}

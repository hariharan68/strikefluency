import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, MonitorSmartphone } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import { getSessions } from '../../api/auth'
import { formatDate } from '../../utils/formatters'
import Spinner from '../../components/common/Spinner'
import Badge from '../../components/common/Badge'

export default function AccountSection() {
  const user = useAuthStore(s => s.user)
  const [sessions, setSessions] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getSessions()
      .then(res => { if (active) setSessions(Array.isArray(res.data) ? res.data : res.data?.sessions || []) })
      .catch(() => { if (active) setSessions([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const profile = [
    { label: 'Name', value: user?.full_name || '—' },
    { label: 'Email', value: user?.email || '—' },
    { label: 'Plan', value: String(user?.plan || 'free').replace(/^\w/, c => c.toUpperCase()) },
    { label: 'Role', value: String(user?.role || 'trader').replace(/^\w/, c => c.toUpperCase()) },
  ]

  return (
    <div className="console-section">
      <div className="console-account-grid">
        <div className="sf-card console-account-card">
          <div className="sf-card-header">
            <div><h3>Profile</h3><p>Read-only — manage in Settings</p></div>
            <Link to="/settings" className="console-download"><ExternalLink size={14} /> Settings</Link>
          </div>
          <dl className="console-account-list">
            {profile.map(item => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="sf-card console-account-card">
          <div className="sf-card-header">
            <div><h3>Active sessions</h3><p>Signed-in devices</p></div>
            {sessions && <Badge color="var(--primary)">{sessions.length}</Badge>}
          </div>
          {loading ? <Spinner /> : (
            <ul className="console-session-list">
              {(!sessions || sessions.length === 0) && <li className="console-desc">No active sessions found.</li>}
              {sessions?.map((session, i) => (
                <li key={session.family_id || session.id || i}>
                  <span className="console-session-icon"><MonitorSmartphone size={15} /></span>
                  <div>
                    <strong>{session.device_info || 'Unknown device'}</strong>
                    <span>{session.last_used_at ? `Last active ${formatDate(session.last_used_at)}` : session.created_at ? `Started ${formatDate(session.created_at)}` : ''}</span>
                  </div>
                  {session.current && <Badge color="var(--gain)">This device</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

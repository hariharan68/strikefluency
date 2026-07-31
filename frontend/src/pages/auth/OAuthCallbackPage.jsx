import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { restoreSession } from '../../api/session'
import useAuthStore from '../../store/authStore'

export default function OAuthCallbackPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const clearAuth = useAuthStore(s => s.clearAuth)

  useEffect(() => {
    // Shares AuthBootstrap's promise rather than starting a second refresh:
    // AuthBootstrap is mounted globally and runs on this route too, and the
    // refresh cookie is single-use.
    restoreSession()
      .then(({ user, token }) => {
        setAuth(user, token)
        navigate('/dashboard', { replace: true })
      })
      .catch(() => {
        clearAuth()
        navigate('/login?oauth_error=auth_failed', { replace: true })
      })
  }, [])

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: 'var(--color-bg)'
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: 44, height: 44, border: '3px solid var(--border)',
        borderTopColor: 'var(--primary)', borderRadius: '50%',
        animation: 'spin 0.75s linear infinite'
      }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Signing you in…
      </p>
    </div>
  )
}

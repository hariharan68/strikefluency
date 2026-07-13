import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../../api/auth'
import useAuthStore, { getAccessToken } from '../../store/authStore'

export default function OAuthCallbackPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const clearAuth = useAuthStore(s => s.clearAuth)

  useEffect(() => {
    authApi.refresh()
      .then(() => authApi.getMe())
      .then(({ data }) => {
        setAuth(data, getAccessToken())
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
        width: 44, height: 44, border: '3px solid #DBEAFE',
        borderTopColor: '#2563EB', borderRadius: '50%',
        animation: 'spin 0.75s linear infinite'
      }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Poppins,sans-serif' }}>
        Signing you in…
      </p>
    </div>
  )
}

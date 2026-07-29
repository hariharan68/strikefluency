import { Navigate, Outlet } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import useAuthStore from '../../store/authStore'

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const initialized = useAuthStore(s => s.initialized)
  if (!initialized) {
    return (
      <main
        aria-busy="true"
        aria-live="polite"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--color-bg)',
          color: 'var(--text)',
        }}
      >
        <div style={{ display: 'grid', justifyItems: 'center', gap: 12, textAlign: 'center' }}>
          <span
            style={{
              width: 44,
              height: 44,
              display: 'grid',
              placeItems: 'center',
              border: '1px solid var(--primary-border)',
              borderRadius: 12,
              background: 'var(--primary-bg)',
              color: 'var(--primary)',
            }}
          >
            <LoaderCircle className="sf-spin" size={22} />
          </span>
          <strong style={{ fontSize: 14 }}>Restoring your session</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            This will automatically return to sign in if the session has expired.
          </span>
        </div>
      </main>
    )
  }
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

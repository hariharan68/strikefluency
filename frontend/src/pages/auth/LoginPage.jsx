import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLogin } from '../../hooks/useAuth'
import { TrendingUp, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { submit, error, loading } = useLogin()

  return (
    <div style={{
      minHeight: '100vh', background: '#f1f5f9',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(59,130,246,0.35)'
          }}>
            <TrendingUp size={24} color="#fff" strokeWidth={2.5} />
          </div>
          <h1 style={{ color: '#1e293b', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>StrikeFluency</h1>
          <p style={{ color: '#64748b', fontSize: 13 }}>Virtual Options Trading Simulator</p>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 32, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <h2 style={{ color: '#1e293b', fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Sign in to your account</h2>

          <form onSubmit={e => { e.preventDefault(); submit(email, password) }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="sf-label">Email address</label>
              <input className="sf-input" type="email" placeholder="trader@example.com"
                value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div>
              <label className="sf-label">Password</label>
              <input className="sf-input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px' }}>
                <AlertCircle size={14} color="#dc2626" style={{ flexShrink: 0 }} />
                <span style={{ color: '#b91c1c', fontSize: 12 }}>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="sf-btn-primary"
              style={{ marginTop: 4, height: 42, fontSize: 14, letterSpacing: '0.01em' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 18, color: '#64748b', fontSize: 13 }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#3b82f6', fontWeight: 500, textDecoration: 'none' }}>
            Create one →
          </Link>
        </p>
      </div>
    </div>
  )
}

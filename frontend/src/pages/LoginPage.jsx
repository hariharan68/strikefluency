import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, Check, Eye, EyeOff, Lock, Mail, TrendingUp } from 'lucide-react'
import { useLogin } from '../hooks/useAuth'
import { oauthStartUrl, confirmOAuthLink } from '../api/oauth'
import useAuthStore, { getAccessToken } from '../store/authStore'
import * as authApi from '../api/auth'
import { useNavigate } from 'react-router-dom'

// ── Sidebar feature row ───────────────────────────────────────────
function Feature({ children }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[var(--text-sub)]">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-bg)] text-[var(--primary)]">
        <Check size={13} strokeWidth={3} />
      </span>
      {children}
    </div>
  )
}

// ── Social provider icons ─────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
)


// ── OAuth error messages ──────────────────────────────────────────
const OAUTH_ERRORS = {
  invalid_state: 'OAuth session expired. Please try again.',
  provider_mismatch: 'OAuth provider mismatch. Please try again.',
  not_configured: 'This login method is not configured yet.',
  exchange_failed: 'Could not connect to the OAuth provider. Please try again.',
  auth_failed: 'Authentication failed. Please log in with your password.',
  inactive: 'Your account is inactive. Contact support.',
  server_error: 'A server error occurred. Please try again.',
}

// ── Link challenge banner ─────────────────────────────────────────
function LinkChallengeBanner({ challengeId, provider, onSuccess }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)

  const providerLabel = provider
    ? provider.charAt(0).toUpperCase() + provider.slice(1)
    : 'OAuth'

  const handleLink = async (e) => {
    e.preventDefault()
    if (!password) { setError('Password is required'); return }
    setLoading(true)
    setError('')
    try {
      const { data } = await confirmOAuthLink(challengeId, password)
      setAuth(data.user, data.access_token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Incorrect password or expired link.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: '#EFF6FF', border: '1px solid #BFDBFE',
      borderRadius: 14, padding: '18px 20px', marginBottom: 20
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>🔗</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#0B1437' }}>Link your {providerLabel} account</span>
      </div>
      <p style={{ fontSize: 13, color: '#374151', marginBottom: 14, lineHeight: 1.5 }}>
        An account with this email already exists. Enter your password to link it with {providerLabel}.
      </p>
      <form onSubmit={handleLink} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Lock style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none', color: 'var(--text-muted)'
          }} size={16} />
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Your account password"
            className="sf-input"
            style={{ paddingLeft: '2.4rem', paddingRight: '2.75rem' }}
          />
          <button type="button" onClick={() => setShowPw(v => !v)}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {error && (
          <p style={{ fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertCircle size={13} /> {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="sf-btn-primary" style={{ height: 40, fontSize: 13 }}>
          {loading ? 'Linking…' : `Link ${providerLabel} Account`}
        </button>
      </form>
    </div>
  )
}

// ── OAuth buttons row ─────────────────────────────────────────────
function OAuthButtons({ rememberMe }) {
  return (
    <button
      type="button"
      onClick={() => { window.location.href = oauthStartUrl('google', rememberMe) }}
      style={{
        width: '100%', height: 50, border: '1px solid #DBEAFE',
        borderRadius: 14, background: '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        fontSize: 14, fontWeight: 600, color: '#0B1437', fontFamily: 'Poppins,sans-serif',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#93C5FD'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.10)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#DBEAFE'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <GoogleIcon />
      Continue with Google
    </button>
  )
}

// ── Divider ───────────────────────────────────────────────────────
function OrDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#DBEAFE' }} />
      <span style={{ color: '#8B93A7', fontSize: 12, fontWeight: 500 }}>or</span>
      <div style={{ flex: 1, height: 1, background: '#DBEAFE' }} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [errors, setErrors] = useState({ email: '', password: '' })
  const { submit, error, loading } = useLogin()
  const [searchParams] = useSearchParams()

  // After sign-out the user lands here. Pressing the browser Back button once
  // should take them to the landing page — not back into the (now revoked)
  // app pages. Push a sentinel entry and redirect to "/" when it's popped.
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const onPop = () => { window.location.replace('/') }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const oauthError = searchParams.get('oauth_error')
  const oauthLink = searchParams.get('oauth_link')
  const oauthProvider = searchParams.get('provider')

  const validate = () => {
    const nextErrors = { email: '', password: '' }
    const emailRegex = /^\S+@\S+\.\S+$/
    if (!email.trim()) nextErrors.email = 'Email is required'
    else if (!emailRegex.test(email)) nextErrors.email = 'Enter a valid email address'
    if (!password) nextErrors.password = 'Password is required'
    setErrors(nextErrors)
    return !nextErrors.email && !nextErrors.password
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!validate()) return
    submit(email.trim(), password, rememberMe)
  }

  return (
    <main className="flex min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      {/* ── Dark aside ── */}
      <aside className="relative hidden min-h-screen w-[46%] flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--color-surface)] px-12 py-10 lg:flex xl:w-[42%]">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--on-primary)]" style={{ background: 'var(--accent-gradient)' }}>
            <TrendingUp size={17} strokeWidth={2.5} />
          </div>
          <span className="sf-serif text-xl font-bold text-[var(--text)]">StrikeFluency</span>
        </div>

        <div className="relative z-10 mt-28 max-w-md">
          <p className="eyebrow mb-4">Virtual trading discipline</p>
          <h1 className="sf-serif text-4xl font-bold leading-tight text-[var(--text)]">Trade with clarity before capital is on the line.</h1>
          <p className="mt-5 text-base leading-7 text-[var(--text-sub)]">
            Practice NIFTY options, enforce risk rules, and turn every setup into measurable feedback.
          </p>
        </div>

        <div className="relative z-10 mt-auto flex flex-col gap-4 pb-8">
          <Feature>Option-chain execution with discipline gates</Feature>
          <Feature>Daily scorecards for violations and streaks</Feature>
          <Feature>Journal and analytics built around repeatable process</Feature>
        </div>
      </aside>

      {/* ── Form section ── */}
      <section className="flex flex-1 items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-[380px] animate-in">

          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--on-primary)]" style={{ background: 'var(--accent-gradient)' }}><TrendingUp size={17} /></div>
              <span className="sf-serif text-xl font-bold text-[var(--text)]">StrikeFluency</span>
            </div>
          </div>

          <div className="mb-7">
            <h2 className="sf-serif text-3xl font-bold leading-tight text-[var(--text)]">Welcome back</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Log in to continue to your trading dashboard</p>
          </div>

          {/* Link challenge (from OAuth) */}
          {oauthLink && (
            <LinkChallengeBanner challengeId={oauthLink} provider={oauthProvider} />
          )}

          {/* OAuth error */}
          {oauthError && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{OAUTH_ERRORS[oauthError] || 'Sign-in failed. Please try again.'}</span>
            </div>
          )}

          {/* OAuth social buttons */}
          <OAuthButtons rememberMe={rememberMe} />

          <OrDivider />

          {/* Email/password form */}
          <form noValidate onSubmit={handleSubmit} className="space-y-5 mt-1">
            <div>
              <label htmlFor="email" className="sf-label">Email</label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  style={{ left: 12 }} size={17}
                />
                <input
                  id="email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  className="sf-input"
                  style={{ paddingLeft: '2.4rem' }}
                  placeholder="name@example.com"
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-[#dc2626]">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="sf-label">Password</label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  style={{ left: 12 }} size={17}
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  className="sf-input"
                  style={{ paddingLeft: '2.4rem', paddingRight: '2.75rem' }}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--primary)]"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-[#dc2626]">{errors.password}</p>}
            </div>

            <div className="flex items-center justify-between gap-4">
              <label htmlFor="rememberMe" className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
                <input
                  id="rememberMe" type="checkbox" checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
                />
                Remember me
              </label>
              <a href="#forgot-password" className="rounded-lg text-sm font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)]">
                Forgot password?
              </a>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="sf-btn-primary min-h-10 w-full">
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-[var(--text-muted)]">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)]">Sign up</Link>
          </p>
        </div>
      </section>
    </main>
  )
}

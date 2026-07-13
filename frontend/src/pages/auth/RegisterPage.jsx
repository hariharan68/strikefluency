import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Archive, Check, Eye, EyeOff, Folder, Lock, Mail, Star, TrendingUp, User } from 'lucide-react'
import { useRegister } from '../../hooks/useAuth'
import { oauthStartUrl } from '../../api/oauth'

function Step({ icon: Icon, title, text }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-bg)] text-[var(--primary)]">
        <Icon size={17} />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">{text}</p>
      </div>
    </div>
  )
}

// ── Social icons ──────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
)

function OAuthButtons() {
  return (
    <button
      type="button"
      onClick={() => { window.location.href = oauthStartUrl('google', true) }}
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

function OrDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#DBEAFE' }} />
      <span style={{ color: '#8B93A7', fontSize: 12, fontWeight: 500 }}>or</span>
      <div style={{ flex: 1, height: 1, background: '#DBEAFE' }} />
    </div>
  )
}

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errors, setErrors] = useState({ fullName: '', email: '', password: '', confirmPassword: '' })
  const { submit, error, loading } = useRegister()

  const validate = () => {
    const nextErrors = { fullName: '', email: '', password: '', confirmPassword: '' }
    const emailRegex = /^\S+@\S+\.\S+$/
    if (!fullName.trim()) nextErrors.fullName = 'Full name is required'
    if (!email.trim()) nextErrors.email = 'Email is required'
    else if (!emailRegex.test(email)) nextErrors.email = 'Enter a valid email address'
    if (!password) nextErrors.password = 'Password is required'
    else if (password.length < 8) nextErrors.password = 'Use at least 8 characters'
    if (!confirmPassword) nextErrors.confirmPassword = 'Confirm your password'
    else if (confirmPassword !== password) nextErrors.confirmPassword = 'Passwords do not match'
    setErrors(nextErrors)
    return !nextErrors.fullName && !nextErrors.email && !nextErrors.password && !nextErrors.confirmPassword
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!validate()) return
    submit(fullName.trim(), email.trim(), password, true)
  }

  return (
    <main className="flex min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      {/* ── Dark aside ── */}
      <aside className="relative hidden min-h-screen w-[46%] flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--color-surface)] px-12 py-10 lg:flex xl:w-[42%]">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[#131313]" style={{ background: 'var(--accent-gradient)' }}>
            <TrendingUp size={17} strokeWidth={2.5} />
          </div>
          <span className="sf-serif text-xl font-bold text-[var(--text)]">StrikeFluency</span>
        </div>

        <div className="relative z-10 mt-28 max-w-md">
          <p className="eyebrow mb-4">Start disciplined practice</p>
          <h1 className="sf-serif text-4xl font-bold leading-tight text-[var(--text)]">Build your virtual trading desk today.</h1>
          <p className="mt-5 text-base leading-7 text-[var(--text-sub)]">
            Create an account, start with virtual capital, and let every order pass through your rule system.
          </p>
        </div>

        <div className="relative z-10 mt-auto flex flex-col gap-5 pb-8">
          <Step icon={Archive} title="Practice safely" text="Trade NIFTY, BANKNIFTY, and SENSEX options with simulated capital." />
          <Step icon={Folder} title="Organize every session" text="Keep your journal, violations, and daily performance in one workspace." />
          <Step icon={Star} title="Improve the process" text="Use discipline score and analytics to find repeatable habits." />
        </div>
      </aside>

      {/* ── Form section ── */}
      <section className="flex flex-1 items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-[380px] animate-in">

          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[#131313]" style={{ background: 'var(--accent-gradient)' }}><TrendingUp size={17} /></div>
              <span className="sf-serif text-xl font-bold text-[var(--text)]">StrikeFluency</span>
            </div>
          </div>

          <div className="mb-7">
            <h2 className="sf-serif text-3xl font-bold leading-tight text-[var(--text)]">Create your account</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Start your virtual trading dashboard</p>
          </div>

          {/* OAuth social buttons */}
          <OAuthButtons />

          <OrDivider />

          {/* Registration form */}
          <form noValidate onSubmit={handleSubmit} className="space-y-4 mt-1">
            <div>
              <label htmlFor="fullName" className="sf-label">Full name</label>
              <div className="relative">
                <User
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  style={{ left: 12 }} size={17}
                />
                <input
                  id="fullName" type="text" value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  aria-invalid={!!errors.fullName}
                  className="sf-input"
                  style={{ paddingLeft: '2.4rem' }}
                  placeholder="Your full name"
                />
              </div>
              {errors.fullName && <p className="mt-1.5 text-xs text-[#dc2626]">{errors.fullName}</p>}
            </div>

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
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  className="sf-input"
                  style={{ paddingLeft: '2.4rem', paddingRight: '2.75rem' }}
                  placeholder="Create a password (min 8 chars)"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--primary)]"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-[#dc2626]">{errors.password}</p>}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="sf-label">Confirm password</label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  style={{ left: 12 }} size={17}
                />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  className="sf-input"
                  style={{ paddingLeft: '2.4rem', paddingRight: '2.75rem' }}
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--primary)]"
                >
                  {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.confirmPassword && <p className="mt-1.5 text-xs text-[#dc2626]">{errors.confirmPassword}</p>}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="sf-btn-primary min-h-10 w-full">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-[var(--text-muted)]">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)]">Log in</Link>
          </p>
        </div>
      </section>
    </main>
  )
}

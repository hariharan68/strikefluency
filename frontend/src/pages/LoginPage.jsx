import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, Eye, EyeOff, Lock, Mail, TrendingUp } from 'lucide-react'
import { useLogin } from '../hooks/useAuth'

function Feature({ children }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[#D8DBE6]">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#714B67]/25 text-[#E9D6E4]">
        <Check size={13} strokeWidth={3} />
      </span>
      {children}
    </div>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [errors, setErrors] = useState({ email: '', password: '' })
  const { submit, error, loading } = useLogin()

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
    submit(email.trim(), password)
  }

  return (
    <main className="flex min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <aside className="relative hidden min-h-screen w-[46%] flex-col overflow-hidden bg-[#252733] px-12 py-10 lg:flex xl:w-[42%]">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#714B67] text-white shadow-[0_8px_20px_rgba(113,75,103,0.35)]">
            <TrendingUp size={17} strokeWidth={2.5} />
          </div>
          <span className="sf-serif text-xl font-bold text-white">StrikeFluency</span>
        </div>

        <div className="relative z-10 mt-28 max-w-md">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C4A0BA]">Virtual trading discipline</p>
          <h1 className="sf-serif text-4xl font-bold leading-tight text-white">Trade with clarity before capital is on the line.</h1>
          <p className="mt-5 text-base leading-7 text-[#B7BAC8]">
            Practice NIFTY options, enforce risk rules, and turn every setup into measurable feedback.
          </p>
        </div>

        <div className="relative z-10 mt-auto flex flex-col gap-4 pb-8">
          <Feature>Option-chain execution with discipline gates</Feature>
          <Feature>Daily scorecards for violations and streaks</Feature>
          <Feature>Journal and analytics built around repeatable process</Feature>
        </div>
      </aside>

      <section className="flex flex-1 items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-[360px] animate-in">
          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#714B67] text-white"><TrendingUp size={17} /></div>
              <span className="sf-serif text-xl font-bold text-[var(--text)]">StrikeFluency</span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="sf-serif text-3xl font-bold leading-tight text-[var(--text)]">Welcome back</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Log in to continue to your trading dashboard</p>
          </div>

          <form noValidate onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="sf-label">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={17} />
                <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} className="sf-input pl-10" placeholder="name@example.com" />
              </div>
              {errors.email && <p id="email-error" className="mt-1.5 text-xs text-[#dc2626]">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="sf-label">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={17} />
                <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} className="sf-input pl-10 pr-11" placeholder="Enter your password" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--primary)]">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && <p id="password-error" className="mt-1.5 text-xs text-[#dc2626]">{errors.password}</p>}
            </div>

            <div className="flex items-center justify-between gap-4">
              <label htmlFor="rememberMe" className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
                <input id="rememberMe" type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-4 w-4 rounded border-[var(--border)] accent-[#714B67]" />
                Remember me
              </label>
              <a href="#forgot-password" className="rounded-lg text-sm font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)]">Forgot password?</a>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="sf-btn-primary min-h-10 w-full">
              {loading ? 'Signing in...' : 'Log in'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)]">Sign up</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
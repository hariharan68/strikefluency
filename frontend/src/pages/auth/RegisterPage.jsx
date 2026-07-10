import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Archive, Check, Eye, EyeOff, Folder, Lock, Mail, Star, TrendingUp, User } from 'lucide-react'
import { useRegister } from '../../hooks/useAuth'

function Step({ icon: Icon, title, text }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#714B67]/22 text-[#E9D6E4]">
        <Icon size={17} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#B7BAC8]">{text}</p>
      </div>
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
    submit(fullName.trim(), email.trim(), password)
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
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C4A0BA]">Start disciplined practice</p>
          <h1 className="sf-serif text-4xl font-bold leading-tight text-white">Build your virtual trading desk today.</h1>
          <p className="mt-5 text-base leading-7 text-[#B7BAC8]">
            Create an account, start with virtual capital, and let every order pass through your rule system.
          </p>
        </div>

        <div className="relative z-10 mt-auto flex flex-col gap-5 pb-8">
          <Step icon={Archive} title="Practice safely" text="Trade NIFTY, BANKNIFTY, and SENSEX options with simulated capital." />
          <Step icon={Folder} title="Organize every session" text="Keep your journal, violations, and daily performance in one workspace." />
          <Step icon={Star} title="Improve the process" text="Use discipline score and analytics to find repeatable habits." />
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
            <h2 className="sf-serif text-3xl font-bold leading-tight text-[var(--text)]">Create your account</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Start your virtual trading dashboard</p>
          </div>

          <form noValidate onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="fullName" className="sf-label">Full name</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={17} />
                <input id="fullName" type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? 'fullName-error' : undefined} className="sf-input pl-10" placeholder="Your full name" />
              </div>
              {errors.fullName && <p id="fullName-error" className="mt-1.5 text-xs text-[#dc2626]">{errors.fullName}</p>}
            </div>

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
                <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} className="sf-input pl-10 pr-11" placeholder="Create a password" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--primary)]">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && <p id="password-error" className="mt-1.5 text-xs text-[#dc2626]">{errors.password}</p>}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="sf-label">Confirm password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={17} />
                <input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" aria-invalid={!!errors.confirmPassword} aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined} className="sf-input pl-10 pr-11" placeholder="Confirm your password" />
                <button type="button" onClick={() => setShowConfirmPassword((current) => !current)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--primary)]">
                  {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.confirmPassword && <p id="confirmPassword-error" className="mt-1.5 text-xs text-[#dc2626]">{errors.confirmPassword}</p>}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="sf-btn-primary min-h-10 w-full">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)]">Log in</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
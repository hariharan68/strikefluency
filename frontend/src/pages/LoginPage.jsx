import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useLogin } from '../hooks/useAuth'

function StatCard({ color, value, label }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-[#FFFFFF] p-4 shadow-lg shadow-black/10">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E4E6EE]">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div>
        <p className="text-lg font-bold leading-tight text-[#1F2233]">{value}</p>
        <p className="text-sm text-[#8A8DA0]">{label}</p>
      </div>
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
    <main className="flex min-h-screen bg-[#F7F8FA] font-['Inter',sans-serif]">
      <aside className="relative hidden min-h-screen w-[45%] flex-col overflow-hidden bg-[#1A1A2E] px-12 py-10 md:flex">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6C5CE7] text-white">
            <Check size={18} strokeWidth={3} />
          </div>
          <span className="text-xl font-bold text-white">StrikeFluency</span>
        </div>

        <div className="relative z-10 mt-28 max-w-md">
          <h1 className="text-4xl font-bold leading-tight text-white">Trade with clarity</h1>
          <p className="mt-4 text-base leading-7 text-gray-400">
            Review performance, track discipline, and sharpen every trading decision from one focused dashboard.
          </p>
        </div>

        <div className="relative z-10 mt-auto flex max-w-sm flex-col gap-4 pb-8">
          <StatCard color="#2ECC87" value="63%" label="Win Rate" />
          <StatCard color="#6C5CE7" value="$7,674.45" label="Net P&L" />
          <StatCard color="#6C5CE7" value="30" label="Trades Logged" />
        </div>

        <div className="pointer-events-none absolute -right-28 -top-28 z-0 h-72 w-72 rounded-full bg-[#211F3D]" />
        <div className="pointer-events-none absolute -bottom-24 left-10 z-0 h-56 w-56 rounded-full bg-[#211F3D]" />
      </aside>

      <section className="flex flex-1 items-center justify-center p-6 md:w-[55%]">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h2 className="text-[28px] font-bold leading-tight text-[#1F2233]">Welcome back</h2>
            <p className="mt-2 text-sm text-[#8A8DA0]">Log in to continue to your dashboard</p>
          </div>

          <form noValidate onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#1F2233]">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8DA0]" size={18} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className={`min-h-[44px] w-full rounded-lg border bg-[#FFFFFF] py-3 pl-10 pr-3 text-sm text-[#1F2233] transition-colors placeholder:text-[#8A8DA0] focus:outline-none focus:ring-2 focus:ring-[#6C5CE7] ${errors.email ? 'border-[#F0616D]' : 'border-[#E4E6EE]'}`}
                  placeholder="name@example.com"
                />
              </div>
              {errors.email && <p id="email-error" className="mt-1.5 text-xs text-[#F0616D]">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-[#1F2233]">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8DA0]" size={18} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className={`min-h-[44px] w-full rounded-lg border bg-[#FFFFFF] py-3 pl-10 pr-11 text-sm text-[#1F2233] transition-colors placeholder:text-[#8A8DA0] focus:outline-none focus:ring-2 focus:ring-[#6C5CE7] ${errors.password ? 'border-[#F0616D]' : 'border-[#E4E6EE]'}`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 flex min-h-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-[#8A8DA0] transition-colors hover:text-[#1F2233] focus:outline-none focus:ring-2 focus:ring-[#6C5CE7]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p id="password-error" className="mt-1.5 text-xs text-[#F0616D]">{errors.password}</p>}
            </div>

            <div className="flex items-center justify-between gap-4">
              <label htmlFor="rememberMe" className="flex cursor-pointer items-center gap-2 text-sm text-[#8A8DA0]">
                <input
                  id="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-[#E4E6EE] accent-[#6C5CE7] focus:outline-none focus:ring-2 focus:ring-[#6C5CE7]"
                />
                Remember me
              </label>
              <a href="#forgot-password" className="rounded-lg text-sm font-medium text-[#6C5CE7] hover:text-[#5A4BD4] focus:outline-none focus:ring-2 focus:ring-[#6C5CE7]">
                Forgot password?
              </a>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[#F0616D]/30 bg-[#F0616D]/10 px-3 py-2 text-xs leading-5 text-[#F0616D]">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] w-full rounded-lg bg-[#6C5CE7] py-3 text-sm font-medium text-white transition-colors hover:bg-[#5A4BD4] focus:outline-none focus:ring-2 focus:ring-[#6C5CE7] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-[#E4E6EE]" />
            <span className="text-sm text-[#8A8DA0]">or</span>
            <div className="h-px flex-1 bg-[#E4E6EE]" />
          </div>

          <button
            type="button"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[#E4E6EE] bg-[#FFFFFF] py-3 text-sm font-medium text-[#1F2233] transition-colors hover:bg-[#F7F8FA] focus:outline-none focus:ring-2 focus:ring-[#6C5CE7] focus:ring-offset-2"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#E4E6EE] text-xs font-bold text-[#1F2233]">
              G
            </span>
            Continue with Google
          </button>

          <p className="mt-8 text-center text-sm text-[#8A8DA0]">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="rounded-lg font-medium text-[#6C5CE7] hover:text-[#5A4BD4] focus:outline-none focus:ring-2 focus:ring-[#6C5CE7]">
              Sign up
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}

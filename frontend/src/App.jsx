import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Component, lazy, Suspense, useEffect, useLayoutEffect } from 'react'
import { ToastProvider } from './components/common/Toast'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import AdminRoute from './components/layout/AdminRoute'
import { restoreSession } from './api/session'
import useAuthStore, { getAccessToken } from './store/authStore'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const ProductPage = lazy(() => import('./pages/marketing/ProductPage'))
const DisciplineInfoPage = lazy(() => import('./pages/marketing/DisciplineInfoPage'))
const ScopePage = lazy(() => import('./pages/marketing/ScopePage'))
const DocsPage = lazy(() => import('./pages/marketing/DocsPage'))
const DocsLayout = lazy(() => import('./components/docs/DocsLayout'))
const VarsityPage = lazy(() => import('./pages/marketing/VarsityPage'))
const PricingPage = lazy(() => import('./pages/marketing/PricingPage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const OAuthCallbackPage = lazy(() => import('./pages/auth/OAuthCallbackPage'))
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const Terminal1Page = lazy(() => import('./pages/terminal/Terminal1Page'))
const PositionsPage = lazy(() => import('./pages/positions/PositionsPage'))
const StrategyBuilderPage = lazy(() => import('./pages/strategy/StrategyBuilderPage'))
const OptionChainPage = lazy(() => import('./pages/optionchain/OptionChainPage'))
const ToolsPage = lazy(() => import('./pages/tools/ToolsPage'))
const TradingDeskPage = lazy(() => import('./pages/trading/TradingDeskPage'))
const DisciplinePage = lazy(() => import('./pages/discipline/DisciplinePage'))
const DisciplineModePage = lazy(() => import('./pages/discipline/DisciplineModePage'))
const JournalPage = lazy(() => import('./pages/journal/JournalPage'))
const AnalyticsPage = lazy(() => import('./pages/analytics/AnalyticsPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))
const ApiKeyPage = lazy(() => import('./pages/account/ApiKeyPage'))
const ConsolePage = lazy(() => import('./pages/console/ConsolePage'))
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'))

// Deduped so a single page load restores the session with exactly ONE
// /auth/refresh call. React.StrictMode double-invokes effects in dev, and our
// refresh tokens are single-use (rotated per call): a second concurrent refresh
// presents an already-rotated token, gets a 401, and its catch would wipe the
// session the first call just restored — logging the user out on reload. This
// module-scoped promise is created once per page load (the module re-imports on
// a real reload), so both effect invocations share the same result.
// The promise itself now lives in api/session.js so the OAuth callback page can
// share it instead of starting a second, racing refresh.

function AuthBootstrap() {
  const setAuth = useAuthStore(s => s.setAuth)
  const clearAuth = useAuthStore(s => s.clearAuth)
  const setInitialized = useAuthStore(s => s.setInitialized)

  useEffect(() => {
    let active = true
    restoreSession()
      .then(({ user, token }) => { if (active) setAuth(user, token) })
      .catch(() => {
        // A user may complete a manual login while the initial cookie refresh
        // is still in flight. Never let that older request clear the fresh
        // authenticated session when it eventually fails or times out.
        if (active && !getAccessToken()) clearAuth()
      })
      .finally(() => { if (active) setInitialized(true) })
    return () => { active = false }
  }, [setAuth, clearAuth, setInitialized])

  // A page restored from the browser's back-forward cache (Back button after
  // logout, reopened tab) does NOT re-run React, so a stale protected page can
  // show. Force a full reload so auth is re-validated against the server.
  useEffect(() => {
    const onPageShow = (e) => { if (e.persisted) window.location.reload() }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  return null
}

// Without a boundary, any render error unmounts the whole tree and leaves a
// blank page (the body background). Show a recoverable message instead.
class AppErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('App crashed:', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--text)', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 16, lineHeight: 1.6 }}>
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button className="sf-btn-primary" style={{ height: 40, padding: '0 20px' }}
            onClick={() => { this.setState({ error: null }); window.location.href = '/dashboard' }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }
}

// Scrolls back to the top on every navigation (window scroll for marketing
// pages, and the app's scroll container when present). Runs before paint so the
// new page never flashes at the previous scroll position.
function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('.sf-page-content')?.scrollTo(0, 0)
  }, [pathname])
  return null
}

// Wraps public/marketing pages so each navigation re-runs the enter animation.
// Keyed by pathname so React remounts the page and the CSS keyframe replays.
function PublicTransitionLayout() {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="sf-route-transition">
      <Outlet />
    </div>
  )
}

function RouteLoadingFallback() {
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
        color: 'var(--text-muted)',
        fontSize: 12,
      }}
    >
      Loading StrikeFluency…
    </main>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppErrorBoundary>
        <AuthBootstrap />
        <ScrollToTop />
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route element={<PublicTransitionLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/product" element={<ProductPage />} />
              <Route path="/discipline-engine" element={<DisciplineInfoPage />} />
              <Route path="/scope" element={<ScopePage />} />
              <Route path="/varsity" element={<VarsityPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth/oauth-callback" element={<OAuthCallbackPage />} />
            </Route>
            {/* Docs sits outside PublicTransitionLayout: that layout is keyed by
                pathname and would remount the whole shell on every page click. */}
            <Route path="/docs" element={<DocsLayout />}>
              <Route index element={<DocsPage />} />
              <Route path=":slug" element={<DocsPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/terminal-1" element={<Terminal1Page />} />
                <Route path="/positions" element={<PositionsPage />} />
                <Route path="/option-chain" element={<OptionChainPage />} />
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/trading" element={<TradingDeskPage />} />
                <Route path="/strategy-builder" element={<StrategyBuilderPage />} />
                <Route path="/discipline" element={<DisciplinePage />} />
                <Route path="/discipline-mode" element={<DisciplineModePage />} />
                <Route path="/journal" element={<JournalPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* Role-guarded: a non-admin is redirected rather than
                    shown a page that 403s on every request. */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminPage />} />
                </Route>
                <Route path="/api-key" element={<ApiKeyPage />} />
                <Route path="/console" element={<ConsolePage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </ToastProvider>
  )
}

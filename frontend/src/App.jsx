import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { ToastProvider } from './components/common/Toast'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LandingPage from './pages/LandingPage'
import ProductPage from './pages/marketing/ProductPage'
import DisciplineInfoPage from './pages/marketing/DisciplineInfoPage'
import ScopePage from './pages/marketing/ScopePage'
import DocsPage from './pages/marketing/DocsPage'
import BlogPage from './pages/marketing/BlogPage'
import VarsityPage from './pages/marketing/VarsityPage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import OAuthCallbackPage from './pages/auth/OAuthCallbackPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import Terminal1Page from './pages/terminal/Terminal1Page'
import StrategyBuilderPage from './pages/strategy/StrategyBuilderPage'
import OptionChainPage from './pages/optionchain/OptionChainPage'
import TradingDeskPage from './pages/trading/TradingDeskPage'
import DisciplinePage from './pages/discipline/DisciplinePage'
import DisciplineModePage from './pages/discipline/DisciplineModePage'
import JournalPage from './pages/journal/JournalPage'
import AnalyticsPage from './pages/analytics/AnalyticsPage'
import SettingsPage from './pages/settings/SettingsPage'
import * as authApi from './api/auth'
import useAuthStore, { getAccessToken } from './store/authStore'

// Deduped so a single page load restores the session with exactly ONE
// /auth/refresh call. React.StrictMode double-invokes effects in dev, and our
// refresh tokens are single-use (rotated per call): a second concurrent refresh
// presents an already-rotated token, gets a 401, and its catch would wipe the
// session the first call just restored — logging the user out on reload. This
// module-scoped promise is created once per page load (the module re-imports on
// a real reload), so both effect invocations share the same result.
let sessionRestore = null

function AuthBootstrap() {
  const setAuth = useAuthStore(s => s.setAuth)
  const clearAuth = useAuthStore(s => s.clearAuth)
  const setInitialized = useAuthStore(s => s.setInitialized)

  useEffect(() => {
    if (!sessionRestore) {
      sessionRestore = authApi.refresh()
        .then(() => authApi.getMe())
        .then(({ data }) => ({ user: data, token: getAccessToken() }))
    }
    let active = true
    sessionRestore
      .then(({ user, token }) => { if (active) setAuth(user, token) })
      .catch(() => { if (active) clearAuth() })
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

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthBootstrap />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/product" element={<ProductPage />} />
          <Route path="/discipline-engine" element={<DisciplineInfoPage />} />
          <Route path="/scope" element={<ScopePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/varsity" element={<VarsityPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/oauth-callback" element={<OAuthCallbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/terminal-1" element={<Terminal1Page />} />
              <Route path="/strategy-builder" element={<StrategyBuilderPage />} />
              <Route path="/option-chain" element={<OptionChainPage />} />
              <Route path="/trading" element={<TradingDeskPage />} />
              <Route path="/discipline" element={<DisciplinePage />} />
              <Route path="/discipline-mode" element={<DisciplineModePage />} />
              <Route path="/journal" element={<JournalPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

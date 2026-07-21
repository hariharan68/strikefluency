import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { getStatus } from '../../api/market'
import useMarketStore from '../../store/marketStore'
import usePreferencesStore from '../../store/preferencesStore'
import useMarketWebSocket from '../../hooks/useMarketWebSocket'

const STORAGE_KEY = 'sf_sidebar_collapsed'

export default function AppLayout() {
  const setMarketStatus = useMarketStore(s => s.setMarketStatus)
  const loadPrefs = usePreferencesStore(s => s.load)
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')

  // Live market data streams app-wide from here (single mount point for all
  // protected routes) into marketStore — the Trade desk chain updates without
  // a manual instrument change.
  useMarketWebSocket()

  useEffect(() => {
    const fetch = () => getStatus().then(r => setMarketStatus(r.data.is_open)).catch(() => {})
    fetch()
    loadPrefs()
    // The WS pushes `market_status` every 3s (even off-hours); this poll is
    // purely a fallback for when the socket is down or stale.
    const t = setInterval(() => {
      const { statusAt } = useMarketStore.getState()
      if (!statusAt || Date.now() - statusAt > 45000) fetch()
    }, 30000)
    return () => clearInterval(t)
  }, [])

  const toggle = () => setCollapsed(prev => {
    const next = !prev
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    return next
  })

  return (
    <div className={`sf-app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar />
      <button
        type="button"
        className="sf-sidebar-toggle"
        onClick={toggle}
        aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
      <div className="sf-main-shell">
        <TopBar />
        <main className="sf-page-content">
          <div key={pathname} className="sf-route-transition">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { getStatus } from '../../api/market'
import useMarketStore from '../../store/marketStore'

const STORAGE_KEY = 'sf_sidebar_collapsed'

export default function AppLayout() {
  const setMarketStatus = useMarketStore(s => s.setMarketStatus)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')

  useEffect(() => {
    const fetch = () => getStatus().then(r => setMarketStatus(r.data.is_open)).catch(() => {})
    fetch()
    const t = setInterval(fetch, 30000)
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
          <Outlet />
        </main>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { getStatus } from '../../api/market'
import useMarketStore from '../../store/marketStore'

export default function AppLayout() {
  const setMarketStatus = useMarketStore(s => s.setMarketStatus)

  useEffect(() => {
    const fetch = () => getStatus().then(r => setMarketStatus(r.data.is_open)).catch(() => {})
    fetch()
    const t = setInterval(fetch, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="sf-app-shell">
      <Sidebar />
      <div className="sf-main-shell">
        <TopBar />
        <main className="sf-page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
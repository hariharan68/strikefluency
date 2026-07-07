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
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: 220 }}>
        <TopBar />
        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

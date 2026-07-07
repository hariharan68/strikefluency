import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useMarketStore from '../../store/marketStore'
import { ChevronDown } from 'lucide-react'

const PAGE_TITLES = {
  '/dashboard':  'Overview',
  '/trading':    'Trading Desk',
  '/journal':    'Trade Journal',
  '/analytics':  'Analytics',
  '/discipline': 'Discipline Center',
  '/settings':   'Settings',
}

export default function TopBar() {
  const location = useLocation()
  const isMarketOpen = useMarketStore(s => s.isMarketOpen)
  const title = PAGE_TITLES[location.pathname] || 'StrikeFluency'

  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
    }) + ' IST')
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header style={{
      height: 52, background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', gap: 16,
      position: 'sticky', top: 0, zIndex: 30, flexShrink: 0
    }}>
      {/* Page title dropdown — like "Custom Dashboard List ↕" in reference */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <span style={{ color: '#1e293b', fontSize: 14, fontWeight: 600 }}>{title}</span>
        <ChevronDown size={14} color="#94a3b8" />
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: '#e2e8f0' }} />

      {/* Overview Type — secondary selector like in reference */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', color: '#64748b', fontSize: 13 }}>
        Overview Type
        <ChevronDown size={13} color="#94a3b8" />
      </div>

      <div style={{ flex: 1 }} />

      {/* Market status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 20,
        background: isMarketOpen ? '#dcfce7' : '#fee2e2',
        border: `1px solid ${isMarketOpen ? '#bbf7d0' : '#fecaca'}`,
      }}>
        <div className={isMarketOpen ? 'blink' : ''} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isMarketOpen ? '#16a34a' : '#dc2626'
        }} />
        <span style={{
          color: isMarketOpen ? '#15803d' : '#b91c1c',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.04em'
        }}>
          {isMarketOpen ? 'Market Open' : 'Market Closed'}
        </span>
      </div>

      {/* IST Clock */}
      <div className="num" style={{ color: '#94a3b8', fontSize: 12, minWidth: 80, textAlign: 'right' }}>
        {time}
      </div>
    </header>
  )
}

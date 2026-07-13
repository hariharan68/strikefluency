import { useState, useEffect, useRef } from 'react'
import useMarketStore from '../store/marketStore'
import useAuthStore, { getAccessToken } from '../store/authStore'

export default function useMarketWebSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const setOptionChain = useMarketStore(s => s.setOptionChain)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    function connect() {
      if (cancelled) return
      // The server authenticates the socket before accepting it; browsers
      // can't send Authorization headers on a WS upgrade, so the access
      // token travels as a query parameter instead.
      const token = getAccessToken()
      if (!token) {
        reconnectRef.current = setTimeout(connect, 1500)
        return
      }
      try {
        const ws = new WebSocket(`ws://localhost:8000/api/v1/market/ws?token=${encodeURIComponent(token)}`)
        wsRef.current = ws
        ws.onopen = () => setIsConnected(true)
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            if (msg.type === 'option_chain') setOptionChain(msg.data)
          } catch {}
        }
        ws.onclose = () => {
          setIsConnected(false)
          // Reconnect fetches a fresh token — a 5-minute access token may
          // have rotated since the last attempt.
          if (!cancelled) reconnectRef.current = setTimeout(connect, 3000)
        }
        ws.onerror = () => ws.close()
      } catch {}
    }

    connect()
    return () => {
      cancelled = true
      clearTimeout(reconnectRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [isAuthenticated])

  return { isConnected }
}

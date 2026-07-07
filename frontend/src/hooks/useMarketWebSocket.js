import { useState, useEffect, useRef } from 'react'
import useMarketStore from '../store/marketStore'

export default function useMarketWebSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const setOptionChain = useMarketStore(s => s.setOptionChain)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)

  function connect() {
    try {
      const ws = new WebSocket('ws://localhost:8001/api/v1/market/ws')
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
        reconnectRef.current = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    } catch {}
  }

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  return { isConnected }
}

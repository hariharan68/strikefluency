import { useState, useEffect, useRef } from 'react'
import useMarketStore from '../store/marketStore'
import useAuthStore, { getAccessToken } from '../store/authStore'

// Reconnect backoff — grows exponentially with jitter, capped so a long outage
// doesn't leave the desk stale for minutes.
const RECONNECT_BASE_MS = 1000
const RECONNECT_CAP_MS = 15000
// Heartbeat: ping the server on this cadence; the server replies with an `ack`,
// which also refreshes the staleness watchdog even outside market hours (when no
// option_chain frames flow). If nothing arrives for STALE_LIMIT, the socket is
// treated as half-open (a dropped connection that never fired `onclose`) and
// force-closed to trigger a reconnect.
const PING_INTERVAL_MS = 15000
const STALE_LIMIT_MS = 30000

// Build the WS URL from the same origin the REST client uses. Derives ws/wss
// from the scheme (so HTTPS deployments get wss) instead of a hardcoded host.
function buildWsUrl(token) {
  const configured = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
  const httpBase = configured || `${window.location.origin}/api/v1`
  const wsBase = httpBase.replace(/^http/i, 'ws') // http→ws, https→wss
  return `${wsBase}/market/ws?token=${encodeURIComponent(token)}`
}

export default function useMarketWebSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const setOptionChain = useMarketStore(s => s.setOptionChain)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)
  const attemptsRef = useRef(0)
  const heartbeatRef = useRef(null)
  const lastMsgRef = useRef(0)

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    function scheduleReconnect(connect) {
      if (cancelled) return
      const backoff = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** attemptsRef.current)
      const jitter = Math.random() * 0.3 * backoff
      attemptsRef.current += 1
      reconnectRef.current = setTimeout(connect, backoff + jitter)
    }

    function stopHeartbeat() {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }

    function startHeartbeat(ws) {
      stopHeartbeat()
      lastMsgRef.current = Date.now()
      heartbeatRef.current = setInterval(() => {
        // Half-open detection: no frame (data OR ack) for too long → recycle.
        if (Date.now() - lastMsgRef.current > STALE_LIMIT_MS) {
          ws.close()
          return
        }
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send('ping') } catch {}
        }
      }, PING_INTERVAL_MS)
    }

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
        const ws = new WebSocket(buildWsUrl(token))
        wsRef.current = ws
        ws.onopen = () => {
          setIsConnected(true)
          attemptsRef.current = 0   // clean connection resets the backoff
          startHeartbeat(ws)
        }
        ws.onmessage = (e) => {
          lastMsgRef.current = Date.now()   // any frame keeps the socket alive
          try {
            const msg = JSON.parse(e.data)
            if (msg.type === 'option_chain') setOptionChain(msg.data)
          } catch {}
        }
        ws.onclose = () => {
          setIsConnected(false)
          stopHeartbeat()
          // Reconnect fetches a fresh token — a 5-minute access token may
          // have rotated since the last attempt.
          if (!cancelled) scheduleReconnect(connect)
        }
        ws.onerror = () => ws.close()
      } catch {
        if (!cancelled) scheduleReconnect(connect)
      }
    }

    connect()
    return () => {
      cancelled = true
      clearTimeout(reconnectRef.current)
      stopHeartbeat()
      if (wsRef.current) wsRef.current.close()
    }
  }, [isAuthenticated])

  return { isConnected }
}

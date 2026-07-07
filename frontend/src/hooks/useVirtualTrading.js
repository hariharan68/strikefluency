import { useState } from 'react'
import * as tradingApi from '../api/trading'
import useTradingStore from '../store/tradingStore'
import { useToast } from '../components/common/Toast'

export default function useVirtualTrading() {
  const { setAccount, setPositions, setOrders, setSession } = useTradingStore()
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)

  const loadAccount = async () => {
    try {
      const r = await tradingApi.getAccount()
      setAccount(r.data)
    } catch {}
  }

  const loadPositions = async () => {
    try {
      const r = await tradingApi.getPositions()
      setPositions(r.data.positions || r.data || [])
    } catch {}
  }

  const loadSession = async () => {
    try {
      const r = await tradingApi.getSession()
      setSession(r.data)
    } catch {}
  }

  const submitOrder = async (data) => {
    setLoading(true)
    try {
      const r = await tradingApi.placeOrder(data)
      success('Order placed successfully!')
      await Promise.all([loadAccount(), loadPositions()])
      return r.data
    } finally {
      setLoading(false)
    }
  }

  const closePosition = async (orderId) => {
    setLoading(true)
    try {
      const r = await tradingApi.closeOrder(orderId)
      const pnl = r.data.net_pnl
      success(`Position closed. P&L: ₹${Number(pnl).toFixed(2)}`)
      await Promise.all([loadAccount(), loadPositions()])
      return r.data
    } finally {
      setLoading(false)
    }
  }

  return { loadAccount, loadPositions, loadSession, submitOrder, closePosition, loading }
}

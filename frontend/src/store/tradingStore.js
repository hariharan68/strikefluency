import { create } from 'zustand'

const useTradingStore = create((set) => ({
  account: null,
  positions: [],
  orders: [],
  session: null,
  setAccount: (account) => set({ account }),
  setPositions: (positions) => set({ positions }),
  setOrders: (orders) => set({ orders }),
  setSession: (session) => set({ session })
}))

export default useTradingStore

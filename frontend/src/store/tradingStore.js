import { create } from 'zustand'

const useTradingStore = create((set) => ({
  account: null,
  positions: [],
  orders: [],
  session: null,
  // Bumped by WS `trading_update` frames (order placed/closed, auto-exit,
  // strategy executed/squared-off). Pages subscribe to eventSeq and re-run
  // their REST loaders — notify-then-refetch, REST stays the source of truth.
  eventSeq: 0,
  lastEvent: null,
  setAccount: (account) => set({ account }),
  setPositions: (positions) => set({ positions }),
  setOrders: (orders) => set({ orders }),
  setSession: (session) => set({ session }),
  bumpEvent: (reason) => set((s) => ({
    eventSeq: s.eventSeq + 1,
    lastEvent: { seq: s.eventSeq + 1, reason, ts: Date.now() },
  })),
}))

export default useTradingStore

import { create } from 'zustand'

const useMarketStore = create((set) => ({
  // The scheduler broadcasts NIFTY, BANKNIFTY and SENSEX on every tick, so a
  // single slot would get clobbered by whichever arrived last. Key by instrument
  // and let consumers select the one they're showing.
  chains: {},
  optionChain: null,   // last received — kept for existing single-value reads
  spotPrice: 0,
  atmStrike: 0,
  isMarketOpen: false,
  // lastUpdate tracks CHAIN frames only — the Positions "LIVE" badge keys off
  // it, and status frames flow even when the market is closed.
  lastUpdate: null,
  // WS-pushed market status / option metrics / analytics chains, each stamped
  // with an arrival time so consumers can fall back to REST when stale.
  status: null,
  statusAt: null,
  metrics: {},    // { [instrument]: { data, at } }
  analytics: {},  // { [instrument]: { data, at } }
  setOptionChain: (data) => set((state) => ({
    chains: data?.instrument ? { ...state.chains, [data.instrument]: data } : state.chains,
    optionChain: data,
    spotPrice: data?.spot_price ?? state.spotPrice,
    atmStrike: data?.atm_strike ?? state.atmStrike,
    lastUpdate: Date.now(),
  })),
  setMarketStatus: (isOpen) => set({ isMarketOpen: isOpen }),
  setStatus: (data) => set({ status: data, isMarketOpen: !!data?.is_open, statusAt: Date.now() }),
  setMetrics: (instrument, data) => set((state) => ({
    metrics: { ...state.metrics, [instrument]: { data, at: Date.now() } },
  })),
  setAnalytics: (instrument, data) => set((state) => ({
    analytics: { ...state.analytics, [instrument]: { data, at: Date.now() } },
  })),
}))

export default useMarketStore

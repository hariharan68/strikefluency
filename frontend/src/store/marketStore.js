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
  lastUpdate: null,
  setOptionChain: (data) => set((state) => ({
    chains: data?.instrument ? { ...state.chains, [data.instrument]: data } : state.chains,
    optionChain: data,
    spotPrice: data?.spot_price ?? state.spotPrice,
    atmStrike: data?.atm_strike ?? state.atmStrike,
    lastUpdate: Date.now(),
  })),
  setMarketStatus: (isOpen) => set({ isMarketOpen: isOpen })
}))

export default useMarketStore

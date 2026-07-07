import { create } from 'zustand'

const useMarketStore = create((set) => ({
  optionChain: null,
  spotPrice: 0,
  atmStrike: 0,
  isMarketOpen: false,
  lastUpdate: null,
  setOptionChain: (data) => set({
    optionChain: data,
    spotPrice: data.spot_price,
    atmStrike: data.atm_strike,
    lastUpdate: Date.now()
  }),
  setMarketStatus: (isOpen) => set({ isMarketOpen: isOpen })
}))

export default useMarketStore

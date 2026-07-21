import { create } from 'zustand'
import { getSettings, updateSettings } from '../api/settings'

// Mirrors the server defaults (schemas/user_settings.py) so the UI has a full
// object before the first fetch resolves.
const DEFAULTS = {
  default_instrument: 'NIFTY',
  default_lots: 1,
  confirm_close: true,
  show_risk_warnings: true,
  auto_fill_ltp: true,
  leverage_enabled: true,
  notify_discipline: true,
  notify_cooldown: true,
  notify_daily_loss: true,
  notify_trade_confirm: false,
}

const usePreferencesStore = create((set, get) => ({
  prefs: DEFAULTS,
  loaded: false,

  // Called once from AppLayout after auth. Never throws — falls back to defaults.
  load: async () => {
    try {
      const r = await getSettings()
      set({ prefs: { ...DEFAULTS, ...(r.data || {}) }, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  // Optimistic: apply locally, then persist. Returns the server-confirmed prefs.
  save: async (patch) => {
    const optimistic = { ...get().prefs, ...patch }
    set({ prefs: optimistic })
    const r = await updateSettings(patch)
    const confirmed = { ...DEFAULTS, ...(r.data || {}) }
    set({ prefs: confirmed })
    return confirmed
  },
}))

export default usePreferencesStore

import { create } from 'zustand'

let inMemoryToken = null
let authEpoch = 0

export const getAccessToken = () => inMemoryToken
export const getAuthEpoch = () => authEpoch
export const setAccessToken = (token, epoch = authEpoch) => {
  if (epoch === authEpoch) inMemoryToken = token
}
export const beginLogout = () => {
  authEpoch += 1
  inMemoryToken = null
  return authEpoch
}

// Read the persisted user without letting a corrupt value crash module load.
// A stored literal "undefined" (from JSON.stringify(undefined) being written)
// is not valid JSON, so JSON.parse would throw at evaluation time and blank the
// whole app. Treat any unparseable value as "no user" and clear it.
const readStoredUser = () => {
  const raw = localStorage.getItem('sf_user')
  if (!raw || raw === 'undefined' || raw === 'null') return null
  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem('sf_user')
    return null
  }
}

const useAuthStore = create((set) => ({
  user: readStoredUser(),
  accessToken: null,
  isAuthenticated: false,
  initialized: false,
  setAuth: (user, accessToken) => {
    inMemoryToken = accessToken
    if (user == null) localStorage.removeItem('sf_user')
    else localStorage.setItem('sf_user', JSON.stringify(user))
    set({ user: user ?? null, accessToken, isAuthenticated: true, initialized: true })
  },
  setInitialized: (initialized) => set({ initialized }),
  setUser: (user) => {
    if (user == null) localStorage.removeItem('sf_user')
    else localStorage.setItem('sf_user', JSON.stringify(user))
    set({ user: user ?? null })
  },
  clearAuth: () => {
    beginLogout()
    localStorage.removeItem('sf_user')
    set({ user: null, accessToken: null, isAuthenticated: false, initialized: true })
  }
}))

export default useAuthStore

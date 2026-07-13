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

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('sf_user') || 'null'),
  accessToken: null,
  isAuthenticated: false,
  initialized: false,
  setAuth: (user, accessToken) => {
    inMemoryToken = accessToken
    localStorage.setItem('sf_user', JSON.stringify(user))
    set({ user, accessToken, isAuthenticated: true, initialized: true })
  },
  setInitialized: (initialized) => set({ initialized }),
  clearAuth: () => {
    beginLogout()
    localStorage.removeItem('sf_user')
    set({ user: null, accessToken: null, isAuthenticated: false, initialized: true })
  }
}))

export default useAuthStore

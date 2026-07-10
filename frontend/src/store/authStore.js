import { create } from 'zustand'

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('sf_user') || 'null'),
  accessToken: localStorage.getItem('sf_access_token') || '',
  refreshToken: localStorage.getItem('sf_refresh_token') || '',
  isAuthenticated: !!localStorage.getItem('sf_access_token'),
  setAuth: (user, accessToken, refreshToken = '') => {
    localStorage.setItem('sf_access_token', accessToken)
    localStorage.setItem('sf_user', JSON.stringify(user))
    if (refreshToken) localStorage.setItem('sf_refresh_token', refreshToken)
    set({ user, accessToken, refreshToken, isAuthenticated: true })
  },
  clearAuth: () => {
    localStorage.removeItem('sf_access_token')
    localStorage.removeItem('sf_refresh_token')
    localStorage.removeItem('sf_user')
    set({ user: null, accessToken: '', refreshToken: '', isAuthenticated: false })
  }
}))

export default useAuthStore
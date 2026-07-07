import { create } from 'zustand'

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('sf_user') || 'null'),
  accessToken: localStorage.getItem('sf_access_token') || '',
  isAuthenticated: !!localStorage.getItem('sf_access_token'),
  setAuth: (user, token) => {
    localStorage.setItem('sf_access_token', token)
    localStorage.setItem('sf_user', JSON.stringify(user))
    set({ user, accessToken: token, isAuthenticated: true })
  },
  clearAuth: () => {
    localStorage.removeItem('sf_access_token')
    localStorage.removeItem('sf_user')
    set({ user: null, accessToken: '', isAuthenticated: false })
  }
}))

export default useAuthStore

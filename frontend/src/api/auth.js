import client from './client'
import { refreshAccessToken } from './client'

export const register = (fullName, email, password, rememberMe = true) =>
  client.post('/auth/register', { full_name: fullName, email, password, remember_me: rememberMe })

export const login = (email, password, rememberMe = true) =>
  client.post('/auth/login', { email, password, remember_me: rememberMe })

// Refreshing must also install the returned access token in memory before any
// authenticated follow-up (such as /auth/me). Calling the raw client here
// caused reload bootstrap to rotate the refresh cookie twice and could send
// users back to /login even though their session was valid.
export const refresh = () => refreshAccessToken()
export const getMe = () => client.get('/auth/me')
// payload: { full_name, phone? }. Omit `phone` to leave the stored number
// unchanged; send "" to clear it.
export const updateProfile = (payload) => client.put('/auth/me', payload)
export const changePassword = (currentPassword, newPassword) =>
  client.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword })
export const logout = () => client.post('/auth/logout')
export const logoutAll = () => client.post('/auth/logout-all')
export const getSessions = () => client.get('/auth/sessions')
export const revokeSession = (familyId) => client.delete(`/auth/sessions/${familyId}`)

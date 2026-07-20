import client from './client'

export const register = (fullName, email, password, rememberMe = true) =>
  client.post('/auth/register', { full_name: fullName, email, password, remember_me: rememberMe })

export const login = (email, password, rememberMe = true) =>
  client.post('/auth/login', { email, password, remember_me: rememberMe })

export const refresh = () => client.post('/auth/refresh')
export const getMe = () => client.get('/auth/me')
export const updateProfile = (fullName) => client.put('/auth/me', { full_name: fullName })
export const logout = () => client.post('/auth/logout')
export const logoutAll = () => client.post('/auth/logout-all')
export const getSessions = () => client.get('/auth/sessions')
export const revokeSession = (familyId) => client.delete(`/auth/sessions/${familyId}`)

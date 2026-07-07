import client from './client'

export const register = (fullName, email, password) =>
  client.post('/auth/register', { full_name: fullName, email, password })

export const login = (email, password) => {
  const params = new URLSearchParams()
  params.append('username', email)
  params.append('password', password)
  return client.post('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
}

export const getMe = () => client.get('/auth/me')

export const logout = (refreshToken) =>
  client.post('/auth/logout', { refresh_token: refreshToken })

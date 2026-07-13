import client from './client'

export const getFyersStatus = () => client.get('/auth/fyers/status')
export const getFyersCredentials = () => client.get('/auth/fyers/credentials')
export const saveFyersCredentials = (appId, secretId) => client.post('/auth/fyers/credentials', { app_id: appId, secret_id: secretId })
export const getFyersLogin = () => client.get('/auth/fyers/login')
export const setFyersToken = (accessToken) => client.post('/auth/fyers/token', { access_token: accessToken })
export const exchangeFyersAuthCode = (authCode) => client.post('/auth/fyers/exchange', { auth_code: authCode })
export const clearFyersToken = () => client.delete('/auth/fyers/token')

// Backward-compatible names used by older components.
export const getFyersAuthUrl = getFyersLogin
export const disconnectFyers = clearFyersToken
export const getFyersProfile = () => client.get('/broker/fyers/profile')

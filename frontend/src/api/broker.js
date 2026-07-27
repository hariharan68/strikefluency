import client from './client'

export const getFyersStatus = () => client.get('/auth/fyers/status')
export const getFyersCredentials = () => client.get('/auth/fyers/credentials')
export const saveFyersCredentials = (appId, secretId) => client.post('/auth/fyers/credentials', { app_id: appId, secret_id: secretId })
export const getFyersLogin = () => client.get('/auth/fyers/login')
export const setFyersToken = (accessToken) => client.post('/auth/fyers/token', { access_token: accessToken })
export const exchangeFyersAuthCode = (authCode) => client.post('/auth/fyers/exchange', { auth_code: authCode })
export const clearFyersToken = () => client.delete('/auth/fyers/token')          // Disconnect: drop token, keep creds
export const revokeFyersCredentials = () => client.delete('/auth/fyers/credentials') // Revoke: wipe creds from .env

// Backward-compatible names used by older components.
export const getFyersAuthUrl = getFyersLogin
export const disconnectFyers = clearFyersToken
export const getFyersProfile = () => client.get('/broker/fyers/profile')

// Zerodha Kite Connect (admin-managed shared read-only market-data account).
export const getKiteStatus = () => client.get('/auth/kite/status')
export const getKiteCredentials = () => client.get('/auth/kite/credentials')
export const saveKiteCredentials = (apiKey, apiSecret) =>
  client.post('/auth/kite/credentials', { api_key: apiKey, api_secret: apiSecret })
export const getKiteLogin = () => client.get('/auth/kite/login')
export const clearKiteToken = () => client.delete('/auth/kite/token')
export const revokeKiteCredentials = () => client.delete('/auth/kite/credentials')
export const syncKiteInstruments = () => client.post('/auth/kite/instruments/sync')

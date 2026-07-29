import axios from 'axios'
import useAuthStore, { getAccessToken, getAuthEpoch, setAccessToken } from '../store/authStore'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS)
const requestTimeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 15000
const client = axios.create({
  baseURL: configuredBaseUrl || '/api/v1',
  withCredentials: true,
  timeout: requestTimeout,
})
let refreshPromise = null

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    const epochAtStart = getAuthEpoch()
    refreshPromise = axios.post(`${configuredBaseUrl || '/api/v1'}/auth/refresh`, null, {
      withCredentials: true,
      timeout: requestTimeout,
    })
      .then(({ data }) => {
        setAccessToken(data.access_token, epochAtStart)
        return data.access_token
      })
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

client.interceptors.request.use(config => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config
    const requestUrl = original?.url || ''
    const isAuthRequest = /\/auth\/(login|register|refresh|logout)/.test(requestUrl)
    if (err.response?.status === 401 && !isAuthRequest && original && !original._authRetry) {
      original._authRetry = true
      try {
        await refreshAccessToken()
        original.headers.Authorization = `Bearer ${getAccessToken()}`
        return client(original)
      } catch (_) {
        // Update the store instead of forcing a hard reload. A reload starts
        // AuthBootstrap again with the same failed cookie and previously left
        // protected routes rendering a completely empty page.
        useAuthStore.getState().clearAuth()
      }
    }
    return Promise.reject(err)
  }
)

export { refreshAccessToken }
export default client

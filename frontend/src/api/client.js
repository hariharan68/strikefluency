import axios from 'axios'
import { beginLogout, getAccessToken, getAuthEpoch, setAccessToken } from '../store/authStore'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
const client = axios.create({ baseURL: configuredBaseUrl || '/api/v1', withCredentials: true })
let refreshPromise = null

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    const epochAtStart = getAuthEpoch()
    refreshPromise = axios.post(`${configuredBaseUrl || '/api/v1'}/auth/refresh`, null, { withCredentials: true })
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
        beginLogout()
        localStorage.removeItem('sf_user')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export { refreshAccessToken }
export default client

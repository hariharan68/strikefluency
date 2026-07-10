import axios from 'axios'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
const client = axios.create({ baseURL: configuredBaseUrl || '/api/v1' })

client.interceptors.request.use(config => {
  const token = localStorage.getItem('sf_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  r => r,
  err => {
    const requestUrl = err.config?.url || ''
    const isAuthRequest = requestUrl.startsWith('/auth/login') || requestUrl.startsWith('/auth/register')

    if (err.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('sf_access_token')
      localStorage.removeItem('sf_refresh_token')
      localStorage.removeItem('sf_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
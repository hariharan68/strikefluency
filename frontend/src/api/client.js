import axios from 'axios'

const client = axios.create({ baseURL: 'http://localhost:8001/api/v1' })

client.interceptors.request.use(config => {
  const token = localStorage.getItem('sf_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sf_access_token')
      localStorage.removeItem('sf_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client

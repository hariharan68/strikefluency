import client from './client'
import useAuthStore, { getAccessToken } from '../store/authStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/v1$/, '') || ''

export const oauthStartUrl = (provider, rememberMe = false) =>
  `${API_BASE}/api/v1/oauth/${provider}/start?remember_me=${rememberMe}`

export const confirmOAuthLink = (challengeId, password) =>
  client.post(`/oauth/link/${challengeId}/confirm`, { password })

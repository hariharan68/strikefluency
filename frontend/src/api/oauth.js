import client from './client'

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/v1$/, '') || ''

export const oauthStartUrl = (provider, rememberMe = false, linkChallenge = null) => {
  const params = new URLSearchParams({ remember_me: String(rememberMe) })
  // Present only when this flow exists to re-authenticate an account-link
  // challenge rather than to sign in normally.
  if (linkChallenge) params.set('link_challenge', linkChallenge)
  return `${API_BASE}/api/v1/oauth/${provider}/start?${params}`
}

export const confirmOAuthLink = (challengeId, password) =>
  client.post(`/oauth/link/${challengeId}/confirm`, { password })

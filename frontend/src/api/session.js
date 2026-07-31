import * as authApi from './auth'
import { getAccessToken } from '../store/authStore'

// Refresh tokens are single-use and rotated per call, so exactly one cookie
// refresh may run per page load. Two independent callers would race: the second
// presents an already-rotated token and only survives on the server's short
// reuse grace. AuthBootstrap and OAuthCallbackPage both mount on
// /auth/oauth-callback, so this promise — created once per page load, since the
// module re-imports on a real reload — is what makes them share one refresh.
let sessionRestore = null

export function restoreSession() {
  if (!sessionRestore) {
    sessionRestore = authApi.refresh()
      .then(() => authApi.getMe())
      .then(({ data }) => ({ user: data, token: getAccessToken() }))
  }
  return sessionRestore
}

import { oauthStartUrl } from '../../api/oauth'

// Google's brand asset: these four hexes are prescribed by their branding
// guidelines and are deliberately exempt from the theme-token rule — they are
// not our colours to theme.
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
)

/**
 * Shared "Continue with Google" button for the login and register pages.
 *
 * Styling rides on .sf-btn-outline so hover and colour follow whichever of the
 * four themes is active; only the geometry is overridden here. Do not add JS
 * hover handlers — they cannot see the active theme.
 */
export default function GoogleAuthButton({
  rememberMe = false, label = 'Continue with Google', linkChallenge = null,
}) {
  return (
    <button
      type="button"
      className="sf-btn-outline"
      onClick={() => { window.location.href = oauthStartUrl('google', rememberMe, linkChallenge) }}
      style={{
        width: '100%', height: 50, borderRadius: 14,
        fontSize: 14, fontWeight: 600, color: 'var(--text)', gap: 12,
      }}
    >
      <GoogleIcon />
      {label}
    </button>
  )
}

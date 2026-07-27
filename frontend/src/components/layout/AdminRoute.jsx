import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

// The roles the backend's get_current_active_admin accepts. Kept here so the
// two role checks already duplicating this array (TopBar, SettingsPage) have a
// single place to move to.
export const ADMIN_ROLES = ['tenant_admin', 'super_admin']

export const isAdminRole = (role) => ADMIN_ROLES.includes(role)

/**
 * Route guard for the admin surface.
 *
 * Nests inside ProtectedRoute, so authentication is already settled by the time
 * this runs and only the role question remains.
 *
 * This is a UX guard, not a security boundary — every /admin endpoint is
 * independently enforced by get_current_active_admin, and hiding the link would
 * mean nothing without that. A non-admin who types the URL is sent to the
 * dashboard rather than shown an empty page that 403s on every request.
 */
export default function AdminRoute() {
  const user = useAuthStore(s => s.user)
  const initialized = useAuthStore(s => s.initialized)
  if (!initialized) return null
  return isAdminRole(user?.role) ? <Outlet /> : <Navigate to="/dashboard" replace />
}

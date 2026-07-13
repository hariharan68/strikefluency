import { Navigate, Outlet } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const initialized = useAuthStore(s => s.initialized)
  if (!initialized) return null
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

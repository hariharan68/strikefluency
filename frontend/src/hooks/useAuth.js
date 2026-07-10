import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../api/auth'
import useAuthStore from '../store/authStore'

export function useLogin() {
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  const submit = async (email, password) => {
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.login(email, password)
      setAuth(res.data.user, res.data.access_token, res.data.refresh_token)
      navigate('/dashboard')
    } catch (e) {
      setError(e.response?.data?.detail || e.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return { submit, error, loading }
}

export function useRegister() {
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  const submit = async (fullName, email, password) => {
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.register(fullName, email, password)
      setAuth(res.data.user, res.data.access_token, res.data.refresh_token)
      navigate('/dashboard')
    } catch (e) {
      setError(e.response?.data?.detail || e.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return { submit, error, loading }
}

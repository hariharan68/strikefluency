import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../api/auth'
import useAuthStore from '../store/authStore'
import { getApiErrorMessage } from '../utils/apiError'

export function useLogin() {
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  const submit = async (email, password, rememberMe) => {
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.login(email, password, rememberMe)
      setAuth(res.data.user, res.data.access_token)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(getApiErrorMessage(e, 'Login failed'))
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return { submit, error, loading }
}

export function useRegister() {
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  const submit = async (fullName, email, password, rememberMe) => {
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.register(fullName, email, password, rememberMe)
      setAuth(res.data.user, res.data.access_token)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(getApiErrorMessage(e, 'Registration failed'))
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return { submit, error, loading }
}

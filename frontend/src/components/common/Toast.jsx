import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const add = useCallback((type, message) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const remove = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])
  const success = useCallback((msg) => add('success', msg), [add])
  const error   = useCallback((msg) => add('error', msg), [add])
  const warning = useCallback((msg) => add('warning', msg), [add])

  const configs = {
    success: { icon: <CheckCircle size={16} />, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    error:   { icon: <XCircle size={16} />, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    warning: { icon: <AlertTriangle size={16} />, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  }

  return (
    <ToastContext.Provider value={{ success, error, warning }}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => {
          const c = configs[t.type]
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
              background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 10, minWidth: 260, maxWidth: 380,
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)'
            }}>
              <span style={{ color: c.color, flexShrink: 0 }}>{c.icon}</span>
              <span style={{ color: '#1e293b', fontSize: 13, flex: 1 }}>{t.message}</span>
              <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94a3b8', flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

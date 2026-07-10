import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ isOpen, onClose, title, children, maxWidth = 480 }) {
  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16
    }}>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(17,24,39,0.42)',
          backdropFilter: 'blur(5px)'
        }}
        onClick={onClose}
      />
      <div className="animate-in" style={{
        position: 'relative', zIndex: 1,
        background: 'var(--color-surface)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        width: '100%', maxWidth,
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: 'var(--shadow-pop)'
      }}>
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-light)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 3, height: 18, borderRadius: 99, background: 'var(--primary)' }} />
              <h3 style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="sf-icon-button"
              style={{ width: 32, height: 32 }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div style={{ padding: 22 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
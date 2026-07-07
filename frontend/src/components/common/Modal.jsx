import { X } from 'lucide-react'

export default function Modal({ isOpen, onClose, title, children, maxWidth = 480 }) {
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
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)'
        }}
        onClick={onClose}
      />
      <div style={{
        position: 'relative', zIndex: 1,
        background: '#0e121b',
        border: '1px solid #2b303b',
        borderRadius: 16,
        width: '100%', maxWidth,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)'
      }}>
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid #2b303b'
          }}>
            <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 500, margin: 0 }}>{title}</h3>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <X size={18} color="#99a0ae" />
            </button>
          </div>
        )}
        <div style={{ padding: 24 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 24px', textAlign: 'center'
    }}>
      {icon && (
        <div style={{ marginBottom: 16, opacity: 0.4 }}>
          {icon}
        </div>
      )}
      <p style={{ color: '#99a0ae', fontSize: 15, fontWeight: 500, margin: 0 }}>
        {title || 'No data'}
      </p>
      {subtitle && (
        <p style={{ color: '#717784', fontSize: 13, marginTop: 6, maxWidth: 320 }}>
          {subtitle}
        </p>
      )}
      {action && (
        <div style={{ marginTop: 16 }}>{action}</div>
      )}
    </div>
  )
}

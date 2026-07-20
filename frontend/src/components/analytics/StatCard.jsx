export default function StatCard({ label, value, sub, color = 'var(--primary)', icon: Icon }) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 16,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 10
    }}>
      {Icon && (
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: color + '1a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 4
        }}>
          <Icon size={18} color={color} />
        </div>
      )}
      <div style={{ color: 'var(--text-sub)', fontSize: 13 }}>{label}</div>
      <div style={{ color: typeof value === 'string' ? 'var(--text)' : color, fontSize: 22, fontWeight: 500 }}>
        {value ?? '-'}
      </div>
      {sub && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{sub}</div>}
    </div>
  )
}

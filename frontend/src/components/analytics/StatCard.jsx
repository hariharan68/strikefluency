export default function StatCard({ label, value, sub, color = '#335cff', icon: Icon }) {
  return (
    <div style={{
      background: '#0e121b', border: '1px solid #2b303b', borderRadius: 16,
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
      <div style={{ color: '#99a0ae', fontSize: 13 }}>{label}</div>
      <div style={{ color: typeof value === 'string' ? '#fff' : color, fontSize: 22, fontWeight: 500 }}>
        {value ?? '-'}
      </div>
      {sub && <div style={{ color: '#717784', fontSize: 12 }}>{sub}</div>}
    </div>
  )
}

export default function Select({ label, value, onChange, options = [], error, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ color: '#99a0ae', fontSize: 13, fontWeight: 500 }}>
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        {...rest}
        style={{
          background: '#181b25',
          border: `1px solid ${error ? '#e93544' : '#2b303b'}`,
          borderRadius: 10,
          padding: '10px 14px',
          color: value ? '#fff' : '#717784',
          fontSize: 14,
          fontFamily: 'Inter,sans-serif',
          outline: 'none',
          width: '100%',
          cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2399a0ae' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: 36
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value} style={{ background: '#181b25', color: '#fff' }}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span style={{ color: '#ff6875', fontSize: 12 }}>{error}</span>}
    </div>
  )
}

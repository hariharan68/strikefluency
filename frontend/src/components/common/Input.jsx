export default function Input({ label, error, type = 'text', placeholder, value, onChange, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ color: '#99a0ae', fontSize: 13, fontWeight: 500 }}>
          {label}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        {...rest}
        style={{
          background: '#181b25',
          border: `1px solid ${error ? '#e93544' : '#2b303b'}`,
          borderRadius: 10,
          padding: '10px 14px',
          color: '#fff',
          fontSize: 14,
          fontFamily: 'Inter,sans-serif',
          outline: 'none',
          width: '100%',
          ...(rest.style || {})
        }}
      />
      {error && (
        <span style={{ color: '#ff6875', fontSize: 12 }}>{error}</span>
      )}
    </div>
  )
}

export default function Input({ label, error, type = 'text', placeholder, value, onChange, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label className="sf-label">{label}</label>}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        {...rest}
        className={`sf-input ${rest.className || ''}`.trim()}
        style={{ borderColor: error ? 'var(--loss)' : undefined, ...(rest.style || {}) }}
      />
      {error && <span style={{ color: 'var(--loss)', fontSize: 12 }}>{error}</span>}
    </div>
  )
}
export default function Spinner({ size = 32, centered = true }) {
  const spinner = (
    <div style={{
      width: size,
      height: size,
      border: `3px solid #2b303b`,
      borderTop: `3px solid #335cff`,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }} />
  )

  if (centered) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        width: '100%'
      }}>
        {spinner}
      </div>
    )
  }

  return spinner
}

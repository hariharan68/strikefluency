export default function Spinner({ size = 32, centered = true }) {
  const spinner = (
    <div style={{
      width: size,
      height: size,
      border: `3px solid #E5E7EB`,
      borderTop: `3px solid #714B67`,
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

export default function Badge({ children, color = '#714B67', bg, style = {} }) {
  const bgColor = bg || color + '26'
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 500,
      fontFamily: 'Inter,sans-serif',
      background: bgColor,
      color,
      whiteSpace: 'nowrap',
      ...style
    }}>
      {children}
    </span>
  )
}

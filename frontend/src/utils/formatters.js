export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0.00'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(Number(amount))
}

export function formatPnL(amount) {
  const num = Number(amount)
  const isPositive = num >= 0
  return {
    value: formatCurrency(Math.abs(num)),
    color: isPositive ? '#3ee089' : '#ff6875',
    isPositive,
    signed: (isPositive ? '+' : '-') + formatCurrency(Math.abs(num))
  }
}

export function formatDate(isoString) {
  if (!isoString) return '-'
  const d = new Date(isoString)
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
  )
}

export function formatDuration(minutes) {
  if (!minutes) return '-'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function nearestThursday() {
  const today = new Date()
  const day = today.getDay()
  const daysUntil = (4 - day + 7) % 7 || 7
  const thu = new Date(today)
  thu.setDate(today.getDate() + daysUntil)
  return thu.toISOString().split('T')[0]
}

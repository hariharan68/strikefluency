/**
 * Formatters shared by every chart.
 *
 * These lived inline and unexported inside AdvancedDashboard.jsx, which meant a
 * second consumer had to copy them (DisciplineSections.jsx did exactly that).
 */
import { formatCurrency } from './formatters'

export const asNumber = value => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/**
 * "+₹1,234.00" / "-₹1,234.00".
 *
 * The sign matters more than it looks: the theme's gain/loss hues are only ~4 ΔE
 * apart under red-green colour blindness in the three light themes, so the sign
 * is the secondary encoding that keeps a P&L figure readable without hue.
 */
export const signedMoney = value => {
  const number = asNumber(value)
  if (number === 0) return formatCurrency(0)
  return `${number > 0 ? '+' : '-'}${formatCurrency(Math.abs(number))}`
}

/** "₹6.5K" — compact axis ticks. */
export const compactMoney = value => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(asNumber(value))

/** Same as compactMoney but always carries an explicit sign (bar-end labels). */
export const signedCompactMoney = value => {
  const number = asNumber(value)
  if (number === 0) return compactMoney(0)
  return `${number > 0 ? '+' : '-'}${compactMoney(Math.abs(number))}`
}

/** "20 Jul" from a strict YYYY-MM-DD; anything else passes through unchanged. */
export const dateLabel = value => {
  if (!value) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value)
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

export const percentLabel = (value, digits = 1) => `${asNumber(value).toFixed(digits)}%`

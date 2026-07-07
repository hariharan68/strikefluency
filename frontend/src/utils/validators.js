export const required = v =>
  v !== undefined && v !== null && v !== '' ? null : 'Required'

export const positiveNumber = v =>
  Number(v) > 0 ? null : 'Must be positive'

export const maxValue = (max) => v =>
  Number(v) <= max ? null : `Must be at most ${max}`

export const minValue = (min) => v =>
  Number(v) >= min ? null : `Must be at least ${min}`

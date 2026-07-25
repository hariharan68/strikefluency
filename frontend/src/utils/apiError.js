const locationLabel = (location) => {
  if (!Array.isArray(location)) return ''
  return location
    .filter(part => !['body', 'query', 'path'].includes(String(part)))
    .join('.')
}

export function toDisplayMessage(value, fallback = 'Something went wrong. Please try again.') {
  if (typeof value === 'string') return value.trim() || fallback
  if (value == null) return fallback
  if (value instanceof Error) return toDisplayMessage(value.message, fallback)

  if (Array.isArray(value)) {
    const messages = value
      .map(item => {
        if (item && typeof item === 'object' && typeof item.msg === 'string') {
          const location = locationLabel(item.loc)
          return location ? `${location}: ${item.msg}` : item.msg
        }
        return toDisplayMessage(item, '')
      })
      .filter(Boolean)
    return messages.length ? messages.join('; ') : fallback
  }

  if (typeof value === 'object') {
    for (const key of ['message', 'detail', 'error', 'msg']) {
      if (value[key] != null) return toDisplayMessage(value[key], fallback)
    }
  }

  return fallback
}

export function getApiErrorMessage(error, fallback) {
  const payload = error?.response?.data
  return toDisplayMessage(
    payload?.detail ?? payload?.message ?? error?.message,
    fallback,
  )
}

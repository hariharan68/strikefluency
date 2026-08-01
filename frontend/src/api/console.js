import client from './client'

// Read-only Console API. `params` carries { from, to, instrument, search, page, page_size }
// as needed; from/to are YYYY-MM-DD (IST calendar days).
export const getConsolePnl = (params, signal) => client.get('/console/pnl', { params, signal })
export const getConsoleTrades = (params, signal) => client.get('/console/trades', { params, signal })
export const getConsoleFunds = (params, signal) => client.get('/console/funds', { params, signal })

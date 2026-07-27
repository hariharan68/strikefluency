import client from './client'

export const getAccount = () => client.get('/trading/account')
export const placeOrder = (data) => client.post('/trading/orders', {
  ...data,
  // Axios may replay this exact request after an auth refresh. Generate the ID
  // once before serialization so the backend returns the original order.
  client_order_id: data.client_order_id || crypto.randomUUID(),
})
// scope: 'today' (default — the orderbook resets daily) or 'all' (full history)
export const getOrders = (page = 1, status = null, scope = 'today') =>
  client.get('/trading/orders', { params: { page, scope, ...(status ? { status } : {}) } })
export const getTradebook = (page = 1, scope = 'today') =>
  client.get('/trading/tradebook', { params: { page, scope } })
export const closeOrder = (orderId) => client.post(`/trading/orders/${orderId}/close`)

// ── Resting LIMIT orders ──
// A limit order does NOT open a position: it parks in the pending book until
// the premium reaches the limit, then the backend fills it into a real order.
export const placePendingOrder = (data) => client.post('/trading/pending', {
  ...data,
  client_order_id: data.client_order_id || crypto.randomUUID(),
})
// view: 'all' (default) | 'open' (still resting) | 'executed' (left the book)
export const getPendingOrders = (view = 'all', scope = 'today') =>
  client.get('/trading/pending', { params: { view, scope } })
export const cancelPendingOrder = (pendingId) =>
  client.post(`/trading/pending/${pendingId}/cancel`)
export const getPositions = () => client.get('/trading/positions')
export const getSession = () => client.get('/trading/sessions/today')

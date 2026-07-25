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
export const getPositions = () => client.get('/trading/positions')
export const getSession = () => client.get('/trading/sessions/today')

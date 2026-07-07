import client from './client'

export const getAccount = () => client.get('/trading/account')
export const placeOrder = (data) => client.post('/trading/orders', data)
export const getOrders = (page = 1, status = null) =>
  client.get('/trading/orders', { params: { page, ...(status ? { status } : {}) } })
export const closeOrder = (orderId) => client.post(`/trading/orders/${orderId}/close`)
export const getPositions = () => client.get('/trading/positions')
export const getSession = () => client.get('/trading/sessions/today')

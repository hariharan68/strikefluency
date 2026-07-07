import client from './client'

export const getOptionChain = (instrument = 'NIFTY') =>
  client.get('/market/option-chain', { params: { instrument } })

export const getSpot = (instrument = 'NIFTY') =>
  client.get('/market/spot', { params: { instrument } })

export const getStatus = () => client.get('/market/status')

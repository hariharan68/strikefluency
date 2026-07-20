import client from './client'

const q = (expiry) => (expiry ? { params: { expiry } } : {})

export const getOptionMetrics = (instrument, expiry) => client.get(`/options/${instrument}/metrics`, q(expiry))
export const getOptionChainData = (instrument, expiry) => client.get(`/options/${instrument}/chain`, q(expiry))

import client from './client'

export const getSettings = () => client.get('/settings')
export const updateSettings = (patch) => client.put('/settings', patch)

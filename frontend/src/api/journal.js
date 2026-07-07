import client from './client'

export const getJournal = (page = 1, filters = {}) =>
  client.get('/journal', { params: { page, ...filters } })
export const getEntry = (id) => client.get(`/journal/${id}`)
export const updateEntry = (id, data) => client.put(`/journal/${id}`, data)

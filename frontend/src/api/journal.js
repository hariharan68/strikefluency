import client from './client'

export const getJournal = (page = 1, filters = {}, pageSize = 100) =>
  client.get('/journal', { params: { page, page_size: pageSize, ...filters } })
export const getEntry = (id) => client.get(`/journal/${id}`)
export const updateEntry = (id, data) => client.put(`/journal/${id}`, data)

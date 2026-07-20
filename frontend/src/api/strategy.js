import client from './client'

// ── templates ──
export const getTemplates = (category = null) =>
  client.get('/strategy/templates', { params: category ? { category } : {} })
export const expandTemplate = (templateId, underlying, expiry = null) =>
  client.get(`/strategy/templates/${templateId}/legs`, { params: { underlying, ...(expiry ? { expiry } : {}) } })

// ── live analysis (no persistence) ──
export const analyzeLegs = (payload) => client.post('/strategy/analyze', payload)

// ── drafts ──
export const buildFromTemplate = (data) => client.post('/strategy/from-template', data)
export const createDraft = (data) => client.post('/strategy/draft', data)
export const addLeg = (id, data) => client.post(`/strategy/${id}/legs`, data)
export const removeLeg = (id, legId) => client.delete(`/strategy/${id}/legs/${legId}`)
export const setSetupTag = (id, setup_tag) => client.patch(`/strategy/${id}/setup-tag`, { setup_tag })
export const deleteDraft = (id) => client.delete(`/strategy/${id}`)

// ── lookups ──
export const listStrategies = (status = null, page = 1, page_size = 20) =>
  client.get('/strategy', { params: { page, page_size, ...(status ? { status } : {}) } })
export const getStrategy = (id) => client.get(`/strategy/${id}`)
export const getAnalytics = (id, spot = null) =>
  client.get(`/strategy/${id}/analytics`, { params: spot != null ? { spot } : {} })

// ── execution ──
export const executeStrategy = (id) => client.post(`/strategy/${id}/execute`)
export const closeLeg = (id, legId, exit_ltp = null) =>
  client.post(`/strategy/${id}/legs/${legId}/close`, { exit_ltp })
export const squareOff = (id, reason = 'MANUAL') =>
  client.post(`/strategy/${id}/square-off`, { reason })
export const markToMarket = (id) => client.post(`/strategy/${id}/mark-to-market`)

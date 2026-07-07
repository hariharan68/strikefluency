import client from './client'

export const getSummary = () => client.get('/analytics/summary')
export const getDisciplineTrend = (days = 30) =>
  client.get('/analytics/discipline-trend', { params: { days } })
export const getPnlCurve = () => client.get('/analytics/pnl-curve')
export const getMistakes = () => client.get('/analytics/mistakes')

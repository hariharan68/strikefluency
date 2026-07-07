import client from './client'

export const getRules = () => client.get('/discipline/rules')
export const updateRule = (ruleCode, value) =>
  client.put(`/discipline/rules/${ruleCode}`, { rule_value: value })
export const getScore = () => client.get('/discipline/score')
export const getViolations = (page = 1) =>
  client.get('/discipline/violations', { params: { page } })
export const getTodayViolations = () => client.get('/discipline/violations/today')

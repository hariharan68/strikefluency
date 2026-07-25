import client from './client'

export const getRules = () => client.get('/discipline/rules')
export const updateRule = (ruleCode, changes) =>
  client.put(`/discipline/rules/${ruleCode}`, (
    changes && Object.prototype.hasOwnProperty.call(changes, 'rule_value')
      ? changes
      : { rule_value: changes }
  ))
export const getScore = () => client.get('/discipline/score')
export const getViolations = (limit = 100) =>
  client.get('/discipline/violations', { params: { limit } })
export const getTodayViolations = () => client.get('/discipline/violations/today')
export const getProgress = () => client.get('/discipline/progress')

// Master Discipline Mode switch
export const getMode = () => client.get('/discipline/mode')
export const setMode = (enabled) => client.put('/discipline/mode', { enabled })

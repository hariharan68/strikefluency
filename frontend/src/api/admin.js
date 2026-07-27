import client from './client'

export const getOverview = () => client.get('/admin/overview')

export const getHealth = () => client.get('/admin/health')

export const getAudit = (params = {}) =>
  client.get('/admin/audit', { params })

export const getUsers = (params = {}) =>
  client.get('/admin/users', { params })

export const getLedger = (params = {}) =>
  client.get('/admin/ledger', { params })

export const getSnapshots = (params = {}) =>
  client.get('/admin/snapshots', { params })

// src/services/api.js
// All API calls to the CyberTrail FastAPI backend
// Base URL proxied via Vite to http://localhost:8000

import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})


// Inject JWT token from store into every request
api.interceptors.request.use(config => {
  try {
    const stored = localStorage.getItem('cybertrail-store')
    if (stored) {
      const state = JSON.parse(stored)
      const token = state?.state?.accessToken
      if (token) config.headers.Authorization = `Bearer ${token}`
    }
  } catch {}
  return config
})

// Global error handler — auto logout on 401 session invalidation
api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status
    const msg    = err.response?.data?.detail || err.message || 'Request failed'

    if (status === 401) {
      // Clear auth state and redirect to login
      try {
        const stored = JSON.parse(localStorage.getItem('cybertrail-store') || '{}')
        if (stored?.state?.accessToken) {
          stored.state.accessToken  = null
          stored.state.refreshToken = null
          stored.state.user         = null
          localStorage.setItem('cybertrail-store', JSON.stringify(stored))
        }
      } catch {}
      // Show message and redirect
      toast.error(msg || 'Session expired — please login again')
      setTimeout(() => { window.location.href = '/login' }, 1500)
      return Promise.reject(err)
    }

    toast.error(msg)
    return Promise.reject(err)
  }
)

// ── Crypto Tracer ──────────────────────────────────────
export const traceWallet = (identifier, depth = 2, chain = 'auto') =>
  api.post('/crypto/trace', { identifier, depth, chain, force_refresh: false })

export const getWalletInfo = (address) =>
  api.get(`/crypto/wallet/${address}`)

// ── UPI / Bank Fraud ───────────────────────────────────
export const traceUPI = (identifier, depth = 2) =>
  api.post('/upi/trace', { identifier, depth, identifier_type: 'auto' })

export const ingestCallRecords    = (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/social/ingest-call-records', fd, { headers: { 'Content-Type': 'multipart/form-data' } }) }
export const ingestCompanyData    = (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/shell/ingest-company-data', fd, { headers: { 'Content-Type': 'multipart/form-data' } }) }
export const updateCallRecord    = (data) => api.put('/social/call-record', data)
export const updateDirectorRecord = (data) => api.put('/shell/director-record', data)
export const updateBankTransfer  = (data) => api.put('/upi/bank-transfer', data)
export const deleteCallRecord     = (from_ph, to_ph, rel='CALLED') => api.delete(`/social/call-record?from_ph=${encodeURIComponent(from_ph)}&to_ph=${encodeURIComponent(to_ph)}&rel=${rel}`)
export const deleteAllCallRecords = () => api.delete('/social/call-records/all')
export const deleteDirectorRecord = (din, cin) => api.delete(`/shell/director-record?din=${encodeURIComponent(din)}&cin=${encodeURIComponent(cin)}`)
export const deleteAllCompanyData = () => api.delete('/shell/company-data/all')
export const deleteBankTransfer   = (from_id, to_id, ref='') => api.delete(`/upi/bank-transfer?from_id=${encodeURIComponent(from_id)}&to_id=${encodeURIComponent(to_id)}&ref=${encodeURIComponent(ref)}`)
export const deleteAllBankTransfers = () => api.delete('/upi/bank-transfers/all')
export const getBackupStatus      = () => api.get('/backup/status')
export const exportFullBackup     = (compress=true) => api.get(`/backup/export?compress=${compress}`, { responseType: 'blob' })
export const exportIncrementalBackup = (hours=24) => api.get(`/backup/export/incremental?since_hours=${hours}`, { responseType: 'blob' })
export const restoreBackup        = (file, dryRun=true, encPassword='') => { const fd = new FormData(); fd.append('file', file); return api.post(`/backup/restore?dry_run=${dryRun}&encryption_password=${encodeURIComponent(encPassword)}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }) }
export const getImportedData = (module='all', limit=200) => api.get(`/graph/imported-data?module=${module}&limit=${limit}`)
export const linkAccounts = (d) => api.post('/upi/link-accounts', d)
export const ingestBankTransfers = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/upi/ingest-bank-transfers', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const ingestCSV = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/upi/ingest-csv', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const getUPIStats = () => api.get('/upi/stats')

// ── Shell Company ──────────────────────────────────────
export const traceShell = (identifier, depth = 2) =>
  api.post('/shell/trace', { identifier, depth, identifier_type: 'auto' })

// ── Social Graph ───────────────────────────────────────
export const traceSocial = (identifier, depth = 2) =>
  api.post('/social/trace', { identifier, depth, identifier_type: 'auto' })

export const getShortestPath = (fromId, toId) =>
  api.get('/social/path', { params: { from_id: fromId, to_id: toId } })

export const detectCommunities = (seed, depth = 3) =>
  api.get(`/social/communities/${seed}`, { params: { depth } })

// ── Multi-layer ────────────────────────────────────────
export const traceMulti = (identifier, depth = 2, modules = ['crypto','upi','shell','social']) =>
  api.post('/multi/trace', { identifier, depth, modules, force_refresh: false })

// ── Graph Management ───────────────────────────────────
export const searchEntities = (q, limit = 20) =>
  api.get('/graph/search', { params: { q, limit } })

export const getEntityDetail = (identifier) =>
  api.get(`/graph/entity/${identifier}`)

export const getGraphStats = () => api.get('/graph/stats')

export const exportGraph = (sessionId, format = 'json') =>
  api.get(`/graph/export/${sessionId}`, { params: { format } })

// ── Blacklist ──────────────────────────────────────────
export const importBlacklistCsv = (file, source='internal') => { const fd = new FormData(); fd.append('file', file); return api.post(`/blacklist/import-csv?source=${source}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }) }
export const listBlacklist  = (params) => api.get('/blacklist/list', { params })
export const updateBlacklist = (identifier, data) => api.put(`/blacklist/${encodeURIComponent(identifier)}`, data)
export const deleteAllBlacklist = () => api.delete('/blacklist/all')
export const removeBlacklist = (identifier) => api.delete(`/blacklist/${encodeURIComponent(identifier)}`)
export const checkBlacklist = (identifier) =>
  api.get(`/blacklist/check/${identifier}`)

export const addToBlacklist = (identifier, reason, severity = 'high') =>
  api.post('/blacklist/add', { identifier, reason, severity, source: 'internal' })

export const getBlacklistStats = () => api.get('/blacklist/stats')

// ── Complaints ─────────────────────────────────────────
export const createComplaint = (data) => api.post('/complaints/', data)
export const listComplaints  = (params) => api.get('/complaints/', { params })
export const getComplaintSummary = () => api.get("/complaints/summary")
export const updateComplaint    = (id, d) => api.put(`/complaints/${id}`, d)
export const deleteAllComplaints = () => api.delete('/complaints/all')
export const deleteComplaint    = (id)    => api.delete(`/complaints/${id}`)

// ── System ─────────────────────────────────────────────
export const getSystemStatus = () => api.get('/status')
export const healthCheck     = () => axios.get('/health')

// ── Auth API ──────────────────────────────────────────────
export const login         = (d)   => api.post('/auth/login', d)
export const refreshToken  = (d)   => api.post('/auth/refresh', d)
export const getMe         = ()    => api.get('/auth/me')
export const changePassword= (d)   => api.put('/auth/me/password', d)
export const listUsers     = ()    => api.get('/auth/users')
export const createUser    = (d)   => api.post('/auth/users', d)
export const updateUser    = (id,d)=> api.put(`/auth/users/${id}`, d)
export const deleteUser    = (id)  => api.delete(`/auth/users/${id}`)

// ── Cases API ─────────────────────────────────────────────
export const getCaseStats  = ()    => api.get('/cases/stats')
export const listCases     = (p)   => api.get('/cases/', { params: p })
export const createCase    = (d)   => api.post('/cases/', d)
export const getCase       = (id)  => api.get(`/cases/${id}`)
export const updateCase    = (id,d)=> api.put(`/cases/${id}`, d)
export const deleteCase    = (id)  => api.delete(`/cases/${id}`)
export const addCaseNote   = (id,d)=> api.post(`/cases/${id}/notes`, d)
export const attachTrace   = (id,d)=> api.post(`/cases/${id}/traces`, d)
export const assignCase    = (id,d)=> api.put(`/cases/${id}/assign`, d)

export const adminResetPassword = (id, d) => api.put(`/auth/users/${id}/reset-password`, d)

export { api }
export const factoryReset = (password, confirmPhrase) => api.post('/backup/factory-reset', { password, confirm_phrase: confirmPhrase })
export const getEncryptionKey    = () => api.get('/backup/encryption-key')
export const verifyEncryptionKey = (password) => api.post('/backup/verify-encryption-key', { password })
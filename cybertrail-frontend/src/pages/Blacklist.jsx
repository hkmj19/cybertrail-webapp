// src/pages/Blacklist.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, Search, Plus, Trash2, CheckCircle,
  AlertTriangle, RefreshCw, Edit2, X, Save,
  Upload, Download, FileText, ChevronDown, ChevronUp
} from 'lucide-react'
import {
  checkBlacklist, addToBlacklist, getBlacklistStats,
  listBlacklist, updateBlacklist, removeBlacklist,
  importBlacklistCsv, deleteAllBlacklist
} from '../services/api'
import toast from 'react-hot-toast'
import useStore from '../store/useStore'
import clsx from 'clsx'

const SEV_COLOR = {
  high:   'text-ct-red   bg-ct-red/10   border-ct-red/30',
  medium: 'text-ct-amber bg-ct-amber/10 border-ct-amber/30',
  low:    'text-ct-green bg-ct-green/10 border-ct-green/30',
}

const inp = 'w-full bg-ct-bg border border-ct-border rounded-md px-3 py-2 text-sm font-mono text-ct-text outline-none focus:border-ct-blue/50 transition-colors'

// ── Required + optional columns ────────────────────────
const REQUIRED_COLS = ['identifier']
const ALLOWED_COLS  = ['identifier', 'reason', 'severity', 'fraud_type', 'complaint_count']
const VALID_SEV     = ['high', 'medium', 'low']

function validateCsvRow(row, lineNum) {
  const errors = []
  const id = (row.identifier || '').trim()
  if (!id) {
    errors.push(`Row ${lineNum}: identifier is empty`)
    return errors
  }
  const sev = (row.severity || 'medium').toLowerCase()
  if (row.severity && !VALID_SEV.includes(sev)) {
    errors.push(`Row ${lineNum}: invalid severity "${row.severity}" - must be high/medium/low`)
  }
  const cnt = row.complaint_count
  if (cnt && isNaN(Number(cnt))) {
    errors.push(`Row ${lineNum}: complaint_count must be a number, got "${cnt}"`)
  }
  return errors
}

function parseCsvPreview(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row', rows: [], headers: [] }

  const rawHeaders = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/ /g,'_'))

  // Check required columns
  const missing = REQUIRED_COLS.filter(r => !rawHeaders.includes(r))
  if (missing.length > 0) {
    return { error: `Missing required column(s): ${missing.join(', ')}`, rows: [], headers: rawHeaders }
  }

  // Warn about unexpected columns
  const unknown = rawHeaders.filter(h => !ALLOWED_COLS.includes(h))

  const rows = []
  const allErrors = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const row = {}
    rawHeaders.forEach((h, idx) => { row[h] = values[idx] || '' })
    const errs = validateCsvRow(row, i + 1)
    allErrors.push(...errs)
    rows.push(row)
  }

  return { error: null, rows, headers: rawHeaders, allErrors, unknownCols: unknown }
}

// ── Edit modal ─────────────────────────────────────────
function EditModal({ entry, onSave, onClose }) {
  const [form, setForm] = useState({ reason: entry.reason, severity: entry.severity })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateBlacklist(entry.identifier, form)
      toast.success('Entry updated')
      onSave()
    } catch(e) {
      toast.error(e?.response?.data?.detail || 'Update failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-ct-surface border border-ct-border rounded-xl p-6 w-[420px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold font-mono text-ct-text flex items-center gap-2">
            <Edit2 size={13} className="text-ct-blue"/> Edit Entry
          </span>
          <button onClick={onClose} className="text-ct-muted hover:text-ct-text"><X size={14}/></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-1">Identifier</label>
            <div className="px-3 py-2 bg-ct-bg border border-ct-border rounded-md text-sm font-mono text-ct-muted">{entry.identifier}</div>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-1">Reason</label>
            <input value={form.reason} onChange={e => setForm(f=>({...f, reason: e.target.value}))}
              placeholder="Why is this entity flagged?" className={inp}/>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-1">Severity</label>
            <select value={form.severity} onChange={e => setForm(f=>({...f, severity: e.target.value}))} className={inp}>
              {['high','medium','low'].map(s => <option key={s} value={s} style={{background:'#0f1318'}}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 border border-ct-border text-ct-muted rounded-md text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 bg-ct-blue text-white rounded-md text-sm font-mono hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <Save size={13}/>{saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CSV Upload panel ────────────────────────────────────
function CsvUploadPanel({ onImported }) {
  const fileRef   = useRef(null)
  const [file,    setFile]    = useState(null)
  const [preview, setPreview] = useState(null)  // { rows, headers, allErrors, unknownCols }
  const [source,  setSource]  = useState('internal')
  const [uploading, setUploading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (!f.name.endsWith('.csv')) { toast.error('Only .csv files accepted'); return }
    setFile(f)
    setShowPreview(false)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parseCsvPreview(ev.target.result)
      setPreview(result)
      setShowPreview(true)
    }
    reader.readAsText(f)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) { fileRef.current.files = e.dataTransfer.files; handleFile({ target: { files: [f] } }) }
  }

  const handleUpload = async () => {
    if (!file || !preview || preview.error) return
    if (preview.allErrors?.length > 0) {
      toast.error(`Fix ${preview.allErrors.length} error(s) before uploading`)
      return
    }
    setUploading(true)
    try {
      const r = await importBlacklistCsv(file, source)
      toast.success(`Imported ${r.data.imported} entries, skipped ${r.data.skipped}`)
      setFile(null); setPreview(null); setShowPreview(false)
      if (fileRef.current) fileRef.current.value = ''
      onImported()
    } catch(e) {
      toast.error(e?.response?.data?.detail || 'Import failed')
    } finally { setUploading(false) }
  }

  const reset = () => {
    setFile(null); setPreview(null); setShowPreview(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const hasErrors   = preview?.allErrors?.length > 0
  const canUpload   = file && preview && !preview.error && !hasErrors

  return (
    <div className="bg-ct-surface border border-ct-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-ct-text font-mono flex items-center gap-2">
          <Upload size={14} className="text-ct-amber"/> Bulk Import CSV
        </div>
        <div className="flex items-center gap-2">
          <label className="block text-[10px] font-mono text-ct-muted uppercase">Source</label>
          <select value={source} onChange={e => setSource(e.target.value)}
            className="bg-ct-bg border border-ct-border rounded px-2 py-1 text-xs font-mono text-ct-text outline-none">
            {['internal','i4c','ofac'].map(s => <option key={s} value={s} style={{background:'#0f1318'}}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Drop zone */}
      {!file && (
        <label
          onDrop={handleDrop} onDragOver={e => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-ct-border rounded-xl cursor-pointer hover:border-ct-amber/40 transition-colors">
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden"/>
          <Upload size={18} className="text-ct-muted"/>
          <span className="text-sm font-mono text-ct-muted">Drop CSV here or <span className="text-ct-amber underline">browse</span></span>
          <span className="text-[10px] font-mono text-ct-muted/60">Required column: identifier · Optional: reason, severity, fraud_type, complaint_count</span>
        </label>
      )}

      {/* File picked - validation result */}
      {file && preview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={13} className="text-ct-muted"/>
              <span className="text-sm font-mono text-ct-text">{file.name}</span>
              <span className="text-[10px] font-mono text-ct-muted">({(file.size/1024).toFixed(1)} KB)</span>
            </div>
            <button onClick={reset} className="text-ct-muted hover:text-ct-text"><X size={13}/></button>
          </div>

          {/* Parse error */}
          {preview.error && (
            <div className="flex items-start gap-2 p-3 bg-ct-red/5 border border-ct-red/20 rounded-lg">
              <AlertTriangle size={13} className="text-ct-red flex-shrink-0 mt-0.5"/>
              <p className="text-[11px] font-mono text-ct-red">{preview.error}</p>
            </div>
          )}

          {/* Unknown columns warning */}
          {preview.unknownCols?.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-ct-amber/5 border border-ct-amber/20 rounded-lg">
              <AlertTriangle size={12} className="text-ct-amber flex-shrink-0 mt-0.5"/>
              <p className="text-[11px] font-mono text-ct-muted">
                Unknown columns will be ignored: <span className="text-ct-amber">{preview.unknownCols.join(', ')}</span>
              </p>
            </div>
          )}

          {/* Row validation errors */}
          {hasErrors && (
            <div className="p-3 bg-ct-red/5 border border-ct-red/20 rounded-lg max-h-28 overflow-y-auto">
              {preview.allErrors.map((e, i) => (
                <p key={i} className="text-[11px] font-mono text-ct-red">{e}</p>
              ))}
            </div>
          )}

          {/* Preview table */}
          {!preview.error && preview.rows?.length > 0 && (
            <div>
              <button onClick={() => setShowPreview(v=>!v)}
                className="flex items-center gap-1 text-[11px] font-mono text-ct-muted hover:text-ct-text mb-2">
                {showPreview ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                {showPreview ? 'Hide' : 'Show'} preview ({preview.rows.length} rows)
                {!hasErrors && <span className="ml-2 text-ct-green">✓ valid</span>}
              </button>
              {showPreview && (
                <div className="rounded-lg border border-ct-border overflow-hidden max-h-44 overflow-y-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="bg-ct-bg border-b border-ct-border">
                        {preview.headers.filter(h => ALLOWED_COLS.includes(h)).map(h => (
                          <th key={h} className="px-3 py-1.5 text-left text-ct-muted uppercase text-[9px] tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b border-ct-border/40">
                          {preview.headers.filter(h => ALLOWED_COLS.includes(h)).map(h => (
                            <td key={h} className="px-3 py-1.5 text-ct-muted">{row[h] || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 10 && (
                    <div className="px-3 py-1.5 text-[10px] font-mono text-ct-muted bg-ct-bg border-t border-ct-border">
                      +{preview.rows.length - 10} more rows
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button onClick={handleUpload} disabled={!canUpload || uploading}
            className="w-full py-2 bg-ct-amber/10 border border-ct-amber/30 text-ct-amber rounded-md text-sm font-mono hover:bg-ct-amber/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            <Upload size={13}/>
            {uploading ? 'Importing…' : `Import ${preview?.rows?.length || 0} entries`}
          </button>
        </div>
      )}

      {/* Sample CSV download */}
      <div className="mt-3 pt-3 border-t border-ct-border flex items-center justify-between">
        <p className="text-[10px] font-mono text-ct-muted">Need a template?</p>
        <a href="/sample_blacklist.csv" download
          className="flex items-center gap-1.5 text-[10px] font-mono text-ct-cyan hover:underline">
          <Download size={10}/> Download sample_blacklist.csv
        </a>
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────
export default function Blacklist() {
  const { user } = useStore()
  const canEdit  = user?.role !== 'analyst'
  const isAdmin  = user?.role === 'admin'

  const [query,    setQuery]    = useState('')
  const [result,   setResult]   = useState(null)
  const [checking, setChecking] = useState(false)
  const [stats,    setStats]    = useState(null)
  const [addForm,  setAddForm]  = useState({ identifier:'', reason:'', severity:'high' })
  const [adding,   setAdding]   = useState(false)
  const [showAdd,  setShowAdd]  = useState(false)
  const [showCsv,  setShowCsv]  = useState(false)

  // Table state
  const [entries,    setEntries]    = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [editEntry,  setEditEntry]  = useState(null)
  const [filterSev,  setFilterSev]  = useState('all')
  const [filterSrc,  setFilterSrc]  = useState('all')
  const [tableQuery, setTableQuery] = useState('')
  const [sortCol,    setSortCol]    = useState('added_at')
  const [sortDir,    setSortDir]    = useState('desc')

  const loadStats   = () => getBlacklistStats().then(r => setStats(r.data)).catch(() => {})

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: 500, skip: 0 }
      if (filterSev !== 'all') params.severity = filterSev
      if (filterSrc !== 'all') params.source   = filterSrc
      const r = await listBlacklist(params)
      setEntries(r.data.entries || [])
      setTotal(r.data.total || 0)
    } catch { toast.error('Failed to load blacklist') }
    finally { setLoading(false) }
  }, [filterSev, filterSrc])

  useEffect(() => { loadStats(); loadEntries() }, [loadEntries])

  const handleCheck = async () => {
    if (!query.trim()) return
    setChecking(true)
    try {
      const r = await checkBlacklist(query.trim())
      setResult(r.data)
    } finally { setChecking(false) }
  }

  const handleAdd = async () => {
    if (!addForm.identifier.trim()) { toast.error('Identifier required'); return }
    setAdding(true)
    try {
      await addToBlacklist(addForm.identifier, addForm.reason, addForm.severity)
      toast.success(`${addForm.identifier} added to blacklist`)
      setAddForm({ identifier:'', reason:'', severity:'high' })
      setShowAdd(false)
      loadStats(); loadEntries()
    } catch(e) {
      toast.error(e?.response?.data?.detail || 'Add failed')
    } finally { setAdding(false) }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL internal blacklist entries?\n\nThis will remove every entry with source "internal".\nI4C and OFAC entries will NOT be affected.\n\nThis cannot be undone.')) return
    try {
      const r = await deleteAllBlacklist()
      toast.success(`Deleted ${r.data.deleted} internal blacklist entries`)
      loadStats(); loadEntries()
    } catch(e) {
      toast.error(e?.response?.data?.detail || 'Delete all failed')
    }
  }

  const handleDelete = async (identifier) => {
    if (!confirm(`Remove "${identifier}" from blacklist?`)) return
    try {
      await removeBlacklist(identifier)
      toast.success('Removed from blacklist')
      loadStats(); loadEntries()
    } catch { toast.error('Delete failed') }
  }

  const handleEditSaved = () => { setEditEntry(null); loadEntries() }

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  // Client-side filter + sort
  const filtered = entries
    .filter(e => {
      if (!tableQuery) return true
      const q = tableQuery.toLowerCase()
      return e.identifier.toLowerCase().includes(q) ||
             (e.reason || '').toLowerCase().includes(q) ||
             (e.source || '').toLowerCase().includes(q) ||
             (e.added_by || '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const va = a[sortCol] || ''
      const vb = b[sortCol] || ''
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  const formatDate = (dt) => {
    if (!dt) return '-'
    try { return new Date(dt).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true }) }
    catch { return dt }
  }

  const SortIcon = ({ col }) => sortCol !== col ? null : (
    <span className="ml-1 text-ct-cyan">{sortDir === 'asc' ? '↑' : '↓'}</span>
  )

  return (
    <div style={{height:'100%', overflowY:'auto', padding:'1.5rem'}} className="animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ct-text font-mono flex items-center gap-2">
            <Shield size={18} className="text-ct-red"/> Blacklist Management
          </h1>
          <p className="text-ct-muted text-sm">Check identifiers against OFAC, I4C, and internal watchlists</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowCsv(v=>!v); setShowAdd(false) }}
              className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono border transition-colors',
                showCsv ? 'bg-ct-amber/10 border-ct-amber/30 text-ct-amber' : 'border-ct-border text-ct-muted hover:text-ct-amber hover:border-ct-amber/30')}>
              <Upload size={13}/>{showCsv ? 'Hide CSV' : 'Import CSV'}
            </button>
            <button onClick={() => { setShowAdd(v=>!v); setShowCsv(false) }}
              className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono border transition-colors',
                showAdd ? 'bg-ct-red/10 border-ct-red/30 text-ct-red' : 'bg-ct-green/10 border-ct-green/30 text-ct-green hover:bg-ct-green/20')}>
              {showAdd ? <X size={13}/> : <Plus size={13}/>}
              {showAdd ? 'Cancel' : 'Add Entry'}
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Internal list', value: stats.internal_count ?? 0, color: 'text-ct-red'   },
            { label: 'I4C / NCRP',   value: stats.i4c_count ?? 0,      color: 'text-ct-amber' },
            { label: 'OFAC SDN',     value: stats.ofac_count ?? 0,      color: 'text-ct-blue'  },
            { label: 'High severity',value: stats.high_severity ?? 0,   color: 'text-ct-red'   },
          ].map(s => (
            <div key={s.label} className="bg-ct-surface border border-ct-border rounded-xl p-4">
              <div className={clsx('text-xl font-semibold font-mono', s.color)}>{s.value}</div>
              <div className="text-xs text-ct-muted">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* CSV Upload panel */}
      {showCsv && canEdit && (
        <div className="mb-6">
          <CsvUploadPanel onImported={() => { loadStats(); loadEntries(); setShowCsv(false) }}/>
        </div>
      )}

      {/* Check + Add row */}
      <div className={clsx('grid gap-4 mb-6', showAdd ? 'grid-cols-2' : 'grid-cols-1')}>

        {/* Check */}
        <div className="bg-ct-surface border border-ct-border rounded-xl p-5">
          <div className="text-sm font-medium text-ct-text font-mono mb-3 flex items-center gap-2">
            <Search size={14} className="text-ct-cyan"/> Check identifier
          </div>
          <div className="flex gap-2 mb-4">
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCheck()}
              placeholder="UPI ID, wallet, phone, CIN…" className={inp}/>
            <button onClick={handleCheck} disabled={checking}
              className="px-4 py-2 bg-ct-blue text-white rounded-md text-sm font-mono hover:bg-blue-500 transition-colors disabled:opacity-50">
              {checking ? '…' : 'Check'}
            </button>
          </div>
          {result && (
            <div className={clsx('rounded-lg p-4 border', result.flagged ? 'bg-ct-red/5 border-ct-red/30' : 'bg-ct-green/5 border-ct-green/30')}>
              <div className="flex items-center gap-2 mb-2">
                {result.flagged
                  ? <AlertTriangle size={14} className="text-ct-red"/>
                  : <CheckCircle size={14} className="text-ct-green"/>}
                <span className={clsx('text-sm font-mono font-semibold', result.flagged ? 'text-ct-red' : 'text-ct-green')}>
                  {result.flagged ? `${result.hit_count} match${result.hit_count > 1 ? 'es' : ''} found` : 'Clean - not flagged'}
                </span>
              </div>
              {result.hits?.map((hit, i) => (
                <div key={i} className="text-xs text-ct-muted font-mono mt-1 pl-5">
                  [{hit.source}] {hit.reason} <span className="text-ct-red">({hit.severity})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add form */}
        {showAdd && canEdit && (
          <div className="bg-ct-surface border border-ct-green/20 rounded-xl p-5">
            <div className="text-sm font-medium text-ct-text font-mono mb-3 flex items-center gap-2">
              <Plus size={14} className="text-ct-green"/> Add to internal blacklist
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-ct-muted font-mono uppercase mb-1">Identifier *</label>
                <input value={addForm.identifier} onChange={e => setAddForm(a=>({...a, identifier:e.target.value}))}
                  placeholder="UPI ID, wallet, phone, CIN…" className={inp}/>
              </div>
              <div>
                <label className="block text-[10px] text-ct-muted font-mono uppercase mb-1">Reason</label>
                <input value={addForm.reason} onChange={e => setAddForm(a=>({...a, reason:e.target.value}))}
                  placeholder="Why is this entity flagged?" className={inp}/>
              </div>
              <div>
                <label className="block text-[10px] text-ct-muted font-mono uppercase mb-1">Severity</label>
                <select value={addForm.severity} onChange={e => setAddForm(a=>({...a, severity:e.target.value}))} className={inp}>
                  {['high','medium','low'].map(s => <option key={s} value={s} style={{background:'#0f1318'}}>{s}</option>)}
                </select>
              </div>
              <button onClick={handleAdd} disabled={adding}
                className="w-full py-2 bg-ct-red/80 hover:bg-ct-red text-white rounded-md text-sm font-mono transition-colors disabled:opacity-50">
                {adding ? 'Adding…' : 'Add to blacklist'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-ct-surface border border-ct-border rounded-xl overflow-hidden">

        {/* Table toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ct-border flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Shield size={13} className="text-ct-muted"/>
            <span className="text-sm font-mono font-medium text-ct-text">All Blacklisted Entries</span>
            <span className="text-[10px] font-mono text-ct-muted px-2 py-0.5 bg-ct-bg border border-ct-border rounded-full">
              {filtered.length}{filtered.length !== total ? ` / ${total}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Live search */}
            <div className="flex items-center gap-1.5 bg-ct-bg border border-ct-border rounded-md px-2.5 py-1.5 focus-within:border-ct-blue/40 transition-colors">
              <Search size={11} className="text-ct-muted flex-shrink-0"/>
              <input
                value={tableQuery}
                onChange={e => setTableQuery(e.target.value)}
                placeholder="Search identifier, reason, source…"
                className="bg-transparent text-xs font-mono text-ct-text outline-none w-48 placeholder-ct-muted"
              />
              {tableQuery && (
                <button onClick={() => setTableQuery('')} className="text-ct-muted hover:text-ct-text flex-shrink-0">
                  <X size={10}/>
                </button>
              )}
            </div>
            {/* Severity filter */}
            <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
              className="bg-ct-bg border border-ct-border rounded-md px-2 py-1.5 text-xs font-mono text-ct-text outline-none">
              <option value="all"    style={{background:'#0f1318'}}>All severity</option>
              <option value="high"   style={{background:'#0f1318'}}>High</option>
              <option value="medium" style={{background:'#0f1318'}}>Medium</option>
              <option value="low"    style={{background:'#0f1318'}}>Low</option>
            </select>
            {/* Source filter */}
            <select value={filterSrc} onChange={e => setFilterSrc(e.target.value)}
              className="bg-ct-bg border border-ct-border rounded-md px-2 py-1.5 text-xs font-mono text-ct-text outline-none">
              <option value="all"      style={{background:'#0f1318'}}>All sources</option>
              <option value="internal" style={{background:'#0f1318'}}>Internal</option>
              <option value="i4c"      style={{background:'#0f1318'}}>I4C</option>
              <option value="ofac"     style={{background:'#0f1318'}}>OFAC</option>
            </select>
            <button onClick={loadEntries} disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-ct-border rounded-md text-[10px] font-mono text-ct-muted hover:text-ct-blue transition-colors">
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''}/>Refresh
            </button>
            {isAdmin && entries.length > 0 && (
              <button onClick={handleDeleteAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-ct-red/30 rounded-md text-[10px] font-mono text-ct-red hover:bg-ct-red/5 transition-colors">
                <Trash2 size={10}/>Delete all internal
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-ct-muted text-sm font-mono">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-ct-muted text-sm font-mono">
            {total === 0 ? 'No blacklisted entries yet - add one or import a CSV' : 'No entries match your search'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ct-border bg-ct-bg">
                  {[
                    { key: 'identifier', label: 'Identifier' },
                    { key: 'severity',   label: 'Severity'   },
                    { key: 'source',     label: 'Source'     },
                    { key: 'reason',     label: 'Reason'     },
                    { key: 'added_by',   label: 'Added by'   },
                    { key: 'added_at',   label: 'Date'       },
                    { key: null,         label: ''           },
                  ].map(col => (
                    <th key={col.label}
                      onClick={() => col.key && toggleSort(col.key)}
                      className={clsx('text-left px-4 py-2.5 text-[10px] font-mono text-ct-muted uppercase tracking-widest',
                        col.key && 'cursor-pointer hover:text-ct-text select-none')}>
                      {col.label}<SortIcon col={col.key}/>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => (
                  <tr key={entry.identifier}
                    className={clsx('border-b border-ct-border/40 hover:bg-white/[0.02] transition-colors', i % 2 !== 0 && 'bg-white/[0.01]')}>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-ct-text">{entry.identifier}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-[10px] font-mono font-semibold px-2 py-0.5 rounded border capitalize', SEV_COLOR[entry.severity] || SEV_COLOR.high)}>
                        {entry.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono text-ct-muted uppercase">{entry.source}</span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-[11px] font-mono text-ct-muted truncate block" title={entry.reason}>
                        {entry.reason || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono text-ct-muted">{entry.added_by}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono text-ct-muted">{formatDate(entry.added_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && entry.source === 'internal' && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setEditEntry(entry)} title="Edit entry"
                            className="p-1.5 rounded border border-ct-border text-ct-muted hover:text-ct-blue hover:border-ct-blue/40 transition-colors">
                            <Edit2 size={11}/>
                          </button>
                          <button onClick={() => handleDelete(entry.identifier)} title="Remove from blacklist"
                            className="p-1.5 rounded border border-ct-border text-ct-muted hover:text-ct-red hover:border-ct-red/40 transition-colors">
                            <Trash2 size={11}/>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editEntry && (
        <EditModal entry={editEntry} onSave={handleEditSaved} onClose={() => setEditEntry(null)}/>
      )}
    </div>
  )
}
// src/pages/Backup.jsx — Disaster Recovery & Backup
import { useState, useEffect } from 'react'
import {
  Download, Upload, Shield, Database, Clock,
  CheckCircle, AlertTriangle, RefreshCw, FileJson,
  Archive, RotateCcw, Info, Loader2, X
} from 'lucide-react'
import { getBackupStatus, exportFullBackup, exportIncrementalBackup, restoreBackup, factoryReset } from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import useStore from '../store/useStore'

const inp = 'w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text outline-none focus:border-ct-blue/50 transition-colors'

function StatPill({ label, value, color = 'text-ct-text' }) {
  return (
    <div className="bg-ct-bg rounded-lg px-3 py-2 border border-ct-border">
      <div className={clsx('text-lg font-semibold font-mono', color)}>{value ?? '—'}</div>
      <div className="text-[10px] text-ct-muted font-mono">{label}</div>
    </div>
  )
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Backup() {
  const { user } = useStore()
  const [status,      setStatus]      = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [exporting,   setExporting]   = useState(false)
  const [restoreStep, setRestoreStep] = useState('idle')  // idle | preview | confirming | restoring | done
  const [restoreFile, setRestoreFile] = useState(null)
  const [dryRunResult,setDryRunResult]= useState(null)
  const [incrHours,   setIncrHours]   = useState(24)

  const isAdmin      = user?.role === 'admin'
  const isSystemAdmin = user?.role === 'admin' && user?.username === 'admin'
  const isSupervisor  = user?.role === 'supervisor' || isAdmin
  const [resetPassword,   setResetPassword]   = useState('')
  const [resetPhrase,     setResetPhrase]     = useState('')
  const [resetStep,       setResetStep]       = useState('idle') // idle | confirm | wiping | done
  const [resetResult,     setResetResult]     = useState(null)
  const [showPassword,    setShowPassword]    = useState(false)

  const loadStatus = async () => {
    setLoading(true)
    try { const r = await getBackupStatus(); setStatus(r.data) }
    catch { toast.error('Could not load backup status') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadStatus() }, [])

  const handleFullExport = async () => {
    setExporting(true)
    try {
      const r    = await exportFullBackup(true)
      const ts   = new Date().toISOString().replace(/[:.]/g,'').slice(0,15)
      downloadBlob(r.data, `cybertrail_backup_${ts}.json.gz`)
      toast.success('Full backup downloaded')
      loadStatus()
    } catch { toast.error('Export failed') } finally { setExporting(false) }
  }

  const handleIncrementalExport = async () => {
    setExporting(true)
    try {
      const r  = await exportIncrementalBackup(incrHours)
      const ts = new Date().toISOString().replace(/[:.]/g,'').slice(0,15)
      downloadBlob(r.data, `cybertrail_incremental_${ts}.json.gz`)
      toast.success(`Incremental backup (last ${incrHours}h) downloaded`)
      loadStatus()
    } catch { toast.error('Export failed') } finally { setExporting(false) }
  }

  const handleRestoreFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.json') && !file.name.endsWith('.json.gz') && !file.name.endsWith('.gz')) {
      toast.error('Only .json or .json.gz backup files accepted'); return
    }
    setRestoreFile(file)
    setRestoreStep('confirming')
    // Dry run first
    try {
      const r = await restoreBackup(file, true)
      setDryRunResult(r.data)
      setRestoreStep('preview')
    } catch(e) {
      toast.error(e?.response?.data?.detail || 'Invalid backup file')
      setRestoreStep('idle')
      setRestoreFile(null)
    }
  }

  const handleActualRestore = async () => {
    if (!restoreFile) return
    setRestoreStep('restoring')
    try {
      const r = await restoreBackup(restoreFile, false)
      toast.success('Restore complete!')
      setDryRunResult(r.data)
      setRestoreStep('done')
      loadStatus()
    } catch(e) {
      toast.error(e?.response?.data?.detail || 'Restore failed')
      setRestoreStep('preview')
    }
  }

  const handleFactoryReset = async () => {
    if (resetPhrase !== 'DELETE ALL DATA') {
      toast.error('Type exactly: DELETE ALL DATA')
      return
    }
    if (!resetPassword) { toast.error('Password is required'); return }
    setResetStep('wiping')
    try {
      const r = await factoryReset(resetPassword, resetPhrase)
      setResetResult(r.data)
      setResetStep('done')
      setResetPassword('')
      setResetPhrase('')
      toast.success('Factory reset complete')
      loadStatus()
    } catch(e) {
      toast.error(e?.response?.data?.detail || 'Reset failed')
      setResetStep('confirm')
    }
  }

  const stats = status?.database_stats || {}
  const lastBackup = status?.last_backup

  return (
    <div style={{height:'100%', overflowY:'auto', padding:'1.5rem'}} className="animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ct-text font-mono flex items-center gap-2">
            <Shield size={16} className="text-ct-cyan"/> Backup & Recovery
          </h1>
          <p className="text-ct-muted text-sm mt-0.5">Export, schedule, and restore all CyberTrail investigation data</p>
        </div>
        <button onClick={loadStatus} disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-mono text-ct-muted hover:text-ct-blue border border-ct-border rounded-lg px-3 py-1.5 transition-colors">
          <RefreshCw size={11} className={loading?'animate-spin':''}/> Refresh
        </button>
      </div>

      {/* Database Stats */}
      <div className="bg-ct-surface border border-ct-border rounded-xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Database size={13} className="text-ct-blue"/>
          <span className="text-xs font-mono font-semibold text-ct-text">Current Database</span>
        </div>
        {loading ? (
          <div className="grid grid-cols-4 gap-3">
            {[...Array(8)].map((_,i) => (
              <div key={i} className="bg-ct-bg rounded-lg px-3 py-2 border border-ct-border animate-pulse h-14"/>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            <StatPill label="Complaints"   value={stats.complaints}       color="text-ct-red"/>
            <StatPill label="Cases"        value={stats.cases}            color="text-ct-blue"/>
            <StatPill label="Blacklist"    value={stats.blacklist}        color="text-ct-amber"/>
            <StatPill label="UPI Accounts" value={stats.upi_accounts}     color="text-ct-green"/>
            <StatPill label="Phones"       value={stats.phones}           color="text-ct-purple"/>
            <StatPill label="Transactions" value={stats.transactions}     color="text-ct-cyan"/>
            <StatPill label="Call Records" value={stats.call_records}     color="text-ct-purple"/>
            <StatPill label="Companies"    value={stats.companies}        color="text-ct-amber"/>
            <StatPill label="Directors"    value={stats.directors}        color="text-ct-amber"/>
            <StatPill label="Audit Logs"   value={stats.audit_logs}       color="text-ct-muted"/>
            <StatPill label="Users"        value={stats.users}            color="text-ct-text"/>
            <StatPill label="Dir. Records" value={stats.director_records} color="text-ct-amber"/>
          </div>
        )}

        {/* Last backup info */}
        <div className="mt-4 pt-3 border-t border-ct-border flex items-center gap-3">
          <Clock size={12} className="text-ct-muted"/>
          {lastBackup ? (
            <p className="text-[11px] font-mono text-ct-muted">
              Last backup: <span className="text-ct-text">
                {new Date(lastBackup.timestamp).toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true})}
              </span> by <span className="text-ct-blue">{lastBackup.by}</span>
            </p>
          ) : (
            <p className="text-[11px] font-mono text-ct-red">No backup taken yet — export one now</p>
          )}
        </div>

        {/* Recommendations */}
        {status?.recommendations?.length > 0 && (
          <div className="mt-3 space-y-1">
            {status.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] font-mono text-ct-muted">
                <Info size={11} className="text-ct-amber flex-shrink-0 mt-0.5"/>
                {r}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export section */}
      {isSupervisor && (
        <div className="grid grid-cols-2 gap-4 mb-5">

          {/* Full backup */}
          <div className="bg-ct-surface border border-ct-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Archive size={13} className="text-ct-green"/>
              <span className="text-xs font-mono font-semibold text-ct-text">Full Backup</span>
            </div>
            <p className="text-[11px] font-mono text-ct-muted mb-4 leading-relaxed">
              Exports everything — complaints, cases, blacklist, CDR, company data, audit trail, users.
              Compressed to <span className="text-ct-text">.json.gz</span> for smaller file size.
            </p>
            <div className="text-[10px] font-mono text-ct-muted mb-3 space-y-1">
              {['Complaints + UPI accounts','Cases + notes + traces','Blacklist entries','CDR call records','Company + director data','Audit trail (last 10,000)','User accounts (no passwords)'].map(item => (
                <div key={item} className="flex items-center gap-1.5">
                  <CheckCircle size={9} className="text-ct-green"/>{item}
                </div>
              ))}
            </div>
            <button onClick={handleFullExport} disabled={exporting}
              className="w-full flex items-center justify-center gap-2 h-10 bg-ct-green/10 border border-ct-green/30 text-ct-green rounded-lg text-sm font-mono hover:bg-ct-green/20 transition-all disabled:opacity-50">
              {exporting ? <Loader2 size={13} className="animate-spin"/> : <Download size={13}/>}
              Download Full Backup
            </button>
          </div>

          {/* Incremental backup */}
          <div className="bg-ct-surface border border-ct-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={13} className="text-ct-blue"/>
              <span className="text-xs font-mono font-semibold text-ct-text">Incremental Backup</span>
            </div>
            <p className="text-[11px] font-mono text-ct-muted mb-4 leading-relaxed">
              Exports only data added or changed in the last N hours.
              Use for <span className="text-ct-text">daily automated backups</span> — much smaller file.
            </p>

            <div className="mb-4">
              <label className="block text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-1">Since last N hours</label>
              <div className="flex items-center gap-2">
                <input type="range" min="1" max="168" value={incrHours}
                  onChange={e=>setIncrHours(Number(e.target.value))} className="flex-1"/>
                <span className="text-sm font-mono text-ct-blue w-16 text-right">
                  {incrHours >= 24 ? `${Math.round(incrHours/24)}d` : `${incrHours}h`}
                </span>
              </div>
              <div className="flex justify-between text-[9px] font-mono text-ct-muted mt-0.5">
                <span>1h</span><span>24h</span><span>48h</span><span>1 week</span>
              </div>
            </div>

            <div className="bg-ct-bg border border-ct-border rounded-lg p-3 mb-4">
              <p className="text-[10px] font-mono text-ct-muted">Recommended cron (daily at 2am IST):</p>
              <code className="text-[10px] font-mono text-ct-cyan block mt-1">
                30 20 * * * curl -H "Authorization: Bearer TOKEN" http://localhost:8000/api/v1/backup/export/incremental?since_hours=24 -o backup_$(date +%Y%m%d).json.gz
              </code>
            </div>

            <button onClick={handleIncrementalExport} disabled={exporting}
              className="w-full flex items-center justify-center gap-2 h-10 bg-ct-blue/10 border border-ct-blue/30 text-ct-blue rounded-lg text-sm font-mono hover:bg-ct-blue/20 transition-all disabled:opacity-50">
              {exporting ? <Loader2 size={13} className="animate-spin"/> : <Download size={13}/>}
              Download Last {incrHours >= 24 ? `${Math.round(incrHours/24)} Day${incrHours>=48?'s':''}` : `${incrHours}h`}
            </button>
          </div>
        </div>
      )}

      {/* Restore section — Admin only */}
      {isAdmin && (
        <div className="bg-ct-surface border border-ct-red/20 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <RotateCcw size={13} className="text-ct-red"/>
            <span className="text-xs font-mono font-semibold text-ct-text">Restore from Backup</span>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-ct-red/10 text-ct-red border border-ct-red/20 rounded">Admin only</span>
          </div>

          <div className="flex items-start gap-2 p-3 bg-ct-amber/5 border border-ct-amber/20 rounded-lg mb-4">
            <AlertTriangle size={12} className="text-ct-amber flex-shrink-0 mt-0.5"/>
            <p className="text-[11px] font-mono text-ct-muted leading-relaxed">
              Restore does <span className="text-ct-amber">MERGE</span> — not overwrite. Existing records are updated, new records are added. Nothing is deleted. Always do a dry-run preview first.
            </p>
          </div>

          {restoreStep === 'idle' && (
            <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-ct-border rounded-xl cursor-pointer hover:border-ct-red/30 transition-colors">
              <input type="file" accept=".json,.json.gz,.gz" onChange={handleRestoreFile} className="hidden"/>
              <Upload size={20} className="text-ct-muted"/>
              <span className="text-sm font-mono text-ct-muted">Drop backup file here or <span className="text-ct-red underline">browse</span></span>
              <span className="text-[10px] font-mono text-ct-muted/60">Accepts .json or .json.gz</span>
            </label>
          )}

          {restoreStep === 'confirming' && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Loader2 size={18} className="animate-spin text-ct-blue"/>
              <span className="text-sm font-mono text-ct-muted">Validating backup file…</span>
            </div>
          )}

          {(restoreStep === 'preview' || restoreStep === 'done') && dryRunResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-mono text-ct-text font-semibold">
                    Backup: <span className="text-ct-muted font-normal">{restoreFile?.name}</span>
                  </p>
                  <p className="text-[10px] font-mono text-ct-muted">
                    Created {dryRunResult.backup_created_at ? new Date(dryRunResult.backup_created_at).toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true}) : '—'}
                    {dryRunResult.backup_created_by && ` by ${dryRunResult.backup_created_by}`}
                  </p>
                </div>
                {restoreStep === 'preview' && (
                  <button onClick={()=>{setRestoreStep('idle');setRestoreFile(null);setDryRunResult(null)}}
                    className="text-ct-muted hover:text-ct-text"><X size={14}/></button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {Object.entries(dryRunResult.records_to_restore || dryRunResult.records_restored || {}).map(([k, v]) => (
                  <div key={k} className="bg-ct-bg border border-ct-border rounded-lg px-3 py-2">
                    <div className={clsx('text-base font-semibold font-mono', v > 0 ? 'text-ct-green' : 'text-ct-muted')}>{v}</div>
                    <div className="text-[10px] font-mono text-ct-muted">{k.replace(/_/g,' ')}</div>
                  </div>
                ))}
              </div>

              {restoreStep === 'preview' && (
                <button onClick={handleActualRestore}
                  className="w-full flex items-center justify-center gap-2 h-10 bg-ct-red/10 border border-ct-red/30 text-ct-red rounded-lg text-sm font-mono hover:bg-ct-red/20 transition-all">
                  <RotateCcw size={13}/> Confirm Restore
                </button>
              )}

              {restoreStep === 'done' && (
                <div className="flex items-center gap-2 text-sm font-mono text-ct-green">
                  <CheckCircle size={14}/> Restore complete — all records merged successfully
                </div>
              )}
            </div>
          )}

          {restoreStep === 'restoring' && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Loader2 size={18} className="animate-spin text-ct-red"/>
              <span className="text-sm font-mono text-ct-muted">Restoring… do not close this page</span>
            </div>
          )}
        </div>
      )}

      {/* Factory Reset — system admin only */}
      {isSystemAdmin && (
        <div className="bg-ct-surface border border-ct-red/40 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-ct-red"/>
            <span className="text-sm font-semibold font-mono text-ct-red">Factory Reset</span>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-ct-red/10 text-ct-red border border-ct-red/20 rounded">system admin only</span>
          </div>

          <div className="flex items-start gap-2 p-3 bg-ct-red/5 border border-ct-red/20 rounded-lg mb-4">
            <AlertTriangle size={12} className="text-ct-red flex-shrink-0 mt-0.5"/>
            <div className="text-[11px] font-mono text-ct-muted leading-relaxed">
              <span className="text-ct-red font-semibold">IRREVERSIBLE.</span> Deletes ALL complaints, cases, blacklist, CDR, company data, graph nodes, and audit logs.
              User accounts are preserved so you can still log in.
              <span className="text-ct-amber"> Always export a full backup before resetting.</span>
            </div>
          </div>

          {resetStep === 'idle' && (
            <button onClick={()=>setResetStep('confirm')}
              className="flex items-center gap-2 px-4 py-2 border border-ct-red/40 text-ct-red rounded-lg text-sm font-mono hover:bg-ct-red/5 transition-colors">
              <AlertTriangle size={13}/> Start Factory Reset
            </button>
          )}

          {resetStep === 'confirm' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-1">
                  Admin password <span className="text-ct-red">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={resetPassword}
                    onChange={e=>setResetPassword(e.target.value)}
                    placeholder="Enter your admin password"
                    className="w-full bg-ct-bg border border-ct-red/30 rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-red/60 pr-16"
                  />
                  <button onClick={()=>setShowPassword(v=>!v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-ct-muted hover:text-ct-text">
                    {showPassword ? 'hide' : 'show'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-1">
                  Type exactly to confirm <span className="text-ct-red">*</span>
                </label>
                <input
                  value={resetPhrase}
                  onChange={e=>setResetPhrase(e.target.value)}
                  placeholder="DELETE ALL DATA"
                  className={clsx(
                    'w-full bg-ct-bg border rounded-lg px-3 py-2 text-sm font-mono placeholder-ct-muted outline-none transition-colors',
                    resetPhrase === 'DELETE ALL DATA'
                      ? 'border-ct-red/60 text-ct-red'
                      : 'border-ct-red/30 text-ct-text focus:border-ct-red/60'
                  )}
                />
                {resetPhrase && resetPhrase !== 'DELETE ALL DATA' && (
                  <p className="text-[10px] font-mono text-ct-red mt-1">Must match exactly: DELETE ALL DATA</p>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={()=>{setResetStep('idle');setResetPassword('');setResetPhrase('')}}
                  className="flex-1 h-9 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleFactoryReset}
                  disabled={resetPhrase !== 'DELETE ALL DATA' || !resetPassword}
                  className="flex-1 h-9 bg-ct-red/10 border border-ct-red/40 text-ct-red rounded-lg text-sm font-mono hover:bg-ct-red/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                  <AlertTriangle size={13}/> Wipe All Data
                </button>
              </div>
            </div>
          )}

          {resetStep === 'wiping' && (
            <div className="flex items-center gap-3 py-4 justify-center">
              <Loader2 size={18} className="animate-spin text-ct-red"/>
              <span className="text-sm font-mono text-ct-muted">Wiping all data… do not close this page</span>
            </div>
          )}

          {resetStep === 'done' && resetResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-ct-green text-sm font-mono font-semibold">
                <CheckCircle size={14}/> Factory reset complete
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(resetResult.deleted || {}).map(([k, v]) => (
                  <div key={k} className="bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-center">
                    <div className="text-base font-semibold font-mono text-ct-text">{v}</div>
                    <div className="text-[10px] font-mono text-ct-muted">{k.replace(/_/g,' ')} deleted</div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] font-mono text-ct-muted">{resetResult.message}</p>
              <button onClick={()=>setResetStep('idle')} className="text-[11px] font-mono text-ct-muted hover:text-ct-text">↩ Reset again</button>
            </div>
          )}
        </div>
      )}

      {/* Format reference */}
      <div className="bg-ct-surface border border-ct-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileJson size={13} className="text-ct-muted"/>
          <span className="text-xs font-mono font-semibold text-ct-text">Backup Format Reference</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-2">File</p>
            <div className="space-y-1 text-[11px] font-mono text-ct-muted">
              <div><span className="text-ct-text">Format:</span> JSON (human-readable)</div>
              <div><span className="text-ct-text">Compression:</span> gzip (.json.gz)</div>
              <div><span className="text-ct-text">Encoding:</span> UTF-8</div>
              <div><span className="text-ct-text">Typical size:</span> 1–50 MB compressed</div>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-2">Schedule recommendation</p>
            <div className="space-y-1 text-[11px] font-mono text-ct-muted">
              <div><span className="text-ct-green">Daily:</span> Incremental (last 24h)</div>
              <div><span className="text-ct-blue">Weekly:</span> Full backup</div>
              <div><span className="text-ct-amber">Before bulk ops:</span> Full backup</div>
              <div><span className="text-ct-text">Storage:</span> Keep 30 days rolling</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
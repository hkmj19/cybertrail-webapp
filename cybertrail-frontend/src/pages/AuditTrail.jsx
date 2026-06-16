// src/pages/AuditTrail.jsx - Immutable audit log viewer
import { useState, useEffect, useCallback } from 'react'
import { Shield, Search, Clock, User, AlertTriangle, X, RefreshCw, Loader2, ChevronDown, ChevronRight, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { api, listUsers } from '../services/api'
import useStore from '../store/useStore'

const ACTION_COLORS = {
  create:        'text-ct-green  bg-ct-green/10  border-ct-green/20',
  update:        'text-ct-amber  bg-ct-amber/10  border-ct-amber/20',
  delete:        'text-ct-red    bg-ct-red/10    border-ct-red/20',
  login:         'text-ct-blue   bg-ct-blue/10   border-ct-blue/20',
  flag:          'text-ct-purple bg-ct-purple/10 border-ct-purple/20',
  export:        'text-ct-cyan   bg-ct-cyan/10   border-ct-cyan/20',
  restore:       'text-ct-amber  bg-ct-amber/10  border-ct-amber/20',
  factory_reset: 'text-ct-red    bg-ct-red/10    border-ct-red/20',
}

const ENTITY_ICONS = {
  complaint: '📋', case: '📁', user: '👤',
  blacklist: '⚠️', trace: '🔍', login: '🔐',
  backup: '💾', system: '⚙️',
}

function AuditRow({ log }) {
  const [open, setOpen] = useState(false)
  let changes = {}
  try { changes = JSON.parse(log.changes || '{}') } catch {}
  const hasChanges = Object.keys(changes).length > 0

  return (
    <div className="border-b border-ct-border/50 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <div className="w-36 flex-shrink-0">
          <div className="text-[10px] font-mono text-ct-muted">
            {new Date(log.timestamp).toLocaleDateString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric' })}
          </div>
          <div className="text-[10px] font-mono text-ct-muted/60">
            {new Date(log.timestamp).toLocaleTimeString('en-IN', { timeZone:'Asia/Kolkata', hour:'2-digit', minute:'2-digit', hour12:true })}
          </div>
        </div>
        <span className={clsx('text-[10px] font-mono px-2 py-0.5 rounded border uppercase w-20 text-center flex-shrink-0',
          ACTION_COLORS[log.action] || 'text-ct-muted bg-white/5 border-white/10')}>
          {log.action}
        </span>
        <div className="w-24 flex-shrink-0">
          <span className="text-[10px] font-mono text-ct-muted capitalize">
            {ENTITY_ICONS[log.entity_type] || '●'} {log.entity_type}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={clsx('text-xs font-mono text-ct-text', open ? 'break-all whitespace-pre-wrap' : 'truncate')}>
            {log.description}
          </p>
          <p className="text-[10px] font-mono text-ct-muted truncate">{log.entity_id}</p>
        </div>
        <div className="w-40 flex-shrink-0 text-right">
          <div className="text-xs font-mono text-ct-text">{log.officer_username}</div>
          <div className="text-[10px] font-mono text-ct-muted">{log.officer_badge} · {log.officer_role}</div>
        </div>
        <div className="w-28 flex-shrink-0 text-right">
          <div className="text-[10px] font-mono text-ct-muted">{log.ip_address}</div>
        </div>
        <div className="w-4 flex-shrink-0">
          {open ? <ChevronDown size={12} className="text-ct-muted"/> : <ChevronRight size={12} className="text-ct-muted"/>}
        </div>
      </div>

      {open && hasChanges && (
        <div className="px-4 pb-4 bg-ct-bg/50 border-t border-ct-border/30">
          <p className="text-[10px] text-ct-muted font-mono uppercase tracking-widest mt-3 mb-2">What changed:</p>
          <div className="space-y-2">
            {Object.entries(changes).map(([field, change]) => (
              <div key={field} className="bg-ct-surface border border-ct-border rounded-lg p-3">
                <p className="text-[10px] text-ct-muted font-mono uppercase tracking-widest mb-1.5">
                  {field.replace(/_/g, ' ')}
                </p>
                {change.from !== undefined ? (
                  <div className="space-y-1">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-ct-red font-mono w-8 flex-shrink-0">FROM</span>
                      <span className="text-[11px] font-mono text-ct-red bg-ct-red/5 rounded px-2 py-1 flex-1 break-all whitespace-pre-wrap">{String(change.from || '-')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-ct-green font-mono w-8 flex-shrink-0">TO</span>
                      <span className="text-[11px] font-mono text-ct-green bg-ct-green/5 rounded px-2 py-1 flex-1 break-all whitespace-pre-wrap">{String(change.to || '-')}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {typeof change === 'object' && change !== null
                      ? Object.entries(change).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2">
                            <span className="text-[10px] text-ct-muted font-mono w-32 flex-shrink-0 capitalize">{k.replace(/_/g, ' ')}</span>
                            <span className="text-[11px] font-mono text-ct-text break-all">{String(v || '-')}</span>
                          </div>
                        ))
                      : <span className="text-[11px] font-mono text-ct-text break-all whitespace-pre-wrap">{JSON.stringify(change, null, 2)}</span>
                    }
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Officer stats table (shared layout) ──────────────────
function StatsTable({ rows, knownUsernames, title, color = 'text-ct-text', icon }) {
  const fmt = (ts) => ts
    ? new Date(ts).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })
    : '-'

  return (
    <div className="bg-ct-surface border border-ct-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-ct-border flex items-center gap-2">
        {icon}
        <span className={clsx('text-xs font-mono font-semibold', color)}>{title}</span>
        <span className="text-[10px] font-mono text-ct-muted px-2 py-0.5 bg-ct-bg border border-ct-border rounded-full">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] font-mono text-ct-muted text-center py-5">None</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ct-border bg-ct-bg/50">
                {['Officer / Username','Role','Total','Creates','Updates','Deletes','Last Action'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] text-ct-muted font-mono uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.username} className={clsx('border-b border-ct-border/50 hover:bg-white/[0.02]',
                  s.deletes > 3 && 'bg-ct-red/5')}>
                  <td className="px-3 py-2.5">
                    <div className="text-xs font-mono font-semibold text-ct-text">{s.username}</div>
                    {s.badge_id && <div className="text-[10px] font-mono text-ct-muted">{s.badge_id}</div>}
                    {!knownUsernames.has(s.username) && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 bg-ct-red/10 text-ct-red border border-ct-red/20 rounded">deleted account</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] font-mono text-ct-muted capitalize">{s.role || '-'}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-ct-text font-semibold">{s.total_actions}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-ct-green">{s.creates}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-ct-amber">{s.updates}</td>
                  <td className="px-3 py-2.5">
                    <span className={clsx('text-xs font-mono font-semibold', s.deletes > 3 ? 'text-ct-red' : 'text-ct-muted')}>
                      {s.deletes > 3 ? '⚠ ' : ''}{s.deletes}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[10px] font-mono text-ct-muted">{fmt(s.last_action)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function AuditTrail() {
  const { user } = useStore()
  const [logs, setLogs]         = useState([])
  const [stats, setStats]       = useState([])
  const [users, setUsers]       = useState([])   // current system users
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterAction, setFilterAction]   = useState('')
  const [filterEntity, setFilterEntity]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [logsRes, statsRes, usersRes] = await Promise.all([
        api.get('/audit/', { params: {
          action:  filterAction  || undefined,
          entity:  filterEntity  || undefined,
          limit: 200
        }}),
        api.get('/audit/stats'),
        listUsers(),
      ])
      setLogs(logsRes.data.logs || [])
      setStats(statsRes.data.officer_stats || [])
      setUsers(usersRes.data || [])
    } catch(e) {
      // listUsers might 403 for officer role - still load logs
      try {
        const [logsRes, statsRes] = await Promise.all([
          api.get('/audit/', { params: { action: filterAction || undefined, entity: filterEntity || undefined, limit: 200 }}),
          api.get('/audit/stats'),
        ])
        setLogs(logsRes.data.logs || [])
        setStats(statsRes.data.officer_stats || [])
      } catch { toast.error('Failed to load audit logs') }
    } finally { setLoading(false) }
  }, [filterAction, filterEntity])

  useEffect(() => { load() }, [load])

  // Build set of current system usernames
  const knownUsernames = new Set(users.map(u => u.username))

  // Split stats into active vs deleted/unknown
  const activeStats  = stats.filter(s => knownUsernames.size === 0 || knownUsernames.has(s.username))
  const deletedStats = stats.filter(s => knownUsernames.size > 0  && !knownUsernames.has(s.username))

  // Flag suspicious - many deletes
  const suspicious = stats.filter(s => s.deletes > 3)

  const filtered = logs.filter(l =>
    !search ||
    l.description?.toLowerCase().includes(search.toLowerCase()) ||
    l.officer_username?.toLowerCase().includes(search.toLowerCase()) ||
    l.entity_id?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{height:'100%', overflowY:'auto', padding:'1.5rem'}} className="animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ct-text font-mono flex items-center gap-2">
            <Shield size={18} className="text-ct-blue"/> Audit Trail
          </h1>
          <p className="text-xs text-ct-muted mt-0.5">
            Immutable log of all data changes - cannot be edited or deleted
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 h-9 px-3 border border-ct-border text-ct-muted rounded-lg text-xs font-mono hover:text-ct-text transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Refresh
        </button>
      </div>

      {/* Suspicious activity alert */}
      {suspicious.length > 0 && (
        <div className="bg-ct-red/5 border border-ct-red/20 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-ct-red"/>
            <p className="text-xs font-mono font-semibold text-ct-red">Suspicious Activity Detected</p>
          </div>
          {suspicious.map(s => (
            <p key={s.username} className="text-[11px] font-mono text-ct-red/80">
              ● {s.username} {s.badge_id ? `(${s.badge_id})` : ''} - {s.deletes} deletions.
              {!knownUsernames.has(s.username) && knownUsernames.size > 0 && ' ⚠ Account no longer exists.'}
            </p>
          ))}
        </div>
      )}

      {/* Officer Activity - split into active vs deleted */}
      {stats.length > 0 && (
        <div className="space-y-4 mb-5">
          <StatsTable
            rows={activeStats}
            knownUsernames={knownUsernames}
            title="Active Officers"
            color="text-ct-green"
            icon={<User size={13} className="text-ct-green"/>}
          />
          {deletedStats.length > 0 && (
            <StatsTable
              rows={deletedStats}
              knownUsernames={knownUsernames}
              title="Deleted / Unknown Accounts"
              color="text-ct-red"
              icon={<UserX size={13} className="text-ct-red"/>}
            />
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex-1 min-w-48 flex items-center gap-2 bg-ct-surface border border-ct-border rounded-lg px-3 h-9 focus-within:border-ct-blue/50">
          <Search size={12} className="text-ct-muted flex-shrink-0"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search officer, entity ID, description…"
            className="flex-1 bg-transparent text-sm font-mono text-ct-text placeholder-ct-muted outline-none"/>
          {search && <button onClick={() => setSearch('')}><X size={12} className="text-ct-muted"/></button>}
        </div>
        {[
          { val:filterAction, set:setFilterAction, label:'All Actions', opts:['create','update','delete','login','export','restore','factory_reset'] },
          { val:filterEntity, set:setFilterEntity, label:'All Entities', opts:['complaint','case','user','blacklist','backup','system'] },
        ].map(({ val, set, label, opts }) => (
          <select key={label} value={val} onChange={e => set(e.target.value)}
            className="bg-ct-surface border border-ct-border rounded-lg px-3 h-9 text-xs font-mono text-ct-text outline-none">
            <option value="" style={{background:'#0f1318'}}>{label}</option>
            {opts.map(o => <option key={o} value={o} style={{background:'#0f1318'}}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
          </select>
        ))}
      </div>

      {/* Log count */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-ct-muted font-mono">{filtered.length} entries</p>
        <p className="text-[10px] text-ct-muted font-mono">Click a row to see what changed</p>
      </div>

      {/* Logs table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-ct-muted"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-ct-muted font-mono text-sm">No audit logs found</div>
      ) : (
        <div className="bg-ct-surface border border-ct-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-ct-border bg-ct-bg/50">
            {['Timestamp','Action','Entity','Description / ID','Officer','IP Address',''].map(h => (
              <div key={h} className={clsx('text-[10px] text-ct-muted font-mono uppercase tracking-widest',
                h === 'Description / ID' ? 'flex-1' :
                h === 'Timestamp'        ? 'w-36 flex-shrink-0' :
                h === 'Action'           ? 'w-20 flex-shrink-0' :
                h === 'Entity'           ? 'w-24 flex-shrink-0' :
                h === 'Officer'          ? 'w-40 flex-shrink-0 text-right' :
                h === 'IP Address'       ? 'w-28 flex-shrink-0 text-right' : 'w-4'
              )}>{h}</div>
            ))}
          </div>
          {filtered.map(log => <AuditRow key={log.id} log={log}/>)}
        </div>
      )}
    </div>
  )
}
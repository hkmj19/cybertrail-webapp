// src/pages/CaseDetail.jsx — Full case detail with notes, traces, status management
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Edit2, Trash2, Plus, Save, X,
  FileText, Clock, User, MapPin, IndianRupee,
  AlertTriangle, CheckCircle, FolderOpen,
  Activity, MessageSquare, Loader2, ChevronDown, Search
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { getCase, updateCase, deleteCase, addCaseNote, attachTrace, assignCase, listUsers } from '../services/api'
import useStore from '../store/useStore'

const STATUS_OPTIONS = ['open','active','pending','closed','archived']
const PRIORITY_COLORS = {
  critical:'text-red-400', high:'text-ct-red',
  medium:'text-ct-amber', low:'text-ct-muted'
}
const STATUS_COLORS = {
  open:'text-ct-blue bg-ct-blue/10 border-ct-blue/20',
  active:'text-ct-green bg-ct-green/10 border-ct-green/20',
  pending:'text-ct-amber bg-ct-amber/10 border-ct-amber/20',
  closed:'text-ct-muted bg-white/5 border-white/10',
  archived:'text-ct-muted bg-white/5 border-white/10',
}
const NOTE_TYPE_COLORS = {
  observation:'text-ct-blue', action:'text-ct-green',
  evidence:'text-ct-amber', update:'text-ct-purple'
}

export default function CaseDetail() {
  const { caseId }        = useParams()
  const navigate          = useNavigate()
  const { user, graph }   = useStore()

  const [cas, setCas]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [noteContent, setNoteContent] = useState('')
  const [noteType, setNoteType]       = useState('observation')
  const [addingNote, setAddingNote]   = useState(false)
  const [activeTab, setActiveTab]     = useState('overview')
  const [savingTrace, setSavingTrace] = useState(false)
  const [users, setUsers]             = useState([])
  const [assigning, setAssigning]     = useState(false)
  const [showAssign, setShowAssign]   = useState(false)
  const [newAssignee, setNewAssignee] = useState('')
  const [assignSearch, setAssignSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await getCase(caseId)
      setCas(res.data)
      setEditForm({
        title: res.data.title, description: res.data.description,
        status: res.data.status, priority: res.data.priority,
        fir_number: res.data.fir_number || '',
        district: res.data.district || '',
        fraud_amount: res.data.fraud_amount || '',
      })
    } catch {
      navigate('/cases')
    } finally { setLoading(false) }
  }, [caseId])

  // Load assignable users separately — depends on user.role being available
  useEffect(() => {
    if (!['admin','supervisor'].includes(user?.role)) return
    listUsers()
      .then(r => setUsers(r.data || []))
      .catch(() => {})
  }, [user?.role])

  useEffect(() => { load() }, [load])

  const saveEdit = async () => {
    try {
      const res = await updateCase(caseId, {
        ...editForm,
        fraud_amount: editForm.fraud_amount ? parseFloat(editForm.fraud_amount) : null
      })
      setCas(res.data)
      setEditing(false)
      toast.success('Case updated')
    } catch {}
  }

  const handleDelete = async () => {
    if (!confirm(`Delete case ${cas.case_number}? This cannot be undone.`)) return
    await deleteCase(caseId)
    toast.success('Case deleted')
    navigate('/cases')
  }

  const submitNote = async () => {
    if (!noteContent.trim()) return
    setAddingNote(true)
    try {
      await addCaseNote(caseId, { content: noteContent, note_type: noteType })
      setNoteContent('')
      toast.success('Note added')
      load()
    } catch {} finally { setAddingNote(false) }
  }

  const saveCurrentTrace = async () => {
    if (!graph) { toast.error('No active trace — run a trace in Investigate first'); return }
    setSavingTrace(true)
    try {
      await attachTrace(caseId, {
        identifier: graph.seed_identifier,
        module: graph.module,
        depth: graph.hops_explored || 2,
        graph_data: graph,
      })
      toast.success('Trace saved to case')
      load()
    } catch {} finally { setSavingTrace(false) }
  }

  const handleAssign = async () => {
    if (!newAssignee) return
    setAssigning(true)
    try {
      await assignCase(caseId, { assigned_to: newAssignee })
      toast.success(`Case assigned to ${newAssignee}`)
      setShowAssign(false)
      setNewAssignee('')
      load()
    } catch {} finally { setAssigning(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-ct-muted"/>
    </div>
  )
  if (!cas) return null

  return (
    <div style={{height:'100%', overflowY:'auto', padding:'1.5rem'}} className="animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/cases')}
            className="mt-0.5 text-ct-muted hover:text-ct-text transition-colors">
            <ArrowLeft size={16}/>
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-ct-muted">{cas.case_number}</span>
              <span className={clsx('inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono uppercase', STATUS_COLORS[cas.status])}>
                {cas.status}
              </span>
              <span className={clsx('text-xs font-mono font-semibold', PRIORITY_COLORS[cas.priority])}>
                ● {cas.priority}
              </span>
            </div>
            {editing ? (
              <input value={editForm.title}
                onChange={e => setEditForm(f => ({...f, title:e.target.value}))}
                className="text-lg font-bold font-mono text-ct-text bg-ct-bg border border-ct-border rounded-lg px-2 py-1 outline-none focus:border-ct-blue/50 w-full max-w-lg"/>
            ) : (
              <h1 className="text-lg font-bold text-ct-text font-mono">{cas.title}</h1>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)}
                className="h-8 px-3 border border-ct-border text-ct-muted rounded-lg text-xs font-mono hover:text-ct-text transition-colors flex items-center gap-1">
                <X size={12}/> Cancel
              </button>
              <button onClick={saveEdit}
                className="h-8 px-3 bg-ct-blue text-white rounded-lg text-xs font-mono flex items-center gap-1 hover:bg-blue-500 transition-colors">
                <Save size={12}/> Save
              </button>
            </>
          ) : user?.role !== 'analyst' ? (
            <>
              <button onClick={() => window.open(`/cases/${caseId}/report`, '_blank')}
                className="h-8 px-3 border border-ct-blue/30 text-ct-blue rounded-lg text-xs font-mono hover:bg-ct-blue/5 transition-colors flex items-center gap-1">
                <FileText size={12}/> Print Report
              </button>
              <button onClick={() => setEditing(true)}
                className="h-8 px-3 border border-ct-border text-ct-muted rounded-lg text-xs font-mono hover:text-ct-text transition-colors flex items-center gap-1">
                <Edit2 size={12}/> Edit
              </button>
              {(user?.role === 'admin' || user?.role === 'supervisor') && (
                <button onClick={() => setShowAssign(v => !v)}
                  className="h-8 px-3 border border-ct-blue/30 text-ct-blue rounded-lg text-xs font-mono hover:bg-ct-blue/5 transition-colors flex items-center gap-1">
                  <User size={12}/> Assign
                </button>
              )}
              {(user?.role === 'admin' || cas.created_by === user?.username) && (
                <button onClick={handleDelete}
                  className="h-8 px-3 border border-ct-red/30 text-ct-red rounded-lg text-xs font-mono hover:bg-ct-red/5 transition-colors flex items-center gap-1">
                  <Trash2 size={12}/> Delete
                </button>
              )}
            </>
          ) : (
            <span className="text-[10px] font-mono text-ct-muted px-2 py-1 border border-ct-border rounded-lg">
              👁 Read-only
            </span>
          )}
        </div>
      </div>

      {/* Quick status change — hidden for analysts */}
      {!editing && user?.role !== 'analyst' && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] text-ct-muted font-mono">Change status:</span>
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={async () => {
              try {
                await updateCase(caseId, {status:s})
                load()
              } catch(e) {
                const msg = e?.response?.data?.detail
                if (msg) toast.error(msg, { duration: 5000 })
              }
            }}
              className={clsx(
                'px-2 py-0.5 rounded text-[10px] font-mono uppercase border transition-all',
                cas.status === s ? STATUS_COLORS[s] : 'border-ct-border text-ct-muted hover:text-ct-text'
              )}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Assignment panel */}
      {showAssign && (user?.role === 'admin' || user?.role === 'supervisor') && (
        <div className="mb-4 bg-ct-surface border border-ct-blue/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono font-semibold text-ct-text flex items-center gap-2">
              <User size={12} className="text-ct-blue"/> Assign to
            </span>
            <button onClick={() => { setShowAssign(false); setAssignSearch(''); setNewAssignee('') }}
              className="text-ct-muted hover:text-ct-text"><X size={13}/></button>
          </div>

          {/* Search input */}
          <div className="flex items-center gap-2 bg-ct-bg border border-ct-border rounded-lg px-3 h-9 mb-3 focus-within:border-ct-blue/50 transition-colors">
            <Search size={12} className="text-ct-muted flex-shrink-0"/>
            <input
              value={assignSearch}
              onChange={e => setAssignSearch(e.target.value)}
              placeholder="Search by name, username or role…"
              autoFocus
              className="flex-1 bg-transparent text-sm font-mono text-ct-text placeholder-ct-muted outline-none"
            />
            {assignSearch && (
              <button onClick={() => setAssignSearch('')} className="text-ct-muted hover:text-ct-text">
                <X size={11}/>
              </button>
            )}
          </div>

          {/* User list */}
          {(() => {
            const q = assignSearch.toLowerCase()
            const filtered = users.filter(u =>
              u.is_active &&
              (!q || u.username.toLowerCase().includes(q) ||
               (u.full_name || '').toLowerCase().includes(q) ||
               u.role.toLowerCase().includes(q) ||
               (u.badge_id || '').toLowerCase().includes(q))
            )
            return filtered.length === 0 ? (
              <p className="text-[11px] font-mono text-ct-muted text-center py-3">
                {users.length === 0 ? 'Loading users…' : 'No users match your search'}
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {filtered.map(u => (
                  <button
                    key={u.id}
                    onClick={() => setNewAssignee(u.username)}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all',
                      newAssignee === u.username
                        ? 'bg-ct-blue/10 border border-ct-blue/30'
                        : 'hover:bg-white/[0.04] border border-transparent'
                    )}>
                    <div className="w-7 h-7 rounded-full bg-ct-border flex items-center justify-center flex-shrink-0 text-[10px] font-mono text-ct-muted font-semibold uppercase">
                      {(u.full_name || u.username)[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-semibold text-ct-text truncate">{u.full_name || u.username}</p>
                      <p className="text-[10px] font-mono text-ct-muted truncate">{u.username} · {u.badge_id || 'no badge'}</p>
                    </div>
                    <span className={clsx('text-[9px] font-mono px-1.5 py-0.5 rounded border capitalize flex-shrink-0',
                      u.role === 'supervisor' ? 'text-ct-blue   bg-ct-blue/10   border-ct-blue/20' :
                      u.role === 'admin'      ? 'text-ct-red    bg-ct-red/10    border-ct-red/20'  :
                                                'text-ct-green  bg-ct-green/10  border-ct-green/20')}>
                      {u.role}
                    </span>
                    {newAssignee === u.username && (
                      <CheckCircle size={13} className="text-ct-blue flex-shrink-0"/>
                    )}
                  </button>
                ))}
              </div>
            )
          })()}

          {/* Assign button */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ct-border">
            {newAssignee && (
              <p className="text-[10px] font-mono text-ct-muted flex-1">
                Assigning to <span className="text-ct-blue font-semibold">{newAssignee}</span>
              </p>
            )}
            <button onClick={handleAssign} disabled={!newAssignee || assigning}
              className="ml-auto h-8 px-4 bg-ct-blue text-white rounded-lg text-xs font-mono flex items-center gap-1.5 hover:bg-blue-500 transition-all disabled:opacity-40">
              {assigning ? <Loader2 size={12} className="animate-spin"/> : <User size={12}/>}
              {assigning ? 'Assigning…' : 'Confirm Assign'}
            </button>
          </div>
        </div>
      )}

      {/* Closed / Archived banner */}
      {(cas.status === 'closed' || cas.status === 'archived') && (
        <div className={clsx(
          'flex items-center gap-3 px-4 py-3 rounded-xl mb-4 border text-sm font-mono',
          cas.status === 'archived'
            ? 'bg-ct-muted/5 border-ct-muted/20 text-ct-muted'
            : 'bg-ct-green/5 border-ct-green/20 text-ct-green'
        )}>
          <span>{cas.status === 'archived' ? '🔒' : '✅'}</span>
          <div>
            <span className="font-semibold capitalize">{cas.status} case.</span>
            {cas.status === 'archived'
              ? ' This case is permanently archived and cannot be modified.'
              : (user?.role === 'admin' || user?.role === 'supervisor')
                ? ' To add new evidence, reopen by clicking Active or Pending above.'
                : ' Contact your supervisor to reopen this case.'
            }
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-ct-border mb-4">
        {[
          { id:'overview', label:'Overview', icon:FolderOpen },
          { id:'notes',    label:`Notes (${cas.note_count})`, icon:MessageSquare },
          { id:'traces',   label:`Traces (${cas.trace_count})`, icon:Activity },
        ].map(({ id, label, icon:Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-mono border-b-2 transition-all',
              activeTab === id
                ? 'border-ct-blue text-ct-blue'
                : 'border-transparent text-ct-muted hover:text-ct-text'
            )}>
            <Icon size={12}/>{label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Case details card */}
          <div className="bg-ct-surface border border-ct-border rounded-xl p-4">
            <h3 className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-3">Case Details</h3>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-ct-muted font-mono">Priority</label>
                  <select value={editForm.priority}
                    onChange={e => setEditForm(f=>({...f,priority:e.target.value}))}
                    className="w-full mt-1 bg-ct-bg border border-ct-border rounded-lg px-2 py-1.5 text-xs font-mono text-ct-text outline-none">
                    {['critical','high','medium','low'].map(p=>
                      <option key={p} value={p} style={{background:'#0f1318'}}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-ct-muted font-mono">FIR Number</label>
                  <input value={editForm.fir_number}
                    onChange={e => setEditForm(f=>({...f,fir_number:e.target.value}))}
                    className="w-full mt-1 bg-ct-bg border border-ct-border rounded-lg px-2 py-1.5 text-xs font-mono text-ct-text outline-none focus:border-ct-blue/50"/>
                </div>
                <div>
                  <label className="text-[10px] text-ct-muted font-mono">District</label>
                  <input value={editForm.district}
                    onChange={e => setEditForm(f=>({...f,district:e.target.value}))}
                    className="w-full mt-1 bg-ct-bg border border-ct-border rounded-lg px-2 py-1.5 text-xs font-mono text-ct-text outline-none focus:border-ct-blue/50"/>
                </div>
                <div>
                  <label className="text-[10px] text-ct-muted font-mono">Fraud Amount (₹)</label>
                  <input type="number" value={editForm.fraud_amount}
                    onChange={e => setEditForm(f=>({...f,fraud_amount:e.target.value}))}
                    className="w-full mt-1 bg-ct-bg border border-ct-border rounded-lg px-2 py-1.5 text-xs font-mono text-ct-text outline-none focus:border-ct-blue/50"/>
                </div>
                <div>
                  <label className="text-[10px] text-ct-muted font-mono">Description</label>
                  <textarea value={editForm.description}
                    onChange={e => setEditForm(f=>({...f,description:e.target.value}))}
                    rows={3}
                    className="w-full mt-1 bg-ct-bg border border-ct-border rounded-lg px-2 py-1.5 text-xs font-mono text-ct-text outline-none focus:border-ct-blue/50 resize-none"/>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[
                  { label:'FIR Number',    value:cas.fir_number,   icon:FileText },
                  { label:'District',      value:cas.district,     icon:MapPin },
                  { label:'Complainant',   value:cas.complainant,  icon:User },
                  { label:'Created by',    value:cas.created_by,   icon:User },
                  { label:'Assigned to',   value:cas.assigned_to,  icon:User },
                ].map(({ label, value, icon:Icon }) => value ? (
                  <div key={label} className="flex items-center gap-2">
                    <Icon size={11} className="text-ct-muted flex-shrink-0"/>
                    <span className="text-[10px] text-ct-muted font-mono w-24 flex-shrink-0">{label}</span>
                    <span className="text-xs font-mono text-ct-text">{value}</span>
                  </div>
                ) : null)}
                {cas.fraud_amount > 0 && (
                  <div className="flex items-center gap-2">
                    <IndianRupee size={11} className="text-ct-amber flex-shrink-0"/>
                    <span className="text-[10px] text-ct-muted font-mono w-24 flex-shrink-0">Fraud Amount</span>
                    <span className="text-xs font-mono text-ct-amber font-semibold">
                      ₹{cas.fraud_amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
                {cas.description && (
                  <div className="pt-2 border-t border-ct-border">
                    <p className="text-xs text-ct-muted font-mono leading-relaxed">{cas.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timeline card */}
          <div className="bg-ct-surface border border-ct-border rounded-xl p-4">
            <h3 className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-3">Timeline</h3>
            <div className="space-y-2">
              {[
                { label:'Created',  value:cas.created_at },
                { label:'Updated',  value:cas.updated_at },
                { label:'Closed',   value:cas.closed_at  },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex items-center gap-2">
                  <Clock size={11} className="text-ct-muted flex-shrink-0"/>
                  <span className="text-[10px] text-ct-muted font-mono w-16 flex-shrink-0">{label}</span>
                  <span className="text-xs font-mono text-ct-text">
                    {new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })}
                  </span>
                </div>
              ) : null)}
            </div>
            {/* Save trace button */}
            {graph && user?.role !== 'analyst' && !['closed','archived'].includes(cas.status) && (
              <div className="mt-4 pt-3 border-t border-ct-border">
                <p className="text-[10px] text-ct-muted font-mono mb-2">
                  Active trace: <span className="text-ct-cyan">{graph.seed_identifier}</span> ({graph.module})
                </p>
                <button onClick={saveCurrentTrace} disabled={savingTrace}
                  className="w-full h-8 bg-ct-green/10 border border-ct-green/20 text-ct-green rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 hover:bg-ct-green/20 transition-colors disabled:opacity-50">
                  {savingTrace ? <Loader2 size={12} className="animate-spin"/> : <Activity size={12}/>}
                  Save Current Trace to Case
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── NOTES TAB ── */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          {/* Add note — hidden for analysts */}
          {user?.role !== 'analyst' && !['closed','archived'].includes(cas.status) && (
            <div className="bg-ct-surface border border-ct-border rounded-xl p-4">
              <h3 className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-3">Add Note</h3>
              <div className="flex gap-2 mb-2">
                {['observation','action','evidence','update'].map(t => (
                  <button key={t} onClick={() => setNoteType(t)}
                    className={clsx('px-2 py-0.5 rounded text-[10px] font-mono border transition-all',
                      noteType === t ? 'border-ct-blue/50 text-ct-blue bg-ct-blue/10' : 'border-ct-border text-ct-muted hover:text-ct-text')}>
                    {t}
                  </button>
                ))}
              </div>
              <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)}
                placeholder="Add investigation note, observation, or action taken..."
                rows={3}
                className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 resize-none mb-2"/>
              <button onClick={submitNote} disabled={!noteContent.trim() || addingNote}
                className="h-8 px-4 bg-ct-blue text-white rounded-lg text-xs font-mono flex items-center gap-1.5 hover:bg-blue-500 transition-all disabled:opacity-50">
                {addingNote ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>}
                Add Note
              </button>
            </div>
          )}

          {/* Notes list */}
          {cas.notes.length === 0 ? (
            <div className="text-center py-10 text-ct-muted text-sm font-mono">No notes yet</div>
          ) : (
            <div className="space-y-2">
              {[...cas.notes].reverse().map(note => (
                <div key={note.id} className="bg-ct-surface border border-ct-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={clsx('text-[10px] font-mono uppercase font-semibold', NOTE_TYPE_COLORS[note.note_type])}>
                      {note.note_type}
                    </span>
                    <span className="text-[10px] text-ct-muted font-mono">by {note.created_by}</span>
                    <span className="text-[10px] text-ct-muted font-mono ml-auto">
                      {new Date(note.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })}
                    </span>
                  </div>
                  <p className="text-sm text-ct-text font-mono leading-relaxed">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TRACES TAB ── */}
      {activeTab === 'traces' && (
        <div className="space-y-4">
          {/* Save current trace — hidden for analysts */}
          {graph && user?.role !== 'analyst' && !['closed','archived'].includes(cas.status) && (
            <div className="bg-ct-surface border border-ct-green/20 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-ct-text font-semibold">Active Trace Available</p>
                  <p className="text-[10px] text-ct-muted font-mono mt-0.5">
                    {graph.module} · {graph.seed_identifier} · {graph.total_nodes} nodes · {graph.total_edges} edges
                    {graph.flagged_count > 0 && <span className="text-ct-red ml-2">· {graph.flagged_count} flagged</span>}
                  </p>
                </div>
                <button onClick={saveCurrentTrace} disabled={savingTrace}
                  className="h-8 px-3 bg-ct-green/10 border border-ct-green/20 text-ct-green rounded-lg text-xs font-mono flex items-center gap-1.5 hover:bg-ct-green/20 transition-colors disabled:opacity-50">
                  {savingTrace ? <Loader2 size={12} className="animate-spin"/> : <Activity size={12}/>}
                  Save to Case
                </button>
              </div>
            </div>
          )}

          {cas.traces.length === 0 ? (
            <div className="text-center py-10 text-ct-muted text-sm font-mono">
              No traces saved yet. Run a trace in Investigate and save it here.
            </div>
          ) : (
            <div className="space-y-2">
              {cas.traces.map(t => (
                <TraceCard key={t.id} trace={t}/>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Expandable Trace Card ─────────────────────────────────
function TraceCard({ trace: t }) {
  const [open, setOpen] = useState(false)

  const nodes   = t.graph_data?.nodes  || []
  const edges   = t.graph_data?.edges  || []
  const flagged = nodes.filter(n => n.flagged)

  // Fraud phones = phones that are SOURCE of a 'registered' or 'linked' edge TO a fraud UPI
  // OR phones that appear as targets of outgoing edges from fraud accounts
  const fraudUpiIds = new Set(
    nodes.filter(n => n.node_type === 'upi_account' && n.flagged).map(n => n.id)
  )
  // A phone is a fraud phone if it sends a non-money edge to a fraud UPI (registered/linked)
  const fraudPhoneIds = new Set(
    edges
      .filter(e =>
        fraudUpiIds.has(e.target) &&
        (!e.label || e.label === 'linked' || e.label === 'registered')
      )
      .map(e => e.source)
  )
  // Victims = phones that sent MONEY to a fraud UPI (have amount on their edge)
  const victimPhoneIds = new Set(
    edges
      .filter(e => fraudUpiIds.has(e.target) && e.amount > 0)
      .map(e => e.source)
  )
  const victims = nodes.filter(n =>
    n.node_type === 'phone' && victimPhoneIds.has(n.id) && !fraudPhoneIds.has(n.id)
  )
  const fraudAccounts = nodes.filter(n =>
    (n.node_type === 'upi_account' || n.node_type === 'bank_account') && n.flagged ||
    (n.node_type === 'phone' && fraudPhoneIds.has(n.id))
  )

  const NODE_COLORS = {
    wallet_btc:'text-blue-400', wallet_eth:'text-blue-300',
    wallet_tron:'text-ct-cyan', upi_account:'text-ct-green',
    bank_account:'text-ct-green', phone:'text-ct-purple',
    company:'text-ct-amber', person:'text-ct-muted',
    unknown:'text-ct-muted',
  }

  return (
    <div className="bg-ct-surface border border-ct-border rounded-xl overflow-hidden">
      {/* Header — always visible, click to expand */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className={clsx(
            'text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase',
            t.module === 'multi'  ? 'text-ct-cyan   bg-ct-cyan/10   border-ct-cyan/20'  :
            t.module === 'upi'    ? 'text-ct-green  bg-ct-green/10  border-ct-green/20' :
            t.module === 'crypto' ? 'text-ct-blue   bg-ct-blue/10   border-ct-blue/20'  :
            t.module === 'shell'  ? 'text-ct-amber  bg-ct-amber/10  border-ct-amber/20' :
                                    'text-ct-purple bg-ct-purple/10 border-ct-purple/20'
          )}>{t.module}</span>
          <span className="text-sm font-mono font-semibold text-ct-text truncate max-w-xs">{t.identifier}</span>
          <span className="text-[10px] font-mono text-ct-muted">depth {t.depth}</span>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="text-ct-text font-semibold">{t.node_count}</span>
            <span className="text-ct-muted">nodes</span>
            <span className="text-ct-text font-semibold">{t.edge_count}</span>
            <span className="text-ct-muted">edges</span>
            {t.flagged > 0 && (
              <span className="text-ct-red font-semibold">{t.flagged} flagged</span>
            )}
          </div>
          <span className="text-[10px] text-ct-muted font-mono">
            {new Date(t.traced_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })} · {t.traced_by}
          </span>
          <span className="text-ct-muted">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expandable detail */}
      {open && (
        <div className="border-t border-ct-border bg-ct-bg/50 p-4 space-y-4 animate-fade-in">

          {/* Summary row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label:'Total Nodes',    value:t.node_count,    color:'text-ct-text' },
              { label:'Total Edges',    value:t.edge_count,    color:'text-ct-text' },
              { label:'Flagged',        value:t.flagged,       color:'text-ct-red'  },
              { label:'Fraud Amount',   value:t.graph_data?.total_value_inr
                  ? `₹${(t.graph_data.total_value_inr/100000).toFixed(2)}L`
                  : '—',                                       color:'text-ct-amber'},
            ].map(s => (
              <div key={s.label} className="bg-ct-surface border border-ct-border rounded-lg p-3 text-center">
                <div className={clsx('text-lg font-bold font-mono', s.color)}>{s.value}</div>
                <div className="text-[10px] text-ct-muted font-mono mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Victims (complainant phones) */}
          {victims.length > 0 && (
            <div>
              <p className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-2">
                Victim Phone Numbers ({victims.length})
              </p>
              <div className="space-y-1">
                {victims.map(n => {
                  // Find edge amount for this victim
                  const edge = edges.find(e => e.source === n.id || e.target === n.id)
                  const amt  = edge?.amount
                  return (
                    <div key={n.id} className="flex items-center gap-3 bg-ct-surface border border-ct-border rounded-lg px-3 py-2">
                      <span className="w-2 h-2 rounded-full bg-ct-purple flex-shrink-0"/>
                      <span className="text-xs font-mono text-ct-purple flex-1">{n.label || n.id}</span>
                      {amt > 0 && (
                        <span className="text-[10px] font-mono text-ct-amber">
                          ₹{Number(amt).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Flagged fraud accounts */}
          {fraudAccounts.length > 0 && (
            <div>
              <p className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-2">
                Fraud Accounts ({fraudAccounts.length})
              </p>
              <div className="space-y-1">
                {fraudAccounts.map(n => (
                  <div key={n.id} className="flex items-center gap-3 bg-ct-red/5 border border-ct-red/20 rounded-lg px-3 py-2">
                    <span className="w-2 h-2 rounded-full bg-ct-red flex-shrink-0"/>
                    <span className="text-xs font-mono text-ct-red flex-1">{n.label || n.id}</span>
                    <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase',
                      'text-ct-red bg-ct-red/10 border-ct-red/20')}>
                      {n.node_type?.replace('_', ' ')}
                    </span>
                    <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded',
                      n.risk_level === 'high' ? 'text-ct-red bg-ct-red/10' : 'text-ct-amber bg-ct-amber/10')}>
                      {n.risk_level || 'flagged'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All nodes table */}
          {nodes.length > 0 && (
            <div>
              <p className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-2">
                All Entities in Graph ({nodes.length})
              </p>
              <div className="bg-ct-surface border border-ct-border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ct-border bg-ct-bg/50">
                      {['Entity ID','Type','Risk','Flagged'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[10px] text-ct-muted font-mono uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((n, i) => (
                      <tr key={n.id} className={clsx(
                        'border-b border-ct-border/50',
                        n.flagged ? 'bg-ct-red/5' : i % 2 === 0 ? '' : 'bg-white/[0.01]'
                      )}>
                        <td className="px-3 py-1.5">
                          <span className={clsx('text-xs font-mono', NODE_COLORS[n.node_type] || 'text-ct-text')}>
                            {n.label || n.id}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-[10px] font-mono text-ct-muted capitalize">
                          {(n.node_type || 'unknown').replace(/_/g,' ')}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={clsx('text-[10px] font-mono',
                            n.risk_level === 'high'   ? 'text-ct-red' :
                            n.risk_level === 'medium' ? 'text-ct-amber' :
                            n.risk_level === 'low'    ? 'text-ct-green' : 'text-ct-muted'
                          )}>{n.risk_level || '—'}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          {n.flagged
                            ? <span className="text-[10px] font-mono text-ct-red">● Yes</span>
                            : <span className="text-[10px] font-mono text-ct-muted">No</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Connections / edges */}
          {edges.length > 0 && (
            <div>
              <p className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-2">
                Money Flow / Connections ({edges.length})
              </p>
              <div className="space-y-1">
                {edges.map((e, i) => {
                  const seed = t.identifier
                  const hasAmount = e.amount > 0
                  // Use stored metadata direction (new traces) or derive from seed (old traces)
                  const metaDir = e.metadata?.direction
                  const isInflow  = metaDir === 'inflow'  || (!metaDir && e.target === seed && hasAmount)
                  const isOutflow = metaDir === 'outflow' || (!metaDir && e.source === seed && hasAmount)
                  return (
                    <div key={i} className="flex items-center gap-2 text-[11px] font-mono bg-ct-surface border border-ct-border rounded-lg px-3 py-1.5">
                      {isInflow && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ct-red/10 text-ct-red border border-ct-red/20 flex-shrink-0">IN</span>
                      )}
                      {isOutflow && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ct-amber/10 text-ct-amber border border-ct-amber/20 flex-shrink-0">OUT</span>
                      )}
                      {!isInflow && !isOutflow && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ct-surface text-ct-muted border border-ct-border flex-shrink-0">LNK</span>
                      )}
                      {/* Show correct direction: for inflow display non-seed → seed */}
                      <span className="text-ct-text truncate max-w-[160px]">
                        {isInflow ? (e.source === seed ? e.target : e.source) : e.source}
                      </span>
                      <span className="text-ct-muted flex-shrink-0">──</span>
                      {e.label && <span className={clsx('font-semibold flex-shrink-0', hasAmount ? (isInflow ? 'text-ct-red' : 'text-ct-amber') : 'text-ct-muted')}>{e.label}</span>}
                      <span className="text-ct-muted flex-shrink-0">──→</span>
                      <span className="text-ct-text truncate max-w-[160px]">
                        {isInflow ? seed : e.target}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
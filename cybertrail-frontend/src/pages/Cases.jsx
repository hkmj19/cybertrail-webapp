// src/pages/Cases.jsx - Case Management page
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen, Plus, Search, Filter, Clock,
  AlertTriangle, CheckCircle, Archive, X,
  ChevronRight, Tag, User, MapPin, IndianRupee,
  Loader2, FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { listCases, createCase, updateCase, deleteCase, getCaseStats } from '../services/api'
import useStore from '../store/useStore'

const STATUS_COLORS = {
  open:     'text-ct-blue   bg-ct-blue/10   border-ct-blue/20',
  active:   'text-ct-green  bg-ct-green/10  border-ct-green/20',
  pending:  'text-ct-amber  bg-ct-amber/10  border-ct-amber/20',
  closed:   'text-ct-muted  bg-white/5      border-white/10',
  archived: 'text-ct-muted  bg-white/5      border-white/10',
}

const PRIORITY_COLORS = {
  critical: 'text-red-400   bg-red-400/10   border-red-400/20',
  high:     'text-ct-red    bg-ct-red/10    border-ct-red/20',
  medium:   'text-ct-amber  bg-ct-amber/10  border-ct-amber/20',
  low:      'text-ct-muted  bg-white/5      border-white/10',
}

const PRIORITY_DOT = {
  critical: 'bg-red-400 animate-pulse',
  high:     'bg-ct-red',
  medium:   'bg-ct-amber',
  low:      'bg-ct-muted',
}

function Badge({ label, colorClass }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider', colorClass)}>
      {label}
    </span>
  )
}

function StatCard({ label, value, color = 'text-ct-text', sub }) {
  return (
    <div className="bg-ct-surface border border-ct-border rounded-xl p-4">
      <div className={clsx('text-2xl font-bold font-mono mb-0.5', color)}>{value ?? '-'}</div>
      <div className="text-xs text-ct-muted">{label}</div>
      {sub && <div className="text-[10px] text-ct-muted/60 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Create Case Modal ─────────────────────────────────────
function CreateCaseModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium',
    fir_number: '', district: '', complainant: '', fraud_amount: '',
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setLoading(true)
    try {
      const payload = {
        ...form,
        fraud_amount: form.fraud_amount ? parseFloat(form.fraud_amount) : null,
      }
      const res = await createCase(payload)
      onCreate(res.data)
      toast.success(`Case ${res.data.case_number} created`)
      onClose()
    } catch {} finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-ct-surface border border-ct-border rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-ct-border">
          <div>
            <h2 className="text-sm font-semibold text-ct-text font-mono">New Investigation Case</h2>
            <p className="text-[10px] text-ct-muted mt-0.5">Create a case to track this investigation</p>
          </div>
          <button onClick={onClose} className="text-ct-muted hover:text-ct-text transition-colors">
            <X size={16}/>
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1 tracking-widest">Case Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="e.g. UPI fraud ring - Bengaluru"
              className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 transition-colors"/>
          </div>

          {/* Priority + FIR */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1 tracking-widest">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}
                className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text outline-none focus:border-ct-blue/50">
                {['critical','high','medium','low'].map(p => (
                  <option key={p} value={p} style={{background:'#0f1318'}}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1 tracking-widest">FIR Number</label>
              <input value={form.fir_number} onChange={e => set('fir_number', e.target.value)}
                placeholder="FIR/2024/001"
                className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 transition-colors"/>
            </div>
          </div>

          {/* District + Complainant */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1 tracking-widest">District</label>
              <input value={form.district} onChange={e => set('district', e.target.value)}
                placeholder="Bengaluru Urban"
                className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 transition-colors"/>
            </div>
            <div>
              <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1 tracking-widest">Fraud Amount (₹)</label>
              <input type="number" value={form.fraud_amount} onChange={e => set('fraud_amount', e.target.value)}
                placeholder="50000"
                className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 transition-colors"/>
            </div>
          </div>

          {/* Complainant */}
          <div>
            <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1 tracking-widest">Complainant Name</label>
            <input value={form.complainant} onChange={e => set('complainant', e.target.value)}
              placeholder="Victim / complainant name"
              className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 transition-colors"/>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1 tracking-widest">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Brief description of the case..."
              rows={3}
              className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 transition-colors resize-none"/>
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t border-ct-border">
          <button onClick={onClose} className="flex-1 h-10 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={loading}
            className="flex-1 h-10 bg-ct-blue text-white rounded-lg text-sm font-mono font-semibold flex items-center justify-center gap-2 hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
            Create Case
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────
export default function Cases() {
  const navigate           = useNavigate()
  const { user }           = useStore()
  const [cases, setCases]  = useState([])
  const [stats, setStats]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch]  = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [casesRes, statsRes] = await Promise.all([
        listCases({ status: filterStatus || undefined, priority: filterPriority || undefined, limit: 100 }),
        getCaseStats(),
      ])
      setCases(casesRes.data)
      setStats(statsRes.data)
    } catch {} finally { setLoading(false) }
  }, [filterStatus, filterPriority])

  useEffect(() => { load() }, [load])

  const filtered = cases.filter(c =>
    !search ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.case_number.toLowerCase().includes(search.toLowerCase()) ||
    (c.fir_number || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleStatusChange = async (caseId, newStatus) => {
    try {
      await updateCase(caseId, { status: newStatus })
      toast.success(`Status updated to ${newStatus}`)
      load()
    } catch {}
  }

  return (
    <div style={{height:'100%', overflowY:'auto', padding:'1.5rem'}} className="animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ct-text font-mono flex items-center gap-2">
            <FolderOpen size={18} className="text-ct-blue"/> Case Management
          </h1>
          <p className="text-xs text-ct-muted mt-0.5">Track and manage investigation cases</p>
        </div>
        {user?.role !== 'analyst' && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ct-blue text-white rounded-lg text-sm font-mono font-semibold hover:bg-blue-500 active:scale-95 transition-all">
            <Plus size={14}/> New Case
          </button>
        )}
      </div>

      {/* Read-only banner for analysts */}
      {user?.role === 'analyst' && (
        <div className="flex items-center gap-2 bg-ct-amber/5 border border-ct-amber/20 rounded-xl px-4 py-3 mb-4">
          <AlertTriangle size={14} className="text-ct-amber flex-shrink-0"/>
          <p className="text-xs font-mono text-ct-amber">
            <span className="font-semibold">Read-only access.</span> Analysts can view cases and graphs but cannot create, edit, or delete. Contact your supervisor to be assigned Officer role.
          </p>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Cases"   value={stats.total}        color="text-ct-text"/>
          <StatCard label="Open"          value={stats.open_cases}   color="text-ct-blue"/>
          <StatCard label="Active"        value={stats.active_cases} color="text-ct-green"/>
          <StatCard label="Critical"      value={stats.critical}     color="text-ct-red"/>
          <StatCard label="Total Fraud"
            value={stats.total_fraud_amount ? `₹${(stats.total_fraud_amount/100000).toFixed(1)}L` : '₹0'}
            color="text-ct-amber"
            sub="traced amount"/>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-ct-surface border border-ct-border rounded-lg px-3 h-9 focus-within:border-ct-blue/50 transition-colors">
          <Search size={13} className="text-ct-muted flex-shrink-0"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search cases by title, number, FIR..."
            className="flex-1 bg-transparent text-sm font-mono text-ct-text placeholder-ct-muted outline-none"/>
          {search && <button onClick={() => setSearch('')} className="text-ct-muted hover:text-ct-text"><X size={12}/></button>}
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-ct-surface border border-ct-border rounded-lg px-3 h-9 text-xs font-mono text-ct-text outline-none">
          <option value="" style={{background:'#0f1318'}}>All Status</option>
          {['open','active','pending','closed','archived'].map(s => (
            <option key={s} value={s} style={{background:'#0f1318'}}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
          ))}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="bg-ct-surface border border-ct-border rounded-lg px-3 h-9 text-xs font-mono text-ct-text outline-none">
          <option value="" style={{background:'#0f1318'}}>All Priority</option>
          {['critical','high','medium','low'].map(p => (
            <option key={p} value={p} style={{background:'#0f1318'}}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Case List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-ct-muted"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen size={32} className="text-ct-border mb-3"/>
          <p className="text-ct-muted text-sm font-mono">No cases found</p>
          {user?.role === 'analyst' ? (
            <p className="text-ct-muted/50 text-xs mt-1">No cases have been assigned to you yet</p>
          ) : (
            <>
              <p className="text-ct-muted/50 text-xs mt-1">Create your first case to start tracking an investigation</p>
              <button onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 border border-ct-blue/30 text-ct-blue text-xs font-mono rounded-lg hover:bg-ct-blue/5 transition-colors">
                + Create First Case
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id}
              onClick={() => navigate(`/cases/${c.id}`)}
              className="bg-ct-surface border border-ct-border rounded-xl p-4 hover:border-ct-blue/30 cursor-pointer transition-all group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Priority dot */}
                  <div className={clsx('w-2 h-2 rounded-full mt-2 flex-shrink-0', PRIORITY_DOT[c.priority])}/>
                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-[10px] font-mono text-ct-muted">{c.case_number}</span>
                      <Badge label={c.status}   colorClass={STATUS_COLORS[c.status]}/>
                      <Badge label={c.priority} colorClass={PRIORITY_COLORS[c.priority]}/>
                      {c.fir_number && (
                        <span className="text-[10px] font-mono text-ct-muted bg-white/5 px-1.5 py-0.5 rounded">
                          FIR: {c.fir_number}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-ct-text font-mono truncate mb-1.5">{c.title}</p>
                    {/* Meta row */}
                    <div className="flex items-center gap-4 text-[10px] text-ct-muted font-mono flex-wrap">
                      <span className="flex items-center gap-1"><User size={10}/>{c.created_by}</span>
                      {c.district && <span className="flex items-center gap-1"><MapPin size={10}/>{c.district}</span>}
                      {c.fraud_amount > 0 && (
                        <span className="flex items-center gap-1 text-ct-amber">
                          <IndianRupee size={10}/>₹{(c.fraud_amount/100000).toFixed(1)}L
                        </span>
                      )}
                      <span className="flex items-center gap-1"><FileText size={10}/>{c.trace_count} traces</span>
                      <span className="flex items-center gap-1"><Clock size={10}/>{new Date(c.updated_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric' })}</span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-ct-border group-hover:text-ct-blue transition-colors flex-shrink-0 mt-1"/>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCaseModal
          onClose={() => setShowCreate(false)}
          onCreate={() => load()}
        />
      )}
    </div>
  )
}
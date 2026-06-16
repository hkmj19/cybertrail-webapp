// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bitcoin, CreditCard, Building2, Phone,
  Layers, AlertTriangle, Database, Activity,
  TrendingUp, Shield, ArrowRight, Folder,
  FolderOpen, CheckCircle, Zap
} from 'lucide-react'
import { getGraphStats, getBlacklistStats, getComplaintSummary, getSystemStatus, getCaseStats } from '../services/api'
import useStore from '../store/useStore'
import clsx from 'clsx'

const QUICK_TRACES = [
  { label: 'Crypto tracer',  desc: 'BTC · ETH · TRON wallets',     icon: Bitcoin,    mod: 'crypto', color: 'text-ct-blue',   border: 'border-ct-blue/20',   bg: 'bg-ct-blue/5'   },
  { label: 'UPI fraud',      desc: 'UPI IDs · mule chains',        icon: CreditCard, mod: 'upi',    color: 'text-ct-green',  border: 'border-ct-green/20',  bg: 'bg-ct-green/5'  },
  { label: 'Shell company',  desc: 'MCA21 · beneficial ownership',  icon: Building2,  mod: 'shell',  color: 'text-ct-amber',  border: 'border-ct-amber/20',  bg: 'bg-ct-amber/5'  },
  { label: 'Social graph',   desc: 'Phone · communication networks',icon: Phone,      mod: 'social', color: 'text-ct-purple', border: 'border-ct-purple/20', bg: 'bg-ct-purple/5' },
  { label: 'Multi-layer',    desc: 'All modules combined',          icon: Layers,     mod: 'multi',  color: 'text-ct-cyan',   border: 'border-ct-cyan/20',   bg: 'bg-ct-cyan/5'   },
]

function StatCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="bg-ct-surface border border-ct-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div className={clsx('p-2 rounded-lg', color.replace('text-','bg-') + '/10')}>
          <Icon size={16} className={color} />
        </div>
      </div>
      <div className={clsx('text-2xl font-semibold font-mono mb-0.5', color)}>{value ?? '—'}</div>
      <div className="text-xs text-ct-muted">{label}</div>
      {sub && <div className="text-[10px] text-ct-muted/60 mt-0.5">{sub}</div>}
    </div>
  )
}

function CaseStatPill({ label, value, color }) {
  return (
    <div className="flex flex-col items-center">
      <div className={clsx('text-2xl font-semibold font-mono', color)}>{value ?? '—'}</div>
      <div className="text-[10px] text-ct-muted uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useStore()
  const [graphStats,     setGraphStats]     = useState(null)
  const [blStats,        setBlStats]        = useState(null)
  const [complaintStats, setComplaintStats] = useState(null)
  const [caseStats,      setCaseStats]      = useState(null)
  const [status,         setStatus]         = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    getGraphStats().then(r => setGraphStats(r.data)).catch(() => {})
    getBlacklistStats().then(r => setBlStats(r.data)).catch(() => {})
    getComplaintSummary().then(r => setComplaintStats(r.data)).catch(() => {})
    getSystemStatus().then(r => setStatus(r.data)).catch(() => {})
    getCaseStats().then(r => setCaseStats(r.data)).catch(() => {})
  }, [])

  const goInvestigate = (mod) => navigate('/investigate', { state: { module: mod } })

  const totalFraudCr = caseStats?.total_fraud_amount
    ? (caseStats.total_fraud_amount / 10000000).toFixed(2)
    : null

  return (
    <div style={{height:'100%', overflowY:'auto', padding:'1.5rem'}} className="animate-fade-in">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ct-text mb-1 font-mono">
          <span className="text-ct-cyan">Cyber</span>Trail
          <span className="text-ct-muted text-sm ml-3 font-normal">Financial Crime Intelligence</span>
        </h1>
        <p className="text-ct-muted text-sm">
          Graph-based investigation platform for tracing financial crime networks.
        </p>
      </div>

      {/* ── Case Stats ── */}
      <div className="bg-ct-surface border border-ct-border rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Folder size={14} className="text-ct-blue" />
            <span className="text-sm font-medium text-ct-text font-mono">Investigation Cases</span>
            {user?.role === 'officer' && (
              <span className="text-[10px] font-mono text-ct-muted">(your cases)</span>
            )}
          </div>
          <button
            onClick={() => navigate('/cases')}
            className="text-[10px] font-mono text-ct-blue hover:text-blue-400 flex items-center gap-1 transition-colors">
            View all <ArrowRight size={10}/>
          </button>
        </div>

        {caseStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <CaseStatPill label="Total"    value={caseStats.total ?? 0}       color="text-ct-text" />
            <CaseStatPill label="Open"     value={caseStats.open_cases ?? 0}  color="text-ct-amber" />
            <CaseStatPill label="Active"   value={caseStats.active_cases ?? 0} color="text-ct-blue" />
            <CaseStatPill label="Critical" value={caseStats.critical ?? 0}    color="text-ct-red" />
            <CaseStatPill label="Closed"   value={caseStats.closed_cases ?? 0} color="text-ct-green" />
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="h-7 w-8 bg-ct-border/30 rounded animate-pulse mb-1" />
                <div className="h-2 w-12 bg-ct-border/20 rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Total fraud amount bar */}
        {totalFraudCr && (
          <div className="mt-4 pt-3 border-t border-ct-border flex items-center justify-between">
            <span className="text-[10px] text-ct-muted font-mono uppercase tracking-widest">Total fraud amount tracked</span>
            <span className="text-sm font-semibold font-mono text-ct-red">₹{totalFraudCr} Cr</span>
          </div>
        )}
      </div>

      {/* ── Graph + Blacklist Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Wallets tracked"
          value={graphStats?.total_wallets?.toLocaleString() ?? '0'}
          sub={`${graphStats?.flagged_wallets ?? 0} flagged`}
          color="text-ct-blue"
          icon={Bitcoin}
        />
        <StatCard
          label="UPI accounts"
          value={graphStats?.total_upi?.toLocaleString() ?? '0'}
          sub={`${graphStats?.flagged_upi ?? 0} flagged`}
          color="text-ct-green"
          icon={CreditCard}
        />
        <StatCard
          label="Companies indexed"
          value={graphStats?.total_companies?.toLocaleString() ?? '0'}
          sub="MCA21 data"
          color="text-ct-amber"
          icon={Building2}
        />
        <StatCard
          label="Blacklisted entities"
          value={(
            (blStats?.internal_count || 0) +
            (blStats?.i4c_count || 0) +
            (blStats?.ofac_count || 0)
          ).toLocaleString()}
          sub={`${blStats?.high_severity ?? 0} high severity`}
          color="text-ct-red"
          icon={Shield}
        />
      </div>

      {/* ── Complaint overview ── */}
      {complaintStats?.total_complaints > 0 && (
        <div className="bg-ct-surface border border-ct-border rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={14} className="text-ct-cyan" />
            <span className="text-sm font-medium text-ct-text font-mono">Complaint Overview</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xl font-semibold font-mono text-ct-text">
                {complaintStats.total_complaints}
              </div>
              <div className="text-xs text-ct-muted">Total complaints</div>
            </div>
            <div>
              <div className="text-xl font-semibold font-mono text-ct-amber">
                ₹{((complaintStats.total_amount_inr || 0) / 10000000).toFixed(2)} Cr
              </div>
              <div className="text-xs text-ct-muted">Total fraud reported</div>
            </div>
            <div>
              <div className="text-xl font-semibold font-mono text-ct-red">
                {complaintStats.open_complaints ?? 0}
              </div>
              <div className="text-xs text-ct-muted">Open complaints</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick trace modules ── */}
      <div className="mb-6">
        <h2 className="text-xs text-ct-muted uppercase tracking-widest font-mono mb-3">
          Start Investigation
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_TRACES.map(m => (
            <button
              key={m.mod}
              onClick={() => goInvestigate(m.mod)}
              className={clsx(
                'text-left p-4 rounded-xl border transition-all group',
                'hover:scale-[1.02] active:scale-100',
                m.bg, m.border, 'hover:border-opacity-60'
              )}>
              <div className="flex items-center justify-between mb-3">
                <m.icon size={18} className={m.color} />
                <ArrowRight size={14} className={clsx(m.color, 'opacity-0 group-hover:opacity-100 transition-opacity')} />
              </div>
              <div className={clsx('text-sm font-semibold font-mono mb-1', m.color)}>{m.label}</div>
              <div className="text-xs text-ct-muted">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── System status ── */}
      {status && (
        <div className="bg-ct-surface border border-ct-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database size={14} className="text-ct-muted" />
            <span className="text-xs text-ct-muted font-mono uppercase tracking-widest">System Status</span>
          </div>
          <div className="flex gap-4">
            {[
              { label: 'API',   val: status.api },
              { label: 'Neo4j', val: status.neo4j },
              { label: 'Redis', val: status.redis },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={clsx('w-1.5 h-1.5 rounded-full', val === 'ok' ? 'bg-ct-green' : 'bg-ct-red')} />
                <span className="text-xs font-mono text-ct-muted">{label}</span>
                <span className={clsx('text-[10px] font-mono', val === 'ok' ? 'text-ct-green' : 'text-ct-red')}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
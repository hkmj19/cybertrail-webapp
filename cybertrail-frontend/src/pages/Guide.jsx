// src/pages/Guide.jsx - CyberTrail In-App Guide
import { useState } from 'react'
import {
  BookOpen, ChevronRight, Shield, Users,
  Search, FolderOpen, FileText, Clock, AlertTriangle,
  CheckCircle, Info, Lock, Zap, Database, Globe,
  Bitcoin, CreditCard, Building2, Phone, Layers,
  Eye, Download, Plus, Edit2, LogOut, Star, Key,
  Activity, ShieldAlert, Printer, UserCheck, Archive,
  BarChart2, RefreshCw, Filter, HardDrive, X
} from 'lucide-react'
import clsx from 'clsx'
import useStore from '../store/useStore'

// ── Role data (accurate to actual backend RBAC) ───────────
const ROLES = [
  {
    role: 'Admin', color: 'text-ct-red', bg: 'bg-ct-red/10 border-ct-red/20', icon: Shield,
    description: 'Full system access. Only admin can restore backups, factory reset, delete all data, and manage users.',
    permissions: [
      'All 5 investigation modules - run traces',
      'View ALL cases from all officers',
      'Create, assign, close, archive, delete cases',
      'Assign cases to any user including analysts',
      'Create, edit, delete, reset passwords for all users',
      'Upload CSVs and add/edit/delete complaints',
      'Add, edit, delete blacklist entries + Delete All (internal)',
      'Bulk import blacklist CSV (any source)',
      'Export full + incremental backup (encrypted)',
      'Restore from backup file',
      'Factory reset (system admin only)',
      'View full immutable audit trail',
      'Delete all complaints (admin only)',
    ],
    restricted: [
      'Factory reset: restricted to username "admin" specifically',
    ],
  },
  {
    role: 'Supervisor', color: 'text-ct-amber', bg: 'bg-ct-amber/10 border-ct-amber/20', icon: Star,
    description: 'Oversees all cases, reassigns officers, exports backups, views full audit trail.',
    permissions: [
      'All 5 investigation modules - run traces',
      'View ALL cases from all officers',
      'Assign/reassign cases to any user',
      'Close, archive, reopen cases',
      'Upload CSVs and add/edit/delete complaints',
      'Add, edit, delete blacklist entries',
      'Bulk import blacklist CSV',
      'Export full + incremental backup',
      'View full audit trail',
      'View user list',
      'Export graphs (PNG + JSON)',
    ],
    restricted: [
      'Cannot create or delete user accounts',
      'Cannot change user roles',
      'Cannot restore from backup',
      'Cannot factory reset',
      'Cannot delete all complaints or all blacklist entries',
    ],
  },
  {
    role: 'Officer', color: 'text-ct-blue', bg: 'bg-ct-blue/10 border-ct-blue/20', icon: UserCheck,
    description: 'Primary investigator. Creates cases, runs all traces, uploads complaint data.',
    permissions: [
      'All 5 investigation modules - run traces',
      'Create new investigation cases',
      'View own cases + cases assigned to them',
      'Add investigation notes and traces to cases',
      'Upload complaint CSVs and add manual complaints',
      'Add/edit/delete call records, company data, bank transfers',
      'Add, edit, delete internal blacklist entries',
      'Bulk import blacklist CSV',
      'Export graphs (PNG + JSON)',
      'Print court-ready PDF reports',
      'Change own password',
    ],
    restricted: [
      'Cannot view other officers\' cases',
      'Cannot reopen closed cases (Supervisor+ only)',
      'Cannot archive cases',
      'Cannot manage user accounts',
      'Cannot view audit trail',
      'Cannot export or restore backups',
      'Cannot delete all complaints',
    ],
  },
  {
    role: 'Analyst', color: 'text-ct-muted', bg: 'bg-white/5 border-white/10', icon: Eye,
    description: 'Read-only access. Views graphs, reads imported data, and reviews cases assigned to them.',
    permissions: [
      'All 5 investigation modules - run traces (view only)',
      'View cases assigned to them only',
      'View complaint data (UPI, Social, Shell, Account Link tabs)',
      'Check blacklist for any identifier',
      'Export graphs (PNG + JSON)',
      'Print court PDF reports from assigned cases',
      'Change own password',
    ],
    restricted: [
      'Cannot create, edit, or delete cases, notes, or traces',
      'Cannot upload CSVs or add complaints',
      'Cannot add/edit/delete blacklist entries',
      'Cannot see cases not assigned to them',
      'Cannot manage users or view audit trail',
      'Cannot export or restore backups',
      'Cannot change complaint or case status',
    ],
  },
]

// ── RBAC matrix ───────────────────────────────────────────
const RBAC = [
  { feature: 'Run investigation traces',          analyst:'✅', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'View complaint data tables',        analyst:'✅', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'Check blacklist',                   analyst:'✅', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'Export graph PNG / JSON',           analyst:'✅', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'Print court PDF report',            analyst:'✅', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'Upload complaint CSV',              analyst:'❌', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'Add / edit / delete complaints',    analyst:'❌', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'Add / edit / delete CDR, company, bank links', analyst:'❌', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'Create cases',                      analyst:'❌', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'View cases',                        analyst:'Assigned only', officer:'Own + assigned', supervisor:'All', admin:'All' },
  { feature: 'Close / reopen cases',              analyst:'❌', officer:'Own only', supervisor:'All', admin:'All' },
  { feature: 'Archive cases',                     analyst:'❌', officer:'❌', supervisor:'✅', admin:'✅' },
  { feature: 'Assign cases to others',            analyst:'❌', officer:'❌', supervisor:'✅', admin:'✅' },
  { feature: 'Add / edit internal blacklist',     analyst:'❌', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'Delete all blacklist (internal)',   analyst:'❌', officer:'❌', supervisor:'❌', admin:'✅' },
  { feature: 'Bulk import blacklist CSV',         analyst:'❌', officer:'✅', supervisor:'✅', admin:'✅' },
  { feature: 'OFAC sync',                         analyst:'❌', officer:'❌', supervisor:'✅', admin:'✅' },
  { feature: 'Delete all complaints',             analyst:'❌', officer:'❌', supervisor:'❌', admin:'✅' },
  { feature: 'Export backup (full/incremental)',  analyst:'❌', officer:'❌', supervisor:'✅', admin:'✅' },
  { feature: 'Restore from backup',               analyst:'❌', officer:'❌', supervisor:'❌', admin:'✅' },
  { feature: 'Factory reset',                     analyst:'❌', officer:'❌', supervisor:'❌', admin:'System admin only' },
  { feature: 'View audit trail',                  analyst:'❌', officer:'❌', supervisor:'✅', admin:'✅' },
  { feature: 'View user list',                    analyst:'❌', officer:'❌', supervisor:'✅', admin:'✅' },
  { feature: 'Create / delete users',             analyst:'❌', officer:'❌', supervisor:'❌', admin:'✅' },
  { feature: 'Reset user passwords',              analyst:'❌', officer:'❌', supervisor:'❌', admin:'✅' },
  { feature: 'Change own password',               analyst:'✅', officer:'✅', supervisor:'✅', admin:'✅' },
]

// ── Module data ───────────────────────────────────────────
const MODULES = [
  {
    id: 'crypto', label: 'Crypto Tracer', icon: Bitcoin, color: 'text-ct-blue', bg: 'bg-ct-blue/10 border-ct-blue/20',
    what: 'Traces cryptocurrency wallet transactions across Bitcoin, Ethereum, and TRON/USDT networks using live blockchain APIs.',
    input: 'BTC: bc1qxy2kgdygjrsqtzq2n0yrf2493gqxmjt6x7rj |  ETH: 0x742d35Cc6634C0532925a3b8Bc454e4438f44e  |  TRON: TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
    requires: 'BlockCypher API (BTC), Etherscan API (ETH), TronGrid API (TRON) - set in .env',
    steps: [
      'Go to Investigate → Crypto tab',
      'Paste wallet address - chain is auto-detected from format',
      'Set depth 1–2 (depth 3+ is slow for large wallets)',
      'Click Trace → - live blockchain data fetched',
      'Click any node to see balance, tx count, risk level',
      'Save trace to a case via the "Save Current Trace" button',
    ],
    tips: 'Start depth 1 for exchange wallets. Red border = blacklisted. Edge label = amount transferred.',
  },
  {
    id: 'upi', label: 'UPI / Bank Tracer', icon: CreditCard, color: 'text-ct-green', bg: 'bg-ct-green/10 border-ct-green/20',
    what: 'Maps UPI fraud chains and mule account networks from complaint data. Shows money flow: victim → fraud → mule.',
    input: 'UPI ID: fraud@paytm  |  Phone: 9876543210  |  Bank account: 1234567890HDFC',
    requires: 'Complaints must be uploaded first (CSV or manual entry in Complaints page)',
    steps: [
      'Upload complaint CSV in Complaints → UPI/Bank tab first',
      'Go to Investigate → UPI tab',
      'Enter the fraud UPI ID, victim phone, or bank account number',
      'Red node = flagged fraud account (has complaints in DB)',
      'Amber node = mule account (receives money FROM flagged fraud)',
      'Green/purple = victim node (sends money TO fraud)',
    ],
    tips: 'Trace the fraud UPI ID - not the victim phone - for the full mule chain. More complaint data = richer graph.',
  },
  {
    id: 'shell', label: 'Shell Company', icon: Building2, color: 'text-ct-amber', bg: 'bg-ct-amber/10 border-ct-amber/20',
    what: 'Traces beneficial ownership, director networks, and subsidiary chains. Flags shell indicators from MCA21 data.',
    input: 'CIN: L21091KA2019PTC123456  |  Company name  |  Director DIN: 07123456',
    requires: 'MCA21 API (demo data by default). Import real data via Complaints → Shell Company CSV.',
    steps: [
      'Upload company/director CSV in Complaints → Shell Company tab',
      'Go to Investigate → Shell tab',
      'Enter company CIN, name, or director DIN',
      'Amber rectangles = companies, grey circles = directors',
      'Red = struck-off / dissolved / flagged company',
      'Director appearing in 3+ companies = shell indicator',
    ],
    tips: 'Trace the director DIN to see all companies they control. One director often runs 10+ shell entities.',
  },
  {
    id: 'social', label: 'Social Graph', icon: Phone, color: 'text-ct-purple', bg: 'bg-ct-purple/10 border-ct-purple/20',
    what: 'Maps phone communication networks and identity links. Shows phones registered to UPI accounts, call hubs, and fraud rings.',
    input: 'Phone: 9876543210  |  UPI ID: suspect@bank',
    requires: 'CDR CSV uploaded in Complaints → Social/CDR tab, or complaint CSV with fraud_phone column',
    steps: [
      'Upload CDR CSV in Complaints → Social/CDR tab first',
      'Go to Investigate → Social tab',
      'Enter a phone number or UPI ID',
      'Purple circles = phones, green circles = UPI accounts',
      'CALLED edge = phone-to-phone call, REGISTERED = phone owns UPI',
      'Hub phone with many connections = likely fraud coordinator',
    ],
    tips: 'A phone in 10+ complaints is a strong fraud coordinator indicator. Use depth 2-3 for gang network mapping.',
  },
  {
    id: 'multi', label: 'Multi-Layer', icon: Layers, color: 'text-ct-cyan', bg: 'bg-ct-cyan/10 border-ct-cyan/20',
    what: 'Runs UPI + Social modules simultaneously and merges into one unified graph. Cross-layer connections auto-detected.',
    input: 'Phone number (best for cross-layer) or UPI ID',
    requires: 'Complaint and CDR data uploaded - works with whatever modules have data',
    steps: [
      'Go to Investigate → Multi tab',
      'Enter a phone number (recommended) or UPI ID',
      'System runs UPI + Social in parallel',
      'Depth 2 recommended - depth 3+ is slow',
      'Nodes found in multiple modules are elevated to HIGH risk',
      'Save the merged trace to a case for court submission',
    ],
    tips: 'A phone found in both UPI fraud AND CDR call records is almost certainly criminal. Multi is the most powerful module.',
  },
]

// ── Nav sections ──────────────────────────────────────────
const SECTIONS = [
  { id: 'quickstart', label: 'Quick Start',         icon: Zap },
  { id: 'roles',      label: 'Roles & Permissions', icon: Shield },
  { id: 'rbac',       label: 'Full RBAC Matrix',    icon: Filter },
  { id: 'modules',    label: 'Investigation Modules', icon: Search },
  { id: 'complaints', label: 'Complaints & Data',   icon: FileText },
  { id: 'cases',      label: 'Case Management',     icon: FolderOpen },
  { id: 'blacklist',  label: 'Blacklist',            icon: AlertTriangle },
  { id: 'graph',      label: 'Reading the Graph',   icon: Globe },
  { id: 'backup',     label: 'Backup & Restore',    icon: HardDrive },
  { id: 'audit',      label: 'Audit Trail',         icon: ShieldAlert },
  { id: 'admin',      label: 'Admin & Users',       icon: Lock },
  { id: 'report',     label: 'PDF Court Report',    icon: Printer },
  { id: 'tips',       label: 'Pro Tips',            icon: Star },
]

// ── Sub-components ────────────────────────────────────────
function Section({ id, title, icon: Icon, children }) {
  return (
    <div id={id} className="mb-10 scroll-mt-6">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-ct-border">
        <Icon size={16} className="text-ct-blue flex-shrink-0"/>
        <h2 className="text-sm font-bold text-ct-text font-mono">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Note({ type = 'info', children }) {
  const s = {
    info:     { bg: 'bg-ct-blue/5  border-ct-blue/20',  icon: Info,          ic: 'text-ct-blue'  },
    tip:      { bg: 'bg-ct-green/5 border-ct-green/20', icon: CheckCircle,   ic: 'text-ct-green' },
    warning:  { bg: 'bg-ct-amber/5 border-ct-amber/20', icon: AlertTriangle, ic: 'text-ct-amber' },
    critical: { bg: 'bg-ct-red/5   border-ct-red/20',   icon: AlertTriangle, ic: 'text-ct-red'   },
  }[type]
  const Icon = s.icon
  return (
    <div className={clsx('flex gap-2.5 p-3 rounded-lg border mb-3 text-xs font-mono text-ct-muted', s.bg)}>
      <Icon size={13} className={clsx('flex-shrink-0 mt-0.5', s.ic)}/>
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

function Step({ n, children }) {
  return (
    <div className="flex gap-3 mb-2">
      <div className="w-5 h-5 rounded-full bg-ct-blue/20 border border-ct-blue/30 text-ct-blue text-[10px] font-mono font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
      <p className="text-xs font-mono text-ct-muted leading-relaxed">{children}</p>
    </div>
  )
}

function StatusFlow() {
  const statuses = [
    { label: 'Open',     color: 'bg-ct-amber/10 text-ct-amber border-ct-amber/30' },
    { label: 'Active',   color: 'bg-ct-blue/10 text-ct-blue border-ct-blue/30' },
    { label: 'Pending',  color: 'bg-ct-purple/10 text-ct-purple border-ct-purple/30' },
    { label: 'Closed',   color: 'bg-ct-green/10 text-ct-green border-ct-green/30' },
    { label: 'Archived', color: 'bg-white/5 text-ct-muted border-white/10' },
  ]
  return (
    <div className="flex items-center gap-1.5 flex-wrap my-3">
      {statuses.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className={clsx('text-[10px] font-mono px-2 py-1 rounded border', s.color)}>{s.label}</span>
          {i < statuses.length - 1 && <ChevronRight size={10} className="text-ct-muted"/>}
        </div>
      ))}
    </div>
  )
}

function RBACCell({ value }) {
  if (value === '✅') return <span className="text-ct-green text-xs">✅</span>
  if (value === '❌') return <span className="text-ct-muted/40 text-xs">-</span>
  return <span className="text-[10px] font-mono text-ct-amber">{value}</span>
}

// ── Main Guide ────────────────────────────────────────────
export default function Guide() {
  const [activeSection, setActiveSection] = useState('quickstart')
  const { user } = useStore()

  const scrollTo = (id) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* Sidebar */}
      <div className="w-48 flex-shrink-0 border-r border-ct-border bg-ct-surface overflow-y-auto p-3">
        <div className="flex items-center gap-2 mb-4 px-1">
          <BookOpen size={14} className="text-ct-cyan"/>
          <span className="text-xs font-semibold font-mono text-ct-text">Guide</span>
        </div>
        <div className="space-y-0.5">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => scrollTo(s.id)}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] font-mono transition-colors',
                activeSection === s.id ? 'bg-ct-blue/10 text-ct-blue' : 'text-ct-muted hover:text-ct-text hover:bg-ct-bg'
              )}>
              <s.icon size={11} className="flex-shrink-0"/>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6" onScroll={(e) => {
        const scrollTop = e.target.scrollTop
        for (const s of SECTIONS) {
          const el = document.getElementById(s.id)
          if (el && el.offsetTop - 100 <= scrollTop) setActiveSection(s.id)
        }
      }}>

        {/* QUICK START */}
        <Section id="quickstart" title="Quick Start" icon={Zap}>
          <Note type="tip">Logged in as <strong>{user?.username || 'officer'}</strong> ({user?.role || 'officer'}). Follow the steps below to run your first investigation.</Note>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { n:1, title:'Upload Data', desc:'Go to Complaints. Upload a victim complaint CSV or add manually. This seeds the UPI and Social investigation graphs.' },
              { n:2, title:'Run a Trace', desc:'Go to Investigate → UPI or Social tab. Enter a fraud UPI ID or phone number. Click Trace →.' },
              { n:3, title:'Save to Case', desc:'Create a Case (Cases → New Case). Open the case → Save Current Trace. Add notes for court.' },
            ].map(item => (
              <div key={item.n} className="bg-ct-surface border border-ct-border rounded-xl p-4">
                <div className="w-6 h-6 rounded-full bg-ct-blue/20 border border-ct-blue/30 text-ct-blue text-[11px] font-mono font-bold flex items-center justify-center mb-3">{item.n}</div>
                <p className="text-xs font-mono font-semibold text-ct-text mb-1">{item.title}</p>
                <p className="text-[11px] font-mono text-ct-muted leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Daily startup:</p>
          {[
            'Start Docker (Neo4j + Redis): docker compose up -d',
            'Start backend: cd cybertrail-backend && source venvcyber/bin/activate && uvicorn app.main:app --reload',
            'Start frontend: cd cybertrail-frontend && npm run dev',
            'Open browser: http://localhost:3000',
          ].map((item, i) => <Step key={i} n={i+1}>{item}</Step>)}
        </Section>

        {/* ROLES */}
        <Section id="roles" title="Roles & Permissions" icon={Shield}>
          <Note type="info">CyberTrail has 4 roles. Your role is shown in the top-right corner. Roles control what you can create, edit, delete, and view.</Note>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.map(r => (
              <div key={r.role} className={clsx('border rounded-xl p-4', r.bg)}>
                <div className="flex items-center gap-2 mb-2">
                  <r.icon size={14} className={r.color}/>
                  <span className={clsx('text-xs font-mono font-semibold', r.color)}>{r.role}</span>
                </div>
                <p className="text-[11px] font-mono text-ct-muted mb-3 leading-relaxed">{r.description}</p>
                <div className="space-y-1">
                  {r.permissions.map((p, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <CheckCircle size={10} className="text-ct-green flex-shrink-0 mt-0.5"/>
                      <span className="text-[10px] font-mono text-ct-muted">{p}</span>
                    </div>
                  ))}
                  {r.restricted.map((p, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <X size={10} className="text-ct-red flex-shrink-0 mt-0.5"/>
                      <span className="text-[10px] font-mono text-ct-muted">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* RBAC MATRIX */}
        <Section id="rbac" title="Full RBAC Matrix" icon={Filter}>
          <Note type="info">Complete reference of every feature and who can access it. ✅ = allowed, - = not allowed.</Note>
          <div className="rounded-xl border border-ct-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-ct-bg border-b border-ct-border">
                  <th className="text-left px-4 py-2.5 text-[10px] font-mono text-ct-muted uppercase tracking-widest">Feature</th>
                  {['Analyst','Officer','Supervisor','Admin'].map(r => (
                    <th key={r} className="px-4 py-2.5 text-[10px] font-mono text-ct-muted uppercase tracking-widest text-center">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RBAC.map((row, i) => (
                  <tr key={i} className={clsx('border-b border-ct-border/40', i % 2 !== 0 && 'bg-white/[0.01]')}>
                    <td className="px-4 py-2 text-[11px] font-mono text-ct-muted">{row.feature}</td>
                    <td className="px-4 py-2 text-center"><RBACCell value={row.analyst}/></td>
                    <td className="px-4 py-2 text-center"><RBACCell value={row.officer}/></td>
                    <td className="px-4 py-2 text-center"><RBACCell value={row.supervisor}/></td>
                    <td className="px-4 py-2 text-center"><RBACCell value={row.admin}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* MODULES */}
        <Section id="modules" title="Investigation Modules" icon={Search}>
          <Note type="info">All roles can run traces. Results are temporary - save to a case to preserve them permanently across sessions.</Note>
          <div className="space-y-4">
            {MODULES.map(m => (
              <div key={m.id} className={clsx('border rounded-xl p-4', m.bg)}>
                <div className="flex items-center gap-2 mb-1">
                  <m.icon size={14} className={m.color}/>
                  <span className={clsx('text-xs font-mono font-semibold', m.color)}>{m.label}</span>
                </div>
                <p className="text-[11px] font-mono text-ct-muted mb-2 leading-relaxed">{m.what}</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-[9px] font-mono font-bold  underline text-ct-muted uppercase tracking-widest mb-1">Input formats</p>
                    <p className="text-[10px] font-mono text-ct-text bg-ct-bg rounded px-2 py-1">{m.input}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-mono font-bold underline text-ct-muted uppercase tracking-widest mb-1">Requires</p>
                    <p className="text-[10px] font-mono text-green-500 leading-relaxed">{m.requires}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {m.steps.map((s, i) => <Step key={i} n={i+1}>{s}</Step>)}
                </div>
                <Note type="tip">{m.tips}</Note>
              </div>
            ))}
          </div>
        </Section>

        {/* COMPLAINTS */}
        <Section id="complaints" title="Complaints & Data Upload" icon={FileText}>
          <Note type="warning">CSV upload and manual entry are restricted to Officer, Supervisor, and Admin. Analysts can view data tables but cannot add or modify anything.</Note>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">4 data import tabs:</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { tab: 'UPI / Bank',     color: 'text-ct-green',  desc: 'Victim complaint CSV + Bank transfer CSV. Feeds UPI and Multi modules.' },
              { tab: 'Social / CDR',   color: 'text-ct-purple', desc: 'Call detail records CSV. Feeds Social and Multi modules.' },
              { tab: 'Shell Company',  color: 'text-ct-amber',  desc: 'Company + director CSV from MCA21. Feeds Shell and Multi modules.' },
              { tab: 'Account Link',   color: 'text-ct-cyan',   desc: 'Manual link between any two accounts after Section 91 bank response.' },
            ].map(t => (
              <div key={t.tab} className="bg-ct-surface border border-ct-border rounded-lg p-2.5">
                <p className={clsx('text-[10px] font-mono font-semibold mb-1', t.color)}>{t.tab}</p>
                <p className="text-[10px] font-mono text-ct-muted">{t.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Complaint CSV required columns:</p>
          <div className="bg-ct-bg border border-ct-border rounded-lg px-3 py-2 font-mono text-[10px] text-ct-text mb-4">
            complainant_phone, fraud_upi_id, amount_inr
            <span className="text-ct-muted ml-2">- optional: complaint_id, fraud_phone, fraud_bank_account, transaction_date, district, description</span>
          </div>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">CDR CSV required columns:</p>
          <div className="bg-ct-bg border border-ct-border rounded-lg px-3 py-2 font-mono text-[10px] text-ct-text mb-4">
            phone_from, phone_to, relationship
            <span className="text-ct-muted ml-2">- optional: frequency, date (relationship: CALLED / REGISTERED / ASSOCIATED)</span>
          </div>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Shell company CSV required columns:</p>
          <div className="bg-ct-bg border border-ct-border rounded-lg px-3 py-2 font-mono text-[10px] text-ct-text mb-4">
            cin, director_din, company_name
            <span className="text-ct-muted ml-2">- optional: director_name, designation, date_of_appointment, company_status</span>
          </div>

          <Note type="tip">All tables (Social, Shell, Account Link) are visible to Analysts in read-only mode. Upload/edit/delete buttons are hidden for analysts.</Note>
          <Note type="info">After uploading a complaint CSV, the <strong>Recent Complaints</strong> table at the bottom auto-refreshes. Each CSV row creates a Complaint node, UpiAccount node, Phone nodes, and UPI_TX edges in the graph database.</Note>
        </Section>

        {/* CASES */}
        <Section id="cases" title="Case Management" icon={FolderOpen}>
          <Note type="info">Cases are the central record for each investigation. Each case links complaints, traces, and notes for court submission. Only Officer+ can create cases.</Note>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Case status flow:</p>
          <StatusFlow/>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { status:'Open',     who:'All',           desc:'Newly registered, investigation not started' },
              { status:'Active',   who:'Officer+',      desc:'Investigation underway, traces being run' },
              { status:'Pending',  who:'Officer+',      desc:'Waiting for bank response or more info' },
              { status:'Closed',   who:'Supervisor+',   desc:'Investigation complete - needs 1+ trace and 1+ note' },
              { status:'Archived', who:'Supervisor+',   desc:'Permanently sealed. Cannot be reopened by anyone' },
            ].map(({ status, who, desc }) => (
              <div key={status} className="bg-ct-surface border border-ct-border rounded-lg p-2.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-mono text-ct-blue font-semibold">{status}</span>
                  <span className="text-[9px] font-mono text-ct-muted px-1.5 py-0.5 bg-ct-bg border border-ct-border rounded">{who}</span>
                </div>
                <p className="text-[10px] font-mono text-ct-muted">{desc}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Who can see which cases:</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { role:'Admin / Supervisor', access:'All cases from all officers' },
              { role:'Officer',           access:'Cases they created + cases assigned to them' },
              { role:'Analyst',           access:'Only cases explicitly assigned to them by a supervisor/admin' },
            ].map(({ role, access }) => (
              <div key={role} className="bg-ct-surface border border-ct-border rounded-lg p-2.5">
                <p className="text-[10px] font-mono text-ct-text font-semibold">{role}</p>
                <p className="text-[10px] font-mono text-ct-muted mt-0.5">{access}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Assigning a case (Supervisor/Admin only):</p>
          {[
            'Open any case → click the Assign button (top right)',
            'Search by name, username, badge ID, or role in the search box',
            'All active users appear - analysts, officers, supervisors, admins',
            'Click a user card to select them → blue highlight + checkmark',
            'Click Confirm Assign - the user now sees the case in their list',
          ].map((s, i) => <Step key={i} n={i+1}>{s}</Step>)}

          <Note type="warning">Archived cases are permanent - no one, not even admin, can reopen or modify them. Archive only after formal court submission.</Note>
        </Section>

        {/* BLACKLIST */}
        <Section id="blacklist" title="Blacklist Management" icon={AlertTriangle}>
          <Note type="info">The blacklist checks 3 sources simultaneously: Internal (your entries), I4C/NCRP (national database), and OFAC (international sanctions).</Note>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label:'Check identifier',    who:'All roles',    desc:'Enter any UPI, phone, wallet, CIN. Returns hits from all 3 lists.' },
              { label:'Add / Edit / Delete', who:'Officer+',     desc:'Add to internal blacklist with severity and reason.' },
              { label:'Delete All (internal)',who:'Admin only',  desc:'Wipes all internal blacklist entries. I4C and OFAC are preserved.' },
              { label:'Bulk CSV import',     who:'Officer+',     desc:'Required columns: identifier, severity. Optional: reason, fraud_type, complaint_count.' },
              { label:'OFAC sync',           who:'Supervisor+',  desc:'Download and import latest OFAC SDN sanctions list from US Treasury.' },
            ].map(item => (
              <div key={item.label} className="bg-ct-surface border border-ct-border rounded-lg p-2.5">
                <p className="text-[10px] font-mono text-ct-blue font-semibold">{item.label}</p>
                <p className="text-[9px] font-mono text-ct-amber mb-1">{item.who}</p>
                <p className="text-[10px] font-mono text-ct-muted">{item.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Blacklist CSV sample (download from the Import CSV panel):</p>
          <div className="bg-ct-bg border border-ct-border rounded-lg px-3 py-2 font-mono text-[10px] text-ct-text mb-3">
            identifier, reason, severity, fraud_type, complaint_count<br/>
            fraud@paytm, Confirmed UPI fraud, high, upi_fraud, 12<br/>
            9876543210, Mule coordinator, high, mule_coordinator, 8
          </div>

          <Note type="warning">Adding to the blacklist retroactively flags ALL existing graph nodes matching that identifier - across all saved traces and cases. Every add/remove is permanently audit-logged.</Note>
        </Section>

        {/* GRAPH */}
        <Section id="graph" title="Reading the Graph" icon={Globe}>
          <p className="text-[11px] font-mono text-ct-muted mb-3 font-semibold">Node colours:</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { dot: 'bg-ct-red/80 border-ct-red',       label: 'Red',      desc: 'Flagged fraud entity (has complaints or blacklisted)' },
              { dot: 'bg-orange-500/60 border-orange-400', label:'Amber',    desc: 'Mule account (receives money FROM a flagged fraud account)' },
              { dot: 'bg-ct-green/50 border-ct-green',   label: 'Green',    desc: 'UPI account or bank account (not flagged)' },
              { dot: 'bg-ct-purple/50 border-ct-purple', label: 'Purple',   desc: 'Phone number' },
              { dot: 'bg-ct-blue/50 border-ct-blue',     label: 'Blue',     desc: 'BTC / ETH crypto wallet' },
              { dot: 'bg-ct-amber/40 border-ct-amber',   label: 'Amber rect', desc: 'Company (Shell module)' },
              { dot: 'bg-white/10 border-white/20',      label: 'Grey',     desc: 'Person / Director' },
            ].map(n => (
              <div key={n.label} className="flex items-center gap-2 bg-ct-surface border border-ct-border rounded-lg p-2">
                <div className={clsx('w-5 h-5 rounded-full border flex-shrink-0', n.dot)}/>
                <div>
                  <span className="text-[10px] font-mono text-ct-text font-semibold">{n.label} - </span>
                  <span className="text-[10px] font-mono text-ct-muted">{n.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Graph toolbar buttons:</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { key:'Fit (⊞)',        action:'Fit all nodes to screen' },
              { key:'Reset (↺)',      action:'Clear node selection / highlighting' },
              { key:'Re-layout',      action:'Re-run the layout algorithm' },
              { key:'Eye (👁)',        action:'Toggle: show flagged nodes only' },
              { key:'⚠ Filter',       action:'Toggle: hide non-flagged nodes' },
              { key:'Layout menu',    action:'Switch layout: cose / concentric / breadthfirst / circle / grid' },
              { key:'PNG button',     action:'Export high-res screenshot of graph' },
              { key:'JSON button',    action:'Export raw graph data (nodes + edges + metadata)' },
              { key:'Click node',     action:'Open detail panel: Info / connections / neighbours' },
              { key:'Click edge',     action:'Show edge details: source, target, amount, type' },
            ].map(c => (
              <div key={c.key} className="bg-ct-surface border border-ct-border rounded-lg p-2">
                <span className="text-[10px] font-mono text-ct-blue font-semibold">{c.key}</span>
                <p className="text-[10px] font-mono text-ct-muted mt-0.5">{c.action}</p>
              </div>
            ))}
          </div>
          <Note type="tip">Traces are session-only - they disappear on page refresh or navigation. Always save to a case immediately after tracing.</Note>
        </Section>

        {/* BACKUP */}
        <Section id="backup" title="Backup & Restore" icon={HardDrive}>
          <Note type="warning">Backup export requires Supervisor+. Restore requires Admin. Factory reset requires the system admin account specifically (username: admin).</Note>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { title:'Full Backup',        who:'Supervisor+', desc:'Exports all data: complaints, cases, blacklist, CDR, companies, audit trail (last 10,000), users (no passwords). AES-256 encrypted .ct.enc file.' },
              { title:'Incremental Backup', who:'Supervisor+', desc:'Exports only data changed in the last N hours (slider: 1h–7d). Use for daily automated backups. Much smaller file.' },
              { title:'Restore',            who:'Admin only',  desc:'Upload a .ct.enc backup file. Uses MERGE - never deletes existing data, only adds/updates. Always do a dry-run preview first.' },
              { title:'Factory Reset',      who:'System admin only', desc:'Wipes ALL investigation data. Preserves user accounts. Requires admin password + typing "DELETE ALL DATA". Cannot be undone.' },
            ].map(item => (
              <div key={item.title} className="bg-ct-surface border border-ct-border rounded-xl p-3">
                <p className="text-[11px] font-mono font-semibold text-ct-text">{item.title}</p>
                <p className="text-[9px] font-mono text-ct-amber mb-1">{item.who}</p>
                <p className="text-[10px] font-mono text-ct-muted leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Restore from a downloaded backup:</p>
          {[
            'Go to Backup & Recovery page (sidebar, Supervisor+ only)',
            'Scroll to Restore from Backup section (Admin only)',
            'Click the drop zone - select your .ct.enc file (or .json.gz)',
            'File is auto-detected by content - no need to rename it',
            'Dry run preview shows record counts - verify before restoring',
            'Click Confirm Restore - data merges into the database',
          ].map((s, i) => <Step key={i} n={i+1}>{s}</Step>)}

          <Note type="info">The backup file is always AES-256 encrypted with the server's BACKUP_ENCRYPTION_PASSWORD (set in .env). The restore endpoint auto-detects encrypted files by their content signature, regardless of filename.</Note>

          <p className="text-[11px] font-mono text-ct-muted mt-4 mb-2 font-semibold">Recommended schedule:</p>
          <div className="space-y-1">
            {[
              { freq:'Daily at 2am', type:'Incremental (last 24h)', cmd:'curl -H "Authorization: Bearer TOKEN" http://localhost:8000/api/v1/backup/export/incremental?since_hours=24 -o backup_$(date +%Y%m%d).ct.enc' },
              { freq:'Weekly',       type:'Full backup',            cmd:'curl -H "Authorization: Bearer TOKEN" http://localhost:8000/api/v1/backup/export -o backup_full_$(date +%Y%m%d).ct.enc' },
            ].map(s => (
              <div key={s.freq} className="bg-ct-surface border border-ct-border rounded-lg p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-ct-blue font-semibold">{s.freq}</span>
                  <span className="text-[10px] font-mono text-ct-muted">- {s.type}</span>
                </div>
                <code className="text-[9px] font-mono text-ct-cyan/80 break-all">{s.cmd}</code>
              </div>
            ))}
          </div>
        </Section>

        {/* AUDIT */}
        <Section id="audit" title="Audit Trail" icon={ShieldAlert}>
          <Note type="critical">The audit trail is immutable - no one can delete or edit audit logs, not even after a factory reset. Every action is permanently recorded with officer name, badge ID, IP address, and timestamp.</Note>

          <p className="text-[11px] font-mono text-ct-muted mb-2">Actions automatically logged:</p>
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {[
              'Login success + failed attempts (with IP)',
              'Complaint create / edit / delete / bulk import',
              'Case create / update / close / archive / delete',
              'Notes and traces added to cases',
              'Case assignment changes',
              'Blacklist add / remove / bulk import / OFAC sync',
              'User account create / edit / delete',
              'Password resets (admin-initiated)',
              'Backup export (full + incremental)',
              'Backup restore operations',
              'Factory reset',
              'CDR / company / bank transfer add/edit/delete',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 bg-ct-surface border border-ct-border rounded-lg px-2 py-1.5">
                <CheckCircle size={10} className="text-ct-green flex-shrink-0 mt-0.5"/>
                <span className="text-[10px] font-mono text-ct-muted">{item}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Officer Activity Summary (Audit Trail page):</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { label:'Active Officers table',  desc:'All users currently in the system with action counts' },
              { label:'Deleted Accounts table', desc:'Users who appear in logs but no longer have an account - marked as deleted' },
              { label:'⚠ Suspicious badge',    desc:'Officers with 3+ deletions are automatically flagged' },
            ].map(item => (
              <div key={item.label} className="bg-ct-surface border border-ct-border rounded-lg p-2.5">
                <p className="text-[10px] font-mono text-ct-blue font-semibold">{item.label}</p>
                <p className="text-[10px] font-mono text-ct-muted mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>

          <Note type="critical">If an officer modifies or deletes data and denies it, the audit trail shows exactly what was changed, the old value, the new value, and the IP address. Admissible as electronic evidence under Section 65B IEA.</Note>
        </Section>

        {/* ADMIN */}
        <Section id="admin" title="Admin & User Management" icon={Lock}>
          <Note type="info">User management is Admin-only. The system admin (username: admin) cannot be deleted or disabled. Only admin can create users, delete users, or reset passwords.</Note>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Creating a new user:</p>
          {[
            'Go to Users page (Admin only)',
            'Click New User button',
            'Fill: Full Name, Badge ID, Department, Designation, Role, Email',
            'Set initial password (min 8 characters)',
            'User can log in immediately',
          ].map((s, i) => <Step key={i} n={i+1}>{s}</Step>)}

          <p className="text-[11px] font-mono text-ct-muted mt-4 mb-2 font-semibold">Available roles when creating a user:</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { role:'analyst',    desc:'Read-only. Can view assigned cases and run traces. Cannot create or edit.' },
              { role:'officer',    desc:'Primary investigator. Can create cases, upload data, add to blacklist.' },
              { role:'supervisor', desc:'Oversees all cases, exports backups, views audit trail.' },
              { role:'admin',      desc:'Full access. Can create users, restore backups, factory reset.' },
            ].map(({ role, desc }) => (
              <div key={role} className="bg-ct-surface border border-ct-border rounded-lg p-2.5">
                <p className="text-[10px] font-mono text-ct-text font-semibold capitalize">{role}</p>
                <p className="text-[10px] font-mono text-ct-muted mt-0.5">{desc}</p>
              </div>
            ))}
          </div>

          <Note type="warning">Downgrading a role (e.g. Officer → Analyst) or disabling an account immediately invalidates the user's active session. They are logged out on the next API call.</Note>
        </Section>

        {/* PDF REPORT */}
        <Section id="report" title="PDF Court Report" icon={Printer}>
          <Note type="tip">The court report is generated from live case data and updates automatically as you add more evidence. All roles can print reports from cases they can access.</Note>

          <p className="text-[11px] font-mono text-ct-muted mb-2 font-semibold">Generating a court report:</p>
          {[
            'Open any case you have access to',
            'Click the "Print Report" button (visible to all roles)',
            'Report opens in a new tab as an A4 court-ready document',
            'Review all sections - verify flagged entities and notes',
            'Click 🖨 Print / Save as PDF',
            'In print dialog: Paper = A4, Margins = None or Minimal, Background graphics = ON',
          ].map((s, i) => <Step key={i} n={i+1}>{s}</Step>)}

          <p className="text-[11px] font-mono text-ct-muted mt-4 mb-2 font-semibold">Report sections:</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { title:'Case Overview',       desc:'Case number, FIR, district, status, priority, officer, fraud amount, created date' },
              { title:'Flagged Entities',    desc:'All nodes marked as fraud/blacklisted in saved traces with identifier and risk level' },
              { title:'Investigation Traces',desc:'Each trace: module, seed identifier, depth, total nodes, flagged nodes count' },
              { title:'Investigation Notes', desc:'All notes with type (observation / action / evidence / update), timestamp, officer name' },
              { title:'Legal Declaration',   desc:'Section 91 CrPC and Section 65B IEA reference text auto-included' },
              { title:'Signature Blocks',    desc:'IO signature + Supervising Officer signature with date fields for court submission' },
            ].map(s => (
              <div key={s.title} className="bg-ct-surface border border-ct-border rounded-lg p-2.5">
                <p className="text-[10px] font-mono text-ct-blue font-semibold">{s.title}</p>
                <p className="text-[10px] font-mono text-ct-muted mt-0.5">{s.desc}</p>
              </div>
            ))}
          </div>
          <Note type="warning">For the richest report: save at least 1 trace and add notes of types observation, action, and evidence before printing. Cases with no traces will have empty trace sections.</Note>
        </Section>

        {/* TIPS */}
        <Section id="tips" title="Pro Tips" icon={Star}>
          <div className="space-y-2.5">
            {[
              { title:'Trace the fraud UPI ID, not the victim phone', desc:'The fraud UPI shows the full mule chain outward. The victim phone only shows who they paid.' },
              { title:'Save traces before navigating away', desc:'Traces are session-only - they disappear on refresh or page change. Save to a case immediately.' },
              { title:'Upload CDR before running Social traces', desc:'Without CDR data in the database, Social traces will return empty graphs. Upload CDR CSV first.' },
              { title:'Use depth 2 for UPI, depth 1-2 for Crypto', desc:'Depth 3+ is slow and creates noisy graphs. Start shallow, go deeper only for specific leads.' },
              { title:'Assign cases to analysts for read-only review', desc:'Analysts cannot edit cases but can run traces, view all data, and print reports - useful for intelligence review.' },
              { title:'Use Pending status while waiting for bank response', desc:'Set case to Pending when you\'ve sent a Section 91 notice. Set back to Active when you receive the response and upload it.' },
              { title:'Multi-layer trace for unknown suspects', desc:'If you have a phone but don\'t know which system they used, run Multi. It checks UPI + Social in parallel.' },
              { title:'Backup before bulk operations', desc:'Before deleting complaints, resetting data, or making bulk changes - export a full backup first.' },
              { title:'Deleted account logs are preserved in audit trail', desc:'Even if you delete an officer\'s account, their audit logs remain permanently. The Audit Trail page flags them separately.' },
              { title:'Archive only after court submission', desc:'Archived cases are permanent and unmodifiable by anyone. Archive only after the case has been formally submitted.' },
            ].map((tip, i) => (
              <div key={i} className="bg-ct-surface border border-ct-border rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Star size={11} className="text-ct-amber flex-shrink-0 mt-0.5"/>
                  <div>
                    <p className="text-[11px] font-mono font-semibold text-ct-text mb-0.5">{tip.title}</p>
                    <p className="text-[10px] font-mono text-ct-muted leading-relaxed">{tip.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </div>
  )
}
// src/components/Layout.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Search, FileText, Shield,
  Clock, ChevronLeft, ChevronRight,
  FolderOpen, Users, LogOut, User, BookOpen, ShieldAlert, UserCircle, HardDrive
} from 'lucide-react'
import { getSystemStatus } from '../services/api'
import useStore from '../store/useStore'
import SearchBar from './SearchBar'
import clsx from 'clsx'

const ROLE_BADGE = {
  admin:      'bg-ct-red/10    text-ct-red    border-ct-red/20',
  supervisor: 'bg-ct-amber/10  text-ct-amber  border-ct-amber/20',
  officer:    'bg-ct-blue/10   text-ct-blue   border-ct-blue/20',
  analyst:    'bg-white/5      text-ct-muted  border-white/10',
}

export default function Layout() {
  const { sidebarOpen, toggleSidebar, user, logout } = useStore()
  const [status,    setStatus]    = useState(null)
  const [showUser,  setShowUser]  = useState(false)
  const navigate = useNavigate()

  const NAV = [
    { to:'/dashboard',   icon:LayoutDashboard, label:'Dashboard' },
    { to:'/investigate', icon:Search,          label:'Investigate' },
    { to:'/cases',       icon:FolderOpen,      label:'Cases' },
    { to:'/complaints',  icon:FileText,        label:'Complaints' },
    { to:'/blacklist',   icon:Shield,          label:'Blacklist' },
    { to:'/history',     icon:Clock,           label:'History' },
    { to:'/profile',     icon:UserCircle,      label:'My Profile' },
    ...(user?.role === 'admin' || user?.role === 'supervisor'
      ? [
          { to:'/users',  icon:Users,       label:'Users' },
          { to:'/audit',  icon:ShieldAlert, label:'Audit Trail' },
        ]
      : []),
    { to:'/guide',  icon:BookOpen, label:'Guide' },
    ...(user?.role === 'admin' || user?.role === 'supervisor'
      ? [{ to:'backup', icon:HardDrive, label:'Backup' }] : []),
  ]

  useEffect(() => {
    getSystemStatus().then(r => setStatus(r.data)).catch(() => setStatus({ api:'error' }))
    const iv = setInterval(() => {
      getSystemStatus().then(r => setStatus(r.data)).catch(() => setStatus({ api:'error' }))
    }, 30000)
    return () => clearInterval(iv)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-ct-bg">

      {/* ── Sidebar ── */}
      <aside className={clsx(
        'flex flex-col border-r border-ct-border transition-all duration-200 flex-shrink-0 bg-ct-surface',
        sidebarOpen ? 'w-52' : 'w-14'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-ct-border h-14">
          <div className="w-6 h-6 flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          {sidebarOpen && (
            <div className="animate-fade-in overflow-hidden">
              <div className="text-sm font-semibold text-ct-text tracking-wide font-mono">
                <span className="text-ct-cyan">Cyber</span>Trail
              </div>
              <div className="text-[9px] text-ct-muted tracking-widest uppercase">Crime Intelligence</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => clsx(
              'flex items-center gap-3 px-2.5 py-2 rounded-md text-sm',
              isActive
                ? 'bg-ct-blue/10 text-ct-blue border border-ct-blue/20'
                : 'text-ct-muted hover:text-ct-text hover:bg-white/5'
            )}>
              <Icon size={16} className="flex-shrink-0"/>
              {sidebarOpen && <span className="animate-fade-in font-medium font-mono text-xs">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* System status */}
        {sidebarOpen && status && (
          <div className="px-3 py-3 border-t border-ct-border">
            <div className="text-[10px] text-ct-muted uppercase tracking-widest mb-2 font-mono">System</div>
            {[
              { label:'API',   val:status.api },
              { label:'Neo4j', val:status.neo4j },
              { label:'Redis', val:status.redis },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center justify-between py-0.5">
                <span className="text-[11px] text-ct-muted font-mono">{label}</span>
                <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded',
                  val === 'ok' ? 'text-ct-green bg-ct-green/10' : 'text-ct-red bg-ct-red/10')}>
                  {val === 'ok' ? '● online' : '● offline'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* User card */}
        {sidebarOpen && user && (
          <div className="px-3 py-3 border-t border-ct-border">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-ct-blue/20 border border-ct-blue/30 flex items-center justify-center flex-shrink-0">
                <User size={12} className="text-ct-blue"/>
              </div>
              <div className="flex-1 min-w-0">
                <button onClick={() => navigate('/profile')} className="text-[11px] font-mono font-semibold text-ct-text truncate hover:text-ct-blue transition-colors text-left">{user.full_name}</button>
                <div className="text-[9px] font-mono text-ct-muted truncate">{user.badge_id}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={clsx('text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase', ROLE_BADGE[user.role])}>
                {user.role}
              </span>
              <button onClick={handleLogout}
                className="flex items-center gap-1 text-[10px] font-mono text-ct-muted hover:text-ct-red transition-colors">
                <LogOut size={10}/> Logout
              </button>
            </div>
          </div>
        )}

        {/* Collapse */}
        <button onClick={toggleSidebar}
          className="flex items-center justify-center h-10 border-t border-ct-border text-ct-muted hover:text-ct-text transition-colors">
          {sidebarOpen ? <ChevronLeft size={14}/> : <ChevronRight size={14}/>}
        </button>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex-shrink-0 h-14 border-b border-ct-border bg-ct-surface flex items-center px-4 gap-4">
          <SearchBar className="w-72"/>
          <div className="flex-1"/>
          <div className="flex items-center gap-3">
            {/* Status badge */}
            <div className={clsx(
              'flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full',
              status?.api === 'ok' ? 'text-ct-green bg-ct-green/10' : 'text-ct-red bg-ct-red/10'
            )}>
              <div className={clsx('w-1.5 h-1.5 rounded-full',
                status?.api === 'ok' ? 'bg-ct-green animate-pulse' : 'bg-ct-red')}/>
              {status?.api === 'ok' ? 'All systems online' : 'API offline'}
            </div>

            {/* User pill */}
            {user && (
              <div className="flex items-center gap-2 bg-ct-bg border border-ct-border rounded-full px-3 py-1">
                <div className="w-5 h-5 rounded-full bg-ct-blue/20 flex items-center justify-center">
                  <User size={10} className="text-ct-blue"/>
                </div>
                <button onClick={() => navigate('/profile')} className="text-[11px] font-mono text-ct-text hover:text-ct-blue transition-colors">{user.username}</button>
                <span className={clsx('text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase', ROLE_BADGE[user.role])}>
                  {user.role}
                </span>
                <button onClick={handleLogout} title="Logout"
                  className="text-ct-muted hover:text-ct-red transition-colors ml-1">
                  <LogOut size={12}/>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex:1, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <Outlet/>
        </div>
      </main>
    </div>
  )
}
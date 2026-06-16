// src/pages/Profile.jsx — Officer profile view + password change
import { useState } from 'react'
import { User, Shield, Clock, BadgeCheck, Lock, Eye, EyeOff, Save, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { changePassword } from '../services/api'
import useStore from '../store/useStore'

const ROLE_COLORS = {
  admin:      'text-ct-red    bg-ct-red/10    border-ct-red/20',
  supervisor: 'text-ct-amber  bg-ct-amber/10  border-ct-amber/20',
  officer:    'text-ct-blue   bg-ct-blue/10   border-ct-blue/20',
  analyst:    'text-ct-muted  bg-white/5      border-white/10',
}

const ROLE_DESC = {
  admin:      'Full access — user management, all cases, all modules',
  supervisor: 'View all cases, assign officers, close investigations',
  officer:    'Create and manage own cases, run all investigation modules',
  analyst:    'Read-only access — view graphs and reports',
}

function InfoRow({ icon: Icon, label, value, valueClass = '' }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-ct-border/50 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-ct-blue/5 border border-ct-border flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={12} className="text-ct-muted"/>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-ct-muted font-mono uppercase tracking-widest mb-0.5">{label}</div>
        <div className={clsx('text-sm font-mono text-ct-text', valueClass)}>{value}</div>
      </div>
    </div>
  )
}

export default function Profile() {
  const { user } = useStore()

  const [pwdForm, setPwdForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pwdErrors, setPwdErrors] = useState({})

  const setPwd = (k, v) => {
    setPwdForm(f => ({ ...f, [k]: v }))
    setPwdErrors(e => ({ ...e, [k]: '' }))
  }

  const validatePwd = () => {
    const errs = {}
    if (!pwdForm.old_password)      errs.old_password = 'Current password is required'
    if (pwdForm.new_password.length < 8) errs.new_password = 'Must be at least 8 characters'
    if (pwdForm.new_password !== pwdForm.confirm) errs.confirm = 'Passwords do not match'
    if (pwdForm.new_password === pwdForm.old_password) errs.new_password = 'New password must be different'
    setPwdErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handlePasswordChange = async () => {
    if (!validatePwd()) return
    setLoading(true)
    try {
      await changePassword({
        old_password: pwdForm.old_password,
        new_password: pwdForm.new_password,
      })
      toast.success('Password changed successfully')
      setPwdForm({ old_password: '', new_password: '', confirm: '' })
    } catch {
      // error shown by axios interceptor
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <div style={{height:'100%', overflowY:'auto', padding:'1.5rem'}} className="animate-fade-in">

      <div className="max-w-2xl mx-auto">

        {/* ── Profile Header ── */}
        <div className="bg-ct-surface border border-ct-border rounded-2xl p-6 mb-4">
          <div className="flex items-center gap-4 mb-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-ct-blue/10 border border-ct-blue/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-ct-blue font-mono">
                {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-ct-text font-mono">{user.full_name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-ct-muted font-mono">@{user.username}</span>
                <span className={clsx('inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono uppercase', ROLE_COLORS[user.role])}>
                  {user.role}
                </span>
                <span className="text-[10px] font-mono text-ct-green">● Active</span>
              </div>
            </div>
          </div>

          {/* Role description */}
          <div className="bg-ct-blue/5 border border-ct-blue/10 rounded-xl px-4 py-3 mb-5">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield size={11} className="text-ct-blue"/>
              <span className="text-[10px] text-ct-blue font-mono uppercase tracking-widest">Access Level</span>
            </div>
            <p className="text-xs text-ct-muted font-mono">{ROLE_DESC[user.role]}</p>
          </div>

          {/* Profile details — read only */}
          <div className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-3">
            Officer Details
          </div>
          <div>
            <InfoRow icon={BadgeCheck} label="Badge ID"    value={user.badge_id}/>
            <InfoRow icon={User}       label="Department"  value={user.department}/>
            <InfoRow icon={User}       label="Designation" value={user.designation}/>
            <InfoRow icon={User}       label="Email"       value={user.email}/>
            <InfoRow icon={Clock}      label="Member Since"
              value={user.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' }) : null}/>
            <InfoRow icon={Clock}      label="Last Login"
              value={user.last_login ? new Date(user.last_login).toLocaleString('en-IN') : 'First session'}/>
          </div>

          <div className="mt-4 pt-3 border-t border-ct-border">
            <p className="text-[10px] text-ct-muted font-mono text-center">
              To update your profile details, contact your supervisor or admin.
            </p>
          </div>
        </div>

        {/* ── Change Password ── */}
        <div className="bg-ct-surface border border-ct-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-ct-amber/10 border border-ct-amber/20 flex items-center justify-center">
              <Lock size={13} className="text-ct-amber"/>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ct-text font-mono">Change Password</h2>
              <p className="text-[10px] text-ct-muted">You must know your current password to change it</p>
            </div>
          </div>

          <div className="space-y-4">

            {/* Old password */}
            <div>
              <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1.5 tracking-widest">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showOld ? 'text' : 'password'}
                  value={pwdForm.old_password}
                  onChange={e => setPwd('old_password', e.target.value)}
                  placeholder="Enter your current password"
                  className={clsx(
                    'w-full bg-ct-bg border rounded-lg px-3 py-2.5 text-sm font-mono text-ct-text placeholder-ct-muted outline-none transition-colors pr-10',
                    pwdErrors.old_password ? 'border-ct-red/50 focus:border-ct-red' : 'border-ct-border focus:border-ct-blue/50'
                  )}
                />
                <button type="button" onClick={() => setShowOld(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ct-muted hover:text-ct-text">
                  {showOld ? <EyeOff size={13}/> : <Eye size={13}/>}
                </button>
              </div>
              {pwdErrors.old_password && (
                <p className="text-[10px] text-ct-red font-mono mt-1">{pwdErrors.old_password}</p>
              )}
            </div>

            {/* New password */}
            <div>
              <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1.5 tracking-widest">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={pwdForm.new_password}
                  onChange={e => setPwd('new_password', e.target.value)}
                  placeholder="Min 8 characters"
                  className={clsx(
                    'w-full bg-ct-bg border rounded-lg px-3 py-2.5 text-sm font-mono text-ct-text placeholder-ct-muted outline-none transition-colors pr-10',
                    pwdErrors.new_password ? 'border-ct-red/50 focus:border-ct-red' : 'border-ct-border focus:border-ct-blue/50'
                  )}
                />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ct-muted hover:text-ct-text">
                  {showNew ? <EyeOff size={13}/> : <Eye size={13}/>}
                </button>
              </div>
              {pwdErrors.new_password && (
                <p className="text-[10px] text-ct-red font-mono mt-1">{pwdErrors.new_password}</p>
              )}
              {/* Strength indicator */}
              {pwdForm.new_password && (
                <div className="flex gap-1 mt-2">
                  {[1,2,3,4].map(i => {
                    const len = pwdForm.new_password.length
                    const hasUpper = /[A-Z]/.test(pwdForm.new_password)
                    const hasNum   = /[0-9]/.test(pwdForm.new_password)
                    const hasSpec  = /[^A-Za-z0-9]/.test(pwdForm.new_password)
                    const score    = (len >= 8 ? 1 : 0) + (hasUpper ? 1 : 0) + (hasNum ? 1 : 0) + (hasSpec ? 1 : 0)
                    const colors   = ['bg-ct-red', 'bg-ct-amber', 'bg-ct-blue', 'bg-ct-green']
                    return (
                      <div key={i} className={clsx(
                        'h-1 flex-1 rounded-full transition-all',
                        i <= score ? colors[score - 1] : 'bg-ct-border'
                      )}/>
                    )
                  })}
                  <span className="text-[9px] font-mono text-ct-muted ml-1">
                    {['','Weak','Fair','Strong','Very strong'][
                      (pwdForm.new_password.length >= 8 ? 1 : 0) +
                      (/[A-Z]/.test(pwdForm.new_password) ? 1 : 0) +
                      (/[0-9]/.test(pwdForm.new_password) ? 1 : 0) +
                      (/[^A-Za-z0-9]/.test(pwdForm.new_password) ? 1 : 0)
                    ]}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1.5 tracking-widest">
                Confirm New Password
              </label>
              <input
                type="password"
                value={pwdForm.confirm}
                onChange={e => setPwd('confirm', e.target.value)}
                placeholder="Re-enter new password"
                className={clsx(
                  'w-full bg-ct-bg border rounded-lg px-3 py-2.5 text-sm font-mono text-ct-text placeholder-ct-muted outline-none transition-colors',
                  pwdErrors.confirm ? 'border-ct-red/50' : pwdForm.confirm && pwdForm.confirm === pwdForm.new_password ? 'border-ct-green/50' : 'border-ct-border focus:border-ct-blue/50'
                )}
              />
              {pwdErrors.confirm && (
                <p className="text-[10px] text-ct-red font-mono mt-1">{pwdErrors.confirm}</p>
              )}
              {pwdForm.confirm && pwdForm.confirm === pwdForm.new_password && !pwdErrors.confirm && (
                <p className="text-[10px] text-ct-green font-mono mt-1">✓ Passwords match</p>
              )}
            </div>

            <button
              onClick={handlePasswordChange}
              disabled={loading || !pwdForm.old_password || !pwdForm.new_password || !pwdForm.confirm}
              className="w-full h-11 bg-ct-amber/10 border border-ct-amber/20 text-ct-amber rounded-xl text-sm font-mono font-semibold flex items-center justify-center gap-2 hover:bg-ct-amber/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin"/> Changing password…</>
                : <><Lock size={15}/> Change Password</>
              }
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
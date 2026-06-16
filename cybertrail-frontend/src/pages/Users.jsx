// src/pages/Users.jsx
import { useState, useEffect } from 'react'
import { Users as UsersIcon, Plus, Edit2, Trash2, X, Loader2, Eye, EyeOff, Save, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { listUsers, createUser, updateUser, deleteUser, adminResetPassword } from '../services/api'
import useStore from '../store/useStore'

const ROLE_COLORS = {
  admin:      'text-ct-red    bg-ct-red/10    border-ct-red/20',
  supervisor: 'text-ct-amber  bg-ct-amber/10  border-ct-amber/20',
  officer:    'text-ct-blue   bg-ct-blue/10   border-ct-blue/20',
  analyst:    'text-ct-muted  bg-white/5      border-white/10',
}

// ── Shared field component ────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1 tracking-widest">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 transition-colors"/>
  )
}

// ── Create User Modal ─────────────────────────────────────
function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    username:'', password:'', full_name:'', badge_id:'',
    department:'Cybercrime', designation:'Sub-Inspector', role:'officer', email:''
  })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.username || !form.password || !form.full_name || !form.badge_id) {
      toast.error('Username, password, full name and badge ID are required')
      return
    }
    setLoading(true)
    try {
      await createUser(form)
      toast.success(`User ${form.username} created`)
      onCreated(); onClose()
    } catch {} finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-ct-surface border border-ct-border rounded-2xl w-full max-w-md shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-ct-border">
          <div>
            <h2 className="text-sm font-semibold text-ct-text font-mono">Create New Officer Account</h2>
            <p className="text-[10px] text-ct-muted mt-0.5">All fields marked * are required</p>
          </div>
          <button onClick={onClose} className="text-ct-muted hover:text-ct-text"><X size={16}/></button>
        </div>

        <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
          <Field label="Full Name *">
            <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Inspector Ramesh Kumar"/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username *">
              <Input value={form.username} onChange={e => set('username', e.target.value)} placeholder="r.kumar"/>
            </Field>
            <Field label="Badge ID *">
              <Input value={form.badge_id} onChange={e => set('badge_id', e.target.value)} placeholder="KA-CID-001"/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <Input value={form.department} onChange={e => set('department', e.target.value)} placeholder="Cybercrime Division"/>
            </Field>
            <Field label="Designation">
              <Input value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="Inspector"/>
            </Field>
          </div>
          <Field label="Email">
            <Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="officer@police.gov.in" type="email"/>
          </Field>
          <Field label="Password *">
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} value={form.password}
                onChange={e => set('password', e.target.value)} placeholder="Min 8 characters"
                className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 pr-9"/>
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ct-muted hover:text-ct-text">
                {showPwd ? <EyeOff size={13}/> : <Eye size={13}/>}
              </button>
            </div>
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={e => set('role', e.target.value)}
              className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text outline-none focus:border-ct-blue/50">
              {['officer','analyst','supervisor','admin'].map(r =>
                <option key={r} value={r} style={{background:'#0f1318'}}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>
              )}
            </select>
          </Field>
        </div>

        <div className="flex gap-2 p-5 border-t border-ct-border">
          <button onClick={onClose} className="flex-1 h-10 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 h-10 bg-ct-blue text-white rounded-lg text-sm font-mono font-semibold flex items-center justify-center gap-2 hover:bg-blue-500 transition-all disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit User Modal ───────────────────────────────────────
function EditUserModal({ user, onClose, onUpdated }) {
  const [form, setForm] = useState({
    full_name:   user.full_name   || '',
    badge_id:    user.badge_id    || '',
    department:  user.department  || '',
    designation: user.designation || '',
    email:       user.email       || '',
    role:        user.role        || 'officer',
    is_active:   user.is_active   ?? true,
  })
  const [showNewPwd, setShowNewPwd]   = useState(false)
  const [loading, setLoading]         = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.full_name || !form.badge_id) {
      toast.error('Full name and Badge ID are required')
      return
    }
    const pwd = form.new_password?.trim() || ''
    if (pwd && pwd.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      // Update user details
      await updateUser(user.id, form)

      // If admin typed a new password, reset it
      if (pwd) {
        const { default: axios } = await import('axios')
        const stored = localStorage.getItem('cybertrail-store')
        const token  = stored ? JSON.parse(stored)?.state?.accessToken : null
        await axios.put(
          `/api/v1/auth/users/${user.id}/reset-password`,
          { new_password: pwd },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        toast.success('Password reset successfully')
      }

      toast.success(`${user.username} updated successfully`)
      onUpdated(); onClose()
    } catch {} finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-ct-surface border border-ct-border rounded-2xl w-full max-w-md shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-ct-border">
          <div>
            <h2 className="text-sm font-semibold text-ct-text font-mono flex items-center gap-2">
              <Edit2 size={14} className="text-ct-blue"/> Edit Officer
            </h2>
            <p className="text-[10px] text-ct-muted mt-0.5">
              Editing: <span className="text-ct-cyan font-mono">{user.username}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-ct-muted hover:text-ct-text"><X size={16}/></button>
        </div>

        <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
          <Field label="Full Name *">
            <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Full name"/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Badge ID *">
              <Input value={form.badge_id} onChange={e => set('badge_id', e.target.value)} placeholder="Badge ID"/>
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email" type="email"/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <Input value={form.department} onChange={e => set('department', e.target.value)} placeholder="Department"/>
            </Field>
            <Field label="Designation">
              <Input value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="Designation"/>
            </Field>
          </div>
          <Field label="Role">
            <select value={form.role} onChange={e => set('role', e.target.value)}
              className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text outline-none focus:border-ct-blue/50">
              {['officer','analyst','supervisor','admin'].map(r =>
                <option key={r} value={r} style={{background:'#0f1318'}}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>
              )}
            </select>
          </Field>
          <Field label="Reset Password (optional)">
            <div className="relative">
              <input
                type={showNewPwd ? 'text' : 'password'}
                value={form.new_password || ''}
                onChange={e => set('new_password', e.target.value)}
                placeholder="Leave blank to keep current password"
                className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-amber/50 transition-colors pr-9"/>
              <button type="button" onClick={() => setShowNewPwd(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ct-muted hover:text-ct-text">
                {showNewPwd ? <EyeOff size={13}/> : <Eye size={13}/>}
              </button>
            </div>
            {form.new_password && form.new_password.length < 8 && (
              <p className="text-[10px] text-ct-red font-mono mt-1">Min 8 characters</p>
            )}
          </Field>
          <Field label="Account Status">
            <div className="flex gap-2">
              {[true, false].map(v => (
                <button key={String(v)} onClick={() => set('is_active', v)}
                  className={clsx(
                    'flex-1 h-9 rounded-lg text-xs font-mono border transition-all',
                    form.is_active === v
                      ? v ? 'bg-ct-green/10 border-ct-green/30 text-ct-green' : 'bg-ct-red/10 border-ct-red/30 text-ct-red'
                      : 'border-ct-border text-ct-muted hover:text-ct-text'
                  )}>
                  {v ? '● Active' : '● Disabled'}
                </button>
              ))}
            </div>
          </Field>

        </div>

        <div className="flex gap-2 p-5 border-t border-ct-border">
          <button onClick={onClose}
            className="flex-1 h-10 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={loading}
            className="flex-1 h-10 bg-ct-blue text-white rounded-lg text-sm font-mono font-semibold flex items-center justify-center gap-2 hover:bg-blue-500 transition-all disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reset Password Modal ──────────────────────────────────
function ResetPasswordModal({ user, onClose }) {
  const [newPwd, setNewPwd]   = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (newPwd.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await adminResetPassword(user.id, { new_password: newPwd })
      toast.success(`Password reset for ${user.username}`)
      onClose()
    } catch {} finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-ct-surface border border-ct-border rounded-2xl w-full max-w-sm shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-ct-border">
          <div>
            <h2 className="text-sm font-semibold text-ct-text font-mono">Reset Password</h2>
            <p className="text-[10px] text-ct-muted mt-0.5 font-mono">
              Officer: <span className="text-ct-cyan">{user.username}</span> ({user.badge_id})
            </p>
          </div>
          <button onClick={onClose} className="text-ct-muted hover:text-ct-text"><X size={16}/></button>
        </div>
        <div className="p-5">
          <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1.5 tracking-widest">
            New Password (min 8 characters)
          </label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="Enter new password"
              className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2.5 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 pr-9"
            />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ct-muted hover:text-ct-text">
              {showPwd ? <EyeOff size={13}/> : <Eye size={13}/>}
            </button>
          </div>
          <p className="text-[10px] text-ct-muted font-mono mt-2">
            Officer will need to use this new password on their next login.
          </p>
        </div>
        <div className="flex gap-2 p-5 border-t border-ct-border">
          <button onClick={onClose} className="flex-1 h-10 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={loading || newPwd.length < 8}
            className="flex-1 h-10 bg-ct-amber/10 border border-ct-amber/30 text-ct-amber rounded-lg text-sm font-mono font-semibold flex items-center justify-center gap-2 hover:bg-ct-amber/20 transition-all disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin"/> : <KeyRound size={14}/>}
            Reset Password
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────
export default function Users() {
  const { user: me }          = useStore()
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [resettingUser, setResettingUser] = useState(null)   // user being edited

  const load = async () => {
    setLoading(true)
    try { const res = await listUsers(); setUsers(res.data) }
    catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (u) => {
    if (!confirm(`Delete user ${u.username}? This cannot be undone.`)) return
    await deleteUser(u.id)
    toast.success(`User ${u.username} deleted`)
    load()
  }

  return (
    <div style={{height:'100%', overflowY:'auto', padding:'1.5rem'}} className="animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ct-text font-mono flex items-center gap-2">
            <UsersIcon size={18} className="text-ct-blue"/> User Management
          </h1>
          <p className="text-xs text-ct-muted mt-0.5">{users.length} officer accounts</p>
        </div>
        {me?.role === 'admin' && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ct-blue text-white rounded-lg text-sm font-mono font-semibold hover:bg-blue-500 active:scale-95 transition-all">
            <Plus size={14}/> New Officer
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-ct-muted"/>
        </div>
      ) : (
        <div className="bg-ct-surface border border-ct-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ct-border bg-ct-bg/50">
                {['Officer','Badge ID','Department','Designation','Role','Status','Last Login','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] text-ct-muted font-mono uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={clsx(
                  'border-b border-ct-border/50 transition-colors hover:bg-white/[0.02]',
                  !u.is_active && 'opacity-50'
                )}>
                  <td className="px-4 py-3">
                    <div className="text-xs font-mono font-semibold text-ct-text">{u.full_name}</div>
                    <div className="text-[10px] font-mono text-ct-muted">@{u.username}</div>
                    {u.email && <div className="text-[10px] font-mono text-ct-muted/60">{u.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-ct-muted">{u.badge_id}</td>
                  <td className="px-4 py-3 text-xs font-mono text-ct-muted">{u.department}</td>
                  <td className="px-4 py-3 text-xs font-mono text-ct-muted">{u.designation}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono uppercase', ROLE_COLORS[u.role])}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-[10px] font-mono', u.is_active ? 'text-ct-green' : 'text-ct-red')}>
                      {u.is_active ? '● Active' : '● Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[10px] font-mono text-ct-muted whitespace-nowrap">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString('en-IN') : 'Never'}
                  </td>

                  {/* ── Action buttons ── */}
                  <td className="px-4 py-3">
                    {me?.role === 'admin' && u.username !== me.username ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => setEditingUser(u)}
                          className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-ct-blue/30 text-ct-blue hover:bg-ct-blue/10 transition-colors">
                          <Edit2 size={10}/> Edit
                        </button>
                        <button onClick={() => setResettingUser(u)}
                          className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-ct-amber/30 text-ct-amber hover:bg-ct-amber/5 transition-colors">
                          <KeyRound size={10}/> Reset Pwd
                        </button>
                        {u.username !== 'admin' && (
                          <button onClick={() => handleDelete(u)}
                            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors">
                            <Trash2 size={10}/> Delete
                          </button>
                        )}
                        {u.username === 'admin' && (
                          <span className="text-[10px] font-mono text-ct-amber px-2 py-1 rounded border border-ct-amber/20 bg-ct-amber/5">
                            🔒 Protected
                          </span>
                        )}
                      </div>
                    ) : u.username === me.username ? (
                      <span className="text-[10px] text-ct-muted font-mono">You</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="py-12 text-center text-ct-muted text-sm font-mono">
              No users found
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={load}/>
      )}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdated={load}
        />
      )}
      {resettingUser && (
        <ResetPasswordModal
          user={resettingUser}
          onClose={() => setResettingUser(null)}
        />
      )}
    </div>
  )
}
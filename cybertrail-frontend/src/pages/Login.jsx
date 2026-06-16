// src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { login } from '../services/api'
import useStore from '../store/useStore'

export default function Login() {
  const navigate   = useNavigate()
  const { setAuth } = useStore()
  const [form, setForm]       = useState({ username: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) {
      toast.error('Enter username and password')
      return
    }
    setLoading(true)
    try {
      const res = await login(form)
      const { access_token, refresh_token, user } = res.data
      setAuth(user, access_token, refresh_token)
      toast.success(`Welcome, ${user.full_name}`)
      navigate('/dashboard', { replace: true })
    } catch {
      // error shown by axios interceptor
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ct-bg scan-grid">
      <div className="w-full max-w-md animate-fade-in">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ct-blue/10 border border-ct-blue/20 mb-4">
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold font-mono text-ct-text">
            <span className="text-ct-cyan">Cyber</span>Trail
          </h1>
          <p className="text-ct-muted text-sm mt-1 font-mono">Financial Crime Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className="bg-ct-surface border border-ct-border rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-ct-text font-mono mb-1">Officer Login</h2>
          <p className="text-ct-muted text-xs font-mono mb-6">Authorised personnel only</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1.5 tracking-widest">
                Username / Badge ID
              </label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="officer.username"
                autoComplete="username"
                className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2.5 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/60 transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1.5 tracking-widest">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2.5 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/60 transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ct-muted hover:text-ct-text transition-colors"
                >
                  {showPwd ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-ct-blue text-white rounded-lg font-mono font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-50 mt-2"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin"/> Authenticating…</>
                : <><Shield size={16}/> Sign In</>
              }
            </button>
          </form>

          {/* Default creds hint */}
          <div className="mt-6 pt-4 border-t border-ct-border">
            <p className="text-[10px] text-ct-muted font-mono text-center">
              Default admin: <span className="text-ct-cyan">admin</span> / <span className="text-ct-cyan">Admin@123</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-ct-muted font-mono mt-6">
          CyberTrail v1.0 · Confidential · Law Enforcement Use Only
        </p>
      </div>
    </div>
  )
}
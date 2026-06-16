// src/components/SearchBar.jsx
// Global entity search - searches across all saved nodes in Neo4j

import { useState, useRef, useEffect } from 'react'
import { Search, X, Bitcoin, CreditCard, Building2, Phone, User } from 'lucide-react'
import { searchEntities } from '../services/api'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import clsx from 'clsx'

const TYPE_ICONS = {
  wallet:       { icon: Bitcoin,    color: 'text-ct-blue'   },
  upi_account:  { icon: CreditCard, color: 'text-ct-green'  },
  bank_account: { icon: CreditCard, color: 'text-ct-green'  },
  company:      { icon: Building2,  color: 'text-ct-amber'  },
  phone:        { icon: Phone,      color: 'text-ct-purple' },
  person:       { icon: User,       color: 'text-ct-muted'  },
}

export default function SearchBar({ className = '' }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [open, setOpen]         = useState(false)
  const inputRef  = useRef(null)
  const timerRef  = useRef(null)
  const navigate  = useNavigate()
  const { setActiveModule } = useStore()

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await searchEntities(query.trim(), 10)
        setResults(r.data.results || [])
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => clearTimeout(timerRef.current)
  }, [query])

  const selectResult = (result) => {
    // Navigate to investigate page with this identifier pre-filled
    const modMap = {
      'wallet': 'crypto',
      'upi_account': 'upi',
      'bank_account': 'upi',
      'company': 'shell',
      'phone': 'social',
    }
    const mod = modMap[result.type] || 'multi'
    setActiveModule(mod)
    navigate('/investigate', { state: { identifier: result.id, module: mod } })
    setQuery('')
    setOpen(false)
  }

  const clear = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className={clsx('relative', className)}>
      {/* Input */}
      <div className="flex items-center gap-2 bg-ct-bg border border-ct-border rounded-lg px-3 h-9 focus-within:border-ct-blue/40 transition-colors">
        <Search size={13} className={clsx('flex-shrink-0 transition-colors', loading ? 'text-ct-cyan' : 'text-ct-muted')} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search any entity…"
          className="flex-1 bg-transparent text-sm text-ct-text font-mono placeholder-ct-muted outline-none min-w-0"
        />
        {query && (
          <button onClick={clear} className="text-ct-muted hover:text-ct-text flex-shrink-0">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-ct-surface border border-ct-border rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-up">
          <div className="px-3 py-2 border-b border-ct-border">
            <span className="text-[10px] text-ct-muted font-mono uppercase tracking-widest">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {results.map((r, i) => {
              const typeInfo = TYPE_ICONS[r.type] || TYPE_ICONS.phone
              const Icon = typeInfo.icon
              return (
                <button
                  key={i}
                  onClick={() => selectResult(r)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left">
                  <Icon size={13} className={clsx('flex-shrink-0', typeInfo.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-ct-text truncate">{r.label || r.id}</div>
                    <div className="text-[10px] text-ct-muted font-mono truncate">{r.id}</div>
                  </div>
                  {r.flagged && (
                    <div className="w-1.5 h-1.5 rounded-full bg-ct-red flex-shrink-0" title="Flagged"/>
                  )}
                  <span className="text-[9px] text-ct-muted font-mono flex-shrink-0 capitalize">
                    {r.type?.replace('_', ' ')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* No results */}
      {open && results.length === 0 && !loading && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-ct-surface border border-ct-border rounded-xl shadow-2xl z-50 px-4 py-3 animate-slide-up">
          <span className="text-xs text-ct-muted font-mono">No entities found for "{query}"</span>
        </div>
      )}
    </div>
  )
}

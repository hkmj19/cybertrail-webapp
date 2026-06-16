// src/pages/History.jsx
import { Clock, Trash2, ArrowRight, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import clsx from 'clsx'

const MODULE_COLORS = {
  crypto: 'text-ct-blue  bg-ct-blue/10  border-ct-blue/20',
  upi:    'text-ct-green bg-ct-green/10 border-ct-green/20',
  shell:  'text-ct-amber bg-ct-amber/10 border-ct-amber/20',
  social: 'text-ct-purple bg-ct-purple/10 border-ct-purple/20',
  multi:  'text-ct-cyan  bg-ct-cyan/10  border-ct-cyan/20',
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function History() {
  const { history, clearHistory, setActiveModule } = useStore()
  const navigate = useNavigate()

  const rerun = (entry) => {
    setActiveModule(entry.module)
    navigate('/investigate', { state: { identifier: entry.identifier, module: entry.module } })
  }

  return (
    <div style={{height:"100%", overflowY:"auto", padding:"1.5rem"}} className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ct-text font-mono flex items-center gap-2">
            <Clock size={18} className="text-ct-muted"/> Investigation History
          </h1>
          <p className="text-ct-muted text-sm">Your last 20 traces this session</p>
        </div>
        {history.length > 0 && (
          <button onClick={clearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-ct-muted hover:text-ct-red border border-ct-border hover:border-ct-red/30 rounded-md transition-colors">
            <Trash2 size={12}/> Clear
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Clock size={32} className="text-ct-border mb-3"/>
          <p className="text-ct-muted text-sm font-mono">No investigations yet this session</p>
          <p className="text-ct-muted/50 text-xs mt-1">Traces appear here as you investigate</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((entry, i) => (
            <div key={i}
              className="bg-ct-surface border border-ct-border rounded-xl px-4 py-3 flex items-center gap-4 hover:border-ct-border2 transition-colors group animate-slide-up"
              style={{ animationDelay: `${i * 30}ms` }}>

              {/* Module badge */}
              <span className={clsx(
                'text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider flex-shrink-0',
                MODULE_COLORS[entry.module]
              )}>
                {entry.module}
              </span>

              {/* Identifier */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-mono text-ct-text truncate">{entry.identifier}</div>
                <div className="text-[10px] text-ct-muted mt-0.5 font-mono">
                  {entry.total_nodes} nodes · {timeAgo(entry.timestamp)}
                </div>
              </div>

              {/* Flagged count */}
              {entry.flagged_count > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <AlertTriangle size={11} className="text-ct-red"/>
                  <span className="text-xs font-mono text-ct-red">{entry.flagged_count}</span>
                </div>
              )}

              {/* Re-run button */}
              <button
                onClick={() => rerun(entry)}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-mono text-ct-muted hover:text-ct-cyan border border-ct-border hover:border-ct-cyan/30 rounded-md transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0">
                Re-run <ArrowRight size={11}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
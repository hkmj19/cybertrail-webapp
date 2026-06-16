// src/components/GraphLegend.jsx
// Legend overlay for the graph canvas showing node type colours

import clsx from 'clsx'

const LEGEND = [
  { label: 'BTC wallet',    color: '#3b82f6', shape: 'circle' },
  { label: 'ETH wallet',    color: '#60a5fa', shape: 'circle' },
  { label: 'TRON / USDT',   color: '#06b6d4', shape: 'circle' },
  { label: 'UPI / bank',    color: '#22c55e', shape: 'circle' },
  { label: 'Mule account',  color: '#f97316', shape: 'circle' },
  { label: 'Phone',         color: '#a855f7', shape: 'circle' },
  { label: 'Company',       color: '#f59e0b', shape: 'rect'   },
  { label: 'Person',        color: '#64748b', shape: 'circle' },
  { label: 'Flagged',       color: '#ef4444', shape: 'circle' },
]

export default function GraphLegend({ className = '' }) {
  return (
    <div className={clsx(
      'absolute bottom-3 right-3 bg-ct-surface/90 backdrop-blur-sm border border-ct-border rounded-lg px-3 py-2.5',
      className
    )}>
      <div className="text-[9px] text-ct-muted font-mono uppercase tracking-widest mb-2">Legend</div>
      <div className="space-y-1.5">
        {LEGEND.map(l => (
          <div key={l.label} className="flex items-center gap-2">
            {l.shape === 'rect' ? (
              <div className="w-3 h-2 rounded-sm flex-shrink-0 border"
                style={{ background: l.color + '20', borderColor: l.color }} />
            ) : (
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 border"
                style={{ background: l.color + '20', borderColor: l.color }} />
            )}
            <span className="text-[10px] text-ct-muted font-mono">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


// src/components/ui.jsx
// Shared reusable UI primitives used across all pages

import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

// ── Spinner ────────────────────────────────────────────
export function Spinner({ size = 16, className = '' }) {
  return (
    <Loader2
      size={size}
      className={clsx('animate-spin text-ct-muted', className)}
    />
  )
}

// ── Badge ──────────────────────────────────────────────
const BADGE_VARIANTS = {
  blue:   'bg-ct-blue/10   text-ct-blue   border-ct-blue/20',
  green:  'bg-ct-green/10  text-ct-green  border-ct-green/20',
  red:    'bg-ct-red/10    text-ct-red    border-ct-red/20',
  amber:  'bg-ct-amber/10  text-ct-amber  border-ct-amber/20',
  purple: 'bg-ct-purple/10 text-ct-purple border-ct-purple/20',
  cyan:   'bg-ct-cyan/10   text-ct-cyan   border-ct-cyan/20',
  gray:   'bg-white/5      text-ct-muted  border-white/10',
}

export function Badge({ children, variant = 'gray', className = '' }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider',
      BADGE_VARIANTS[variant],
      className
    )}>
      {children}
    </span>
  )
}

// ── Metric card ────────────────────────────────────────
export function MetricCard({ label, value, sub, color = 'text-ct-text', icon: Icon }) {
  return (
    <div className="bg-ct-surface border border-ct-border rounded-xl p-4">
      {Icon && (
        <div className={clsx('mb-3 p-1.5 rounded-lg w-fit', color.replace('text-', 'bg-') + '/10')}>
          <Icon size={14} className={color} />
        </div>
      )}
      <div className={clsx('text-2xl font-semibold font-mono mb-0.5', color)}>
        {value ?? '-'}
      </div>
      <div className="text-xs text-ct-muted">{label}</div>
      {sub && <div className="text-[10px] text-ct-muted/60 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Empty state ────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon size={32} className="text-ct-border mb-3" />}
      <p className="text-ct-muted text-sm font-mono">{title}</p>
      {description && (
        <p className="text-ct-muted/50 text-xs mt-1">{description}</p>
      )}
    </div>
  )
}

// ── Section header ─────────────────────────────────────
export function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <span className="text-[10px] text-ct-muted uppercase tracking-widest font-mono">
        {title}
      </span>
      {action}
    </div>
  )
}

// ── Divider ────────────────────────────────────────────
export function Divider({ className = '' }) {
  return <div className={clsx('border-t border-ct-border', className)} />
}

// ── Table ──────────────────────────────────────────────
export function Table({ headers, rows, emptyMessage = 'No data' }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-ct-muted font-mono">
        {emptyMessage}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-ct-border">
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-2 text-[10px] text-ct-muted font-mono uppercase tracking-widest whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-ct-border/50 hover:bg-white/[0.02] transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-xs font-mono text-ct-text">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Input ──────────────────────────────────────────────
export function Input({ label, ...props }) {
  return (
    <div>
      {label && (
        <label className="block text-[10px] text-ct-muted uppercase font-mono mb-1">
          {label}
        </label>
      )}
      <input
        className="w-full bg-ct-bg border border-ct-border rounded-md px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted outline-none focus:border-ct-blue/50 transition-colors"
        {...props}
      />
    </div>
  )
}

// ── Button ─────────────────────────────────────────────
const BTN_VARIANTS = {
  primary:  'bg-ct-blue text-white hover:bg-blue-500',
  danger:   'bg-ct-red/80 text-white hover:bg-ct-red',
  ghost:    'bg-transparent text-ct-muted border border-ct-border hover:text-ct-text hover:border-ct-border2',
  success:  'bg-ct-green/10 text-ct-green border border-ct-green/20 hover:bg-ct-green/20',
}

export function Button({ children, variant = 'ghost', className = '', disabled, ...props }) {
  return (
    <button
      disabled={disabled}
      className={clsx(
        'flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-mono transition-all',
        'active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
        BTN_VARIANTS[variant],
        className
      )}
      {...props}>
      {children}
    </button>
  )
}

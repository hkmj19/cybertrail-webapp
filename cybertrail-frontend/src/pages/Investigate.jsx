// src/pages/Investigate.jsx
import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Search, Bitcoin, CreditCard, Building2,
  Phone, Layers, Maximize2, RotateCcw,
  Eye, EyeOff, Loader2,
  AlertTriangle, ChevronDown, X, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import GraphCanvas from '../components/GraphCanvas'
import NodePanel from '../components/NodePanel'
import GraphLegend from '../components/GraphLegend'
import useStore from '../store/useStore'
import { useTrace } from '../hooks/useTrace'
// services not needed for local export

const MODULES = [
  { id: 'crypto', icon: Bitcoin,    label: 'Crypto',  color: 'text-ct-blue',   placeholder: 'BTC / ETH / TRON wallet address' },
  { id: 'upi',    icon: CreditCard, label: 'UPI',     color: 'text-ct-green',  placeholder: 'UPI ID (fraud@paytm) or phone (9876543210)' },
  { id: 'shell',  icon: Building2,  label: 'Shell',   color: 'text-ct-amber',  placeholder: 'Company CIN, name, or director DIN' },
  { id: 'social', icon: Phone,      label: 'Social',  color: 'text-ct-purple', placeholder: 'Phone number (9876543210) or UPI ID' },
  { id: 'multi',  icon: Layers,     label: 'Multi',   color: 'text-ct-cyan',   placeholder: 'Any identifier - runs all 4 modules' },
]
const DEPTHS  = [1, 2, 3, 4, 5]
const LAYOUTS = ['cose', 'concentric', 'breadthfirst', 'circle', 'grid']
const EXAMPLES = {
  crypto: 'bc1qxy2kgdygjrsqtzq2n0yrf2498gq',
  upi:    'fraud@paytm',
  shell:  'L21091KA2019PTC123456',
  social: '9876543210',
  multi:  'fraud@paytm',
}

export default function Investigate() {
  const {
    graph, setGraph, isLoading,
    activeModule, setActiveModule,
    selectedNode, setSelectedNode,
    showLabels, toggleLabels,
    showFlaggedOnly, toggleFlaggedOnly,
    graphLayout, setGraphLayout,
  } = useStore()

  const { trace }    = useTrace()
  const location     = useLocation()
  const graphRef     = useRef(null)   // ← direct ref to GraphCanvas methods

  const [identifier,     setIdentifier]     = useState('')
  const [depth,          setDepth]          = useState(2)
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)

  useEffect(() => {
    const s = location.state
    if (!s) return
    if (s.rerun)    { setIdentifier(s.rerun.identifier); setActiveModule(s.rerun.module); setDepth(2) }
    if (s.module)     setActiveModule(s.module)
    if (s.identifier) setIdentifier(s.identifier)
  }, [location.state])

  const handleModuleSwitch = (id) => {
    if (id === activeModule) return
    setActiveModule(id)
    setIdentifier('')
    setGraph(null)
    setSelectedNode(null)
  }

  const handleClear = () => {
    setIdentifier('')
    setGraph(null)
    setSelectedNode(null)
  }

  const activeConfig = MODULES.find(m => m.id === activeModule)

  const runTrace = async () => {
    if (!identifier.trim()) { toast.error('Enter an identifier first'); return }
    setSelectedNode(null)
    await trace(activeModule, identifier.trim(), depth)
  }

  // ── Toolbar actions using direct ref ─────────────────
  const handleFit = () => {
    if (graphRef.current) {
      graphRef.current.fit()
    } else {
      toast.error('Graph not ready - run a trace first')
    }
  }

  const handleReset = () => {
    graphRef.current?.reset()
    setSelectedNode(null)
  }

  const handleReLayout = () => {
    graphRef.current?.reLayout()
    toast.success('Layout refreshed')
  }

  const handleExport = (format = 'png') => {
    if (!graph) return

    if (format === 'png') {
      // Export as image via Cytoscape's built-in PNG renderer
      const name = `cybertrail_${graph.module}_${(graph.seed_identifier || 'graph').slice(0,12).replace(/[^a-z0-9]/gi,'_')}.png`
      const ok = graphRef.current?.exportPNG(name)
      if (ok) {
        toast.success(`Saved as ${name}`)
      } else {
        toast.error('PNG export failed - try JSON instead')
      }
      return
    }

    // JSON export - from local graph state, no API needed
    try {
      const exportData = {
        session_id:      graph.session_id,
        seed_identifier: graph.seed_identifier,
        module:          graph.module,
        total_nodes:     graph.total_nodes,
        total_edges:     graph.total_edges,
        flagged_count:   graph.flagged_count,
        total_value_inr: graph.total_value_inr,
        nodes: graph.nodes.map(n => ({
          id: n.id, label: n.label, node_type: n.node_type,
          flagged: n.flagged, risk_level: n.risk_level,
        })),
        edges: graph.edges.map(e => ({
          source: e.source, target: e.target,
          edge_type: e.edge_type, label: e.label, amount: e.amount,
        })),
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const name = `cybertrail_${graph.module}_${(graph.seed_identifier || 'export').slice(0,12).replace(/[^a-z0-9]/gi,'_')}.json`
      a.href = url; a.download = name
      a.click(); URL.revokeObjectURL(url)
      toast.success(`Exported as ${name}`)
    } catch {
      toast.error('Export failed')
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 border-b border-ct-border bg-ct-surface px-4 pt-3 pb-3">
        {/* Module tabs */}
        <div className="flex gap-1 mb-3">
          {MODULES.map(m => (
            <button key={m.id} onClick={() => handleModuleSwitch(m.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all',
                activeModule === m.id
                  ? `bg-ct-border ${m.color} border border-ct-border2`
                  : 'text-ct-muted hover:text-ct-text hover:bg-white/5'
              )}>
              <m.icon size={13} />{m.label}
            </button>
          ))}
        </div>

        {/* Search row */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 flex items-center gap-2 bg-ct-bg border border-ct-border rounded-lg px-3 h-10 focus-within:border-ct-blue/50 transition-colors">
            <Search size={14} className="text-ct-muted flex-shrink-0" />
            <input
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runTrace()}
              placeholder={activeConfig?.placeholder}
              autoComplete="off"
              className="flex-1 bg-transparent text-sm text-ct-text font-mono placeholder-ct-muted outline-none"
            />
            {identifier && !isLoading && (
              <button onClick={() => setIdentifier('')} className="text-ct-muted hover:text-ct-text flex-shrink-0">
                <X size={13} />
              </button>
            )}
            {isLoading && <Loader2 size={14} className="text-ct-muted animate-spin flex-shrink-0" />}
          </div>

          <div className="flex items-center gap-1.5 bg-ct-bg border border-ct-border rounded-lg px-3 h-10">
            <span className="text-[10px] text-ct-muted font-mono">depth</span>
            <select value={depth} onChange={e => setDepth(Number(e.target.value))}
              className="bg-transparent text-sm text-ct-text font-mono outline-none cursor-pointer">
              {DEPTHS.map(d => <option key={d} value={d} style={{background:'#0f1318'}}>{d}</option>)}
            </select>
          </div>

          <button onClick={runTrace} disabled={isLoading || !identifier.trim()}
            className={clsx(
              'h-10 px-6 rounded-lg text-sm font-mono font-semibold transition-all',
              'bg-ct-blue text-white hover:bg-blue-500 active:scale-95',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}>
            {isLoading ? 'Tracing…' : 'Trace →'}
          </button>

          {/* Clear button - only shown when there's something to clear */}
          {(identifier || graph) && (
            <button
              onClick={handleClear}
              title="Clear search and graph"
              className="h-10 px-4 rounded-lg text-sm font-mono transition-all border border-ct-border text-ct-muted hover:text-ct-red hover:border-ct-red/40 hover:bg-ct-red/5 active:scale-95"
            >
              Clear
            </button>
          )}
        </div>

        {/* Example hint */}
        {!identifier && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-ct-muted font-mono">Try →</span>
            <button onClick={() => setIdentifier(EXAMPLES[activeModule])}
              className="text-[10px] text-ct-cyan font-mono hover:underline">
              {EXAMPLES[activeModule]}
            </button>
          </div>
        )}
      </div>

      {/* ── Graph area ── */}
      <div className="flex-1 relative" style={{minHeight: 0, overflow: 'hidden'}}>

        {/* Empty state */}
        {!graph && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center scan-grid">
            <div className="text-center animate-fade-in">
              <div className="w-20 h-20 mx-auto mb-5 opacity-20">
                <svg viewBox="0 0 80 80" fill="none">
                  <circle cx="40" cy="40" r="30" stroke="#06b6d4" strokeWidth="1" strokeDasharray="5 3"/>
                  <circle cx="40" cy="40" r="18" stroke="#3b82f6" strokeWidth="1"/>
                  <circle cx="40" cy="40" r="4" fill="#06b6d4"/>
                  <circle cx="40" cy="10" r="4" fill="#3b82f6"/><circle cx="40" cy="70" r="4" fill="#3b82f6"/>
                  <circle cx="10" cy="40" r="4" fill="#3b82f6"/><circle cx="70" cy="40" r="4" fill="#3b82f6"/>
                  <line x1="40" y1="14" x2="40" y2="22" stroke="#3b82f6" strokeWidth="1"/>
                  <line x1="40" y1="58" x2="40" y2="66" stroke="#3b82f6" strokeWidth="1"/>
                  <line x1="14" y1="40" x2="22" y2="40" stroke="#3b82f6" strokeWidth="1"/>
                  <line x1="58" y1="40" x2="66" y2="40" stroke="#3b82f6" strokeWidth="1"/>
                </svg>
              </div>
              <p className="text-ct-text text-sm font-mono mb-1">
                Enter an identifier and click <span className="text-ct-blue font-semibold">Trace →</span>
              </p>
              <p className="text-ct-muted text-xs font-mono mb-4">{activeConfig?.placeholder}</p>
              <button onClick={() => setIdentifier(EXAMPLES[activeModule])}
                className="px-4 py-2 border border-ct-cyan/30 text-ct-cyan text-xs font-mono rounded-lg hover:bg-ct-cyan/5 transition-colors">
                Use example: {EXAMPLES[activeModule]}
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-ct-bg/70 z-10">
            <div className="flex flex-col items-center gap-4 animate-fade-in">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 border-2 border-ct-cyan/20 rounded-full"/>
                <div className="absolute inset-0 border-2 border-transparent border-t-ct-cyan rounded-full animate-spin"/>
                <div className="absolute inset-2 border-2 border-transparent border-t-ct-blue rounded-full animate-spin" style={{animationDuration:'1.5s',animationDirection:'reverse'}}/>
              </div>
              <div className="text-center">
                <p className="text-ct-cyan text-xs font-mono tracking-widest uppercase">Tracing…</p>
                <p className="text-ct-muted text-[10px] font-mono mt-1">{activeConfig?.label} · depth {depth}</p>
              </div>
            </div>
          </div>
        )}

        {/* Graph canvas - ref gives direct access to fit/reset/reLayout */}
        {graph && !isLoading && (
          <GraphCanvas
            key={graph.session_id}
            ref={graphRef}
            graph={graph}
            onNodeClick={setSelectedNode}
          />
        )}

        {selectedNode && (
          <NodePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}

        {graph && !isLoading && <GraphLegend />}

        {/* Stats bar */}
        {graph && !isLoading && (
          <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-ct-surface/95 border border-ct-border rounded-lg px-4 py-2 text-xs font-mono animate-fade-in">
            <span className="text-ct-muted"><span className="text-ct-text font-semibold">{graph.total_nodes}</span> nodes</span>
            <span className="w-px h-3 bg-ct-border"/>
            <span className="text-ct-muted"><span className="text-ct-text font-semibold">{graph.total_edges}</span> edges</span>
            <span className="w-px h-3 bg-ct-border"/>
            <span className="text-ct-muted">
              <span className={graph.flagged_count > 0 ? 'text-ct-red font-semibold' : 'text-ct-text font-semibold'}>
                {graph.flagged_count}
              </span> flagged
            </span>
            {graph.total_value_inr > 0 && (
              <><span className="w-px h-3 bg-ct-border"/>
              <span className="text-ct-amber font-semibold">₹{(graph.total_value_inr/10000000).toFixed(2)} Cr</span></>
            )}
            <span className="w-px h-3 bg-ct-border"/>
            <span className="text-ct-cyan capitalize">{graph.module}</span>
          </div>
        )}

        {/* Toolbar - now calls graphRef directly */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          <button onClick={handleFit} title="Fit all nodes to screen"
            className="w-8 h-8 bg-ct-surface border border-ct-border rounded-md flex items-center justify-center text-ct-muted hover:text-ct-cyan hover:border-ct-cyan/40 transition-all">
            <Maximize2 size={13} />
          </button>
          <button onClick={handleReset} title="Reset selection / highlighting"
            className="w-8 h-8 bg-ct-surface border border-ct-border rounded-md flex items-center justify-center text-ct-muted hover:text-ct-text hover:border-ct-border2 transition-all">
            <RotateCcw size={13} />
          </button>
          <button onClick={handleReLayout} title="Re-run layout algorithm"
            className="w-8 h-8 bg-ct-surface border border-ct-border rounded-md flex items-center justify-center text-ct-muted hover:text-ct-blue hover:border-ct-blue/40 transition-all">
            <RefreshCw size={13} />
          </button>
          <button onClick={toggleLabels} title={showLabels ? 'Hide labels' : 'Show labels'}
            className={clsx('w-8 h-8 bg-ct-surface border rounded-md flex items-center justify-center transition-all',
              showLabels ? 'border-ct-blue/50 text-ct-blue' : 'border-ct-border text-ct-muted hover:text-ct-text')}>
            {showLabels ? <Eye size={13}/> : <EyeOff size={13}/>}
          </button>
          <button onClick={toggleFlaggedOnly} title={showFlaggedOnly ? 'Show all' : 'Show flagged only'}
            className={clsx('w-8 h-8 bg-ct-surface border rounded-md flex items-center justify-center transition-all',
              showFlaggedOnly ? 'border-ct-red/50 text-ct-red' : 'border-ct-border text-ct-muted hover:text-ct-text')}>
            <AlertTriangle size={13} />
          </button>

          <div className="relative">
            <button onClick={() => setShowLayoutMenu(v => !v)} title="Change layout"
              className="w-8 h-8 bg-ct-surface border border-ct-border rounded-md flex items-center justify-center text-ct-muted hover:text-ct-text transition-all">
              <ChevronDown size={13} />
            </button>
            {showLayoutMenu && (
              <div className="absolute left-10 top-0 bg-ct-surface border border-ct-border rounded-lg shadow-2xl py-1 z-30 min-w-max animate-slide-up">
                <div className="px-3 py-1 text-[9px] text-ct-muted font-mono uppercase tracking-widest border-b border-ct-border mb-1">Layout</div>
                {LAYOUTS.map(l => (
                  <button key={l} onClick={() => { setGraphLayout(l); setShowLayoutMenu(false); setTimeout(() => graphRef.current?.reLayout(), 50) }}
                    className={clsx('w-full text-left px-3 py-1.5 text-xs font-mono transition-colors',
                      graphLayout === l ? 'text-ct-cyan bg-ct-cyan/10' : 'text-ct-muted hover:text-ct-text hover:bg-white/5')}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {graph && (
            <div className="flex flex-col gap-1">
              <button onClick={() => handleExport('png')} title="Export as PNG image"
                className="w-8 h-8 bg-ct-surface border border-ct-border rounded-md flex items-center justify-center text-ct-muted hover:text-ct-green hover:border-ct-green/50 transition-all text-[9px] font-mono font-bold">
                PNG
              </button>
              <button onClick={() => handleExport('json')} title="Export as JSON"
                className="w-8 h-8 bg-ct-surface border border-ct-border rounded-md flex items-center justify-center text-ct-muted hover:text-ct-amber hover:border-ct-amber/50 transition-all text-[9px] font-mono font-bold">
                JSON
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

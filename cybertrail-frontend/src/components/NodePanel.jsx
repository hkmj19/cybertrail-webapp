// src/components/NodePanel.jsx - Enhanced node/edge detail panel
import { X, AlertTriangle, Copy, Flag, Loader2, ArrowRight, ArrowLeft, ArrowLeftRight, Network } from 'lucide-react'
import { checkBlacklist, addToBlacklist } from '../services/api'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const TYPE_LABELS = {
  wallet_btc:   'Bitcoin Wallet',
  wallet_eth:   'Ethereum Wallet',
  wallet_tron:  'TRON / USDT Wallet',
  upi_account:  'UPI Account',
  bank_account: 'Bank Account',
  phone:        'Phone Number',
  company:      'Company',
  person:       'Person / Director',
  exchange:     'Crypto Exchange',
  unknown:      'Unknown Entity',
}

const TYPE_ICONS = {
  wallet_btc:   '₿',  wallet_eth:  'Ξ',   wallet_tron: '₮',
  upi_account:  '⊕',  bank_account:'🏦',  phone:       '📱',
  company:      '🏢', person:      '👤',  exchange:    '🔄',
  unknown:      '●',
}

const RISK_COLORS = {
  high:    'text-ct-red    bg-ct-red/10    border-ct-red/30',
  medium:  'text-ct-amber  bg-ct-amber/10  border-ct-amber/30',
  low:     'text-ct-cyan   bg-ct-cyan/10   border-ct-cyan/30',
  clean:   'text-ct-green  bg-ct-green/10  border-ct-green/30',
  unknown: 'text-ct-muted  bg-white/5      border-white/10',
}

const ETYPE_LABELS = {
  crypto_transaction: 'Crypto Transaction',
  upi_transaction:    'UPI Transfer',
  bank_transaction:   'Bank Transfer',
  registered:         'Registered With',
  linked:             'Linked Account',
  linked_bank:        'Linked Bank',
  owns:               'Ownership',
  director_of:        'Director Of',
  shared_phone:       'Shared Phone',
}

const HIDDEN_FIELDS = new Set([
  'id','label','type','flagged','risk','color','layers',
  'nodeBg','nodeBorder','nodeText','nodeW','nodeH',
  'risk_level','node_type','connections','neighbours','isEdge',
])

function detectType(id, declaredType) {
  const s = String(id || '')
  if (s.includes('@'))                                                          return 'upi_account'
  if (/^[0-9]{10}$/.test(s))                                                   return 'phone'
  if (/^[0-9]{9,18}[A-Z]{2,5}$/.test(s))                                      return 'bank_account'
  if (/^T[A-Z0-9]{33}$/.test(s))                                               return 'wallet_tron'
  if (/^0x[a-fA-F0-9]{40}$/.test(s))                                           return 'wallet_eth'
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s) || s.startsWith('bc1'))    return 'wallet_btc'
  if (declaredType && declaredType !== 'undefined' && TYPE_LABELS[declaredType]) return declaredType
  return 'unknown'
}

// ── Edge Panel ────────────────────────────────────────────
function EdgePanel({ node: edge, onClose }) {
  const copy = (text) => navigator.clipboard.writeText(text).then(() => toast.success('Copied!'))

  return (
    <div className="absolute top-3 right-3 w-80 animate-slide-up z-20">
      <div className="bg-ct-surface border border-ct-border rounded-xl overflow-hidden shadow-2xl">
        <div className="flex items-start justify-between p-4 border-b border-ct-border">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-ct-muted font-mono uppercase tracking-widest mb-1.5">
              ⟶ {ETYPE_LABELS[edge.etype] || edge.etype || 'Connection'}
            </div>
            {edge.amount && (
              <div className="text-lg font-bold font-mono text-ct-amber mb-1">{edge.amount}</div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-ct-muted hover:text-ct-text rounded">
            <X size={12}/>
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-[10px] text-ct-muted font-mono uppercase tracking-widest mb-1.5">From</p>
            <div className="flex items-center gap-2 bg-ct-bg border border-ct-border rounded-lg px-3 py-2">
              <ArrowRight size={10} className="text-ct-muted flex-shrink-0"/>
              <span className="text-xs font-mono text-ct-text break-all">{edge.source}</span>
              <button onClick={() => copy(edge.source)} className="ml-auto text-ct-muted hover:text-ct-text flex-shrink-0">
                <Copy size={10}/>
              </button>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-ct-muted font-mono uppercase tracking-widest mb-1.5">To</p>
            <div className="flex items-center gap-2 bg-ct-bg border border-ct-border rounded-lg px-3 py-2">
              <ArrowRight size={10} className="text-ct-red flex-shrink-0"/>
              <span className="text-xs font-mono text-ct-text break-all">{edge.target}</span>
              <button onClick={() => copy(edge.target)} className="ml-auto text-ct-muted hover:text-ct-text flex-shrink-0">
                <Copy size={10}/>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Node Panel ────────────────────────────────────────────
export default function NodePanel({ node, onClose }) {
  const [blacklistHits, setBlacklistHits] = useState([])
  const [flagging, setFlagging]           = useState(false)
  const [flagged, setFlagged]             = useState(false)
  const [activeTab, setActiveTab]         = useState('info')

  useEffect(() => {
    if (!node?.id) return
    setFlagged(false)
    setBlacklistHits([])
    setActiveTab('info')
    checkBlacklist(node.id)
      .then(r => setBlacklistHits(r.data.hits || []))
      .catch(() => {})
  }, [node?.id])

  if (!node) return null

  // Route to edge panel
  if (node.isEdge) return <EdgePanel node={node} onClose={onClose}/>

  const fullId       = node.id || ''
  const rawType      = node.type || node.node_type || 'unknown'
  const nodeType     = detectType(fullId, rawType)
  const typeLabel    = TYPE_LABELS[nodeType] || nodeType.replace(/_/g, ' ')
  const typeIcon     = TYPE_ICONS[nodeType]  || '●'
  const riskLevel    = node.risk || node.risk_level || 'unknown'
  const isFlagged    = node.flagged || flagged
  const connections  = node.connections  || []
  const neighbours   = node.neighbours   || []
  const incoming     = connections.filter(c => c.direction === 'incoming')
  const outgoing     = connections.filter(c => c.direction === 'outgoing')

  const copy = (text) => navigator.clipboard.writeText(text).then(() => toast.success('Copied!'))

  const flag = async () => {
    setFlagging(true)
    try {
      await addToBlacklist(fullId, 'Flagged by investigator from graph', 'high')
      toast.success(`${fullId} added to blacklist`)
      setFlagged(true)
    } catch {} finally { setFlagging(false) }
  }

  const details = Object.entries(node)
    .filter(([k, v]) =>
      !HIDDEN_FIELDS.has(k) &&
      v !== null && v !== undefined && v !== '' &&
      typeof v !== 'object' &&
      !String(k).startsWith('node')
    )

  const tabs = [
    { id:'info',    label:'Info' },
    { id:'flow',    label:`Flow (${connections.length})` },
    { id:'network', label:`Network (${neighbours.length})` },
  ]

  return (
    <div className="absolute top-3 right-3 w-80 animate-slide-up z-20 max-h-[90vh] flex flex-col">
      <div className="bg-ct-surface border border-ct-border rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className={clsx('p-4 border-b border-ct-border flex-shrink-0', isFlagged ? 'bg-ct-red/5' : '')}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                {isFlagged && <AlertTriangle size={11} className="text-ct-red flex-shrink-0"/>}
                <span className="text-[10px] text-ct-muted font-mono uppercase tracking-widest">
                  {typeIcon} {typeLabel}
                </span>
              </div>
              <div className="text-sm font-bold text-ct-text font-mono break-all leading-snug" title={fullId}>
                {fullId}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => copy(fullId)} title="Copy ID"
                className="p-1.5 text-ct-muted hover:text-ct-text rounded transition-colors">
                <Copy size={12}/>
              </button>
              <button onClick={onClose} className="p-1.5 text-ct-muted hover:text-ct-text rounded transition-colors">
                <X size={12}/>
              </button>
            </div>
          </div>

          {/* Quick stats row */}
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            <span className={clsx('text-[10px] font-mono px-2 py-0.5 rounded border uppercase', RISK_COLORS[riskLevel] || RISK_COLORS.unknown)}>
              {riskLevel} risk
            </span>
            {isFlagged && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-ct-red/30 text-ct-red bg-ct-red/10">
                ● Flagged
              </span>
            )}
            {connections.length > 0 && (
              <span className="text-[10px] font-mono text-ct-muted">
                {incoming.length}↓ {outgoing.length}↑ connections
              </span>
            )}
          </div>
        </div>

        {/* Blacklist hits */}
        {blacklistHits.length > 0 && (
          <div className="px-4 py-2.5 border-b border-ct-border bg-ct-red/5 flex-shrink-0">
            <p className="text-[10px] text-ct-red uppercase tracking-widest mb-1 font-mono font-semibold">⚠ Blacklist Match</p>
            {blacklistHits.map((hit, i) => (
              <div key={i} className="text-[11px] font-mono text-ct-red/80">{hit.source} - {hit.reason}</div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-ct-border flex-shrink-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={clsx(
                'flex-1 py-2 text-[10px] font-mono transition-all',
                activeTab === t.id ? 'border-b-2 border-ct-blue text-ct-blue' : 'text-ct-muted hover:text-ct-text'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content - scrollable */}
        <div className="overflow-y-auto flex-1 min-h-0" style={{maxHeight:'420px'}}>

          {/* ── INFO TAB ── */}
          {activeTab === 'info' && (
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-2">Entity Details</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-ct-muted font-mono">Type</span>
                    <span className="text-[11px] text-ct-text font-mono">{typeIcon} {typeLabel}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-ct-muted font-mono">Risk Level</span>
                    <span className={clsx('text-[11px] font-mono font-semibold',
                      riskLevel === 'high' ? 'text-ct-red' : riskLevel === 'medium' ? 'text-ct-amber' : 'text-ct-muted')}>
                      {riskLevel}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-ct-muted font-mono">Flagged</span>
                    <span className={clsx('text-[11px] font-mono', isFlagged ? 'text-ct-red' : 'text-ct-green')}>
                      {isFlagged ? '● Yes' : '○ No'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-ct-muted font-mono">Connections</span>
                    <span className="text-[11px] text-ct-text font-mono">{connections.length} ({incoming.length} in, {outgoing.length} out)</span>
                  </div>
                  {details.map(([k, v]) => (
                    <div key={k} className="flex justify-between items-start gap-2">
                      <span className="text-[10px] text-ct-muted font-mono capitalize flex-shrink-0">{k.replace(/_/g, ' ')}</span>
                      <span className="text-[11px] text-ct-text font-mono text-right break-all">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── FLOW TAB ── */}
          {activeTab === 'flow' && (
            <div className="p-4 space-y-3">
              {connections.length === 0 ? (
                <p className="text-xs text-ct-muted font-mono text-center py-4">No connections</p>
              ) : (
                <>
                  {incoming.length > 0 && (
                    <div>
                      <p className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-2 flex items-center gap-1">
                        <ArrowLeft size={10} className="text-ct-green"/> Incoming ({incoming.length})
                      </p>
                      <div className="space-y-1.5">
                        {incoming.map((c, i) => (
                          <div key={i} className="bg-ct-bg border border-ct-green/20 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <ArrowLeft size={9} className="text-ct-green flex-shrink-0"/>
                              <span className="text-[11px] font-mono text-ct-text flex-1 truncate" title={c.source}>{c.source}</span>
                              <button onClick={() => navigator.clipboard.writeText(c.source)} className="text-ct-muted hover:text-ct-text flex-shrink-0">
                                <Copy size={9}/>
                              </button>
                            </div>
                            {c.label && (
                              <div className="text-[10px] font-mono text-ct-amber mt-1 ml-4">{c.label}</div>
                            )}
                            {c.etype && (
                              <div className="text-[10px] font-mono text-ct-muted mt-0.5 ml-4">
                                {ETYPE_LABELS[c.etype] || c.etype}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {outgoing.length > 0 && (
                    <div>
                      <p className="text-[10px] text-ct-muted uppercase font-mono tracking-widest mb-2 flex items-center gap-1">
                        <ArrowRight size={10} className="text-ct-red"/> Outgoing ({outgoing.length})
                      </p>
                      <div className="space-y-1.5">
                        {outgoing.map((c, i) => (
                          <div key={i} className="bg-ct-bg border border-ct-red/20 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <ArrowRight size={9} className="text-ct-red flex-shrink-0"/>
                              <span className="text-[11px] font-mono text-ct-text flex-1 truncate" title={c.target}>{c.target}</span>
                              <button onClick={() => navigator.clipboard.writeText(c.target)} className="text-ct-muted hover:text-ct-text flex-shrink-0">
                                <Copy size={9}/>
                              </button>
                            </div>
                            {c.label && (
                              <div className="text-[10px] font-mono text-ct-amber mt-1 ml-4">{c.label}</div>
                            )}
                            {c.etype && (
                              <div className="text-[10px] font-mono text-ct-muted mt-0.5 ml-4">
                                {ETYPE_LABELS[c.etype] || c.etype}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── NETWORK TAB ── */}
          {activeTab === 'network' && (
            <div className="p-4">
              {neighbours.length === 0 ? (
                <p className="text-xs text-ct-muted font-mono text-center py-4">No neighbours</p>
              ) : (
                <div className="space-y-1.5">
                  {neighbours.map((n, i) => {
                    const nType = detectType(n.id, n.type)
                    return (
                      <div key={i} className={clsx(
                        'flex items-center gap-2 rounded-lg px-3 py-2 border',
                        n.flagged ? 'bg-ct-red/5 border-ct-red/20' : 'bg-ct-bg border-ct-border'
                      )}>
                        <span className="text-[10px] flex-shrink-0">{TYPE_ICONS[nType] || '●'}</span>
                        <span className="text-[11px] font-mono text-ct-text flex-1 truncate" title={n.id}>{n.id}</span>
                        {n.flagged && <span className="text-[9px] font-mono text-ct-red flex-shrink-0">●FLAG</span>}
                        <button onClick={() => navigator.clipboard.writeText(n.id)} className="text-ct-muted hover:text-ct-text flex-shrink-0">
                          <Copy size={9}/>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-3 flex gap-2 border-t border-ct-border flex-shrink-0">
          <button onClick={flag} disabled={flagging || isFlagged}
            className={clsx(
              'flex-1 h-8 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 border transition-all',
              isFlagged
                ? 'border-ct-red/20 text-ct-red/50 cursor-not-allowed'
                : 'border-ct-red/30 text-ct-red hover:bg-ct-red/5 active:scale-95'
            )}>
            {flagging ? <Loader2 size={11} className="animate-spin"/> : <Flag size={11}/>}
            {isFlagged ? 'Flagged' : 'Flag Entity'}
          </button>
          <button onClick={() => copy(fullId)}
            className="flex-1 h-8 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 border border-ct-border text-ct-muted hover:text-ct-text hover:bg-white/5 active:scale-95 transition-all">
            <Copy size={11}/> Copy ID
          </button>
        </div>

      </div>
    </div>
  )
}
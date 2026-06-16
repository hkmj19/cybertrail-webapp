/**
 * CaseReport.jsx — Court-ready A4 PDF Report
 * Data source: getCase() → case metadata + notes + traces
 * Print via: window.print() with @media print CSS
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCase } from '../services/api'
import useStore from '../store/useStore'

// ── Helpers ───────────────────────────────────────────────
const STATUS_LABEL    = { open:'Open', active:'Active — Under Investigation', pending:'Pending', closed:'Closed', archived:'Archived' }
const STATUS_COLOR    = { open:'#d97706', active:'#2563eb', pending:'#7c3aed', closed:'#16a34a', archived:'#6b7280' }
const PRIORITY_LABEL  = { critical:'CRITICAL', high:'HIGH', medium:'MEDIUM', low:'LOW' }
const PRIORITY_COLOR  = { critical:'#dc2626', high:'#d97706', medium:'#2563eb', low:'#6b7280' }
const NOTE_TYPE_LABEL = { observation:'Observation', action:'Action Taken', evidence:'Evidence', update:'Status Update' }
const MODULE_LABEL    = { crypto:'Cryptocurrency', upi:'UPI / Bank Fraud', shell:'Shell Company', social:'Communication Network', multi:'Multi-Layer' }

function inr(n) {
  if (!n && n !== 0) return '—'
  return new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n)
}
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })
}
function fmtDT(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })
}

// ── Sub-components ────────────────────────────────────────
function SectionTitle({ n, title }) {
  return (
    <div style={{ background:'#1e3a5f', color:'white', padding:'5px 12px', marginBottom:8, marginTop:16,
      fontSize:11, fontWeight:'bold', textTransform:'uppercase', letterSpacing:'0.8px',
      display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ background:'white', color:'#1e3a5f', borderRadius:3, width:18, height:18,
        display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:'bold', flexShrink:0 }}>{n}</span>
      {title}
    </div>
  )
}

function MetaTable({ rows }) {
  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10.5, marginBottom:0 }}>
      <tbody>
        {rows.map(([label, value, span], i) => (
          <tr key={i}>
            <td style={{ background:'#eef2f7', padding:'5px 10px', fontWeight:'bold', fontSize:9.5,
              textTransform:'uppercase', color:'#1e3a5f', border:'1px solid #c7d2e0', width:span?'auto':160,
              whiteSpace:'nowrap' }}>{label}</td>
            <td style={{ padding:'5px 10px', color:'#1e293b', border:'1px solid #c7d2e0',
              fontSize:10.5, ...(span ? { colSpan:3 } : {}) }}
              colSpan={span ? 3 : 1}>{value || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Main Component ────────────────────────────────────────
export default function CaseReport() {
  const { caseId } = useParams()
  const navigate   = useNavigate()
  const { user }   = useStore()
  const [cas, setCas]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCase(caseId)
      .then(r => { setCas(r.data); setLoading(false) })
      .catch(() => navigate('/cases'))
  }, [caseId])

  // Manual print only — user clicks button

  if (loading || !cas) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      height:'100vh', fontFamily:'Georgia, serif', color:'#64748b', gap:12 }}>
      <div style={{ fontSize:32 }}>⚖</div>
      <div style={{ fontSize:14 }}>Preparing court document…</div>
    </div>
  )

  // ── Extract data from traces ─────────────────────────
  const tracesSummary = (cas.traces || []).map(tr => {
    let gd = {}
    try { gd = typeof tr.graph_data === 'string' ? JSON.parse(tr.graph_data) : (tr.graph_data || {}) } catch {}
    return {
      identifier:  tr.identifier,
      module:      tr.module,
      depth:       tr.depth,
      total_nodes: tr.node_count  || gd.total_nodes  || 0,
      total_edges: tr.edge_count  || gd.total_edges  || 0,
      flagged:     tr.flagged     || gd.flagged_count || 0,
      traced_by:   tr.traced_by,
      date:        tr.created_at,
    }
  })

  // Extract unique flagged identifiers from all traces
  const flaggedEntities = []
  ;(cas.traces || []).forEach(tr => {
    let gd = {}
    try { gd = typeof tr.graph_data === 'string' ? JSON.parse(tr.graph_data) : (tr.graph_data || {}) } catch {}
    ;(gd.nodes || []).forEach(n => {
      const d = n.data || n
      if (d.flagged) {
        const id = d.upi_id || d.address || d.number || d.account_number || d.id || ''
        if (id && !flaggedEntities.find(f => f.id === id)) {
          flaggedEntities.push({
            id,
            type:   d.nodeType || d.label || (d.upi_id ? 'UPI Account' : d.address ? 'Crypto Wallet' : d.number ? 'Phone' : d.account_number ? 'Bank Account' : 'Entity'),
            reason: d.flag_reason || 'Confirmed fraud entity',
            risk:   d.risk_level || 'high',
          })
        }
      }
    })
  })

  const generatedAt = new Date().toLocaleString('en-IN', {
    day:'2-digit', month:'long', year:'numeric',
    hour:'2-digit', minute:'2-digit', hour12:true,
    timeZone:'Asia/Kolkata'
  })

  const totalFlagged  = tracesSummary.reduce((s, t) => s + (t.flagged || 0), 0)
  const totalNodes    = tracesSummary.reduce((s, t) => s + (t.total_nodes || 0), 0)
  const notesByType   = (cas.notes || []).reduce((a, n) => { a[n.note_type] = (a[n.note_type]||0)+1; return a }, {})

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html { background:#f1f5f9; }
        body { font-family:'Times New Roman',Times,serif; color:#111; background:#f1f5f9; overflow-y:auto !important; min-height:100vh; }

        /* ── Screen controls ── */
        .controls {
          position:fixed; top:16px; right:16px; z-index:9999;
          display:flex; gap:8px; align-items:center;
        }
        .btn { padding:8px 16px; border-radius:6px; font-size:12px; cursor:pointer;
          font-family:Arial,sans-serif; border:none; font-weight:600; }
        .btn-print { background:#1e3a5f; color:white; }
        .btn-print:hover { background:#2d5a8e; }
        .btn-back  { background:white; color:#334155; border:1.5px solid #cbd5e1; }
        .btn-back:hover { background:#f8fafc; }

        /* ── Page layout ── */
        .page-wrap {
          width:210mm; margin:24px auto 48px; background:white;
          box-shadow:0 4px 32px rgba(0,0,0,0.15);
          padding:18mm 18mm 18mm 22mm;
          position:relative;
        }

        /* ── Typography ── */
        p { line-height:1.6; }

        /* ── Tables ── */
        .data-table { width:100%; border-collapse:collapse; font-size:10px; margin-bottom:0; }
        .data-table th {
          background:#1e3a5f; color:white; padding:5px 8px;
          text-align:left; font-size:9px; text-transform:uppercase;
          letter-spacing:0.5px; border:1px solid #1e3a5f;
        }
        .data-table td {
          padding:5px 8px; border:1px solid #c7d2e0;
          vertical-align:top; font-size:10px;
        }
        .data-table tr:nth-child(even) td { background:#f8fafc; }

        /* ── Notes ── */
        .note-card {
          border-left:3px solid #1e3a5f; padding:7px 10px;
          margin-bottom:8px; background:#f8fafc;
          border-top:1px solid #e2e8f0; border-right:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0;
        }
        .note-meta { font-size:9px; color:#64748b; margin-bottom:4px; font-family:Arial,sans-serif; }
        .note-body { font-size:10.5px; color:#1e293b; line-height:1.6; }

        /* ── Badges ── */
        .badge {
          display:inline-block; padding:1px 6px; border-radius:2px;
          font-size:8.5px; font-weight:bold; text-transform:uppercase;
          letter-spacing:0.4px; font-family:Arial,sans-serif;
        }

        /* ── Signature section ── */
        .sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:48px; margin-top:28px; }
        .sig-box { border-top:2px solid #1e3a5f; padding-top:6px; }
        .sig-line { height:28px; }
        .sig-label { font-size:9px; font-weight:bold; text-transform:uppercase; color:#1e3a5f; font-family:Arial,sans-serif; }
        .sig-name  { font-size:11px; color:#1e293b; margin-top:2px; }
        .sig-dept  { font-size:9px; color:#64748b; font-family:Arial,sans-serif; }

        /* ── Summary boxes ── */
        .summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px; }
        .summary-box { border:1.5px solid #c7d2e0; padding:8px 10px; text-align:center; }
        .summary-val { font-size:22px; font-weight:bold; color:#1e3a5f; font-family:Arial,sans-serif; }
        .summary-lbl { font-size:9px; color:#64748b; text-transform:uppercase; font-family:Arial,sans-serif; margin-top:2px; }

        /* ── Footer ── */
        .doc-footer {
          border-top:1px solid #c7d2e0; padding-top:8px; margin-top:20px;
          display:flex; justify-content:space-between; font-size:8.5px;
          color:#94a3b8; font-family:Arial,sans-serif;
        }

        /* ── Print overrides ── */
        @media print {
          html, body { background:white; }
          .controls { display:none !important; }
          .page-wrap {
            width:100%; margin:0; padding:14mm 14mm 14mm 18mm;
            box-shadow:none; min-height:auto;
          }
          .note-card { break-inside:avoid; }
          .data-table tr { break-inside:avoid; }
          .sig-grid { break-inside:avoid; }
          .summary-grid { break-inside:avoid; }
          section { break-inside:avoid; }
          @page { size:A4; margin:0; }
        }
      `}</style>

      {/* ── Screen controls ── */}
      <div className="controls">
        <button className="btn btn-back" onClick={() => navigate(`/cases/${caseId}`)}>
          ← Back to Case
        </button>
        <button className="btn btn-print" onClick={() => window.print()}>
          🖨 Print / Save as PDF
        </button>
      </div>

      <div className="page-wrap">

        {/* ══ HEADER ════════════════════════════════════════ */}
        <div style={{ borderBottom:'3px solid #1e3a5f', paddingBottom:14, marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>

            {/* Left: Govt identity */}
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:60, height:60, border:'3px solid #1e3a5f', borderRadius:'50%',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:26, color:'#1e3a5f', flexShrink:0 }}>⚖</div>
              <div>
                <div style={{ fontSize:14, fontWeight:'bold', color:'#1e3a5f', textTransform:'uppercase', letterSpacing:0.5 }}>
                  Government of India — Police Department
                </div>
                <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>
                  {user?.department || 'Cybercrime Investigation Division'}
                </div>
                <div style={{ fontSize:10, color:'#94a3b8', marginTop:1, fontFamily:'Arial,sans-serif' }}>
                  CyberTrail Financial Crime Intelligence Platform
                </div>
              </div>
            </div>

            {/* Right: Doc reference */}
            <div style={{ textAlign:'right', fontSize:10, color:'#475569', fontFamily:'Arial,sans-serif',
              lineHeight:1.8, flexShrink:0 }}>
              <div><strong>Case No:</strong> {cas.case_number}</div>
              <div><strong>FIR No:</strong> {cas.fir_number || 'Not Registered'}</div>
              <div><strong>Generated:</strong> {generatedAt} IST</div>
              <div style={{ color:'#dc2626', fontWeight:'bold', fontSize:9,
                border:'1px solid #dc2626', padding:'1px 6px', marginTop:2 }}>
                RESTRICTED — LEA USE ONLY
              </div>
            </div>
          </div>

          {/* Title bar */}
          <div style={{ textAlign:'center', marginTop:14 }}>
            <div style={{ fontSize:17, fontWeight:'bold', color:'#1e3a5f', textTransform:'uppercase',
              letterSpacing:1.5, marginBottom:3 }}>
              Cybercrime Investigation Report
            </div>
            <div style={{ fontSize:9.5, color:'#64748b', fontFamily:'Arial,sans-serif' }}>
              Prepared under Section 91 CrPC | Evidence recorded per Section 65B Indian Evidence Act, 1872
            </div>
          </div>
        </div>

        {/* ══ SECTION 1: CASE OVERVIEW ══════════════════════ */}
        <SectionTitle n="1" title="Case Overview" />

        {/* Summary stat boxes */}
        <div className="summary-grid">
          <div className="summary-box">
            <div className="summary-val">{cas.traces?.length || 0}</div>
            <div className="summary-lbl">Traces Run</div>
          </div>
          <div className="summary-box">
            <div className="summary-val">{cas.notes?.length || 0}</div>
            <div className="summary-lbl">Notes Recorded</div>
          </div>
          <div className="summary-box">
            <div className="summary-val" style={{ color:'#dc2626' }}>{totalFlagged}</div>
            <div className="summary-lbl">Flagged Entities</div>
          </div>
          <div className="summary-box">
            <div className="summary-val" style={{ color:'#dc2626', fontSize:16 }}>
              {cas.fraud_amount ? inr(cas.fraud_amount) : '—'}
            </div>
            <div className="summary-lbl">Fraud Amount</div>
          </div>
        </div>

        {/* Case metadata — 2 column layout */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0, border:'1.5px solid #c7d2e0' }}>
          {[
            ['Case Number',    cas.case_number],
            ['Case Title',     cas.title],
            ['FIR Number',     cas.fir_number || 'Not yet registered'],
            ['District / PS',  cas.district || '—'],
            ['Status', <span style={{ color: STATUS_COLOR[cas.status], fontWeight:'bold', fontSize:10 }}>
              ● {STATUS_LABEL[cas.status] || cas.status}
            </span>],
            ['Priority', <span style={{ color: PRIORITY_COLOR[cas.priority], fontWeight:'bold', fontSize:10 }}>
              ● {PRIORITY_LABEL[cas.priority] || cas.priority}
            </span>],
            ['Complainant / Victim', cas.complainant || '—'],
            ['Fraud Amount (INR)', <span style={{ color:'#dc2626', fontWeight:'bold' }}>{inr(cas.fraud_amount)}</span>],
            ['Investigation Officer', cas.created_by],
            ['Assigned Officer',  cas.assigned_to || cas.created_by],
            ['Date Registered',   fmtDate(cas.created_at)],
            ['Last Updated',      fmtDate(cas.updated_at)],
          ].map(([label, value], i) => (
            <div key={i} style={{ display:'contents' }}>
              <div style={{ background:'#eef2f7', padding:'5px 10px', fontSize:9.5, fontWeight:'bold',
                textTransform:'uppercase', color:'#1e3a5f', borderRight:'1px solid #c7d2e0',
                borderBottom: i < 10 ? '1px solid #c7d2e0' : 'none' }}>
                {label}
              </div>
              <div style={{ padding:'5px 10px', fontSize:10.5, color:'#1e293b',
                borderBottom: i < 10 ? '1px solid #c7d2e0' : 'none' }}>
                {value || '—'}
              </div>
            </div>
          ))}
        </div>

        {/* Description */}
        {cas.description && (
          <div style={{ border:'1px solid #c7d2e0', borderTop:'none', padding:'7px 10px',
            fontSize:10.5, color:'#334155', lineHeight:1.6 }}>
            <strong style={{ fontSize:9.5, textTransform:'uppercase', color:'#1e3a5f', fontFamily:'Arial,sans-serif' }}>
              Case Description: </strong>{cas.description}
          </div>
        )}

        {/* ══ SECTION 2: FLAGGED ENTITIES ═══════════════════ */}
        {flaggedEntities.length > 0 && <>
          <SectionTitle n="2" title={`Flagged Fraud Entities (${flaggedEntities.length} identified)`} />
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:28}}>#</th>
                <th>Identifier / Account</th>
                <th style={{width:100}}>Entity Type</th>
                <th style={{width:80}}>Risk Level</th>
                <th>Reason Flagged</th>
              </tr>
            </thead>
            <tbody>
              {flaggedEntities.map((f, i) => (
                <tr key={i}>
                  <td style={{ textAlign:'center', color:'#64748b' }}>{i+1}</td>
                  <td style={{ fontFamily:'Courier New,monospace', fontSize:9.5, wordBreak:'break-all' }}>{f.id}</td>
                  <td>{f.type}</td>
                  <td>
                    <span className="badge" style={{
                      background: f.risk==='high'||f.risk==='critical' ? '#fee2e2' : f.risk==='medium' ? '#fef3c7' : '#f1f5f9',
                      color: f.risk==='high'||f.risk==='critical' ? '#991b1b' : f.risk==='medium' ? '#92400e' : '#475569',
                      border: `1px solid ${f.risk==='high'||f.risk==='critical' ? '#fca5a5' : f.risk==='medium' ? '#fcd34d' : '#cbd5e1'}`
                    }}>{f.risk}</span>
                  </td>
                  <td style={{ fontSize:9.5, color:'#475569' }}>{f.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}

        {/* ══ SECTION 3: INVESTIGATION TRACES ══════════════ */}
        <SectionTitle n={flaggedEntities.length > 0 ? '3' : '2'} title={`Investigation Traces (${tracesSummary.length} runs)`} />

        {tracesSummary.length === 0 ? (
          <div style={{ border:'1px solid #e2e8f0', padding:'12px 10px', color:'#94a3b8',
            fontSize:10.5, fontStyle:'italic', textAlign:'center' }}>
            No traces have been saved to this case yet. Run an investigation from the Investigate module and save it to this case.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:28}}>#</th>
                <th>Seed Identifier</th>
                <th style={{width:100}}>Module</th>
                <th style={{width:45, textAlign:'center'}}>Depth</th>
                <th style={{width:50, textAlign:'center'}}>Nodes</th>
                <th style={{width:50, textAlign:'center'}}>Edges</th>
                <th style={{width:55, textAlign:'center'}}>Flagged</th>
                <th style={{width:80}}>Officer</th>
                <th style={{width:80}}>Date</th>
              </tr>
            </thead>
            <tbody>
              {tracesSummary.map((tr, i) => (
                <tr key={i}>
                  <td style={{ textAlign:'center', color:'#64748b' }}>{i+1}</td>
                  <td style={{ fontFamily:'Courier New,monospace', fontSize:9, wordBreak:'break-all' }}>{tr.identifier}</td>
                  <td>
                    <span className="badge" style={{ background:'#dbeafe', color:'#1e40af', border:'1px solid #93c5fd' }}>
                      {tr.module?.toUpperCase()}
                    </span>
                    <div style={{ fontSize:8.5, color:'#94a3b8', marginTop:2 }}>{MODULE_LABEL[tr.module] || tr.module}</div>
                  </td>
                  <td style={{ textAlign:'center' }}>{tr.depth}</td>
                  <td style={{ textAlign:'center' }}>{tr.total_nodes}</td>
                  <td style={{ textAlign:'center' }}>{tr.total_edges}</td>
                  <td style={{ textAlign:'center' }}>
                    {tr.flagged > 0
                      ? <span className="badge" style={{ background:'#fee2e2', color:'#991b1b', border:'1px solid #fca5a5' }}>
                          {tr.flagged}
                        </span>
                      : <span style={{ color:'#94a3b8' }}>0</span>}
                  </td>
                  <td style={{ fontSize:9 }}>{tr.traced_by}</td>
                  <td style={{ fontSize:9 }}>{fmtDate(tr.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ══ SECTION 4: INVESTIGATION NOTES ═══════════════ */}
        {(() => {
          const sNum = (flaggedEntities.length > 0 ? 4 : 3)
          return (
            <>
              <SectionTitle n={String(sNum)} title={`Investigation Notes (${cas.notes?.length || 0} entries)`} />
              {(cas.notes?.length || 0) === 0 ? (
                <div style={{ border:'1px solid #e2e8f0', padding:'12px 10px', color:'#94a3b8',
                  fontSize:10.5, fontStyle:'italic', textAlign:'center' }}>
                  No investigation notes recorded for this case.
                </div>
              ) : (
                <>
                  {/* Note type summary */}
                  <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                    {Object.entries(notesByType).map(([type, count]) => (
                      <span key={type} className="badge" style={{ background:'#eef2f7', color:'#1e3a5f',
                        border:'1px solid #c7d2e0', fontSize:9, padding:'2px 8px' }}>
                        {NOTE_TYPE_LABEL[type] || type}: {count}
                      </span>
                    ))}
                  </div>
                  {(cas.notes || []).map((n, i) => (
                    <div key={i} className="note-card">
                      <div className="note-meta">
                        <strong style={{ color:'#1e3a5f', textTransform:'uppercase', fontSize:9 }}>
                          [{NOTE_TYPE_LABEL[n.note_type] || n.note_type}]
                        </strong>
                        {' — '}{n.created_by}
                        {' — '}{fmtDT(n.created_at)}
                      </div>
                      <div className="note-body">{n.content}</div>
                    </div>
                  ))}
                </>
              )}
            </>
          )
        })()}

        {/* ══ SECTION 5: LEGAL DECLARATION ═════════════════ */}
        {(() => {
          const sNum = 3 + (flaggedEntities.length > 0 ? 1 : 0) + 1
          return (
            <>
              <SectionTitle n={String(sNum)} title="Legal Declaration & Certification" />
              <div style={{ border:'1px solid #c7d2e0', padding:'10px 12px', fontSize:10,
                lineHeight:1.75, color:'#334155', background:'#f8fafc' }}>
                This report has been generated using the <strong>CyberTrail Financial Crime Intelligence Platform</strong> by an authorised officer of {user?.department || 'the Cybercrime Investigation Division'}. The investigation data contained herein has been compiled from open digital sources
                including blockchain transaction ledgers, UPI payment gateway records, corporate registry filings
                (MCA21 / RoC), and law enforcement complaint databases (NCRP / I4C). <br/><br/>

                <strong>Data Accuracy Notice:</strong> Information sourced from external APIs (Etherscan,
                BlockCypher, TronGrid, MCA21) reflects publicly available records at the time of query and
                may not represent real-time or legally certified data. Investigators must independently verify
                critical findings through official channels (bank sub-poenas, Section 91 CrPC orders, RBI
                returns) before relying solely on this report as evidence. <br/><br/>

                When certified by the generating officer and the supervising officer, this document may be
                submitted as a computer-generated record under <strong>Section 65B of the Indian Evidence
                Act, 1872</strong>. Unauthorised access, disclosure, modification, or reproduction of this
                document is an offence under the <strong>Information Technology Act, 2000 (Sections 43, 66,
                72)</strong> and the <strong>Official Secrets Act, 1923</strong>. This platform is intended
                solely for use by authorised law enforcement personnel. Misuse will be prosecuted.
              </div>
            </>
          )
        })()}

        {/* ══ SIGNATURES ════════════════════════════════════ */}
        <div className="sig-grid">
          <div className="sig-box">
            <div className="sig-label">Investigating Officer</div>
            <div className="sig-line"></div>
            <div className="sig-name">{cas.assigned_to || cas.created_by}</div>
            <div className="sig-dept">{user?.department || 'Cybercrime Investigation Division'}</div>
            <div className="sig-dept" style={{ marginTop:4 }}>
              Date: _______________________  &nbsp; Seal:
            </div>
          </div>
          <div className="sig-box">
            <div className="sig-label">Reviewing / Supervising Officer</div>
            <div className="sig-line"></div>
            <div className="sig-name">___________________________________</div>
            <div className="sig-dept">SP / DSP Cybercrime — {user?.department || 'Cybercrime Investigation Division'}</div>
            <div className="sig-dept" style={{ marginTop:4 }}>
              Date: _______________________  &nbsp; Seal:
            </div>
          </div>
        </div>

        {/* ══ FOOTER ════════════════════════════════════════ */}
        <div className="doc-footer">
          <span>CyberTrail v1.0 · {user?.department || 'Cybercrime Investigation Division'}</span>
          <span>Case {cas.case_number} · {generatedAt} IST</span>
          <span>RESTRICTED — Law Enforcement Use Only</span>
        </div>

      </div>
    </>
  )
}
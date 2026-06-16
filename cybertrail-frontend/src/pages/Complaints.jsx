// // src/pages/Complaints.jsx
// import { useState, useEffect, useRef } from 'react'
// import {
//   Upload, FileText, CheckCircle, AlertCircle, Plus, X, Edit2, Trash2,
//   Loader2, Save, Download, Activity, Zap, Phone, Building2, CreditCard,
//   Bitcoin, ChevronRight, AlertTriangle, Link2, ArrowRight, Info
// } from 'lucide-react'
// import {
//   ingestCSV, ingestBankTransfers, linkAccounts,
//   ingestCallRecords, ingestCompanyData, getImportedData,
//   deleteCallRecord, deleteAllCallRecords,
//   deleteDirectorRecord, deleteAllCompanyData,
//   deleteBankTransfer, deleteAllBankTransfers,
//   updateCallRecord, updateDirectorRecord, updateBankTransfer,
//   listComplaints, getComplaintSummary,
//   createComplaint, updateComplaint, deleteComplaint, deleteAllComplaints
// } from '../services/api'
// import toast from 'react-hot-toast'
// import clsx from 'clsx'
// import useStore from '../store/useStore'

// const inp  = 'w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted/50 outline-none focus:border-ct-blue/50 transition-colors'
// const lbl  = 'block text-[10px] text-ct-muted uppercase font-mono tracking-wider mb-1'

// function Field({ label, required, children }) {
//   return (
//     <div>
//       <label className={lbl}>{label}{required && <span className="text-ct-red ml-0.5">*</span>}</label>
//       {children}
//     </div>
//   )
// }

// // ── Generic inline modal shell ────────────────────────────
// function Modal({ title, color='text-ct-blue', onClose, children }) {
//   return (
//     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
//       <div className="bg-ct-surface border border-ct-border rounded-2xl w-full max-w-md shadow-2xl animate-slide-up" onClick={e=>e.stopPropagation()}>
//         <div className="flex items-center justify-between p-4 border-b border-ct-border">
//           <span className={clsx('text-sm font-semibold font-mono flex items-center gap-2', color)}>
//             <Edit2 size={13}/>{title}
//           </span>
//           <button onClick={onClose} className="text-ct-muted hover:text-ct-text"><X size={14}/></button>
//         </div>
//         <div className="p-5">{children}</div>
//       </div>
//     </div>
//   )
// }

// // ── Edit CDR record modal ─────────────────────────────────
// function EditCdrModal({ record, onClose, onSaved }) {
//   const [form, setForm] = useState({
//     phone_from:   record.from,
//     phone_to:     record.to,
//     relationship: record.relationship || 'CALLED',
//     frequency:    record.frequency || 1,
//     date:         record.date || '',
//   })
//   const [saving, setSaving] = useState(false)
//   const set = (k,v) => setForm(f=>({...f,[k]:v}))

//   const save = async () => {
//     setSaving(true)
//     try {
//       await updateCallRecord(form)
//       toast.success('Call record updated')
//       onSaved(); onClose()
//     } catch(e) { toast.error(e?.response?.data?.detail || 'Update failed') }
//     finally { setSaving(false) }
//   }

//   return (
//     <Modal title="Edit Call Record" color="text-ct-purple" onClose={onClose}>
//       <div className="space-y-3">
//         <div className="grid grid-cols-2 gap-2 p-2 bg-ct-bg rounded-lg border border-ct-border mb-1">
//           <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">FROM</p><p className="text-xs font-mono text-ct-purple">{form.phone_from}</p></div>
//           <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">TO</p><p className="text-xs font-mono text-ct-purple">{form.phone_to}</p></div>
//         </div>
//         <Field label="Relationship">
//           <select value={form.relationship} onChange={e=>set('relationship',e.target.value)} className={inp}>
//             <option value="CALLED"     style={{background:'#0f1318'}}>CALLED</option>
//             <option value="REGISTERED" style={{background:'#0f1318'}}>REGISTERED</option>
//             <option value="ASSOCIATED" style={{background:'#0f1318'}}>ASSOCIATED</option>
//           </select>
//         </Field>
//         <Field label="Call Frequency">
//           <input type="number" value={form.frequency} onChange={e=>set('frequency',Number(e.target.value))} className={inp}/>
//         </Field>
//         <Field label="Date">
//           <input type="date" value={form.date} onChange={e=>set('date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/>
//         </Field>
//         <div className="flex gap-2 pt-1">
//           <button onClick={onClose} className="flex-1 h-9 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
//           <button onClick={save} disabled={saving}
//             className="flex-1 h-9 bg-ct-purple/10 border border-ct-purple/30 text-ct-purple rounded-lg text-sm font-mono hover:bg-ct-purple/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
//             {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
//           </button>
//         </div>
//       </div>
//     </Modal>
//   )
// }

// // ── Edit Director record modal ────────────────────────────
// function EditDirectorModal({ record, onClose, onSaved }) {
//   const [form, setForm] = useState({
//     din:                record.din,
//     cin:                record.cin,
//     director_name:      record.director_name || '',
//     company_name:       record.company_name  || '',
//     designation:        record.designation   || 'Director',
//     company_status:     record.status        || 'Active',
//     date_of_appointment: record.doa          || '',
//   })
//   const [saving, setSaving] = useState(false)
//   const set = (k,v) => setForm(f=>({...f,[k]:v}))

//   const save = async () => {
//     setSaving(true)
//     try {
//       await updateDirectorRecord(form)
//       toast.success('Director record updated')
//       onSaved(); onClose()
//     } catch(e) { toast.error(e?.response?.data?.detail || 'Update failed') }
//     finally { setSaving(false) }
//   }

//   return (
//     <Modal title="Edit Director Record" color="text-ct-amber" onClose={onClose}>
//       <div className="space-y-3">
//         <div className="grid grid-cols-2 gap-2 p-2 bg-ct-bg rounded-lg border border-ct-border mb-1">
//           <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">DIN</p><p className="text-xs font-mono text-ct-amber">{form.din}</p></div>
//           <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">CIN</p><p className="text-xs font-mono text-ct-muted">{form.cin}</p></div>
//         </div>
//         <div className="grid grid-cols-2 gap-3">
//           <Field label="Director Name">
//             <input value={form.director_name} onChange={e=>set('director_name',e.target.value)} placeholder="Ramesh Kumar" className={inp}/>
//           </Field>
//           <Field label="Company Name">
//             <input value={form.company_name} onChange={e=>set('company_name',e.target.value)} placeholder="Alpha Pvt Ltd" className={inp}/>
//           </Field>
//         </div>
//         <Field label="Designation">
//           <select value={form.designation} onChange={e=>set('designation',e.target.value)} className={inp}>
//             {['Director','Managing Director','Whole-time Director','Independent Director','Nominee Director'].map(d=>(
//               <option key={d} value={d} style={{background:'#0f1318'}}>{d}</option>
//             ))}
//           </select>
//         </Field>
//         <Field label="Company Status">
//           <select value={form.company_status} onChange={e=>set('company_status',e.target.value)} className={inp}>
//             {['Active','Struck Off','Dissolved','Under Liquidation'].map(s=>(
//               <option key={s} value={s} style={{background:'#0f1318'}}>{s}</option>
//             ))}
//           </select>
//         </Field>
//         <Field label="Date of Appointment">
//           <input type="date" value={form.date_of_appointment} onChange={e=>set('date_of_appointment',e.target.value)} className={inp}/>
//         </Field>
//         <div className="flex gap-2 pt-1">
//           <button onClick={onClose} className="flex-1 h-9 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
//           <button onClick={save} disabled={saving}
//             className="flex-1 h-9 bg-ct-amber/10 border border-ct-amber/30 text-ct-amber rounded-lg text-sm font-mono hover:bg-ct-amber/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
//             {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
//           </button>
//         </div>
//       </div>
//     </Modal>
//   )
// }

// // ── Edit Bank Transfer modal ──────────────────────────────
// function EditTransferModal({ record, onClose, onSaved }) {
//   const [form, setForm] = useState({
//     from_id:       record.from,
//     to_id:         record.to,
//     reference:     record.reference || '',
//     amount_inr:    record.amount    || '',
//     transfer_date: record.date      || '',
//     note:          record.note      || '',
//   })
//   const [saving, setSaving] = useState(false)
//   const set = (k,v) => setForm(f=>({...f,[k]:v}))

//   const save = async () => {
//     setSaving(true)
//     try {
//       await updateBankTransfer(form)
//       toast.success('Transfer record updated')
//       onSaved(); onClose()
//     } catch(e) { toast.error(e?.response?.data?.detail || 'Update failed') }
//     finally { setSaving(false) }
//   }

//   return (
//     <Modal title="Edit Bank Transfer" color="text-ct-cyan" onClose={onClose}>
//       <div className="space-y-3">
//         <div className="grid grid-cols-2 gap-2 p-2 bg-ct-bg rounded-lg border border-ct-border mb-1">
//           <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">FROM</p><p className="text-xs font-mono text-ct-cyan truncate">{form.from_id}</p></div>
//           <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">TO</p><p className="text-xs font-mono text-ct-cyan truncate">{form.to_id}</p></div>
//         </div>
//         <div className="grid grid-cols-2 gap-3">
//           <Field label="Amount (₹)">
//             <input type="number" value={form.amount_inr} onChange={e=>set('amount_inr',e.target.value)} placeholder="380000" className={inp}/>
//           </Field>
//           <Field label="Transfer Date">
//             <input type="date" value={form.transfer_date} onChange={e=>set('transfer_date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/>
//           </Field>
//         </div>
//         <Field label="Bank Reference / UTR">
//           <input value={form.reference} onChange={e=>set('reference',e.target.value)} readOnly placeholder="HDFC-UTR-826341098765" className={inp}/>
//         </Field>
//         <Field label="Investigation Note">
//           <input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="From Section 91 response…" className={inp}/>
//         </Field>
//         <div className="flex gap-2 pt-1">
//           <button onClick={onClose} className="flex-1 h-9 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
//           <button onClick={save} disabled={saving}
//             className="flex-1 h-9 bg-ct-cyan/10 border border-ct-cyan/30 text-ct-cyan rounded-lg text-sm font-mono hover:bg-ct-cyan/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
//             {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
//           </button>
//         </div>
//       </div>
//     </Modal>
//   )
// }

// // ── CSV uploader with column validation ───────────────────
// function CsvUploader({ color, requiredCols, onFile, uploading, result, sampleHref, sampleName }) {
//   const ref = useRef()
//   const [dragOver, setDragOver] = useState(false)
//   const [colError, setColError] = useState(null)

//   const validate = (file) => {
//     if (!file) return
//     if (!file.name.endsWith('.csv')) { toast.error('Only .csv files accepted'); return }
//     const reader = new FileReader()
//     reader.onload = (e) => {
//       const firstLine = (e.target.result || '').split('\n')[0] || ''
//       const cols = firstLine.split(',').map(c => c.trim().toLowerCase().replace(/\s+/g,'_').replace(/"/g,''))
//       const missing = requiredCols.filter(c => !cols.includes(c))
//       if (missing.length) {
//         setColError(`Missing columns: ${missing.join(', ')}`)
//         toast.error(`CSV missing required columns: ${missing.join(', ')}`)
//       } else {
//         setColError(null)
//         onFile(file)
//       }
//     }
//     reader.readAsText(file)
//   }

//   const onDrop = (e) => { e.preventDefault(); setDragOver(false); validate(e.dataTransfer.files[0]) }

//   return (
//     <div>
//       <label
//         onDragOver={e=>{e.preventDefault();setDragOver(true)}}
//         onDragLeave={()=>setDragOver(false)}
//         onDrop={onDrop}
//         className={clsx(
//           'flex flex-col items-center justify-center gap-2 py-7 border-2 border-dashed rounded-xl cursor-pointer transition-all select-none',
//           uploading ? 'border-ct-cyan/60 bg-ct-cyan/5' :
//           dragOver  ? 'border-ct-blue/60 bg-ct-blue/5 scale-[1.01]' :
//           colError  ? 'border-ct-red/40 bg-ct-red/5' :
//           result    ? 'border-ct-green/40 bg-ct-green/5' :
//                       'border-ct-border hover:border-ct-border2'
//         )}>
//         <input ref={ref} type="file" accept=".csv" onChange={e=>validate(e.target.files[0])} className="hidden" disabled={uploading}/>
//         {uploading ? (
//           <><div className="w-5 h-5 border-2 border-ct-cyan border-t-transparent rounded-full animate-spin"/>
//             <span className="text-sm font-mono text-ct-cyan">Importing…</span></>
//         ) : result ? (
//           <><CheckCircle size={20} className="text-ct-green"/>
//             <span className="text-sm font-mono text-ct-green font-semibold">{result}</span>
//             <span className="text-[11px] text-ct-muted font-mono">Drop another file to re-import</span></>
//         ) : colError ? (
//           <><AlertCircle size={20} className="text-ct-red"/>
//             <span className="text-sm font-mono text-ct-red text-center px-4">{colError}</span>
//             <span className="text-[11px] text-ct-muted font-mono">Fix the CSV and try again</span></>
//         ) : (
//           <><Upload size={20} className="text-ct-muted"/>
//             <span className="text-sm font-mono text-ct-muted">Drop CSV here or <span className="text-ct-blue underline">browse</span></span>
//             <span className="text-[10px] font-mono text-ct-muted/60">Only .csv files · columns validated on upload</span></>
//         )}
//       </label>
//       <div className="flex items-center gap-2 mt-2 flex-wrap">
//         <span className="text-[10px] font-mono text-ct-muted">Required cols:</span>
//         {requiredCols.map(c => (
//           <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 bg-ct-bg border border-ct-border rounded text-ct-muted">{c}</span>
//         ))}
//         <a href={sampleHref} download={sampleName} className="ml-auto flex items-center gap-1 text-[10px] font-mono text-ct-blue hover:underline">
//           <Download size={10}/> sample.csv
//         </a>
//       </div>
//     </div>
//   )
// }

// // ── Edit Complaint Modal ──────────────────────────────────
// function EditModal({ complaint, onClose, onSaved }) {
//   const [form, setForm] = useState({
//     complainant_name: complaint.complainant_name||'', complainant_phone: complaint.complainant_phone||'',
//     fraud_upi_id: complaint.fraud_upi_id||'', fraud_phone: complaint.fraud_phone||'',
//     fraud_bank_account: complaint.fraud_bank_account||'', amount_inr: complaint.amount_inr||'',
//     fir_number: complaint.fir_number||'', transaction_date: complaint.transaction_date||'',
//     district: complaint.district||'', description: complaint.description||'', status: complaint.status||'open',
//   })
//   const [loading, setLoading] = useState(false)
//   const set = (k,v) => setForm(f=>({...f,[k]:v}))
//   const save = async () => {
//     setLoading(true)
//     try { await updateComplaint(complaint.complaint_id,{...form,amount_inr:form.amount_inr?Number(form.amount_inr):undefined}); toast.success('Updated'); onSaved(); onClose() }
//     catch {} finally { setLoading(false) }
//   }
//   return (
//     <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
//       <div className="bg-ct-surface border border-ct-border rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up">
//         <div className="flex items-center justify-between p-5 border-b border-ct-border">
//           <div>
//             <h2 className="text-sm font-semibold text-ct-text font-mono flex items-center gap-2"><Edit2 size={13} className="text-ct-blue"/>Edit Complaint</h2>
//             <p className="text-[10px] text-ct-muted mt-0.5 font-mono">{complaint.complaint_id}</p>
//           </div>
//           <button onClick={onClose} className="text-ct-muted hover:text-ct-text"><X size={16}/></button>
//         </div>
//         <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
//           <p className="text-[10px] text-ct-cyan font-mono uppercase tracking-widest">Victim</p>
//           <div className="grid grid-cols-2 gap-3">
//             <Field label="Name"><input value={form.complainant_name} onChange={e=>set('complainant_name',e.target.value)} placeholder="Ram Kumar" className={inp}/></Field>
//             <Field label="Phone"><input value={form.complainant_phone} onChange={e=>set('complainant_phone',e.target.value)} placeholder="9800001111" className={inp}/></Field>
//           </div>
//           <p className="text-[10px] text-ct-red font-mono uppercase tracking-widest">Fraud Account</p>
//           <div className="grid grid-cols-2 gap-3">
//             <Field label="Fraud UPI ID"><input value={form.fraud_upi_id} onChange={e=>set('fraud_upi_id',e.target.value)} placeholder="fraud@paytm" className={inp}/></Field>
//             <Field label="Fraud Phone"><input value={form.fraud_phone} onChange={e=>set('fraud_phone',e.target.value)} placeholder="9000000001" className={inp}/></Field>
//             <Field label="Bank Account"><input value={form.fraud_bank_account} onChange={e=>set('fraud_bank_account',e.target.value)} placeholder="1234567890HDFC" className={inp}/></Field>
//             <Field label="Amount (₹)"><input type="number" value={form.amount_inr} onChange={e=>set('amount_inr',e.target.value)} placeholder="50000" className={inp}/></Field>
//           </div>
//           <div className="grid grid-cols-2 gap-3">
//             <Field label="District"><input value={form.district} onChange={e=>set('district',e.target.value)} placeholder="Mysuru" className={inp}/></Field>
//             <Field label="Status">
//               <select value={form.status} onChange={e=>set('status',e.target.value)} className={inp}>
//                 {['open','under_probe','closed'].map(s=><option key={s} value={s} style={{background:'#0f1318'}}>{s.replace('_',' ')}</option>)}
//               </select>
//             </Field>
//           </div>
//           <Field label="Description"><textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={2} placeholder="How the fraud happened…" className={inp+' resize-none'}/></Field>
//         </div>
//         <div className="flex gap-2 p-5 border-t border-ct-border">
//           <button onClick={onClose} className="flex-1 h-10 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
//           <button onClick={save} disabled={loading} className="flex-1 h-10 bg-ct-blue text-white rounded-lg text-sm font-mono font-semibold flex items-center justify-center gap-2 hover:bg-blue-500 transition-all disabled:opacity-50">
//             {loading?<Loader2 size={13} className="animate-spin"/>:<Save size={13}/>} Save
//           </button>
//         </div>
//       </div>
//     </div>
//   )
// }

// // ── Row action buttons helper ─────────────────────────────
// function RowActions({ onEdit, onDelete }) {
//   return (
//     <div className="flex items-center gap-1.5">
//       <button onClick={onEdit}
//         className="p-1.5 rounded border border-ct-blue/30 text-ct-blue hover:bg-ct-blue/10 transition-colors">
//         <Edit2 size={10}/>
//       </button>
//       <button onClick={onDelete}
//         className="p-1.5 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors">
//         <Trash2 size={10}/>
//       </button>
//     </div>
//   )
// }

// const TABS = [
//   { id:'upi',    label:'UPI / Bank',    icon:CreditCard, color:'ct-green',  desc:'Victim complaints and bank money trail (feeds UPI + Multi modules)' },
//   { id:'social', label:'Social / CDR',  icon:Phone,      color:'ct-purple', desc:'Call records and phone networks (feeds Social + Multi modules)' },
//   { id:'shell',  label:'Shell Company', icon:Building2,  color:'ct-amber',  desc:'Company and director data from MCA21/ROC (feeds Shell + Multi modules)' },
//   { id:'link',   label:'Account Link',  icon:Link2,      color:'ct-cyan',   desc:'Manually link two accounts after Section 91 CrPC bank response' },
// ]

// // Static colour classes — Tailwind needs complete strings at build time
// const TAB_ACTIVE = {
//   'ct-green':  'text-ct-green  bg-ct-green/5  border-b-2 border-b-ct-green  -mb-px',
//   'ct-purple': 'text-ct-purple bg-ct-purple/5 border-b-2 border-b-ct-purple -mb-px',
//   'ct-amber':  'text-ct-amber  bg-ct-amber/5  border-b-2 border-b-ct-amber  -mb-px',
//   'ct-cyan':   'text-ct-cyan   bg-ct-cyan/5   border-b-2 border-b-ct-cyan   -mb-px',
// }
// const TAB_DESC = {
//   'ct-green':  'text-[11px] font-mono text-ct-green/70',
//   'ct-purple': 'text-[11px] font-mono text-ct-purple/70',
//   'ct-amber':  'text-[11px] font-mono text-ct-amber/70',
//   'ct-cyan':   'text-[11px] font-mono text-ct-cyan/70',
// }

// export default function Complaints() {
//   const { user } = useStore()
//   const [activeTab, setActiveTab]               = useState('upi')
//   const [complaints, setComplaints]             = useState([])
//   const [summary, setSummary]                   = useState(null)
//   const [editingComplaint, setEditingComplaint] = useState(null)
//   const [showNewForm, setShowNewForm]           = useState(false)

//   const [uploading,     setUploading]     = useState(false)
//   const [uploadResult,  setUploadResult]  = useState(null)
//   const [bankUploading, setBankUploading] = useState(false)
//   const [bankResult,    setBankResult]    = useState(null)
//   const [cdrUploading,  setCdrUploading]  = useState(false)
//   const [cdrResult,     setCdrResult]     = useState(null)
//   const [compUploading, setCompUploading] = useState(false)
//   const [compResult,    setCompResult]    = useState(null)
//   const [linking,       setLinking]       = useState(false)
//   const [cdrSaving,     setCdrSaving]     = useState(false)
//   const [importedData,  setImportedData]  = useState(null)
//   const [loadingImported, setLoadingImported] = useState(false)
//   const [compSaving,    setCompSaving]    = useState(false)

//   // Edit states for each section
//   const [editingCdr,      setEditingCdr]      = useState(null)
//   const [editingDirector, setEditingDirector] = useState(null)
//   const [editingTransfer, setEditingTransfer] = useState(null)

//   const blankNew  = { complaint_id:'', complainant_name:'', complainant_phone:'', fraud_upi_id:'', fraud_phone:'', fraud_bank_account:'', amount_inr:'', fir_number:'', transaction_date:'', district:'', description:'' }
//   const blankCdr  = { phone_from:'', phone_to:'', relationship:'CALLED', frequency:'1', date:'' }
//   const blankComp = { cin:'', company_name:'', director_din:'', director_name:'', designation:'Director', date_of_appointment:'', company_status:'Active' }
//   const blankLink = { from_id:'', to_id:'', amount_inr:'', transfer_date:'', reference:'', note:'' }

//   const [newForm,  setNewForm]  = useState(blankNew)
//   const [cdrForm,  setCdrForm]  = useState(blankCdr)
//   const [compForm, setCompForm] = useState(blankComp)
//   const [linkForm, setLinkForm] = useState(blankLink)

//   const setF = (setter) => (k,v) => setter(f=>({...f,[k]:v}))

//   const loadImported = async (module='all') => {
//     setLoadingImported(true)
//     try { const r = await getImportedData(module, 200); setImportedData(r.data) }
//     catch {} finally { setLoadingImported(false) }
//   }

//   const load = () => {
//     listComplaints({limit:50}).then(r=>setComplaints(r.data.complaints||[])).catch(()=>{})
//     getComplaintSummary().then(r=>setSummary(r.data)).catch(()=>{})
//   }

//   useEffect(()=>{ load() },[])

//   const handleUpload = async (file) => {
//     setUploading(true)
//     try {
//       const r = await ingestCSV(file)
//       setUploadResult(`${r.data.ingested} complaints · ${r.data.nodes_created} nodes · ${r.data.edges_created} edges`)
//       load()
//     } catch { toast.error('Import failed') }
//     finally { setUploading(false) }
//   }

//   const handleBankUpload = async (file) => {
//     setBankUploading(true)
//     try {
//       const r = await ingestBankTransfers(file)
//       setBankResult(`${r.data.imported} bank transfers imported`)
//       load(); loadImported('upi')
//     } catch { toast.error('Import failed') }
//     finally { setBankUploading(false) }
//   }

//   const handleCdrUpload = async (file) => {
//     setCdrUploading(true)
//     try {
//       const r = await ingestCallRecords(file)
//       setCdrResult(`${r.data.imported} call records imported`)
//       loadImported('social')
//     } catch { toast.error('Import failed') }
//     finally { setCdrUploading(false) }
//   }

//   const handleCompUpload = async (file) => {
//     setCompUploading(true)
//     try {
//       const r = await ingestCompanyData(file)
//       setCompResult(`${r.data.imported} director records imported`)
//       loadImported('shell')
//     } catch { toast.error('Import failed') }
//     finally { setCompUploading(false) }
//   }

//   const handleCreateComplaint = async () => {
//     if (!newForm.complainant_phone && !newForm.fraud_upi_id) { toast.error('Victim phone or Fraud UPI ID required'); return }
//     try {
//       await createComplaint({...newForm, amount_inr:Number(newForm.amount_inr)||0})
//       toast.success('Complaint added'); setShowNewForm(false); setNewForm(blankNew); load()
//     } catch(e) { toast.error(e?.response?.data?.detail||'Failed') }
//   }

//   const handleCdrManual = async () => {
//     if (!cdrForm.phone_from||!cdrForm.phone_to) { toast.error('Both phones required'); return }
//     setCdrSaving(true)
//     try {
//       const csv = `phone_from,phone_to,relationship,frequency,date\n${cdrForm.phone_from},${cdrForm.phone_to},${cdrForm.relationship},${cdrForm.frequency||1},${cdrForm.date}`
//       await ingestCallRecords(new File([csv],'manual.csv',{type:'text/csv'}))
//       toast.success(`Added: ${cdrForm.phone_from} → ${cdrForm.phone_to}`); setCdrForm(blankCdr); loadImported('social')
//     } catch { toast.error('Failed') } finally { setCdrSaving(false) }
//   }

//   const handleCompManual = async () => {
//     if (!compForm.cin||!compForm.director_din) { toast.error('CIN and DIN required'); return }
//     setCompSaving(true)
//     try {
//       const csv = `cin,company_name,director_din,director_name,designation,date_of_appointment,company_status\n${compForm.cin},${compForm.company_name},${compForm.director_din},${compForm.director_name},${compForm.designation},${compForm.date_of_appointment},${compForm.company_status}`
//       await ingestCompanyData(new File([csv],'manual.csv',{type:'text/csv'}))
//       toast.success('Director record added'); setCompForm(blankComp); loadImported('shell')
//     } catch { toast.error('Failed') } finally { setCompSaving(false) }
//   }

//   const handleLink = async () => {
//     if (!linkForm.from_id||!linkForm.to_id) { toast.error('From and To required'); return }
//     setLinking(true)
//     try { await linkAccounts(linkForm); toast.success(`Linked: ${linkForm.from_id} → ${linkForm.to_id}`); setLinkForm(blankLink); loadImported('upi') }
//     catch(e) { toast.error(e?.response?.data?.detail||'Link failed') } finally { setLinking(false) }
//   }

//   const handleDelete = async (c) => {
//     if (!confirm(`Delete ${c.complaint_id}? Cannot be undone.`)) return
//     try { await deleteComplaint(c.complaint_id); toast.success('Deleted'); load() } catch {}
//   }

//   useEffect(() => {
//     if (activeTab === 'social') loadImported('social')
//     else if (activeTab === 'shell') loadImported('shell')
//     else if (activeTab === 'link') loadImported('upi')
//   }, [activeTab])

//   const canEdit = user?.role !== 'analyst'
//   const isAdmin = user?.role === 'admin'

//   return (
//     <div style={{height:'100%',overflowY:'auto',padding:'1.5rem'}} className="animate-fade-in">

//       {/* Header */}
//       <div className="flex items-center justify-between mb-6">
//         <div>
//           <h1 className="text-lg font-semibold text-ct-text font-mono">Complaints & Data</h1>
//           <p className="text-ct-muted text-sm mt-0.5">Seed the investigation graph with FIR data, CDR, bank transfers and company records</p>
//         </div>
//         {canEdit && (
//           <button onClick={()=>setShowNewForm(v=>!v)}
//             className="flex items-center gap-2 px-4 py-2 bg-ct-blue text-white rounded-lg text-sm font-mono hover:bg-blue-500 transition-colors">
//             {showNewForm?<X size={14}/>:<Plus size={14}/>} {showNewForm?'Cancel':'New Complaint'}
//           </button>
//         )}
//       </div>

//       {/* Summary */}
//       {summary && (
//         <div className="grid grid-cols-3 gap-3 mb-6">
//           {[
//             {label:'Total Complaints', value:summary.total_complaints??0, color:'text-ct-text'},
//             {label:'Total Fraud Amount',value:`₹${((summary.total_amount_inr||0)/10000000).toFixed(2)} Cr`, color:'text-ct-amber'},
//             {label:'Open Complaints',  value:summary.open_complaints??0,  color:'text-ct-red'},
//           ].map(s=>(
//             <div key={s.label} className="bg-ct-surface border border-ct-border rounded-xl px-4 py-3">
//               <div className={clsx('text-xl font-semibold font-mono',s.color)}>{s.value}</div>
//               <div className="text-xs text-ct-muted mt-0.5">{s.label}</div>
//             </div>
//           ))}
//         </div>
//       )}

//       {/* New Complaint Form */}
//       {showNewForm && canEdit && (
//         <div className="bg-ct-surface border border-ct-blue/20 rounded-xl p-5 mb-6 animate-slide-up">
//           <p className="text-[10px] text-ct-blue font-mono uppercase tracking-widest mb-4">New Complaint — Manual Entry</p>
//           <div className="space-y-4">
//             <div>
//               <p className="text-[10px] text-ct-cyan font-mono uppercase tracking-widest mb-2">Victim / Complainant</p>
//               <div className="grid grid-cols-3 gap-3">
//                 <Field label="Name"><input value={newForm.complainant_name} onChange={e=>setF(setNewForm)('complainant_name',e.target.value)} placeholder="Ram Kumar" className={inp}/></Field>
//                 <Field label="Phone *"><input value={newForm.complainant_phone} onChange={e=>setF(setNewForm)('complainant_phone',e.target.value)} placeholder="9800001111" className={inp}/></Field>
//                 <Field label="Complaint / FIR ID"><input value={newForm.complaint_id} onChange={e=>setF(setNewForm)('complaint_id',e.target.value)} placeholder="FIR-2026-001" className={inp}/></Field>
//               </div>
//             </div>
//             <div>
//               <p className="text-[10px] text-ct-red font-mono uppercase tracking-widest mb-2">Fraud Account</p>
//               <div className="grid grid-cols-2 gap-3">
//                 <Field label="Fraud UPI ID *"><input value={newForm.fraud_upi_id} onChange={e=>setF(setNewForm)('fraud_upi_id',e.target.value)} placeholder="fraud@paytm" className={inp}/></Field>
//                 <Field label="Fraud Phone"><input value={newForm.fraud_phone} onChange={e=>setF(setNewForm)('fraud_phone',e.target.value)} placeholder="9000000001" className={inp}/></Field>
//                 <Field label="Fraud Bank Account"><input value={newForm.fraud_bank_account} onChange={e=>setF(setNewForm)('fraud_bank_account',e.target.value)} placeholder="1234567890HDFC" className={inp}/></Field>
//                 <Field label="Amount Cheated (₹)"><input type="number" value={newForm.amount_inr} onChange={e=>setF(setNewForm)('amount_inr',e.target.value)} placeholder="50000" className={inp}/></Field>
//               </div>
//             </div>
//             <div>
//               <p className="text-[10px] text-ct-muted font-mono uppercase tracking-widest mb-2">Additional Details</p>
//               <div className="grid grid-cols-2 gap-3">
//                 <Field label="FIR Number"><input value={newForm.fir_number} onChange={e=>setF(setNewForm)('fir_number',e.target.value)} placeholder="FIR/2026/001" className={inp}/></Field>
//                 <Field label="Transaction Date"><input type="date" value={newForm.transaction_date} onChange={e=>setF(setNewForm)('transaction_date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/></Field>
//                 <Field label="District"><input value={newForm.district} onChange={e=>setF(setNewForm)('district',e.target.value)} placeholder="Bengaluru Urban" className={inp}/></Field>
//                 <Field label="Description"><input value={newForm.description} onChange={e=>setF(setNewForm)('description',e.target.value)} placeholder="How fraud happened…" className={inp}/></Field>
//               </div>
//             </div>
//           </div>
//           <div className="flex items-center gap-3 mt-4 pt-4 border-t border-ct-border">
//             <button onClick={handleCreateComplaint} className="px-5 py-2 bg-ct-green text-white rounded-lg text-sm font-mono hover:bg-green-500 transition-colors font-semibold flex items-center gap-2">
//               <CheckCircle size={13}/> Submit Complaint
//             </button>
//             <p className="text-[10px] text-ct-muted font-mono">* Victim Phone + Fraud UPI ID required for graph tracing</p>
//           </div>
//         </div>
//       )}

//       {/* Data Upload — tabbed */}
//       {canEdit && (
//         <div className="bg-ct-surface border border-ct-border rounded-xl mb-6 overflow-hidden">
//           <div className="grid grid-cols-4 border-b border-ct-border">
//             {TABS.map(tab=>(
//               <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
//                 className={clsx(
//                   'flex items-center justify-center gap-2 px-3 py-3 text-xs font-mono transition-all border-r border-ct-border last:border-r-0',
//                   activeTab===tab.id ? TAB_ACTIVE[tab.color] : 'text-ct-muted hover:text-ct-text hover:bg-white/[0.02]'
//                 )}>
//                 <tab.icon size={12}/><span>{tab.label}</span>
//               </button>
//             ))}
//           </div>
//           <div className="px-5 py-3 border-b border-ct-border bg-ct-bg/50">
//             {TABS.map(tab=>activeTab===tab.id&&(
//               <p key={tab.id} className={TAB_DESC[tab.color]}>{tab.desc}</p>
//             ))}
//           </div>

//           {/* ── UPI / Bank ── */}
//           {activeTab==='upi' && (
//             <div className="p-5 space-y-6">
//               <div>
//                 <p className="text-[11px] font-mono font-semibold text-ct-text mb-1 flex items-center gap-2">
//                   <Upload size={11} className="text-ct-green"/> Victim Complaint CSV
//                 </p>
//                 <CsvUploader color="ct-green" requiredCols={['complainant_phone','fraud_upi_id','amount_inr']}
//                   onFile={handleUpload} uploading={uploading} result={uploadResult}
//                   sampleHref="/sample_complaints.csv" sampleName="sample_complaints.csv"/>
//               </div>
//               <div className="border-t border-ct-border pt-6">
//                 <p className="text-[11px] font-mono font-semibold text-ct-text mb-1 flex items-center gap-2">
//                   <Activity size={11} className="text-ct-amber"/> Bank Transfer CSV
//                 </p>
//                 <CsvUploader color="ct-amber" requiredCols={['from_upi','to_upi','amount_inr','bank_reference']}
//                   onFile={handleBankUpload} uploading={bankUploading} result={bankResult}
//                   sampleHref="/sample_bank_transfers.csv" sampleName="sample_bank_transfers.csv"/>
//               </div>
//             </div>
//           )}

//           {/* ── Social / CDR ── */}
//           {activeTab==='social' && (
//             <div className="p-5 space-y-6">
//               <div>
//                 <p className="text-[11px] font-mono font-semibold text-ct-text mb-1 flex items-center gap-2">
//                   <Upload size={11} className="text-ct-purple"/> Call Detail Records CSV
//                 </p>
//                 <CsvUploader color="ct-purple" requiredCols={['phone_from','phone_to','relationship']}
//                   onFile={handleCdrUpload} uploading={cdrUploading} result={cdrResult}
//                   sampleHref="/sample_social_network.csv" sampleName="sample_social_network.csv"/>
//               </div>

//               {importedData?.social?.length > 0 && (
//                 <div>
//                   <div className="flex items-center justify-between mb-2">
//                     <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest">Imported Call Records ({importedData.social.length})</p>
//                     <div className="flex items-center gap-2">
//                       <button onClick={()=>loadImported('social')} className="text-[10px] font-mono text-ct-muted hover:text-ct-blue flex items-center gap-1">↻ Refresh</button>
//                       <button onClick={async()=>{
//                         if(!confirm('Delete ALL call records?')) return
//                         await deleteAllCallRecords(); toast.success('All call records deleted'); loadImported('social')
//                       }} className="text-[10px] font-mono px-2 py-1 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors flex items-center gap-1">
//                         <Trash2 size={9}/> Delete all
//                       </button>
//                     </div>
//                   </div>
//                   <div className="rounded-xl border border-ct-border overflow-hidden">
//                     <table className="w-full">
//                       <thead><tr className="border-b border-ct-border bg-ct-bg">
//                         {['From','Relationship','To','Frequency','Date','Source',''].map(h=>(
//                           <th key={h} className="text-left px-3 py-2 text-[9px] text-ct-muted font-mono uppercase tracking-widest">{h}</th>
//                         ))}
//                       </tr></thead>
//                       <tbody>
//                         {importedData.social.map((r,i)=>(
//                           <tr key={i} className="border-b border-ct-border/40 hover:bg-white/[0.02]">
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-purple">{r.from}</td>
//                             <td className="px-3 py-2"><span className="text-[10px] font-mono px-1.5 py-0.5 bg-ct-purple/10 text-ct-purple rounded">{r.relationship}</span></td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-text">{r.to||'—'}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.frequency||'—'}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.date||'—'}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.source}</td>
//                             <td className="px-3 py-2">
//                               <RowActions
//                                 onEdit={()=>setEditingCdr(r)}
//                                 onDelete={async()=>{
//                                   if(!confirm(`Delete: ${r.from} → ${r.to}?`)) return
//                                   await deleteCallRecord(r.from, r.to, r.relationship)
//                                   toast.success('Deleted'); loadImported('social')
//                                 }}
//                               />
//                             </td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 </div>
//               )}
//               {importedData?.social?.length === 0 && !loadingImported && (
//                 <p className="text-[11px] font-mono text-ct-muted text-center py-4">No call records yet — upload CDR CSV or add manually below</p>
//               )}

//               <div className="border-t border-ct-border pt-6">
//                 <p className="text-[11px] font-mono font-semibold text-ct-text mb-3 flex items-center gap-2">
//                   <Zap size={11} className="text-ct-purple"/> Manual Entry
//                 </p>
//                 <div className="grid grid-cols-2 gap-3 mb-3">
//                   <Field label="From Phone *"><input value={cdrForm.phone_from} onChange={e=>setF(setCdrForm)('phone_from',e.target.value)} placeholder="9800001111" className={inp}/></Field>
//                   <Field label="To Phone *"><input value={cdrForm.phone_to} onChange={e=>setF(setCdrForm)('phone_to',e.target.value)} placeholder="9000000001" className={inp}/></Field>
//                   <Field label="Relationship">
//                     <select value={cdrForm.relationship} onChange={e=>setF(setCdrForm)('relationship',e.target.value)} className={inp}>
//                       <option value="CALLED" style={{background:'#0f1318'}}>CALLED</option>
//                       <option value="REGISTERED" style={{background:'#0f1318'}}>REGISTERED</option>
//                       <option value="ASSOCIATED" style={{background:'#0f1318'}}>ASSOCIATED</option>
//                     </select>
//                   </Field>
//                   <Field label="Frequency"><input type="number" value={cdrForm.frequency} onChange={e=>setF(setCdrForm)('frequency',e.target.value)} className={inp}/></Field>
//                   <Field label="Date"><input type="date" value={cdrForm.date} onChange={e=>setF(setCdrForm)('date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/></Field>
//                 </div>
//                 <button onClick={handleCdrManual} disabled={cdrSaving||!cdrForm.phone_from||!cdrForm.phone_to}
//                   className="flex items-center gap-2 px-4 py-2 bg-ct-purple/10 border border-ct-purple/30 text-ct-purple rounded-lg text-sm font-mono hover:bg-ct-purple/20 transition-all disabled:opacity-50">
//                   {cdrSaving?<Loader2 size={13} className="animate-spin"/>:<Plus size={13}/>} Add Call Record
//                 </button>
//               </div>
//             </div>
//           )}

//           {/* ── Shell Company ── */}
//           {activeTab==='shell' && (
//             <div className="p-5 space-y-6">
//               <div>
//                 <p className="text-[11px] font-mono font-semibold text-ct-text mb-1 flex items-center gap-2">
//                   <Upload size={11} className="text-ct-amber"/> Company Director CSV
//                 </p>
//                 <CsvUploader color="ct-amber" requiredCols={['cin','director_din','company_name']}
//                   onFile={handleCompUpload} uploading={compUploading} result={compResult}
//                   sampleHref="/sample_company_directors.csv" sampleName="sample_company_directors.csv"/>
//               </div>

//               {importedData?.shell?.length > 0 && (
//                 <div>
//                   <div className="flex items-center justify-between mb-2">
//                     <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest">Imported Director Records ({importedData.shell.length})</p>
//                     <div className="flex items-center gap-2">
//                       <button onClick={()=>loadImported('shell')} className="text-[10px] font-mono text-ct-muted hover:text-ct-blue flex items-center gap-1">↻ Refresh</button>
//                       <button onClick={async()=>{
//                         if(!confirm('Delete ALL company records?')) return
//                         await deleteAllCompanyData(); toast.success('All company records deleted'); loadImported('shell')
//                       }} className="text-[10px] font-mono px-2 py-1 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors flex items-center gap-1">
//                         <Trash2 size={9}/> Delete all
//                       </button>
//                     </div>
//                   </div>
//                   <div className="rounded-xl border border-ct-border overflow-hidden">
//                     <table className="w-full">
//                       <thead><tr className="border-b border-ct-border bg-ct-bg">
//                         {['DIN','Director','CIN','Company','Designation','Status',''].map(h=>(
//                           <th key={h} className="text-left px-3 py-2 text-[9px] text-ct-muted font-mono uppercase tracking-widest">{h}</th>
//                         ))}
//                       </tr></thead>
//                       <tbody>
//                         {importedData.shell.map((r,i)=>(
//                           <tr key={i} className="border-b border-ct-border/40 hover:bg-white/[0.02]">
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-amber">{r.din}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-text">{r.director_name||'—'}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.cin}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-text">{r.company_name||'—'}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.designation||'Director'}</td>
//                             <td className="px-3 py-2">
//                               <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${r.flagged?'bg-ct-red/10 text-ct-red':'bg-ct-green/10 text-ct-green'}`}>
//                                 {r.status||'Active'}
//                               </span>
//                             </td>
//                             <td className="px-3 py-2">
//                               <RowActions
//                                 onEdit={()=>setEditingDirector(r)}
//                                 onDelete={async()=>{
//                                   if(!confirm(`Delete: ${r.director_name||r.din} → ${r.company_name||r.cin}?`)) return
//                                   await deleteDirectorRecord(r.din, r.cin)
//                                   toast.success('Deleted'); loadImported('shell')
//                                 }}
//                               />
//                             </td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 </div>
//               )}
//               {importedData?.shell?.length === 0 && !loadingImported && (
//                 <p className="text-[11px] font-mono text-ct-muted text-center py-4">No company records yet — upload CSV or add manually below</p>
//               )}

//               <div className="border-t border-ct-border pt-6">
//                 <p className="text-[11px] font-mono font-semibold text-ct-text mb-3 flex items-center gap-2">
//                   <Zap size={11} className="text-ct-amber"/> Manual Director Entry
//                 </p>
//                 <div className="grid grid-cols-2 gap-3 mb-3">
//                   <Field label="CIN *"><input value={compForm.cin} onChange={e=>setF(setCompForm)('cin',e.target.value)} placeholder="L21091KA2019PTC123456" className={inp}/></Field>
//                   <Field label="Company Name"><input value={compForm.company_name} onChange={e=>setF(setCompForm)('company_name',e.target.value)} placeholder="Alpha Ventures Pvt Ltd" className={inp}/></Field>
//                   <Field label="Director DIN *"><input value={compForm.director_din} onChange={e=>setF(setCompForm)('director_din',e.target.value)} placeholder="07123456" className={inp}/></Field>
//                   <Field label="Director Name"><input value={compForm.director_name} onChange={e=>setF(setCompForm)('director_name',e.target.value)} placeholder="Ramesh Kumar" className={inp}/></Field>
//                   <Field label="Designation">
//                     <select value={compForm.designation} onChange={e=>setF(setCompForm)('designation',e.target.value)} className={inp}>
//                       {['Director','Managing Director','Whole-time Director','Independent Director','Nominee Director'].map(d=>(
//                         <option key={d} value={d} style={{background:'#0f1318'}}>{d}</option>
//                       ))}
//                     </select>
//                   </Field>
//                   <Field label="Company Status">
//                     <select value={compForm.company_status} onChange={e=>setF(setCompForm)('company_status',e.target.value)} className={inp}>
//                       {['Active','Struck Off','Dissolved','Under Liquidation'].map(s=>(
//                         <option key={s} value={s} style={{background:'#0f1318'}}>{s}</option>
//                       ))}
//                     </select>
//                   </Field>
//                   <Field label="Date of Appointment"><input type="date" value={compForm.date_of_appointment} onChange={e=>setF(setCompForm)('date_of_appointment',e.target.value)} className={inp}/></Field>
//                 </div>
//                 <button onClick={handleCompManual} disabled={compSaving||!compForm.cin||!compForm.director_din}
//                   className="flex items-center gap-2 px-4 py-2 bg-ct-amber/10 border border-ct-amber/30 text-ct-amber rounded-lg text-sm font-mono hover:bg-ct-amber/20 transition-all disabled:opacity-50">
//                   {compSaving?<Loader2 size={13} className="animate-spin"/>:<Plus size={13}/>} Add Director Record
//                 </button>
//               </div>
//             </div>
//           )}

//           {/* ── Account Link ── */}
//           {activeTab==='link' && (
//             <div className="p-5">
//               <div className="flex items-start gap-3 p-3 bg-ct-cyan/5 border border-ct-cyan/20 rounded-lg mb-5">
//                 <Info size={13} className="text-ct-cyan flex-shrink-0 mt-0.5"/>
//                 <p className="text-[11px] font-mono text-ct-muted leading-relaxed">
//                   Use after receiving a <span className="text-ct-cyan">Section 91 CrPC bank response</span> to record where money was forwarded.
//                 </p>
//               </div>

//               {importedData?.bank_transfers?.length > 0 && (
//                 <div className="mb-5">
//                   <div className="flex items-center justify-between mb-2">
//                     <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest">Saved Account Links ({importedData.bank_transfers.length})</p>
//                     <div className="flex items-center gap-2">
//                       <button onClick={()=>loadImported('upi')} className="text-[10px] font-mono text-ct-muted hover:text-ct-blue flex items-center gap-1">↻ Refresh</button>
//                       <button onClick={async()=>{
//                         if(!confirm('Delete ALL bank transfer records?')) return
//                         await deleteAllBankTransfers(); toast.success('All deleted'); loadImported('upi')
//                       }} className="text-[10px] font-mono px-2 py-1 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors flex items-center gap-1">
//                         <Trash2 size={9}/> Delete all
//                       </button>
//                     </div>
//                   </div>
//                   <div className="rounded-xl border border-ct-border overflow-hidden mb-4">
//                     <table className="w-full">
//                       <thead><tr className="border-b border-ct-border bg-ct-bg">
//                         {['From','To','Amount','Date','Reference',''].map(h=>(
//                           <th key={h} className="text-left px-3 py-2 text-[9px] text-ct-muted font-mono uppercase tracking-widest">{h}</th>
//                         ))}
//                       </tr></thead>
//                       <tbody>
//                         {importedData.bank_transfers.map((r,i)=>(
//                           <tr key={i} className="border-b border-ct-border/40 hover:bg-white/[0.02]">
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-cyan">{r.from}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-cyan">{r.to}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-amber">{r.amount?`₹${Number(r.amount).toLocaleString('en-IN')}`:'—'}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.date||'—'}</td>
//                             <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.reference||'—'}</td>
//                             <td className="px-3 py-2">
//                               <RowActions
//                                 onEdit={()=>setEditingTransfer(r)}
//                                 onDelete={async()=>{
//                                   if(!confirm(`Delete transfer: ${r.from} → ${r.to}?`)) return
//                                   await deleteBankTransfer(r.from, r.to, r.reference||'')
//                                   toast.success('Deleted'); loadImported('upi')
//                                 }}
//                               />
//                             </td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 </div>
//               )}

//               <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-2">Quick fill examples</p>
//               <div className="grid grid-cols-3 gap-2 mb-5">
//                 {[
//                   {from:'fraud@paytm',to:'mule1@ybl',label:'UPI → UPI'},
//                   {from:'mule1@ybl',to:'9876543210',label:'UPI → Phone'},
//                   {from:'9876543210',to:'bc1qxy2kg…',label:'Phone → Crypto'},
//                 ].map(ex=>(
//                   <button key={ex.label} onClick={()=>setLinkForm(f=>({...f,from_id:ex.from,to_id:ex.to}))}
//                     className="bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-left hover:border-ct-cyan/30 transition-colors group">
//                     <p className="text-[9px] font-mono text-ct-muted uppercase tracking-widest mb-1">{ex.label}</p>
//                     <p className="text-[10px] font-mono text-ct-muted group-hover:text-ct-text">{ex.from} <ArrowRight size={8} className="inline"/> {ex.to}</p>
//                   </button>
//                 ))}
//               </div>
//               <div className="grid grid-cols-2 gap-3 mb-4">
//                 <Field label="From Account *"><input value={linkForm.from_id} onChange={e=>setF(setLinkForm)('from_id',e.target.value)} placeholder="fraud@paytm or bank account" className={inp}/></Field>
//                 <Field label="To Account *"><input value={linkForm.to_id} onChange={e=>setF(setLinkForm)('to_id',e.target.value)} placeholder="mule1@ybl or phone number" className={inp}/></Field>
//                 <Field label="Amount (₹)"><input type="number" value={linkForm.amount_inr} onChange={e=>setF(setLinkForm)('amount_inr',e.target.value)} placeholder="380000" className={inp}/></Field>
//                 <Field label="Transfer Date"><input type="date" value={linkForm.transfer_date} onChange={e=>setF(setLinkForm)('transfer_date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/></Field>
//                 <Field label="Bank Reference / UTR"><input value={linkForm.reference} onChange={e=>setF(setLinkForm)('reference',e.target.value)} placeholder="HDFC-UTR-826341098765" className={inp}/></Field>
//                 <Field label="Investigation Note"><input value={linkForm.note} onChange={e=>setF(setLinkForm)('note',e.target.value)} placeholder="From HDFC Section 91 response" className={inp}/></Field>
//               </div>
//               <div className="flex items-center justify-between pt-4 border-t border-ct-border">
//                 {linkForm.from_id&&linkForm.to_id ? (
//                   <p className="text-[10px] font-mono text-ct-muted">
//                     <span className="text-ct-cyan">{linkForm.from_id}</span>
//                     <ArrowRight size={9} className="inline mx-1.5"/>
//                     <span className="text-ct-cyan">{linkForm.to_id}</span>
//                     {linkForm.amount_inr&&<span className="text-ct-amber ml-2">₹{Number(linkForm.amount_inr).toLocaleString('en-IN')}</span>}
//                   </p>
//                 ) : <span/>}
//                 <button onClick={handleLink} disabled={linking||!linkForm.from_id||!linkForm.to_id}
//                   className="flex items-center gap-2 px-5 py-2 bg-ct-cyan/10 border border-ct-cyan/30 text-ct-cyan rounded-lg text-sm font-mono hover:bg-ct-cyan/20 transition-all disabled:opacity-50">
//                   {linking?<Loader2 size={13} className="animate-spin"/>:<Link2 size={13}/>} Link Accounts
//                 </button>
//               </div>
//             </div>
//           )}
//         </div>
//       )}

//       {/* Complaints table */}
//       <div className="bg-ct-surface border border-ct-border rounded-xl overflow-hidden">
//         <div className="px-4 py-3 border-b border-ct-border flex items-center justify-between">
//           <span className="text-xs text-ct-muted font-mono uppercase tracking-widest">Recent Complaints ({complaints.length})</span>
//           <div className="flex items-center gap-2">
//             {isAdmin && complaints.length > 0 && (
//               <button onClick={async()=>{
//                 if(!confirm(`Delete ALL ${complaints.length} complaints? This cannot be undone.`)) return
//                 try {
//                   const r = await deleteAllComplaints()
//                   toast.success(`Deleted ${r.data.deleted} complaints`)
//                   load()
//                 } catch(e) { toast.error(e?.response?.data?.detail || 'Delete all failed') }
//               }} className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors">
//                 <Trash2 size={9}/> Delete all
//               </button>
//             )}
//             <button onClick={load} className="text-[10px] font-mono text-ct-muted hover:text-ct-blue flex items-center gap-1 transition-colors">↻ Refresh</button>
//           </div>
//         </div>
//         {complaints.length === 0 ? (
//           <div className="py-10 text-center text-ct-muted text-sm font-mono">No complaints yet — upload a CSV or add one manually above</div>
//         ) : (
//           <div className="overflow-x-auto">
//             <table className="w-full">
//               <thead>
//                 <tr className="border-b border-ct-border">
//                   {['ID','Victim','Phone','Fraud UPI','Amount','FIR','Date','Status',''].map(h=>(
//                     <th key={h} className="text-left px-4 py-2 text-[10px] text-ct-muted font-mono uppercase tracking-widest whitespace-nowrap">{h}</th>
//                   ))}
//                 </tr>
//               </thead>
//               <tbody>
//                 {complaints.map((c,i)=>(
//                   <tr key={i} className="border-b border-ct-border/40 hover:bg-white/[0.02] transition-colors">
//                     <td className="px-4 py-2.5 text-[11px] font-mono text-ct-cyan whitespace-nowrap">{c.complaint_id}</td>
//                     <td className="px-4 py-2.5 text-[11px] font-mono text-ct-text">{c.complainant_name||'—'}</td>
//                     <td className="px-4 py-2.5 text-[11px] font-mono text-ct-purple">{c.complainant_phone||'—'}</td>
//                     <td className="px-4 py-2.5 text-[11px] font-mono text-ct-text">{c.fraud_upi_id||'—'}</td>
//                     <td className="px-4 py-2.5 text-[11px] font-mono text-ct-amber whitespace-nowrap">
//                       {c.amount_inr?`₹${Number(c.amount_inr).toLocaleString('en-IN')}`:'—'}
//                     </td>
//                     <td className="px-4 py-2.5 text-[11px] font-mono text-ct-muted">{c.fir_number||'—'}</td>
//                     <td className="px-4 py-2.5 text-[11px] font-mono text-ct-muted whitespace-nowrap">
//                       {c.transaction_date?new Date(c.transaction_date).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}):'—'}
//                     </td>
//                     <td className="px-4 py-2.5">
//                       <span className={clsx('text-[10px] font-mono px-2 py-0.5 rounded whitespace-nowrap',
//                         c.status==='open'?'bg-ct-red/10 text-ct-red':c.status==='closed'?'bg-ct-green/10 text-ct-green':'bg-ct-amber/10 text-ct-amber'
//                       )}>{c.status}</span>
//                     </td>
//                     <td className="px-4 py-2.5">
//                       {canEdit&&(
//                         <RowActions
//                           onEdit={()=>setEditingComplaint(c)}
//                           onDelete={()=>handleDelete(c)}
//                         />
//                       )}
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         )}
//       </div>

//       {/* Edit modals */}
//       {editingComplaint  && <EditModal       complaint={editingComplaint}  onClose={()=>setEditingComplaint(null)}  onSaved={load}/>}
//       {editingCdr        && <EditCdrModal      record={editingCdr}          onClose={()=>setEditingCdr(null)}        onSaved={()=>loadImported('social')}/>}
//       {editingDirector   && <EditDirectorModal record={editingDirector}     onClose={()=>setEditingDirector(null)}   onSaved={()=>loadImported('shell')}/>}
//       {editingTransfer   && <EditTransferModal record={editingTransfer}     onClose={()=>setEditingTransfer(null)}   onSaved={()=>loadImported('upi')}/>}
//     </div>
//   )
// }


// src/pages/Complaints.jsx
import { useState, useEffect, useRef } from 'react'
import {
  Upload, FileText, CheckCircle, AlertCircle, Plus, X, Edit2, Trash2,
  Loader2, Save, Download, Activity, Zap, Phone, Building2, CreditCard,
  Bitcoin, ChevronRight, AlertTriangle, Link2, ArrowRight, Info
} from 'lucide-react'
import {
  ingestCSV, ingestBankTransfers, linkAccounts,
  ingestCallRecords, ingestCompanyData, getImportedData,
  deleteCallRecord, deleteAllCallRecords,
  deleteDirectorRecord, deleteAllCompanyData,
  deleteBankTransfer, deleteAllBankTransfers,
  updateCallRecord, updateDirectorRecord, updateBankTransfer,
  listComplaints, getComplaintSummary,
  createComplaint, updateComplaint, deleteComplaint, deleteAllComplaints
} from '../services/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import useStore from '../store/useStore'

const inp  = 'w-full bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-sm font-mono text-ct-text placeholder-ct-muted/50 outline-none focus:border-ct-blue/50 transition-colors'
const lbl  = 'block text-[10px] text-ct-muted uppercase font-mono tracking-wider mb-1'

function Field({ label, required, children }) {
  return (
    <div>
      <label className={lbl}>{label}{required && <span className="text-ct-red ml-0.5">*</span>}</label>
      {children}
    </div>
  )
}

// ── Generic inline modal shell ────────────────────────────
function Modal({ title, color='text-ct-blue', onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-ct-surface border border-ct-border rounded-2xl w-full max-w-md shadow-2xl animate-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-ct-border">
          <span className={clsx('text-sm font-semibold font-mono flex items-center gap-2', color)}>
            <Edit2 size={13}/>{title}
          </span>
          <button onClick={onClose} className="text-ct-muted hover:text-ct-text"><X size={14}/></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ── Edit CDR record modal ─────────────────────────────────
function EditCdrModal({ record, onClose, onSaved }) {
  const [form, setForm] = useState({
    phone_from:   record.from,
    phone_to:     record.to,
    relationship: record.relationship || 'CALLED',
    frequency:    record.frequency || 1,
    date:         record.date || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    setSaving(true)
    try {
      await updateCallRecord(form)
      toast.success('Call record updated')
      onSaved(); onClose()
    } catch(e) { toast.error(e?.response?.data?.detail || 'Update failed') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Edit Call Record" color="text-ct-purple" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 p-2 bg-ct-bg rounded-lg border border-ct-border mb-1">
          <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">FROM</p><p className="text-xs font-mono text-ct-purple">{form.phone_from}</p></div>
          <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">TO</p><p className="text-xs font-mono text-ct-purple">{form.phone_to}</p></div>
        </div>
        <Field label="Relationship">
          <select value={form.relationship} onChange={e=>set('relationship',e.target.value)} className={inp}>
            <option value="CALLED"     style={{background:'#0f1318'}}>CALLED</option>
            <option value="REGISTERED" style={{background:'#0f1318'}}>REGISTERED</option>
            <option value="ASSOCIATED" style={{background:'#0f1318'}}>ASSOCIATED</option>
          </select>
        </Field>
        <Field label="Call Frequency">
          <input type="number" value={form.frequency} onChange={e=>set('frequency',Number(e.target.value))} className={inp}/>
        </Field>
        <Field label="Date">
          <input type="date" value={form.date} onChange={e=>set('date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/>
        </Field>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-9 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-9 bg-ct-purple/10 border border-ct-purple/30 text-ct-purple rounded-lg text-sm font-mono hover:bg-ct-purple/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Edit Director record modal ────────────────────────────
function EditDirectorModal({ record, onClose, onSaved }) {
  const [form, setForm] = useState({
    din:                record.din,
    cin:                record.cin,
    director_name:      record.director_name || '',
    company_name:       record.company_name  || '',
    designation:        record.designation   || 'Director',
    company_status:     record.status        || 'Active',
    date_of_appointment: record.doa          || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    setSaving(true)
    try {
      await updateDirectorRecord(form)
      toast.success('Director record updated')
      onSaved(); onClose()
    } catch(e) { toast.error(e?.response?.data?.detail || 'Update failed') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Edit Director Record" color="text-ct-amber" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 p-2 bg-ct-bg rounded-lg border border-ct-border mb-1">
          <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">DIN</p><p className="text-xs font-mono text-ct-amber">{form.din}</p></div>
          <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">CIN</p><p className="text-xs font-mono text-ct-muted">{form.cin}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Director Name">
            <input value={form.director_name} onChange={e=>set('director_name',e.target.value)} placeholder="Ramesh Kumar" className={inp}/>
          </Field>
          <Field label="Company Name">
            <input value={form.company_name} onChange={e=>set('company_name',e.target.value)} placeholder="Alpha Pvt Ltd" className={inp}/>
          </Field>
        </div>
        <Field label="Designation">
          <select value={form.designation} onChange={e=>set('designation',e.target.value)} className={inp}>
            {['Director','Managing Director','Whole-time Director','Independent Director','Nominee Director'].map(d=>(
              <option key={d} value={d} style={{background:'#0f1318'}}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Company Status">
          <select value={form.company_status} onChange={e=>set('company_status',e.target.value)} className={inp}>
            {['Active','Struck Off','Dissolved','Under Liquidation'].map(s=>(
              <option key={s} value={s} style={{background:'#0f1318'}}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Date of Appointment">
          <input type="date" value={form.date_of_appointment} onChange={e=>set('date_of_appointment',e.target.value)} className={inp}/>
        </Field>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-9 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-9 bg-ct-amber/10 border border-ct-amber/30 text-ct-amber rounded-lg text-sm font-mono hover:bg-ct-amber/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Edit Bank Transfer modal ──────────────────────────────
function EditTransferModal({ record, onClose, onSaved }) {
  const [form, setForm] = useState({
    from_id:       record.from,
    to_id:         record.to,
    reference:     record.reference || '',
    amount_inr:    record.amount    || '',
    transfer_date: record.date      || '',
    note:          record.note      || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    setSaving(true)
    try {
      await updateBankTransfer(form)
      toast.success('Transfer record updated')
      onSaved(); onClose()
    } catch(e) { toast.error(e?.response?.data?.detail || 'Update failed') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Edit Bank Transfer" color="text-ct-cyan" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 p-2 bg-ct-bg rounded-lg border border-ct-border mb-1">
          <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">FROM</p><p className="text-xs font-mono text-ct-cyan truncate">{form.from_id}</p></div>
          <div><p className="text-[9px] font-mono text-ct-muted mb-0.5">TO</p><p className="text-xs font-mono text-ct-cyan truncate">{form.to_id}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)">
            <input type="number" value={form.amount_inr} onChange={e=>set('amount_inr',e.target.value)} placeholder="380000" className={inp}/>
          </Field>
          <Field label="Transfer Date">
            <input type="date" value={form.transfer_date} onChange={e=>set('transfer_date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/>
          </Field>
        </div>
        <Field label="Bank Reference / UTR">
          <input value={form.reference} onChange={e=>set('reference',e.target.value)} placeholder="HDFC-UTR-826341098765" className={inp}/>
        </Field>
        <Field label="Investigation Note">
          <input value={form.note} onChange={e=>set('note',e.target.value)} placeholder="From Section 91 response…" className={inp}/>
        </Field>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-9 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-9 bg-ct-cyan/10 border border-ct-cyan/30 text-ct-cyan rounded-lg text-sm font-mono hover:bg-ct-cyan/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── CSV uploader with column validation ───────────────────
function CsvUploader({ color, requiredCols, onFile, uploading, result, sampleHref, sampleName }) {
  const ref = useRef()
  const [dragOver, setDragOver] = useState(false)
  const [colError, setColError] = useState(null)

  const validate = (file) => {
    if (!file) return
    if (!file.name.endsWith('.csv')) { toast.error('Only .csv files accepted'); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const firstLine = (e.target.result || '').split('\n')[0] || ''
      const cols = firstLine.split(',').map(c => c.trim().toLowerCase().replace(/\s+/g,'_').replace(/"/g,''))
      const missing = requiredCols.filter(c => !cols.includes(c))
      if (missing.length) {
        setColError(`Missing columns: ${missing.join(', ')}`)
        toast.error(`CSV missing required columns: ${missing.join(', ')}`)
      } else {
        setColError(null)
        onFile(file)
      }
    }
    reader.readAsText(file)
  }

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); validate(e.dataTransfer.files[0]) }

  return (
    <div>
      <label
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={onDrop}
        className={clsx(
          'flex flex-col items-center justify-center gap-2 py-7 border-2 border-dashed rounded-xl cursor-pointer transition-all select-none',
          uploading ? 'border-ct-cyan/60 bg-ct-cyan/5' :
          dragOver  ? 'border-ct-blue/60 bg-ct-blue/5 scale-[1.01]' :
          colError  ? 'border-ct-red/40 bg-ct-red/5' :
          result    ? 'border-ct-green/40 bg-ct-green/5' :
                      'border-ct-border hover:border-ct-border2'
        )}>
        <input ref={ref} type="file" accept=".csv" onChange={e=>validate(e.target.files[0])} className="hidden" disabled={uploading}/>
        {uploading ? (
          <><div className="w-5 h-5 border-2 border-ct-cyan border-t-transparent rounded-full animate-spin"/>
            <span className="text-sm font-mono text-ct-cyan">Importing…</span></>
        ) : result ? (
          <><CheckCircle size={20} className="text-ct-green"/>
            <span className="text-sm font-mono text-ct-green font-semibold">{result}</span>
            <span className="text-[11px] text-ct-muted font-mono">Drop another file to re-import</span></>
        ) : colError ? (
          <><AlertCircle size={20} className="text-ct-red"/>
            <span className="text-sm font-mono text-ct-red text-center px-4">{colError}</span>
            <span className="text-[11px] text-ct-muted font-mono">Fix the CSV and try again</span></>
        ) : (
          <><Upload size={20} className="text-ct-muted"/>
            <span className="text-sm font-mono text-ct-muted">Drop CSV here or <span className="text-ct-blue underline">browse</span></span>
            <span className="text-[10px] font-mono text-ct-muted/60">Only .csv files · columns validated on upload</span></>
        )}
      </label>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-[10px] font-mono text-ct-muted">Required cols:</span>
        {requiredCols.map(c => (
          <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 bg-ct-bg border border-ct-border rounded text-ct-muted">{c}</span>
        ))}
        <a href={sampleHref} download={sampleName} className="ml-auto flex items-center gap-1 text-[10px] font-mono text-ct-blue hover:underline">
          <Download size={10}/> sample.csv
        </a>
      </div>
    </div>
  )
}

// ── Edit Complaint Modal ──────────────────────────────────
function EditModal({ complaint, onClose, onSaved }) {
  const [form, setForm] = useState({
    complainant_name: complaint.complainant_name||'', complainant_phone: complaint.complainant_phone||'',
    fraud_upi_id: complaint.fraud_upi_id||'', fraud_phone: complaint.fraud_phone||'',
    fraud_bank_account: complaint.fraud_bank_account||'', amount_inr: complaint.amount_inr||'',
    fir_number: complaint.fir_number||'', transaction_date: complaint.transaction_date||'',
    district: complaint.district||'', description: complaint.description||'', status: complaint.status||'open',
  })
  const [loading, setLoading] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const save = async () => {
    setLoading(true)
    try { await updateComplaint(complaint.complaint_id,{...form,amount_inr:form.amount_inr?Number(form.amount_inr):undefined}); toast.success('Updated'); onSaved(); onClose() }
    catch {} finally { setLoading(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-ct-surface border border-ct-border rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-ct-border">
          <div>
            <h2 className="text-sm font-semibold text-ct-text font-mono flex items-center gap-2"><Edit2 size={13} className="text-ct-blue"/>Edit Complaint</h2>
            <p className="text-[10px] text-ct-muted mt-0.5 font-mono">{complaint.complaint_id}</p>
          </div>
          <button onClick={onClose} className="text-ct-muted hover:text-ct-text"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
          <p className="text-[10px] text-ct-cyan font-mono uppercase tracking-widest">Victim</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input value={form.complainant_name} onChange={e=>set('complainant_name',e.target.value)} placeholder="Ram Kumar" className={inp}/></Field>
            <Field label="Phone"><input value={form.complainant_phone} onChange={e=>set('complainant_phone',e.target.value)} placeholder="9800001111" className={inp}/></Field>
          </div>
          <p className="text-[10px] text-ct-red font-mono uppercase tracking-widest">Fraud Account</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fraud UPI ID"><input value={form.fraud_upi_id} onChange={e=>set('fraud_upi_id',e.target.value)} placeholder="fraud@paytm" className={inp}/></Field>
            <Field label="Fraud Phone"><input value={form.fraud_phone} onChange={e=>set('fraud_phone',e.target.value)} placeholder="9000000001" className={inp}/></Field>
            <Field label="Bank Account"><input value={form.fraud_bank_account} onChange={e=>set('fraud_bank_account',e.target.value)} placeholder="1234567890HDFC" className={inp}/></Field>
            <Field label="Amount (₹)"><input type="number" value={form.amount_inr} onChange={e=>set('amount_inr',e.target.value)} placeholder="50000" className={inp}/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="District"><input value={form.district} onChange={e=>set('district',e.target.value)} placeholder="Mysuru" className={inp}/></Field>
            <Field label="Status">
              <select value={form.status} onChange={e=>set('status',e.target.value)} className={inp}>
                {['open','under_probe','closed'].map(s=><option key={s} value={s} style={{background:'#0f1318'}}>{s.replace('_',' ')}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description"><textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={2} placeholder="How the fraud happened…" className={inp+' resize-none'}/></Field>
        </div>
        <div className="flex gap-2 p-5 border-t border-ct-border">
          <button onClick={onClose} className="flex-1 h-10 border border-ct-border text-ct-muted rounded-lg text-sm font-mono hover:text-ct-text transition-colors">Cancel</button>
          <button onClick={save} disabled={loading} className="flex-1 h-10 bg-ct-blue text-white rounded-lg text-sm font-mono font-semibold flex items-center justify-center gap-2 hover:bg-blue-500 transition-all disabled:opacity-50">
            {loading?<Loader2 size={13} className="animate-spin"/>:<Save size={13}/>} Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row action buttons helper ─────────────────────────────
function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={onEdit}
        className="p-1.5 rounded border border-ct-blue/30 text-ct-blue hover:bg-ct-blue/10 transition-colors">
        <Edit2 size={10}/>
      </button>
      <button onClick={onDelete}
        className="p-1.5 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors">
        <Trash2 size={10}/>
      </button>
    </div>
  )
}

const TABS = [
  { id:'upi',    label:'UPI / Bank',    icon:CreditCard, color:'ct-green',  desc:'Victim complaints and bank money trail (feeds UPI + Multi modules)' },
  { id:'social', label:'Social / CDR',  icon:Phone,      color:'ct-purple', desc:'Call records and phone networks (feeds Social + Multi modules)' },
  { id:'shell',  label:'Shell Company', icon:Building2,  color:'ct-amber',  desc:'Company and director data from MCA21/ROC (feeds Shell + Multi modules)' },
  { id:'link',   label:'Account Link',  icon:Link2,      color:'ct-cyan',   desc:'Manually link two accounts after Section 91 CrPC bank response' },
]

// Static colour classes — Tailwind needs complete strings at build time
const TAB_ACTIVE = {
  'ct-green':  'text-ct-green  bg-ct-green/5  border-b-2 border-b-ct-green  -mb-px',
  'ct-purple': 'text-ct-purple bg-ct-purple/5 border-b-2 border-b-ct-purple -mb-px',
  'ct-amber':  'text-ct-amber  bg-ct-amber/5  border-b-2 border-b-ct-amber  -mb-px',
  'ct-cyan':   'text-ct-cyan   bg-ct-cyan/5   border-b-2 border-b-ct-cyan   -mb-px',
}
const TAB_DESC = {
  'ct-green':  'text-[11px] font-mono text-ct-green/70',
  'ct-purple': 'text-[11px] font-mono text-ct-purple/70',
  'ct-amber':  'text-[11px] font-mono text-ct-amber/70',
  'ct-cyan':   'text-[11px] font-mono text-ct-cyan/70',
}

export default function Complaints() {
  const { user } = useStore()
  const [activeTab, setActiveTab]               = useState('upi')
  const [complaints, setComplaints]             = useState([])
  const [summary, setSummary]                   = useState(null)
  const [editingComplaint, setEditingComplaint] = useState(null)
  const [showNewForm, setShowNewForm]           = useState(false)

  const [uploading,     setUploading]     = useState(false)
  const [uploadResult,  setUploadResult]  = useState(null)
  const [bankUploading, setBankUploading] = useState(false)
  const [bankResult,    setBankResult]    = useState(null)
  const [cdrUploading,  setCdrUploading]  = useState(false)
  const [cdrResult,     setCdrResult]     = useState(null)
  const [compUploading, setCompUploading] = useState(false)
  const [compResult,    setCompResult]    = useState(null)
  const [linking,       setLinking]       = useState(false)
  const [cdrSaving,     setCdrSaving]     = useState(false)
  const [importedData,  setImportedData]  = useState(null)
  const [loadingImported, setLoadingImported] = useState(false)
  const [compSaving,    setCompSaving]    = useState(false)

  // Edit states for each section
  const [editingCdr,      setEditingCdr]      = useState(null)
  const [editingDirector, setEditingDirector] = useState(null)
  const [editingTransfer, setEditingTransfer] = useState(null)

  const blankNew  = { complaint_id:'', complainant_name:'', complainant_phone:'', fraud_upi_id:'', fraud_phone:'', fraud_bank_account:'', amount_inr:'', fir_number:'', transaction_date:'', district:'', description:'' }
  const blankCdr  = { phone_from:'', phone_to:'', relationship:'CALLED', frequency:'1', date:'' }
  const blankComp = { cin:'', company_name:'', director_din:'', director_name:'', designation:'Director', date_of_appointment:'', company_status:'Active' }
  const blankLink = { from_id:'', to_id:'', amount_inr:'', transfer_date:'', reference:'', note:'' }

  const [newForm,  setNewForm]  = useState(blankNew)
  const [cdrForm,  setCdrForm]  = useState(blankCdr)
  const [compForm, setCompForm] = useState(blankComp)
  const [linkForm, setLinkForm] = useState(blankLink)

  const setF = (setter) => (k,v) => setter(f=>({...f,[k]:v}))

  const loadImported = async (module='all') => {
    setLoadingImported(true)
    try { const r = await getImportedData(module, 200); setImportedData(r.data) }
    catch {} finally { setLoadingImported(false) }
  }

  const load = () => {
    listComplaints({limit:50}).then(r=>setComplaints(r.data.complaints||[])).catch(()=>{})
    getComplaintSummary().then(r=>setSummary(r.data)).catch(()=>{})
  }

  useEffect(()=>{ load() },[])

  const handleUpload = async (file) => {
    setUploading(true)
    try {
      const r = await ingestCSV(file)
      setUploadResult(`${r.data.ingested} complaints · ${r.data.nodes_created} nodes · ${r.data.edges_created} edges`)
      load()
    } catch { toast.error('Import failed') }
    finally { setUploading(false) }
  }

  const handleBankUpload = async (file) => {
    setBankUploading(true)
    try {
      const r = await ingestBankTransfers(file)
      setBankResult(`${r.data.imported} bank transfers imported`)
      load(); loadImported('upi')
    } catch { toast.error('Import failed') }
    finally { setBankUploading(false) }
  }

  const handleCdrUpload = async (file) => {
    setCdrUploading(true)
    try {
      const r = await ingestCallRecords(file)
      setCdrResult(`${r.data.imported} call records imported`)
      loadImported('social')
    } catch { toast.error('Import failed') }
    finally { setCdrUploading(false) }
  }

  const handleCompUpload = async (file) => {
    setCompUploading(true)
    try {
      const r = await ingestCompanyData(file)
      setCompResult(`${r.data.imported} director records imported`)
      loadImported('shell')
    } catch { toast.error('Import failed') }
    finally { setCompUploading(false) }
  }

  const handleCreateComplaint = async () => {
    if (!newForm.complainant_phone && !newForm.fraud_upi_id) { toast.error('Victim phone or Fraud UPI ID required'); return }
    try {
      await createComplaint({...newForm, amount_inr:Number(newForm.amount_inr)||0})
      toast.success('Complaint added'); setShowNewForm(false); setNewForm(blankNew); load()
    } catch(e) { toast.error(e?.response?.data?.detail||'Failed') }
  }

  const handleCdrManual = async () => {
    if (!cdrForm.phone_from||!cdrForm.phone_to) { toast.error('Both phones required'); return }
    setCdrSaving(true)
    try {
      const csv = `phone_from,phone_to,relationship,frequency,date\n${cdrForm.phone_from},${cdrForm.phone_to},${cdrForm.relationship},${cdrForm.frequency||1},${cdrForm.date}`
      await ingestCallRecords(new File([csv],'manual.csv',{type:'text/csv'}))
      toast.success(`Added: ${cdrForm.phone_from} → ${cdrForm.phone_to}`); setCdrForm(blankCdr); loadImported('social')
    } catch { toast.error('Failed') } finally { setCdrSaving(false) }
  }

  const handleCompManual = async () => {
    if (!compForm.cin||!compForm.director_din) { toast.error('CIN and DIN required'); return }
    setCompSaving(true)
    try {
      const csv = `cin,company_name,director_din,director_name,designation,date_of_appointment,company_status\n${compForm.cin},${compForm.company_name},${compForm.director_din},${compForm.director_name},${compForm.designation},${compForm.date_of_appointment},${compForm.company_status}`
      await ingestCompanyData(new File([csv],'manual.csv',{type:'text/csv'}))
      toast.success('Director record added'); setCompForm(blankComp); loadImported('shell')
    } catch { toast.error('Failed') } finally { setCompSaving(false) }
  }

  const handleLink = async () => {
    if (!linkForm.from_id||!linkForm.to_id) { toast.error('From and To required'); return }
    setLinking(true)
    try { await linkAccounts(linkForm); toast.success(`Linked: ${linkForm.from_id} → ${linkForm.to_id}`); setLinkForm(blankLink); loadImported('upi') }
    catch(e) { toast.error(e?.response?.data?.detail||'Link failed') } finally { setLinking(false) }
  }

  const handleDelete = async (c) => {
    if (!confirm(`Delete ${c.complaint_id}? Cannot be undone.`)) return
    try { await deleteComplaint(c.complaint_id); toast.success('Deleted'); load() } catch {}
  }

  useEffect(() => {
    if (activeTab === 'social') loadImported('social')
    else if (activeTab === 'shell') loadImported('shell')
    else if (activeTab === 'link') loadImported('upi')
  }, [activeTab])

  const canEdit   = user?.role !== 'analyst'          // can upload/add/delete
  const isAdmin   = user?.role === 'admin'
  const isAnalyst = user?.role === 'analyst'

  return (
    <div style={{height:'100%',overflowY:'auto',padding:'1.5rem'}} className="animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-ct-text font-mono">Complaints & Data</h1>
          <p className="text-ct-muted text-sm mt-0.5">Seed the investigation graph with FIR data, CDR, bank transfers and company records</p>
        </div>
        {canEdit && (
          <button onClick={()=>setShowNewForm(v=>!v)}
            className="flex items-center gap-2 px-4 py-2 bg-ct-blue text-white rounded-lg text-sm font-mono hover:bg-blue-500 transition-colors">
            {showNewForm?<X size={14}/>:<Plus size={14}/>} {showNewForm?'Cancel':'New Complaint'}
          </button>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            {label:'Total Complaints', value:summary.total_complaints??0, color:'text-ct-text'},
            {label:'Total Fraud Amount',value:`₹${((summary.total_amount_inr||0)/10000000).toFixed(2)} Cr`, color:'text-ct-amber'},
            {label:'Open Complaints',  value:summary.open_complaints??0,  color:'text-ct-red'},
          ].map(s=>(
            <div key={s.label} className="bg-ct-surface border border-ct-border rounded-xl px-4 py-3">
              <div className={clsx('text-xl font-semibold font-mono',s.color)}>{s.value}</div>
              <div className="text-xs text-ct-muted mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* New Complaint Form */}
      {showNewForm && canEdit && (
        <div className="bg-ct-surface border border-ct-blue/20 rounded-xl p-5 mb-6 animate-slide-up">
          <p className="text-[10px] text-ct-blue font-mono uppercase tracking-widest mb-4">New Complaint — Manual Entry</p>
          <div className="space-y-4">
            <div>
              <p className="text-[10px] text-ct-cyan font-mono uppercase tracking-widest mb-2">Victim / Complainant</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Name"><input value={newForm.complainant_name} onChange={e=>setF(setNewForm)('complainant_name',e.target.value)} placeholder="Ram Kumar" className={inp}/></Field>
                <Field label="Phone *"><input value={newForm.complainant_phone} onChange={e=>setF(setNewForm)('complainant_phone',e.target.value)} placeholder="9800001111" className={inp}/></Field>
                <Field label="Complaint / FIR ID"><input value={newForm.complaint_id} onChange={e=>setF(setNewForm)('complaint_id',e.target.value)} placeholder="FIR-2026-001" className={inp}/></Field>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-ct-red font-mono uppercase tracking-widest mb-2">Fraud Account</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fraud UPI ID *"><input value={newForm.fraud_upi_id} onChange={e=>setF(setNewForm)('fraud_upi_id',e.target.value)} placeholder="fraud@paytm" className={inp}/></Field>
                <Field label="Fraud Phone"><input value={newForm.fraud_phone} onChange={e=>setF(setNewForm)('fraud_phone',e.target.value)} placeholder="9000000001" className={inp}/></Field>
                <Field label="Fraud Bank Account"><input value={newForm.fraud_bank_account} onChange={e=>setF(setNewForm)('fraud_bank_account',e.target.value)} placeholder="1234567890HDFC" className={inp}/></Field>
                <Field label="Amount Cheated (₹)"><input type="number" value={newForm.amount_inr} onChange={e=>setF(setNewForm)('amount_inr',e.target.value)} placeholder="50000" className={inp}/></Field>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-ct-muted font-mono uppercase tracking-widest mb-2">Additional Details</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="FIR Number"><input value={newForm.fir_number} onChange={e=>setF(setNewForm)('fir_number',e.target.value)} placeholder="FIR/2026/001" className={inp}/></Field>
                <Field label="Transaction Date"><input type="date" value={newForm.transaction_date} onChange={e=>setF(setNewForm)('transaction_date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/></Field>
                <Field label="District"><input value={newForm.district} onChange={e=>setF(setNewForm)('district',e.target.value)} placeholder="Bengaluru Urban" className={inp}/></Field>
                <Field label="Description"><input value={newForm.description} onChange={e=>setF(setNewForm)('description',e.target.value)} placeholder="How fraud happened…" className={inp}/></Field>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-ct-border">
            <button onClick={handleCreateComplaint} className="px-5 py-2 bg-ct-green text-white rounded-lg text-sm font-mono hover:bg-green-500 transition-colors font-semibold flex items-center gap-2">
              <CheckCircle size={13}/> Submit Complaint
            </button>
            <p className="text-[10px] text-ct-muted font-mono">* Victim Phone + Fraud UPI ID required for graph tracing</p>
          </div>
        </div>
      )}

      {/* Data Upload — tabbed — upload/edit hidden for analyst, tables visible to all */}
      <div className="bg-ct-surface border border-ct-border rounded-xl mb-6 overflow-hidden">
          <div className="grid grid-cols-4 border-b border-ct-border">
            {TABS.map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center justify-center gap-2 px-3 py-3 text-xs font-mono transition-all border-r border-ct-border last:border-r-0',
                  activeTab===tab.id ? TAB_ACTIVE[tab.color] : 'text-ct-muted hover:text-ct-text hover:bg-white/[0.02]'
                )}>
                <tab.icon size={12}/><span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="px-5 py-3 border-b border-ct-border bg-ct-bg/50">
            {TABS.map(tab=>activeTab===tab.id&&(
              <p key={tab.id} className={TAB_DESC[tab.color]}>{tab.desc}</p>
            ))}
          </div>

          {/* ── UPI / Bank ── */}
          {activeTab==='upi' && (
            <div className="p-5 space-y-6">
              {canEdit ? (<>
                <div>
                  <p className="text-[11px] font-mono font-semibold text-ct-text mb-1 flex items-center gap-2">
                    <Upload size={11} className="text-ct-green"/> Victim Complaint CSV
                  </p>
                  <CsvUploader color="ct-green" requiredCols={['complainant_phone','fraud_upi_id','amount_inr']}
                    onFile={handleUpload} uploading={uploading} result={uploadResult}
                    sampleHref="/sample_complaints.csv" sampleName="sample_complaints.csv"/>
                </div>
                <div className="border-t border-ct-border pt-6">
                  <p className="text-[11px] font-mono font-semibold text-ct-text mb-1 flex items-center gap-2">
                    <Activity size={11} className="text-ct-amber"/> Bank Transfer CSV
                  </p>
                  <CsvUploader color="ct-amber" requiredCols={['from_upi','to_upi','amount_inr','bank_reference']}
                    onFile={handleBankUpload} uploading={bankUploading} result={bankResult}
                    sampleHref="/sample_bank_transfers.csv" sampleName="sample_bank_transfers.csv"/>
                </div>
              </>) : (
                <div className="py-6 flex items-center gap-2 text-[11px] font-mono text-ct-muted">
                  <AlertTriangle size={12} className="text-ct-amber"/> CSV import is restricted to officers and above.
                </div>
              )}
            </div>
          )}

          {/* ── Social / CDR ── */}
          {activeTab==='social' && (
            <div className="p-5 space-y-6">
              {/* Upload — officer+ only */}
              {canEdit && (
                <div>
                  <p className="text-[11px] font-mono font-semibold text-ct-text mb-1 flex items-center gap-2">
                    <Upload size={11} className="text-ct-purple"/> Call Detail Records CSV
                  </p>
                  <CsvUploader color="ct-purple" requiredCols={['phone_from','phone_to','relationship']}
                    onFile={handleCdrUpload} uploading={cdrUploading} result={cdrResult}
                    sampleHref="/sample_social_network.csv" sampleName="sample_social_network.csv"/>
                </div>
              )}

              {/* Table — visible to all roles */}
              {importedData?.social?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest">Imported Call Records ({importedData.social.length})</p>
                    <div className="flex items-center gap-2">
                      <button onClick={()=>loadImported('social')} className="text-[10px] font-mono text-ct-muted hover:text-ct-blue flex items-center gap-1">↻ Refresh</button>
                      {canEdit && (
                        <button onClick={async()=>{
                          if(!confirm('Delete ALL call records?')) return
                          await deleteAllCallRecords(); toast.success('All call records deleted'); loadImported('social')
                        }} className="text-[10px] font-mono px-2 py-1 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors flex items-center gap-1">
                          <Trash2 size={9}/> Delete all
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-ct-border overflow-hidden">
                    <table className="w-full">
                      <thead><tr className="border-b border-ct-border bg-ct-bg">
                        {['From','Relationship','To','Frequency','Date','Source', canEdit ? '' : null].filter(Boolean).map(h=>(
                          <th key={h} className="text-left px-3 py-2 text-[9px] text-ct-muted font-mono uppercase tracking-widest">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {importedData.social.map((r,i)=>(
                          <tr key={i} className="border-b border-ct-border/40 hover:bg-white/[0.02]">
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-purple">{r.from}</td>
                            <td className="px-3 py-2"><span className="text-[10px] font-mono px-1.5 py-0.5 bg-ct-purple/10 text-ct-purple rounded">{r.relationship}</span></td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-text">{r.to||'—'}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.frequency||'—'}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.date||'—'}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.source}</td>
                            {canEdit && (
                              <td className="px-3 py-2">
                                <RowActions
                                  onEdit={()=>setEditingCdr(r)}
                                  onDelete={async()=>{
                                    if(!confirm(`Delete: ${r.from} → ${r.to}?`)) return
                                    await deleteCallRecord(r.from, r.to, r.relationship)
                                    toast.success('Deleted'); loadImported('social')
                                  }}
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {importedData?.social?.length === 0 && !loadingImported && (
                <p className="text-[11px] font-mono text-ct-muted text-center py-4">
                  {canEdit ? 'No call records yet — upload CDR CSV or add manually below' : 'No call records imported yet'}
                </p>
              )}

              {/* Manual entry — officer+ only */}
              {canEdit && (
                <div className="border-t border-ct-border pt-6">
                  <p className="text-[11px] font-mono font-semibold text-ct-text mb-3 flex items-center gap-2">
                    <Zap size={11} className="text-ct-purple"/> Manual Entry
                  </p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Field label="From Phone *"><input value={cdrForm.phone_from} onChange={e=>setF(setCdrForm)('phone_from',e.target.value)} placeholder="9800001111" className={inp}/></Field>
                    <Field label="To Phone *"><input value={cdrForm.phone_to} onChange={e=>setF(setCdrForm)('phone_to',e.target.value)} placeholder="9000000001" className={inp}/></Field>
                    <Field label="Relationship">
                      <select value={cdrForm.relationship} onChange={e=>setF(setCdrForm)('relationship',e.target.value)} className={inp}>
                        <option value="CALLED" style={{background:'#0f1318'}}>CALLED</option>
                        <option value="REGISTERED" style={{background:'#0f1318'}}>REGISTERED</option>
                        <option value="ASSOCIATED" style={{background:'#0f1318'}}>ASSOCIATED</option>
                      </select>
                    </Field>
                    <Field label="Frequency"><input type="number" value={cdrForm.frequency} onChange={e=>setF(setCdrForm)('frequency',e.target.value)} className={inp}/></Field>
                    <Field label="Date"><input type="date" value={cdrForm.date} onChange={e=>setF(setCdrForm)('date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/></Field>
                  </div>
                  <button onClick={handleCdrManual} disabled={cdrSaving||!cdrForm.phone_from||!cdrForm.phone_to}
                    className="flex items-center gap-2 px-4 py-2 bg-ct-purple/10 border border-ct-purple/30 text-ct-purple rounded-lg text-sm font-mono hover:bg-ct-purple/20 transition-all disabled:opacity-50">
                    {cdrSaving?<Loader2 size={13} className="animate-spin"/>:<Plus size={13}/>} Add Call Record
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Shell Company ── */}
          {activeTab==='shell' && (
            <div className="p-5 space-y-6">
              {/* Upload — officer+ only */}
              {canEdit && (
                <div>
                  <p className="text-[11px] font-mono font-semibold text-ct-text mb-1 flex items-center gap-2">
                    <Upload size={11} className="text-ct-amber"/> Company Director CSV
                  </p>
                  <CsvUploader color="ct-amber" requiredCols={['cin','director_din','company_name']}
                    onFile={handleCompUpload} uploading={compUploading} result={compResult}
                    sampleHref="/sample_company_directors.csv" sampleName="sample_company_directors.csv"/>
                </div>
              )}

              {/* Table — visible to all roles */}
              {importedData?.shell?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest">Imported Director Records ({importedData.shell.length})</p>
                    <div className="flex items-center gap-2">
                      <button onClick={()=>loadImported('shell')} className="text-[10px] font-mono text-ct-muted hover:text-ct-blue flex items-center gap-1">↻ Refresh</button>
                      {canEdit && (
                        <button onClick={async()=>{
                          if(!confirm('Delete ALL company records?')) return
                          await deleteAllCompanyData(); toast.success('All company records deleted'); loadImported('shell')
                        }} className="text-[10px] font-mono px-2 py-1 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors flex items-center gap-1">
                          <Trash2 size={9}/> Delete all
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-ct-border overflow-hidden">
                    <table className="w-full">
                      <thead><tr className="border-b border-ct-border bg-ct-bg">
                        {['DIN','Director','CIN','Company','Designation','Status', canEdit ? '' : null].filter(Boolean).map(h=>(
                          <th key={h} className="text-left px-3 py-2 text-[9px] text-ct-muted font-mono uppercase tracking-widest">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {importedData.shell.map((r,i)=>(
                          <tr key={i} className="border-b border-ct-border/40 hover:bg-white/[0.02]">
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-amber">{r.din}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-text">{r.director_name||'—'}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.cin}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-text">{r.company_name||'—'}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.designation||'Director'}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${r.flagged?'bg-ct-red/10 text-ct-red':'bg-ct-green/10 text-ct-green'}`}>
                                {r.status||'Active'}
                              </span>
                            </td>
                            {canEdit && (
                              <td className="px-3 py-2">
                                <RowActions
                                  onEdit={()=>setEditingDirector(r)}
                                  onDelete={async()=>{
                                    if(!confirm(`Delete: ${r.director_name||r.din} → ${r.company_name||r.cin}?`)) return
                                    await deleteDirectorRecord(r.din, r.cin)
                                    toast.success('Deleted'); loadImported('shell')
                                  }}
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {importedData?.shell?.length === 0 && !loadingImported && (
                <p className="text-[11px] font-mono text-ct-muted text-center py-4">
                  {canEdit ? 'No company records yet — upload CSV or add manually below' : 'No company records imported yet'}
                </p>
              )}

              {/* Manual entry — officer+ only */}
              {canEdit && (
                <div className="border-t border-ct-border pt-6">
                  <p className="text-[11px] font-mono font-semibold text-ct-text mb-3 flex items-center gap-2">
                    <Zap size={11} className="text-ct-amber"/> Manual Director Entry
                  </p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Field label="CIN *"><input value={compForm.cin} onChange={e=>setF(setCompForm)('cin',e.target.value)} placeholder="L21091KA2019PTC123456" className={inp}/></Field>
                    <Field label="Company Name"><input value={compForm.company_name} onChange={e=>setF(setCompForm)('company_name',e.target.value)} placeholder="Alpha Ventures Pvt Ltd" className={inp}/></Field>
                    <Field label="Director DIN *"><input value={compForm.director_din} onChange={e=>setF(setCompForm)('director_din',e.target.value)} placeholder="07123456" className={inp}/></Field>
                    <Field label="Director Name"><input value={compForm.director_name} onChange={e=>setF(setCompForm)('director_name',e.target.value)} placeholder="Ramesh Kumar" className={inp}/></Field>
                    <Field label="Designation">
                      <select value={compForm.designation} onChange={e=>setF(setCompForm)('designation',e.target.value)} className={inp}>
                        {['Director','Managing Director','Whole-time Director','Independent Director','Nominee Director'].map(d=>(
                          <option key={d} value={d} style={{background:'#0f1318'}}>{d}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Company Status">
                      <select value={compForm.company_status} onChange={e=>setF(setCompForm)('company_status',e.target.value)} className={inp}>
                        {['Active','Struck Off','Dissolved','Under Liquidation'].map(s=>(
                          <option key={s} value={s} style={{background:'#0f1318'}}>{s}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Date of Appointment"><input type="date" value={compForm.date_of_appointment} onChange={e=>setF(setCompForm)('date_of_appointment',e.target.value)} className={inp}/></Field>
                  </div>
                  <button onClick={handleCompManual} disabled={compSaving||!compForm.cin||!compForm.director_din}
                    className="flex items-center gap-2 px-4 py-2 bg-ct-amber/10 border border-ct-amber/30 text-ct-amber rounded-lg text-sm font-mono hover:bg-ct-amber/20 transition-all disabled:opacity-50">
                    {compSaving?<Loader2 size={13} className="animate-spin"/>:<Plus size={13}/>} Add Director Record
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Account Link ── */}
          {activeTab==='link' && (
            <div className="p-5">
              <div className="flex items-start gap-3 p-3 bg-ct-cyan/5 border border-ct-cyan/20 rounded-lg mb-5">
                <Info size={13} className="text-ct-cyan flex-shrink-0 mt-0.5"/>
                <p className="text-[11px] font-mono text-ct-muted leading-relaxed">
                  Use after receiving a <span className="text-ct-cyan">Section 91 CrPC bank response</span> to record where money was forwarded.
                </p>
              </div>

              {/* Saved links table — visible to all roles */}
              {importedData?.bank_transfers?.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest">Saved Account Links ({importedData.bank_transfers.length})</p>
                    <div className="flex items-center gap-2">
                      <button onClick={()=>loadImported('upi')} className="text-[10px] font-mono text-ct-muted hover:text-ct-blue flex items-center gap-1">↻ Refresh</button>
                      {canEdit && (
                        <button onClick={async()=>{
                          if(!confirm('Delete ALL bank transfer records?')) return
                          await deleteAllBankTransfers(); toast.success('All deleted'); loadImported('upi')
                        }} className="text-[10px] font-mono px-2 py-1 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors flex items-center gap-1">
                          <Trash2 size={9}/> Delete all
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-ct-border overflow-hidden mb-4">
                    <table className="w-full">
                      <thead><tr className="border-b border-ct-border bg-ct-bg">
                        {['From','To','Amount','Date','Reference', canEdit ? '' : null].filter(Boolean).map(h=>(
                          <th key={h} className="text-left px-3 py-2 text-[9px] text-ct-muted font-mono uppercase tracking-widest">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {importedData.bank_transfers.map((r,i)=>(
                          <tr key={i} className="border-b border-ct-border/40 hover:bg-white/[0.02]">
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-cyan">{r.from}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-cyan">{r.to}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-amber">{r.amount?`₹${Number(r.amount).toLocaleString('en-IN')}`:'—'}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.date||'—'}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-ct-muted">{r.reference||'—'}</td>
                            {canEdit && (
                              <td className="px-3 py-2">
                                <RowActions
                                  onEdit={()=>setEditingTransfer(r)}
                                  onDelete={async()=>{
                                    if(!confirm(`Delete transfer: ${r.from} → ${r.to}?`)) return
                                    await deleteBankTransfer(r.from, r.to, r.reference||'')
                                    toast.success('Deleted'); loadImported('upi')
                                  }}
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Link form — officer+ only */}
              {canEdit ? (<>
                <p className="text-[10px] font-mono text-ct-muted uppercase tracking-widest mb-2">Quick fill examples</p>
                <div className="grid grid-cols-3 gap-2 mb-5">
                  {[
                    {from:'fraud@paytm',to:'mule1@ybl',label:'UPI → UPI'},
                    {from:'mule1@ybl',to:'9876543210',label:'UPI → Phone'},
                    {from:'9876543210',to:'bc1qxy2kg…',label:'Phone → Crypto'},
                  ].map(ex=>(
                    <button key={ex.label} onClick={()=>setLinkForm(f=>({...f,from_id:ex.from,to_id:ex.to}))}
                      className="bg-ct-bg border border-ct-border rounded-lg px-3 py-2 text-left hover:border-ct-cyan/30 transition-colors group">
                      <p className="text-[9px] font-mono text-ct-muted uppercase tracking-widest mb-1">{ex.label}</p>
                      <p className="text-[10px] font-mono text-ct-muted group-hover:text-ct-text">{ex.from} <ArrowRight size={8} className="inline"/> {ex.to}</p>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Field label="From Account *"><input value={linkForm.from_id} onChange={e=>setF(setLinkForm)('from_id',e.target.value)} placeholder="fraud@paytm or bank account" className={inp}/></Field>
                  <Field label="To Account *"><input value={linkForm.to_id} onChange={e=>setF(setLinkForm)('to_id',e.target.value)} placeholder="mule1@ybl or phone number" className={inp}/></Field>
                  <Field label="Amount (₹)"><input type="number" value={linkForm.amount_inr} onChange={e=>setF(setLinkForm)('amount_inr',e.target.value)} placeholder="380000" className={inp}/></Field>
                  <Field label="Transfer Date"><input type="date" value={linkForm.transfer_date} onChange={e=>setF(setLinkForm)('transfer_date',e.target.value)} max={new Date().toISOString().split('T')[0]} className={inp}/></Field>
                  <Field label="Bank Reference / UTR"><input value={linkForm.reference} onChange={e=>setF(setLinkForm)('reference',e.target.value)} placeholder="HDFC-UTR-826341098765" className={inp}/></Field>
                  <Field label="Investigation Note"><input value={linkForm.note} onChange={e=>setF(setLinkForm)('note',e.target.value)} placeholder="From HDFC Section 91 response" className={inp}/></Field>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-ct-border">
                  {linkForm.from_id&&linkForm.to_id ? (
                    <p className="text-[10px] font-mono text-ct-muted">
                      <span className="text-ct-cyan">{linkForm.from_id}</span>
                      <ArrowRight size={9} className="inline mx-1.5"/>
                      <span className="text-ct-cyan">{linkForm.to_id}</span>
                      {linkForm.amount_inr&&<span className="text-ct-amber ml-2">₹{Number(linkForm.amount_inr).toLocaleString('en-IN')}</span>}
                    </p>
                  ) : <span/>}
                  <button onClick={handleLink} disabled={linking||!linkForm.from_id||!linkForm.to_id}
                    className="flex items-center gap-2 px-5 py-2 bg-ct-cyan/10 border border-ct-cyan/30 text-ct-cyan rounded-lg text-sm font-mono hover:bg-ct-cyan/20 transition-all disabled:opacity-50">
                    {linking?<Loader2 size={13} className="animate-spin"/>:<Link2 size={13}/>} Link Accounts
                  </button>
                </div>
              </>) : (
                !importedData?.bank_transfers?.length && (
                  <p className="text-[11px] font-mono text-ct-muted text-center py-4">No account links yet</p>
                )
              )}
            </div>
          )}
        </div>

      {/* Complaints table */}
      <div className="bg-ct-surface border border-ct-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-ct-border flex items-center justify-between">
          <span className="text-xs text-ct-muted font-mono uppercase tracking-widest">Recent Complaints ({complaints.length})</span>
          <div className="flex items-center gap-2">
            {isAdmin && complaints.length > 0 && (
              <button onClick={async()=>{
                if(!confirm(`Delete ALL ${complaints.length} complaints? This cannot be undone.`)) return
                try {
                  const r = await deleteAllComplaints()
                  toast.success(`Deleted ${r.data.deleted} complaints`)
                  load()
                } catch(e) { toast.error(e?.response?.data?.detail || 'Delete all failed') }
              }} className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded border border-ct-red/30 text-ct-red hover:bg-ct-red/5 transition-colors">
                <Trash2 size={9}/> Delete all
              </button>
            )}
            <button onClick={load} className="text-[10px] font-mono text-ct-muted hover:text-ct-blue flex items-center gap-1 transition-colors">↻ Refresh</button>
          </div>
        </div>
        {complaints.length === 0 ? (
          <div className="py-10 text-center text-ct-muted text-sm font-mono">No complaints yet — upload a CSV or add one manually above</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ct-border">
                  {['ID','Victim','Phone','Fraud UPI','Amount','FIR','Date','Status',''].map(h=>(
                    <th key={h} className="text-left px-4 py-2 text-[10px] text-ct-muted font-mono uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {complaints.map((c,i)=>(
                  <tr key={i} className="border-b border-ct-border/40 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5 text-[11px] font-mono text-ct-cyan whitespace-nowrap">{c.complaint_id}</td>
                    <td className="px-4 py-2.5 text-[11px] font-mono text-ct-text">{c.complainant_name||'—'}</td>
                    <td className="px-4 py-2.5 text-[11px] font-mono text-ct-purple">{c.complainant_phone||'—'}</td>
                    <td className="px-4 py-2.5 text-[11px] font-mono text-ct-text">{c.fraud_upi_id||'—'}</td>
                    <td className="px-4 py-2.5 text-[11px] font-mono text-ct-amber whitespace-nowrap">
                      {c.amount_inr?`₹${Number(c.amount_inr).toLocaleString('en-IN')}`:'—'}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] font-mono text-ct-muted">{c.fir_number||'—'}</td>
                    <td className="px-4 py-2.5 text-[11px] font-mono text-ct-muted whitespace-nowrap">
                      {c.transaction_date?new Date(c.transaction_date).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}):'—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx('text-[10px] font-mono px-2 py-0.5 rounded whitespace-nowrap',
                        c.status==='open'?'bg-ct-red/10 text-ct-red':c.status==='closed'?'bg-ct-green/10 text-ct-green':'bg-ct-amber/10 text-ct-amber'
                      )}>{c.status}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {canEdit&&(
                        <RowActions
                          onEdit={()=>setEditingComplaint(c)}
                          onDelete={()=>handleDelete(c)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit modals */}
      {editingComplaint  && <EditModal       complaint={editingComplaint}  onClose={()=>setEditingComplaint(null)}  onSaved={load}/>}
      {editingCdr        && <EditCdrModal      record={editingCdr}          onClose={()=>setEditingCdr(null)}        onSaved={()=>loadImported('social')}/>}
      {editingDirector   && <EditDirectorModal record={editingDirector}     onClose={()=>setEditingDirector(null)}   onSaved={()=>loadImported('shell')}/>}
      {editingTransfer   && <EditTransferModal record={editingTransfer}     onClose={()=>setEditingTransfer(null)}   onSaved={()=>loadImported('upi')}/>}
    </div>
  )
}
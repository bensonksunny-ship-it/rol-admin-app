import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MembershipApplicationPreview from './MembershipApplicationPreview'
import { getMemberDisplayName } from '../../utils/displayName'
import { INTERVIEW_QUESTIONS, INTERVIEW_ANSWERS } from '../../constants/membershipInterview'
import { membershipWaterBaptism, MEMBERSHIP_DEPOSIT_AMOUNT, CARING_DEPARTMENT_HEAD, depositReceiptNo } from '../../constants/membershipForm'

const fmt = (d) => {
  const dt = d ? (typeof d?.toDate === 'function' ? d.toDate() : new Date(d)) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}
const fmtDateTime = (d) => {
  const dt = d ? (typeof d?.toDate === 'function' ? d.toDate() : new Date(d)) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
}

// Stage 4 checklist wording (same five items as MembershipStageModal).
const VERIFICATION_ITEMS = [
  ['infoVerified', 'All information checked and verified'],
  ['idCopy', 'ID card copy submitted'],
  ['baptismProof', 'Baptism certificate / self-declaration form'],
  ['securityDeposit', 'Security deposit paid'],
  ['photo', 'Physical photo provided'],
]
const CELL_CALL_ITEMS = [
  ['enjoyingCellGroup', 'Enjoying Cell Group'],
  ['acceptedJesus', 'Accepted Jesus as Lord & Saviour'],
  ['desireToGrowAtROL', 'Desire to Grow at River of Life'],
]

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider opacity-60">{label}</dt>
      <dd className="text-sm font-medium break-words">{value || '—'}</dd>
    </div>
  )
}

function AddOn({ letter, title, stageText, done, cls, children }) {
  return (
    <section className={done ? `${cls} rounded-xl p-4 my-3` : 'rounded-xl border border-dashed border-slate-300 p-4 my-3 text-slate-400'} style={{ breakInside: 'avoid' }}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] opacity-70">Section {letter} • {stageText}:</p>
      <p className="font-bold mb-2">{title}</p>
      {done ? children : <p className="text-sm">Pending: added here once this stage is completed.</p>}
    </section>
  )
}

/** A4-paged PDF of a DOM node (html2canvas-pro handles Tailwind v4 oklch colours). */
async function exportNodeAsPdf(node, filename) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: node.scrollWidth })
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 10
  const pageW = 210 - margin * 2
  const pageH = 297 - margin * 2
  const pxPerMm = canvas.width / pageW
  const sliceH = Math.floor(pageH * pxPerMm)
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const h = Math.min(sliceH, canvas.height - y)
    const slice = document.createElement('canvas')
    slice.width = canvas.width; slice.height = h
    slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    if (page) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pageW, h / pxPerMm)
  }
  pdf.save(filename)
}

/** Print just the document: a new window carrying the app's stylesheets. */
function printNode(node, title) {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return false
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((el) => el.outerHTML).join('\n')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '')}</title>${styles}
    <style>@page{size:A4;margin:12mm}body{background:#fff;margin:0}.no-print{display:none!important}</style></head>
    <body>${node.outerHTML}</body></html>`)
  w.document.close()
  w.onload = () => { w.focus(); w.print() }
  setTimeout(() => { try { w.focus(); w.print() } catch { /* already printed */ } }, 1200)
  return true
}

/**
 * The membership application as a living master document: the applicant's
 * submission (Section A) plus an add-on for every pipeline stage as it completes —
 * office verification + deposit receipt (4), cell leader call (5), deacon
 * interview (6), pastoral approval + certificate (7–8). `entry` comes from a live
 * feed, so the document grows while it is open. Print / Export PDF on top.
 */
export default function ApplicationMasterDocumentModal({ entry, application, cellName = '', onClose }) {
  const docRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const name = getMemberDisplayName(entry)
  const mp = entry.membershipPipeline || {}
  const st = mp.stages || {}
  const ver = st.verification
  const dep = ver?.deposit || {}
  // Section B receipt: what the office recorded, else the standard deposit (older
  // verifications saved no receipt details).
  const verifiedAt = ver?.verifiedAt || ver?.completedAt
  const depositPaid = !!ver?.checklist?.securityDeposit
  const amountNum = Number(dep.amount) || MEMBERSHIP_DEPOSIT_AMOUNT
  const amountText = `₹ ${amountNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const receiptNo = dep.receiptNo || depositReceiptNo(dep.date || verifiedAt)
  const cl = st.cellLeaderApproval
  const iv = mp.interview || {}
  const ivDone = !!st.membershipInterview || iv.status === 'Completed'
  const pa = st.pastoralApproval
  const cert = st.certificateAndCardIssued
  const wb = membershipWaterBaptism(application) || {}
  const legacyDecl = mp.baptismSelfDeclaration?.isDeclared ? mp.baptismSelfDeclaration : null
  const declaredAt = wb.selfDeclarationSigned ? (wb.signedAt || application?.declarationResponse?.signedAt) : legacyDecl ? (legacyDecl.signedAt || legacyDecl.declaredAt) : null
  const answerOf = (a) => (a && typeof a === 'object' ? a.answer : a)
  const answerLabel = (v) => INTERVIEW_ANSWERS.find((a) => a.value === v)?.label || '—'

  const exportPdf = async () => {
    setExporting(true); setError('')
    try { await exportNodeAsPdf(docRef.current, `Membership-Application-${name.replace(/[^\w-]+/g, '-')}.pdf`) } catch (e) {
      console.error('exportNodeAsPdf', e); setError('Could not create the PDF. Please try again.')
    }
    setExporting(false)
  }
  const print = () => { if (!printNode(docRef.current, `Membership Application — ${name}`)) setError('Allow pop-ups to print.') }

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Full application record — ${name}`}
        className="w-full sm:max-w-3xl max-h-[94dvh] overflow-y-auto bg-slate-100 rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center gap-2">
          <p className="flex-1 min-w-0 font-bold text-slate-800 truncate">Full Application Record</p>
          <button type="button" onClick={print} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">📄 Print Full Application Record</button>
          <button type="button" disabled={exporting} onClick={exportPdf} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">{exporting ? 'Exporting…' : '⬇ Export PDF'}</button>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-lg text-slate-500">×</button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </div>

        <div className="p-3 sm:p-5">
          <div ref={docRef} className="bg-white text-slate-800 rounded-xl p-5 sm:p-7 shadow-sm">
            <header className="text-center border-b-2 border-slate-800 pb-3 mb-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">River of Life Christian Church, Bangalore</p>
              <h1 className="text-lg font-extrabold">Membership Application Record</h1>
              <p className="text-xs text-slate-500">{name}{entry.membershipNumber ? ` · Membership No. ${entry.membershipNumber}` : ''} · generated {fmtDateTime(new Date())}</p>
            </header>

            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-2">Section A · Stage 3 · Applicant Submission</p>
            <MembershipApplicationPreview application={application} entry={entry} scroll={false} />
            {(wb.selfDeclarationSigned || legacyDecl) && (
              <p className="mt-2 text-xs text-emerald-800">✔ Baptism self-declaration signed{declaredAt ? ` on ${fmt(declaredAt)}` : ''}.</p>
            )}

            <AddOn letter="B" stageText="Stage 4" title="Office Verification & Security Deposit" done={!!ver} cls="bg-emerald-50 border border-emerald-200 text-emerald-950">
              <div className="mb-3 space-y-0.5">
                <p className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white">
                  ✔ Verified on {fmt(verifiedAt) || '—'} by Department of Caring (Head: {CARING_DEPARTMENT_HEAD.name})
                </p>
                <p className="text-xs text-emerald-800 pl-1 break-all">{ver?.verifiedBy || ver?.by || CARING_DEPARTMENT_HEAD.email}</p>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
                {VERIFICATION_ITEMS.map(([k, label]) => {
                  const ok = !!ver?.checklist?.[k]
                  return (
                    <li key={k} className={ok ? 'text-emerald-800 font-medium' : 'text-slate-500'}>
                      {ok ? '✔' : '○'} {label}{k === 'securityDeposit' ? ` (${amountText})` : ''}
                    </li>
                  )
                })}
              </ul>
              <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-4 my-3 space-y-3">
                <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">Security Deposit Receipt</p>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-slate-900">
                  <Field label="Receipt No." value={receiptNo} />
                  <Field label="Amount Received" value={amountText} />
                  <Field label="Payment Mode" value={dep.mode || 'Cash'} />
                  <Field label="Date" value={fmt(dep.date || verifiedAt)} />
                  <Field label="Received By" value={dep.receivedBy || ver?.verifiedBy || ver?.by} />
                </dl>
                {depositPaid && (
                  <p className="text-xs font-medium text-emerald-800">
                    ✔ Mandatory membership security deposit received in full. Application cleared to move to Stage 5 (Cell Leader Approval).
                  </p>
                )}
              </div>
            </AddOn>

            <AddOn letter="C" stageText="Stage 5" title="Cell Leader Call Record" done={!!cl} cls="bg-blue-50 border border-blue-200 text-blue-950">
              <p className="text-sm font-semibold mb-2">
                {cl?.approvedBy || mp.cellLeaderRequest?.cellLeaderName || '—'}
                {(mp.cellLeaderRequest?.cellName || cellName) ? ` (${mp.cellLeaderRequest?.cellName || cellName} Cell)` : ''}
              </p>
              {'acceptedJesus' in (cl || {}) ? (
                <ul className="text-sm space-y-0.5">
                  {CELL_CALL_ITEMS.map(([k, label]) => <li key={k}>{cl[k] ? '✔' : '✖'} {label}: {cl[k] ? 'Yes' : 'No'}</li>)}
                </ul>
              ) : <p className="text-sm">Signed off by the cell leader{cl?.signedOn ? ` on ${fmt(cl.signedOn)}` : ''}.</p>}
              {cl?.notes && <p className="text-sm mt-2"><b>Notes:</b> {cl.notes}</p>}
              <p className="text-xs mt-2 opacity-70">Recorded {fmtDateTime(cl?.completedAt)}</p>
            </AddOn>

            <AddOn letter="D" stageText="Stage 6" title="Deacon Membership Interview Assessment" done={ivDone} cls="bg-purple-50 border border-purple-200 text-purple-950">
              <dl className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Conducting Deacon" value={iv.conductedByDeaconName || iv.deaconName || st.membershipInterview?.interviewer} />
                <Field label="Scheduled" value={fmtDateTime(iv.scheduledAt) || fmt(st.membershipInterview?.interviewDate)} />
              </dl>
              {iv.part1Answers && Object.keys(iv.part1Answers).length > 0 && (
                <ul className="text-sm space-y-0.5 mb-3">
                  {INTERVIEW_QUESTIONS.map((q) => (
                    // Saved as { question, answer, note } (older records: the answer string).
                    <li key={q.key}>{answerOf(iv.part1Answers[q.key]) === 'positive' ? '✔' : '•'} {q.title}: {answerLabel(answerOf(iv.part1Answers[q.key]))}
                      {iv.part1Answers[q.key]?.note ? <span className="opacity-70"> · {iv.part1Answers[q.key].note}</span> : null}</li>
                  ))}
                </ul>
              )}
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Connection Assessment" value={iv.connectionLevel || st.membershipInterview?.connectionLevel} />
                <Field label="Recommendation" value={iv.recommendation || st.membershipInterview?.recommendation} />
              </dl>
              {iv.deaconRemarks && <p className="text-sm mt-2"><b>Deacon remarks:</b> {iv.deaconRemarks}</p>}
            </AddOn>

            <AddOn letter="E" stageText="Stages 7 & 8" title="Pastoral Approval & Certificate" done={!!pa} cls="bg-amber-50 border border-amber-200 text-amber-950">
              <p className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-amber-600 text-white mb-3">
                ✔ Pastoral approval · {pa?.approvedBy || pa?.by || '—'} · {fmt(pa?.completedAt)}
              </p>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Membership No." value={cert ? entry.membershipNumber : ''} />
                <Field label="Certificate & Card Issued" value={cert ? fmtDateTime(cert.issuedAt || cert.completedAt) : 'Not yet issued'} />
                <Field label="Issued By" value={cert?.by} />
              </dl>
            </AddOn>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

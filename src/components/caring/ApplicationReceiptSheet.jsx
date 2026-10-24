import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Printer, Scissors, X } from 'lucide-react'
import { getMemberDisplayName } from '../../utils/displayName'
import {
  membershipFieldValue, membershipFullName, hasValue, MEMBERSHIP_DECISIONS,
  MEMBERSHIP_DEPOSIT_AMOUNT, depositReceiptNo, MEMBERSHIP_CHURCH_NAME,
} from '../../constants/membershipForm'
import { CHURCH_ADDRESS, CHURCH_CONTACT } from '../../utils/membershipCertificate'

// Same cleaned signature / stamp images the membership certificate uses.
const SIGN_SRC = '/assets/certificate/sign.png'
const SEAL_SRC = '/assets/certificate/seal.png'
const SHEET_W_PX = 794 // 210mm at 96dpi

const toDate = (d) => {
  const dt = d ? (typeof d?.toDate === 'function' ? d.toDate() : new Date(d)) : null
  return dt && !isNaN(dt.getTime()) ? dt : null
}
const fmt = (d) => toDate(d)?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) || ''

function Item({ label, value, wide = false }) {
  return (
    <div className={`min-w-0 py-[2.2mm] border-b border-slate-200 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[7.5pt] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="text-[10.5pt] font-medium text-slate-900 break-words leading-snug mt-[0.6mm]">{hasValue(value) ? value : '—'}</dd>
    </div>
  )
}

/**
 * One A4 page (210 × 297 mm): the membership Application Summary in the top 70%
 * and the security-deposit Payment Receipt voucher in the bottom 30%, split by a
 * dashed tear line. Print sends just the sheet to the printer (@page A4, no
 * margins); Export A4 PDF snapshots the same sheet onto exactly one A4 page.
 * Opened from the Full Application Record (ApplicationMasterDocumentModal).
 */
export default function ApplicationReceiptSheet({ entry, application, onClose }) {
  const sheetRef = useRef(null)
  const frameRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Shrink the true-size sheet to fit the window (export/print use it unscaled).
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return undefined
    const fit = () => setScale(Math.min(1, (el.clientWidth - 16) / SHEET_W_PX))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const v = (k) => membershipFieldValue(application, k)
  const name = membershipFullName(application) || getMemberDisplayName(entry)
  const ver = entry?.membershipPipeline?.stages?.verification
  const dep = ver?.deposit || {}
  const verifiedAt = ver?.verifiedAt || ver?.completedAt
  const paid = !!ver?.checklist?.securityDeposit
  const amount = Number(dep.amount) || MEMBERSHIP_DEPOSIT_AMOUNT
  const amountText = `₹${amount.toLocaleString('en-IN')}`
  const receiptNo = dep.receiptNo || depositReceiptNo(dep.date || verifiedAt || new Date())
  const status = entry?.membershipNumber ? 'Member' : (MEMBERSHIP_DECISIONS[application?.status] || application?.status || 'Not submitted')
  const contact = [v('phone'), v('email')].filter(hasValue).join('  ·  ')
  const fileBase = `Membership-Form-Receipt-${String(name || 'Applicant').replace(/[^\w-]+/g, '-')}`

  const exportPdf = async () => {
    setBusy(true); setError('')
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true,
        // Snapshot the sheet at true size, not the on-screen preview scale.
        onclone: (d) => { const w = d.querySelector('[data-sheet-scale]'); if (w) w.style.transform = 'none' },
      })
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)
      pdf.save(`${fileBase}.pdf`)
    } catch (e) {
      console.error('ApplicationReceiptSheet export', e)
      setError('Could not create the PDF. Please try again.')
    }
    setBusy(false)
  }

  const print = () => {
    const w = window.open('', '_blank', 'width=900,height=1100')
    if (!w) { setError('Allow pop-ups to print.'); return }
    const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((el) => el.outerHTML).join('\n')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${fileBase}</title>${styles}
      <style>
        @page { size: A4; margin: 0 }
        html, body { margin: 0; background: #fff }
        @media print { .a4-sheet { box-shadow: none !important; } }
      </style></head><body>${sheetRef.current.outerHTML}</body></html>`)
    w.document.close()
    let printed = false
    const go = () => { if (printed) return; printed = true; w.focus(); w.print() }
    w.onload = go
    setTimeout(() => { try { go() } catch { /* window closed */ } }, 1500)
  }

  const btn = 'inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-bold transition-colors disabled:opacity-50'

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-slate-900/70 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div className="m-2 sm:m-5 flex-1 min-h-0 flex flex-col bg-slate-100 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={`Application form and receipt — ${name}`}>
        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 bg-white border-b border-slate-200 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">Application Form & Receipt</p>
            <p className="text-xs text-slate-500 truncate">{name} · one A4 page</p>
          </div>
          <button type="button" onClick={print} className={`${btn} border border-slate-300 text-slate-700 bg-white hover:bg-slate-50`}>
            <Printer size={14} aria-hidden="true" /> Print Receipt & Form
          </button>
          <button type="button" onClick={exportPdf} disabled={busy} className={`${btn} bg-[#0d5c46] text-white hover:bg-[#168a68]`}>
            <Download size={14} aria-hidden="true" /> {busy ? 'Exporting…' : 'Export A4 PDF'}
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </div>

        {/* Preview */}
        <div ref={frameRef} className="flex-1 min-h-0 overflow-auto p-2 sm:p-4">
          <div className="mx-auto" style={{ width: SHEET_W_PX * scale, height: SHEET_W_PX * (297 / 210) * scale }}>
            <div data-sheet-scale style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: SHEET_W_PX }}>
              <div ref={sheetRef} className="a4-sheet w-[210mm] h-[297mm] bg-white text-slate-900 shadow-lg flex flex-col overflow-hidden" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>

                {/* ── Application summary (70%) ── */}
                <section className="flex-[7] min-h-0 px-[16mm] pt-[13mm] pb-[6mm] flex flex-col">
                  <header className="flex items-start justify-between gap-[6mm] pb-[4mm] border-b-2 border-[#0d5c46]">
                    <div className="min-w-0">
                      <p className="text-[8pt] font-bold uppercase tracking-[0.2em] text-[#168a68]">{MEMBERSHIP_CHURCH_NAME}</p>
                      <h1 className="text-[18pt] font-extrabold tracking-tight text-[#0d5c46] leading-tight mt-[1mm]">Membership Application Summary</h1>
                      <p className="text-[8pt] text-slate-500 mt-[1mm]">{CHURCH_ADDRESS}</p>
                    </div>
                    {application?.photoDataUrl
                      ? <img src={application.photoDataUrl} alt="" className="w-[24mm] h-[30mm] object-cover rounded-[2mm] border border-slate-200 shrink-0" />
                      : <div className="w-[24mm] h-[30mm] rounded-[2mm] border border-dashed border-slate-300 shrink-0 flex items-center justify-center text-[7pt] text-slate-400">Photo</div>}
                  </header>

                  <div className="flex items-center gap-[3mm] mt-[4mm]">
                    <span className="text-[8pt] font-bold uppercase tracking-[0.12em] px-[3mm] py-[1mm] rounded-full bg-[#e6f2ee] text-[#0d5c46]">Church Membership</span>
                    <span className="text-[8pt] font-bold uppercase tracking-[0.12em] px-[3mm] py-[1mm] rounded-full bg-[#0d5c46] text-white">{status}</span>
                    {entry?.membershipNumber && <span className="text-[8pt] font-bold tracking-[0.08em] text-slate-600">No. {entry.membershipNumber}</span>}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-[8mm] mt-[3mm]">
                    <Item label="Applicant Name" value={name} wide />
                    <Item label="Contact" value={contact} />
                    <Item label="Emergency Contact" value={v('emergencyPhone')} />
                    <Item label="Current Address" value={v('currentAddress')} wide />
                    <Item label="Application Type" value="Church Membership" />
                    <Item label="Application Status" value={status} />
                    <Item label="Application Date" value={fmt(application?.submittedAt)} />
                    <Item label="Date of Join" value={fmt(v('dateOfJoin')) || v('dateOfJoin')} />
                    <Item label="Gender" value={v('gender')} />
                    <Item label="Date of Birth" value={fmt(v('dob')) || v('dob')} />
                    <Item label="Date of Baptism" value={fmt(v('baptismDate')) || v('baptismDate')} />
                    <Item label="Baptised At" value={v('baptismChurch')} />
                    <Item label="Cell" value={v('cellName')} />
                    <Item label="Verified (Office)" value={fmt(verifiedAt)} />
                  </dl>

                  <p className="mt-auto text-[7.5pt] text-slate-500">Generated {fmt(new Date())} · {CHURCH_CONTACT}</p>
                </section>

                {/* ── Tear line ── */}
                <div className="relative h-0 border-t-2 border-dashed border-slate-400 mx-[8mm]">
                  <Scissors size={14} className="absolute -top-[9px] left-[2mm] bg-white text-slate-500" aria-hidden="true" />
                </div>

                {/* ── Payment receipt voucher (30%) ── */}
                <section className="flex-[3] min-h-0 px-[16mm] pt-[6mm] pb-[9mm] flex gap-[8mm]">
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-baseline justify-between gap-[4mm]">
                      <h2 className="text-[13pt] font-extrabold text-[#0d5c46]">Payment Receipt</h2>
                      <span className="text-[8pt] font-bold uppercase tracking-[0.12em] text-slate-500">Membership Security Deposit</span>
                    </div>
                    <dl className="grid grid-cols-3 gap-x-[6mm] mt-[2mm]">
                      <Item label="Receipt No." value={receiptNo} />
                      <Item label="Payment Date" value={fmt(dep.date || verifiedAt)} />
                      <Item label="Payment Mode" value={dep.mode || 'Cash'} />
                      <Item label="Received From" value={name} />
                      <Item label="Received By" value={dep.receivedBy || ver?.verifiedBy || ver?.by} />
                      <div className="py-[2.2mm] border-b border-slate-200">
                        <dt className="text-[7.5pt] font-bold uppercase tracking-[0.12em] text-slate-500">Status</dt>
                        <dd className="mt-[0.8mm]">
                          <span className={`inline-block text-[8pt] font-bold px-[2.5mm] py-[0.6mm] rounded-full ${paid ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                            {paid ? 'Paid / Verified' : 'Pending'}
                          </span>
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex items-end gap-[3mm]">
                      <span className="text-[8pt] font-bold uppercase tracking-[0.12em] text-slate-500">Amount Paid</span>
                      <span className="text-[22pt] font-extrabold leading-none text-[#0d5c46]">{amountText}</span>
                      <span className="text-[8pt] text-slate-500 pb-[1mm]">refundable</span>
                    </div>
                  </div>

                  {/* Seal + signature */}
                  <div className="w-[48mm] shrink-0 flex flex-col items-center justify-end">
                    <div className="relative w-[44mm] h-[34mm]">
                      <img src={SEAL_SRC} alt="Church seal" className="absolute left-0 top-0 h-[30mm] w-auto opacity-90" />
                      <img src={SIGN_SRC} alt="Signature" className="absolute right-0 bottom-0 h-[20mm] w-auto" />
                    </div>
                    <div className="w-full border-t border-slate-800 mt-[1mm] pt-[1mm] text-center">
                      <p className="text-[8pt] font-bold uppercase tracking-[0.12em] text-slate-600">Authorised Signatory</p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

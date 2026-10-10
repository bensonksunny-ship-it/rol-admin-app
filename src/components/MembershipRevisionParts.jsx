import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { imageFileToDataUrl } from '../utils/imageDataUrl'
import { MEMBERSHIP_DEPOSIT_PAYMENT } from '../constants/membershipRevision'

/**
 * Image upload with an explicit camera option and a file picker, for the public
 * revision page (ID card, baptism certificate, passport photo). The image is
 * shrunk to a JPEG data URL — the signed-out page can't upload to Storage.
 */
export function ImageUploadField({ value, onChange, maxSide = 1100, quality = 0.72, portrait = false, onError }) {
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try { onChange(await imageFileToDataUrl(file, maxSide, quality)) } catch { onError?.('Could not read that image. Please try another one.') }
  }
  const btn = 'inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border text-sm font-semibold cursor-pointer'
  return (
    <div className="space-y-2">
      {value && (
        <img src={value} alt="Selected" className={`${portrait ? 'w-28 h-36' : 'max-h-48 w-auto'} object-cover rounded-xl border border-slate-200`} />
      )}
      <div className="flex flex-wrap gap-2">
        <label className={`${btn} bg-[#1e3a5f] text-white border-[#1e3a5f]`}>
          📷 Take photo
          <input type="file" accept="image/*" capture={portrait ? 'user' : 'environment'} className="hidden" onChange={pick} />
        </label>
        <label className={`${btn} bg-white text-slate-700 border-slate-300`}>
          📁 Choose file
          <input type="file" accept="image/*" className="hidden" onChange={pick} />
        </label>
      </div>
    </div>
  )
}

/** ITEM_4: "Security Deposit Payment Pending" + UPI (when configured) / cash note,
 *  and the applicant's answer ('paid' | 'office'). */
export function DepositPaymentCard({ value, onChange }) {
  const { upiId, payeeName, officeNote, bank } = MEMBERSHIP_DEPOSIT_PAYMENT
  const upiLink = upiId ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&tn=${encodeURIComponent('Membership security deposit')}` : ''
  const [qr, setQr] = useState('')
  useEffect(() => {
    if (!upiLink) return
    QRCode.toDataURL(upiLink, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(''))
  }, [upiLink])
  const opt = (v, label) => (
    <label className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${value === v ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
      <input type="radio" name="deposit" checked={value === v} onChange={() => onChange(v)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  )
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-800">₹500 deposit pending</p>
      {upiLink && (
        <div className="flex flex-col sm:flex-row items-center gap-3 rounded-xl border border-slate-200 p-3">
          {qr && <img src={qr} alt={`UPI QR code for ${upiId}`} className="w-36 h-36" />}
          <div className="text-sm text-slate-700 space-y-2 text-center sm:text-left">
            <p>Scan or tap to pay.</p>
            <p className="font-mono text-xs text-slate-500">{upiId}</p>
            <a href={upiLink} className="inline-flex min-h-[40px] items-center px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold">Pay by UPI</a>
          </div>
        </div>
      )}
      {bank?.accountNumber && (
        <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Bank transfer</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {[['Name', bank.accountName || payeeName], ['Account No.', bank.accountNumber], ['IFSC', bank.ifsc], ['Bank', bank.bankName]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="font-medium break-all">{v}</dd></div>
            ))}
          </dl>
        </div>
      )}
      <p className="text-xs text-slate-600">{officeNote}</p>
      <div className="space-y-2">
        {opt('paid', 'I have paid')}
        {opt('office', 'I will pay at the office')}
      </div>
    </div>
  )
}

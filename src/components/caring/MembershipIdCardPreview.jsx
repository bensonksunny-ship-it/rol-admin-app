import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Download, Printer, X } from 'lucide-react'

// Double-sided Membership ID card, 55 × 85 mm portrait, laid out in mm / pt so it
// prints at true size. Matches the printed PVC card: Front — charcoal card, church
// name top left, white church logo on the right, emerald (#005044) diagonal lower
// section with the member name, "member since" and membership number right-aligned.
// Back — emerald "Membership Details" header blending into charcoal, QR code to
// rolcc.in, the member's details, white authorised signature, church address.

const QR_URL = 'https://rolcc.in'
const EMERALD = '#005044'
// White-on-transparent copies of src/assets/rolcc_logo BW.JPG and the certificate
// signature (levelled — the original is written on a diagonal).
const LOGO_URL = '/assets/idcard/logo-white.png'
const SIGN_URL = '/assets/idcard/sign-white.png'
const ADDRESS_LINES = ['No.49, AMR Plaza 3rd floor, 18th Main HSR', 'Layout Sector 3, Bangalore 560102']
const CONTACT_LINE = '90367 45258 | www.rolcc.in'
const DISCLAIMER = 'In case found unattended please return this to above address'

const CARD_CSS = `
.idc-card { position: relative; width: 55mm; height: 85mm; border-radius: 3.2mm; overflow: hidden; flex: none;
  font-family: 'Plus Jakarta Sans', 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif; color: #fff; background: #161617;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.idc-card * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.idc-abs { position: absolute; }
.idc-qr svg { display: block; width: 100%; height: 100%; }
.idc-row { height: 10mm; padding: 3mm 0 0 3.3mm; border-left: 0.2mm solid rgba(255,255,255,.09); border-bottom: 0.2mm solid rgba(255,255,255,.09); }
.idc-label { font-size: 5.4pt; font-weight: 500; color: rgba(255,255,255,.88); line-height: 1; }
.idc-value { font-size: 8.4pt; font-weight: 700; color: #fff; margin-top: 1mm; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.idc-print { display: none; }
@media screen { .idc-preview .idc-card { zoom: 1.5; box-shadow: 0 6px 22px rgba(0,0,0,.25); } }
`

// Print: only the print sheet is shown. "sheet" = front and back side by side on
// A4 with a faint cut line; "pvc" = one card per page at card size (duplex PVC
// printers take page 1 as the front and page 2 as the back).
const printCss = (mode) => `
@media print {
  ${mode === 'pvc' ? '@page { size: 55mm 85mm; margin: 0; }' : '@page { size: A4 portrait; margin: 15mm; }'}
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
  body > *:not(#rol-idcard-host) { display: none !important; }
  #rol-idcard-host .idc-overlay { display: none !important; }
  #rol-idcard-host .idc-print { display: ${mode === 'pvc' ? 'block' : 'flex'} !important; gap: 8mm; justify-content: center; align-items: flex-start; }
  ${mode === 'pvc'
    ? '#rol-idcard-host .idc-print .idc-card { border-radius: 0; break-after: page; page-break-after: always; } #rol-idcard-host .idc-print .idc-card:last-child { break-after: auto; page-break-after: auto; }'
    : '#rol-idcard-host .idc-print .idc-card { outline: 0.2mm dashed #b8b8b8; break-inside: avoid; }'}
}
`

// "RE15/12201/90005" → "RE15 / 12201 / 90005", as printed on the card.
const spacedNumber = (n) => String(n || '').trim().replace(/\s*\/\s*/g, ' / ')

export function IdCardFront({ data }) {
  const name = String(data?.name || '').trim() || 'Member Name'
  const nameSize = name.length > 24 ? 9 : name.length > 18 ? 10.5 : 12
  return (
    <div className="idc-card" aria-label="ID card front"
      style={{ background: 'linear-gradient(200deg, #3a3839 0%, #1d1c1e 42%, #121213 100%)' }}>
      <svg className="idc-abs" viewBox="0 0 55 85" preserveAspectRatio="none" style={{ inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        <polygon points="0,66.2 55,42.4 55,85 0,85" fill={EMERALD} />
      </svg>

      <img src={LOGO_URL} alt="" aria-hidden="true" className="idc-abs"
        style={{ left: '22mm', top: '9.4mm', width: '35.2mm', height: 'auto', opacity: 0.9 }} />

      <div className="idc-abs" style={{ left: '4.5mm', top: '5.2mm', fontSize: '7pt', fontWeight: 600, lineHeight: 1.22, letterSpacing: '-0.005em' }}>
        River of Life<br />Christian Church
      </div>

      <div className="idc-abs" style={{ left: '4mm', right: '3.2mm', top: '68.6mm', textAlign: 'right' }}>
        <div style={{ fontSize: `${nameSize}pt`, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        {data?.memberSince ? (
          <div style={{ fontSize: '5.2pt', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.01em', opacity: 0.85, marginTop: '0.7mm' }}>
            Member since {data.memberSince}
          </div>
        ) : null}
      </div>

      <div className="idc-abs" style={{ left: '4mm', right: '3mm', bottom: '3.4mm', textAlign: 'right', fontSize: '9.6pt', fontWeight: 700, letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
        {spacedNumber(data?.membershipNumber) || '—'}
      </div>
    </div>
  )
}

export function IdCardBack({ data, qrSvg }) {
  const [signOk, setSignOk] = useState(true)
  const val = (v) => String(v ?? '').trim() || '—'
  return (
    <div className="idc-card" aria-label="ID card back"
      style={{ background: `linear-gradient(162deg, ${EMERALD} 0%, ${EMERALD} 22%, #18302b 50%, #141816 76%, #111212 100%)` }}>
      {/* Header band: crisp lower edge on the right, melts into the gradient on the left. */}
      <div className="idc-abs" style={{ left: 0, right: 0, top: 0, height: '17mm', background: `linear-gradient(90deg, transparent 0%, ${EMERALD} 48%)` }} />

      <div className="idc-abs" style={{ left: '3.8mm', top: '5.4mm', fontSize: '11pt', lineHeight: 1.12, letterSpacing: '-0.01em' }}>
        <div style={{ fontWeight: 800 }}>Membership</div>
        <div style={{ fontWeight: 400 }}>Details</div>
      </div>

      <div className="idc-abs" style={{ right: '4.4mm', top: '4.4mm', width: '10.6mm', height: '10.6mm', background: '#fff', borderRadius: '0.5mm', padding: '0.6mm' }}>
        {qrSvg ? <div className="idc-qr" style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
      </div>

      <div className="idc-abs" style={{ left: '4mm', width: '32mm', top: '17.5mm', borderTop: '0.2mm solid rgba(255,255,255,.09)' }}>
        <div className="idc-row"><div className="idc-label">Name</div><div className="idc-value">{val(data?.name)}</div></div>
        <div className="idc-row"><div className="idc-label">Emergency Contact</div><div className="idc-value">{val(data?.emergencyContact)}</div></div>
        <div className="idc-row"><div className="idc-label">Congregation</div><div className="idc-value">{val(data?.congregation)}</div></div>
      </div>

      <div className="idc-abs idc-label" style={{ left: '7.3mm', top: '49.8mm' }}>Authorised Signature</div>
      {signOk && (
        <img src={SIGN_URL} alt="Authorised signature" onError={() => setSignOk(false)} className="idc-abs"
          style={{ left: '20.6mm', top: '52.8mm', width: '17.5mm', height: 'auto' }} />
      )}

      <div className="idc-abs" style={{ left: '2.5mm', right: '2.5mm', top: '65.6mm', textAlign: 'center' }}>
        <div style={{ fontSize: '5.6pt', lineHeight: 1.3 }}>{ADDRESS_LINES.map((l) => <div key={l}>{l}</div>)}</div>
        <div style={{ fontSize: '7.6pt', fontWeight: 700, marginTop: '1.5mm' }}>{CONTACT_LINE}</div>
      </div>
      <div className="idc-abs" style={{ left: '1.5mm', right: '1.5mm', bottom: '1.7mm', textAlign: 'center', fontSize: '4.3pt', color: '#a7dccf', whiteSpace: 'nowrap' }}>
        {DISCLAIMER}
      </div>
    </div>
  )
}

// Card face → JPEG blob. Captures the unzoomed off-screen copy at 3× (≈ 290 dpi on
// a 55 mm card). html2canvas-pro, not html2canvas: Tailwind v4 colours are oklch().
async function cardToJpeg(node) {
  const { default: html2canvas } = await import('html2canvas-pro')
  await document.fonts?.ready
  const canvas = await html2canvas(node, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false })
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG export failed'))), 'image/jpeg', 0.95))
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

const fileBase = (name) => (String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') || 'Member')

/**
 * Full-screen preview of the Membership ID card (front and back) with Print.
 * Print layout: A4 sheet (side by side, cut line) or PVC card (one card-size page
 * per side, for duplex card printers). Opened through utils/openMembershipIdCard.
 */
export default function MembershipIdCardPreview({ data, onClose }) {
  const [qrSvg, setQrSvg] = useState('')
  const [mode, setMode] = useState('sheet')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const frontRef = useRef(null)
  const backRef = useRef(null)

  // Both faces are rendered first, then saved one after the other with a short
  // gap so the browser treats them as two downloads rather than blocking one.
  const downloadJpegs = async () => {
    setSaving(true); setError('')
    try {
      const [front, back] = await Promise.all([cardToJpeg(frontRef.current.firstElementChild), cardToJpeg(backRef.current.firstElementChild)])
      const base = fileBase(data?.name)
      saveBlob(front, `${base}_ID_Card_Front.jpg`)
      await new Promise((r) => setTimeout(r, 250))
      saveBlob(back, `${base}_ID_Card_Back.jpg`)
    } catch (e) {
      console.error('ID card JPEG', e)
      setError('Could not create the JPEG files. Please try again.')
    }
    setSaving(false)
  }

  useEffect(() => {
    let cancelled = false
    QRCode.toString(QR_URL, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: EMERALD, light: '#ffffff' } })
      .then((s) => { if (!cancelled) setQrSvg(s) })
      .catch((e) => console.error('ID card QR', e))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const btn = 'inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50'
  const seg = (key, label) => (
    <button type="button" onClick={() => setMode(key)} aria-pressed={mode === key}
      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${mode === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
      {label}
    </button>
  )

  return (
    <>
      <style>{CARD_CSS + printCss(mode)}</style>
      <div className="idc-overlay fixed inset-0 z-[950] flex flex-col bg-slate-900/70 backdrop-blur-sm" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Membership ID card — ${data?.name || ''}`}
          onClick={(e) => e.stopPropagation()}
          className="m-2 sm:m-6 flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden bg-white shadow-2xl border border-slate-200"
        >
          <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-b border-slate-200 bg-white shrink-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">Membership ID Card</p>
              <p className="text-xs text-slate-500 truncate">{data?.name}{data?.membershipNumber ? ` · ${data.membershipNumber}` : ''}</p>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Print layout">
              {seg('sheet', 'A4 sheet')}
              {seg('pvc', 'PVC card')}
            </div>
            <button type="button" onClick={() => window.print()} disabled={!qrSvg}
              className={`${btn} bg-[#005044] text-white hover:bg-[#00695a]`}>
              <Printer size={14} aria-hidden="true" /> Print
            </button>
            <button type="button" onClick={downloadJpegs} disabled={!qrSvg || saving}
              className={`${btn} bg-white text-slate-700 border border-slate-300 hover:bg-slate-50`}>
              <Download size={14} aria-hidden="true" /> {saving ? 'Preparing…' : 'Download JPEG (Front & Back)'}
            </button>
            <button type="button" onClick={onClose} aria-label="Close"
              className="w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="idc-preview flex-1 min-h-0 overflow-auto bg-slate-100 p-4 sm:p-8">
            <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-10">
              <figure className="flex flex-col items-center gap-2">
                <IdCardFront data={data} />
                <figcaption className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Front</figcaption>
              </figure>
              <figure className="flex flex-col items-center gap-2">
                <IdCardBack data={data} qrSvg={qrSvg} />
                <figcaption className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Back</figcaption>
              </figure>
            </div>
            {error && <p className="mt-4 text-center text-xs font-semibold text-red-600">{error}</p>}
            <p className="mt-6 text-center text-[11px] text-slate-500">
              {mode === 'pvc'
                ? 'PVC card: prints one 55 × 85 mm page per side (front, then back). Choose your card printer, set scale to 100% / Actual size, and turn on two-sided printing.'
                : 'A4 sheet: front and back print side by side at true size (55 × 85 mm) with a cut line. Set scale to 100% / Actual size and turn on Background graphics.'}
            </p>
          </div>
        </div>
      </div>

      {/* Unzoomed copies off screen, captured for the JPEG download. */}
      <div aria-hidden="true" style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}>
        <div ref={frontRef}><IdCardFront data={data} /></div>
        <div ref={backRef} style={{ marginTop: '4mm' }}><IdCardBack data={data} qrSvg={qrSvg} /></div>
      </div>

      {/* What actually prints (hidden on screen). */}
      <div className="idc-print">
        <IdCardFront data={data} />
        <IdCardBack data={data} qrSvg={qrSvg} />
      </div>
    </>
  )
}

import { useEffect, useId, useState } from 'react'
import QRCode from 'qrcode'
import { Printer, X } from 'lucide-react'

// Double-sided Membership ID card, 55 × 85 mm portrait (8.5 × 5.5 cm, vertical),
// laid out in mm / pt so it prints at true size. Front: dark upper section, green
// lower diagonal bar, church name, globe-and-cross watermark, member name, member
// since, membership ID. Back: green "Membership Details" banner with a QR code to
// rolcc.in, the member's details with the authorised signature, church address.

const QR_URL = 'https://rolcc.in'
const SIGN_URL = '/assets/certificate/sign.png'
const ADDRESS = 'No.49, AMR Plaza 3rd floor, 18th Main HSR Layout Sector 3, Bangalore 560102'
const CONTACT_LINE = '90367 45258 | www.rolcc.in'
const DISCLAIMER = 'In case found unattended please return this to above address'

const CARD_CSS = `
.idc-card { position: relative; width: 55mm; height: 85mm; border-radius: 8px; overflow: hidden; flex: none;
  font-family: 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.idc-card * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.idc-abs { position: absolute; }
.idc-qr svg { display: block; width: 100%; height: 100%; }
.idc-mono { font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Courier New', monospace; }
.idc-field { border-bottom: 0.2mm solid #dfe8e3; padding-bottom: 1mm; margin-bottom: 2mm; }
.idc-label { font-size: 4.8pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #6b7a75; }
.idc-value { font-size: 7.6pt; font-weight: 700; color: #141a18; margin-top: 0.4mm; line-height: 1.15; overflow-wrap: anywhere; }
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

// White line-art globe with a cross rising from it (watermark on the front).
function GlobeCross() {
  return (
    <svg viewBox="-50 -72 100 124" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }}>
      <circle cx="0" cy="10" r="40" />
      <ellipse cx="0" cy="10" rx="14" ry="40" />
      <ellipse cx="0" cy="10" rx="28" ry="40" />
      <line x1="0" y1="-30" x2="0" y2="50" />
      <ellipse cx="0" cy="-10" rx="34.6" ry="5" />
      <line x1="-40" y1="10" x2="40" y2="10" />
      <ellipse cx="0" cy="30" rx="34.6" ry="5" />
      <path d="M0 -70 V-14 M-15 -55 H15" strokeWidth="5" />
    </svg>
  )
}

function ChurchName({ light = true, size = 1 }) {
  return (
    <div style={{ color: light ? '#fff' : '#0b3d22', lineHeight: 1.05 }}>
      <div style={{ fontSize: `${8.6 * size}pt`, fontWeight: 800, letterSpacing: '0.01em' }}>River of Life</div>
      <div style={{ fontSize: `${5 * size}pt`, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.85, marginTop: '0.5mm' }}>Christian Church</div>
    </div>
  )
}

export function IdCardFront({ data }) {
  const uid = useId().replace(/:/g, '')
  const name = String(data?.name || '').trim() || 'Member Name'
  const nameSize = name.length > 22 ? 10 : name.length > 16 ? 11.5 : 13
  return (
    <div className="idc-card" aria-label="ID card front">
      <svg className="idc-abs" viewBox="0 0 55 85" preserveAspectRatio="none" style={{ inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        <defs>
          <linearGradient id={`d${uid}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#34393a" />
            <stop offset="1" stopColor="#0d0f0f" />
          </linearGradient>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#16a34a" />
            <stop offset="1" stopColor="#065f2c" />
          </linearGradient>
        </defs>
        <rect width="55" height="85" fill={`url(#d${uid})`} />
        <polygon points="0,59.5 55,46.5 55,48.6 0,61.6" fill="#4ade80" opacity="0.85" />
        <polygon points="0,63.5 55,50.5 55,85 0,85" fill={`url(#g${uid})`} />
      </svg>

      <div className="idc-abs" style={{ right: '-11mm', top: '2.5mm', width: '40mm', height: '49.6mm', opacity: 0.22 }}>
        <GlobeCross />
      </div>

      <div className="idc-abs" style={{ left: '4.5mm', top: '5mm' }}>
        <ChurchName />
        <div style={{ width: '7mm', height: '0.7mm', background: '#22c55e', borderRadius: '1mm', marginTop: '1.6mm' }} />
      </div>

      <div className="idc-abs" style={{ left: '4.5mm', right: '4.5mm', top: '33mm' }}>
        <div style={{ fontSize: '4.8pt', fontWeight: 700, letterSpacing: '0.2em', color: '#86efac', textTransform: 'uppercase' }}>Member</div>
        <div style={{ fontSize: `${nameSize}pt`, fontWeight: 800, color: '#fff', lineHeight: 1.08, marginTop: '0.8mm', overflowWrap: 'anywhere' }}>{name}</div>
        {data?.memberSince ? (
          <div style={{ fontSize: '5.6pt', fontWeight: 600, letterSpacing: '0.22em', color: 'rgba(255,255,255,.72)', textTransform: 'uppercase', marginTop: '1.6mm' }}>
            Member since {data.memberSince}
          </div>
        ) : null}
      </div>

      <div className="idc-abs" style={{ left: '4.5mm', right: '4.5mm', bottom: '6mm', color: '#fff' }}>
        <div style={{ fontSize: '4.6pt', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.75 }}>Membership ID</div>
        <div className="idc-mono" style={{ fontSize: '8.4pt', fontWeight: 800, letterSpacing: '0.08em', marginTop: '0.8mm', whiteSpace: 'nowrap' }}>
          {String(data?.membershipNumber || '').trim() || '—'}
        </div>
      </div>
    </div>
  )
}

export function IdCardBack({ data, qrSvg }) {
  const uid = useId().replace(/:/g, '')
  const [signOk, setSignOk] = useState(true)
  const val = (v) => String(v ?? '').trim() || '—'
  return (
    <div className="idc-card" aria-label="ID card back">
      <svg className="idc-abs" viewBox="0 0 55 26" preserveAspectRatio="none" style={{ left: 0, top: 0, width: '55mm', height: '26mm' }} aria-hidden="true">
        <defs>
          <linearGradient id={`b${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#16a34a" />
            <stop offset="1" stopColor="#065f2c" />
          </linearGradient>
        </defs>
        <polygon points="0,0 55,0 55,21.5 0,25" fill={`url(#b${uid})`} />
      </svg>

      <div className="idc-abs" style={{ left: '4.5mm', top: '5.5mm', color: '#fff', width: '28mm' }}>
        <div style={{ fontSize: '9.5pt', fontWeight: 800, lineHeight: 1.05 }}>Membership<br />Details</div>
        <div style={{ fontSize: '4.6pt', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.8, marginTop: '1.6mm' }}>River of Life Christian Church</div>
      </div>

      <div className="idc-abs" style={{ right: '4mm', top: '3.5mm', width: '16mm', height: '16mm', background: '#fff', borderRadius: '1.2mm', padding: '1.1mm' }}>
        {qrSvg ? <div className="idc-qr" style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
      </div>

      <div className="idc-abs" style={{ left: '4.5mm', right: '4.5mm', top: '28.5mm' }}>
        <div className="idc-field"><div className="idc-label">Name</div><div className="idc-value">{val(data?.name)}</div></div>
        <div className="idc-field"><div className="idc-label">Emergency Contact</div><div className="idc-value">{val(data?.emergencyContact)}</div></div>
        <div className="idc-field"><div className="idc-label">Congregation</div><div className="idc-value">{val(data?.congregation)}</div></div>
        <div>
          <div className="idc-label">Authorised Signature</div>
          <div style={{ height: '8mm', marginTop: '0.4mm' }}>
            {signOk && <img src={SIGN_URL} alt="Authorised signature" onError={() => setSignOk(false)} style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />}
          </div>
        </div>
      </div>

      <div className="idc-abs" style={{ left: 0, right: 0, bottom: 0, height: '14.5mm', background: '#141716', color: '#fff', textAlign: 'center', padding: '2mm 3.5mm 0' }}>
        <div style={{ fontSize: '4.7pt', lineHeight: 1.3, opacity: 0.9 }}>{ADDRESS}</div>
        <div style={{ fontSize: '5.4pt', fontWeight: 700, color: '#4ade80', marginTop: '0.7mm', letterSpacing: '0.03em' }}>{CONTACT_LINE}</div>
        <div style={{ fontSize: '4.3pt', fontStyle: 'italic', opacity: 0.65, marginTop: '0.6mm' }}>{DISCLAIMER}</div>
      </div>
    </div>
  )
}

/**
 * Full-screen preview of the Membership ID card (front and back) with Print.
 * Print layout: A4 sheet (side by side, cut line) or PVC card (one card-size page
 * per side, for duplex card printers). Opened through utils/openMembershipIdCard.
 */
export default function MembershipIdCardPreview({ data, onClose }) {
  const [qrSvg, setQrSvg] = useState('')
  const [mode, setMode] = useState('sheet')

  useEffect(() => {
    let cancelled = false
    QRCode.toString(QR_URL, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0b2e1b', light: '#ffffff' } })
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
              className={`${btn} bg-[#0d5c46] text-white hover:bg-[#168a68]`}>
              <Printer size={14} aria-hidden="true" /> Print
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
            <p className="mt-6 text-center text-[11px] text-slate-500">
              {mode === 'pvc'
                ? 'PVC card: prints one 55 × 85 mm page per side (front, then back). Choose your card printer, set scale to 100% / Actual size, and turn on two-sided printing.'
                : 'A4 sheet: front and back print side by side at true size (55 × 85 mm) with a cut line. Set scale to 100% / Actual size and turn on Background graphics.'}
            </p>
          </div>
        </div>
      </div>

      {/* What actually prints (hidden on screen). */}
      <div className="idc-print">
        <IdCardFront data={data} />
        <IdCardBack data={data} qrSvg={qrSvg} />
      </div>
    </>
  )
}

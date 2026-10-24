import { useEffect, useRef, useState } from 'react'
import { Download, Printer, X } from 'lucide-react'
import { buildMembershipCertificatePdf, downloadMembershipCertificate } from '../../utils/membershipCertificate'

/**
 * Full-screen preview of a Certificate of Membership with a compact action bar:
 * Download PDF (one click, saves the exact PDF shown) and Print. The PDF is built
 * once; phones that can't show a PDF inline get a short note pointing at Download.
 * Opened through openMembershipCertificate (utils/openMembershipCertificate).
 */
export default function MembershipCertificatePreview({ data, onClose }) {
  const [bytes, setBytes] = useState(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const frameRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''
    buildMembershipCertificatePdf(data)
      .then((b) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }))
        setBytes(b)
        setUrl(objectUrl)
      })
      .catch((e) => { console.error('Membership certificate', e); if (!cancelled) setError('Could not create the certificate. Please try again.') })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [data])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const print = () => {
    try {
      frameRef.current.contentWindow.focus()
      frameRef.current.contentWindow.print()
    } catch {
      // Some browsers won't script the built-in PDF viewer — open it in a tab to print there.
      window.open(url, '_blank', 'noopener')
    }
  }

  const btn = 'inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-[950] flex flex-col bg-slate-900/70 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Certificate of Membership — ${data?.name || ''}`}
        onClick={(e) => e.stopPropagation()}
        className="m-2 sm:m-6 flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden bg-white shadow-2xl border border-slate-200"
      >
        {/* Action bar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-slate-200 bg-white shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">Certificate of Membership</p>
            <p className="text-xs text-slate-500 truncate">{data?.name}{data?.membershipNumber ? ` · ${data.membershipNumber}` : ''}</p>
          </div>
          <button type="button" onClick={print} disabled={!url}
            className={`${btn} bg-white text-slate-700 border border-slate-300 hover:bg-slate-50`}>
            <Printer size={14} aria-hidden="true" /> <span className="hidden sm:inline">Print</span>
          </button>
          <button type="button" onClick={() => downloadMembershipCertificate(data, bytes)} disabled={!bytes}
            className={`${btn} bg-[#0d5c46] text-white hover:bg-[#168a68]`}>
            <Download size={14} aria-hidden="true" /> Download PDF
          </button>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 bg-slate-100">
          {error ? (
            <p className="p-6 text-sm text-center text-red-600">{error}</p>
          ) : !url ? (
            <p className="p-6 text-sm text-center text-slate-500">Preparing certificate…</p>
          ) : (
            <div className="w-full h-full flex flex-col">
              <iframe ref={frameRef} src={`${url}#toolbar=0&view=Fit`} title="Certificate of Membership" className="w-full flex-1 min-h-0 border-0" />
              {/* Most phones have no inline PDF viewer. */}
              <p className="sm:hidden px-4 py-2 text-xs text-center text-slate-500 bg-white border-t border-slate-200">
                Certificate not showing? Tap <strong>Download PDF</strong> to open or print it.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

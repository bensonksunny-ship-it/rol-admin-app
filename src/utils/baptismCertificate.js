// Certificate of Baptism — fills the official template
// (public/assets/templates/Certificate_1 (1).pdf, 1000 × 1415 pt) with pdf-lib.
// The template keeps its own artwork (guilloche frame, cross-over-globe, printed
// labels, "Rev. Benson K Sunny / Sr. Pastor ROLCC"); only the blanks are written.
// Coordinates are PDF points from the bottom-left, measured off the template's
// blank lines — adjust FIELDS if the template file is ever replaced.
// pdf-lib is loaded on demand (it's large) — see buildBaptismCertificatesPdf.

const TEMPLATE_URL = encodeURI('/assets/templates/Certificate_1 (1).pdf')

// Each blank: centre x, baseline y, the line's usable width, preferred size.
const FIELDS = {
  name:       { cx: 500,   y: 735,   width: 640, size: 34, font: 'name' },
  parents:    { cx: 414.5, y: 672,   width: 262, size: 15, font: 'body' },
  birthplace: { cx: 686,   y: 672,   width: 118, size: 15, font: 'body' },
  date:       { cx: 275.5, y: 635.5, width: 126, size: 15, font: 'body' },
  officiant:  { cx: 495,   y: 597,   width: 430, size: 16, font: 'body' },
  regNo:      { cx: 494.5, y: 287,   width: 225, size: 15, font: 'bold' },
  issue:      { cx: 769.5, y: 277,   width: 150, size: 15, font: 'bold' },
}
// White patch over the template's grey "DD / MM / YYYY" placeholder.
const ISSUE_PLACEHOLDER_BOX = { x: 690, y: 268, width: 162, height: 27 }
// The template's printed "Son/Daughter of" label (left of the parents' line). With a
// known gender it is whited out and replaced by "Son of" / "Daughter of", right-
// aligned to end where the original did so it still leads into the blank line.
const RELATION_LABEL_BOX = { x: 120, y: 659, width: 158, height: 24 }
const RELATION_LABEL_END_X = 276
const RELATION_LABEL_Y = 666
const RELATION_LABEL_SIZE = 17.5

/** "Son of" / "Daughter of" from gender; '' keeps the template's own "Son/Daughter of". */
export function relationLabel(gender) {
  const g = String(gender || '').trim().toLowerCase()
  return g === 'male' ? 'Son of' : g === 'female' ? 'Daughter of' : ''
}

/** "Thomas Mathew & Mary Thomas" — father first, then mother; either may be blank. */
export function parentsLine(fatherName, motherName) {
  return [fatherName, motherName].map((s) => String(s || '').trim()).filter(Boolean).join(' & ')
}

const ddmmyyyy = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : (v instanceof Date ? v : null)
  if (!d || isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')} / ${String(d.getMonth() + 1).padStart(2, '0')} / ${d.getFullYear()}`
}
const longDate = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(v || '')
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

let templateBytes = null
async function loadTemplate() {
  if (!templateBytes) {
    const res = await fetch(TEMPLATE_URL)
    if (!res.ok) throw new Error('Certificate template not found')
    templateBytes = await res.arrayBuffer()
  }
  return templateBytes
}

/**
 * One certificate's data. Blank values leave the printed line empty for handwriting.
 * `gender` ('Male' | 'Female') picks "Son of" / "Daughter of".
 * @typedef {{ name: string, gender?: string, parents?: string, birthplace?: string, baptismDate?: string,
 *   officiant?: string, regNo?: string, issueDate?: string|Date }} BaptismCertificate
 */

// ── In-house guard ──────────────────────────────────────────────────────────
// Certificates are issued only for baptisms performed by River of Life Christian
// Church. The generator itself refuses anything else (the client-side equivalent
// of a 403), so no screen can bypass the check.
export const EXTERNAL_BAPTISM_ERROR = 'Forbidden: Certificates can only be issued for ROLCC in-house baptisms'

/** "River Of Life Christian Church" (any case/spacing), "ROLCC", "River of Life …". */
export function isRolccChurch(name) {
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return !!n && (n === 'rolcc' || /^river of life( christian church)?(,? bangalore)?$/.test(n))
}

/**
 * Was this baptism done by ROLCC? Baptised must be recorded, and either the church
 * is ROLCC or it came from a Caring Events baptism (batch / event id written there).
 * Returns { ok, reason: 'not_baptised' | 'external' | 'church_unknown', church }.
 */
export function baptismCertificateEligibility({ baptised, baptismChurch, baptismBatch, baptismEventId, isBaptisedInHouse } = {}) {
  const isBaptised = baptised === true || String(baptised || '').toLowerCase() === 'yes'
  if (!isBaptised) return { ok: false, reason: 'not_baptised', church: '' }
  if (isBaptisedInHouse === true || baptismEventId || baptismBatch || isRolccChurch(baptismChurch)) return { ok: true, reason: '', church: baptismChurch || '' }
  return { ok: false, reason: String(baptismChurch || '').trim() ? 'external' : 'church_unknown', church: String(baptismChurch || '').trim() }
}

/** Build a PDF with one filled certificate page per entry. Returns Uint8Array.
 *  Every entry must carry `inHouse: true` (see baptismCertificateEligibility). */
export async function buildBaptismCertificatesPdf(certs) {
  if (!certs.length || certs.some((c) => c.inHouse !== true)) throw new Error(EXTERNAL_BAPTISM_ERROR)
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const NAVY = rgb(0.055, 0.125, 0.27)
  const INK = rgb(0.12, 0.16, 0.24)
  const LABEL = rgb(0.37, 0.41, 0.48) // the template's grey label colour
  const template = await PDFDocument.load(await loadTemplate())
  const out = await PDFDocument.create()
  const fonts = {
    name: await out.embedFont(StandardFonts.TimesRomanBoldItalic),
    body: await out.embedFont(StandardFonts.TimesRoman),
    bold: await out.embedFont(StandardFonts.HelveticaBold),
    label: await out.embedFont(StandardFonts.Helvetica),
  }

  for (const c of certs) {
    const [page] = await out.copyPages(template, [0])
    out.addPage(page)
    const write = (key, text, color = INK) => {
      const value = String(text || '').trim()
      if (!value) return
      const f = FIELDS[key]
      const font = fonts[f.font]
      let size = f.size
      while (size > 8 && font.widthOfTextAtSize(value, size) > f.width) size -= 0.5
      const w = font.widthOfTextAtSize(value, size)
      page.drawText(value, { x: f.cx - w / 2, y: f.y, size, font, color })
    }
    write('name', c.name, NAVY)
    const relation = relationLabel(c.gender)
    if (relation) {
      page.drawRectangle({ ...RELATION_LABEL_BOX, color: rgb(1, 1, 1) })
      const lw = fonts.label.widthOfTextAtSize(relation, RELATION_LABEL_SIZE)
      page.drawText(relation, { x: RELATION_LABEL_END_X - lw, y: RELATION_LABEL_Y, size: RELATION_LABEL_SIZE, font: fonts.label, color: LABEL })
    }
    write('parents', c.parents)
    write('birthplace', c.birthplace)
    write('date', longDate(c.baptismDate))
    write('officiant', c.officiant)
    write('regNo', c.regNo, NAVY)
    page.drawRectangle({ ...ISSUE_PLACEHOLDER_BOX, color: rgb(1, 1, 1) })
    write('issue', ddmmyyyy(c.issueDate || new Date()) || ddmmyyyy(new Date()), NAVY)
  }
  out.setTitle(certs.length === 1 ? `Certificate of Baptism — ${certs[0].name}` : 'Certificates of Baptism')
  out.setAuthor('River of Life Christian Church')
  return out.save()
}

const safeName = (s) => String(s || 'Member').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Member'

/** Download as "<Name>_Baptism_Certificate.pdf" (or the given filename for a batch). */
export async function downloadBaptismCertificates(certs, filename) {
  const bytes = await buildBaptismCertificatesPdf(certs)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `${safeName(certs[0]?.name)}_Baptism_Certificate.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** Open the filled PDF in a hidden frame and send it to the printer. */
export async function printBaptismCertificates(certs) {
  const bytes = await buildBaptismCertificatesPdf(certs)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.src = url
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print() } catch { window.open(url, '_blank') }
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url) }, 60000)
  }
  document.body.appendChild(frame)
}

/** "BAP-2026-B3 / #05" from a batch code + serial number. */
export function baptismRegNo(batch, serial) {
  const s = serial ? `#${String(serial).padStart(2, '0')}` : ''
  return [batch, s].filter(Boolean).join(' / ')
}

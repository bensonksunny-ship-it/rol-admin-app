// Pastoral Appreciation & Closure Letter — an A4 PDF for a PCS person marked
// Relocated / Moved Out. Drawn with jsPDF text (not a screenshot) so it prints
// crisply; downloads as "<Member_Name>_Pastoral_Closure_Letter.pdf".
//
// The letter wording lives here — edit LETTER_* below to change it.
import { calculateTenure, formatShortDate } from './date'

const NAVY = [30, 58, 95]
const GOLD = [184, 134, 11]
const SLATE = [51, 65, 85]
const MUTED = [100, 116, 139]

const SCRIPTURE_TEXT =
  'Therefore, my beloved brethren, be steadfast, immovable, always abounding in the work of the Lord, knowing that your labor is not in vain in the Lord.'
const SCRIPTURE_REF = '1 Corinthians 15:58'

function letterParagraphs({ firstName, destination, tenure, ministryNames }) {
  const place = destination ? ` in ${destination}` : ''
  const service = ministryNames.length
    ? `Through your service in ${listJoin(ministryNames)}, you have helped build up the body of Christ, and many lives have been touched by your faithfulness.`
    : 'Your faithful presence in worship and fellowship has been an encouragement to many.'
  return [
    `Dear ${firstName},`,
    `It is with grateful hearts that we write to you as you begin a new season of life${place}. On behalf of the Senior Pastor and the Pastoral Team of River of Life Christian Church, we thank you for your fellowship, your service and your faithful engagement with our church family during your time with us in Bangalore${tenure ? `, over ${tenure}` : ''}.`,
    service,
    `Though you are moving on, you will always remain part of our church family. We release you with our love and our prayers, and we commit you to the Lord, who is able to keep you and to lead you into all that He has prepared. We encourage you to join a Bible-believing church where you are going, and you will always be welcome home at River of Life.`,
    'May the Lord bless you and keep you; may He make His face shine upon you and give you peace.',
  ]
}

function listJoin(items) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

async function loadLogo() {
  try {
    const res = await fetch('/icons/pwa-512.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch { return null }
}

/**
 * @param {object} p
 * @param {string} p.name           full name
 * @param {string} [p.destination]  "London, UK"
 * @param {string} [p.firstVisit]   ISO date of first visit
 * @param {string} [p.lastDate]     ISO last attendance (relocation) date
 * @param {string} [p.standing]
 * @param {Array<{ministry:string, role?:string, from?:any, to?:any}>} [p.ministries]
 * @param {Array<{cellName:string, since?:string, leftDate?:string}>} [p.cells]
 */
export async function downloadPastoralClosureLetter({ name, destination = '', firstVisit = '', lastDate = '', standing = '', ministries = [], cells = [] }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, H = 297, M = 22, CW = W - 2 * M
  let y = 18

  const ensure = (needed) => {
    if (y + needed <= H - 22) return
    doc.addPage()
    y = 22
  }
  const text = (str, x, opts = {}) => {
    const { size = 11, style = 'normal', color = SLATE, align = 'left', font = 'helvetica', width = CW, lineH } = opts
    doc.setFont(font, style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(String(str), width)
    const lh = lineH || size * 0.45
    ensure(lines.length * lh)
    doc.text(lines, x, y, { align })
    y += lines.length * lh
  }

  // ── Header ──────────────────────────────────────────────────────────────
  const logo = await loadLogo()
  if (logo) doc.addImage(logo, 'PNG', M, y - 4, 18, 18)
  const hx = logo ? M + 23 : M
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY)
  doc.text('River of Life Christian Church, Bangalore', hx, y + 3)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  doc.text('Office of the Senior Pastor · Pastoral Care (PCS)', hx, y + 9)
  const issued = formatShortDate(new Date())
  doc.text(`Issued: ${issued}`, W - M, y + 3, { align: 'right' })
  y += 18
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(M, y, W - M, y)
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.2); doc.line(M, y + 1.3, W - M, y + 1.3)
  y += 9

  // Member details
  text('Pastoral Appreciation & Closure Letter', M, { size: 17, style: 'bold', color: NAVY, font: 'times' })
  y += 2
  text(`To: ${name}`, M, { size: 11, style: 'bold' })
  if (destination) text(`Relocating to: ${destination}`, M, { size: 10, color: MUTED })
  y += 5

  // ── Scripture anchor ────────────────────────────────────────────────────
  doc.setFont('times', 'italic'); doc.setFontSize(12.5)
  const sLines = doc.splitTextToSize(`“${SCRIPTURE_TEXT}”`, CW - 20)
  const boxH = sLines.length * 5.8 + 14
  ensure(boxH + 4)
  doc.setFillColor(248, 245, 236); doc.setDrawColor(...GOLD); doc.setLineWidth(0.5)
  doc.roundedRect(M, y, CW, boxH, 2.5, 2.5, 'FD')
  doc.setTextColor(...NAVY)
  doc.text(sLines, W / 2, y + 9, { align: 'center' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...GOLD)
  doc.text(`— ${SCRIPTURE_REF}`, W / 2, y + 9 + sLines.length * 5.8 + 0.5, { align: 'center' })
  y += boxH + 9

  // ── Pastoral message ────────────────────────────────────────────────────
  const end = lastDate || null
  const tenure = firstVisit ? calculateTenure(firstVisit, end) : ''
  const ministryNames = [...new Set(ministries.map((m) => m.ministry).filter(Boolean))]
  const firstName = String(name).trim().split(/\s+/)[0] || name
  letterParagraphs({ firstName, destination, tenure, ministryNames }).forEach((p, i) => {
    text(p, M, { size: 11, font: 'times', lineH: 5.4, style: i === 4 ? 'italic' : 'normal' })
    y += 3.2
  })
  y += 2

  // ── Summary of service ──────────────────────────────────────────────────
  ensure(30)
  text('SUMMARY OF SERVICE & CONTRIBUTIONS', M, { size: 9, style: 'bold', color: NAVY })
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.4); doc.line(M, y - 1.5, W - M, y - 1.5)
  y += 4
  text(
    `First Joined: ${formatShortDate(firstVisit) || 'Not recorded'}  |  Relocated: ${formatShortDate(lastDate) || 'Not recorded'}${tenure ? `  (Total: ${tenure})` : ''}`,
    M, { size: 10.5, style: 'bold' })
  if (standing) text(`Standing: ${standing}`, M, { size: 10, color: MUTED })
  y += 2

  const rows = [
    ...ministries.map((m) => {
      const span = [formatShortDate(m.from), formatShortDate(m.to || lastDate)].filter(Boolean).join(' – ')
      const dur = m.from ? calculateTenure(m.from, m.to || lastDate || null) : ''
      return { label: `${m.ministry}${m.role ? ` · ${m.role}` : ''}`, detail: [dur, span && `(${span})`].filter(Boolean).join(' ') || 'Dates not recorded' }
    }),
    ...cells.map((c) => {
      const dur = c.since ? calculateTenure(c.since, c.leftDate || lastDate || null) : ''
      return { label: `Cell Group · ${c.cellName}`, detail: dur || 'Member' }
    }),
  ]
  if (!rows.length) text('No ministry roles were recorded.', M, { size: 10, color: MUTED })
  rows.forEach((r) => {
    ensure(7)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...SLATE)
    const labelLines = doc.splitTextToSize(r.label, CW * 0.52)
    doc.text(labelLines, M + 2, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED)
    doc.text(doc.splitTextToSize(r.detail, CW * 0.46), W - M, y, { align: 'right' })
    y += Math.max(labelLines.length, 1) * 4.6 + 1.6
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.line(M, y - 3, W - M, y - 3)
  })
  y += 6

  // ── Signature & seal ────────────────────────────────────────────────────
  ensure(42)
  text('With love and blessings in Christ,', M, { size: 11, font: 'times', style: 'italic' })
  y += 14
  doc.setDrawColor(...SLATE); doc.setLineWidth(0.3); doc.line(M, y, M + 70, y)
  y += 5
  text('Pr. Benson K Sunny', M, { size: 11.5, style: 'bold', color: NAVY })
  text('Senior Pastor, ROLCC', M, { size: 10, color: SLATE })
  text('on behalf of the Pastoral Team', M, { size: 9, color: MUTED })

  // Circular seal to the right of the signature
  const sx = W - M - 22, sy = y - 15
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.9); doc.circle(sx, sy, 17)
  doc.setLineWidth(0.3); doc.circle(sx, sy, 14.5)
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...GOLD)
  doc.setFontSize(7); doc.text('RIVER OF LIFE', sx, sy - 6, { align: 'center' })
  doc.setFontSize(11); doc.text('ROLCC', sx, sy + 1.5, { align: 'center' })
  doc.setFontSize(5.6); doc.text('BANGALORE · SEAL', sx, sy + 7, { align: 'center' })

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text('River of Life Christian Church, Bangalore · Pastoral Appreciation & Closure Letter', M, H - 12)
    doc.text(`${i} / ${pages}`, W - M, H - 12, { align: 'right' })
  }

  const safe = String(name || 'Member').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Member'
  doc.save(`${safe}_Pastoral_Closure_Letter.pdf`)
}

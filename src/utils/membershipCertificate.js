// Certificate of Membership — A4 landscape PDF drawn with pdf-lib (vector, prints
// sharp at any size). Details mirror the Membership ID card: name, membership no.,
// member-since year, congregation / service, emergency contact. The ROLCC
// cross-over-globe emblem is lifted from the official baptism certificate template
// (public/assets/templates/Certificate_1 (1).pdf) so it is the genuine mark.
// pdf-lib is imported on demand — it's large and only needed when generating.

const TEMPLATE_URL = encodeURI('/assets/templates/Certificate_1 (1).pdf')
// Emblem's box on that template page (PDF points, 1000 × 1415 page).
const EMBLEM_BOX = { left: 444, right: 556, bottom: 380, top: 509 }

export const CHURCH_ADDRESS = 'No. 49, AMR Plaza 3rd floor, 18th Main HSR Layout Sector 3, Bangalore 560102'
export const CHURCH_CONTACT = 'Helpline: 90367 45258  |  www.rolcc.in'

const hex = (rgb, h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)

let templateBytes = null
async function loadTemplate() {
  if (!templateBytes) {
    const res = await fetch(TEMPLATE_URL)
    templateBytes = res.ok ? await res.arrayBuffer() : null
  }
  return templateBytes
}

// Guilloche band: interlaced sine waves following a rectangle's edge.
function guillochePaths(x, y, w, h, { amp = 4, waves = 3, period = 18 } = {}) {
  const paths = []
  const edge = (x0, y0, x1, y1, phase) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len
    const nx = -uy, ny = ux
    const steps = Math.ceil(len / 2)
    let d = ''
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * len
      const off = amp * Math.sin((t / period) * 2 * Math.PI + phase)
      const px = x0 + ux * t + nx * off, py = y0 + uy * t + ny * off
      d += `${i ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)} `
    }
    return d
  }
  for (let k = 0; k < waves; k++) {
    const ph = (k * 2 * Math.PI) / waves
    paths.push(edge(x, y, x + w, y, ph), edge(x + w, y, x + w, y + h, ph), edge(x + w, y + h, x, y + h, ph), edge(x, y + h, x, y, ph))
  }
  return paths
}

/**
 * @typedef {{ name: string, membershipNumber?: string, memberSince?: string|number,
 *   congregation?: string, emergencyContact?: string, issueDate?: Date }} MembershipCertificate
 */
export async function buildMembershipCertificatePdf(c) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const DARK = hex(rgb, '#0d5c46'), TEAL = hex(rgb, '#168a68'), PALE = hex(rgb, '#f0f7f4')
  const INK = hex(rgb, '#1f2d2a'), MUTED = hex(rgb, '#5b6b66')
  const doc = await PDFDocument.create()
  const W = 842, H = 595
  const page = doc.addPage([W, H])
  const font = {
    serifBoldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  }

  // ── Frame: pale field, double rule, guilloche band between ───────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) })
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: DARK, borderWidth: 2.2 })
  guillochePaths(30, 30, W - 60, H - 60, { amp: 4.2, waves: 4, period: 16 }).forEach((d, i) =>
    page.drawSvgPath(d, { x: 0, y: H, borderColor: i % 2 ? TEAL : DARK, borderWidth: 0.45, borderOpacity: 0.85 }))
  page.drawRectangle({ x: 42, y: 42, width: W - 84, height: H - 84, color: PALE, borderColor: DARK, borderWidth: 1.2 })
  page.drawRectangle({ x: 47, y: 47, width: W - 94, height: H - 94, borderColor: TEAL, borderWidth: 0.6 })

  const center = (text, y, size, f, color, spacing = 0) => {
    if (!spacing) {
      const w = f.widthOfTextAtSize(text, size)
      page.drawText(text, { x: (W - w) / 2, y, size, font: f, color })
      return
    }
    const chars = [...text]
    const total = chars.reduce((s, ch) => s + f.widthOfTextAtSize(ch, size), 0) + spacing * (chars.length - 1)
    let x = (W - total) / 2
    chars.forEach((ch) => { page.drawText(ch, { x, y, size, font: f, color }); x += f.widthOfTextAtSize(ch, size) + spacing })
  }
  const fit = (text, max, size, f) => { let s = size; while (s > 9 && f.widthOfTextAtSize(text, s) > max) s -= 0.5; return s }

  // ── Header: emblem + church name ─────────────────────────────────────────
  let y = H - 70
  const tpl = await loadTemplate()
  if (tpl) {
    try {
      const src = await PDFDocument.load(tpl)
      const emblem = await doc.embedPage(src.getPages()[0], EMBLEM_BOX)
      const eh = 62, ew = eh * (EMBLEM_BOX.right - EMBLEM_BOX.left) / (EMBLEM_BOX.top - EMBLEM_BOX.bottom)
      // White badge with a teal rule — the emblem is cut from a white template page.
      page.drawRectangle({ x: (W - ew) / 2 - 5, y: y - eh + 3, width: ew + 10, height: eh + 10, color: rgb(1, 1, 1), borderColor: TEAL, borderWidth: 0.8 })
      page.drawPage(emblem, { x: (W - ew) / 2, y: y - eh + 8, width: ew, height: eh })
      y -= eh + 16
    } catch { /* emblem is decorative — carry on without it */ }
  }
  center('RIVER OF LIFE CHRISTIAN CHURCH', y, 12.5, font.sansBold, DARK, 3.2)
  y -= 15
  center('BANGALORE', y, 8.5, font.sans, TEAL, 2.6)

  // ── Title + statement ────────────────────────────────────────────────────
  y -= 46
  center('Certificate of Membership', y, 38, font.serifBoldItalic, DARK)
  y -= 30
  center('THIS IS TO CERTIFY THAT', y, 9.5, font.sans, MUTED, 2)
  y -= 38
  const name = String(c.name || '').trim()
  const nameSize = fit(name, 520, 30, font.serifBoldItalic)
  center(name, y, nameSize, font.serifBoldItalic, INK)
  page.drawLine({ start: { x: 200, y: y - 8 }, end: { x: W - 200, y: y - 8 }, thickness: 0.7, color: TEAL })
  y -= 30
  center('is a registered member of River of Life Christian Church, Bangalore, received into its fellowship', y, 12, font.serifItalic, INK)
  y -= 16
  center('and committed to walk in faith, love and service with this church family.', y, 12, font.serifItalic, INK)

  // ── ID-card details: four boxes ──────────────────────────────────────────
  y -= 52
  const details = [
    ['MEMBERSHIP NO.', c.membershipNumber],
    ['MEMBER SINCE', c.memberSince ? String(c.memberSince) : ''],
    ['CONGREGATION / SERVICE', c.congregation],
    ['EMERGENCY CONTACT', c.emergencyContact],
  ]
  const boxW = 160, gap = 12, startX = (W - (boxW * 4 + gap * 3)) / 2
  details.forEach(([label, value], i) => {
    const bx = startX + i * (boxW + gap)
    page.drawRectangle({ x: bx, y, width: boxW, height: 40, color: rgb(1, 1, 1), borderColor: TEAL, borderWidth: 0.8 })
    page.drawRectangle({ x: bx, y: y + 37, width: boxW, height: 3, color: TEAL })
    const lw = font.sans.widthOfTextAtSize(label, 7)
    page.drawText(label, { x: bx + (boxW - lw) / 2, y: y + 25, size: 7, font: font.sans, color: MUTED })
    const v = String(value || '').trim() || '—'
    const vs = fit(v, boxW - 12, 12.5, font.sansBold)
    const vw = font.sansBold.widthOfTextAtSize(v, vs)
    page.drawText(v, { x: bx + (boxW - vw) / 2, y: y + 9, size: vs, font: font.sansBold, color: v === '—' ? MUTED : DARK })
  })

  // ── Signatures + seal ────────────────────────────────────────────────────
  const sigY = 150
  const sig = (cx, l1, l2) => {
    page.drawLine({ start: { x: cx - 95, y: sigY }, end: { x: cx + 95, y: sigY }, thickness: 0.8, color: INK })
    const w1 = font.sansBold.widthOfTextAtSize(l1, 10.5)
    page.drawText(l1, { x: cx - w1 / 2, y: sigY - 15, size: 10.5, font: font.sansBold, color: DARK })
    const w2 = font.sans.widthOfTextAtSize(l2, 9)
    page.drawText(l2, { x: cx - w2 / 2, y: sigY - 27, size: 9, font: font.sans, color: MUTED })
  }
  sig(200, 'Authorised Signature', 'Church Administrator')
  sig(W - 200, 'Rev. Benson K. Sunny', 'Senior Pastor')
  // 100 pt dashed seal circle
  const sealCy = sigY + 8
  page.drawEllipse({ x: W / 2, y: sealCy, xScale: 50, yScale: 50, borderColor: TEAL, borderWidth: 1, borderDashArray: [4, 3] })
  ;['Affix Official', 'Church Seal Here'].forEach((t, i) => {
    const tw = font.sans.widthOfTextAtSize(t, 7.5)
    page.drawText(t, { x: W / 2 - tw / 2, y: sealCy + 2 - i * 10, size: 7.5, font: font.sans, color: MUTED })
  })

  // ── Footer: issue date, address, helpline ────────────────────────────────
  const issued = (c.issueDate || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  center(`Issued on ${issued}`, 76, 8.5, font.sans, MUTED)
  center(CHURCH_ADDRESS, 64, 8, font.sans, DARK)
  center(CHURCH_CONTACT, 54, 8, font.sansBold, TEAL)

  doc.setTitle(`Certificate of Membership — ${name}`)
  doc.setAuthor('River of Life Christian Church')
  return doc.save()
}

/** Download as "<Name>_Membership_Certificate.pdf". */
export async function downloadMembershipCertificate(c) {
  const bytes = await buildMembershipCertificatePdf(c)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${String(c.name || 'Member').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Member'}_Membership_Certificate.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/**
 * Certificate data from the PCS profile + their membership application.
 * Member Since = year the application was approved; emergency contact from the
 * application. Missing values print as "—".
 */
export function membershipCertificateData({ name, membershipNumber, serviceAttended }, app) {
  const v = (k) => String(app?.applicant?.[k] || app?.prefill?.[k] || '').trim()
  const decided = app?.status === 'approved' && app.decidedAt ? new Date(app.decidedAt) : null
  return {
    name: String(name || '').trim(),
    membershipNumber: String(membershipNumber || '').trim(),
    memberSince: decided && !isNaN(decided.getTime()) ? decided.getFullYear() : '',
    congregation: String(serviceAttended || '').trim(),
    emergencyContact: v('emergencyPhone'),
  }
}

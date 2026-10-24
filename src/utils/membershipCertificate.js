// Certificate of Membership — A4 landscape PDF drawn with pdf-lib (vector, prints
// sharp at any size). Contemporary layout: a fine rounded frame with accent lines,
// sans-serif headings with serif name / dates / signatures, badge-style member no.
// and tags, and a drawn church seal between the two signature blocks. Details
// mirror the Membership ID card: name, membership no., member-since year,
// congregation / service, emergency contact. The ROLCC cross-over-globe emblem is
// lifted from the official baptism certificate template
// (public/assets/templates/Certificate_1 (1).pdf) so it is the genuine mark.
// pdf-lib is imported on demand — it's large and only needed when generating.

const TEMPLATE_URL = encodeURI('/assets/templates/Certificate_1 (1).pdf')
// Emblem's box on that template page (PDF points, 1000 × 1415 page).
const EMBLEM_BOX = { left: 444, right: 556, bottom: 380, top: 509 }

export const CHURCH_ADDRESS = 'No. 49, AMR Plaza 3rd floor, 18th Main HSR Layout Sector 3, Bangalore 560102'
export const CHURCH_CONTACT = 'Helpline: 90367 45258  |  www.rolcc.in'

const hex = (rgb, h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)

// Senior Pastor's signature and the church's rubber-stamp seal, cleaned from photos
// (src/assets/sign.jpg, seal.jpg) into transparent PNGs so no paper shows.
const SIGN_URL = '/assets/certificate/sign.png'
const SEAL_URL = '/assets/certificate/seal.png'

const fetched = {}
async function loadBytes(url) {
  if (!(url in fetched)) {
    try {
      const res = await fetch(url)
      fetched[url] = res.ok ? await res.arrayBuffer() : null
    } catch { fetched[url] = null }
  }
  return fetched[url]
}
const loadTemplate = () => loadBytes(TEMPLATE_URL)

async function embedPng(doc, url) {
  const bytes = await loadBytes(url)
  if (!bytes) return null
  try { return await doc.embedPng(bytes) } catch { return null }
}

/**
 * @typedef {{ name: string, membershipNumber?: string, memberSince?: string|number,
 *   congregation?: string, emergencyContact?: string, departments?: string[],
 *   issueDate?: Date }} MembershipCertificate
 */
export async function buildMembershipCertificatePdf(c) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
  const DARK = hex(rgb, '#0d5c46'), TEAL = hex(rgb, '#168a68'), MINT = hex(rgb, '#e6f2ee')
  const GOLD = hex(rgb, '#b8893b'), INK = hex(rgb, '#1f2d2a'), MUTED = hex(rgb, '#6b7a75'), LINE = hex(rgb, '#d5e2dd')
  const WHITE = rgb(1, 1, 1)
  const doc = await PDFDocument.create()
  const W = 842, H = 595 // A4 landscape
  const page = doc.addPage([W, H])
  const font = {
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    serifBoldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  }

  const widthOf = (t, size, f, spacing = 0) => f.widthOfTextAtSize(t, size) + spacing * Math.max(0, [...t].length - 1)
  const text = (t, x, y, size, f, color, spacing = 0) => {
    if (!spacing) { page.drawText(t, { x, y, size, font: f, color }); return }
    let cx = x
    ;[...t].forEach((ch) => { page.drawText(ch, { x: cx, y, size, font: f, color }); cx += f.widthOfTextAtSize(ch, size) + spacing })
  }
  const center = (t, y, size, f, color, spacing = 0, cx = W / 2) => text(t, cx - widthOf(t, size, f, spacing) / 2, y, size, f, color, spacing)
  const fit = (t, max, size, f) => { let s = size; while (s > 9 && f.widthOfTextAtSize(t, s) > max) s -= 0.5; return s }
  // Rounded rectangle; x/y is the bottom-left corner in PDF points (the SVG path
  // itself is y-down from the top edge, as pdf-lib expects).
  const roundRect = (x, y, w, h, r, opts) => {
    const top = H - (y + h)
    const d = `M${x + r},${top} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${top + r} V${top + h - r} A${r},${r} 0 0 1 ${x + w - r},${top + h} H${x + r} A${r},${r} 0 0 1 ${x},${top + h - r} V${top + r} A${r},${r} 0 0 1 ${x + r},${top} Z`
    page.drawSvgPath(d, { x: 0, y: H, ...opts })
  }
  // Pill badge with its bottom-left corner at x/y.
  const pill = (label, x, y, { size = 8.5, fill = MINT, color = DARK, f = font.sansBold, spacing = 0.6, h = 18, padX = 10 } = {}) => {
    const w = widthOf(label, size, f, spacing) + padX * 2
    roundRect(x, y, w, h, h / 2, { color: fill })
    text(label, x + padX, y + (h - size * 0.72) / 2, size, f, color, spacing)
    return w
  }

  // ── Frame: one fine rounded rule with short accent lines at two corners ──
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: WHITE })
  const M = 26
  roundRect(M, M, W - 2 * M, H - 2 * M, 16, { borderColor: LINE, borderWidth: 1 })
  page.drawRectangle({ x: M + 30, y: H - M - 1.5, width: 110, height: 3, color: TEAL })
  page.drawRectangle({ x: M + 144, y: H - M - 1.5, width: 22, height: 3, color: GOLD })
  page.drawRectangle({ x: W - M - 140, y: M - 1.5, width: 110, height: 3, color: TEAL })
  page.drawRectangle({ x: W - M - 166, y: M - 1.5, width: 22, height: 3, color: GOLD })

  // ── Header: emblem + church name on the left, membership no. badge right ─
  const PAD = M + 34
  const headTop = H - M - 30
  let emblem = null
  const tpl = await loadTemplate()
  if (tpl) {
    try {
      const src = await PDFDocument.load(tpl)
      emblem = await doc.embedPage(src.getPages()[0], EMBLEM_BOX)
    } catch { /* emblem is decorative — carry on without it */ }
  }
  const emblemW = (h) => h * (EMBLEM_BOX.right - EMBLEM_BOX.left) / (EMBLEM_BOX.top - EMBLEM_BOX.bottom)
  let tx = PAD
  if (emblem) {
    const eh = 44, ew = emblemW(eh)
    page.drawPage(emblem, { x: PAD, y: headTop - eh, width: ew, height: eh })
    tx = PAD + ew + 12
    page.drawLine({ start: { x: tx, y: headTop - 4 }, end: { x: tx, y: headTop - eh + 4 }, thickness: 0.8, color: LINE })
    tx += 12
  }
  text('RIVER OF LIFE CHRISTIAN CHURCH', tx, headTop - 20, 12, font.sansBold, DARK, 1.6)
  text('BANGALORE  ·  MEMBERSHIP REGISTRY', tx, headTop - 34, 7.5, font.sans, MUTED, 1.4)

  const memNo = String(c.membershipNumber || '').trim()
  const badgeLabel = `MEMBER NO.  ${memNo || '—'}`
  const bw = widthOf(badgeLabel, 9, font.sansBold, 0.8) + 28
  pill(badgeLabel, W - PAD - bw, headTop - 32, { size: 9, fill: DARK, color: WHITE, spacing: 0.8, h: 24, padX: 14 })

  // ── Title + name ─────────────────────────────────────────────────────────
  let y = H - 168
  center('CERTIFICATE OF MEMBERSHIP', y, 11, font.sansBold, TEAL, 4)
  y -= 34
  center('This certifies that', y, 11, font.sans, MUTED)
  y -= 50
  const name = String(c.name || '').trim()
  center(name, y, fit(name, 560, 42, font.serifBoldItalic), font.serifBoldItalic, INK)
  y -= 18
  page.drawRectangle({ x: W / 2 - 34, y, width: 50, height: 2.2, color: TEAL })
  page.drawRectangle({ x: W / 2 + 20, y, width: 14, height: 2.2, color: GOLD })
  y -= 28
  center('has been received into the fellowship of River of Life Christian Church, Bangalore,', y, 10.5, font.sans, INK)
  y -= 15
  center('and is committed to walk in faith, love and service with this church family.', y, 10.5, font.sans, INK)

  // ── Tags: congregation / service and any departments ─────────────────────
  const tags = [c.congregation, ...(Array.isArray(c.departments) ? c.departments : [])]
    .map((t) => String(t || '').trim().toUpperCase()).filter(Boolean).slice(0, 5)
  y -= 34
  if (tags.length) {
    const gap = 8
    const widths = tags.map((t) => widthOf(t, 7.5, font.sansBold, 0.8) + 20)
    let px = (W - (widths.reduce((s, w) => s + w, 0) + gap * (tags.length - 1))) / 2
    tags.forEach((t, i) => { pill(t, px, y, { size: 7.5, h: 17, spacing: 0.8 }); px += widths[i] + gap })
  }

  // ── Metadata: three columns split by hairlines ───────────────────────────
  const issued = (c.issueDate || new Date()).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  const meta = [
    ['MEMBER SINCE', c.memberSince ? String(c.memberSince) : '—', font.serif],
    ['DATE OF ISSUE', issued, font.serif],
    ['EMERGENCY CONTACT', String(c.emergencyContact || '').trim() || '—', font.sans],
  ]
  y -= 50
  const colW = 170, metaX = (W - colW * 3) / 2
  meta.forEach(([label, value, f], i) => {
    const cx = metaX + colW * i + colW / 2
    center(label, y + 20, 7, font.sansBold, MUTED, 1.4, cx)
    center(value, y, fit(value, colW - 16, 14, f), f, value === '—' ? MUTED : INK, 0, cx)
    if (i) page.drawLine({ start: { x: metaX + colW * i, y: y - 4 }, end: { x: metaX + colW * i, y: y + 28 }, thickness: 0.7, color: LINE })
  })

  // ── Footer: signature blocks either side of the digital church seal ──────
  const sigY = 104
  const sig = (cx, signer, role) => {
    page.drawLine({ start: { x: cx - 100, y: sigY }, end: { x: cx + 100, y: sigY }, thickness: 0.7, color: INK })
    center(signer, sigY - 17, 13, font.serifItalic, INK, 0, cx)
    center(role, sigY - 30, 7, font.sansBold, MUTED, 1.4, cx)
  }
  sig(PAD + 120, 'Church Administrator', 'AUTHORISED SIGNATORY')
  sig(W - PAD - 120, 'Rev. Benson K. Sunny', 'SENIOR PASTOR  ·  OFFICIATING')

  // Senior Pastor's signature, resting on his line.
  const signImg = await embedPng(doc, SIGN_URL)
  if (signImg) {
    const h = 74, w = (signImg.width / signImg.height) * h
    page.drawImage(signImg, { x: W - PAD - 120 - w / 2, y: sigY - 3, width: w, height: h })
  }

  // Seal: the church's stamp; a drawn seal stands in if the image can't load.
  const sx = W / 2, sy = sigY - 2, R = 46
  const sealImg = await embedPng(doc, SEAL_URL)
  if (sealImg) {
    const h = 104, w = (sealImg.width / sealImg.height) * h
    page.drawImage(sealImg, { x: sx - w / 2, y: sy - h / 2, width: w, height: h, opacity: 0.92 })
  } else {
    drawnSeal()
  }

  function drawnSeal() {
    page.drawEllipse({ x: sx, y: sy, xScale: R, yScale: R, color: WHITE, borderColor: DARK, borderWidth: 1.6 })
    page.drawEllipse({ x: sx, y: sy, xScale: R - 13, yScale: R - 13, borderColor: TEAL, borderWidth: 0.6 })
    const ring = 'RIVER OF LIFE CHRISTIAN CHURCH  •  BANGALORE  •  '
    const rr = R - 9.5, rs = 6.2
    // Spread the glyphs evenly so the text closes the full circle.
    const stretch = (2 * Math.PI * rr) / widthOf(ring, rs, font.sansBold)
    let arc = 0
    ;[...ring].forEach((ch) => {
      const gw = font.sansBold.widthOfTextAtSize(ch, rs)
      const mid = (arc + (gw * stretch) / 2) / rr // angle clockwise from the top
      const gx = sx + rr * Math.sin(mid), gy = sy + rr * Math.cos(mid)
      // Glyph origin = its centre on the ring, moved back half a glyph along the
      // tangent and down a little towards the centre so the letters sit on the ring.
      page.drawText(ch, {
        x: gx - (gw / 2) * Math.cos(mid) - rs * 0.35 * Math.sin(mid),
        y: gy + (gw / 2) * Math.sin(mid) - rs * 0.35 * Math.cos(mid),
        size: rs, font: font.sansBold, color: DARK, rotate: degrees((-mid * 180) / Math.PI),
      })
      arc += gw * stretch
    })
    if (emblem) {
      const sh = 34, sw = emblemW(sh)
      page.drawPage(emblem, { x: sx - sw / 2, y: sy - sh / 2, width: sw, height: sh })
    } else {
      center('ROLCC', sy - 4, 11, font.sansBold, DARK, 1.5, sx)
    }
  }

  // ── Address strip ────────────────────────────────────────────────────────
  center(`${CHURCH_ADDRESS}   |   ${CHURCH_CONTACT}`, M + 14, 7, font.sans, MUTED)

  doc.setTitle(`Certificate of Membership — ${name}`)
  doc.setAuthor('River of Life Christian Church')
  return doc.save()
}

/** "<Name>_Membership_Certificate.pdf" */
export function membershipCertificateFileName(c) {
  return `${String(c.name || 'Member').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Member'}_Membership_Certificate.pdf`
}

/** Download as "<Name>_Membership_Certificate.pdf" — pass `bytes` if already built. */
export async function downloadMembershipCertificate(c, bytes = null) {
  const data = bytes || await buildMembershipCertificatePdf(c)
  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = membershipCertificateFileName(c)
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

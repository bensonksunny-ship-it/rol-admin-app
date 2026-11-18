import { format, parseISO, isValid } from 'date-fns'
import { kindOf, statusOf, sortItems, tripDays, fullDate, formatTime, isFoodItem, ratingSummary } from './missionTrip'

/**
 * Mission Trip → "Travel Diary" PDF: a keepsake journal of the trip — header, then
 * day by day every schedule item (time, title, status, place, transport, notes) with
 * its photos side by side underneath. Built straight with jsPDF (no html2canvas, so
 * Tailwind's oklch colours can't break it).
 *
 * Photos are fetched from Firebase Storage. A plain cross-origin fetch needs CORS on
 * the bucket, so we first go through the same-origin /fbstorage proxy (vercel.json
 * rewrite in production, vite.config.js proxy in dev), then fall back to a direct fetch.
 */

const STORAGE_HOST = 'https://firebasestorage.googleapis.com'

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

const imageSize = (dataUrl) => new Promise((resolve) => {
  const img = new Image()
  img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
  img.onerror = () => resolve(null)
  img.src = dataUrl
})

async function fetchImage(url) {
  const tries = []
  if (url.startsWith(STORAGE_HOST)) tries.push(`/fbstorage${url.slice(STORAGE_HOST.length)}`)
  tries.push(url)
  for (const u of tries) {
    try {
      const res = await fetch(u)
      if (!res.ok) continue
      const blob = await res.blob()
      if (!String(blob.type).startsWith('image/')) continue // e.g. SPA index.html where no proxy exists
      const dataUrl = await blobToDataUrl(blob)
      const size = await imageSize(dataUrl)
      if (size) return { dataUrl, ...size, fmt: blob.type.includes('png') ? 'PNG' : 'JPEG' }
    } catch { /* try the next route */ }
  }
  return null
}

// jsPDF's built-in fonts are WinAnsi only — drop emoji / other symbols that would garble.
const PDF_EXTRA = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026])
const pdfSafe = (cp) => cp === 9 || cp === 10 || cp === 13 || (cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF) || PDF_EXTRA.has(cp)
const clean = (v) => Array.from(String(v ?? '')).filter((ch) => pdfSafe(ch.codePointAt(0))).join('').trim()

const longDay = (iso) => {
  const d = iso ? parseISO(iso) : null
  return d && isValid(d) ? format(d, 'EEEE, d MMMM yyyy') : 'Date to be fixed'
}

// Colours (RGB) — kept in step with the on-screen kind tints.
const KIND_RGB = {
  meeting: [79, 70, 229], meal: [245, 158, 11], travel: [2, 132, 199],
  visit: [5, 150, 105], rest: [244, 63, 94], other: [71, 85, 105],
}
const STATUS_RGB = { confirmed: [4, 120, 87], tentative: [180, 83, 9], suggest: [67, 56, 202] }

/**
 * Builds and downloads the PDF. `onProgress(text)` reports photo loading.
 * Returns { photos, missing } so the caller can warn if some photos could not be added.
 */
export async function downloadTravelDiary(trip, { onProgress, guests = [] } = {}) {
  const [{ jsPDF }] = await Promise.all([import('jspdf')])
  const items = sortItems(trip.items)
  const days = tripDays(trip.startDate, trip.endDate)
  const groups = days.map((d) => ({ key: d, label: longDay(d), list: items.filter((i) => i.date === d) })).filter((g) => g.list.length)
  const undated = items.filter((i) => !i.date || !days.includes(i.date))
  if (undated.length) groups.push({ key: 'undated', label: 'Date to be fixed', list: undated })

  // Load every photo up front.
  const allPhotos = items.flatMap((i) => i.photos || [])
  const loaded = new Map()
  let done = 0
  await Promise.all(allPhotos.map(async (ph) => {
    loaded.set(ph.id, await fetchImage(ph.url))
    done += 1
    onProgress?.(`Loading photos ${done}/${allPhotos.length}…`)
  }))
  onProgress?.('Building PDF…')

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 16
  const CW = W - M * 2
  const BOTTOM = H - 16
  let y = M

  const newPage = () => { pdf.addPage(); y = M }
  const ensure = (h) => { if (y + h > BOTTOM) newPage() }
  const text = (str, x, yy, opts = {}) => {
    const { size = 10, style = 'normal', color = [30, 41, 59], align } = opts
    pdf.setFont('helvetica', style); pdf.setFontSize(size); pdf.setTextColor(...color)
    pdf.text(str, x, yy, align ? { align } : undefined)
  }
  const wrap = (str, width, size = 10, style = 'normal') => {
    pdf.setFont('helvetica', style); pdf.setFontSize(size)
    return pdf.splitTextToSize(clean(str), width)
  }

  // ── Cover header ──
  pdf.setFillColor(49, 46, 129)
  pdf.rect(0, 0, W, 54, 'F')
  pdf.setFillColor(79, 70, 229)
  pdf.rect(0, 50, W, 4, 'F')
  text('TRAVEL DIARY', M, 16, { size: 10, style: 'bold', color: [199, 210, 254] })
  const titleLines = wrap(trip.title || 'Mission Trip', CW, 22, 'bold').slice(0, 2)
  text(titleLines, M, 27, { size: 22, style: 'bold', color: [255, 255, 255] })
  const sub = [trip.teamName, trip.origin && `from ${trip.origin}`].filter(Boolean).map(clean).join('  ·  ')
  const dates = trip.startDate ? `${fullDate(trip.startDate)}${trip.endDate && trip.endDate !== trip.startDate ? ` – ${fullDate(trip.endDate)}` : ''}` : ''
  const subY = 27 + titleLines.length * 8.5
  if (sub) text(sub, M, subY, { size: 11, color: [224, 231, 255] })
  if (dates) text(dates, M, subY + (sub ? 6 : 0), { size: 11, style: 'bold', color: [224, 231, 255] })
  y = 64
  if (trip.stayName || trip.stayAddress) {
    const stay = [trip.stayName, trip.stayAddress].filter(Boolean).map(clean).join(', ')
    const lines = wrap(`Stay: ${stay}`, CW, 10)
    text(lines, M, y, { size: 10, color: [71, 85, 105] })
    y += lines.length * 4.6 + 4
  }
  text('River Of Life Church, Bangalore', M, y, { size: 9, style: 'italic', color: [148, 163, 184] })
  y += 10

  if (!groups.length) text('No schedule items yet.', M, y, { size: 11, color: [100, 116, 139] })

  for (const g of groups) {
    // Day heading (kept with at least the first item's top).
    ensure(30)
    pdf.setFillColor(238, 242, 255)
    pdf.roundedRect(M, y, CW, 10, 2, 2, 'F')
    text(g.label.toUpperCase(), M + 4, y + 6.7, { size: 10.5, style: 'bold', color: [55, 48, 163] })
    text(`${g.list.length} ${g.list.length === 1 ? 'event' : 'events'}`, M + CW - 4, y + 6.7, { size: 9, color: [99, 102, 241], align: 'right' })
    y += 15

    for (const it of g.list) {
      const k = kindOf(it.kind)
      const s = statusOf(it.status)
      const accent = KIND_RGB[it.kind] || KIND_RGB.other
      const TX = M + 30 // text column after the time badge
      const TW = CW - 30 - 3

      const titleL = wrap(it.title || k.label, TW, 11.5, 'bold')
      const transport = it.kind === 'travel' ? [it.vehicle, it.driver && `Driver: ${it.driver}`, it.driverPhone].filter(Boolean).join(' · ') : ''
      const meta = [it.location && `Location: ${it.location}`, transport && `Transport: ${transport}`].filter(Boolean)
      const metaL = meta.flatMap((m) => wrap(m, TW, 9.5))
      const notesL = it.notes ? wrap(it.notes, TW, 9.5, 'italic') : []
      // Food rating (meals): average line + the team's dish notes.
      const rs = isFoodItem(it) ? ratingSummary(guests, it.id) : null
      const rateHead = rs?.count ? `Food rating: ${rs.avg.toFixed(1)} / 5  (${rs.count} ${rs.count === 1 ? 'rating' : 'ratings'})` : ''
      const rateL = rs?.count ? rs.entries.filter((e) => e.comment).flatMap((e) => wrap(`“${e.comment}” — ${e.name}, ${e.stars}/5`, TW - 4, 8.5, 'italic')) : []
      const rateH = rs?.count ? 7.5 + rateL.length * 3.9 + 1.5 : 0

      const photos = (it.photos || []).map((ph) => loaded.get(ph.id)).filter(Boolean)
      const missing = (it.photos || []).length - photos.length
      const gap = 4
      const boxW = photos.length === 1 ? CW * 0.62 : (CW - gap) / 2
      const boxH = 62
      const fitted = photos.map((p) => { const r = Math.min(boxW / p.w, boxH / p.h); return { ...p, dw: p.w * r, dh: p.h * r } })
      const photoH = fitted.length ? Math.max(...fitted.map((p) => p.dh)) + 4 : 0

      const textH = 6 + titleL.length * 5 + 5 + metaL.length * 4.3 + (notesL.length ? notesL.length * 4.3 + 1 : 0) + rateH + (missing > 0 ? 4.5 : 0)
      const blockH = Math.max(textH, 16) + photoH + 4
      ensure(Math.min(blockH, BOTTOM - M))

      const top = y
      // Card
      pdf.setDrawColor(226, 232, 240); pdf.setFillColor(255, 255, 255)
      pdf.roundedRect(M, top, CW, blockH, 2.5, 2.5, 'FD')
      pdf.setFillColor(...accent)
      pdf.rect(M, top + 2, 1.4, blockH - 4, 'F')
      // Time badge
      pdf.setFillColor(...(it.time ? accent : [203, 213, 225]))
      pdf.roundedRect(M + 4, top + 4, 22, it.endTime ? 12 : 8, 1.8, 1.8, 'F')
      text(it.time ? formatTime(it.time) : 'TBD', M + 15, top + 9.2, { size: 9, style: 'bold', color: [255, 255, 255], align: 'center' })
      if (it.endTime) text(`to ${formatTime(it.endTime)}`, M + 15, top + 13.6, { size: 7, color: [255, 255, 255], align: 'center' })

      let ty = top + 8.5
      text(titleL, TX, ty, { size: 11.5, style: 'bold', color: [15, 23, 42] })
      ty += titleL.length * 5
      text(`${clean(k.label)}  ·  `, TX, ty, { size: 8.5, color: [100, 116, 139] })
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5)
      const kw = pdf.getTextWidth(`${clean(k.label)}  ·  `)
      text(s.label, TX + kw, ty, { size: 8.5, style: 'bold', color: STATUS_RGB[it.status] || STATUS_RGB.confirmed })
      ty += 5
      if (metaL.length) { text(metaL, TX, ty, { size: 9.5, color: [51, 65, 85] }); ty += metaL.length * 4.3 }
      if (notesL.length) { text(notesL, TX, ty, { size: 9.5, style: 'italic', color: [71, 85, 105] }); ty += notesL.length * 4.3 + 1 }
      if (rs?.count) {
        pdf.setFillColor(254, 243, 199)
        pdf.roundedRect(TX, ty - 3.6, TW, rateH - 1.5, 1.5, 1.5, 'F')
        text(rateHead, TX + 2, ty + 0.4, { size: 9.5, style: 'bold', color: [146, 64, 14] })
        // Five rating dots (the built-in PDF font has no star glyph).
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9.5)
        let sx = TX + 2 + pdf.getTextWidth(rateHead) + 3
        for (let n = 1; n <= 5; n += 1) {
          if (n <= Math.round(rs.avg)) { pdf.setFillColor(251, 191, 36); pdf.circle(sx + 1.3, ty - 0.9, 1.3, 'F') }
          else { pdf.setDrawColor(203, 213, 225); pdf.circle(sx + 1.3, ty - 0.9, 1.3, 'S') }
          sx += 3.6
        }
        if (rateL.length) text(rateL, TX + 2, ty + 4.6, { size: 8.5, style: 'italic', color: [120, 53, 15] })
        ty += rateH
      }
      if (missing > 0) text(`(${missing} photo${missing > 1 ? 's' : ''} could not be loaded)`, TX, ty, { size: 8, style: 'italic', color: [220, 38, 38] })

      // Photos side by side under the activity.
      if (fitted.length) {
        const py = top + Math.max(textH, 16)
        const totalW = fitted.reduce((a, p) => a + p.dw, 0) + gap * (fitted.length - 1)
        let px = M + (CW - totalW) / 2
        for (const p of fitted) {
          try { pdf.addImage(p.dataUrl, p.fmt, px, py, p.dw, p.dh, undefined, 'FAST') } catch { /* skip a bad image */ }
          pdf.setDrawColor(226, 232, 240); pdf.rect(px, py, p.dw, p.dh)
          px += p.dw + gap
        }
      }
      y = top + blockH + 4
    }
    y += 3
  }

  // Footer on every page.
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i)
    text(`${clean(trip.title || 'Mission Trip')} · Travel Diary`, M, H - 8, { size: 8, color: [148, 163, 184] })
    text(`Page ${i} of ${pages}`, W - M, H - 8, { size: 8, color: [148, 163, 184], align: 'right' })
  }

  const safeName = clean(trip.title || 'Mission Trip').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '_') || 'Mission_Trip'
  pdf.save(`${safeName}_Travel_Diary.pdf`)
  const missingTotal = allPhotos.filter((ph) => !loaded.get(ph.id)).length
  return { photos: allPhotos.length, missing: missingTotal }
}

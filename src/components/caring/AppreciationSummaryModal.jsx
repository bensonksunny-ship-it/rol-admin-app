import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSundayAttendanceCountsByName, getAllPersonSundayAttendance, getCellMemberAttendanceCount } from '../../services/firestore'
import { monthsBetween, formatMonths, appreciationStatement, churchTillDate, LEADERSHIP_ROLE_RE, DEFAULT_STANDING } from '../../utils/relocation'
import { shareNodeAsImage } from '../../utils/shareImage'

const NAVY = '#1e3a5f'
const GOLD = '#b8860b'
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmtD = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const norm = (s) => String(s || '').trim().toLowerCase()
const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-10)

/**
 * "Generate Appreciation Summary" for a Relocated PCS person: church tenure,
 * all-time Sunday + cell attendance, an itemised ministry log, spiritual
 * milestones and the appreciation statement — as an on-screen card that can be
 * copied as an image, and a printable two-page PDF (certificate + summary).
 */
export default function AppreciationSummaryModal({ entry, form, ministry, allCellMembers, cellGroups, onClose }) {
  const name = String(form.name || entry.name || '').trim()
  const lastDate = entry.relocatedLastDate || ''
  const destination = entry.relocatedDestination || ''
  const standing = entry.relocatedStanding || DEFAULT_STANDING
  // Official farewell / completion date — church tenure runs first visit → this.
  const tillDate = churchTillDate(entry)
  const tenureMonths = monthsBetween(form.attendedDate || entry.attendedDate, tillDate)
  const [stats, setStats] = useState(null) // { sunday, cell, cellBreakdown: [{ cellName, count }] }
  const [statsError, setStatsError] = useState('')
  const [copyState, setCopyState] = useState('')
  const cardRef = useRef(null)

  // Every cell roster row that is this person (any status) — visitorId, phone, then name.
  const memberships = useMemo(() => {
    const ph = phoneKey(form.phone || entry.phone)
    const names = new Set([norm(name), norm(entry.name)].filter(Boolean))
    return (allCellMembers || []).filter(m =>
      (entry.visitorId && m.visitorId === entry.visitorId) ||
      (ph.length === 10 && phoneKey(m.phone) === ph) ||
      names.has(norm(m.name)))
  }, [allCellMembers, entry, form.phone, name])

  useEffect(() => {
    let cancelled = false
    const names = new Set([norm(name), norm(entry.name), ...memberships.map(m => norm(m.name))].filter(Boolean))
    Promise.all([
      getSundayAttendanceCountsByName().catch(() => new Map()),
      getAllPersonSundayAttendance().catch(() => []),
      Promise.all(memberships.map(m => getCellMemberAttendanceCount(m.cellId, m.id, m.name).catch(() => 0))),
    ]).then(([byName, linked, cellCounts]) => {
      if (cancelled) return
      // Sunday reports store names; linked check-ins store ids. Take the larger of the
      // best name count and the distinct linked dates, so one Sunday isn't counted twice.
      const nameCount = Math.max(0, ...[...names].map(n => byName.get(n) || 0))
      const linkedDates = new Set(linked
        .filter(a => (entry.visitorId && a.visitorId === entry.visitorId) || (entry.personId && a.personId === entry.personId))
        .map(a => String(a.date || '').slice(0, 10)))
      const cellBreakdown = memberships.map((m, i) => ({
        cellName: cellGroups.find(g => g.id === m.cellId)?.cellName || 'Cell group',
        count: cellCounts[i] || 0,
      }))
      setStats({ sunday: Math.max(nameCount, linkedDates.size), cell: cellBreakdown.reduce((n, c) => n + c.count, 0), cellBreakdown })
    }).catch(() => { if (!cancelled) setStatsError('Could not load attendance totals.') })
    return () => { cancelled = true }
  }, [memberships, name, entry, cellGroups])

  // Ministry service log — each role's duration runs to its end date, else to the
  // relocation (last attendance) date.
  const ministryLog = useMemo(() => (ministry || []).map(r => {
    const months = monthsBetween(r.from, r.to || lastDate)
    const isLeadership = LEADERSHIP_ROLE_RE.test(r.role || '') || /director board/i.test(r.ministry || '')
    return { ministry: r.ministry, role: r.role || '', from: r.from, months, hasDates: !!r.from, isLeadership }
  }), [ministry, lastDate])
  const leadershipMonths = ministryLog.filter(m => m.isLeadership).reduce((n, m) => n + m.months, 0)
  const ministryMonths = ministryLog.reduce((n, m) => n + m.months, 0)

  const milestones = [
    form.attendedDate && `First visited ${fmtD(form.attendedDate)}${form.serviceAttended ? ` (${form.serviceAttended})` : ''}`,
    form.baptised === 'yes' && `Baptised${form.baptismDate ? ` on ${fmtD(form.baptismDate)}` : ''}${form.baptismChurch ? ` at ${form.baptismChurch}` : ''}`,
    form.membershipStatus === 'member' && `Church member${form.membershipNumber ? ` #${form.membershipNumber}` : ''}`,
    form.membershipStatus === 'applying' && 'Applied for church membership',
    form.leadershipPosition && `Served as ${form.leadershipPosition}`,
    entry.addedAt && `Under pastoral care (PCS) since ${fmtD(entry.addedAt)}`,
    lastDate && `Last attended ${fmtD(lastDate)}${destination ? `, relocating to ${destination}` : ''}`,
    tillDate && `Part of the church until ${fmtD(tillDate)}`,
  ].filter(Boolean)

  const statement = appreciationStatement(name, tenureMonths, destination)
  const issued = fmtD(new Date())

  const copyCard = async () => {
    setCopyState('working')
    try {
      const result = await shareNodeAsImage(cardRef.current, `appreciation-${name.replace(/\s+/g, '-').toLowerCase()}`)
      setCopyState(result)
    } catch { setCopyState('error') }
    setTimeout(() => setCopyState(''), 3000)
  }

  const exportPdf = () => {
    const statRow = (label, value) => `<tr><td style="padding:6px 0;color:#64748b;font-size:11px">${esc(label)}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#0f172a;font-size:12px">${esc(value)}</td></tr>`
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Appreciation — ${esc(name)}</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      @page { size:A4 portrait; margin:0; }
      html,body { font-family:Georgia,'Times New Roman',serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .page { width:210mm; height:297mm; padding:14mm; page-break-after:always; }
      .sans { font-family:'Segoe UI',Arial,sans-serif; }
    </style></head><body>
    <div class="page">
      <div style="height:100%;border:3px double ${GOLD};outline:1.5px solid ${NAVY};outline-offset:-10px;padding:22mm 18mm;display:flex;flex-direction:column;align-items:center;text-align:center">
        <div class="sans" style="font-size:11px;letter-spacing:.3em;font-weight:700;color:${NAVY}">RIVER OF LIFE CHRISTIAN CHURCH · BANGALORE</div>
        <div style="font-size:40px;color:${NAVY};margin-top:18mm;letter-spacing:.04em">Certificate of Appreciation</div>
        <div class="sans" style="font-size:12px;color:#64748b;margin-top:10mm;letter-spacing:.2em">PRESENTED TO</div>
        <div style="font-size:34px;font-style:italic;color:#0f172a;margin-top:5mm;border-bottom:1px solid ${GOLD};padding:0 12mm 3mm">${esc(name)}</div>
        <p style="font-size:15px;line-height:1.75;color:#1f2937;margin-top:12mm;max-width:150mm">${esc(statement)}</p>
        <div class="sans" style="display:flex;gap:14mm;margin-top:12mm;font-size:11px;color:#334155">
          <div><div style="font-size:20px;font-weight:800;color:${NAVY}">${esc(formatMonths(tenureMonths))}</div>with us</div>
          ${stats ? `<div><div style="font-size:20px;font-weight:800;color:${NAVY}">${stats.sunday}</div>Sunday services</div>
          <div><div style="font-size:20px;font-weight:800;color:${NAVY}">${stats.cell}</div>cell meetings</div>` : ''}
        </div>
        <div class="sans" style="margin-top:auto;width:100%;display:flex;justify-content:space-between;align-items:flex-end;font-size:11px;color:#334155">
          <div style="text-align:left">Date: ${esc(issued)}<br>${tillDate ? `Part of the church until: ${esc(fmtD(tillDate))}<br>` : ''}Standing: ${esc(standing)}</div>
          <div style="text-align:center;width:65mm"><div style="border-bottom:1px solid #334155;height:14mm"></div><div style="font-weight:700;margin-top:3px">Pr. Benson K Sunny</div><div>Senior Pastor, ROLCC</div></div>
        </div>
      </div>
    </div>
    <div class="page sans">
      <div style="font-size:11px;letter-spacing:.2em;font-weight:700;color:${NAVY}">RIVER OF LIFE CHRISTIAN CHURCH · BANGALORE</div>
      <div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:4px">Ministry &amp; Service Summary</div>
      <div style="font-size:13px;color:#334155;margin-top:2px">${esc(name)}${destination ? ` · relocating to ${esc(destination)}` : ''}</div>
      <table style="width:100%;margin-top:14px;border-collapse:collapse;border-top:2px solid ${NAVY}">
        ${statRow('Church tenure', `${formatMonths(tenureMonths)} (${fmtD(form.attendedDate) || '—'} → ${fmtD(tillDate) || 'today'})`)}
        ${tillDate ? statRow('Official departure date', fmtD(tillDate)) : ''}
        ${stats ? statRow('Sunday services attended', String(stats.sunday)) : ''}
        ${stats ? statRow('Cell meetings attended', `${stats.cell}${stats.cellBreakdown.length ? ` (${stats.cellBreakdown.map(c => `${c.cellName}: ${c.count}`).join(', ')})` : ''}`) : ''}
        ${statRow('Total ministry service', ministryLog.length ? formatMonths(ministryMonths) : 'None recorded')}
        ${statRow('Total leadership service', leadershipMonths ? formatMonths(leadershipMonths) : 'None recorded')}
        ${statRow('Standing', standing)}
      </table>
      <div style="font-size:10px;font-weight:800;letter-spacing:.15em;color:${NAVY};margin-top:18px;border-bottom:1.5px solid ${NAVY};padding-bottom:3px">MINISTRY SERVICE LOG</div>
      ${ministryLog.length ? ministryLog.map(m => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:12px">
        <span><b>${esc(m.ministry)}</b>${m.role ? ` · ${esc(m.role)}` : ''}${m.isLeadership ? ' <span style="color:#b45309;font-size:10px;font-weight:700">LEADERSHIP</span>' : ''}</span>
        <span style="color:#334155">${m.hasDates ? esc(formatMonths(m.months)) : 'dates not recorded'}</span></div>`).join('') : '<div style="font-size:12px;color:#94a3b8;padding:6px 0">No ministry roles recorded.</div>'}
      <div style="font-size:10px;font-weight:800;letter-spacing:.15em;color:${NAVY};margin-top:18px;border-bottom:1.5px solid ${NAVY};padding-bottom:3px">SPIRITUAL MILESTONES</div>
      <ul style="margin:8px 0 0 16px;font-size:12px;line-height:1.8;color:#1f2937">${milestones.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      <div style="margin-top:22px;font-size:10px;color:#94a3b8">Generated ${esc(issued)} from PCS records · Attendance counts reflect recorded Sunday reports and cell meeting reports.</div>
    </div>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`
    const win = window.open('', '_blank', 'width=900,height=900')
    if (win) { win.document.write(html); win.document.close() }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-[640px] max-h-[94vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
          <p className="flex-1 font-bold text-slate-800">Appreciation &amp; Ministry Summary</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-lg text-slate-500">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Digital appreciation card — inline hex styles only, so it captures cleanly as an image */}
          <div ref={cardRef} style={{ background: '#fffdf7', border: `3px double ${GOLD}`, borderRadius: 16, padding: '28px 24px', textAlign: 'center', fontFamily: 'Georgia, "Times New Roman", serif' }}>
            <div style={{ fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: 10, letterSpacing: '0.25em', fontWeight: 700, color: NAVY }}>RIVER OF LIFE CHRISTIAN CHURCH · BANGALORE</div>
            <div style={{ fontSize: 24, color: NAVY, marginTop: 14 }}>With Gratitude</div>
            <div style={{ fontSize: 26, fontStyle: 'italic', color: '#0f172a', marginTop: 10 }}>{name}</div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: '#1f2937', marginTop: 14 }}>{statement}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 18, fontFamily: 'Segoe UI, Arial, sans-serif', color: '#334155', fontSize: 11 }}>
              <div><div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{formatMonths(tenureMonths)}</div>with us</div>
              <div><div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{stats ? stats.sunday : '…'}</div>Sundays</div>
              <div><div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{stats ? stats.cell : '…'}</div>cell meetings</div>
            </div>
            <div style={{ fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: 11, color: '#64748b', marginTop: 18 }}>Pr. Benson K Sunny · Senior Pastor, ROLCC · {issued}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportPdf} disabled={!stats} className="flex-1 min-h-[44px] rounded-xl bg-[#1e3a5f] text-white text-sm font-bold disabled:opacity-50">
              {stats ? 'Export PDF Certificate' : 'Calculating…'}
            </button>
            <button type="button" onClick={copyCard} disabled={!stats || copyState === 'working'} className="flex-1 min-h-[44px] rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {copyState === 'working' ? 'Copying…' : copyState === 'copied' ? 'Copied ✓' : copyState === 'downloaded' ? 'Downloaded ✓' : copyState === 'error' ? 'Copy failed' : 'Copy Digital Appreciation Card'}
            </button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Church tenure', formatMonths(tenureMonths)],
              ['Sunday services', stats ? stats.sunday : '…'],
              ['Cell meetings', stats ? stats.cell : '…'],
              ['Leadership', leadershipMonths ? formatMonths(leadershipMonths) : '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="text-sm font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            {fmtD(form.attendedDate) || 'First visit not recorded'} → {fmtD(lastDate) || 'today'} · Standing: {standing}
            {stats?.cellBreakdown?.length > 1 ? ` · Cells: ${stats.cellBreakdown.map(c => `${c.cellName} ${c.count}`).join(', ')}` : ''}
          </p>
          {statsError && <p className="text-xs text-red-600">{statsError}</p>}

          <section>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#1e3a5f] border-b-2 border-[#1e3a5f] pb-1">Ministry Service Log</p>
            {ministryLog.length === 0 ? <p className="text-sm text-slate-400 py-2">No ministry roles recorded.</p> : (
              <ul className="divide-y divide-slate-100">
                {ministryLog.map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <b className="text-slate-800">{m.ministry}</b>{m.role && <span className="text-slate-500"> · {m.role}</span>}
                      {m.isLeadership && <span className="ml-1.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">Leadership</span>}
                    </span>
                    <span className="text-slate-600 whitespace-nowrap">{m.hasDates ? formatMonths(m.months) : 'dates not recorded'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#1e3a5f] border-b-2 border-[#1e3a5f] pb-1">Spiritual Milestones</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-slate-700">
              {milestones.map(m => <li key={m}>{m}</li>)}
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body
  )
}

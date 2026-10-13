import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Copy, Mic2, Pencil, Plus, Share2, X } from 'lucide-react'
import { getAllWorshipSchedules, setWorshipScheduleByDate } from '../../services/firestore'
import { copiedRoster, nextSunday } from '../../utils/worshipRoster'

const fmtCol = (d) => format(parseISO(d), 'd MMM')

// Same two-letter initials the Single Week view's avatars use.
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Assign tab, multi-week view: roles down the side, Sundays across the top, so a
 * leader can see and plan several weeks at once. Styled to match the Single Week
 * card (accent bar, "Assign worship team" header, role-family pills and stripes).
 * Read-only until "Edit Plan"; in edit mode a cell click opens a member picker that
 * saves that Sunday straight away, and each column gets "Copy to next week".
 */
export default function WorshipMultiWeekMatrix({
  department, sundays, rangeLabel, onShift, onOpenWeek, onSaved, by,
  roleCategories, roleKeyFor, parseRoleKey, roleDisplayLabel, roleTheme, eligibleFor,
}) {
  const [byDate, setByDate] = useState({}) // date → schedule doc
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editing, setEditing] = useState(null) // { date, role }
  const [busy, setBusy] = useState('') // date being written
  const [sharing, setSharing] = useState(false)
  const [note, setNote] = useState('')
  const shareRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    getAllWorshipSchedules(department)
      .then((all) => { if (!cancelled) setByDate(Object.fromEntries(all.filter((s) => s.date).map((s) => [s.date, s]))) })
      .catch(() => { if (!cancelled) setByDate({}) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [department])

  const flash = (msg) => { setNote(msg); setTimeout(() => setNote(''), 3500) }
  const assignmentsOf = (date) => byDate[date]?.assignments || []

  // Rows: every category, with as many numbered rows as any visible Sunday uses.
  const rows = useMemo(() => roleCategories.flatMap((category) => {
    const count = sundays.reduce((max, d) => (byDate[d]?.assignments || []).reduce((m, a) => {
      const p = parseRoleKey(a.role)
      return p.category === category && a.memberId ? Math.max(m, p.index) : m
    }, max), 1)
    return Array.from({ length: count }, (_, i) => roleKeyFor(category, i + 1))
  }), [roleCategories, sundays, byDate, roleKeyFor, parseRoleKey])

  const write = async (date, assignments, msg) => {
    setBusy(date)
    try {
      await setWorshipScheduleByDate(department, date, assignments, by)
      setByDate((prev) => ({ ...prev, [date]: { ...(prev[date] || { date }), assignments } }))
      onSaved?.(date, assignments)
      if (msg) flash(msg)
    } catch (e) {
      console.error('WorshipMultiWeekMatrix save', e)
      flash('Could not save. Please try again.')
    }
    setBusy('')
  }

  const assign = (date, role, member) => {
    const list = assignmentsOf(date).filter((a) => a.role !== role || !member)
    const prev = assignmentsOf(date).find((a) => a.role === role) || {}
    const next = member
      ? [...list.filter((a) => a.role !== role), { role, memberId: member.id, memberName: member.name, songName: prev.songName || '', key: prev.key || '', songId: prev.songId || '' }]
      : list.filter((a) => a.role !== role)
    setEditing(null)
    write(date, next)
  }

  const copyToNext = (date) => {
    const to = nextSunday(date)
    const from = assignmentsOf(date)
    if (!from.some((a) => a.memberId)) { flash(`Nothing assigned on ${fmtCol(date)} to copy.`); return }
    if (assignmentsOf(to).some((a) => a.memberId) && !window.confirm(`${fmtCol(to)} already has a team. Replace it with the ${fmtCol(date)} team? Songs stay as they are.`)) return
    write(to, copiedRoster(from, assignmentsOf(to)), `Roster copied to ${fmtCol(to)}.`)
  }

  // Header "Copy Roster to Next Week": rolls the latest planned Sunday in view
  // forward one week — the usual fill-ahead workflow. Per-column copy (edit mode)
  // covers copying from any other Sunday.
  const latestPlanned = [...sundays].reverse().find((d) => assignmentsOf(d).some((a) => a.memberId))
  const copyLatestForward = () => {
    if (!latestPlanned) { flash('Nothing assigned in this range to copy.'); return }
    copyToNext(latestPlanned)
  }

  // Same clipboard-image flow as Single Week's Share Plan, capturing this grid.
  // html2canvas-pro (not plain html2canvas) because the grid uses Tailwind v4 oklch colours.
  const sharePlan = async () => {
    if (!shareRef.current) return
    setSharing(true)
    try {
      const mod = await import('html2canvas-pro')
      const html2canvas = mod.default || mod
      const canvas = await html2canvas(shareRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        // The live grid scrolls sideways — let the clone lay out at full width.
        onclone: (doc) => {
          const el = doc.querySelector('[data-share-root]')
          if (el) { el.style.overflow = 'visible'; el.style.width = 'max-content' }
        },
      })
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not create image')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      flash('Plan image copied — paste it into WhatsApp or anywhere.')
    } catch (e) {
      console.error('WorshipMultiWeekMatrix share', e)
      flash('Could not copy the plan as an image. Try again.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden xl:-mx-12 2xl:-mx-20">
      {/* Branded top accent — the three role-family hues in one bar, as in Single Week. */}
      <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-emerald-500 to-amber-500" />
      <div className="px-5 py-4 border-b border-slate-200 space-y-3 bg-gradient-to-r from-indigo-50 via-white to-amber-50">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <Mic2 size={16} className="text-indigo-500" /> Assign worship team
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onShift(-1)} aria-label="Earlier Sundays" className="w-8 h-8 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50"><ChevronLeft size={16} /></button>
            <span className="min-w-[150px] text-center text-sm font-semibold text-slate-700">{rangeLabel}</span>
            <button type="button" onClick={() => onShift(1)} aria-label="Later Sundays" className="w-8 h-8 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50"><ChevronRight size={16} /></button>
          </div>

          {isEditing ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { setEditing(null); setIsEditing(false) }}
                disabled={!!busy}
                className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60 shadow-sm"
              >
                {busy ? 'Saving...' : 'Done'}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={sharePlan}
                disabled={sharing || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 transition-colors"
              >
                <Share2 size={14} /> {sharing ? 'Copying...' : 'Share Plan'}
              </button>
              <button
                type="button"
                onClick={copyLatestForward}
                disabled={!!busy || loading}
                title={latestPlanned ? `Copies the ${fmtCol(latestPlanned)} team to ${fmtCol(nextSunday(latestPlanned))}` : 'Nothing assigned in this range yet'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 disabled:opacity-60 transition-colors"
              >
                <Copy size={14} /> {busy ? 'Copying...' : 'Copy Roster to Next Week'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition-colors"
              >
                <Pencil size={14} /> Edit Plan
              </button>
            </div>
          )}
        </div>
      </div>
      {note && <p className="px-5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border-b border-emerald-100">{note}</p>}

      {loading ? (
        <p className="p-5 text-center text-slate-500">Loading...</p>
      ) : (
        <div className="overflow-x-auto" data-share-root ref={shareRef}>
          <table className="w-full md:min-w-[900px] border-collapse">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-100 text-left px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 min-w-[170px]">Role</th>
                {sundays.map((d) => (
                  <th key={d} className="px-4 py-3 border-l border-slate-200 min-w-[160px] text-left align-top">
                    <button type="button" onClick={() => onOpenWeek(d)} className="text-xs font-bold uppercase tracking-wide text-indigo-700 hover:underline" title="Open this Sunday in Single Week View">
                      {fmtCol(d)}
                    </button>
                    {isEditing && (
                      <button type="button" disabled={!!busy} onClick={() => copyToNext(d)}
                        className="mt-1 flex items-center gap-1 text-[11px] font-semibold normal-case text-slate-500 hover:text-indigo-700 disabled:opacity-50">
                        <Copy size={11} /> {busy === nextSunday(d) ? 'Copying…' : 'Copy to next week'}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((role) => {
                const theme = roleTheme(role)
                return (
                  <tr key={role} className="transition-colors hover:bg-purple-50/50">
                    <th scope="row" className={`sticky left-0 z-10 bg-white text-left px-5 py-4 align-middle border-l-4 ${theme.cardEdge}`}>
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${theme.pill}`}>
                        {roleDisplayLabel(role)}
                      </span>
                    </th>
                    {sundays.map((d) => {
                      const a = assignmentsOf(d).find((x) => x.role === role && x.memberId)
                      const cellEditing = editing?.date === d && editing?.role === role
                      return (
                        <td key={d} className="px-4 py-4 border-l border-slate-100 align-middle">
                          {cellEditing ? (
                            <div className="flex items-center gap-1">
                              <select autoFocus value={a?.memberId || ''} disabled={busy === d}
                                onChange={(e) => {
                                  const m = eligibleFor(role).find((x) => x.id === e.target.value)
                                  assign(d, role, m || null)
                                }}
                                onBlur={() => setEditing(null)}
                                className="w-full h-8 px-1 rounded-md border border-indigo-300 text-xs bg-white">
                                <option value="">— Not assigned —</option>
                                {eligibleFor(role).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                              <button type="button" aria-label="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                            </div>
                          ) : a ? (
                            <button type="button" disabled={!isEditing} onClick={() => setEditing({ date: d, role })}
                              title={isEditing ? 'Change who is assigned' : a.memberName}
                              className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-3 ring-1 ring-inset ring-slate-200 shadow-sm transition-colors disabled:cursor-default ${isEditing ? 'hover:ring-indigo-400 hover:bg-indigo-50' : ''}`}>
                              <span className={`inline-flex w-6 h-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${theme.avatar}`}>
                                {initialsOf(a.memberName)}
                              </span>
                              <span className="truncate text-xs font-bold text-slate-800">{a.memberName || '—'}</span>
                            </button>
                          ) : isEditing ? (
                            <button type="button" onClick={() => setEditing({ date: d, role })}
                              className="inline-flex items-center gap-1 rounded-full border border-dashed border-rose-300 bg-rose-50/60 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                              <Plus size={11} /> Not assigned
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Not assigned
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-5 py-2.5 text-[11px] text-slate-500 border-t border-slate-200">
        {isEditing
          ? 'Tap a cell to assign; it saves at once. Songs and the practice session are set in Single Week View.'
          : 'Click Edit Plan to change assignments, or a date to open that Sunday in Single Week View.'}
      </p>
    </div>
  )
}

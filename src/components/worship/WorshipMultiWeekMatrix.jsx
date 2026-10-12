import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Copy, Plus, X } from 'lucide-react'
import { getAllWorshipSchedules, setWorshipScheduleByDate } from '../../services/firestore'
import { copiedRoster, nextSunday } from '../../utils/worshipRoster'

const fmtCol = (d) => format(parseISO(d), 'd MMM')

/**
 * Assign tab, multi-week view: roles down the side, Sundays across the top, so a
 * leader can see and plan several weeks at once. A cell click opens a member
 * picker that saves that Sunday straight away; each column has
 * "Copy to next week" to duplicate its roster onto the following Sunday.
 */
export default function WorshipMultiWeekMatrix({
  department, sundays, rangeLabel, onShift, onOpenWeek, onSaved, by,
  roleCategories, roleKeyFor, parseRoleKey, roleDisplayLabel, eligibleFor,
}) {
  const [byDate, setByDate] = useState({}) // date → schedule doc
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { date, role }
  const [busy, setBusy] = useState('') // date being written
  const [note, setNote] = useState('')

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

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden xl:-mx-12 2xl:-mx-20">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-amber-50">
        <button type="button" onClick={() => onShift(-1)} aria-label="Earlier Sundays" className="w-8 h-8 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50"><ChevronLeft size={16} /></button>
        <span className="flex-1 text-center text-sm font-semibold text-slate-700">{rangeLabel}</span>
        <button type="button" onClick={() => onShift(1)} aria-label="Later Sundays" className="w-8 h-8 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50"><ChevronRight size={16} /></button>
      </div>
      {note && <p className="px-4 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border-b border-emerald-100">{note}</p>}

      {loading ? (
        <p className="p-6 text-center text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 min-w-[96px]">Role</th>
                {sundays.map((d) => (
                  <th key={d} className="px-2 py-2 border-b border-l border-slate-200 min-w-[140px] align-top">
                    <button type="button" onClick={() => onOpenWeek(d)} className="text-sm font-bold text-indigo-700 hover:underline" title="Open this Sunday in Single Week View">
                      {fmtCol(d)}
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => copyToNext(d)}
                      className="mt-1 mx-auto flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-indigo-700 disabled:opacity-50">
                      <Copy size={11} /> {busy === nextSunday(d) ? 'Copying…' : 'Copy to next week'}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((role) => (
                <tr key={role} className="border-b border-slate-100">
                  <th scope="row" className="sticky left-0 z-10 bg-white text-left px-3 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap">{roleDisplayLabel(role)}</th>
                  {sundays.map((d) => {
                    const a = assignmentsOf(d).find((x) => x.role === role && x.memberId)
                    const isEditing = editing?.date === d && editing?.role === role
                    return (
                      <td key={d} className="px-2 py-1.5 border-l border-slate-100 text-center align-middle">
                        {isEditing ? (
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
                          <button type="button" onClick={() => setEditing({ date: d, role })}
                            className="max-w-full truncate px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-200 text-xs font-semibold hover:bg-indigo-100">
                            {a.memberName || '—'}
                          </button>
                        ) : (
                          <button type="button" onClick={() => setEditing({ date: d, role })}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-slate-300 text-slate-400 text-[11px] font-medium hover:border-indigo-400 hover:text-indigo-600">
                            <Plus size={11} /> Not assigned
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
        Tap a cell to assign; it saves at once. Songs and the practice session are set in Single Week View.
      </p>
    </div>
  )
}

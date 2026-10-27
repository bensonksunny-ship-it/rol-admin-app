import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarPlus, Check, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { getAllWorshipSchedules, scheduleWorshipSong } from '../../services/firestore'
import { consecutiveSundays } from '../../utils/worshipRoster'
import useSongScheduler from '../../hooks/useSongScheduler'

const DEPARTMENT = 'Worship'
const WEEKS = 12 // shown at first; "Show later Sundays" adds more

function thisOrNextSundayISO() {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return format(d, 'yyyy-MM-dd')
}

const isLeadVocal = (r) => /^Lead Vocal(-\d+)?$/.test(String(r || ''))

/**
 * Songs Directory → calendar button on a song card: pick an upcoming Sunday and the
 * song goes onto a worship leader's own Lead Vocal slot (scheduleWorshipSong).
 * It always lands on the chosen leader's own slot. You can pick any upcoming
 * Sunday for yourself — if you aren't rostered to lead it yet, you're put on as a
 * Lead Vocal (claimSlot) — so songs can be planned well ahead. A director
 * (canManage) can also add to any rostered leader's set.
 */
export default function ScheduleSongModal({ song, canManage = false, onClose, onScheduled }) {
  const scheduler = useSongScheduler()
  const [weeks, setWeeks] = useState(WEEKS)
  const sundays = useMemo(() => consecutiveSundays(thisOrNextSundayISO(), weeks), [weeks])
  const [schedules, setSchedules] = useState(null) // null = loading
  const [date, setDate] = useState('')
  const [leaderId, setLeaderId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getAllWorshipSchedules(DEPARTMENT).then(setSchedules).catch(() => setSchedules([]))
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = String(song.title || '').trim()
  const info = useMemo(() => {
    const out = {}
    for (const d of sundays) {
      const list = (schedules || []).find((s) => s.date === d)?.assignments || []
      const leaders = []
      for (const a of list) {
        if (isLeadVocal(a.role) && a.memberId && !leaders.some((l) => l.memberId === a.memberId)) leaders.push({ memberId: a.memberId, memberName: a.memberName || '—' })
      }
      const iLead = !!scheduler.memberId && leaders.some((l) => l.memberId === scheduler.memberId)
      // Yourself is always an option (claims a lead slot when not rostered yet).
      const options = canManage ? [...leaders] : []
      if (scheduler.memberId && !options.some((l) => l.memberId === scheduler.memberId)) {
        options.unshift({ memberId: scheduler.memberId, memberName: scheduler.memberName, self: true })
      }
      out[d] = {
        count: list.filter((a) => a.songId || a.songName).length,
        has: list.some((a) => (a.songId && a.songId === song.id) || (!a.songId && title && String(a.songName || '').trim() === title)),
        leaders: options,
        iLead,
        open: options.length > 0,
      }
    }
    return out
  }, [schedules, sundays, song.id, title, scheduler.memberId, scheduler.memberName, canManage])

  function pick(d) {
    setDate(d)
    setLeaderId(info[d].iLead ? scheduler.memberId : (info[d].leaders[0]?.memberId || ''))
  }

  const leader = date ? info[date].leaders.find((l) => l.memberId === leaderId) : null

  async function save() {
    if (!date || !leader) return
    setSaving(true)
    setError('')
    try {
      const res = await scheduleWorshipSong(DEPARTMENT, date, song, { leader, updatedBy: scheduler.email, scheduler, claimSlot: leader.memberId === scheduler.memberId })
      onScheduled?.(date, res, leader)
      onClose()
    } catch (e) {
      console.error('scheduleWorshipSong', e)
      setError('Could not schedule the song. Please try again.')
      setSaving(false)
    }
  }

  const noneOpen = schedules !== null && !sundays.some((d) => info[d].open)

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={`Schedule ${title}`}
        className="bg-white w-full sm:max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3 flex-shrink-0">
          <span className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
            <CalendarPlus size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-900 truncate">Schedule “{title}”</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {canManage ? 'Pick a Sunday and whose set it joins.' : 'Pick any Sunday — it goes on your lead slot.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {schedules === null ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading Sundays…</p>
          ) : (
            <>
              {noneOpen && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  {canManage ? 'No lead vocalist is rostered on these Sundays yet, and your account isn’t linked to a worship team member — roster a lead in Assign first.'
                    : 'Your account isn’t linked to a worship team member (matched by name), so songs can’t be put on a lead slot for you.'}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {sundays.map((d, i) => {
                  const it = info[d]
                  const selected = date === d
                  const disabled = it.has || !it.open
                  return (
                    <button key={d} type="button" disabled={disabled} onClick={() => pick(d)}
                      className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                        it.has ? 'border-emerald-200 bg-emerald-50 cursor-default'
                          : !it.open ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                            : selected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                              : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'}`}>
                      <p className="text-sm font-bold text-slate-900 tabular-nums">{format(parseISO(d), 'dd/MM/yyyy')}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {i === 0 ? 'This Sunday' : i === 1 ? 'Next Sunday' : `In ${i} weeks`}
                      </p>
                      <p className={`text-[11px] font-semibold mt-1 ${it.has ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {it.has ? <span className="inline-flex items-center gap-1"><Check size={12} /> Already in setlist</span>
                          : !it.open ? (canManage ? 'No lead rostered' : 'You’re not leading')
                            : it.iLead ? `You’re leading · ${it.count} song${it.count === 1 ? '' : 's'}`
                              : canManage && it.leaders.length > 1 ? `${it.count} song${it.count === 1 ? '' : 's'} so far`
                                : 'Not rostered yet'}
                      </p>
                    </button>
                  )
                })}
              </div>
              <button type="button" onClick={() => setWeeks((n) => n + WEEKS)}
                className="w-full py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Show later Sundays
              </button>
            </>
          )}

          {date && !info[date].iLead && leader?.memberId === scheduler.memberId && (
            <p className="text-xs text-slate-500">You aren’t rostered to lead this Sunday yet — scheduling puts you on as a lead vocal.</p>
          )}
          {date && canManage && info[date].leaders.length > 1 && (
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Add to whose set</label>
              <select value={leaderId} onChange={(e) => setLeaderId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                {info[date].leaders.map((l) => (
                  <option key={l.memberId} value={l.memberId}>{l.memberName}{l.memberId === scheduler.memberId ? (l.self ? ' (you — not rostered yet)' : ' (you)') : ''}</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={!date || !leader || saving} onClick={save}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">
            {saving ? 'Scheduling…' : 'Add to setlist'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

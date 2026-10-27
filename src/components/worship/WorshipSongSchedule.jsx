import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarPlus, Mic2, Music2, Search, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { subscribeWorshipSchedules, scheduleWorshipSong, unscheduleWorshipSong } from '../../services/firestore'
import { consecutiveSundays } from '../../utils/worshipRoster'
import useSongScheduler from '../../hooks/useSongScheduler'

const DEPARTMENT = 'Worship'
const FORWARD_WEEKS = 12 // shown at first; "Show later Sundays" adds 12 more each time
const PAST_PAGE = 10

function todayISO() { return format(new Date(), 'yyyy-MM-dd') }
function thisOrNextSundayISO() {
  const d = new Date()
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return format(d, 'yyyy-MM-dd')
}
const dmy = (iso) => format(parseISO(iso), 'dd/MM/yyyy')
const isSundayISO = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && parseISO(iso).getDay() === 0
const isLeadVocal = (r) => /^Lead Vocal(-\d+)?$/.test(String(r || ''))
const roleIdx = (r) => { const m = String(r || '').match(/-(\d+)$/); return m ? Number(m[1]) : 1 }
const hasSong = (a) => !!(a.songId || a.songName)

/**
 * One Sunday's setlist grouped by worship leader: each rostered Lead Vocal (in
 * slot order) with the songs on their own rows, plus any older song rows that
 * have no singer ("Not assigned to a leader").
 */
function leaderGroups(assignments) {
  const groups = []
  for (const a of [...assignments].filter((x) => isLeadVocal(x.role)).sort((x, y) => roleIdx(x.role) - roleIdx(y.role))) {
    if (!a.memberId) continue
    let g = groups.find((x) => x.memberId === a.memberId)
    if (!g) { g = { memberId: a.memberId, memberName: a.memberName || '—', rows: [] }; groups.push(g) }
    if (hasSong(a)) g.rows.push(a)
  }
  const orphan = assignments.filter((a) => !a.memberId && hasSong(a))
  if (orphan.length) groups.push({ memberId: '', memberName: 'Not assigned to a leader', rows: orphan })
  return groups
}

/**
 * Worship → Songs → "Schedule song". A song is always scheduled onto a worship
 * leader's own Lead Vocal slot for that Sunday (scheduleWorshipSong), never onto
 * someone else's.
 *  - My songs: every upcoming Sunday (as far ahead as you like) with your songs.
 *    "Add song" puts the song on your Lead Vocal slot — and on a Sunday you aren't
 *    rostered for yet, puts you on as a Lead Vocal for it (claimSlot), so you can
 *    plan songs well before the roster is made. Past: Sundays you led.
 *  - All setlists: every Sunday, each leader's songs under their name. Directors can
 *    add to any leader's slot; others only to their own.
 * Upcoming = next 12 Sundays (schedule forward); Past = earlier setlists.
 */
export default function WorshipSongSchedule({ songs, canManage = false }) {
  const scheduler = useSongScheduler()
  const [schedules, setSchedules] = useState(null) // null = loading
  const [error, setError] = useState('')
  const [view, setView] = useState('upcoming') // 'upcoming' | 'past'
  const [mineOnly, setMineOnly] = useState(true)
  const [pastShown, setPastShown] = useState(PAST_PAGE)
  const [forwardWeeks, setForwardWeeks] = useState(FORWARD_WEEKS)
  const [pickFor, setPickFor] = useState(null) // { date, memberId, memberName }
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => subscribeWorshipSchedules(DEPARTMENT, (rows) => { setSchedules(rows); setError('') },
    (e) => { console.error('WorshipSongSchedule', e); setError('Could not load setlists.'); setSchedules([]) }), [])

  const byDate = useMemo(() => {
    const m = new Map()
    for (const s of schedules || []) if (s.date) m.set(s.date, s.assignments || [])
    return m
  }, [schedules])

  const myId = scheduler.memberId
  const groupsFor = (date) => {
    const all = leaderGroups(byDate.get(date) || [])
    return mineOnly ? all.filter((g) => myId && g.memberId === myId) : all
  }
  const leadingOn = (date) => !!myId && (byDate.get(date) || []).some((a) => isLeadVocal(a.role) && a.memberId === myId)

  const dates = useMemo(() => {
    const all = (schedules || []).map((s) => s.date).filter(isSundayISO)
    if (view === 'upcoming') {
      const horizon = consecutiveSundays(thisOrNextSundayISO(), forwardWeeks)
      const last = horizon[horizon.length - 1]
      return Array.from(new Set([...horizon, ...all.filter((d) => d >= todayISO() && d <= last)])).sort()
    }
    const past = Array.from(new Set(all.filter((d) => d < todayISO()))).sort((a, b) => b.localeCompare(a))
    return past.filter((d) => groupsFor(d).some((g) => g.rows.length))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, view, mineOnly, myId, forwardWeeks])

  const list = view === 'past' ? dates.slice(0, pastShown) : dates
  const flash = (msg) => { setNote(msg); setTimeout(() => setNote(''), 3500) }
  const canAddFor = (memberId) => canManage || (!!myId && memberId === myId)

  async function add(target, song) {
    setPickFor(null)
    setBusy(target.date)
    try {
      const res = await scheduleWorshipSong(DEPARTMENT, target.date, song, {
        leader: { memberId: target.memberId, memberName: target.memberName },
        updatedBy: scheduler.email, scheduler,
        claimSlot: target.memberId === myId,
      })
      flash(res === 'already' ? `“${song.title}” is already in the ${dmy(target.date)} setlist.`
        : res === 'not-leading' ? `${target.memberName} isn’t rostered as a lead vocal on ${dmy(target.date)} any more.`
          : res === 'claimed' ? `“${song.title}” added for ${dmy(target.date)} — you’re now down as a lead vocal that Sunday.`
            : `“${song.title}” added to ${target.memberName === scheduler.memberName ? 'your' : `${target.memberName}’s`} set on ${dmy(target.date)}.`)
    } catch (e) {
      console.error('scheduleWorshipSong', e)
      flash('Could not schedule the song. Please try again.')
    } finally { setBusy('') }
  }

  async function remove(date, a) {
    if (!window.confirm(`Remove “${a.songName}” from the ${dmy(date)} setlist?`)) return
    setBusy(date)
    try { await unscheduleWorshipSong(DEPARTMENT, date, a.role, scheduler.email) }
    catch (e) { console.error('unscheduleWorshipSong', e); flash('Could not remove the song.') }
    finally { setBusy('') }
  }

  const emptyText = view === 'past'
    ? (mineOnly ? 'You haven’t led songs on any past Sunday yet.' : 'No past setlists yet.')
    : mineOnly
      ? (myId ? 'No upcoming Sundays.'
        : 'Your account isn’t linked to a worship team member (matched by name), so there are no Sundays you lead. Switch to All setlists to browse.')
      : 'No upcoming Sundays.'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {[['upcoming', 'Upcoming'], ['past', 'Past']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${view === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto inline-flex rounded-xl bg-slate-100 p-1">
          {[[true, 'My songs'], [false, 'All setlists']].map(([v, label]) => (
            <button key={label} type="button" onClick={() => setMineOnly(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mineOnly === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {mineOnly && myId && (
        <p className="text-xs text-slate-500">Sundays where <b className="text-slate-700">{scheduler.memberName}</b> is leading — songs you add go on your lead slot.</p>
      )}
      {note && <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-medium text-emerald-800">{note}</div>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {schedules === null ? (
        <p className="text-center py-10 text-slate-400 text-sm">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-center py-10 px-4 text-slate-400 text-sm">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((d) => {
            const isUp = view === 'upcoming'
            const groups = groupsFor(d)
            const weeksAway = Math.round((parseISO(d) - parseISO(thisOrNextSundayISO())) / (7 * 864e5))
            return (
              <div key={d} className={`rounded-2xl border bg-white p-4 shadow-sm ${isUp && weeksAway === 0 ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 tabular-nums">{dmy(d)}</p>
                    <p className="text-[11px] text-slate-500">
                      {isUp ? (weeksAway === 0 ? 'This Sunday' : weeksAway === 1 ? 'Next Sunday' : `In ${weeksAway} weeks`)
                        : `${groups.reduce((n, g) => n + g.rows.length, 0)} song(s)`}
                    </p>
                  </div>
                  {isUp && mineOnly && myId && (
                    <button type="button" disabled={busy === d} onClick={() => setPickFor({ date: d, memberId: myId, memberName: scheduler.memberName })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40">
                      <CalendarPlus size={14} /> {busy === d ? 'Saving…' : 'Add song'}
                    </button>
                  )}
                </div>

                {isUp && mineOnly && myId && !leadingOn(d) && (
                  <p className="text-[11px] text-slate-400 mt-2">You’re not rostered to lead yet — adding a song puts you on as a lead vocal.</p>
                )}
                {groups.length === 0 ? (
                  !(isUp && mineOnly && myId) && <p className="text-xs text-slate-400 mt-3">No lead vocalist rostered yet.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {groups.map((g) => (
                      <div key={g.memberId || 'orphan'}>
                        {(!mineOnly || !g.memberId) && (
                          <div className="flex items-center gap-2 mb-1">
                            <Mic2 size={13} className={g.memberId ? 'text-indigo-500' : 'text-slate-400'} />
                            <p className={`text-xs font-bold ${g.memberId ? 'text-slate-700' : 'text-slate-400'}`}>
                              {g.memberName}{g.memberId && g.memberId === myId ? ' (you)' : ''}
                            </p>
                            {isUp && g.memberId && canAddFor(g.memberId) && (
                              <button type="button" disabled={busy === d} onClick={() => setPickFor({ date: d, memberId: g.memberId, memberName: g.memberName })}
                                className="ml-auto text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">+ Add</button>
                            )}
                          </div>
                        )}
                        {g.rows.length === 0 ? (
                          <p className="text-xs text-slate-400 pl-5">No songs yet.</p>
                        ) : (
                          <ol className="space-y-1.5 pl-5">
                            {g.rows.map((a, n) => (
                              <li key={a.role} className="flex items-center gap-2 text-sm">
                                <span className="w-5 text-xs text-slate-400 tabular-nums">{n + 1}.</span>
                                <Music2 size={14} className="text-indigo-400 flex-shrink-0" />
                                <span className="font-semibold text-slate-800 truncate">{a.songName || '(untitled)'}</span>
                                {a.key && <span className="text-xs font-bold text-indigo-600">[{a.key}]</span>}
                                {isUp && (canManage || (myId && a.memberId === myId)) && (
                                  <button type="button" disabled={busy === d} onClick={() => remove(d, a)} title="Remove from this Sunday"
                                    className="ml-auto w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0">
                                    <X size={13} />
                                  </button>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {view === 'upcoming' && schedules !== null && list.length > 0 && (
        <div className="text-center">
          <button type="button" onClick={() => setForwardWeeks((n) => n + FORWARD_WEEKS)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Show later Sundays
          </button>
        </div>
      )}

      {view === 'past' && dates.length > pastShown && (
        <div className="text-center">
          <button type="button" onClick={() => setPastShown((n) => n + PAST_PAGE)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Show older
          </button>
        </div>
      )}

      {pickFor && (
        <SongPicker songs={songs} target={pickFor}
          taken={(byDate.get(pickFor.date) || []).filter(hasSong)}
          onPick={(s) => add(pickFor, s)} onClose={() => setPickFor(null)} />
      )}
    </div>
  )
}

function SongPicker({ songs, target, taken, onPick, onClose }) {
  const [q, setQ] = useState('')
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const needle = q.trim().toLowerCase()
  const inSet = (s) => taken.some((a) => (a.songId && a.songId === s.id) || (!a.songId && String(a.songName || '').trim() === String(s.title || '').trim()))
  const rows = [...songs]
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
    .filter((s) => !needle || [s.title, s.artist].some((v) => String(v || '').toLowerCase().includes(needle)))

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Choose a song"
        className="bg-white w-full sm:max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-900">Add a song</h2>
            <p className="text-xs text-slate-500">Sunday {dmy(target.date)} · {target.memberName}’s set</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"><X size={16} /></button>
        </div>
        <div className="px-4 pt-3 flex-shrink-0 relative">
          <Search size={15} className="absolute left-7 top-1/2 mt-1.5 -translate-y-1/2 text-slate-400" />
          <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or artist"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <ul className="overflow-y-auto p-2 flex-1">
          {rows.length === 0 && <li className="text-sm text-slate-400 text-center py-8">No songs found.</li>}
          {rows.map((s) => {
            const already = inSet(s)
            return (
              <li key={s.id}>
                <button type="button" disabled={already} onClick={() => onPick(s)}
                  className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 hover:bg-indigo-50 disabled:opacity-50 disabled:hover:bg-transparent">
                  <Music2 size={16} className="text-indigo-400 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{s.title}</span>
                    {s.artist && <span className="block text-xs text-slate-500 truncate">{s.artist}</span>}
                  </span>
                  {already ? <span className="text-[11px] font-semibold text-emerald-700">In setlist</span>
                    : s.key && <span className="text-xs font-bold text-indigo-600">{s.key}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarDays, Music2, Users, ChevronLeft, ChevronRight, FileDown, Share2, Plus, MapPin,
  Mic, MicVocal, Piano, Guitar, Drum, SlidersHorizontal, Music4,
} from 'lucide-react'
import { subscribeWorshipScheduleByDate, getWorshipRehearsals, getWorshipSongs } from '../../services/firestore'
import { sortByWorshipRole, worshipRoleCategoryLabel } from '../../utils/worshipRoleOrder'

const DEPARTMENT = 'Worship'

// Local YYYY-MM-DD (not toISOString, which can shift the date across midnight).
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const atNoon = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`)
const addDaysISO = (iso, n) => { const d = atNoon(iso); d.setDate(d.getDate() + n); return isoLocal(d) }
/** Today if it is Sunday, else the coming Sunday. */
function nextSundayISO() {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return isoLocal(d)
}
const fmtDay = (iso, opts) => {
  const d = iso ? atNoon(iso) : null
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', opts) : ''
}
// "18:30" → "6:30 PM"; anything else is shown as typed.
const fmtTime = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return String(t || '')
  const h = Number(m[1])
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}
// "Lead Vocal-2" → "Lead Vocal"; the Lead Vocal-4 slot → "Altar Call Worship"
const roleCategory = worshipRoleCategoryLabel
const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'

// Icon + colours per role category; unknown/custom roles fall back to the last entry.
const ROLE_STYLE = [
  [/lead vocal|altar call/i, MicVocal, 'from-violet-500 to-fuchsia-500', 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200'],
  [/parts/i, Mic, 'from-pink-500 to-rose-500', 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-200'],
  [/choir/i, Users, 'from-sky-500 to-indigo-500', 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200'],
  [/key|piano/i, Piano, 'from-amber-500 to-orange-500', 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'],
  [/guitar|bass/i, Guitar, 'from-emerald-500 to-teal-500', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'],
  [/drum/i, Drum, 'from-red-500 to-orange-500', 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200'],
  [/sound|engineer|mix/i, SlidersHorizontal, 'from-slate-500 to-slate-700', 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'],
  [/.*/, Music4, 'from-indigo-500 to-violet-500', 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'],
]
const roleStyle = (cat) => {
  const [, Icon, avatar, chip] = ROLE_STYLE.find(([re]) => re.test(cat))
  return { Icon, avatar, chip }
}

/**
 * Worship → Upcoming Sunday: one Sunday from the worship team's side — who is
 * rostered, the songs, and the week's practice status. Roster and songs are edited in
 * Assign; practice is managed in its own Practice & Rehearsal tab. The service
 * order is planned by Sunday Ministry, not Worship.
 */
export default function WorshipUpcomingSunday({ canManage = false }) {
  const [, setSearchParams] = useSearchParams()
  const thisSunday = nextSundayISO()
  const [sunday, setSunday] = useState(thisSunday)
  const [schedule, setSchedule] = useState(null)
  const [rehearsals, setRehearsals] = useState([])
  const [songLib, setSongLib] = useState([])
  const [loadedFor, setLoadedFor] = useState('')
  const [error, setError] = useState('')
  const [openSong, setOpenSong] = useState(null)
  const [flash, setFlash] = useState('')
  const loading = loadedFor !== sunday

  // Song library (for tempo / artist) — once.
  useEffect(() => {
    getWorshipSongs().then(setSongLib).catch(() => setSongLib([]))
  }, [])

  // Schedule is live (onSnapshot) so a song scheduled from the Songs Directory —
  // here or on another device — lands in the setlist without a reload.
  useEffect(() => {
    let cancelled = false
    let schedReady = false
    let rehReady = false
    const done = () => { if (!cancelled && schedReady && rehReady) setLoadedFor(sunday) }
    const fail = (e) => { console.error('WorshipUpcomingSunday', e); if (!cancelled) setError('Could not load this Sunday’s plan.') }
    const unsub = subscribeWorshipScheduleByDate(DEPARTMENT, sunday, (sched) => {
      if (cancelled) return
      setSchedule(sched)
      setError('')
      schedReady = true
      done()
    }, (e) => { fail(e); schedReady = true; done() })
    getWorshipRehearsals(DEPARTMENT)
      .then((reh) => {
        if (cancelled) return
        // That Sunday's practice week: Monday before it up to the Sunday itself.
        const from = addDaysISO(sunday, -6)
        setRehearsals(reh.filter((r) => r.date && r.date >= from && r.date <= sunday).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`)))
      })
      .catch(fail)
      .finally(() => { rehReady = true; done() })
    return () => { cancelled = true; unsub() }
  }, [sunday])

  const say = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 2500) }
  const openTab = (tab) => setSearchParams({ tab })

  const assigned = useMemo(
    () => sortByWorshipRole((schedule?.assignments || []).filter((a) => a.memberId || a.memberName)),
    [schedule],
  )
  // One card per person (first role wins the colour); every role they hold is listed.
  const people = useMemo(() => {
    const out = []
    for (const a of assigned) {
      const k = a.memberId || `name:${a.memberName}`
      let p = out.find((x) => x.k === k)
      if (!p) { p = { k, memberId: a.memberId || '', name: a.memberName || '—', roles: [] }; out.push(p) }
      const cat = roleCategory(a.role)
      if (!p.roles.includes(cat)) p.roles.push(cat)
    }
    return out
  }, [assigned])

  const songs = useMemo(() => {
    const out = []
    for (const a of sortByWorshipRole(schedule?.assignments || [])) {
      if (!a.songId && !a.songName) continue
      const k = a.songId || `name:${a.songName}`
      if (out.some((s) => s.k === k)) continue
      const lib = songLib.find((s) => (a.songId && s.id === a.songId) || (!a.songId && s.title && s.title === a.songName)) || {}
      out.push({
        k,
        name: a.songName || lib.title || '(untitled)',
        key: a.key || lib.key || '',
        tempo: lib.tempo || null,
        artist: lib.artist || '',
        notes: lib.notes || '',
        by: a.memberName || '',
      })
    }
    return out
  }, [schedule, songLib])

  const isPast = sunday < isoLocal(new Date())
  const status = isPast
    ? { label: 'Completed', cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 ring-slate-500/20' }
    : people.length && songs.length
      ? { label: 'Roster Confirmed', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30' }
      : people.length || songs.length
        ? { label: 'Roster In Progress', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30' }
        : { label: 'Not Rostered', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30' }

  const longDate = fmtDay(sunday, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const sessionLabel = (r) => [fmtDay(r.date, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }), fmtTime(r.time)].filter(Boolean).join(' • ')

  // Practice status per member: the latest practice session that has attendance.
  const practiceStatus = (memberId) => {
    if (!memberId) return null
    for (let i = rehearsals.length - 1; i >= 0; i--) {
      const att = rehearsals[i].attendance
      if (att && Object.keys(att).length) return att[memberId]?.present ? 'present' : 'absent'
    }
    return null
  }

  const scheduleText = () => {
    const lines = [`*Worship team — ${longDate}*`, '']
    if (people.length) {
      lines.push('*Team*')
      people.forEach((p) => lines.push(`• ${p.roles.join(' / ')}: ${p.name}`))
      lines.push('')
    }
    if (songs.length) {
      lines.push('*Songs*')
      songs.forEach((s, i) => lines.push(`${i + 1}. ${s.name}${s.key ? ` (Key ${s.key}${s.tempo ? `, ${s.tempo} BPM` : ''})` : ''}${s.by ? ` — ${s.by}` : ''}`))
      lines.push('')
    }
    if (rehearsals.length) {
      lines.push('*Practice*')
      rehearsals.forEach((r) => lines.push(`• ${sessionLabel(r)}${r.location ? ` @ ${r.location}` : ''}`))
    }
    return lines.join('\n').trim()
  }

  const share = async () => {
    const text = scheduleText()
    try {
      if (navigator.share) { await navigator.share({ title: `Worship — ${longDate}`, text }); return }
      await navigator.clipboard.writeText(text)
      say('Schedule copied — paste it into WhatsApp.')
    } catch (e) {
      if (e?.name !== 'AbortError') say('Could not share the schedule.')
    }
  }

  const exportPdf = async () => {
    try {
      const { jsPDF } = await import('jspdf')
      const autoTableModule = await import('jspdf-autotable')
      const autoTable = autoTableModule.default || autoTableModule
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      doc.setFontSize(16)
      doc.text('Worship Team Roster', 14, 18)
      doc.setFontSize(11)
      doc.setTextColor(90)
      doc.text(`${longDate} · ${status.label}`, 14, 25)
      doc.setTextColor(0)
      autoTable(doc, {
        startY: 31,
        head: [['Role', 'Member']],
        body: assigned.length ? assigned.map((a) => [roleCategory(a.role), a.memberName || '—']) : [['—', 'No one rostered yet']],
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 10 },
      })
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [['#', 'Song', 'Key', 'Tempo', 'Led by']],
        body: songs.length ? songs.map((s, i) => [i + 1, s.name, s.key || '—', s.tempo ? `${s.tempo} BPM` : '—', s.by || '—']) : [['', 'No songs chosen yet', '', '', '']],
        headStyles: { fillColor: [124, 58, 237] },
        styles: { fontSize: 10 },
      })
      if (rehearsals.length) {
        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 8,
          head: [['Practice', 'Location', 'Notes']],
          body: rehearsals.map((r) => [sessionLabel(r), r.location || '—', r.notes || '']),
          headStyles: { fillColor: [14, 165, 233] },
          styles: { fontSize: 10 },
        })
      }
      doc.save(`worship-roster-${sunday}.pdf`)
    } catch (e) {
      console.error('exportPdf', e)
      say('Could not create the PDF.')
    }
  }

  const card = 'h-full flex flex-col rounded-2xl border border-slate-200/60 dark:border-white/10 bg-gradient-to-br from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/70 shadow-sm'
  const head = (Icon, title, count, action) => (
    <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
      <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center">
        <Icon size={15} className="text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
      </span>
      <h3 className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">
        {title}{count != null && <span className="ml-1.5 text-xs font-semibold text-slate-400">{count}</span>}
      </h3>
      {action}
    </div>
  )
  const linkBtn = (label, tab) => canManage && (
    <button type="button" onClick={() => openTab(tab)}
      className="inline-flex items-center gap-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      {label} <ChevronRight size={14} aria-hidden="true" />
    </button>
  )
  const emptyBox = (Icon, text, label, tab) => (
    <div className="flex-1 m-4 mt-1 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2 p-5 text-center">
      <Icon size={22} className="text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>
      {canManage && (
        <button type="button" onClick={() => openTab(tab)}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 shadow-sm">
          <Plus size={14} aria-hidden="true" /> {label}
        </button>
      )}
    </div>
  )
  const stepBtn = 'w-8 h-8 rounded-full flex items-center justify-center bg-white/70 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-white/80 dark:border-white/10 text-slate-700 dark:text-slate-200 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
  const actionBtn = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50'

  return (
    <div className="space-y-3">
      {/* Header — glass card with Sunday stepper, status and actions */}
      <div className="relative overflow-hidden rounded-2xl border border-white/70 dark:border-white/10 bg-gradient-to-br from-indigo-100/80 via-white/70 to-violet-100/80 dark:from-indigo-950/60 dark:via-slate-900/60 dark:to-violet-950/60 backdrop-blur-xl shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button type="button" className={stepBtn} onClick={() => setSunday(addDaysISO(sunday, -7))} aria-label="Previous Sunday">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <div className="min-w-0 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                {sunday === thisSunday ? 'Upcoming Sunday' : isPast ? 'Past Sunday' : 'Later Sunday'}
              </p>
              <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">{longDate}</p>
            </div>
            <button type="button" className={stepBtn} onClick={() => setSunday(addDaysISO(sunday, 7))} aria-label="Next Sunday">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            {sunday !== thisSunday && (
              <button type="button" onClick={() => setSunday(thisSunday)} className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline">This Sunday</button>
            )}
          </div>
          {!loading && !error && (
            <span className={`text-xs font-bold rounded-full px-2.5 py-1 ring-1 ${status.cls}`}>{status.label}</span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={exportPdf} disabled={loading || !!error}
              className={`${actionBtn} bg-white/80 dark:bg-white/10 border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/20`}>
              <FileDown size={14} aria-hidden="true" /> Export Roster PDF
            </button>
            <button type="button" onClick={share} disabled={loading || !!error}
              className={`${actionBtn} bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700`}>
              <Share2 size={14} aria-hidden="true" /> Share Schedule
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Worship team, songs and practice. The order of service is planned by Sunday Ministry.</p>
        {flash && <p role="status" className="mt-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{flash}</p>}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8" aria-busy="true">
          <div className="lg:col-span-7 h-72 rounded-2xl bg-slate-100 dark:bg-white/5 animate-pulse" />
          <div className="lg:col-span-5 h-72 rounded-2xl bg-slate-100 dark:bg-white/5 animate-pulse" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 px-1">{error}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          {/* Worship team roster — badge grid */}
          <section className={`${card} lg:col-span-7`} aria-label="Worship team roster">
            {head(Users, 'Worship team', people.length || null, linkBtn('Edit roster', 'assign'))}
            {people.length === 0 ? emptyBox(Users, 'No one is rostered for this Sunday yet.', 'Assign team', 'assign') : (
              <ul className="flex flex-col gap-3 px-4 pb-4">
                {people.map((p) => {
                  const { Icon, avatar } = roleStyle(p.roles[0])
                  const ps = practiceStatus(p.memberId)
                  return (
                    <li key={p.k} className="flex items-center gap-3 rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 px-3.5 py-3">
                      <span className={`relative w-9 h-9 flex-shrink-0 rounded-full bg-gradient-to-br ${avatar} text-white text-xs font-bold flex items-center justify-center shadow-sm`}>
                        {initials(p.name)}
                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
                          <Icon size={10} className="text-slate-700 dark:text-slate-200" aria-hidden="true" />
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words">{p.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.roles.map((r) => (
                            <span key={r} className={`text-[10px] font-semibold rounded-md px-1.5 py-0.5 ${roleStyle(r).chip}`}>{r}</span>
                          ))}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5 ${
                        ps === 'present' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : ps === 'absent' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                            : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      }`}>
                        {ps === 'present' ? 'Practised' : ps === 'absent' ? 'Missed practice' : 'Assigned'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Song list — pills; tap one for details */}
          <section className={`${card} lg:col-span-5`} aria-label="Song list">
            {head(Music2, 'Song list', songs.length || null, songs.length > 0 && linkBtn('+ Choose / Link Songs', 'assign'))}
            {songs.length === 0 ? emptyBox(Music2, 'No songs chosen for this Sunday yet.', 'Choose / Link Songs', 'assign') : (
              <ol className="px-4 pb-4 space-y-2">
                {songs.map((s, i) => {
                  const open = openSong === s.k
                  return (
                    <li key={s.k}>
                      <button type="button" aria-expanded={open} onClick={() => setOpenSong(open ? null : s.k)}
                        className={`w-full text-left rounded-xl border px-3 py-2 flex items-center gap-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                          open ? 'border-violet-300 bg-violet-50/80 dark:border-violet-400/40 dark:bg-violet-500/10' : 'border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:border-violet-300'
                        }`}>
                        <span className="w-6 h-6 flex-shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{s.name}</span>
                          {s.by && <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">Led by {s.by}</span>}
                        </span>
                        {(s.key || s.tempo) && (
                          <span className="flex-shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200 whitespace-nowrap">
                            {[s.key && `Key: ${s.key}`, s.tempo && `${s.tempo} BPM`].filter(Boolean).join(' | ')}
                          </span>
                        )}
                      </button>
                      {open && (
                        <div className="mx-2 mt-1 rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                          <p>Key: <b>{s.key || '—'}</b> · Tempo: <b>{s.tempo ? `${s.tempo} BPM` : '—'}</b></p>
                          {s.artist && <p>Artist: {s.artist}</p>}
                          {s.notes && <p className="break-words">{s.notes}</p>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

        </div>
      )}
    </div>
  )
}

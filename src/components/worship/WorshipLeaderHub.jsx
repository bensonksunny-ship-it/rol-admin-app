import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { CalendarClock, CalendarPlus, ChevronRight, Headphones, Mic2, Music2, PenSquare, Library } from 'lucide-react'
import { subscribeWorshipSchedules, getWorshipSongs } from '../../services/firestore'
import useSongScheduler from '../../hooks/useSongScheduler'
import SongViewer from '../../pages/worship/SongViewer'
import { ALTAR_CALL_LABEL, isAltarCallRole } from '../../utils/worshipRoleOrder'

const DEPARTMENT = 'Worship'

function todayISO() { return format(new Date(), 'yyyy-MM-dd') }
const fmtDate = (iso) => format(parseISO(iso), 'EEE, dd MMM yyyy')
// Same Lead Vocal-N convention as WorshipSongSchedule: slot 1 leads, 2+ co-lead,
// slot 4 leads Altar Call Worship.
const isLeadVocal = (r) => /^Lead Vocal(-\d+)?$/.test(String(r || ''))
const roleIdx = (r) => { const m = String(r || '').match(/-(\d+)$/); return m ? Number(m[1]) : 1 }

// Songs carry no dedicated audio field yet — surface whichever reference link a song
// happens to have so a "Listen" button appears once one is filled in.
function audioLinkOf(song) {
  return song?.audioUrl || song?.referenceUrl || song?.youtubeUrl || song?.link || ''
}

/**
 * Worship → "My Worship" (Worship Leader landing tab). A personal view with no
 * admin surfaces: the Sundays this leader is rostered as Lead Vocal (lead/co-lead)
 * with their own setlist, every song they're scheduled to sing (key, chart, audio)
 * and quick actions into Song Design / Schedule song / the Directory.
 */
export default function WorshipLeaderHub() {
  const navigate = useNavigate()
  const scheduler = useSongScheduler()
  const [schedules, setSchedules] = useState(null) // null = loading
  const [songs, setSongs] = useState([])
  const [viewingSong, setViewingSong] = useState(null)

  useEffect(() => subscribeWorshipSchedules(DEPARTMENT, setSchedules, () => setSchedules([])), [])
  useEffect(() => { getWorshipSongs().then(setSongs).catch(() => setSongs([])) }, [])

  const myId = scheduler.memberId
  const songById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs])
  const songByTitle = useMemo(() => new Map(songs.map((s) => [String(s.title || '').trim().toLowerCase(), s])), [songs])
  const resolveSong = (row) => songById.get(row.songId) || songByTitle.get(String(row.songName || '').trim().toLowerCase()) || null

  // Upcoming Sundays where I hold a Lead Vocal slot, each with my own song rows.
  const myDates = useMemo(() => {
    if (!myId || !schedules) return []
    const today = todayISO()
    return schedules
      .filter((s) => s.date && s.date >= today)
      .map((s) => {
        const mine = (s.assignments || []).filter((a) => a.memberId === myId && isLeadVocal(a.role))
        if (!mine.length) return null
        const leads = mine.some((a) => roleIdx(a.role) === 1)
        const altarCallOnly = mine.every((a) => isAltarCallRole(a.role))
        return { date: s.date, role: leads ? 'Lead' : altarCallOnly ? ALTAR_CALL_LABEL : 'Co-lead', rows: mine.filter((a) => a.songId || a.songName) }
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [schedules, myId])

  // Flattened "My Scheduled Songs" — one entry per song, with every date it's on.
  const mySongs = useMemo(() => {
    const map = new Map()
    for (const d of myDates) {
      for (const r of d.rows) {
        const k = r.songId || String(r.songName || '').trim().toLowerCase()
        if (!map.has(k)) map.set(k, { row: r, dates: [] })
        map.get(k).dates.push(d.date)
      }
    }
    return [...map.values()]
  }, [myDates])

  const goSongs = (sub) => navigate(`/department/worship?tab=songsDirectory${sub === 'new' ? '&newSong=1' : sub ? `&songSub=${sub}` : ''}`)

  const actions = [
    { key: 'design', label: 'Design a Song', Icon: PenSquare, onClick: () => goSongs('design') },
    { key: 'schedule', label: 'Schedule a Song', Icon: CalendarPlus, onClick: () => goSongs('schedule') },
    { key: 'directory', label: 'Song Directory', Icon: Library, onClick: () => goSongs('') },
    { key: 'upcoming', label: 'Upcoming Sunday', Icon: CalendarClock, onClick: () => navigate('/department/worship?tab=upcomingSunday') },
  ]

  const loading = schedules === null

  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {actions.map((action) => {
          const { key, label, Icon, onClick } = action
          return (
          <button
            key={key}
            type="button"
            onClick={onClick}
            className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm font-semibold text-violet-700 shadow-sm hover:bg-violet-50 transition-colors"
          >
            <Icon size={18} className="shrink-0" />
            <span className="truncate">{label}</span>
          </button>
          )
        })}
      </div>

      {!loading && !myId && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your account isn't linked to a Worship team roster entry yet (matched by name), so no scheduled dates can be shown. Ask the Worship Director to add you to The Team under the same name as your profile.
        </div>
      )}

      {/* Upcoming setlists & dates */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Mic2 size={16} className="text-violet-600" />
          <h3 className="text-sm font-bold text-slate-800">My Upcoming Setlists</h3>
        </header>
        {loading ? (
          <p className="px-4 py-4 text-sm text-slate-400">Loading…</p>
        ) : myDates.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">You aren't scheduled to lead on any upcoming Sunday.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {myDates.map((d) => (
              <li key={d.date} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">{fmtDate(d.date)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${d.role === 'Lead' ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700'}`}>{d.role}</span>
                </div>
                {d.rows.length === 0 ? (
                  <button type="button" onClick={() => goSongs('schedule')} className="mt-1.5 text-xs font-medium text-violet-600 hover:underline">
                    No songs yet — schedule your setlist
                  </button>
                ) : (
                  <ol className="mt-1.5 space-y-0.5">
                    {d.rows.map((r, i) => (
                      <li key={r.role + i} className="text-sm text-slate-600">
                        {i + 1}. {r.songName || resolveSong(r)?.title || 'Untitled'}
                        {r.key && <span className="ml-1.5 text-xs font-semibold text-slate-400">({r.key})</span>}
                        {isAltarCallRole(r.role) && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">{ALTAR_CALL_LABEL}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* My scheduled songs — practice surface */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Music2 size={16} className="text-violet-600" />
          <h3 className="text-sm font-bold text-slate-800">My Scheduled Songs</h3>
        </header>
        {loading ? (
          <p className="px-4 py-4 text-sm text-slate-400">Loading…</p>
        ) : mySongs.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">No songs scheduled to you yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {mySongs.map(({ row, dates }) => {
              const song = resolveSong(row)
              const audio = audioLinkOf(song)
              const key = row.key || song?.key
              return (
                <li key={row.songId || row.songName} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{row.songName || song?.title || 'Untitled'}</p>
                    <p className="text-xs text-slate-500">
                      {key ? `Key ${key}` : 'Key —'}
                      {song?.tempo ? ` · ${song.tempo} BPM` : ''}
                      {' · '}{dates.map((d) => format(parseISO(d), 'dd MMM')).join(', ')}
                    </p>
                  </div>
                  {audio && (
                    <a href={audio} target="_blank" rel="noreferrer" title="Listen" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
                      <Headphones size={16} />
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={!song}
                    onClick={() => setViewingSong(song)}
                    title={song ? 'Lyrics & chords' : 'Not in the Song Directory yet'}
                    className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Open <ChevronRight size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {viewingSong && (
        <SongViewer song={viewingSong} canManage onClose={() => setViewingSong(null)} />
      )}
    </div>
  )
}

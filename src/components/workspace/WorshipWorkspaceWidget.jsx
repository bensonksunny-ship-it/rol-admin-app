import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import {
  getWorshipTeamMembers,
  getWorshipSongs,
  getAllWorshipSchedules,
  getWorshipScheduleByDate,
  setWorshipScheduleByDate,
} from '../../services/firestore'
import { hasFullWorshipAccess, hasWorshipRoleAccess, isWorshipLeader } from '../../utils/worshipAccess'
import UpcomingWorship from '../../pages/worship/UpcomingWorship'
import SongViewer from '../../pages/worship/SongViewer'

// Same "forthcoming Sunday" rule used by Assign/UpcomingWorship: today if it's Sunday
// before 6pm, otherwise the next Sunday. Duplicated here (rather than imported) so this
// widget stays self-contained, same convention as UpcomingWorship.jsx itself.
function getForthcomingSunday() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 && now.getHours() < 18) return format(now, 'yyyy-MM-dd')
  const daysTo = day === 0 ? 7 : 7 - day
  const d = new Date(now)
  d.setDate(now.getDate() + daysTo)
  return format(d, 'yyyy-MM-dd')
}

function isLeadVocalRole(role) {
  return /^lead vocal/i.test(String(role || '').trim())
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

// Single unified "My Workspace" worship card — merges what used to be two stacked
// widgets (the "Share Your Song Setlist" banner and the "Hello {name}, you're
// assigned…" card) into one card so the workspace isn't showing two separate violet
// banners for what is, to the person looking at it, one topic: "what's going on with
// worship this week". "Share Setlist" surfaces as a badge in the shared header next to
// the greeting; its actual editor lives in the shared expanded body alongside the
// roster/status content that used to be the other widget's entire body.
//
// Puts "Upcoming Worship" straight on My Workspace for:
//   - anyone with account-level Worship access (Director/Founder/Admin, Worship
//     Leader, or Worship Member), same as before, OR
//   - anyone actually rostered on the worship team AND assigned in this coming
//     Sunday's schedule, regardless of what (if any) special position their account
//     holds. A vocalist/instrumentalist who is simply on the team roster previously
//     had no account-level Worship position at all, so the old `hasFullWorshipAccess
//     || hasWorshipRoleAccess` gate hid this widget from them entirely even on a
//     Sunday they're actually serving, OR
//   - anyone holding a Lead Vocal slot on any upcoming Sunday (not necessarily this
//     coming one) — they need a way in to share their setlist even if they're not
//     otherwise scheduled this week.
// No need to open the department dock's icon grid at all to see this Sunday's
// assignment/setlist. A quick read/practice surface only: "View Song" still opens the
// full arrangement, but there's no editing here — that stays inside the Worship
// department page itself.
export default function WorshipWorkspaceWidget() {
  const { userProfile } = useAuth()
  const navigate = useNavigate()
  const hasAccountWorshipAccess = hasFullWorshipAccess(userProfile) || hasWorshipRoleAccess(userProfile)
  // Worship Leader (not already a Director/Founder/Admin) gets quick links straight
  // into the Song Directory and a fresh Design flow — the dock icon stays hidden for
  // this role, so this widget is their only path in without going through My Workspace.
  const isLeaderOnly = isWorshipLeader(userProfile) && !hasFullWorshipAccess(userProfile)

  // Always collapsed on launch/reload — only the header banner ("Hello X, you're
  // assigned...") + "More" toggle shows until the user explicitly opens it, regardless
  // of whether they're scheduled this Sunday or have a setlist to share.
  const [expanded, setExpanded] = useState(false)
  const [allMembers, setAllMembers] = useState([])
  const [songs, setSongs] = useState([])
  // Every worship_schedule doc — feeds both "am I scheduled this coming Sunday" and
  // "which upcoming Sundays am I leading (Lead Vocal) on", one fetch instead of two.
  const [schedules, setSchedules] = useState([])
  const [viewingSong, setViewingSong] = useState(null)
  const [viewSongMode, setViewSongMode] = useState(null)
  // Overrides myWorshipMember's static profile positions when a caller (e.g. the
  // Combined Song Design & Parts card) already knows exactly which role(s) this
  // person is assigned for that specific song this week.
  const [viewSongPositions, setViewSongPositions] = useState(null)

  // "Share Your Song Setlist" state — a self-service prompt for whoever is scheduled
  // as Lead Vocal (any Lead Vocal-N slot) on an upcoming Sunday, regardless of their
  // account role. Lets them pick their own songs/keys/notes for that date without
  // needing the Director to type it in on the Assign page. Writes straight to the
  // same worship_schedule document the Assign tab reads (read-fresh, merge, write),
  // so it's visible there the next time anyone opens/reloads that page.
  //
  // This also doubles as the "which date's roster/status am I viewing below" state —
  // defaults to the actual coming Sunday so that view is never lost, and a pill lets
  // the user switch to any Sunday they're leading beyond that.
  const [selectedDate, setSelectedDate] = useState(() => getForthcomingSunday())
  const [setlistRows, setSetlistRows] = useState([])
  const [loadingSetlistRows, setLoadingSetlistRows] = useState(false)
  const [searchOpenIdx, setSearchOpenIdx] = useState(null)
  const [sharingSetlist, setSharingSetlist] = useState(false)
  const [setlistShared, setSetlistShared] = useState(false)

  // Loaded for every signed-in user, not just accounts with a special Worship
  // position — an ordinary rostered team member needs this data just to find out
  // whether they're serving this Sunday, which is what decides whether this widget
  // shows for them at all (see canSeeWidget below).
  useEffect(() => {
    getWorshipTeamMembers('Worship').then(setAllMembers).catch(() => setAllMembers([]))
    getWorshipSongs().then(setSongs).catch(() => setSongs([]))
    getAllWorshipSchedules('Worship').then(setSchedules).catch(() => setSchedules([]))
  }, [])

  const myName = userProfile?.name?.trim().toLowerCase()
  const myWorshipMember = myName ? allMembers.find(m => m.name?.trim().toLowerCase() === myName) : null

  const forthcomingSunday = getForthcomingSunday()
  const scheduledMemberIds = useMemo(() => {
    const sch = schedules.find(s => s.date === forthcomingSunday)
    return new Set((sch?.assignments || []).map(a => a.memberId).filter(Boolean))
  }, [schedules, forthcomingSunday])
  const isScheduledThisSunday = !!myWorshipMember && scheduledMemberIds.has(myWorshipMember.id)
  const myFirstName = (myWorshipMember?.name || userProfile?.name || userProfile?.displayName || '').trim().split(/\s+/)[0]

  // Every upcoming (today or later) Sunday where I hold at least one Lead Vocal slot.
  const myLeadingDates = useMemo(() => {
    if (!myWorshipMember) return []
    const today = todayStr()
    return schedules
      .filter(s => s.date >= today && (s.assignments || []).some(a => a.memberId === myWorshipMember.id && isLeadVocalRole(a.role)))
      .map(s => s.date)
      .sort()
  }, [schedules, myWorshipMember])
  const canShareSetlist = myLeadingDates.length > 0

  // Every date selectable in the pill bar — the actual coming Sunday always included
  // (so that view is never unreachable) plus every Sunday this person leads, deduped
  // and sorted so the pills read chronologically.
  const selectableDates = useMemo(() => {
    const set = new Set([forthcomingSunday, ...myLeadingDates])
    return Array.from(set).sort()
  }, [forthcomingSunday, myLeadingDates])

  // Re-fetch fresh (not the possibly-stale bulk `schedules` snapshot) whenever the
  // selected date changes, so editing always starts from the latest saved data.
  useEffect(() => {
    if (!myWorshipMember) { setSetlistRows([]); return }
    let alive = true
    setLoadingSetlistRows(true)
    getWorshipScheduleByDate('Worship', selectedDate)
      .then(sch => {
        if (!alive) return
        const mine = (sch.assignments || []).filter(a => a.memberId === myWorshipMember.id && isLeadVocalRole(a.role))
        setSetlistRows(mine.map(a => ({ ...a })))
        setSetlistShared(false)
      })
      .finally(() => { if (alive) setLoadingSetlistRows(false) })
    return () => { alive = false }
  }, [selectedDate, myWorshipMember])

  const canSeeWidget = hasAccountWorshipAccess || isScheduledThisSunday || canShareSetlist
  if (!canSeeWidget) return null

  const openSongView = (song, mode = null, positions = null) => {
    setViewSongMode(mode)
    setViewSongPositions(positions)
    setViewingSong(song)
  }

  // Matches DepartmentWorship.jsx's canEditSong exactly (Director/Founder/Admin see
  // everything; a Worship Leader only their own designed songs) — gates "View Song"
  // (the full team arrangement) the same way it does on the Worship page itself.
  const canViewFullSong = (song) => {
    if (hasFullWorshipAccess(userProfile)) return true
    if (!isWorshipLeader(userProfile)) return false
    const designer = String(song?.designedBy || song?.createdBy || '').trim().toLowerCase()
    return !!myName && designer === myName
  }

  const updateSetlistRow = (idx, patch) =>
    setSetlistRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  // Read-modify-write: fetch the latest doc right before saving and only touch this
  // person's own role rows, so a concurrent edit to someone else's role (e.g. the
  // Director assigning a different vocalist) in between isn't clobbered.
  const handleShareSetlist = async () => {
    setSharingSetlist(true)
    try {
      const fresh = await getWorshipScheduleByDate('Worship', selectedDate)
      const assignments = (fresh.assignments || []).map(a => {
        const mine = setlistRows.find(r => r.role === a.role)
        return mine ? { ...a, songName: mine.songName || '', songId: mine.songId || '', key: mine.key || '', notes: mine.notes || '' } : a
      })
      await setWorshipScheduleByDate('Worship', selectedDate, assignments, userProfile?.email)
      setSetlistShared(true)
      setTimeout(() => setSetlistShared(false), 3000)
    } finally {
      setSharingSetlist(false)
    }
  }

  const highlighted = isScheduledThisSunday || canShareSetlist

  return (
    <>
      <div className={`rounded-2xl border shadow-sm overflow-hidden max-w-2xl ${
        highlighted ? 'border-violet-300' : 'border-slate-200 bg-white'
      }`}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
            isScheduledThisSunday
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700'
              : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <span className={`text-sm font-bold truncate ${isScheduledThisSunday ? 'text-white' : 'text-slate-800'}`}>
            {isScheduledThisSunday ? `Hello ${myFirstName || 'there'}, you are assigned for the worship team this week` : 'Upcoming Worship'}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {/* "Share Your Song Setlist" — surfaced as a badge right in the shared header
                instead of its own separate banner above this card. */}
            {canShareSetlist && (
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${
                isScheduledThisSunday ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'
              }`}>
                Share Setlist
              </span>
            )}
            <span className={`flex items-center gap-1 text-xs ${isScheduledThisSunday ? 'text-white/90 font-semibold' : 'text-slate-400'}`}>
              {isScheduledThisSunday && 'More'}
              <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
            </span>
          </span>
        </button>
        {expanded && (
          <div className="border-t border-slate-100 bg-white p-4 space-y-4">
            {isLeaderOnly && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => navigate('/department/worship?tab=songsDirectory')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors">
                  Song Directory
                </button>
                <button type="button" onClick={() => navigate('/department/worship?tab=songsDirectory&newSong=1')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors">
                  <span className="text-sm leading-none">+</span> Design My Song
                </button>
              </div>
            )}

            {/* Share Your Song Setlist — same card window, own bordered section rather
                than a separate stacked banner. */}
            {canShareSetlist && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">Share Your Song Setlist</p>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Viewing</span>
                  {selectableDates.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDate(d)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        selectedDate === d
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-700'
                      }`}
                    >
                      {d === forthcomingSunday ? 'Coming Sunday' : format(new Date(d + 'T12:00:00'), 'EEE d MMM')}
                    </button>
                  ))}
                </div>

                {loadingSetlistRows ? (
                  <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
                ) : (
                  <div className="space-y-3">
                    {setlistRows.map((row, idx) => {
                      const q = (row.songName || '').toLowerCase()
                      // Only suggest songs this person personally designed — everyone can still
                      // type any freeform song name (the <input> below has no such restriction),
                      // but the autocomplete/select-from-catalog path is scoped to their own
                      // designs so they're never offered another leader's song to pick.
                      const matches = songs
                        .filter(s => {
                          const designer = String(s?.designedBy || s?.createdBy || '').trim().toLowerCase()
                          return !!myName && designer === myName
                        })
                        .filter(s => !q || s.title?.toLowerCase().includes(q))
                        .slice(0, 8)
                      const linkedSong = row.songId ? songs.find(s => s.id === row.songId) : null
                      return (
                        <div key={row.role} className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-600 mb-2">{row.role}</p>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={row.songName || ''}
                                placeholder="Search songs or type a name"
                                onChange={e => updateSetlistRow(idx, { songName: e.target.value, songId: '', key: '' })}
                                onFocus={() => setSearchOpenIdx(idx)}
                                onBlur={() => setTimeout(() => setSearchOpenIdx(i => (i === idx ? null : i)), 150)}
                                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                              />
                              {searchOpenIdx === idx && matches.length > 0 && (
                                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                  {matches.map(s => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={() => { updateSetlistRow(idx, { songName: s.title, key: s.key || '', songId: s.id }); setSearchOpenIdx(null) }}
                                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 flex items-center justify-between gap-2"
                                    >
                                      <span className="truncate font-medium text-slate-700">{s.title}</span>
                                      {s.key && <span className="text-xs text-indigo-600 font-semibold shrink-0">{s.key}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input
                              type="text"
                              value={row.key || ''}
                              placeholder="Key"
                              onChange={e => updateSetlistRow(idx, { key: e.target.value })}
                              className="w-16 px-2 py-1.5 text-sm text-center rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                            />
                          </div>
                          {linkedSong && (
                            <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] font-semibold text-indigo-700">
                              ✓ Design linked{linkedSong.key ? ` · ${linkedSong.key}` : ''}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <button
                  type="button"
                  disabled={sharingSetlist || loadingSetlistRows || setlistRows.length === 0}
                  onClick={handleShareSetlist}
                  className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 transition-all active:scale-[0.98]"
                >
                  {sharingSetlist ? 'Sharing…' : setlistShared ? '✓ Shared with the team' : 'Share Setlist'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                  The team will see this on the Assign page next time they open it.
                </p>
              </div>
            )}

            <UpcomingWorship
              myWorshipMember={myWorshipMember}
              songs={songs}
              onViewSong={openSongView}
              canViewFullSong={canViewFullSong}
              selectedDate={selectedDate}
            />
          </div>
        )}
      </div>
      {viewingSong && (
        <SongViewer
          song={viewingSong}
          canManage={false}
          myPositions={viewSongPositions || myWorshipMember?.positions || []}
          initialViewMode={viewSongMode}
          onClose={() => setViewingSong(null)}
          onEdit={() => {}}
        />
      )}
    </>
  )
}

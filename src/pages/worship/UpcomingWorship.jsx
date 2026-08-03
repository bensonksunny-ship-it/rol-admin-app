import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { CheckCircle2, CalendarDays, UserPlus } from 'lucide-react'
import { getWorshipScheduleByDate } from '../../services/firestore'
import { sortByWorshipRole } from '../../utils/worshipRoleOrder'

// Maps an assignment role's category (see ROLE_CATEGORIES/parseRoleKey in
// DepartmentWorship.jsx — duplicated here so this page stays self-contained) to the
// position label SongViewer's `myPositions` prop expects, so "My Part" for a given
// song can be filtered by exactly the role(s) this person is assigned this week —
// not just whatever's on their static team-roster profile.
const ROLE_CATEGORY_TO_POSITION = {
  'Lead Vocal':      'Lead vocal',
  'Parts':           'Parts',
  'Choir member':    'Choir',
  'Keyboard':        'Keyboard',
  'Lead Guitar':      'Lead guitar',
  'Bass Guitar':      'Bass',
  'Acoustic guitar': 'Guitar',
  'Drums':           'Drums',
}

// Strips a role key's numeric row suffix (e.g. "Parts-1" → "Parts") — mirrors
// DepartmentWorship.jsx's own parseRoleKey.
function roleCategoryOf(role) {
  const m = String(role || '').match(/^(.*)-(\d+)$/)
  return m ? m[1] : role
}

// Role categories that already cover someone's vocal backing duties explicitly —
// when a Lead Vocalist also holds one of these, it takes priority over the automatic
// Choir/Backing Vocal fallback below rather than stacking on top of it.
const EXPLICIT_BACKING_CATEGORIES = new Set(['Parts', 'Choir member'])

// Same "forthcoming Sunday" rule used by the Assign tab: today if it's Sunday before
// 6pm, otherwise the next Sunday.
function getForthcomingSunday() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 && now.getHours() < 18) return format(now, 'yyyy-MM-dd')
  const daysTo = day === 0 ? 7 : 7 - day
  const d = new Date(now)
  d.setDate(now.getDate() + daysTo)
  return format(d, 'yyyy-MM-dd')
}

function formatDisplay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'EEEE, d MMMM yyyy')
}

// Roster cards show only the first name (e.g. "Eric" not "Eric Fernandes") to keep
// each card compact — the full name is still available via the member roster elsewhere.
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

// A focused, personal page — distinct from the shared multi-department "Upcoming
// Sunday" programme designer: its only job is to answer "am I serving this week?"
// and "what are we playing?", not to plan screen/video/camera/lighting cues.
//
// `selectedDate` lets a caller (e.g. the "Share Your Song Setlist" date-pill selector
// in WorshipWorkspaceWidget) drive which Sunday's roster/status/setlist this shows —
// falls back to the forthcoming Sunday when no date is picked, same as before.
export default function UpcomingWorship({ myWorshipMember, songs, onViewSong, canViewFullSong, selectedDate, canAssignTeam }) {
  const sundayDate = selectedDate || getForthcomingSunday()
  const navigate = useNavigate()
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getWorshipScheduleByDate('Worship', sundayDate)
      .then(setSchedule)
      .catch(() => setSchedule(null))
      .finally(() => setLoading(false))
  }, [sundayDate])

  // Sorted by role schema (Lead Vocal-1, -2, -3, -4... → Parts → Choir member → ...)
  // rather than array push order, so dynamically-added/secondary roles like "Lead
  // Vocal-4" render right after "Lead Vocal-3" instead of wherever they were saved.
  const assignments = sortByWorshipRole((schedule?.assignments || []).filter(a => a.memberId || a.songName))
  const myAssignments = myWorshipMember
    ? assignments.filter(a => a.memberId === myWorshipMember.id)
    : []
  const isAssigned = myAssignments.length > 0

  // Only Lead Vocal roles ever get a Song Name entered against them in the Assign tab
  // (that field is Lead-Vocal-only there) — every other role's own assignment entry
  // never carries songId/songName. Since the whole team plays through the same
  // setlist regardless of instrument, the service's overall song list (any entry with
  // song info, from whichever Lead Vocal(s) it's attached to) is what a Bass/Drums/
  // Keys/etc. player actually needs "My Part" for — not a song tied to their own
  // (always blank) role entry.
  const serviceSongEntries = assignments.filter(a => a.songId || a.songName)

  // Combined Song Design & Parts: a team member can be assigned more than one role
  // for the same service (e.g. Parts-1 AND Lead Guitar) — sometimes on the same song,
  // sometimes on different ones. Group this person's assignments by song so each song
  // they need to prepare shows exactly once, carrying every role badge tied to it and
  // a single "My Part" filter that's the union of all those roles' instrument keys —
  // rather than one row per role, or a filter based only on their static profile.
  const mySongGroupsMap = new Map()
  const ensureSongGroup = (entry) => {
    const groupKey = entry.songId || `name:${entry.songName}`
    if (!mySongGroupsMap.has(groupKey)) {
      mySongGroupsMap.set(groupKey, {
        song: entry.songId ? songs?.find(s => s.id === entry.songId) : null,
        songName: entry.songName,
        key: entry.key,
        roles: [],
        positions: new Set(),
      })
    }
    return mySongGroupsMap.get(groupKey)
  }

  for (const a of myAssignments) {
    const posLabel = ROLE_CATEGORY_TO_POSITION[roleCategoryOf(a.role)]
    // This role carries its own song directly (Lead Vocal) — one group for it.
    // Otherwise (every other role), it applies across the whole service setlist.
    const ownSongEntries = (a.songId || a.songName) ? [a] : serviceSongEntries
    for (const entry of ownSongEntries) {
      const group = ensureSongGroup(entry)
      group.roles.push(a.role)
      if (posLabel) group.positions.add(posLabel)
    }
  }

  // Automatic Choir / Backing Vocal fallback: a Lead Vocalist (Lead Vocal-1, -2, etc.)
  // is implicitly part of the Choir/Backing Vocals for every OTHER song in the setlist
  // besides the one they're actually leading — the "My Part" filter for those other
  // songs should still surface harmony parts for them, not nothing. Two exceptions:
  // their own lead song stays Lead Vocal-only (no Choir added there), and an explicit
  // backing assignment (Parts/Choir member) takes priority over this fallback rather
  // than stacking a redundant auto-badge on top of it.
  const hasLeadVocalRole = myAssignments.some(a => roleCategoryOf(a.role) === 'Lead Vocal')
  const hasExplicitBackingRole = myAssignments.some(a => EXPLICIT_BACKING_CATEGORIES.has(roleCategoryOf(a.role)))
  if (hasLeadVocalRole && !hasExplicitBackingRole) {
    const myLeadSongKeys = new Set(
      myAssignments
        .filter(a => roleCategoryOf(a.role) === 'Lead Vocal' && (a.songId || a.songName))
        .map(a => a.songId || `name:${a.songName}`)
    )
    for (const entry of serviceSongEntries) {
      const groupKey = entry.songId || `name:${entry.songName}`
      if (myLeadSongKeys.has(groupKey)) continue
      const group = ensureSongGroup(entry)
      group.positions.add('Choir')
      if (!group.roles.includes('Choir (auto)')) group.roles.push('Choir (auto)')
    }
  }
  const mySongGroups = Array.from(mySongGroupsMap.values())

  if (loading) {
    return <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
  }

  return (
    <div className="space-y-4 w-full">
      {/* Single status header — the date and "am I serving" state combined, so there's
          no separate title card repeating "Upcoming Worship" above this. */}
      {myWorshipMember && isAssigned ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/30">
            <CheckCircle2 size={18} className="text-white" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-900 leading-snug truncate">
              You're serving on {formatDisplay(sundayDate)}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {myAssignments.map((a, i) => (
                <span key={i} className="text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 px-2.5 py-0.5 rounded-full shadow-sm">
                  {a.role}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
            <CalendarDays size={16} className="text-slate-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-snug truncate">{formatDisplay(sundayDate)}</p>
            <p className="text-sm text-slate-500 mt-0.5">
              {myWorshipMember
                ? "You're not currently assigned for this date."
                : "We couldn't match your login to a team roster entry — ask your Worship Director to check your name matches the team list."}
            </p>
          </div>
        </div>
      )}

      {/* Full team roster — song name + View Song/My Part actions live inline on each
          assigned vocalist's own row rather than a separate setlist card. */}
      {assignments.filter(a => a.memberId).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Worship Team — {format(new Date(sundayDate + 'T12:00:00'), 'EEE, d MMM')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
            {assignments.filter(a => a.memberId).map((a, i) => {
              const isMe = myWorshipMember && a.memberId === myWorshipMember.id
              const linkedSong = a.songId ? songs?.find(s => s.id === a.songId) : null
              // "My Part" only ever shows on this person's own ("YOU") row. It opens
              // whichever of their combined song groups this exact row's own song
              // matches (true for a Lead Vocal row, which carries its own songId) —
              // or, since every other role's own entry never carries song info at all
              // (only Lead Vocal gets a Song Name field in the Assign tab), falls back
              // to the first of their combined groups so a Bass/Drums/Keys player still
              // has a way in instead of "My Part" just disappearing for their role.
              const rowGroupKey = a.songId ? a.songId : (a.songName ? `name:${a.songName}` : null)
              const myGroupForRow = (isMe && rowGroupKey) ? mySongGroupsMap.get(rowGroupKey) : null
              const myPartGroup = myGroupForRow || (isMe ? mySongGroups[0] : null)
              const canViewMine = !!(isMe && myPartGroup?.song)
              return (
                <div
                  key={i}
                  role={canViewMine ? 'button' : undefined}
                  tabIndex={canViewMine ? 0 : undefined}
                  onClick={canViewMine ? () => onViewSong(myPartGroup.song, 'mine', Array.from(myPartGroup.positions)) : undefined}
                  onKeyDown={canViewMine ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewSong(myPartGroup.song, 'mine', Array.from(myPartGroup.positions)) }
                  } : undefined}
                  className={`flex flex-col gap-1.5 rounded-xl border p-3 transition-colors ${
                    isMe ? 'bg-emerald-50 border-emerald-300' : 'border-slate-200 bg-white'
                  } ${canViewMine ? 'cursor-pointer hover:bg-emerald-50/80' : ''}`}
                >
                  {/* Top row: role pill left, first name + YOU badge right — kept on one
                      line since neither side wraps or grows unpredictably. */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg shrink-0">
                      {a.role}
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-slate-800 truncate">{firstName(a.memberName)}</span>
                      {isMe && <span className="text-[10px] font-bold text-white bg-emerald-500 px-2 py-0.5 rounded-full shrink-0">YOU</span>}
                    </span>
                  </div>

                  {/* Bottom row: linked song title, truncated with a hover tooltip so a
                      long title never crowds or wraps against the key pill. */}
                  {a.songName && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-sm font-semibold tracking-tight text-indigo-600 truncate max-w-[180px]"
                        title={a.songName}
                      >
                        "{a.songName}"
                      </span>
                      {a.key && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-purple-100/60 text-purple-700 font-mono rounded-full">
                          {a.key}
                        </span>
                      )}
                    </div>
                  )}

                  {(linkedSong || canViewMine) && (
                    <div className="flex items-center gap-1.5">
                      {/* "View Song" is the master copy (full lyrics/chords, every role tag) —
                          restricted to whoever can manage this song (Director/Founder always,
                          or the Worship Leader who personally designed it). It stays its own
                          button (stopPropagation so it doesn't also trigger the card's "My
                          Part" click) since it's a distinct, narrower-audience action. */}
                      {linkedSong && canViewFullSong?.(linkedSong) && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onViewSong(linkedSong, 'full') }}
                          className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors">
                          View Song
                        </button>
                      )}
                      {/* "My Part" — only ever on this person's own ("YOU") card. A real
                          button (not just a badge) so it's a clear, independently clickable
                          action even though the whole card is also clickable for the same
                          result; stopPropagation avoids double-firing onViewSong. */}
                      {canViewMine && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onViewSong(myPartGroup.song, 'mine', Array.from(myPartGroup.positions)) }}
                          className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition-colors">
                          View My Part
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Placeholder for a selectable Sunday (see selectableDates in
          WorshipWorkspaceWidget) that has no roster or setlist created yet — e.g. an
          in-between Sunday nobody's been assigned to. Without this, picking such a
          date just showed an empty page with no explanation. */}
      {assignments.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-6 text-center">
          <p className="text-sm text-slate-500">No team assignments or setlist created for this date yet.</p>
          {canAssignTeam && (
            <button
              type="button"
              onClick={() => navigate(`/department/worship?tab=assign&assignDate=${sundayDate}`)}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm transition"
            >
              <UserPlus size={14} />
              Assign Team for {format(new Date(sundayDate + 'T12:00:00'), 'd MMM')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

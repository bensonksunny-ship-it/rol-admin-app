import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, CheckCircle2, Download, Pencil, Trash2, MoreVertical, Wallet, Banknote, X, Plus, Music2, Search, Eye, Mic2, Users, Guitar, Volume2 } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import {
  getDepartmentEntries,
  addDepartmentEntry,
  getWorshipTeamMembers,
  addWorshipTeamMember,
  getWorshipScheduleByDate,
  getAllWorshipSchedules,
  updateWorshipScheduleById,
  setWorshipScheduleByDate,
  getWorshipRehearsals,
  getWorshipRehearsalByDate,
  addWorshipRehearsal,
  updateWorshipRehearsal,
  deleteWorshipRehearsal,
  updateWorshipTeamMember,
  deleteWorshipTeamMember,
  getWorshipBudgetItems,
  addWorshipBudgetItem,
  updateWorshipBudgetItem,
  deleteWorshipBudgetItem,
  getMergedPeopleDirectory,
  getWorshipApplications,
  getWorshipSongs,
  addWorshipSong,
  updateWorshipSong,
  deleteWorshipSong,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ReferenceLine, Cell } from 'recharts'
import { format, subMonths, subDays, addDays, differenceInDays, differenceInYears, differenceInMonths, addYears, addMonths } from 'date-fns'
import { formatDMY } from '../utils/date'
import { isWorshipLeader, hasWorshipRoleAccess, getAllowedWorshipTabs } from '../utils/worshipAccess'
import { getDepartmentRole } from '../utils/access'
import { getDepartmentHubTabs } from '../constants/departmentTabs'
import DeptExpenseTab from '../components/DeptExpenseTab'
import AdvancePayoutTab from '../components/AdvancePayoutTab'
import BudgetPage from './accounts/BudgetPage'
import UpcomingSunday from './UpcomingSunday'
import SongDesigner from './worship/SongDesigner'
import SongViewer from './worship/SongViewer'

const DEPARTMENT = 'Worship'
const PERIOD = format(new Date(), 'yyyy-MM')

// Song directory cards cycle through these full color themes (gradient wash + title +
// chip) for distinct, vibrant pops rather than a flat white card with a thin accent line
const SONG_CARD_THEMES = [
  { border: 'border-indigo-500',  bg: 'bg-gradient-to-br from-indigo-50 to-white',   title: 'text-indigo-900',  chip: 'bg-indigo-100 text-indigo-700' },
  { border: 'border-violet-500',  bg: 'bg-gradient-to-br from-violet-50 to-white',   title: 'text-violet-900',  chip: 'bg-violet-100 text-violet-700' },
  { border: 'border-emerald-500', bg: 'bg-gradient-to-br from-emerald-50 to-white',  title: 'text-emerald-900', chip: 'bg-emerald-100 text-emerald-700' },
  { border: 'border-amber-500',   bg: 'bg-gradient-to-br from-amber-50 to-white',    title: 'text-amber-900',   chip: 'bg-amber-100 text-amber-700' },
  { border: 'border-rose-500',    bg: 'bg-gradient-to-br from-rose-50 to-white',     title: 'text-rose-900',    chip: 'bg-rose-100 text-rose-700' },
  { border: 'border-sky-500',     bg: 'bg-gradient-to-br from-sky-50 to-white',      title: 'text-sky-900',     chip: 'bg-sky-100 text-sky-700' },
]

// Role categories on the left of the assign table (master list per service). Each
// category shows exactly 1 row by default; "+ Add" appends another. The first row's
// key matches the legacy hardcoded slot names exactly (see roleKeyFor) so schedules
// saved before this became dynamic keep resolving to the same row.
const ROLE_CATEGORIES = [
  'Lead Vocal',
  'Parts',
  'Choir member',
  'Keyboard',
  'Lead Guitar',
  'Bass Guitar',
  'Acoustic guitar',
  'Drums',
  'Sound Engineer',
]

// Categories whose legacy first-row key already carried a "-1" suffix — everything
// else's first row was always bare (e.g. "Sound Engineer", not "Sound Engineer-1").
const LEGACY_DASH_ONE_CATEGORIES = new Set(['Lead Vocal', 'Parts', 'Choir member'])

function roleKeyFor(category, index) {
  if (index === 1) return LEGACY_DASH_ONE_CATEGORIES.has(category) ? `${category}-1` : category
  return `${category}-${index}`
}

// Inverse of roleKeyFor — splits a role key back into its category + row index.
function parseRoleKey(role) {
  const m = role.match(/^(.*)-(\d+)$/)
  if (!m) return { category: role, index: 1 }
  return { category: m[1], index: parseInt(m[2], 10) }
}

function countAssignedCategories(list) {
  return new Set(list.filter((a) => a.memberId).map((a) => parseRoleKey(a.role).category)).size
}

// Friendlier display names for a couple of role categories — everything else in
// ROLE_CATEGORIES already reads fine as-is.
const ROLE_CATEGORY_LABELS = {
  'Choir member': 'Choir / Backup',
  'Bass Guitar': 'Bass',
  'Acoustic guitar': 'Acoustic Guitar',
  'Sound Engineer': 'Sound',
}
function roleCategoryLabel(category) {
  return ROLE_CATEGORY_LABELS[category] || category
}

// Individual Record modal's Role Summary buckets — folds the raw per-category
// counts (byCategory) into the small set of groups worship leaders actually
// think in, rather than a card-per-instrument breakdown.
const ROLE_SUMMARY_GROUPS = [
  { key: 'leadVocal', label: 'Lead Vocal', icon: Mic2, categories: ['Lead Vocal'] },
  { key: 'partsBacking', label: 'Parts / Backing Vocal', icon: Users, categories: ['Parts', 'Choir member'] },
  { key: 'instrumental', label: 'Instrumental', icon: Guitar, categories: ['Lead Guitar', 'Acoustic guitar', 'Bass Guitar', 'Keyboard', 'Drums'] },
  { key: 'soundTech', label: 'Sound / Tech', icon: Volume2, categories: ['Sound Engineer'] },
]
function summarizeRoleGroups(byCategory) {
  return ROLE_SUMMARY_GROUPS.map((g) => ({
    ...g,
    count: g.categories.reduce((sum, cat) => sum + (byCategory?.[cat] || 0), 0),
  }))
}

// Compact abbreviations for the Assign tab's row label — full category names
// (e.g. "Acoustic guitar") eat too much horizontal space next to the member
// dropdown, especially on mobile cards. Row keys/data are unaffected; this only
// changes what's displayed (see roleDisplayLabel, which reuses roleKeyFor's own
// "-N" suffix logic so abbreviated labels still line up with saved assignments).
const ROLE_LABEL_ABBR = {
  'Lead Vocal': 'L Vocal',
  'Choir member': 'Choir',
  'Lead Guitar': 'L Guitar',
  'Acoustic guitar': 'A Guitar',
  'Bass Guitar': 'B Guitar',
  'Sound Engineer': 'Sound Eng',
}
function roleDisplayLabel(role) {
  const { category, index } = parseRoleKey(role)
  const abbr = ROLE_LABEL_ABBR[category] || category
  if (index === 1) return LEGACY_DASH_ONE_CATEGORIES.has(category) ? `${abbr}-1` : abbr
  return `${abbr}-${index}`
}

// Cumulative per-member song/role history across every published Sunday setlist.
// Only a Lead Vocal row carries its own song directly (see the Assign tab's Song Name
// field) — every other role's assignment that same Sunday applies across the whole
// service, so it's credited with every distinct song that Sunday actually had (the
// same "service-wide" convention UpcomingWorship.jsx's combined song groups use),
// not just a flat "1 service = 1 song".
function computeMemberSongStats(schedules) {
  const stats = {}
  const ensure = (id) => {
    if (!stats[id]) stats[id] = { total: 0, byCategory: {} }
    return stats[id]
  }
  for (const s of schedules || []) {
    const assignments = (s.assignments || []).filter((a) => a.memberId)
    if (assignments.length === 0) continue
    const serviceSongs = []
    const seenSongs = new Set()
    for (const a of assignments) {
      if (!a.songId && !a.songName) continue
      const key = a.songId || `name:${a.songName}`
      if (seenSongs.has(key)) continue
      seenSongs.add(key)
      serviceSongs.push({ songName: a.songName || '(untitled)', key: a.key || '' })
    }
    for (const a of assignments) {
      const { category } = parseRoleKey(a.role)
      const bucket = ensure(a.memberId)
      const songsForThisRole = (a.songId || a.songName)
        ? [{ songName: a.songName || '(untitled)', key: a.key || '' }]
        : serviceSongs
      if (songsForThisRole.length === 0) continue
      bucket.total += songsForThisRole.length
      bucket.byCategory[category] = (bucket.byCategory[category] || 0) + songsForThisRole.length
    }
  }
  return stats
}

const MEMBER_POSITIONS = [
  'Lead vocal',
  'Parts',
  'Choir',
  'Lead guitar',
  'Guitar',
  'Bass',
  'Keyboard',
  'Drums',
  'Sound engineer',
  'Media',
]

function upcomingSundays(count = 5) {
  const result = []
  const today = new Date()
  const daysToNext = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const first = new Date(today)
  first.setDate(today.getDate() + daysToNext)
  for (let i = 0; i < count; i++) {
    const d = new Date(first)
    d.setDate(first.getDate() + i * 7)
    result.push(format(d, 'yyyy-MM-dd'))
  }
  return result
}

// Returns the forthcoming Sunday date string.
// If today IS Sunday and before 18:00, returns today; after 18:00 returns next Sunday.
function getForthcomingSunday() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 && now.getHours() < 18) return format(now, 'yyyy-MM-dd')
  const daysTo = day === 0 ? 7 : 7 - day
  const d = new Date(now)
  d.setDate(now.getDate() + daysTo)
  return format(d, 'yyyy-MM-dd')
}

// True only for a 'yyyy-MM-dd' string that actually falls on a Sunday. Anchored to
// noon (not midnight) so the day-of-week check is never off by one from a timezone
// shift — same convention as every other raw-date-string parse in this file.
function isSundayDateStr(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T12:00:00')
  return !isNaN(d.getTime()) && d.getDay() === 0
}

// Snaps a possibly-non-Sunday 'yyyy-MM-dd' string forward to the nearest Sunday —
// used to normalize the "pick a custom date" service-date inputs (Summary/Assign
// headers) so a stray weekday pick can never get saved as a service record.
function snapToSunday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  const diff = (7 - d.getDay()) % 7
  d.setDate(d.getDate() + diff)
  return format(d, 'yyyy-MM-dd')
}

const CATEGORY_POSITION_KEY = {
  'Lead Vocal': 'Lead vocal',
  'Parts': 'Parts',
  'Choir member': 'Choir',
  'Lead Guitar': 'Lead guitar',
  'Acoustic guitar': 'Guitar',
  'Bass Guitar': 'Bass',
  'Keyboard': 'Keyboard',
  'Drums': 'Drums',
  'Sound Engineer': 'Sound engineer',
}

function positionKeyForRole(role) {
  return CATEGORY_POSITION_KEY[parseRoleKey(role).category] || null
}

const DEMO_TEAM = [
  { name: 'Leonard', memberSince: '2022-04-25' },
  { name: 'Archana', memberSince: '2019-12-03' },
  { name: 'Janet', memberSince: '2022-06-10' },
  { name: 'Aneesh', memberSince: '2022-06-03' },
  { name: 'Adi', memberSince: '2018-06-03' },
  { name: 'Sri', memberSince: '2018-06-03' },
  { name: 'Blessly', memberSince: '2024-12-10' },
  { name: 'Dixcy', memberSince: '2025-01-03' },
  { name: 'Joyson', memberSince: '2025-12-07' },
  { name: 'Teji', memberSince: '2025-12-16' },
  { name: 'Jerusha', memberSince: '2025-12-07' },
  { name: 'Eric', memberSince: '2024-01-15' },
  { name: 'Chelsea', memberSince: '2024-01-15' },
  { name: 'Shimona', memberSince: '2020-12-03' },
  { name: 'Surya', memberSince: '2019-11-03' },
]

const SERVICE_FLOW = [
  { segment: 'Pre-service', item: 'Welcome & Setup', duration: '10 min' },
  { segment: 'Opening', item: 'Praise & Worship (3–4 songs)', duration: '25 min' },
  { segment: 'Sermon', item: 'Pastoral Message', duration: '35 min' },
  { segment: 'Response', item: 'Response Worship / Altar Call', duration: '10 min' },
  { segment: 'Closing', item: 'Final Song & Benediction', duration: '5 min' },
]

function WorshipStamp({ stamp, isOpen, onToggle, onEdit }) {
  const assignedRoles = stamp.assignments.filter((a) => a.memberId)
  let formattedDate = stamp.date
  try { formattedDate = format(new Date(stamp.date), 'EEE d MMM yyyy') } catch {}
  return (
    <motion.div
      layoutId="assign-card"
      key="stamp"
      className="bg-white/75 backdrop-blur-md border border-white/30 rounded-2xl shadow-lg p-4"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <CheckCircle2 size={17} className="text-emerald-500 flex-shrink-0" />
          <span className="font-semibold text-slate-800 text-sm">Worship</span>
          <span className="text-slate-400 text-sm">|</span>
          <span className="text-slate-700 text-sm truncate">{formattedDate}</span>
          <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 flex-shrink-0 hidden sm:inline">
            Saved
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button type="button" onClick={onEdit} className="text-xs text-slate-400 hover:text-amber-600 underline">
            Edit plan
          </button>
          <button type="button" onClick={onToggle} className="text-slate-400 hover:text-slate-700 transition-colors">
            <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={16} />
            </motion.div>
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="stamp-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-slate-100">
              {assignedRoles.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No members assigned for this date.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {assignedRoles.map((a) => (
                    <div key={a.role} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400 text-xs w-36 flex-shrink-0 truncate">{a.role}</span>
                      <span className="font-medium text-slate-800">{a.memberName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// One role's assignment as a stacked mobile card (member select on top, song
// entry below when the role carries one) — the Assign tab's 3-column table
// squishes unreadably on narrow screens, so this renders instead below `md`.
// Song entry only ever shows a compact pill or a "Link Song" button here; the
// actual search happens in a shared bottom-sheet (see SongPickerSheet) opened
// via onOpenSongPicker, so this card never grows its own cramped input.
function RoleAssignCard({
  role, category, count, isLeadVocal, isLastRow,
  activeMembers, getLocalField, updateLocal, songs, openSongView,
  addRoleRow, removeRoleRow, onOpenSongPicker, isEditing,
}) {
  const posKey = positionKeyForRole(role)
  const eligible = posKey ? activeMembers.filter((m) => m.positions?.includes(posKey)) : activeMembers

  const memberId = getLocalField(role, 'memberId')
  const memberName = getLocalField(role, 'memberName')
  const songName = getLocalField(role, 'songName')
  const songId = getLocalField(role, 'songId')
  const songKey = getLocalField(role, 'key')
  const linkedSong = songId ? songs.find((s) => s.id === songId) : null
  const hasSong = !!(songName || linkedSong)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">{roleDisplayLabel(role)}</span>
        {isEditing && isLastRow && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addRoleRow(category)}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap"
            >
              + Add {category}
            </button>
            {count > 1 && (
              <button
                type="button"
                onClick={() => removeRoleRow(category)}
                title={`Remove this ${category}`}
                className="text-slate-400 hover:text-red-500 text-sm leading-none"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {!isEditing ? (
        <>
          {/* Read-only summary — plain text, no form controls. */}
          <p className={`mt-2 text-sm ${memberId ? 'font-semibold text-slate-800' : 'italic text-slate-400 font-normal'}`}>
            {memberId ? memberName : '— Not assigned'}
          </p>
          {isLeadVocal && hasSong && (
            <p className="mt-1 text-xs font-medium text-indigo-700">
              {songName || linkedSong?.title}
              {(songKey || linkedSong?.key) && <span className="text-indigo-500"> [{songKey || linkedSong?.key}]</span>}
            </p>
          )}
        </>
      ) : (
        <>
          <select
            value={memberId}
            onChange={(e) => {
              const val = e.target.value
              const member = activeMembers.find((m) => m.id === val)
              updateLocal(role, { memberId: val || '', memberName: member?.name || '' })
            }}
            className="mt-2 w-full px-2.5 py-2 text-sm rounded-lg border border-slate-300 bg-white"
          >
            <option value="">— Not assigned</option>
            {eligible.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {/* Song field only appears once someone's actually assigned — an empty
              role has nothing to attach a song to yet. */}
          {isLeadVocal && memberId && (
            <div className="mt-2">
              {hasSong ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (linkedSong ? openSongView(linkedSong) : onOpenSongPicker(role))}
                    className="flex-1 min-w-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-semibold text-indigo-700"
                  >
                    <span className="truncate">{songName || linkedSong?.title}</span>
                    {(songKey || linkedSong?.key) && (
                      <span className="text-indigo-500 shrink-0">[{songKey || linkedSong?.key}]</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLocal(role, { songName: '', songId: '', key: '' })}
                    aria-label="Remove song"
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenSongPicker(role)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-indigo-300 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  <Music2 size={13} strokeWidth={2.25} /> Link Song
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Official practice start benchmark — 8:00 PM. Arriving at or before this is
// Punctual; anything after is Late by however many minutes past it.
const PRACTICE_START_MINUTES = 20 * 60

function punctualityFor(arrivedAt) {
  const m = String(arrivedAt || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const minutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  const diff = minutes - PRACTICE_START_MINUTES
  return diff <= 0 ? { late: false, label: 'Punctual' } : { late: true, label: `Late by ${diff} min${diff === 1 ? '' : 's'}` }
}

// First-name-only display, used throughout the Archive report's roster table to keep
// rows compact — falls back to the full string if it's somehow already just one word.
function firstNameOf(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || fullName
}

// A single Sunday's complete weekly report — the published setlist/assignments
// (read-only, unchanged) plus that week's Friday/Saturday practice attendance
// (viewable by everyone, editable by canManageWorship — this used to be its own
// "Records" sub-tab under Practice & Rehearsals; it now lives here so a Sunday's
// setlist and its practice record are one report instead of two places to check).
function ArchiveStamp({ stamp, isOpen, onToggle, canManageWorship, onSaveTimes }) {
  const assignedRoles = (stamp.assignments || []).filter((a) => a.memberId)
  let formattedDate = stamp.date
  try { formattedDate = format(new Date(stamp.date + 'T12:00:00'), 'EEE d MMM yyyy') } catch {}

  // Status badge — Archives no longer only holds history, so "Published" can't be a
  // constant anymore. The forthcoming Sunday (same cutoff as the Summary tab's plan
  // card: today until 6pm if today is Sunday, otherwise the next Sunday) is the one
  // "live" active week; anything further out is merely on the calendar; anything at
  // or before today (including the forthcoming Sunday once its 6pm cutoff passes) is
  // done.
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const forthcomingSunday = getForthcomingSunday()
  let statusLabel = 'Published'
  let statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-100'
  if (stamp.date === forthcomingSunday) {
    statusLabel = 'In Progress'
    statusClass = 'bg-amber-50 text-amber-700 border-amber-200'
  } else if (stamp.date > todayStr) {
    statusLabel = 'Scheduled'
    statusClass = 'bg-sky-50 text-sky-700 border-sky-200'
  }

  // Practice & Rehearsal Attendance — same practiceAttendance field, same
  // read/edit shape the old Records sub-tab used, just scoped locally to this card
  // instead of a separate list. `assignedMembers` dedupes the same roster used for
  // the setlist above so the check-in list lines up with who was actually assigned.
  const pa = stamp.practiceAttendance || {}
  const assignedMembers = assignedRoles.filter((a, i, arr) => arr.findIndex((x) => x.memberId === a.memberId) === i)
  const fridayArrived = Object.values(pa.friday || {}).filter((v) => v.arrivedAt).length
  const satArrived = Object.values(pa.saturday || {}).filter((v) => v.arrivedAt).length

  const [editingTimes, setEditingTimes] = useState(false)
  const [timesDraft, setTimesDraft] = useState(null)
  const [savingTimes, setSavingTimes] = useState(false)

  // Seeds the draft from whatever's currently saved — blank "—" placeholders become
  // empty <input type="time"> fields, ready for a backdated/missed time to be typed
  // in, rather than starting from scratch.
  const openTimesEdit = () => {
    const draft = {
      friday: {}, saturday: {},
      fridaySession: { endOfPractice: pa.fridaySession?.endOfPractice || '' },
      saturdaySession: {
        endOfPractice: pa.saturdaySession?.endOfPractice || '',
        beginRehearsal: pa.saturdaySession?.beginRehearsal || '',
        endRehearsal: pa.saturdaySession?.endRehearsal || '',
      },
    }
    assignedMembers.forEach((a) => {
      draft.friday[a.memberId] = { arrivedAt: pa.friday?.[a.memberId]?.arrivedAt || '', memberName: a.memberName }
      draft.saturday[a.memberId] = { arrivedAt: pa.saturday?.[a.memberId]?.arrivedAt || '', memberName: a.memberName }
    })
    setTimesDraft(draft)
    setEditingTimes(true)
  }

  const cancelTimesEdit = () => { setEditingTimes(false); setTimesDraft(null) }

  // One roster-card's Friday/Saturday attendance pill — day label plus exact time
  // and its punctuality status against the 8:00 PM practice start benchmark, kept
  // together so neither reads ambiguously on its own. This is the one place practice
  // attendance shows per member now; the old separate "Practice & Rehearsal
  // Attendance" name list further down was a second, duplicate rendering of the same
  // roster these cards already cover.
  const arrivalBadge = (dayLabel, arrivedAt) => {
    if (!arrivedAt) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-300 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
          {dayLabel} —
        </span>
      )
    }
    const p = punctualityFor(arrivedAt)
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${p?.late ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
        {dayLabel} {arrivedAt}
        {p && <span className="font-medium opacity-80">{p.label}</span>}
      </span>
    )
  }

  const saveTimesEdit = async () => {
    setSavingTimes(true)
    try {
      const friday = {}
      Object.entries(timesDraft.friday).forEach(([mid, v]) => { if (v.arrivedAt) friday[mid] = { arrivedAt: v.arrivedAt, memberName: v.memberName } })
      const saturday = {}
      Object.entries(timesDraft.saturday).forEach(([mid, v]) => { if (v.arrivedAt) saturday[mid] = { arrivedAt: v.arrivedAt, memberName: v.memberName } })
      const fridaySession = {}
      if (timesDraft.fridaySession.endOfPractice) fridaySession.endOfPractice = timesDraft.fridaySession.endOfPractice
      const saturdaySession = {}
      if (timesDraft.saturdaySession.endOfPractice) saturdaySession.endOfPractice = timesDraft.saturdaySession.endOfPractice
      if (timesDraft.saturdaySession.beginRehearsal) saturdaySession.beginRehearsal = timesDraft.saturdaySession.beginRehearsal
      if (timesDraft.saturdaySession.endRehearsal) saturdaySession.endRehearsal = timesDraft.saturdaySession.endRehearsal
      await onSaveTimes(stamp.id, { friday, saturday, fridaySession, saturdaySession })
      cancelTimesEdit()
    } catch (err) {
      console.error('Failed to save practice attendance edit:', err)
      alert('Failed to save changes')
    } finally {
      setSavingTimes(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CheckCircle2 size={17} className={`flex-shrink-0 ${statusLabel === 'Published' ? 'text-emerald-500' : statusLabel === 'In Progress' ? 'text-amber-500' : 'text-sky-500'}`} />
          <span className="font-semibold text-slate-800 text-sm truncate">{formattedDate}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs border rounded-full px-2 py-0.5 flex-shrink-0 ${statusClass}`}>{statusLabel}</span>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={16} className="text-slate-400" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="archive-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-slate-100">
              {assignedRoles.length === 0 ? (
                <p className="text-sm text-slate-400 italic py-3">No members assigned for this date.</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {assignedRoles.map((a) => (
                      <div key={a.role} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                            {roleDisplayLabel(a.role)}
                          </span>
                          <span className="text-sm font-semibold text-slate-800 truncate">{firstNameOf(a.memberName)}</span>
                        </div>
                        {a.songName && (
                          <div className="mt-2 inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-medium text-indigo-700">
                            <span className="truncate">{a.songName}</span>
                            {a.key && <span className="font-semibold text-indigo-500 shrink-0">[{a.key}]</span>}
                          </div>
                        )}
                        <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                          {arrivalBadge('Fri', pa.friday?.[a.memberId]?.arrivedAt)}
                          {arrivalBadge('Sat', pa.saturday?.[a.memberId]?.arrivedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {stamp.updatedBy && (
                    <p className="text-xs text-slate-400">Saved by {stamp.updatedBy}</p>
                  )}
                </div>
              )}

              {/* Practice & Rehearsal Attendance — Friday/Saturday check-in timestamps,
                  arrival times, and session completion times for this same week.
                  Read-only for everyone; canManageWorship gets a "Modify Times" trigger
                  to add/backdate a missed check-in or fix a session time, same editor
                  the old standalone Records sub-tab used. */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Practice &amp; Rehearsal Attendance</p>
                  {canManageWorship && !editingTimes && (
                    <button
                      type="button"
                      onClick={openTimesEdit}
                      title="Modify Times"
                      aria-label="Modify Times"
                      className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>

                {editingTimes ? (
                  <div className="space-y-4">
                    {assignedMembers.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Check-In Times</p>
                        {assignedMembers.map((a) => (
                          <div key={a.memberId} className="flex flex-wrap items-center gap-3">
                            <span className="flex-1 min-w-[7rem] text-sm text-slate-700 truncate">{firstNameOf(a.memberName)}</span>
                            <label className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 w-7">Fri</span>
                              <input
                                type="time"
                                value={timesDraft.friday[a.memberId]?.arrivedAt || ''}
                                onChange={(e) => setTimesDraft((d) => ({ ...d, friday: { ...d.friday, [a.memberId]: { ...d.friday[a.memberId], arrivedAt: e.target.value } } }))}
                                className="px-2 py-1 text-xs rounded border border-slate-300 w-24"
                              />
                            </label>
                            <label className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 w-7">Sat</span>
                              <input
                                type="time"
                                value={timesDraft.saturday[a.memberId]?.arrivedAt || ''}
                                onChange={(e) => setTimesDraft((d) => ({ ...d, saturday: { ...d.saturday, [a.memberId]: { ...d.saturday[a.memberId], arrivedAt: e.target.value } } }))}
                                className="px-2 py-1 text-xs rounded border border-slate-300 w-24"
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Friday</p>
                        <label className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-500">End of Practice</span>
                          <input
                            type="time"
                            value={timesDraft.fridaySession.endOfPractice}
                            onChange={(e) => setTimesDraft((d) => ({ ...d, fridaySession: { endOfPractice: e.target.value } }))}
                            className="px-2 py-1 rounded border border-slate-300 w-28"
                          />
                        </label>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Saturday</p>
                        <label className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-500">End of Practice</span>
                          <input
                            type="time"
                            value={timesDraft.saturdaySession.endOfPractice}
                            onChange={(e) => setTimesDraft((d) => ({ ...d, saturdaySession: { ...d.saturdaySession, endOfPractice: e.target.value } }))}
                            className="px-2 py-1 rounded border border-slate-300 w-28"
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-500">Begin Rehearsal</span>
                          <input
                            type="time"
                            value={timesDraft.saturdaySession.beginRehearsal}
                            onChange={(e) => setTimesDraft((d) => ({ ...d, saturdaySession: { ...d.saturdaySession, beginRehearsal: e.target.value } }))}
                            className="px-2 py-1 rounded border border-slate-300 w-28"
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-500">End of Rehearsal</span>
                          <input
                            type="time"
                            value={timesDraft.saturdaySession.endRehearsal}
                            onChange={(e) => setTimesDraft((d) => ({ ...d, saturdaySession: { ...d.saturdaySession, endRehearsal: e.target.value } }))}
                            className="px-2 py-1 rounded border border-slate-300 w-28"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={savingTimes}
                        onClick={saveTimesEdit}
                        className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 transition-colors"
                      >
                        {savingTimes ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelTimesEdit}
                        disabled={savingTimes}
                        className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Per-member check-in times no longer repeat here — they're inline on
                  // each person's own roster row above (see attendanceBadges) — this is
                  // just the aggregate counts and the session-level (not per-member)
                  // timing fields.
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Friday {assignedMembers.length > 0 && `· ${fridayArrived}/${assignedMembers.length} arrived`}</p>
                      <div className="flex justify-between text-xs"><span className="text-slate-500">End of Practice</span><span className="font-semibold text-slate-800">{pa.fridaySession?.endOfPractice || '—'}</span></div>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Saturday {assignedMembers.length > 0 && `· ${satArrived}/${assignedMembers.length} arrived`}</p>
                      <div className="flex justify-between text-xs"><span className="text-slate-500">End of Practice</span><span className="font-semibold text-slate-800">{pa.saturdaySession?.endOfPractice || '—'}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-slate-500">Begin Rehearsal</span><span className="font-semibold text-slate-800">{pa.saturdaySession?.beginRehearsal || '—'}</span></div>
                      <div className="flex justify-between text-xs"><span className="text-slate-500">End of Rehearsal</span><span className="font-semibold text-slate-800">{pa.saturdaySession?.endRehearsal || '—'}</span></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function dedupeByName(members) {
  const seen = new Set()
  return members.filter(m => {
    const key = (m.name || '').trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Team Performance & Growth Analytics ───────────────────────────────────────

// Matches the app's established violet/indigo worship palette (see TILE_COLORS,
// gradient banners, etc. throughout this file) plus status green/amber for
// on-time/late signaling — no new color language introduced.
const ANALYTICS_COLORS = {
  violet: '#7c3aed',
  violetLight: '#ede9fe',
  indigo: '#6366f1',
  slate: '#94a3b8',
  emerald: '#10b981',
  amber: '#f59e0b',
  sky: '#0ea5e9',
}
const ANALYTICS_BAR_PALETTE = ['#7c3aed', '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#f97316']

const ANALYTICS_RANGE_OPTIONS = [
  { key: '4w', label: '4 Weeks', days: 28 },
  { key: '3m', label: '3 Months', days: 90 },
  { key: 'ytd', label: 'YTD', days: null },
]

// Bar-chart X-axis labels show first name only, so long full names never wrap,
// overlap, or need a steep angle on a narrow mobile axis. The tooltip still gets
// the untruncated name (see LoadDistributionTooltip) so full detail stays
// reachable on hover/tap even though the axis itself is abbreviated.
function firstNameOnly(name) {
  return (name || '').split(' ')[0] || name
}

function LoadDistributionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
      {label}: {value} assignment{value === 1 ? '' : 's'}
    </div>
  )
}

function analyticsMinsToLabel(mins) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function AnalyticsCard({ title, subtitle, children }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  )
}

function AnalyticsEmpty({ label }) {
  return <p className="text-sm text-slate-400 text-center py-10">{label}</p>
}

// Self-contained: fetches its own schedule history (rather than depending on
// whichever other tab happens to have already loaded it) so it works correctly
// whether or not the Practice/Archives tabs have been visited this session.
function WorshipAnalyticsDashboard() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('4w')

  useEffect(() => {
    getAllWorshipSchedules(DEPARTMENT)
      .then(setSchedules)
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const today = new Date()
    let cutoff
    if (range === 'ytd') {
      cutoff = new Date(today.getFullYear(), 0, 1)
    } else {
      const opt = ANALYTICS_RANGE_OPTIONS.find((o) => o.key === range)
      cutoff = new Date(today)
      cutoff.setDate(cutoff.getDate() - (opt?.days || 28))
    }
    const cutoffStr = format(cutoff, 'yyyy-MM-dd')
    const todayStr = format(today, 'yyyy-MM-dd')
    return schedules
      .filter((s) => s.date && isSundayDateStr(s.date) && s.date >= cutoffStr && s.date <= todayStr && (s.assignments || []).some((a) => a.memberId))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [schedules, range])

  // 1. Team Punctuality Trend — weekly average Friday practice arrival time vs the
  // 8:00 PM benchmark, from the same practiceAttendance.friday check-in data the
  // Practice/Archives tabs record.
  const BENCHMARK_MINS = 20 * 60
  const punctualityData = useMemo(() => {
    return filtered
      .map((s) => {
        const pa = s.practiceAttendance || {}
        const times = Object.values(pa.friday || {}).map((v) => v.arrivedAt).filter(Boolean)
        if (!times.length) return null
        const avgMins = Math.round(
          times.reduce((sum, t) => {
            const [h, m] = t.split(':').map(Number)
            return sum + h * 60 + m
          }, 0) / times.length
        )
        let dateLabel = s.date
        try { dateLabel = format(new Date(s.date + 'T12:00:00'), 'd MMM') } catch { /* keep raw date */ }
        return { date: dateLabel, avgMins, checkIns: times.length }
      })
      .filter(Boolean)
  }, [filtered])

  // 2. Role / Song Load Distribution — how many times each member was assigned a
  // role this period, colored by category (Lead Vocal / Choir / Instruments /
  // Other) so an over- or under-used member is obvious at a glance.
  const loadDistribution = useMemo(() => {
    const counts = {}
    filtered.forEach((s) => {
      (s.assignments || []).filter((a) => a.memberId).forEach((a) => {
        const name = a.memberName || 'Unknown'
        if (!counts[name]) counts[name] = { name, count: 0, category: roleCategoryLabel(parseRoleKey(a.role).category) }
        counts[name].count += 1
      })
    })
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10)
  }, [filtered])

  // 3. Rehearsal Attendance Rate — per week, the share of that week's assigned
  // members who checked in (Friday or Saturday) at all; averaged for the headline
  // percentage across the selected range.
  const attendanceData = useMemo(() => {
    return filtered
      .map((s) => {
        const pa = s.practiceAttendance || {}
        const assigned = (s.assignments || [])
          .filter((a) => a.memberId)
          .filter((a, i, arr) => arr.findIndex((x) => x.memberId === a.memberId) === i)
        if (!assigned.length) return null
        const arrivedIds = new Set([...Object.keys(pa.friday || {}), ...Object.keys(pa.saturday || {})])
        const arrivedCount = assigned.filter((a) => arrivedIds.has(a.memberId)).length
        let dateLabel = s.date
        try { dateLabel = format(new Date(s.date + 'T12:00:00'), 'd MMM') } catch { /* keep raw date */ }
        return { date: dateLabel, pct: Math.round((arrivedCount / assigned.length) * 100) }
      })
      .filter(Boolean)
  }, [filtered])
  const overallAttendancePct = attendanceData.length
    ? Math.round(attendanceData.reduce((sum, d) => sum + d.pct, 0) / attendanceData.length)
    : null

  // 4. Song Rotation & Frequency — most-played songs (by Lead Vocal assignment
  // songName) across the setlist history in this period, to spot what needs a rest.
  const songFrequency = useMemo(() => {
    const counts = {}
    filtered.forEach((s) => {
      (s.assignments || []).filter((a) => a.songName?.trim()).forEach((a) => {
        const name = a.songName.trim()
        counts[name] = (counts[name] || 0) + 1
      })
    })
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [filtered])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-800 text-base shrink-0">Team Analytics</h2>
        <div className="grid grid-cols-3 gap-1 bg-slate-100 rounded-xl p-1 w-full max-w-[240px]">
          {ANALYTICS_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setRange(opt.key)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                range === opt.key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-violet-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading analytics…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-20">

          {/* Team Punctuality Trend */}
          <AnalyticsCard title="Punctuality Trend">
            {punctualityData.length === 0 ? (
              <AnalyticsEmpty label="No practice check-ins recorded in this period." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={punctualityData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: ANALYTICS_COLORS.slate }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: ANALYTICS_COLORS.slate }}
                    axisLine={false}
                    tickLine={false}
                    domain={['dataMin - 15', 'dataMax + 15']}
                    tickFormatter={analyticsMinsToLabel}
                    width={68}
                  />
                  <Tooltip
                    formatter={(value) => analyticsMinsToLabel(value)}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <ReferenceLine y={BENCHMARK_MINS} stroke={ANALYTICS_COLORS.amber} strokeDasharray="4 4" label={{ value: '8:00 PM benchmark', fontSize: 10, fill: ANALYTICS_COLORS.amber, position: 'insideTopLeft' }} />
                  <Line type="monotone" dataKey="avgMins" name="Avg arrival" stroke={ANALYTICS_COLORS.violet} strokeWidth={2.5} dot={{ r: 3, fill: ANALYTICS_COLORS.violet }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </AnalyticsCard>

          {/* Role / Song Load Distribution */}
          <AnalyticsCard title="Workload Distribution">
            {loadDistribution.length === 0 ? (
              <AnalyticsEmpty label="No assignments recorded in this period." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={loadDistribution} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tickFormatter={firstNameOnly} tick={{ fontSize: 9, fill: ANALYTICS_COLORS.slate }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={0} height={24} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: ANALYTICS_COLORS.slate }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip content={<LoadDistributionTooltip />} />
                  <Bar dataKey="count" name="Assignments" radius={[6, 6, 0, 0]}>
                    {loadDistribution.map((_, i) => (
                      <Cell key={i} fill={ANALYTICS_BAR_PALETTE[i % ANALYTICS_BAR_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </AnalyticsCard>

          {/* Rehearsal Attendance Rate */}
          <AnalyticsCard title="Attendance Rate">
            {attendanceData.length === 0 ? (
              <AnalyticsEmpty label="No practice check-ins recorded in this period." />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span
                    className="text-3xl font-black shrink-0"
                    style={{ color: overallAttendancePct >= 80 ? ANALYTICS_COLORS.emerald : overallAttendancePct >= 60 ? ANALYTICS_COLORS.amber : '#ef4444' }}
                  >
                    {overallAttendancePct}%
                  </span>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 font-medium">Average attendance across {attendanceData.length} week{attendanceData.length !== 1 ? 's' : ''}</p>
                    <div className="w-full h-2.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${overallAttendancePct}%`,
                          background: overallAttendancePct >= 80 ? ANALYTICS_COLORS.emerald : overallAttendancePct >= 60 ? ANALYTICS_COLORS.amber : '#ef4444',
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {attendanceData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-12 shrink-0">{d.date}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${d.pct}%`, background: d.pct >= 80 ? ANALYTICS_COLORS.emerald : d.pct >= 60 ? ANALYTICS_COLORS.amber : '#ef4444' }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 w-9 text-right shrink-0">{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AnalyticsCard>

          {/* Song Rotation & Frequency */}
          <AnalyticsCard title="Song Rotation">
            {songFrequency.length === 0 ? (
              <AnalyticsEmpty label="No songs recorded in this period's setlists." />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, songFrequency.length * 32)}>
                <BarChart data={songFrequency} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: ANALYTICS_COLORS.slate }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#1e293b' }} axisLine={false} tickLine={false} width={140} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="count" name="Times played" fill={ANALYTICS_COLORS.violet} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </AnalyticsCard>

        </div>
      )}
    </div>
  )
}

// A team member's card — fixed, uniform layout with nothing that expands or
// pushes card height: name + ⋮ menu on top, one-line join/tenure subtext, and
// a primary-role + total-songs pill row on the bottom. Everything else (full
// position list, song breakdown, service history) moved into the Individual
// Record modal, opened either by tapping the card or via the ⋮ menu — never
// inline — so the grid itself stays perfectly aligned regardless of how much
// a given member has on record. Shared by both places member cards render (the
// standalone Team tab and Operations > Team).
function WorshipMemberCard({ member: m, isFormer = false, canManageWorship, onEdit, onDelete, onLink, stats }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  const since = new Date(m.memberSince)
  const till = isFormer && m.formerSince ? new Date(m.formerSince) : new Date()
  const yrs = differenceInYears(till, since)
  const mos = differenceInMonths(till, addYears(since, yrs))
  const totalDays = isFormer ? differenceInDays(till, since) : null

  // One primary role for the card's compact pill — the full list still shows
  // in the Individual Record modal. Director outranks any instrument/vocal tag.
  const primaryRole = m.isWorshipDirector ? 'Director' : (m.positions || [])[0] || null
  const totalSongs = stats?.total || 0

  return (
    <>
    <div
      className={`relative rounded-xl border p-3 flex flex-col justify-between gap-2 shadow-sm transition-colors cursor-pointer min-h-[128px] ${
        isFormer
          ? 'border-slate-200 bg-slate-50'
          : m.isWorshipDirector ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white hover:border-indigo-200'
      }`}
      role="button"
      tabIndex={0}
      onClick={() => setDetailOpen(true)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailOpen(true) } }}
    >
      {/* Top: name + ⋮ actions menu */}
      <div className="flex items-start justify-between gap-2">
        <span className={`font-semibold text-sm leading-snug truncate ${isFormer ? 'text-slate-700' : 'text-slate-800'}`}>{m.name}</span>
        {canManageWorship && (
          <div className="relative shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Member actions"
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setDetailOpen(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Eye size={13} /> View Individual Record
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onEdit(m) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  {!m.visitorId && !m.personId && onLink && (
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onLink(m) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      Link
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onDelete(m) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Subtext: join date / tenure, always a single line so cards line up */}
      <p className="text-[11px] text-slate-400 leading-snug">
        {isFormer ? (
          <>{formatDMY(m.memberSince)} → {m.formerSince ? formatDMY(m.formerSince) : 'now'} · {totalDays.toLocaleString()}d</>
        ) : (
          <>Since {formatDMY(m.memberSince)}</>
        )}
        {' • '}{yrs} yr {mos} mo
      </p>

      {/* Bottom: compact primary-role + total-songs pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {primaryRole && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
            m.isWorshipDirector
              ? 'bg-amber-500 text-white'
              : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
          }`}>
            {primaryRole}
          </span>
        )}
        {totalSongs > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-violet-50 text-violet-700 border border-violet-100">
            {totalSongs} Song{totalSongs === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>

    {/* Individual Record detail modal — full role breakdown + historical services/
        songs, newest first. Rendered outside the card's own click-to-expand div so
        it isn't affected by that handler.
        On mobile this renders as a bottom sheet (anchored to the viewport bottom,
        rounded top corners only) instead of a centered floating card — a centered
        card with a tall song history list could push its close button off-screen
        on short mobile viewports. Desktop (sm+) keeps the centered dialog. */}
    {detailOpen && (
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
        onClick={() => setDetailOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${m.name} — Individual Record`}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md max-h-[80vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">Individual Record</p>
              <h3 className="text-base font-bold text-slate-800 truncate">{(m.name || '').trim().split(' ')[0] || m.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => setDetailOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            {(m.isWorshipDirector || m.positions?.length > 0) && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Roles</p>
                <div className="flex flex-wrap gap-1.5">
                  {m.isWorshipDirector && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-amber-500 text-white text-xs uppercase tracking-wide font-bold">Director</span>
                  )}
                  {(m.positions || []).map(p => (
                    <span key={p} className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">{p}</span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-sm font-bold text-slate-800 mb-2">Total Songs: {stats?.total || 0}</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(stats?.byCategory || {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, count]) => (
                    <span key={cat} className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {roleCategoryLabel(cat)}: {count}
                    </span>
                  ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Role Summary</p>
              {(stats?.total || 0) === 0 ? (
                <p className="text-sm text-slate-400 italic">No recorded services yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {summarizeRoleGroups(stats?.byCategory).map((g) => (
                    <div key={g.key} className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <span className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                        <g.icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-bold text-slate-800 leading-none">{g.count}</p>
                        <p className="text-[10px] text-slate-400 mt-1 leading-snug">{g.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// "+ Add New Team Member" must only offer applicants whose screening evaluation
// explicitly recommended them — not the full church directory. An applicant only
// qualifies once status === 'screened' AND screening.recommendation === 'Ready for
// Main Roster'; pending/incomplete applications and 'Needs Training / Sub List' or
// 'Not Ready' recommendations are excluded, as are people with no application at all.
async function getApprovedRosterVisitors() {
  const [{ people }, applications] = await Promise.all([
    getMergedPeopleDirectory(),
    getWorshipApplications(DEPARTMENT).catch(() => []),
  ])
  const approvedNames = new Set(
    (applications || [])
      .filter(a => a.status === 'screened' && a.screening?.recommendation === 'Ready for Main Roster')
      .map(a => (a.fullName || '').trim().toLowerCase())
      .filter(Boolean)
  )
  return people.filter(p => approvedNames.has((p.name || '').trim().toLowerCase()))
}

export default function DepartmentWorship() {
  const { userProfile, hasPermission, isFounder, hasAccess } = useAuth()
  if (!hasAccess(userProfile, DEPARTMENT) && !hasWorshipRoleAccess(userProfile)) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all">← Departments</Link>
        <p className="mt-4">You do not have access to {DEPARTMENT} department.</p>
      </div>
    )
  }
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  // Tab is URL-driven (?tab=) so the bottom dock's folder popover can deep-link
  // straight into a subpage, same as DepartmentHub's generic hub.
  const [searchParams, setSearchParams] = useSearchParams()
  // A role restricted to fewer tabs (e.g. Worship Leader) lands on its first allowed
  // tab by default instead of Hub — the ?tab= guard further below still returns 403 if
  // they (or a stale link) explicitly point at a tab outside that set.
  // Everyone defaults to Upcoming Worship (the setlist/assigned-songs view for the
  // coming Sunday) rather than Hub — Worship Leader and Worship Member land here via
  // the dock's bypassed launcher (see shouldBypassWorshipGrid), Director/Founder/Admin
  // via the picker grid or by just visiting the bare department path.
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'upcomingSunday')
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t) setActiveTab(t)
  }, [searchParams])
  // Expense is always the base Finance view now — Budget/Payout Request are drawers
  // layered on top rather than sibling tabs, so this only ever tracks which drawer (if
  // any) is open: null | 'budget' | 'payout'. Still deep-linkable the same way as
  // before (?tab=finance&financeSub=budget, see getFinanceChildren in
  // utils/departmentSubpages.js) so the dock's Finance popover still opens the right
  // drawer instead of just landing on plain Expense.
  const [financeOverlay, setFinanceOverlay] = useState(() => {
    const f = searchParams.get('financeSub')
    return f === 'budget' || f === 'payout' ? f : null
  })
  useEffect(() => {
    const f = searchParams.get('financeSub')
    if (f === 'budget' || f === 'payout') setFinanceOverlay(f)
  }, [searchParams])
  const [allMembers, setAllMembers] = useState([])

  const activeMembers = useMemo(
    () => allMembers
      .filter(m => m.isFormer !== true)
      .sort((a, b) => (b.isWorshipDirector === true) - (a.isWorshipDirector === true)),
    [allMembers]
  )

  const formerMembers = useMemo(
    () => allMembers
      .filter(m => m.isFormer === true)
      .sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || '')),
    [allMembers]
  )

  // Best-effort link from the logged-in user to their own worship team roster entry
  // (there's no uid field on team members, only a name match) — used to default the
  // song viewer's "My Role" filter to whichever instrument(s) this person plays.
  const myName = userProfile?.name?.trim().toLowerCase()
  const myWorshipMember = myName ? allMembers.find(m => m.name?.trim().toLowerCase() === myName) : null
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [teamError, setTeamError] = useState(null)
  const [worshipMemberLinking, setWorshipMemberLinking] = useState(null)
  const [newMember, setNewMember] = useState({
    name: '',
    visitorId: '',
    personId: '',
    memberSince: new Date().toISOString().slice(0, 10),
    isFormer: false,
    positions: [],
    isWorshipDirector: false,
  })
  const [addMemberVisitors, setAddMemberVisitors] = useState([])
  const [addMemberVisitorsLoading, setAddMemberVisitorsLoading] = useState(false)
  const [form, setForm] = useState({
    type: 'team',
    period: PERIOD,
    teamNotes: '',
    plannedBudget: '',
    spent: '',
    participantsCount: '',
    activityNotes: '',
  })

  // Scoped to this specific department's position (not the loose top-level
  // `userProfile.department` field, which is just whichever department happened to
  // be inserted first into `positions[]` — a Director of another department who also
  // holds any lesser position here would otherwise incorrectly pass this check).
  const isDirector = getDepartmentRole(userProfile, DEPARTMENT) === 'DIRECTOR'
  const isPastor = hasPermission('viewDepartmentInsights')
  const canManageWorship = isDirector || isFounder
  // Worship Leader gets full edit access to songs/segments/arrangements specifically —
  // deliberately narrower than canManageWorship (Team/Assign/Budget/Applications stay
  // Director/Founder-only). Used only by the Song Directory and Song Designer below.
  const canManageWorshipSongs = canManageWorship || isWorshipLeader(userProfile)
  // A Worship Leader can only edit or delete songs they personally designed —
  // Director/Founder still manage anything. Checks createdBy (reliably set to
  // whoever actually saved the song, never edited by hand) OR designedBy (a
  // free-text credit field the designer can overwrite, e.g. to credit the
  // original arranger instead of themselves) — either match grants access, so
  // typing someone else's name into "Designed By" can't lock the real creator
  // out of their own song.
  const canEditSong = (song) => {
    if (canManageWorship) return true
    if (!isWorshipLeader(userProfile)) return false
    const myName = String(userProfile?.name || '').trim().toLowerCase()
    if (!myName) return false
    const designer = String(song?.designedBy || '').trim().toLowerCase()
    const creator = String(song?.createdBy || '').trim().toLowerCase()
    return myName === designer || myName === creator
  }
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [scheduleForDate, setScheduleForDate] = useState({ date: '', assignments: [] })
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [budgetItems, setBudgetItems] = useState([])
  const [loadingBudgetItems, setLoadingBudgetItems] = useState(true)
  const [budgetItemsError, setBudgetItemsError] = useState(null)
  const [editingBudgetItem, setEditingBudgetItem] = useState(null)
  const [localAssignments, setLocalAssignments] = useState([])
  // How many rows are currently shown per role category in the assign table — only
  // ever grows via "+ Add", shrinks via the row delete button. Reset whenever a
  // different date's schedule loads so a previous date's added-but-unsaved rows don't
  // linger; any already-saved rows beyond 1 (from before this became dynamic) still
  // show because rowCountFor below takes the max against what's actually in the data.
  const [roleRowCounts, setRoleRowCounts] = useState({})
  const [savingAssign, setSavingAssign] = useState(false)
  // Assign Worship Team tab: read-only by default (plain text summary of who's
  // assigned + linked song titles) — the interactive selects/song-search fields and
  // Save Plan button only mount once this flips true via the "Edit Plan" button.
  const [isEditing, setIsEditing] = useState(false)
  const [assignStamp, setAssignStamp] = useState(null)
  const [stampOpen, setStampOpen] = useState(false)
  const [archiveSchedules, setArchiveSchedules] = useState([])
  const [loadingArchives, setLoadingArchives] = useState(false)
  const [openArchiveIds, setOpenArchiveIds] = useState({})
  const [teamStatsSchedules, setTeamStatsSchedules] = useState([])
  const [rehearsals, setRehearsals] = useState([])
  const [loadingRehearsals, setLoadingRehearsals] = useState(false)
  const [rehearsalModalOpen, setRehearsalModalOpen] = useState(false)
  const [editingRehearsal, setEditingRehearsal] = useState(null)
  const [rehearsalForm, setRehearsalForm] = useState({ date: '', time: '', location: '', notes: '' })
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false)
  const [openAttendanceId, setOpenAttendanceId] = useState(null)
  const [attendanceDraft, setAttendanceDraft] = useState({})
  const [openSessionMenuId, setOpenSessionMenuId] = useState(null)
  const [weekBoxSchedules, setWeekBoxSchedules] = useState([])
  // Practice & Attendance date picker — `selectedPracticeSunday` is the Sunday service
  // whose Friday/Saturday practice sessions are currently shown; `practiceSundayOptions`
  // is every date the dropdown offers (the next few Sundays, plus any further-out Sunday
  // that already has a saved plan); `allPracticeSchedules` caches every schedule doc so
  // switching dates doesn't refetch. Defaults to the nearest upcoming Sunday — previously
  // this defaulted to whichever saved plan was furthest in the future.
  const [selectedPracticeSunday, setSelectedPracticeSunday] = useState(null)
  const [practiceSundayOptions, setPracticeSundayOptions] = useState([])
  const [allPracticeSchedules, setAllPracticeSchedules] = useState([])
  const [loadingWeekBoxes, setLoadingWeekBoxes] = useState(false)

  // Songs Directory
  const [songs, setSongs] = useState([])
  const [loadingSongs, setLoadingSongs] = useState(false)
  const [songSearch, setSongSearch] = useState('')
  const [songSubPage, setSongSubPage] = useState('directory')
  const [editingSong, setEditingSong] = useState(null)
  const [viewingSong, setViewingSong] = useState(null)
  // Explicit view mode for the next SongViewer open ('full' | 'mine' | null to let
  // SongViewer auto-detect) — always set together with viewingSong so a stale mode
  // from a previous open (e.g. "My Part") never leaks into the next song opened.
  const [viewSongMode, setViewSongMode] = useState(null)
  // Overrides myWorshipMember's static profile positions when a caller (e.g. the
  // Combined Song Design & Parts card on Upcoming Worship) already knows exactly
  // which role(s) this person is assigned for that specific song this week.
  const [viewSongPositions, setViewSongPositions] = useState(null)
  const openSongView = (song, mode = null, positions = null) => {
    setViewSongMode(mode)
    setViewSongPositions(positions)
    setViewingSong(song)
  }
  const [songSearchOpenRole, setSongSearchOpenRole] = useState(null)
  // Which role's "Link Song" button on the mobile Assign card opened the shared
  // bottom-sheet picker below (null when it's closed) — separate from
  // songSearchOpenRole above, which only drives the desktop table's inline dropdown.
  const [songPickerRole, setSongPickerRole] = useState(null)
  const [songPickerQuery, setSongPickerQuery] = useState('')
  const openSongPicker = (role) => {
    setSongPickerQuery(getLocalField(role, 'songName') || '')
    setSongPickerRole(role)
  }
  const [songModal, setSongModal] = useState(null) // null | 'add'
  const [songForm, setSongForm] = useState({ title: '', artist: '', key: '', tempo: '', notes: '' })

  // Deep link from the Upcoming Worship workspace widget's "Design My Song" button
  // (?tab=songsDirectory&newSong=1) — opens the Add Song modal immediately instead of
  // requiring a click once they land on the Directory. Consumes/strips the flag so a
  // refresh or re-visit doesn't keep re-opening it.
  useEffect(() => {
    if (activeTab !== 'songsDirectory' || !canManageWorshipSongs) return
    if (searchParams.get('newSong') !== '1') return
    setSongForm({ title: '', artist: '', key: '', tempo: '', notes: '' })
    setSongModal('add')
    const next = new URLSearchParams(searchParams)
    next.delete('newSong')
    setSearchParams(next, { replace: true })
  }, [activeTab, searchParams, canManageWorshipSongs])

  // Deep link from the Upcoming Worship workspace widget's "Assign Team for {date}"
  // placeholder button (?tab=assign&assignDate=yyyy-mm-dd) — jumps straight to that
  // Sunday instead of landing on whatever selectedDate defaulted to. Consumes/strips
  // the flag, same as newSong above.
  useEffect(() => {
    if (activeTab !== 'assign') return
    const d = searchParams.get('assignDate')
    if (!d || !isSundayDateStr(d)) return
    setSelectedDate(d)
    const next = new URLSearchParams(searchParams)
    next.delete('assignDate')
    setSearchParams(next, { replace: true })
  }, [activeTab, searchParams])

  const [savingSong, setSavingSong] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const [budgetItemForm, setBudgetItemForm] = useState({
    category: '',
    subCategory: '',
    description: '',
    quantity: '',
    unitCost: '',
    totalCost: '',
    type: '',
    expectedDate: '',
  })

  useEffect(() => {
    getDepartmentEntries(DEPARTMENT, { limit: 100 })
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  async function loadTeam() {
    setLoadingTeam(true)
    setTeamError(null)
    try {
      const all = await getWorshipTeamMembers(DEPARTMENT)
      setAllMembers(dedupeByName(all))
    } catch (e) {
      console.error('Worship team load failed:', e)
      setTeamError(e?.message || 'Could not load team. Check Firestore rules and indexes for worship_team_members.')
      setAllMembers([])
    } finally {
      setLoadingTeam(false)
    }
  }

  useEffect(() => {
    loadTeam()
  }, [])

  // Direct delete from a member card's ⋮ menu — same confirm/delete/state-update
  // shape as the Edit modal's own Delete button, just reachable without opening it.
  async function handleDeleteMember(m) {
    if (!window.confirm(`Delete ${m.name} permanently?`)) return
    try {
      await deleteWorshipTeamMember(m.id, { department: DEPARTMENT, name: m.name })
      setAllMembers(prev => prev.filter(x => x.id !== m.id))
    } catch (e) {
      console.error(e)
      alert('Failed to delete')
    }
  }

  async function loadBudgetItems() {
    setLoadingBudgetItems(true)
    setBudgetItemsError(null)
    try {
      const items = await getWorshipBudgetItems(DEPARTMENT)
      setBudgetItems(items)
    } catch (e) {
      console.error('Worship budget items load failed:', e)
      setBudgetItemsError(e?.message || 'Could not load budget items. Check Firestore rules for worship_budget_items.')
      setBudgetItems([])
    } finally {
      setLoadingBudgetItems(false)
    }
  }

  async function loadScheduleForDate(date) {
    setLoadingSchedule(true)
    try {
      const data = await getWorshipScheduleByDate(DEPARTMENT, date)
      setScheduleForDate(data)
    } catch (e) {
      console.error(e)
      setScheduleForDate({ date, assignments: [] })
    } finally {
      setLoadingSchedule(false)
    }
  }

  useEffect(() => {
    loadBudgetItems()
  }, [])

  async function loadSongs() {
    setLoadingSongs(true)
    try {
      const data = await getWorshipSongs()
      setSongs(data)
    } catch (e) {
      console.error('Songs load failed:', e)
      setSongs([])
    } finally {
      setLoadingSongs(false)
    }
  }

  // Also loaded on the Assign tab (Song Name search) and Upcoming Worship (looking up
  // each assigned song's key/link so the setlist can offer a "View" into SongViewer).
  useEffect(() => {
    if (activeTab === 'songsDirectory' || activeTab === 'assign' || activeTab === 'upcomingSunday') loadSongs()
  }, [activeTab])

  useEffect(() => {
    if ((activeTab === 'assign' || activeTab === 'summary') && selectedDate) loadScheduleForDate(selectedDate)
  }, [activeTab, selectedDate])

  useEffect(() => {
    setLocalAssignments(scheduleForDate.assignments || [])
    setRoleRowCounts({})
    setIsEditing(false)
  }, [scheduleForDate])

  useEffect(() => {
    if (activeTab !== 'practiceRehearsal') return
    setLoadingRehearsals(true)
    getWorshipRehearsals(DEPARTMENT)
      .then((list) => setRehearsals(list.sort((a, b) => (a.date || '').localeCompare(b.date || ''))))
      .catch(() => setRehearsals([]))
      .finally(() => setLoadingRehearsals(false))

    setLoadingWeekBoxes(true)
    getAllWorshipSchedules(DEPARTMENT)
      .then((all) => {
        const today = format(new Date(), 'yyyy-MM-dd')
        setAllPracticeSchedules(all)
        // Dropdown offers the next few Sundays plus any further-out Sunday that already
        // has a saved plan (e.g. a Director who planned several weeks ahead).
        const candidates = Array.from(new Set([
          ...upcomingSundays(5),
          ...all.filter((s) => s.date >= today).map((s) => s.date),
        ])).sort()
        setPracticeSundayOptions(candidates)
        // Default to the nearest upcoming Sunday, not whichever saved plan happens to be
        // furthest in the future.
        setSelectedPracticeSunday(getForthcomingSunday())
      })
      .catch(() => { setAllPracticeSchedules([]); setPracticeSundayOptions([]); setWeekBoxSchedules([]) })
      .finally(() => setLoadingWeekBoxes(false))
  }, [activeTab])

  // Rebuilds the practice/attendance box whenever the selected Sunday (via the dropdown)
  // or the cached schedule list changes, so switching dates is instant with no refetch.
  useEffect(() => {
    if (!selectedPracticeSunday) return
    const sundayObj = new Date(selectedPracticeSunday + 'T12:00:00')
    const matched = allPracticeSchedules.find((s) => s.date === selectedPracticeSunday) || null
    setWeekBoxSchedules([{
      sundayDate: selectedPracticeSunday,
      fridayDate: format(subDays(sundayObj, 2), 'yyyy-MM-dd'),
      saturdayDate: format(subDays(sundayObj, 1), 'yyyy-MM-dd'),
      schedule: matched,
    }])
  }, [selectedPracticeSunday, allPracticeSchedules])

  useEffect(() => {
    if (activeTab !== 'archives') return
    setLoadingArchives(true)
    getAllWorshipSchedules(DEPARTMENT)
      .then((all) => {
        // Archives are Sunday-only service records — see isSundayDateStr above. No
        // longer waits for the date to pass (or for a full publish step, which this
        // data model doesn't have anyway) — an upcoming assigned Sunday shows here
        // right alongside history, with whatever live/partial setlist and practice
        // attendance data it already has.
        const withData = all
          .filter((s) => s.date && isSundayDateStr(s.date) && (s.assignments || []).some((a) => a.memberId))
          .sort((a, b) => b.date.localeCompare(a.date))
        setArchiveSchedules(withData)
      })
      .catch(() => setArchiveSchedules([]))
      .finally(() => setLoadingArchives(false))
  }, [activeTab])

  // Every published Sunday setlist with at least one assigned member — the source
  // data for each team member's Individual Record / Performance Summary in The Team
  // tab (see computeMemberSongStats above and WorshipMemberCard's `stats` prop).
  useEffect(() => {
    if (activeTab !== 'theTeam') return
    getAllWorshipSchedules(DEPARTMENT)
      .then((all) => setTeamStatsSchedules(all.filter((s) => (s.assignments || []).some((a) => a.memberId))))
      .catch(() => setTeamStatsSchedules([]))
  }, [activeTab])

  const memberSongStats = useMemo(() => computeMemberSongStats(teamStatsSchedules), [teamStatsSchedules])

  function getLocalField(role, field) {
    const a = localAssignments.find((x) => x.role === role)
    return a?.[field] ?? ''
  }

  // Reconstructs each assignment with exactly the fields the schema expects, coerced
  // to plain strings — guards the save payload against anything malformed slipping in
  // (e.g. songId ending up as an object/number instead of a directory doc id string,
  // or an undefined value the Firestore SDK would otherwise reject the whole write for).
  function sanitizeAssignment(a) {
    return {
      role: String(a?.role ?? ''),
      memberId: String(a?.memberId ?? ''),
      memberName: String(a?.memberName ?? ''),
      songName: String(a?.songName ?? ''),
      key: String(a?.key ?? ''),
      songId: String(a?.songId ?? ''),
    }
  }

  function updateLocal(role, patch) {
    setLocalAssignments((prev) => {
      const list = [...prev]
      const idx = list.findIndex((x) => x.role === role)
      if (patch.memberId !== undefined && !patch.memberId) {
        if (idx >= 0) list.splice(idx, 1)
      } else {
        const existing = idx >= 0 ? list[idx] : { role }
        const merged = { ...existing, ...patch }
        if (idx >= 0) list[idx] = merged
        else list.push(merged)
      }
      return list
    })
  }

  // Rows visible for a category = whichever is bigger: what's already saved for this
  // date (so pre-existing multi-row data never gets hidden) or what's been added this
  // session via the "+ Add" button.
  function rowCountFor(category) {
    const savedMax = localAssignments.reduce((max, a) => {
      const parsed = parseRoleKey(a.role)
      return parsed.category === category ? Math.max(max, parsed.index) : max
    }, 1)
    return Math.max(savedMax, roleRowCounts[category] || 1)
  }

  function addRoleRow(category) {
    setRoleRowCounts((prev) => ({ ...prev, [category]: rowCountFor(category) + 1 }))
  }

  // Only removes the last row of a category (mirrors "+ Add" always appending to the
  // end), clearing whatever was entered for it so no orphaned data lingers.
  function removeRoleRow(category) {
    const count = rowCountFor(category)
    if (count <= 1) return
    updateLocal(roleKeyFor(category, count), { memberId: '' })
    setRoleRowCounts((prev) => ({ ...prev, [category]: count - 1 }))
  }

  // "Cancel" while editing — discards any in-progress, unsaved edits by re-seeding
  // localAssignments/roleRowCounts from the last-loaded schedule (same reset the
  // scheduleForDate effect does on a fresh load) rather than refetching, then drops
  // back to the read-only view.
  function cancelEditingPlan() {
    setLocalAssignments(scheduleForDate.assignments || [])
    setRoleRowCounts({})
    setIsEditing(false)
  }

  async function saveAssignPlan() {
    setSavingAssign(true)
    try {
      const sanitizedAssignments = localAssignments.map(sanitizeAssignment)
      await setWorshipScheduleByDate(DEPARTMENT, selectedDate, sanitizedAssignments, userProfile?.email || '')
      setScheduleForDate((s) => ({ ...s, assignments: sanitizedAssignments }))
      setAssignStamp({ date: selectedDate, assignments: [...sanitizedAssignments], savedAt: new Date() })
      setStampOpen(false)

      // Update the Schedule box to show only this Sunday; move old box to Records
      const prevBox = weekBoxSchedules[0]
      const sundayObj = new Date(selectedDate + 'T12:00:00')
      const newBox = {
        sundayDate: selectedDate,
        fridayDate: format(subDays(sundayObj, 2), 'yyyy-MM-dd'),
        saturdayDate: format(subDays(sundayObj, 1), 'yyyy-MM-dd'),
        schedule: {
          ...(prevBox?.sundayDate === selectedDate ? prevBox.schedule : scheduleForDate) || {},
          date: selectedDate,
          assignments: sanitizedAssignments,
        },
      }
      setWeekBoxSchedules([newBox])
      // Keep the Practice & Attendance date picker in sync — the plan just saved for
      // this Sunday becomes what it shows, and it's added to the cache/options so
      // re-selecting it (or the derived weekBoxSchedules effect re-running) doesn't
      // show stale/missing data.
      setSelectedPracticeSunday(selectedDate)
      setAllPracticeSchedules(prev => [...prev.filter(s => s.date !== selectedDate), newBox.schedule])
      setPracticeSundayOptions(prev => Array.from(new Set([...prev, selectedDate])).sort())

      // Auto-create or update practice session for the Saturday before this Sunday
      const practiceDateStr = format(subDays(new Date(selectedDate + 'T12:00:00'), 1), 'yyyy-MM-dd')
      const songLines = sanitizedAssignments
        .filter((a) => a.songName)
        .map((a) => `${a.role}: ${a.songName}${a.key ? ` (${a.key})` : ''}`)
      const notes = [
        `Practice for Sunday ${format(new Date(selectedDate + 'T12:00:00'), 'd MMM yyyy')}`,
        ...(songLines.length ? ['', ...songLines] : []),
      ].join('\n')
      const existing = await getWorshipRehearsalByDate(DEPARTMENT, practiceDateStr)
      if (existing) {
        await updateWorshipRehearsal(existing.id, { notes })
        setRehearsals((prev) =>
          prev.map((r) => r.id === existing.id ? { ...r, notes } : r)
        )
      } else {
        const id = await addWorshipRehearsal(DEPARTMENT, {
          date: practiceDateStr, time: '', location: '', notes,
        }, userProfile?.email || '')
        setRehearsals((prev) =>
          [...prev, { id, department: DEPARTMENT, date: practiceDateStr, time: '', location: '', notes }]
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        )
      }
    } catch (error) {
      console.error('Error saving assignment:', error, { date: selectedDate, assignments: localAssignments })
      alert('Failed to save')
    } finally {
      setSavingAssign(false)
    }
  }

  async function seedDemoTeam() {
    try {
      for (const m of DEMO_TEAM) {
        await addWorshipTeamMember(DEPARTMENT, { name: m.name, memberSince: m.memberSince }, userProfile?.email)
      }
      await loadTeam()
    } catch (e) {
      console.error(e)
      alert('Failed to add demo team')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      department: DEPARTMENT,
      period: form.period,
      type: form.type,
      enteredBy: userProfile?.email || 'unknown',
      data: {},
    }
    if (form.type === 'team') payload.data = { notes: form.teamNotes }
    if (form.type === 'budget') payload.data = { planned: Number(form.plannedBudget) || 0, spent: Number(form.spent) || 0 }
    if (form.type === 'participation') payload.data = { count: Number(form.participantsCount) || 0, notes: form.activityNotes }
    try {
      await addDepartmentEntry(payload)
      setForm((f) => ({ ...f, teamNotes: '', plannedBudget: '', spent: '', participantsCount: '', activityNotes: '' }))
      setEntries(await getDepartmentEntries(DEPARTMENT, { limit: 100 }))
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
  }

  // Build charts for pastor insights
  const last6Months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), 5 - i), 'yyyy-MM'))
  const participationByMonth = last6Months.map((period) => {
    const items = entries.filter((e) => e.period === period && e.type === 'participation')
    const total = items.reduce((s, e) => s + (e.data?.count || 0), 0)
    return { period, participants: total }
  })
  const budgetByMonth = last6Months.map((period) => {
    const items = entries.filter((e) => e.period === period && e.type === 'budget')
    const planned = items.reduce((s, e) => s + (e.data?.planned || 0), 0)
    const spent = items.reduce((s, e) => s + (e.data?.spent || 0), 0)
    return { period, planned, spent }
  })

  const budget2026 = entries
    .filter((e) => e.type === 'budget' && typeof e.period === 'string' && e.period.startsWith('2026-'))
    .reduce(
      (acc, e) => {
        acc.planned += e.data?.planned || 0
        acc.spent += e.data?.spent || 0
        return acc
      },
      { planned: 0, spent: 0 }
    )

  const canViewInsights = isPastor

  if (!canManageWorship && !canViewInsights && !hasWorshipRoleAccess(userProfile)) {
    return (
      <div className="p-8 text-slate-600">
        You don't have access to the Worship department page. Ask an admin to set your <strong>department</strong> to &quot;Worship&quot; in Firestore (users collection) to plan and enter data, or use a role that can view insights.
      </div>
    )
  }

  // Route guard: a Worship Leader is restricted to the Songs tab (Song Design lives
  // inside it via a song's Edit button) — this blocks direct/typed ?tab= navigation to
  // any hidden tab, not just what's hidden from the nav grid in departmentSubpages.js.
  const allowedWorshipTabs = getAllowedWorshipTabs(userProfile, getDepartmentHubTabs('worship'))
  if (!allowedWorshipTabs.includes(activeTab)) {
    // Songs (Directory + Design) is Worship Leader/Director only. A Worship Member (or
    // anyone else without access) hitting ?tab=songsDirectory directly — a stale link,
    // a bookmark, hand-typed URL — gets bounced to Upcoming Worship, their actual home
    // tab, instead of a dead-end 403 message.
    if (activeTab === 'songsDirectory') {
      return <Navigate to="/department/worship?tab=upcomingSunday" replace />
    }
    return (
      <div className="p-8 text-slate-600">
        <p className="font-semibold text-slate-800 mb-2">403 — Unauthorized Access</p>
        <p>Your Worship Leader role only has access to the Songs module. Contact your Worship Director or Admin for broader access.</p>
      </div>
    )
  }

  const savedAssignments = scheduleForDate.assignments || []

  const anniversaryAlerts = activeMembers.flatMap(m => {
    if (!m.memberSince) return []
    const since = new Date(m.memberSince)
    const today = new Date()
    for (let i = 0; i <= 5; i++) {
      const check = new Date(today)
      check.setDate(today.getDate() + i)
      if (check.getMonth() === since.getMonth() && check.getDate() === since.getDate()) {
        const years = differenceInYears(check, since)
        if (years >= 1) return [{ ...m, daysAway: i, years }]
      }
    }
    return []
  })
  const setlistSongs = savedAssignments
    .filter(a => a.songName)
    .map((a, i) => ({
      no: i + 1,
      title: a.songName,
      key: a.key || '—',
      singer: a.memberName || '—',
      hasStructure: !!a.songId,
      _assignment: a,
    }))

  return (
    <div>
      <div className="space-y-4 px-4 pb-4 pt-1">
      {/* Shared multi-department Sunday-service programme grid (same component D
          Light/Media/Administration use) — order-of-service cards, "+ Add Programme
          Item", "Manage Custom Elements", Save. Keeps this tab's layout modular and
          consistent with every other department's Upcoming Sunday view instead of a
          Worship-only page. The personal "am I serving this week + song design" view
          (formerly here) still lives in My Workspace's Upcoming Worship widget. */}
      {activeTab === 'upcomingSunday' && (
        <UpcomingSunday slug="worship" />
      )}

      {activeTab === 'summary' && (canManageWorship || canViewInsights) && (
        <div className="space-y-4">

          {/* ── Team Performance & Growth Analytics — leads the Hub so it opens on
              performance insights rather than a repeat of the Assign tab's plan. ── */}
          <WorshipAnalyticsDashboard />

          {/* Header strip: Coming Sundays — "Distribute Plan to Team" moved to My
              Workspace's Worship card, alongside Share Setlist. */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">Coming Sundays</span>
            {upcomingSundays(2).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  selectedDate === d
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-700'
                }`}
              >
                {format(new Date(d), 'd MMM')}
              </button>
            ))}
            <input
              type="date"
              value={selectedDate}
              // Service dates are Sunday-only — min anchored to a known Sunday with
              // step=7 makes Chromium's calendar UI grey out every non-Sunday day;
              // onChange snaps forward to the nearest Sunday as a fallback for
              // browsers that don't enforce step visually (e.g. a typed/pasted date).
              min="2024-01-07"
              step={7}
              onChange={(e) => { if (e.target.value) setSelectedDate(snapToSunday(e.target.value)) }}
              className="px-2 py-1 text-sm rounded-lg border border-slate-300 text-slate-600"
            />
          </div>

          {/* Anniversary alerts */}
          {anniversaryAlerts.length > 0 && (
            <div className="bg-amber-50/80 backdrop-blur-sm rounded-2xl border border-amber-200 shadow-sm p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2.5">🎉 Year Milestones This Week</p>
              <div className="flex flex-wrap gap-2">
                {anniversaryAlerts.map(m => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-amber-200 shadow-sm">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {m.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{m.name}</p>
                      <p className="text-[11px] text-amber-700 font-medium">
                        {m.years} {m.years === 1 ? 'year' : 'years'} · {m.daysAway === 0 ? 'Today!' : `in ${m.daysAway} day${m.daysAway > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingSchedule ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading plan…</div>
          ) : savedAssignments.filter(a => a.memberId).length === 0 ? (
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm px-6 py-6 text-center text-slate-400">
              <p className="text-sm">No plan saved for this date yet.</p>
              <p className="text-xs mt-1">Go to the <strong>Assign</strong> tab to set up and save a plan.</p>
            </div>
          ) : (
            <>
              {/* Row 1: Period Summary */}
              <div>
                <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md overflow-hidden p-5">
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.035] -rotate-12">
                    <span className="text-slate-900 font-black text-6xl tracking-widest uppercase whitespace-nowrap">Official Plan</span>
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">Weekly Worship Plan Summary</p>
                        <h2 className="text-xl font-bold text-slate-800 mt-0.5">
                          {selectedDate ? format(new Date(selectedDate + 'T12:00:00'), 'EEEE, d MMMM yyyy') : '—'}
                        </h2>
                        <p className="text-sm text-slate-400 mt-0.5">Worship Department</p>
                      </div>
                      <span className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold bg-emerald-50 border-emerald-200 text-emerald-700">
                        <CheckCircle2 size={12} />
                        Plan Ready
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <div className="bg-violet-50/70 rounded-xl p-3 min-w-[100px]">
                        <p className="text-xs font-semibold text-violet-500">Assigned</p>
                        <p className="text-2xl font-bold text-violet-700 mt-0.5">{countAssignedCategories(savedAssignments)}</p>
                        <p className="text-[10px] text-violet-400">of {ROLE_CATEGORIES.length} roles</p>
                      </div>
                      {setlistSongs.length > 0 && (
                        <div className="bg-sky-50/70 rounded-xl p-3 min-w-[100px]">
                          <p className="text-xs font-semibold text-sky-500">Songs</p>
                          <p className="text-2xl font-bold text-sky-700 mt-0.5">{setlistSongs.length}</p>
                          <p className="text-[10px] text-sky-400">in setlist</p>
                        </div>
                      )}
                      {setlistSongs.filter(s => s.hasStructure).length > 0 && (
                        <div className="bg-amber-50/70 rounded-xl p-3 min-w-[100px]">
                          <p className="text-xs font-semibold text-amber-500">Structures</p>
                          <p className="text-2xl font-bold text-amber-700 mt-0.5">{setlistSongs.filter(s => s.hasStructure).length}</p>
                          <p className="text-[10px] text-amber-400">docs uploaded</p>
                        </div>
                      )}
                      <div className="bg-emerald-50/70 rounded-xl p-3 min-w-[100px]">
                        <p className="text-xs font-semibold text-emerald-500">Team Pool</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-0.5">{activeMembers.length}</p>
                        <p className="text-[10px] text-emerald-400">active members</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Setlist + Files & Contacts — the roster breakdown that used to
                  sit here (Row 2: Full Team Roster) is dropped; the same breakdown
                  already exists in My Workspace's Upcoming Worship widget. */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                {/* Music Setlist — only shown when there are songs */}
                {setlistSongs.length > 0 && (() => {
                  const hasKeys = setlistSongs.some(s => s.key && s.key !== '—')
                  const hasStructures = setlistSongs.some(s => s.hasStructure)
                  return (
                    <div className="lg:col-span-3 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md p-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Music Setlist</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              <th className="pb-2 pr-3 w-8">#</th>
                              <th className="pb-2 pr-3">Song Title</th>
                              {hasKeys && <th className="pb-2 pr-3 w-16">Key</th>}
                              <th className="pb-2 pr-3">Singer</th>
                              {hasStructures && <th className="pb-2 w-20 text-center">Structure</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {setlistSongs.map((song) => (
                              <tr key={song.no} className="hover:bg-slate-50/60 transition">
                                <td className="py-2.5 pr-3 text-slate-400 text-xs font-medium">{song.no}</td>
                                <td className="py-2.5 pr-3 font-semibold text-slate-800">{song.title}</td>
                                {hasKeys && (
                                  <td className="py-2.5 pr-3">
                                    {song.key && song.key !== '—' ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-50 border border-violet-100 text-xs font-bold text-violet-700">
                                        {song.key}
                                      </span>
                                    ) : <span className="text-xs text-slate-300">—</span>}
                                  </td>
                                )}
                                <td className="py-2.5 pr-3 text-slate-500 text-xs">{song.singer}</td>
                                {hasStructures && (
                                  <td className="py-2.5 text-center">
                                    {song.hasStructure ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const a = song._assignment
                                          const linked = a?.songId ? songs.find(s => s.id === a.songId) : null
                                          if (linked) openSongView(linked)
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition"
                                      >
                                        <Download size={11} />
                                        View
                                      </button>
                                    ) : (
                                      <span className="text-xs text-slate-300">—</span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}

                {/* Files & Contacts column */}
                <div className="lg:col-span-2 flex flex-col gap-4">

                  {/* Quick Files */}
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Quick Files</p>
                    <div className="space-y-2">
                      {[
                        { label: 'Worship Plan PDF', icon: '📄', cls: 'text-red-600 bg-red-50 border-red-100 hover:bg-red-100' },
                        { label: 'Presentation Slides', icon: '🎞️', cls: 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-100' },
                        { label: 'Song Sheets', icon: '🎵', cls: 'text-violet-600 bg-violet-50 border-violet-100 hover:bg-violet-100' },
                      ].map((f) => (
                        <button
                          key={f.label}
                          type="button"
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-semibold transition ${f.cls}`}
                        >
                          <span>{f.icon}</span>
                          <span className="flex-1 text-left">{f.label}</span>
                          <Download size={12} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Key Contacts */}
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-md p-4 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Key Contacts</p>
                    <div className="space-y-3">
                      {(() => {
                        const contacts = []
                        const director = activeMembers.find(m => m.isWorshipDirector)
                        if (director) contacts.push({ name: director.name, role: 'Worship Director' })
                        const leadVocal = savedAssignments.find(a => a.role === 'Lead Vocal-1' && a.memberName)
                        if (leadVocal) contacts.push({ name: leadVocal.memberName, role: 'Lead Vocal' })
                        const soundEng = savedAssignments.find(a => a.role === 'Sound Engineer' && a.memberName)
                        if (soundEng) contacts.push({ name: soundEng.memberName, role: 'Sound Engineer' })
                        if (!contacts.length) return <p className="text-xs text-slate-400">No contacts assigned yet.</p>
                        return contacts.map((c, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {c.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-800">{c.name}</p>
                              <p className="text-[10px] text-slate-500">{c.role}</p>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'assign' && canManageWorship && (
        <div className="space-y-4 pb-20">
          <AnimatePresence mode="popLayout">
            {assignStamp ? (
              <WorshipStamp
                stamp={assignStamp}
                isOpen={stampOpen}
                onToggle={() => setStampOpen((v) => !v)}
                onEdit={() => { setAssignStamp(null); setStampOpen(false) }}
              />
            ) : (
            <motion.div
              key="assign-form"
              layoutId="assign-card"
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto"
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="px-5 py-4 border-b border-slate-200 space-y-3">
                <h2 className="font-semibold text-slate-800">Assign worship team</h2>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Coming Sundays:</span>
                    {upcomingSundays(5).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSelectedDate(d)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${selectedDate === d ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300 hover:border-amber-400 hover:text-amber-700'}`}
                      >
                        {format(new Date(d), 'd MMM')}
                      </button>
                    ))}
                    <input
                      type="date"
                      value={selectedDate}
                      // Service dates are Sunday-only — see the matching input above.
                      min="2024-01-07"
                      step={7}
                      onChange={(e) => { if (e.target.value) setSelectedDate(snapToSunday(e.target.value)) }}
                      className="px-2 py-1 text-sm rounded-lg border border-slate-300 text-slate-600"
                      title="Pick a custom Sunday date"
                    />
                  </div>

                  {/* Read-only by default — plain-text summary of who's assigned, with
                      every select/song-search field and the Save action hidden until
                      "Edit Plan" is clicked. */}
                  {isEditing ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={cancelEditingPlan}
                        disabled={savingAssign}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveAssignPlan}
                        disabled={savingAssign}
                        className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60 shadow-sm"
                      >
                        {savingAssign ? 'Saving...' : 'Save plan'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition-colors"
                    >
                      <Pencil size={14} /> Edit Plan
                    </button>
                  )}
                </div>
              </div>
              {loadingSchedule ? (
                <div className="p-5 text-center text-slate-500">Loading...</div>
              ) : activeMembers.length === 0 ? (
                <div className="p-5 text-center text-slate-500">Add team members in the Team tab first.</div>
              ) : (() => {
                const assignRows = ROLE_CATEGORIES.flatMap((category) => {
                  const count = rowCountFor(category)
                  return Array.from({ length: count }, (_, i) => i + 1).map((index) => {
                    const role = roleKeyFor(category, index)
                    return { category, index, count, role, isLeadVocal: role.startsWith('Lead Vocal'), isLastRow: index === count }
                  })
                })
                return (
                <>
                {/* Mobile: one vertical card per role — the 3-column table below
                    (Role | Assigned to | Song Name) squishes unreadably on narrow
                    screens, so below md this stacked card grid renders instead. */}
                <div key={selectedDate + '-cards'} className="md:hidden grid grid-cols-1 gap-3 p-4">
                  {assignRows.map((row) => (
                    <RoleAssignCard
                      key={row.role}
                      {...row}
                      isEditing={isEditing}
                      activeMembers={activeMembers}
                      getLocalField={getLocalField}
                      updateLocal={updateLocal}
                      songs={songs}
                      openSongView={openSongView}
                      addRoleRow={addRoleRow}
                      removeRoleRow={removeRoleRow}
                      onOpenSongPicker={openSongPicker}
                    />
                  ))}
                </div>

                <table key={selectedDate} className="hidden md:table w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-[180px]">Role</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600 w-[260px]">Assigned to</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-slate-600">Song Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {assignRows.map(({ category, count, role, isLeadVocal, isLastRow }) => (
                      <tr key={role} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-medium text-slate-800 text-sm align-top">
                          <div className="flex flex-col gap-1">
                            <span>{roleDisplayLabel(role)}</span>
                            {isEditing && isLastRow && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => addRoleRow(category)}
                                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap"
                                >
                                  + Add {category}
                                </button>
                                {count > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeRoleRow(category)}
                                    title={`Remove this ${category}`}
                                    className="text-slate-400 hover:text-red-500 text-sm leading-none"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        {!isEditing ? (
                          <>
                            {/* Read-only summary — plain text labels, no form controls. */}
                            <td className="px-3 py-2 align-top">
                              {(() => {
                                const memberId = getLocalField(role, 'memberId')
                                const memberName = getLocalField(role, 'memberName')
                                return (
                                  <span className={`text-sm ${memberId ? 'font-semibold text-slate-800' : 'italic text-slate-400 font-normal'}`}>
                                    {memberId ? memberName : '— Not assigned'}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {isLeadVocal && (() => {
                                const songName = getLocalField(role, 'songName')
                                const songId = getLocalField(role, 'songId')
                                const songKeyVal = getLocalField(role, 'key')
                                const linkedSong = songId ? songs.find(s => s.id === songId) : null
                                if (!songName && !linkedSong) return null
                                return (
                                  <span className="text-sm font-medium text-indigo-700">
                                    {songName || linkedSong?.title}
                                    {(songKeyVal || linkedSong?.key) && (
                                      <span className="text-indigo-500"> [{songKeyVal || linkedSong?.key}]</span>
                                    )}
                                  </span>
                                )
                              })()}
                            </td>
                          </>
                        ) : (
                          <>
                        <td className="px-3 py-2">
                          <select
                            value={getLocalField(role, 'memberId')}
                            onChange={(e) => {
                              const val = e.target.value
                              const member = activeMembers.find((m) => m.id === val)
                              updateLocal(role, { memberId: val || '', memberName: member?.name || '' })
                            }}
                            className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
                          >
                            <option value="">— Not assigned</option>
                            {(() => {
                              const posKey = positionKeyForRole(role)
                              const eligible = posKey
                                ? activeMembers.filter((m) => m.positions?.includes(posKey))
                                : activeMembers
                              return eligible.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))
                            })()}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {isLeadVocal && (() => {
                            const songName = getLocalField(role, 'songName')
                            const songId = getLocalField(role, 'songId')
                            const linkedSong = songId ? songs.find(s => s.id === songId) : null
                            const q = songName.toLowerCase()
                            // Full directory, not just songs this user designed — assigning
                            // Lead Vocal needs to find any song so each instrumentalist/
                            // vocalist can later view their own part in read-only mode.
                            const matches = songs
                              .filter(s => !q || s.title?.toLowerCase().includes(q))
                              .slice(0, 8)
                            return (
                              <div className="relative">
                                <input
                                  type="text"
                                  value={songName}
                                  placeholder="Search my songs or type a name"
                                  onChange={(e) => updateLocal(role, { songName: e.target.value, songId: '', key: '' })}
                                  onFocus={() => setSongSearchOpenRole(role)}
                                  onBlur={() => setTimeout(() => setSongSearchOpenRole(r => (r === role ? null : r)), 150)}
                                  className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 bg-white"
                                />
                                {songSearchOpenRole === role && matches.length > 0 && (
                                  <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                    {matches.map(s => (
                                      <button
                                        key={s.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updateLocal(role, { songName: s.title, key: s.key || '', songId: s.id })
                                          setSongSearchOpenRole(null)
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 flex items-center justify-between gap-2"
                                      >
                                        <span className="truncate font-medium text-slate-700">{s.title}</span>
                                        {s.key && <span className="text-xs text-indigo-600 font-semibold shrink-0">{s.key}</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {linkedSong && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] font-semibold text-indigo-700">
                                      ✓ Design linked{linkedSong.key ? ` · ${linkedSong.key}` : ''}
                                    </span>
                                    <button type="button" onClick={() => openSongView(linkedSong)}
                                      className="text-[11px] font-medium text-indigo-600 hover:underline">View</button>
                                    <button type="button" onClick={() => updateLocal(role, { songId: '' })}
                                      className="text-[11px] font-medium text-slate-400 hover:text-slate-600">Unlink</button>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
                )
              })()}
            </motion.div>
            )}
          </AnimatePresence>

        </div>
      )}

      {activeTab === 'finance' && (canManageWorship || canViewInsights) && (
        <div className="space-y-4">

          {/* Expense is the permanent base view — Budget and Payout Request are
              drawers layered on top via these two icon buttons, not sibling tabs, so
              switching between them never navigates away from the expense breakdown
              underneath. No text label here — DeptExpenseTab's own merged summary
              card is the page's one "Expense" heading, so this row is icon-only. */}
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setFinanceOverlay('budget')}
              title="Budget"
              aria-label="Open Budget"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 bg-white border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              <Wallet size={17} />
            </button>
            <button
              type="button"
              onClick={() => setFinanceOverlay('payout')}
              title="Payout Request"
              aria-label="Open Payout Request"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 bg-white border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              <Banknote size={17} />
            </button>
          </div>

          <DeptExpenseTab department="Worship" />

          {financeOverlay && (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
              onClick={() => setFinanceOverlay(null)}
            >
              <div
                className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10">
                  <h3 className="font-semibold text-slate-800">{financeOverlay === 'budget' ? 'Budget' : 'Payout Request'}</h3>
                  <button
                    type="button"
                    onClick={() => setFinanceOverlay(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="p-4 pb-safe">
                  {financeOverlay === 'budget' && <BudgetPage department="Worship" />}
                  {financeOverlay === 'payout' && <AdvancePayoutTab departmentSlug="worship" departmentName="Worship" />}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Shared bottom-sheet song picker for the Assign tab's mobile "Link Song"
          button — kept as one global overlay (not per-card state) so opening it
          never grows the roster card itself. */}
      {songPickerRole && (() => {
        const q = songPickerQuery.trim().toLowerCase()
        const matches = songs.filter((s) => !q || s.title?.toLowerCase().includes(q)).slice(0, 20)
        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
            onClick={() => setSongPickerRole(null)}
          >
            <div
              className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Link a Song</h3>
                <button
                  type="button"
                  onClick={() => setSongPickerRole(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 border-b border-slate-100">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    value={songPickerQuery}
                    onChange={(e) => setSongPickerQuery(e.target.value)}
                    placeholder="Search songs or type a name"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {matches.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-6">No matching songs.</p>
                ) : (
                  matches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        updateLocal(songPickerRole, { songName: s.title, key: s.key || '', songId: s.id })
                        setSongPickerRole(null)
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-indigo-50 flex items-center justify-between gap-2"
                    >
                      <span className="truncate font-medium text-slate-700">{s.title}</span>
                      {s.key && <span className="text-xs text-indigo-600 font-semibold shrink-0">{s.key}</span>}
                    </button>
                  ))
                )}
              </div>
              {songPickerQuery.trim() && (
                <div className="p-3 pb-safe border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      updateLocal(songPickerRole, { songName: songPickerQuery.trim(), songId: '', key: '' })
                      setSongPickerRole(null)
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-indigo-300 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    <Plus size={13} strokeWidth={2.5} /> Use &quot;{songPickerQuery.trim()}&quot; as song name
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {worshipMemberLinking && (
        <WorshipLinkModal
          member={worshipMemberLinking}
          onLink={async (visitor) => {
            // `visitor` is a getMergedPeopleDirectory() entry — it has `personId` (real
            // people-collection id) and `_visitorIds` (linked D-Light visitor doc ids),
            // never a plain `.id`. Persisting `visitor.id` here silently wrote `visitorId:
            // undefined`, leaving the member just as disconnected as before "linking".
            const updated = {
              name: visitor.name,
              phone: visitor.phone || '',
              visitorId: visitor._visitorIds?.[0] || '',
              personId: visitor.personId || '',
            }
            await updateWorshipTeamMember(worshipMemberLinking.id, updated)
            setAllMembers(prev => prev.map(m => m.id === worshipMemberLinking.id ? { ...m, ...updated } : m))
            setWorshipMemberLinking(null)
          }}
          onClose={() => setWorshipMemberLinking(null)}
        />
      )}

      {editMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditMember(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-4">Edit member</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editMember.name}
                  onChange={(e) => setEditMember((m) => ({ ...m, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Member since</label>
                <input
                  type="date"
                  value={editMember.memberSince || ''}
                  onChange={(e) => setEditMember((m) => ({ ...m, memberSince: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              {editMember.isFormer && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Former since</label>
                  <input
                    type="date"
                    value={editMember.formerSince || ''}
                    onChange={(e) => setEditMember((m) => ({ ...m, formerSince: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!editMember.isWorshipDirector}
                    onChange={(e) => setEditMember((m) => ({ ...m, isWorshipDirector: e.target.checked }))}
                  />
                  Worship director
                </label>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                {MEMBER_POSITIONS.map((pos) => (
                  <label key={pos} className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 border border-slate-200">
                    <input
                      type="checkbox"
                      checked={editMember.positions?.includes(pos)}
                      onChange={(e) =>
                        setEditMember((m) => ({
                          ...m,
                          positions: e.target.checked
                            ? [...(m.positions || []), pos]
                            : (m.positions || []).filter((p) => p !== pos),
                        }))
                      }
                    />
                    <span>{pos}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-5">
              <button
                type="button"
                onClick={async () => {
                  const patch = {
                    name: editMember.name,
                    memberSince: editMember.memberSince,
                    isWorshipDirector: !!editMember.isWorshipDirector,
                    positions: editMember.positions || [],
                    ...(editMember.isFormer && { formerSince: editMember.formerSince || '' }),
                  }
                  try {
                    await updateWorshipTeamMember(editMember.id, patch)
                    setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, ...patch } : m))
                    setEditMember(null)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to update')
                  }
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                Save
              </button>
              {editMember.isFormer ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await updateWorshipTeamMember(editMember.id, { isFormer: false, formerSince: '' })
                      setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, isFormer: false, formerSince: '' } : m))
                      setEditMember(null)
                    } catch (e) {
                      console.error(e)
                      alert('Failed to update')
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200"
                >
                  Make active
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const formerSince = new Date().toISOString().slice(0, 10)
                    try {
                      await updateWorshipTeamMember(editMember.id, { isFormer: true, formerSince })
                      setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, isFormer: true, formerSince } : m))
                      setEditMember(null)
                    } catch (e) {
                      console.error(e)
                      alert('Failed to update')
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300"
                >
                  Make former
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('Delete this member permanently?')) return
                  try {
                    await deleteWorshipTeamMember(editMember.id, { department: DEPARTMENT, name: editMember.name })
                    setAllMembers(prev => prev.filter(m => m.name !== editMember.name))
                    setEditMember(null)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to delete')
                  }
                }}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700 font-medium hover:bg-red-200"
              >
                Delete
              </button>
              <button type="button" onClick={() => setEditMember(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── The Team tab ── */}
      {activeTab === 'theTeam' && (
        <div className="space-y-6 pb-24">

          {/* Active members */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-800">The Team</h2>
                <p className="text-xs text-slate-400 mt-0.5">{activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canManageWorship && (() => {
                  const unlinked = allMembers.filter(m => !m.visitorId && !m.personId)
                  if (!unlinked.length) return null
                  return (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Remove ${unlinked.length} unlinked member${unlinked.length !== 1 ? 's' : ''}?\n\n${unlinked.map(m => m.name).join(', ')}`)) return
                        try {
                          await Promise.all(unlinked.map(m => deleteWorshipTeamMember(m.id, { department: DEPARTMENT, name: m.name })))
                          setAllMembers(prev => prev.filter(m => m.visitorId || m.personId))
                        } catch (e) { console.error(e); alert('Failed to remove unlinked members') }
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors"
                    >
                      Remove {unlinked.length} Unlinked
                    </button>
                  )
                })()}
                {canManageWorship && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewMember({ name: '', visitorId: '', personId: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, positions: [], isWorshipDirector: false })
                      setAddMemberVisitors([])
                      setAddMemberVisitorsLoading(true)
                      getApprovedRosterVisitors().then(setAddMemberVisitors).catch(() => setAddMemberVisitors([])).finally(() => setAddMemberVisitorsLoading(false))
                      setAddMemberModalOpen(true)
                    }}
                    aria-label="Add New Team Member"
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm shrink-0"
                  >
                    <span className="text-lg leading-none">+</span>
                    <span className="hidden sm:inline">Add New Team Member</span>
                  </button>
                )}
              </div>
            </div>
            {loadingTeam ? (
              <div className="p-5 text-center text-slate-500">Loading...</div>
            ) : activeMembers.length === 0 ? (
              <div className="p-5 text-center text-slate-500">No team members yet.</div>
            ) : (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {activeMembers.map((m) => (
                  <WorshipMemberCard
                    key={m.id}
                    member={m}
                    canManageWorship={canManageWorship}
                    onEdit={(mm) => setEditMember({ ...mm })}
                    onDelete={handleDeleteMember}
                    onLink={!m.personId ? (mm) => setWorshipMemberLinking(mm) : undefined}
                    stats={memberSongStats[m.id]}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Former members */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Former members</h2>
            {loadingTeam ? (
              <div className="p-5 text-center text-slate-500">Loading...</div>
            ) : formerMembers.length === 0 ? (
              <div className="p-5 text-center text-slate-500">No former members.</div>
            ) : (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {formerMembers.map((m) => (
                  <WorshipMemberCard
                    key={m.id}
                    member={m}
                    isFormer
                    canManageWorship={canManageWorship}
                    onEdit={(mm) => setEditMember({ ...mm })}
                    onDelete={handleDeleteMember}
                    onLink={!m.personId ? (mm) => setWorshipMemberLinking(mm) : undefined}
                    stats={memberSongStats[m.id]}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Add member modal */}
          {addMemberModalOpen && canManageWorship && (
            <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => setAddMemberModalOpen(false)}>
              <div
                className="bg-white dark:bg-[#16213a] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border-0 dark:border dark:border-slate-700/50 overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* drag handle on mobile */}
                <div className="sm:hidden flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-600" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/50">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Add New Team Member</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Must exist in the People Directory</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddMemberModalOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 text-xl leading-none transition-colors"
                  >×</button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!newMember.visitorId && !newMember.personId) return
                    try {
                      await addWorshipTeamMember(DEPARTMENT, {
                        name: newMember.name.trim(), visitorId: newMember.visitorId, personId: newMember.personId,
                        memberSince: newMember.memberSince,
                        isFormer: newMember.isFormer, positions: newMember.positions,
                        isWorshipDirector: newMember.isWorshipDirector,
                      }, userProfile?.email)
                      setNewMember({ name: '', visitorId: '', personId: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false, positions: [], isWorshipDirector: false })
                      setAddMemberModalOpen(false)
                      await loadTeam()
                    } catch (err) { console.error(err); alert('Failed to add member') }
                  }}
                  className="px-6 py-5 space-y-4"
                >
                  {/* Person picker — keyed/matched on the merged directory entry's `_key`
                      (always present and unique), not `.id` (getMergedPeopleDirectory's
                      entries never have a plain `.id` — only `personId` for a real people-
                      collection record and `_visitorIds` for linked D-Light visitor docs).
                      Matching on `.id` here silently resolved to `undefined` for every
                      candidate, which made the browser fall back to each <option>'s text
                      content (the person's name) as its value — so a pick only ever
                      "matched" by display-name string and never actually bound a real
                      personId/visitorId onto the new team member record. */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Person <span className="text-red-400">*</span>
                    </label>
                    {(newMember.visitorId || newMember.personId) ? (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/20">
                        <span className="w-8 h-8 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                          {newMember.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-emerald-900 dark:text-emerald-300">{newMember.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewMember(m => ({ ...m, name: '', visitorId: '', personId: '' }))}
                          className="text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-200 text-xl leading-none transition-colors"
                        >×</button>
                      </div>
                    ) : (
                      <select
                        value=""
                        disabled={addMemberVisitorsLoading || addMemberVisitors.length === 0}
                        onChange={e => {
                          const v = addMemberVisitors.find(x => x._key === e.target.value)
                          if (v) setNewMember(m => ({ ...m, name: v.name, visitorId: v._visitorIds?.[0] || '', personId: v.personId || '' }))
                        }}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-500/40 focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors disabled:opacity-50"
                      >
                        <option value="" disabled>
                          {addMemberVisitorsLoading
                            ? 'Loading candidates…'
                            : addMemberVisitors.length === 0
                              ? 'No candidates ready for main roster'
                              : 'Select an approved candidate…'}
                        </option>
                        {addMemberVisitors.map(v => (
                          <option key={v._key} value={v._key}>{v.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Member since */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Member Since</label>
                    <input
                      type="date"
                      value={newMember.memberSince}
                      onChange={(e) => setNewMember((m) => ({ ...m, memberSince: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-500/40 transition-colors"
                    />
                  </div>

                  {/* Positions */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Positions</label>
                    <div className="flex flex-wrap gap-2">
                      {MEMBER_POSITIONS.map((pos) => (
                        <label
                          key={pos}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border cursor-pointer transition-colors ${
                            newMember.positions.includes(pos)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={newMember.positions.includes(pos)}
                            onChange={(e) => setNewMember((m) => ({ ...m, positions: e.target.checked ? [...m.positions, pos] : m.positions.filter((p) => p !== pos) }))}
                          />
                          {pos}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="flex flex-col gap-2.5 py-1 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/40">
                    <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={newMember.isWorshipDirector} onChange={(e) => setNewMember((m) => ({ ...m, isWorshipDirector: e.target.checked }))} className="rounded accent-indigo-600" />
                      Set as Worship Director
                    </label>
                    <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={newMember.isFormer} onChange={(e) => setNewMember((m) => ({ ...m, isFormer: e.target.checked }))} className="rounded accent-indigo-600" />
                      Mark as Former Member
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={!newMember.visitorId && !newMember.personId}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >Add Member</button>
                    <button
                      type="button"
                      onClick={() => setAddMemberModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-transparent text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Practice & Rehearsals tab ── */}
      {/* Historical review/editing of already-recorded practice attendance now lives
          in the Archives tab (each Sunday's ArchiveStamp card) alongside that week's
          published setlist — this tab is just the live Schedule view (marking
          check-ins/session times as they happen for the currently-selected week), so
          there's no separate Schedule/Records sub-nav anymore. */}
      {activeTab === 'practiceRehearsal' && (
        <div className="space-y-5">

            <div className="space-y-6">
              {/* 3-Sunday week boxes */}
              {loadingWeekBoxes ? (
                <div className="py-8 text-center text-slate-400 text-sm">Loading…</div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {/* Always shown for whichever Sunday the dropdown above has selected —
                      previously this hid itself once a week's practice was fully recorded,
                      which meant there was no way to navigate back to review/edit it. */}
                  {weekBoxSchedules.slice(0, 1).map(({ sundayDate, fridayDate, saturdayDate, schedule }) => {
                    const assignments = (schedule?.assignments || []).filter(a => a.memberId).filter((a, i, arr) => arr.findIndex(x => x.memberId === a.memberId) === i)
                    const practiceAtt = schedule?.practiceAttendance || {}

                    let fmtSunday = sundayDate
                    try { fmtSunday = format(new Date(sundayDate + 'T12:00:00'), 'd MMM yyyy') } catch {}
                    let fmtFriday = fridayDate
                    try { fmtFriday = format(new Date(fridayDate + 'T12:00:00'), 'EEE d MMM') } catch {}
                    let fmtSaturday = saturdayDate
                    try { fmtSaturday = format(new Date(saturdayDate + 'T12:00:00'), 'EEE d MMM') } catch {}

                    const arriveCount = (day) =>
                      Object.values(practiceAtt[day] || {}).filter(v => v.arrivedAt).length

                    const saveUpdated = async (updated) => {
                      await updateWorshipScheduleById(schedule.id, { practiceAttendance: updated })
                      setWeekBoxSchedules(prev =>
                        prev.map(w => w.sundayDate === sundayDate ? { ...w, schedule: { ...w.schedule, practiceAttendance: updated } } : w)
                      )
                    }

                    const markArrived = async (day, a) => {
                      const updated = { ...practiceAtt, [day]: { ...(practiceAtt[day] || {}), [a.memberId]: { arrivedAt: format(new Date(), 'HH:mm'), memberName: a.memberName } } }
                      await saveUpdated(updated)
                    }

                    const undoArrived = async (day, a) => {
                      const dayData = { ...(practiceAtt[day] || {}) }
                      delete dayData[a.memberId]
                      await saveUpdated({ ...practiceAtt, [day]: dayData })
                    }

                    const recordSession = async (sessionKey, field) => {
                      const updated = { ...practiceAtt, [sessionKey]: { ...(practiceAtt[sessionKey] || {}), [field]: format(new Date(), 'HH:mm') } }
                      await saveUpdated(updated)
                    }

                    const clearSession = async (sessionKey, field) => {
                      const sess = { ...(practiceAtt[sessionKey] || {}) }
                      delete sess[field]
                      const updated = { ...practiceAtt, [sessionKey]: sess }
                      await saveUpdated(updated)
                    }

                    const TimingRow = (label, sessionKey, field) => {
                      const val = practiceAtt[sessionKey]?.[field]
                      if (val) {
                        return (
                          <div key={field} className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-3 text-center shadow-md">
                            <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-wider">{label}</p>
                            <p className="text-lg font-bold text-white mt-0.5">{val}</p>
                            {canManageWorship && (
                              <button type="button" onClick={() => clearSession(sessionKey, field)} className="text-[9px] text-white/60 hover:text-white mt-1 transition-colors underline underline-offset-2">undo</button>
                            )}
                          </div>
                        )
                      }
                      if (canManageWorship) {
                        return (
                          <button key={field} type="button" onClick={() => recordSession(sessionKey, field)}
                            className="w-full rounded-2xl bg-white border-2 border-dashed border-slate-200 px-4 py-3 text-center hover:border-indigo-300 hover:bg-indigo-50 active:scale-95 transition-all">
                            <p className="text-xs font-semibold text-slate-500">{label}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">tap to record time</p>
                          </button>
                        )
                      }
                      return (
                        <div key={field} className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-center">
                          <p className="text-xs text-slate-400">{label}</p>
                          <p className="text-[10px] text-slate-300 mt-0.5">—</p>
                        </div>
                      )
                    }

                    const renderDay = (day, sessionKey, fmtLabel, sessionFields) => {
                      const dayAtt = practiceAtt[day] || {}
                      return (
                        <div className="px-4 py-3 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-600">{fmtLabel}</p>
                            {assignments.length > 0 && (
                              <span className="text-xs text-violet-600 font-medium">{arriveCount(day)}/{assignments.length} arrived</span>
                            )}
                          </div>
                          {assignments.length === 0 ? (
                            <p className="text-xs text-slate-300 italic">No team assigned</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                              {assignments.map(a => {
                                const rec = dayAtt[a.memberId]
                                const initial = (a.memberName || '?').charAt(0).toUpperCase()
                                if (rec?.arrivedAt) {
                                  return (
                                    <div key={a.memberId} className="rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 px-3 py-3 text-center shadow-md flex flex-col items-center">
                                      <div className="w-9 h-9 rounded-full bg-white/25 text-white text-sm font-bold flex items-center justify-center mb-1.5 shadow-inner">
                                        {initial}
                                      </div>
                                      <p className="text-xs font-semibold text-white truncate w-full text-center leading-tight">{a.memberName}</p>
                                      <span className="text-[10px] font-bold text-emerald-100 mt-1 bg-white/20 px-2 py-0.5 rounded-full">{rec.arrivedAt}</span>
                                      {canManageWorship && (
                                        <button type="button" onClick={() => undoArrived(day, a)} className="text-[9px] text-white/60 hover:text-white mt-1.5 transition-colors leading-none underline underline-offset-2">
                                          undo
                                        </button>
                                      )}
                                    </div>
                                  )
                                }
                                if (canManageWorship) {
                                  return (
                                    <button
                                      key={a.memberId}
                                      type="button"
                                      onClick={() => markArrived(day, a)}
                                      className="rounded-2xl bg-white border-2 border-slate-100 shadow-sm px-3 py-3 text-center flex flex-col items-center hover:border-violet-300 hover:bg-violet-50 hover:shadow-md active:scale-95 transition-all w-full"
                                    >
                                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-400 text-sm font-bold flex items-center justify-center mb-1.5">
                                        {initial}
                                      </div>
                                      <p className="text-xs font-semibold text-slate-600 truncate w-full text-center leading-tight">{a.memberName}</p>
                                      <p className="text-[9px] text-slate-400 mt-1">tap to mark</p>
                                    </button>
                                  )
                                }
                                return (
                                  <div key={a.memberId} className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-3 text-center flex flex-col items-center">
                                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-300 text-sm font-bold flex items-center justify-center mb-1.5">
                                      {initial}
                                    </div>
                                    <p className="text-xs text-slate-400 truncate w-full text-center leading-tight">{a.memberName}</p>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          <div className="border-t border-slate-100 pt-3 px-1 grid grid-cols-1 gap-2">
                            {sessionFields.map(([label, field]) => TimingRow(label, sessionKey, field))}
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={sundayDate} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Sunday Service</p>
                              <p className="text-base font-bold text-white mt-0.5">{fmtSunday}</p>
                              <p className="text-xs text-violet-200 mt-0.5">{assignments.length > 0 ? `${assignments.length} members assigned` : 'No team assigned yet'}</p>
                            </div>
                            {practiceSundayOptions.length > 1 && (
                              <select
                                value={sundayDate}
                                onChange={(e) => setSelectedPracticeSunday(e.target.value)}
                                className="shrink-0 text-xs font-semibold bg-white/15 text-white border border-white/30 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-white/50"
                              >
                                {practiceSundayOptions.map((d) => {
                                  let label = d
                                  try { label = format(new Date(d + 'T12:00:00'), 'd MMM yyyy') } catch {}
                                  return <option key={d} value={d} className="text-slate-800">{label}</option>
                                })}
                              </select>
                            )}
                          </div>
                          {/* Pairs the selected service date with its practice/rehearsal dates so
                              the leader can confirm which roster session they're marking before
                              tapping any names below (e.g. distinguishing this week's Fri 21 Aug
                              from last week's Fri 31 Jul). */}
                          <div className="mt-2 pt-2 border-t border-white/20 flex items-center gap-3 flex-wrap">
                            <span className="text-[10px] font-semibold text-white bg-white/15 px-2 py-0.5 rounded-full">Practice Fri {fmtFriday}</span>
                            <span className="text-[10px] font-semibold text-white bg-white/15 px-2 py-0.5 rounded-full">Rehearsal Sat {fmtSaturday}</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          {renderDay('friday', 'fridaySession', fmtFriday, [
                            ['End of Practice', 'endOfPractice'],
                          ])}
                          {format(new Date(), 'yyyy-MM-dd') === saturdayDate && renderDay('saturday', 'saturdaySession', fmtSaturday, [
                            ['End of Practice', 'endOfPractice'],
                            ['Begin Rehearsal', 'beginRehearsal'],
                            ['End of Rehearsal', 'endRehearsal'],
                          ])}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          {/* ── Custom Sessions ── */}
          {(loadingRehearsals || rehearsals.length > 0) && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Custom Sessions</p>

          {loadingRehearsals ? (
            <div className="py-10 text-center text-slate-400 text-sm">Loading…</div>
          ) : (() => {
            const today = format(new Date(), 'yyyy-MM-dd')
            // Only show custom sessions that fall within the current active week (Mon–Sun of active Sunday)
            const activeSunday = weekBoxSchedules[0]?.sundayDate
            const weekStart = activeSunday
              ? format(subDays(new Date(activeSunday + 'T12:00:00'), 6), 'yyyy-MM-dd')
              : today
            const upcoming = rehearsals.filter(r =>
              (r.date || '') >= today &&
              r.date >= weekStart &&
              (activeSunday ? r.date <= activeSunday : true)
            )
            const past = rehearsals.filter(r => (r.date || '') < today)

            const openAttendance = (r) => {
              const draft = {}
              activeMembers.forEach(m => {
                const saved = r.attendance?.[m.id] || {}
                draft[m.id] = { present: saved.present ?? false, arrivedAt: saved.arrivedAt ?? '', memberName: m.name }
              })
              setAttendanceDraft(draft)
              setOpenAttendanceId(r.id)
            }

            const saveAttendance = async (rid) => {
              await updateWorshipRehearsal(rid, { attendance: attendanceDraft })
              setRehearsals(prev => prev.map(x => x.id === rid ? { ...x, attendance: { ...attendanceDraft } } : x))
              setOpenAttendanceId(null)
            }

            const AttendancePanel = ({ r }) => {
              const presentCount = Object.values(attendanceDraft).filter(v => v.present).length
              return (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Attendance · {presentCount} of {activeMembers.length} present</p>
                    <button type="button" onClick={() => setOpenAttendanceId(null)} className="text-xs text-slate-400 hover:text-slate-600">✕ Close</button>
                  </div>
                  <div className="space-y-2">
                    {activeMembers.map(m => {
                      const entry = attendanceDraft[m.id] || { present: false, arrivedAt: '' }
                      return (
                        <div key={m.id} className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`att-${r.id}-${m.id}`}
                            checked={entry.present}
                            onChange={e => setAttendanceDraft(d => ({ ...d, [m.id]: { ...d[m.id], present: e.target.checked, memberName: m.name } }))}
                            className="w-4 h-4 rounded accent-violet-600 flex-shrink-0"
                          />
                          <label htmlFor={`att-${r.id}-${m.id}`} className={`text-sm flex-1 cursor-pointer ${entry.present ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                            {m.name}
                            {m.isWorshipDirector && <span className="ml-1.5 text-[10px] text-amber-600 font-semibold">Director</span>}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">Arrived</span>
                            <input
                              type="time"
                              value={entry.arrivedAt}
                              disabled={!entry.present}
                              onChange={e => setAttendanceDraft(d => ({ ...d, [m.id]: { ...d[m.id], arrivedAt: e.target.value } }))}
                              className="px-2 py-1 text-xs rounded border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed w-24"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {canManageWorship && (
                    <button
                      type="button"
                      onClick={() => saveAttendance(r.id)}
                      className="w-full py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
                    >
                      Save Attendance
                    </button>
                  )}
                </div>
              )
            }

            const attendanceSummary = (r) => {
              if (!r.attendance) return null
              const present = Object.values(r.attendance).filter(v => v.present).length
              const total = Object.keys(r.attendance).length
              if (!total) return null
              return <span className="text-xs bg-violet-50 text-violet-700 border border-violet-100 rounded-full px-2 py-0.5">{present}/{total} present</span>
            }

            return (
              <div className="space-y-6 pb-20">
                {upcoming.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Upcoming</p>
                    <div className="space-y-3">
                      {upcoming.map((r) => {
                        let fmtDate = r.date
                        try { fmtDate = format(new Date(r.date + 'T12:00:00'), 'EEE, d MMM yyyy') } catch {}
                        let practiceForLabel = ''
                        try {
                          const d = new Date(r.date + 'T12:00:00')
                          practiceForLabel = format(addDays(d, (7 - d.getDay()) % 7), 'EEE d MMM')
                        } catch {}
                        const isAttendanceOpen = openAttendanceId === r.id
                        const isMenuOpen = openSessionMenuId === r.id
                        return (
                          <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-800 text-sm whitespace-nowrap">{fmtDate}</span>
                                  {r.time && <span className="text-xs bg-violet-50 text-violet-700 border border-violet-100 rounded-full px-2 py-0.5 font-medium shrink-0">{r.time}</span>}
                                  {r.done && <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-0.5 font-medium shrink-0">Done</span>}
                                  {attendanceSummary(r)}
                                </div>
                                {practiceForLabel && <p className="text-xs text-slate-400">Practice for {practiceForLabel}</p>}
                                {r.location && <p className="text-xs text-slate-500 mt-0.5">📍 {r.location}</p>}
                                {r.notes && <p className="text-sm text-slate-600 mt-1">{r.notes}</p>}
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => isAttendanceOpen ? setOpenAttendanceId(null) : openAttendance(r)}
                                  className={`text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap transition-colors ${isAttendanceOpen ? 'bg-violet-700 text-white' : 'bg-violet-600 text-white hover:bg-violet-700'}`}
                                >
                                  {isAttendanceOpen ? 'Close' : 'Mark Attendance'}
                                </button>
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setOpenSessionMenuId(v => v === r.id ? null : r.id)}
                                    aria-label="Session actions"
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                  >
                                    <MoreVertical size={16} />
                                  </button>
                                  {isMenuOpen && (
                                    <>
                                      <div className="fixed inset-0 z-10" onClick={() => setOpenSessionMenuId(null)} aria-hidden />
                                      <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                                        {canManageWorship && !r.done && (
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              setOpenSessionMenuId(null)
                                              await updateWorshipRehearsal(r.id, { done: true })
                                              setRehearsals(prev => prev.map(x => x.id === r.id ? { ...x, done: true } : x))
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                                          >
                                            <CheckCircle2 size={13} /> Mark done
                                          </button>
                                        )}
                                        {canManageWorship && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenSessionMenuId(null)
                                              setEditingRehearsal(r)
                                              setRehearsalForm({ date: r.date || '', time: r.time || '', location: r.location || '', notes: r.notes || '' })
                                              setRehearsalModalOpen(true)
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                                          >
                                            <Pencil size={13} /> Edit
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            setOpenSessionMenuId(null)
                                            if (!window.confirm('Remove this practice session?')) return
                                            await deleteWorshipRehearsal(r.id)
                                            setRehearsals(prev => prev.filter(x => x.id !== r.id))
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                          <Trash2 size={13} /> Remove
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            {isAttendanceOpen && <AttendancePanel r={r} />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {past.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Past Sessions</p>
                    <div className="space-y-2">
                      {[...past].reverse().map((r) => {
                        let fmtDate = r.date
                        try { fmtDate = format(new Date(r.date + 'T12:00:00'), 'EEE, d MMM yyyy') } catch {}
                        const isAttendanceOpen = openAttendanceId === r.id
                        return (
                          <div key={r.id} className="bg-slate-50 rounded-xl border border-slate-100 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-600 shrink-0">{fmtDate}</span>
                              {r.time && <span className="text-xs text-slate-400 shrink-0">{r.time}</span>}
                              {r.location && <span className="text-xs text-slate-400 truncate min-w-0">· {r.location}</span>}
                              {r.done && <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-0.5 shrink-0">Done</span>}
                              <div className="flex-1" />
                              {attendanceSummary(r)}
                              <button
                                type="button"
                                onClick={() => isAttendanceOpen ? setOpenAttendanceId(null) : openAttendance(r)}
                                className={`text-xs font-medium rounded-full px-2.5 py-1 shrink-0 transition-colors ${isAttendanceOpen ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 border border-violet-100 hover:bg-violet-100'}`}
                              >
                                {isAttendanceOpen ? 'Close' : 'Attendance'}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Remove this practice session?')) return
                                  await deleteWorshipRehearsal(r.id)
                                  setRehearsals(prev => prev.filter(x => x.id !== r.id))
                                }}
                                aria-label="Remove session"
                                className="w-6 h-6 flex items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            {r.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{r.notes}</p>}
                            {isAttendanceOpen && <AttendancePanel r={r} />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {rehearsalModalOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRehearsalModalOpen(false)}>
              <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
                <h3 className="font-semibold text-slate-800 mb-4">{editingRehearsal ? 'Edit Session' : 'Add Practice Session'}</h3>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      if (editingRehearsal) {
                        await updateWorshipRehearsal(editingRehearsal.id, rehearsalForm)
                        setRehearsals(prev => prev.map(x => x.id === editingRehearsal.id ? { ...x, ...rehearsalForm } : x).sort((a, b) => (a.date || '').localeCompare(b.date || '')))
                      } else {
                        const id = await addWorshipRehearsal(DEPARTMENT, rehearsalForm, userProfile?.email)
                        setRehearsals(prev => [...prev, { id, department: DEPARTMENT, ...rehearsalForm }].sort((a, b) => (a.date || '').localeCompare(b.date || '')))
                      }
                      setRehearsalModalOpen(false)
                    } catch (err) {
                      console.error(err)
                      alert('Failed to save')
                    }
                  }}
                >
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date <span className="text-red-400">*</span></label>
                    <input type="date" required value={rehearsalForm.date} onChange={e => setRehearsalForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
                    <input type="time" value={rehearsalForm.time} onChange={e => setRehearsalForm(f => ({ ...f, time: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
                    <input type="text" placeholder="e.g. Main Hall" value={rehearsalForm.location} onChange={e => setRehearsalForm(f => ({ ...f, location: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                    <textarea rows={3} placeholder="What to focus on, songs to practice…" value={rehearsalForm.notes} onChange={e => setRehearsalForm(f => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" className="flex-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">{editingRehearsal ? 'Save' : 'Add'}</button>
                    <button type="button" onClick={() => setRehearsalModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          </div>
          )}
        </div>
      )}

      {/* ── Songs Directory tab ── */}
      {activeTab === 'songsDirectory' && (
        <div className="space-y-4">

          {/* Sub-nav */}
          <div className="flex items-center gap-1 border-b border-slate-200">
            {[{ key: 'directory', label: 'Directory' }, { key: 'design', label: 'Design your song' }].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSongSubPage(key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${songSubPage === key ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-violet-600'}`}
              >{label}</button>
            ))}
          </div>

          {/* ── Directory sub-page ── */}
          {songSubPage === 'directory' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">{songs.length} song{songs.length !== 1 ? 's' : ''}</p>
                {canManageWorshipSongs && (
                  <button
                    type="button"
                    onClick={() => { setSongForm({ title: '', artist: '', key: '', tempo: '', notes: '' }); setSongModal('add') }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    <span className="text-base leading-none">+</span> Add Song
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="Search by title or artist…"
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />

              {loadingSongs ? (
                <div className="text-center py-10 text-slate-400 text-sm">Loading…</div>
              ) : songs.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">No songs yet. Add your first song.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(() => {
                    const filtered = songs.filter((s) => {
                      const q = songSearch.toLowerCase()
                      return !q || s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q)
                    })
                    if (filtered.length === 0) return <p className="col-span-full text-center text-slate-400 text-sm py-6">No songs match your search.</p>
                    return filtered.map((song, i) => {
                      const theme = SONG_CARD_THEMES[i % SONG_CARD_THEMES.length]
                      const designer = song.designedBy || song.createdBy
                      return (
                        <div
                          key={song.id}
                          className={`rounded-2xl border border-slate-200/60 border-t-4 ${theme.border} ${theme.bg} px-4 py-3 shadow-sm hover:shadow-md active:scale-[0.99] cursor-pointer transition-all`}
                          onClick={() => openSongView(song)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`font-bold text-base truncate ${theme.title}`}>{song.title}</p>
                              {designer && (
                                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                  Designed by <span className="font-medium text-slate-500">{designer}</span>
                                </p>
                              )}
                              {song.key && (
                                <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mt-1.5 ${theme.chip}`}>
                                  {song.key}
                                </span>
                              )}
                            </div>
                            {canEditSong(song) && (
                              <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                <button type="button" onClick={() => { setEditingSong(song); setSongSubPage('design') }}
                                  title="Edit song"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white/70 transition-colors">
                                  <Pencil size={14} />
                                </button>
                                <button type="button" disabled={deletingId === song.id} onClick={async () => {
                                  if (!window.confirm(`Delete "${song.title}"?`)) return
                                  setDeletingId(song.id)
                                  try { await deleteWorshipSong(song.id); setSongs((p) => p.filter((s) => s.id !== song.id)) } finally { setDeletingId(null) }
                                }}
                                  title="Delete song"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-white/70 transition-colors disabled:opacity-40">
                                  {deletingId === song.id ? <span className="text-xs">…</span> : <Trash2 size={14} />}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── Design your song sub-page ── */}
          {songSubPage === 'design' && (
            <SongDesigner
              canManageWorship={canManageWorshipSongs}
              userProfile={userProfile}
              editingSong={editingSong}
              onCancelEdit={() => { setEditingSong(null); setSongSubPage('directory') }}
              onSaved={() => { loadSongs(); if (editingSong) { setEditingSong(null); setSongSubPage('directory') } }}
            />
          )}

          {/* Add / Edit modal (Directory) */}
          {songModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
                <h3 className="font-semibold text-slate-800">{songModal === 'add' ? 'Add Song' : 'Edit Song'}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Title *</label>
                    <input value={songForm.title} onChange={(e) => setSongForm((p) => ({ ...p, title: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Song title" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Artist / Author</label>
                    <input value={songForm.artist} onChange={(e) => setSongForm((p) => ({ ...p, artist: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="e.g. Hillsong" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-600 block mb-1">Key</label>
                      <select value={songForm.key} onChange={(e) => setSongForm((p) => ({ ...p, key: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                        <option value="">—</option>
                        {['C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab','A','A#/Bb','B'].map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-slate-600 block mb-1">Tempo (BPM)</label>
                      <input
                        type="number"
                        min="1"
                        max="300"
                        inputMode="numeric"
                        value={songForm.tempo}
                        onChange={(e) => setSongForm((p) => ({ ...p, tempo: e.target.value }))}
                        placeholder="e.g. 120"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
                    <textarea value={songForm.notes} onChange={(e) => setSongForm((p) => ({ ...p, notes: e.target.value }))} rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Chords, links, arrangement notes…" />
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setSongModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button
                    type="button"
                    disabled={savingSong || !songForm.title.trim()}
                    onClick={async () => {
                      setSavingSong(true)
                      try {
                        if (songModal === 'add') {
                          await addWorshipSong(songForm, userProfile?.name || 'unknown')
                        } else {
                          await updateWorshipSong(songModal.id, { title: songForm.title, artist: songForm.artist, key: songForm.key, tempo: songForm.tempo ? Number(songForm.tempo) : null, notes: songForm.notes })
                        }
                        await loadSongs()
                        setSongModal(null)
                      } finally {
                        setSavingSong(false)
                      }
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-all"
                  >{savingSong ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Archives tab ── */}
      {activeTab === 'archives' && (
        <div className="space-y-3 pb-20">
          {!loadingArchives && archiveSchedules.length > 0 && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  const allOpen = archiveSchedules.every((s) => openArchiveIds[s.id])
                  const next = {}
                  if (!allOpen) archiveSchedules.forEach((s) => { next[s.id] = true })
                  setOpenArchiveIds(next)
                }}
                className="text-xs text-slate-500 hover:text-indigo-600 underline"
              >
                {archiveSchedules.every((s) => openArchiveIds[s.id]) ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          )}

          {loadingArchives ? (
            <div className="py-10 text-center text-slate-400 text-sm">Loading archives…</div>
          ) : archiveSchedules.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">No published worship stamps found for past weeks.</div>
          ) : (
            <div className="space-y-2">
              {archiveSchedules.map((stamp) => (
                <ArchiveStamp
                  key={stamp.id}
                  stamp={stamp}
                  isOpen={!!openArchiveIds[stamp.id]}
                  onToggle={() => setOpenArchiveIds((prev) => ({ ...prev, [stamp.id]: !prev[stamp.id] }))}
                  canManageWorship={canManageWorship}
                  onSaveTimes={async (scheduleId, updatedPA) => {
                    await updateWorshipScheduleById(scheduleId, { practiceAttendance: updatedPA })
                    setArchiveSchedules((prev) => prev.map((s) => (s.id === scheduleId ? { ...s, practiceAttendance: updatedPA } : s)))
                    // Keep the live Schedule sub-page's cached box in sync too, in case
                    // this same week happens to be showing there.
                    setWeekBoxSchedules((prev) => prev.map((w) => (w.schedule?.id === scheduleId ? { ...w, schedule: { ...w.schedule, practiceAttendance: updatedPA } } : w)))
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Song full-view overlay — top-level so it can open from any tab
          (e.g. the Assign tab's Song Name directory search), not just Song Directory */}
      {viewingSong && (
        <SongViewer
          song={viewingSong}
          canManage={canEditSong(viewingSong)}
          myPositions={viewSongPositions || myWorshipMember?.positions || []}
          initialViewMode={viewSongMode}
          onClose={() => setViewingSong(null)}
          onEdit={song => { setViewingSong(null); setEditingSong(song); setSongSubPage('design') }}
        />
      )}

      </div>
    </div>
  )
}

// ─── Worship Member Link Modal ────────────────────────────────────────────────
function WorshipLinkModal({ member, onLink, onClose }) {
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(member.name || '')
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    getMergedPeopleDirectory()
      .then(({ people }) => setVisitors(people))
      .catch(() => setVisitors([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = visitors.filter(v =>
    !search.trim() || v.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
        <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Link to Visitor Entry</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Linking <span className="font-medium text-slate-600">{member.name}</span>
              </p>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl flex-shrink-0">×</button>
          </div>

          {/* Search */}
          <div className="px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                autoFocus
                placeholder="Search visitor name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400"
              />
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto min-h-0 flex-1">
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading visitors…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No matches found.</div>
            ) : filtered.map(v => {
              // Same `.id`-doesn't-exist issue as the Add Member picker below —
              // getMergedPeopleDirectory() entries only carry `_key`/`personId`/
              // `_visitorIds`, never a plain `.id`.
              const isCurrent = (!!member.personId && v.personId === member.personId) ||
                (!!member.visitorId && (v._visitorIds || []).includes(member.visitorId))
              return (
                <button
                  key={v._key}
                  type="button"
                  disabled={linking}
                  onClick={async () => {
                    setLinking(true)
                    await onLink(v)
                    setLinking(false)
                  }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-50 transition-colors
                    ${isCurrent ? 'bg-emerald-50' : 'hover:bg-indigo-50'}`}
                >
                  <div className={`w-9 h-9 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0
                    ${isCurrent ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                    {v.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{v.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {v.phone && <span className="text-xs text-slate-400">{v.phone}</span>}
                      {v.year && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{v.year}</span>}
                      {v.attendedDate && <span className="text-xs text-slate-400">{v.attendedDate}</span>}
                    </div>
                  </div>
                  {isCurrent
                    ? <span className="text-xs text-emerald-600 font-semibold flex-shrink-0">Current</span>
                    : <svg className="flex-shrink-0 text-slate-300" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  }
                </button>
              )
            })}
          </div>

          {/* Footer */}
          {!loading && (
            <div className="px-4 py-2.5 border-t border-slate-100 flex-shrink-0 text-center text-xs text-slate-400">
              {filtered.length} visitor{filtered.length !== 1 ? 's' : ''} shown
            </div>
          )}
        </div>
      </div>
    </>
  )
}

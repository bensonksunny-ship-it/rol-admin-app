import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, X, Phone, Mail, Users, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  getPCSEntries,
  getAllCellGroupMembers,
  getRecentCellReportsForHeatmap,
  getSundayAttendanceNameSetsInRange,
  getAllFamilyLinks,
  getDepartmentChildren,
} from '../services/firestore'
import { formatDisplayDate } from '../utils/date'

function Field({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm text-slate-700 mt-0.5">{value}</p>
    </div>
  )
}

// ── Attendance colour system ──────────────────────────────────────────────────
// Both metrics are scored out of a fixed 4-week window, so the only possible
// percentages are 0/25/50/75/100 — 100% is "high", 50-75% is "medium", below
// that is "low". `unknown` (grey) is for a person with no resolved cell — not
// the same as "critical absence", so it isn't scored rose.
const ATTENDANCE_TIER_STYLES = {
  high:    { badgeCls: 'text-emerald-700 bg-emerald-50 border-emerald-100', dot: 'bg-emerald-500' },
  medium:  { badgeCls: 'text-amber-700 bg-amber-50 border-amber-100',       dot: 'bg-amber-500' },
  low:     { badgeCls: 'text-rose-700 bg-rose-50 border-rose-100',          dot: 'bg-rose-500' },
  unknown: { badgeCls: 'text-slate-500 bg-slate-50 border-slate-100',       dot: 'bg-slate-300' },
}

function attendanceTier(pct) {
  if (pct == null) return 'unknown'
  if (pct >= 100) return 'high'
  if (pct >= 50) return 'medium'
  return 'low'
}

const ATTENDANCE_WEEKS = 4

function AttendanceBadge({ label, stat, compact = false }) {
  const t = ATTENDANCE_TIER_STYLES[stat.tier]
  const text = stat.count == null ? 'No Cell' : `${stat.count}/${ATTENDANCE_WEEKS} Wks`
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full border whitespace-nowrap ${t.badgeCls} ${
        compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2.5 py-1'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.dot}`} />
      {compact ? text : `${label}: ${text}`}
    </span>
  )
}

// Family Unit Card — Family View's grouped equivalent of the individual grid
// card. `group.members` is 1 (single) or 2 (spouse pair) real PCS people;
// `group.children` is name-only tags with no attendance of their own (see the
// familyGroups comment in PCSViewOnly for why).
function FamilyCard({ group, attendanceLoading, getAttendance, getCombinedAttendance, onSelectMember }) {
  const { members, children } = group
  const headName = members.length > 1
    ? `${members[0].name || 'Unnamed'} & ${members[1].name || 'Unnamed'}`
    : (members[0].name || 'Unnamed')

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-white flex items-center justify-center flex-shrink-0">
          <Users size={16} />
        </div>
        <p className="text-sm font-bold text-slate-800 truncate">{headName}</p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {members.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelectMember(m)}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors"
          >
            {m.name || 'Unnamed'}{i > 0 ? ' · Spouse' : ''}
          </button>
        ))}
        {children.map((name) => (
          <span key={name} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100">
            {name} · Child
          </span>
        ))}
      </div>

      {attendanceLoading ? (
        <p className="text-[10px] text-slate-300">Loading attendance…</p>
      ) : (() => {
        const combined = getCombinedAttendance(members)
        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <AttendanceBadge label="Household Sunday" stat={combined.sunday} />
              <AttendanceBadge label="Household Cell" stat={combined.cell} />
            </div>
            {members.length > 1 && (
              <div className="flex flex-col gap-1 pt-1.5 border-t border-slate-50">
                {members.map((m) => {
                  const att = getAttendance(m)
                  return (
                    <div key={m.id} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 truncate flex-1">{m.name}</span>
                      <AttendanceBadge stat={att.sunday} compact />
                      <AttendanceBadge stat={att.cell} compact />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

const normPhoneKey = (p) => String(p || '').replace(/\s+/g, '')

/** Last `count` Sunday dates (most recent first), as YYYY-MM-DD. */
function recentSundayISODates(count) {
  const today = new Date()
  const lastSunday = new Date(today)
  lastSunday.setDate(today.getDate() - today.getDay())
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(lastSunday)
    d.setDate(lastSunday.getDate() - i * 7)
    return d.toISOString().slice(0, 10)
  })
}

// Read-only PCS browser for the First Lady hub — lets the assigned person look up and
// keep track of people in Personal Caring System without any of Caring's edit/remove/
// assignment actions. Pulls straight from getPCSEntries() (already open to any signed-in
// user per firestore.rules) rather than reusing DepartmentHub's PCS tab, which is deeply
// tied to Caring-only editing state.
function PCSViewOnly() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [viewMode, setViewMode] = useState('individual') // 'individual' | 'family'

  const [cellMembers, setCellMembers] = useState([])
  const [sundayWeeks, setSundayWeeks] = useState([]) // [{ date, names: Set }]
  const [cellReportsByCellId, setCellReportsByCellId] = useState(new Map())
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [familyLinks, setFamilyLinks] = useState(new Map()) // visitorId -> { spouseVisitorId, children, gender }
  const [riverKidsChildren, setRiverKidsChildren] = useState([])

  useEffect(() => {
    getPCSEntries().then(setEntries).catch(() => setEntries([])).finally(() => setLoading(false))
  }, [])

  // Church-wide data needed to score attendance — loaded once, independent of
  // the PCS entries themselves (which cell a person is in, and who attended
  // service each of the last 4 Sundays).
  useEffect(() => {
    const sundayDates = recentSundayISODates(ATTENDANCE_WEEKS)
    Promise.all([
      getAllCellGroupMembers().catch(() => []),
      getSundayAttendanceNameSetsInRange(sundayDates[sundayDates.length - 1], sundayDates[0]).catch(() => []),
      getAllFamilyLinks().catch(() => new Map()),
      getDepartmentChildren('River Kids').catch(() => []),
    ]).then(([members, weeks, links, kids]) => {
      setCellMembers(members)
      setSundayWeeks(weeks)
      setFamilyLinks(links)
      setRiverKidsChildren(kids.filter((k) => k.active !== false))
    })
  }, [])

  // Resolve each PCS entry to a cellId (visitorId first, then phone — same
  // fallback DepartmentHub uses to match PCS people against cell rosters),
  // then fetch each distinct cell's last 4 reports' attendee-name sets.
  const cellIdByEntryId = useMemo(() => {
    const visitorIdMap = new Map()
    const phoneMap = new Map()
    cellMembers.forEach((m) => {
      if (m.visitorId && (!visitorIdMap.has(m.visitorId) || m.status === 'active')) visitorIdMap.set(m.visitorId, m)
      if (m.phone) {
        const key = normPhoneKey(m.phone)
        if (!phoneMap.has(key) || m.status === 'active') phoneMap.set(key, m)
      }
    })
    const map = new Map()
    entries.forEach((e) => {
      const match = (e.visitorId && visitorIdMap.get(e.visitorId)) || (e.phone && phoneMap.get(normPhoneKey(e.phone)))
      if (match) map.set(e.id, match.cellId)
    })
    return map
  }, [entries, cellMembers])

  const loadCellAttendance = useCallback(() => {
    const distinctCellIds = [...new Set(cellIdByEntryId.values())]
    // Promise.all([]) resolves immediately with [] when nobody's cell is known yet.
    Promise.all(
      distinctCellIds.map((cid) => getRecentCellReportsForHeatmap(cid, ATTENDANCE_WEEKS).catch(() => []))
    ).then((results) => {
      setCellReportsByCellId(new Map(distinctCellIds.map((cid, i) => [cid, results[i]])))
    }).finally(() => setAttendanceLoading(false))
  }, [cellIdByEntryId])

  useEffect(() => { loadCellAttendance() }, [loadCellAttendance])

  // Per-week attendance flags (not just a count) so a family's combined badge
  // can be a real week-by-week union ("did anyone in this household attend
  // each of the last 4 weeks") rather than just adding two counts together.
  const getWeekFlags = (entry) => {
    const normName = String(entry.name || '').trim().toLowerCase()
    const sundayFlags = Array.from({ length: ATTENDANCE_WEEKS }, (_, i) => !!sundayWeeks[i]?.names.has(normName))
    const cellId = cellIdByEntryId.get(entry.id) || null
    const reports = cellId ? (cellReportsByCellId.get(cellId) || []) : []
    const cellFlags = Array.from({ length: ATTENDANCE_WEEKS }, (_, i) => !!reports[i]?.attendeeNames.has(normName))
    return { sundayFlags, cellFlags, hasCellId: !!cellId }
  }

  const statFromFlags = (flags) => {
    const count = flags.filter(Boolean).length
    const pct = Math.round((count / ATTENDANCE_WEEKS) * 100)
    return { count, pct, tier: attendanceTier(pct) }
  }

  const getAttendance = (entry) => {
    const { sundayFlags, cellFlags, hasCellId } = getWeekFlags(entry)
    return {
      sunday: statFromFlags(sundayFlags),
      cell: hasCellId ? statFromFlags(cellFlags) : { count: null, pct: null, tier: 'unknown' },
    }
  }

  // Household roll-up — "did anyone in this family attend" per week, not a sum
  // of individual counts (so a couple who both attended the same Sunday still
  // reads as 1 week, not double-counted).
  const getCombinedAttendance = (members) => {
    const perMember = members.map(getWeekFlags)
    const sundayUnion = Array.from({ length: ATTENDANCE_WEEKS }, (_, i) => perMember.some((m) => m.sundayFlags[i]))
    const cellUnion = Array.from({ length: ATTENDANCE_WEEKS }, (_, i) => perMember.some((m) => m.cellFlags[i]))
    const anyHasCellId = perMember.some((m) => m.hasCellId)
    return {
      sunday: statFromFlags(sundayUnion),
      cell: anyHasCellId ? statFromFlags(cellUnion) : { count: null, pct: null, tier: 'unknown' },
    }
  }

  // Family View grouping — pairs each PCS entry with its spouse via
  // member_profiles.spouseVisitorId (the only relationship with a real
  // bidirectional link between two actual PCS people). Children are a
  // freeform name list embedded on a parent's own profile, not separate PCS
  // records, so they surface as name-only tags with no attendance of their
  // own; there's no data at all linking a child back to a parent, so no
  // separate "Parent" grouping is attempted.
  const familyGroups = useMemo(() => {
    const byVisitorId = new Map()
    entries.forEach((e) => { if (e.visitorId) byVisitorId.set(e.visitorId, e) })
    const visited = new Set()
    const groups = []
    entries.forEach((e) => {
      if (visited.has(e.id)) return
      visited.add(e.id)
      const link = e.visitorId ? familyLinks.get(e.visitorId) : null
      const spouseEntry = link?.spouseVisitorId ? byVisitorId.get(link.spouseVisitorId) : null
      const members = [e]
      if (spouseEntry && !visited.has(spouseEntry.id)) {
        members.push(spouseEntry)
        visited.add(spouseEntry.id)
      }
      // Strict relationship filter — Family View shows households, not people.
      // A single unlinked PCS entry (no resolved spouse) has no established
      // family relation to anyone else in the data, so it's dropped here
      // entirely rather than appearing as a "family of one".
      if (members.length < 2) return
      // Husband first — only reorders when one member is explicitly marked
      // Male and the other isn't (Female or not set); leaves order untouched
      // when gender is unknown for both, rather than guessing from names.
      const genderOf = (m) => (m.visitorId ? familyLinks.get(m.visitorId)?.gender : '') || ''
      members.sort((a, b) => {
        const ga = genderOf(a) === 'Male'
        const gb = genderOf(b) === 'Male'
        return ga === gb ? 0 : ga ? -1 : 1
      })
      const childNames = new Set()
      members.forEach((m) => {
        const l = m.visitorId ? familyLinks.get(m.visitorId) : null
        l?.children.forEach((c) => { if (c?.name) childNames.add(String(c.name).trim()) })
      })
      // member_profiles.children is a manually-entered snapshot that only updates
      // when someone re-saves that PCS person's profile sheet, so it commonly lags
      // behind River Kids' own children register — the live source of truth. Match
      // River Kids kids onto this family by parent name (mirrors DepartmentHub's
      // own "autoKids" matching for the same reason) and merge them in too.
      const memberNames = new Set(members.map((m) => String(m.name || '').trim().toLowerCase()).filter(Boolean))
      riverKidsChildren.forEach((k) => {
        const father = String(k.fatherName || '').trim().toLowerCase()
        const mother = String(k.motherName || '').trim().toLowerCase()
        if ((father && memberNames.has(father)) || (mother && memberNames.has(mother))) {
          if (k.name) childNames.add(String(k.name).trim())
        }
      })
      groups.push({ id: members.map((m) => m.id).sort().join('-'), members, children: [...childNames] })
    })
    return groups
  }, [entries, familyLinks, riverKidsChildren])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.phone || '').toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q)
    )
  }, [entries, search])

  const filteredFamilies = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return familyGroups
    return familyGroups.filter((g) =>
      g.members.some((m) =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.phone || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q)
      ) || g.children.some((c) => c.toLowerCase().includes(q))
    )
  }, [familyGroups, search])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-800">PCS — People</h2>
        <span className="text-xs font-semibold text-slate-400">
          {viewMode === 'family' ? `${filteredFamilies.length} families` : `${entries.length} people`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
        </div>
        <div className="flex-shrink-0 flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('individual')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
              viewMode === 'individual' ? 'bg-rose-500 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <User size={13} /> Individual
          </button>
          <button
            type="button"
            onClick={() => setViewMode('family')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
              viewMode === 'family' ? 'bg-rose-500 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Users size={13} /> Family
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
      ) : viewMode === 'family' ? (
        filteredFamilies.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No families found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredFamilies.map((g) => (
              <FamilyCard
                key={g.id}
                group={g}
                attendanceLoading={attendanceLoading}
                getAttendance={getAttendance}
                getCombinedAttendance={getCombinedAttendance}
                onSelectMember={setSelected}
              />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No one found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e)}
              className="text-left rounded-lg border border-slate-200 bg-white p-3 hover:border-rose-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {(e.name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{e.name || 'Unnamed'}</p>
                  <p className="text-xs text-slate-400 truncate">{e.phone || e.email || '—'}</p>
                </div>
              </div>

              {attendanceLoading ? (
                <p className="text-[10px] text-slate-300 mt-2">Loading attendance…</p>
              ) : (() => {
                const att = getAttendance(e)
                return (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <AttendanceBadge label="Sun" stat={att.sunday} compact />
                    <AttendanceBadge label="Cell" stat={att.cell} compact />
                  </div>
                )
              })()}

              {e.leadershipPosition && (
                <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                  {e.leadershipPosition}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-b from-rose-600 to-orange-500 px-5 pt-5 pb-4 flex flex-col items-center text-center relative">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute top-3 right-3 text-white/80 hover:text-white"
              >
                <X size={18} />
              </button>
              <div className="w-16 h-16 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center text-2xl font-black text-white mb-2">
                {(selected.name || '?')[0].toUpperCase()}
              </div>
              <p className="text-white font-black text-lg leading-tight">{selected.name || '—'}</p>
              {selected.leadershipPosition && (
                <span className="mt-2 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30">
                  {selected.leadershipPosition}
                </span>
              )}
            </div>
            <div className="px-4 pt-4">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Attendance · Last {ATTENDANCE_WEEKS} Weeks</p>
              {attendanceLoading ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : (() => {
                const att = getAttendance(selected)
                return (
                  <div className="flex flex-wrap gap-2">
                    <AttendanceBadge label="Sunday Attendance" stat={att.sunday} />
                    <AttendanceBadge label="Cell Attendance" stat={att.cell} />
                  </div>
                )
              })()}
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Phone" value={selected.phone} />
              <Field label="Email" value={selected.email} />
              <Field label="Date of Birth" value={selected.dob ? formatDisplayDate(selected.dob) : null} />
              <Field label="Nativity" value={selected.nativity} />
              <Field label="Current Place" value={selected.currentPlace} />
              <Field label="How Known" value={selected.howKnown} />
              <Field label="Service Attended" value={selected.serviceAttended} />
              <Field label="First Visit" value={selected.attendedDate ? formatDisplayDate(selected.attendedDate) : null} />
              <Field label="PCS Year" value={selected.year ? String(selected.year) : null} />
              <Field label="Membership Number" value={selected.membershipNumber} />
            </div>
            {(selected.phone || selected.email) && (
              <div className="px-4 pb-4 flex gap-2">
                {selected.phone && (
                  <a href={`tel:${selected.phone}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100">
                    <Phone size={13} /> Call
                  </a>
                )}
                {selected.email && (
                  <a href={`mailto:${selected.email}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-50 text-slate-700 text-xs font-bold hover:bg-slate-100">
                    <Mail size={13} /> Email
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FirstLadyHub() {
  const { canAccessDepartment, isFounder } = useAuth()
  const canAccess = canAccessDepartment('first-lady') || isFounder

  if (!canAccess) {
    return (
      <div className="p-8 text-slate-600">
        You don&apos;t have access to the First Lady hub.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">First Lady</h1>
        <p className="text-slate-500 mt-1">Welcome to your hub.</p>
      </div>

      <PCSViewOnly />
    </div>
  )
}

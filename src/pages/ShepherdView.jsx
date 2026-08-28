import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getCellGroups,
  getCellGroupMembers,
  getActiveBackToBibleForDate,
  setCellBackToBibleShepherdFields,
  transferCellMember,
  getRecentCellReportsForHeatmap,
  getRecentSundayAttendanceForCell,
  addCellGroupMember,
  updateCellGroupMember,
  deactivateCellGroupMember,
  getMidweekPrayerPoints,
  saveMidweekPrayerPoints,
  addCellMemberPendingChange,
  getCellMemberPendingChanges,
  getPCSLookup,
  getMemberProfile,
  getMemberProfileWithContext,
  getDelightVisitorById,
  upsertMemberProfile,
  subscribePCSFillInvitationsByCellId,
  completePCSFillInvitation,
  subscribeCellReportRemindersByCellId,
  dismissCellReportReminder,
  createPCSAddNotification,
  getRecentSundayAttendanceNamesByCell,
  getDelightVisitors,
  createCellLeaderDirectorNote,
  subscribeCellLeaderDirectorNotes,
  markCellLeaderDirectorNoteRead,
} from '../services/firestore'
import { isCellDirectorInPositions, isCellLeaderInPositions } from '../utils/cellReportPermissions'
import { calcTenureLabel, memberCategoryLabel } from '../utils/cellMemberCategory'
import MemberFormFields from '../components/cell/MemberFormFields'
import { EMPTY_MEMBER_FORM, memberToForm, calcAttendanceDuration } from '../utils/cellMemberForm'
import { ROLES } from '../constants/roles'
import { useViewAs } from '../context/ViewAsContext'
import { format } from 'date-fns'

function fmt(d) {
  if (!d) return null
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return String(d) }
}

function miniDur(from, to) {
  if (!from) return ''
  const s = new Date(from), e = to ? new Date(to) : new Date()
  const tot = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  const y = Math.floor(tot / 12), m = tot % 12
  return [y > 0 ? `${y}y` : '', m > 0 ? `${m}m` : ''].filter(Boolean).join(' ') || '<1m'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTE_QUICK_TAGS = ['Transfer Member', 'Needs Follow-up', 'Inactivity Note']

const SHEPHERD_FIELDS = [
  { key: 'worship_song',  label: '🎵 Worship Song',   placeholder: 'e.g. Great Are You Lord — C major' },
  { key: 'ice_breaker',   label: '🧊 Ice Breaker',    placeholder: 'A fun question or activity to open the cell...' },
  { key: 'bible_content', label: '📖 Bible Content',  placeholder: 'Passage, theme, key verses...' },
  { key: 'bible_quiz',    label: '❓ Bible Quiz',      placeholder: 'Questions to discuss or quiz the group...' },
  { key: 'prayer_points', label: '🙏 Prayer Points',  placeholder: 'Specific prayer needs for this week...' },
]

// Status Glow — based on last 2 cell reports
// originalName fallback handles old reports that stored the pre-enrichment short name
function getGlow(memberName, heatmapReports, originalName = null) {
  if (!heatmapReports || heatmapReports.length === 0) return 'grey'
  const norm = String(memberName || '').trim().toLowerCase()
  const origNorm = originalName && originalName !== memberName ? String(originalName).trim().toLowerCase() : null
  const check = (set) => set?.has(norm) || (origNorm && set?.has(origNorm))
  const inLatest   = check(heatmapReports[0]?.attendeeNames)
  const inPrevious = check(heatmapReports[1]?.attendeeNames)
  if (inLatest) return 'green'
  if (inPrevious) return 'amber'
  return 'red'
}

const GLOW_RING = {
  green: 'ring-4 ring-green-400 shadow-green-100 shadow-md',
  amber: 'ring-4 ring-amber-400 shadow-amber-100 shadow-md',
  red:   'ring-4 ring-red-400  shadow-red-100  shadow-md',
  grey:  'ring-2 ring-slate-200',
}
const GLOW_DOT = {
  green: 'bg-green-400',
  amber: 'bg-amber-400',
  red:   'bg-red-400',
  grey:  'bg-slate-300',
}
const GLOW_LABEL = {
  green: 'Healthy',
  amber: 'Needs Attention',
  red:   'Urgent',
  grey:  'New Member',
}
const GLOW_TEXT = {
  green: 'text-green-600',
  amber: 'text-amber-500',
  red:   'text-red-500',
  grey:  'text-slate-400',
}

// Normalise name for comparison — lowercase, collapse whitespace
function normName(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Normalise phone to 10 digits
function normalisePhone(raw) {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1)
  return digits
}

// Format birthday/anniversary as "Mar 15"
function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const parts = String(dateStr).split('-')
  if (parts.length < 3) return dateStr
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = parseInt(parts[1], 10) - 1
  const d = parseInt(parts[2], 10)
  if (isNaN(m) || isNaN(d)) return dateStr
  return `${MONTHS[m]} ${d}`
}

// True if the annual occurrence falls within the next 7 days
function isUpcomingSoon(dateStr, days = 7) {
  if (!dateStr) return false
  const today = new Date()
  const parts = String(dateStr).split('-')
  if (parts.length < 3) return false
  const m = parseInt(parts[1], 10) - 1
  const d = parseInt(parts[2], 10)
  let upcoming = new Date(today.getFullYear(), m, d)
  if (upcoming < today) upcoming.setFullYear(today.getFullYear() + 1)
  const diffDays = (upcoming - today) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= days
}

// Collapsible list of Former / Not-Attending members, shared by the cell leader
// and director views. `members` must already be filtered to the right category.
function InactiveCategoryList({ title, members, expanded, onToggle, showTenure, onReactivate, reactivatingId }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
      >
        <span className="font-semibold text-slate-800 text-sm">{title} <span className="text-slate-400 font-normal">({members.length})</span></span>
        <span className="text-slate-400 text-xs">{expanded ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {expanded && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {members.length === 0 && (
            <p className="px-5 py-4 text-sm text-slate-400">None.</p>
          )}
          {members.map((m) => {
            const tenure = showTenure ? calcTenureLabel(m.since, m.leftDate) : null
            return (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate">{m.name || '—'}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {m.locality && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">📍 {m.locality}</span>}
                    {tenure && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">Member for {tenure}</span>}
                  </div>
                </div>
                {onReactivate && (
                  <button
                    type="button"
                    disabled={reactivatingId === m.id}
                    onClick={() => onReactivate(m)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition disabled:opacity-50"
                  >
                    {reactivatingId === m.id ? 'Reactivating…' : 'Reactivate'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function ShepherdView({ embedded = false, pendingFillInvitations = [], onOpenFillInvite }) {
  const { userProfile } = useAuth()

  const isDirector = useMemo(() => isCellDirectorInPositions(userProfile), [userProfile])
  const isLeader   = useMemo(() => isCellLeaderInPositions(userProfile),   [userProfile])
  const isFounder  = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER

  // Founder View Switcher — use simulated capabilities when active
  const { viewAsRole, capabilities } = useViewAs()
  const isSimulating = isFounder && viewAsRole !== 'founder'
  const effectiveIsDirector = isSimulating
    ? (viewAsRole === 'director')
    : (isDirector || isFounder)
  const effectiveCanSeeAllCells = isSimulating
    ? capabilities.canSeeAllCells
    : (isDirector || isFounder)

  return (
    <div className={embedded ? undefined : 'min-h-screen bg-slate-50'}>
      <div className={`max-w-5xl mx-auto space-y-5 ${embedded ? 'py-4' : 'px-4 py-6'}`}>
        {/* Page Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Shepherd's Hub</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Shepherd your members · Manage your fellowship
          </p>
        </div>

        {/* ViewAs indicator */}
        {isFounder && viewAsRole !== 'founder' && (
          <div className="px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
            👁 Simulating <strong>{viewAsRole}</strong> view — {capabilities.label}
          </div>
        )}

        <ShepherdCareTab
          userProfile={userProfile}
          isDirector={effectiveIsDirector}
          isLeader={isLeader}
          canSeeAllCells={effectiveCanSeeAllCells}
          canTransfer={capabilities.canTransferMembers}
          pendingFillInvitations={pendingFillInvitations}
          onOpenFillInvite={onOpenFillInvite}
        />
        <MinistryContentTab isDirector={effectiveIsDirector} />
      </div>
    </div>
  )
}

// ─── Tab 1: Ministry Content ──────────────────────────────────────────────────

function MinistryContentTab({ isDirector }) {
  const todayISO = format(new Date(), 'yyyy-MM-dd')
  const [b2b, setB2b]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm]   = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]  = useState(false)

  useEffect(() => {
    setLoading(true)
    getActiveBackToBibleForDate(todayISO)
      .then((item) => {
        setB2b(item)
        if (item) {
          setForm({
            worship_song:  item.worship_song  || '',
            ice_breaker:   item.ice_breaker   || '',
            bible_content: item.bible_content || '',
            bible_quiz:    item.bible_quiz    || '',
            prayer_points: item.prayer_points || '',
          })
        }
      })
      .finally(() => setLoading(false))
  }, [todayISO])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!b2b?.id) return
    setSaving(true)
    try {
      await setCellBackToBibleShepherdFields(b2b.id, form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-12 text-center text-slate-500">Loading ministry content…</div>

  if (!b2b) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-5 text-center text-slate-500 shadow-sm">
        <p className="text-4xl mb-3">📭</p>
        <p className="font-medium">No active Back to Bible content for this week.</p>
        {isDirector && <p className="text-sm mt-1">Create one in the Cell Report → Back to Bible tab.</p>}
      </div>
    )
  }

  const dateRange = `${b2b.fromDate || ''} → ${b2b.toDate || ''}`

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">{b2b.title || "This Week's Content"}</h2>
            <p className="text-slate-500 text-sm">{dateRange}</p>
            {b2b.passage && <p className="text-indigo-700 text-sm font-medium mt-1">📖 {b2b.passage}</p>}
          </div>
          {saved && (
            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">✓ Saved</span>
          )}
        </div>
      </div>

      {isDirector ? (
        <form onSubmit={handleSave} className="space-y-4">
          {SHEPHERD_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
              <textarea
                value={form[key] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          ))}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-2xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Content'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {SHEPHERD_FIELDS.map(({ key, label }) => (
            <div key={key} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-600 mb-1">{label}</p>
              <p className="text-slate-800 whitespace-pre-wrap text-sm leading-relaxed">
                {b2b[key] || <span className="text-slate-400 italic">Not filled in yet.</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Shepherd's Hub Dashboard ────────────────────────────────────────────────

function ShepherdHubDashboard({ cellName, leaderName, activeMembers, statusCounts, heatmap, sundayNamesHistory, pendingFillInvCount, pcsLoading, onFillClick }) {
  const lastReport       = heatmap?.[0]
  const lastCellDate     = lastReport?.reportDate
  const lastCellPresent  = lastReport?.attendeeNames?.size || 0
  const lastSundayRecord = sundayNamesHistory?.[0]
  const lastSundayPresent = lastSundayRecord
    ? activeMembers.filter(m => {
        const n = String(m.name || '').trim().toLowerCase()
        const orig = m.originalName ? String(m.originalName).trim().toLowerCase() : null
        return lastSundayRecord.presentNames.includes(n) || (orig && lastSundayRecord.presentNames.includes(orig))
      }).length
    : null
  const total = activeMembers.length

  const upcoming = activeMembers.flatMap(m => [
    m.birthday    ? { name: m.name, date: m.birthday,    type: 'birthday'    } : null,
    m.anniversary ? { name: m.name, date: m.anniversary, type: 'anniversary' } : null,
  ]).filter(Boolean).filter(ev => isUpcomingSoon(ev.date, 7))

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-5 shadow-lg text-white">
      {/* decorative rings */}
      <div className="pointer-events-none absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/5" />

      {/* header */}
      <div className="relative mb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Shepherd's Hub</p>
        <h2 className="text-2xl font-black leading-tight mt-0.5">{cellName || 'My Cell'}</h2>
        {leaderName && <p className="text-indigo-200 text-sm mt-0.5">Welcome back, {leaderName}</p>}
      </div>

      {/* stat chips */}
      <div className="relative grid grid-cols-5 gap-1.5 mb-4">
        {[
          { label: 'Total',   count: total,                              bg: 'bg-white/15' },
          { label: 'Healthy', count: statusCounts.green,                 bg: 'bg-green-500/30' },
          { label: 'Attn',    count: statusCounts.amber,                 bg: 'bg-amber-400/30' },
          { label: 'Urgent',  count: statusCounts.red,                   bg: 'bg-red-500/30' },
          { label: 'No PCS',  count: pcsLoading ? '…' : statusCounts.notPcs, bg: 'bg-orange-400/30' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-2 text-center`}>
            <p className="text-lg font-black leading-none">{s.count}</p>
            <p className="text-[9px] font-bold mt-1 leading-none text-indigo-100">{s.label}</p>
          </div>
        ))}
      </div>

      {/* activity row */}
      {(lastCellDate || lastSundayRecord) && (
        <div className="relative flex gap-2 mb-3">
          {lastCellDate && (
            <div className="flex-1 bg-white/10 rounded-2xl px-3 py-2.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-indigo-200">Last Cell</p>
              <p className="text-sm font-black mt-0.5">
                {lastCellPresent}/{total} <span className="text-xs font-medium text-indigo-200">present</span>
              </p>
              <p className="text-[9px] text-indigo-300 mt-0.5">{fmt(lastCellDate)}</p>
            </div>
          )}
          {lastSundayRecord && (
            <div className="flex-1 bg-white/10 rounded-2xl px-3 py-2.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-indigo-200">Last Sunday</p>
              <p className="text-sm font-black mt-0.5">
                {lastSundayPresent}/{total} <span className="text-xs font-medium text-indigo-200">present</span>
              </p>
              <p className="text-[9px] text-indigo-300 mt-0.5">{fmt(lastSundayRecord.date)}</p>
            </div>
          )}
        </div>
      )}

      {/* upcoming celebrations */}
      {upcoming.length > 0 && (
        <div className="relative bg-white/10 rounded-2xl px-3 py-2.5 mb-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-indigo-200 mb-2">This Week</p>
          <div className="space-y-2">
            {upcoming.map((ev, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-base leading-none">{ev.type === 'birthday' ? '🎂' : '💍'}</span>
                <div>
                  <p className="text-sm font-bold leading-none">{ev.name}</p>
                  <p className="text-[10px] text-indigo-200 mt-0.5">
                    {ev.type === 'birthday' ? 'Birthday' : 'Anniversary'} · {formatShortDate(ev.date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* pending fill invitation alert */}
      {pendingFillInvCount > 0 && (
        <button
          type="button"
          onClick={onFillClick || undefined}
          disabled={!onFillClick}
          className={`relative w-full flex items-center gap-2.5 bg-yellow-400/20 border border-yellow-300/40 rounded-2xl px-3 py-2.5 text-left transition-colors ${onFillClick ? 'hover:bg-yellow-400/30 cursor-pointer' : 'cursor-default'}`}
        >
          <span className="text-xl leading-none flex-shrink-0">📋</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-none">
              {pendingFillInvCount} profile fill request{pendingFillInvCount > 1 ? 's' : ''} pending
            </p>
            <p className="text-[10px] text-yellow-200 mt-0.5">From Caring Director · tap to fill now</p>
          </div>
          {onFillClick && <span className="text-yellow-100 text-xs font-semibold flex-shrink-0">Fill →</span>}
        </button>
      )}
    </div>
  )
}

// ─── Tab 2: Shepherd Care ─────────────────────────────────────────────────────

function ShepherdCareTab({ userProfile, isDirector, isLeader, canSeeAllCells = true, canTransfer: canTransferProp = true, pendingFillInvitations = [], onOpenFillInvite }) {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [cellGroups, setCellGroups]         = useState([])
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [members, setMembers]               = useState([])
  const [heatmap, setHeatmap]               = useState([])
  const [sundayHistory, setSundayHistory]   = useState([])
  const sundayAtt = sundayHistory[0] || { presentIds: [], date: null }
  const [loadingGroups, setLoadingGroups]   = useState(true)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [search, setSearch]                 = useState('')
  const [transferState, setTransferState]   = useState(null)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferring, setTransferring]     = useState(false)
  const [toast, setToast]                   = useState(null)
  const [glowFilter, setGlowFilter]         = useState('all')
  const [showFormer, setShowFormer]         = useState(false)
  const [showNotAttending, setShowNotAttending] = useState(false)

  // Prayer state
  const [prayerMember, setPrayerMember]   = useState(null) // member object
  const [prayerSubject, setPrayerSubject] = useState('')
  const [savingPrayer, setSavingPrayer]   = useState(false)

  // Message Cell Director state (Cell Leader → Cell Director note about a member)
  const [noteTarget, setNoteTarget]   = useState(null) // member object
  const [noteTags, setNoteTags]       = useState([])
  const [noteMessage, setNoteMessage] = useState('')
  const [sendingNote, setSendingNote] = useState(false)

  // Director inbox — unread leader notes
  const [leaderNotes, setLeaderNotes]                 = useState([])
  const [markingNoteReadId, setMarkingNoteReadId]     = useState(null)

  // Member detail sheet
  const [detailMember, setDetailMember]           = useState(null)
  const [detailProfile, setDetailProfile]         = useState(null)
  const [detailVisitor, setDetailVisitor]         = useState(null)
  const [detailAttendance, setDetailAttendance]   = useState([])
  const [detailSundayHistory, setDetailSundayHistory] = useState([])
  const [detailMinistries, setDetailMinistries]   = useState([])
  const [detailLoading, setDetailLoading]         = useState(false)

  // PCS lookup — names + visitorIds of people already in PCS
  const [pcsNames, setPcsNames]     = useState(new Set())
  const [pcsLoading, setPcsLoading] = useState(true)
  const [notifyingPCS, setNotifyingPCS] = useState(new Set())
  const [notifiedPCS, setNotifiedPCS]   = useState(new Set())

  // Hub dashboard data
  const [sundayNamesHistory, setSundayNamesHistory] = useState([])
  const pendingFillInvCount = pendingFillInvitations.length

  // Mark Inactive (cell leaders only)
  const [inactiveTarget, setInactiveTarget]   = useState(null)
  const [markingInactive, setMarkingInactive] = useState(false)

  // People's directory map for canonical name enrichment
  const [visitorMap, setVisitorMap] = useState(new Map())
  useEffect(() => {
    getDelightVisitors().then(vs => setVisitorMap(new Map(vs.map(v => [v.id, v.name])))).catch(() => {})
  }, [])

  // Load cell groups
  useEffect(() => {
    getCellGroups('Cell').then(setCellGroups).finally(() => setLoadingGroups(false))
  }, [])

  // Auto-select leader's linked cell
  useEffect(() => {
    if (!cellGroups.length || !userProfile) return
    if (canSeeAllCells && isDirector) return
    // 1. Match by cellGroupId/cellId against group's doc ID or cellId field
    const fromProfile = String(userProfile.cellGroupId || userProfile.cellId || '').trim()
    if (fromProfile) {
      const hit = cellGroups.find((g) => g.id === fromProfile || g.cellId === fromProfile)
      if (hit) { setSelectedCellId(hit.id); return }
    }
    // 2. Match by cell group name stored in profile
    const cellGroupName = String(userProfile.cellGroup || '').trim()
    if (cellGroupName) {
      const nameMatch = cellGroups.find(
        (g) => String(g.cellName || '').toLowerCase() === cellGroupName.toLowerCase()
      )
      if (nameMatch) { setSelectedCellId(nameMatch.id); return }
    }
    // 3. Fallback: match by the leader name field on the cell group document
    const userName = String(userProfile.displayName || userProfile.name || '').trim()
    if (userName) {
      const leaderMatch = cellGroups.find(
        (g) => String(g.leader || '').trim().toLowerCase() === userName.toLowerCase()
      )
      if (leaderMatch) setSelectedCellId(leaderMatch.id)
    }
  }, [cellGroups, userProfile, isDirector, canSeeAllCells])

  // Load members + heatmap + Sunday attendance when cell changes
  useEffect(() => {
    if (!selectedCellId) return
    let cancelled = false
    setLoadingMembers(true)
    setMembers([])
    setHeatmap([])
    setSundayHistory([])
    setSundayNamesHistory([])
    setNotifiedPCS(new Set())
    const _cg = cellGroups.find((g) => g.id === selectedCellId)
    const altCellId = _cg?.cellId !== selectedCellId ? _cg?.cellId : null
    // Each call is caught independently — e.g. a cell leader whose profile isn't
    // explicitly linked (resolved to this cell only via the name/leader-match
    // fallback below) can be denied read access to cell_reports/sunday attendance
    // by security rules while still being allowed to read the members subcollection.
    // A single Promise.all() would let that one denial wipe out an otherwise-valid
    // member list, showing "no members" even though the roster loaded fine.
    Promise.all([
      getCellGroupMembers(selectedCellId).catch(() => []),
      getRecentCellReportsForHeatmap(selectedCellId, 2, altCellId).catch(() => []),
      getRecentSundayAttendanceForCell(selectedCellId, 5).catch(() => []),
      getRecentSundayAttendanceNamesByCell(selectedCellId, 1).catch(() => []),
    ])
      .then(([m, h, s, sn]) => {
        if (cancelled) return
        const todayStr = new Date().toISOString().slice(0, 10)
        setMembers(m)
        setHeatmap(h.filter(r => r.reportDate && r.reportDate <= todayStr))
        setSundayHistory(s)
        setSundayNamesHistory(sn)
      })
      .finally(() => { if (!cancelled) setLoadingMembers(false) })
    return () => { cancelled = true }
  }, [selectedCellId, canSeeAllCells])

  // Load PCS entries to determine which members are already in PCS
  useEffect(() => {
    setPcsLoading(true)
    getPCSLookup()
      .then(entries => {
        const keys = new Set()
        entries.forEach(e => {
          if (e.name) keys.add(normName(e.name))
          if (e.visitorId) keys.add(`vid:${e.visitorId}`)
          const ph = normalisePhone(e.phone)
          if (ph && ph.length >= 10) keys.add(`ph:${ph}`)
        })
        setPcsNames(keys)
      })
      .catch(() => setPcsNames(new Set()))
      .finally(() => setPcsLoading(false))
  }, [])

  // Director inbox — subscribe to unread leader notes about members
  useEffect(() => {
    if (!isDirector) return
    const unsub = subscribeCellLeaderDirectorNotes(setLeaderNotes)
    return unsub
  }, [isDirector])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const isInPCS = (member) => {
    if (member.visitorId && pcsNames.has(`vid:${member.visitorId}`)) return true
    if (pcsNames.has(normName(member.name))) return true
    const ph = normalisePhone(member.phone)
    if (ph && ph.length >= 10 && pcsNames.has(`ph:${ph}`)) return true
    return false
  }

  const handleNotifyCaring = async (member) => {
    setNotifyingPCS(prev => new Set([...prev, member.id]))
    try {
      const cellName = cellGroups.find(g => g.id === selectedCellId)?.cellName || ''
      await createPCSAddNotification({
        visitorId:   member.visitorId || '',
        memberName:  member.name,
        memberPhone: member.phone || '',
        cellId:      selectedCellId,
        cellName,
        sentBy:      userProfile?.email || '',
        sentByName:  userProfile?.name  || userProfile?.email || 'Cell Leader',
      })
      setNotifiedPCS(prev => new Set([...prev, member.id]))
      showToast(`Caring Director notified for ${member.name}.`)
    } catch (err) {
      console.error('Notify Caring error:', err)
      showToast('Failed to notify. Please try again.', 'error')
    } finally {
      setNotifyingPCS(prev => { const s = new Set(prev); s.delete(member.id); return s })
    }
  }

  const toggleNoteTag = (tag) => {
    setNoteTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const handleSendNoteToDirector = async () => {
    if (!noteTarget || !selectedCellId) return
    if (noteTags.length === 0 && !noteMessage.trim()) {
      showToast('Add a tag or a message first.', 'error')
      return
    }
    setSendingNote(true)
    try {
      const cellName = cellGroups.find(g => g.id === selectedCellId)?.cellName || ''
      await createCellLeaderDirectorNote({
        cellId:      selectedCellId,
        cellName,
        memberId:    noteTarget.id,
        memberName:  noteTarget.name,
        memberPhone: noteTarget.phone || '',
        tags:        noteTags,
        message:     noteMessage.trim(),
        sentBy:      userProfile?.email || '',
        sentByName:  userProfile?.name  || userProfile?.email || 'Cell Leader',
      })
      showToast('Message sent to Cell Director.')
      setNoteTarget(null)
      setNoteTags([])
      setNoteMessage('')
    } catch (err) {
      console.error('Message Cell Director error:', err)
      showToast('Failed to send message. Please try again.', 'error')
    } finally {
      setSendingNote(false)
    }
  }

  const handleMarkNoteRead = async (id) => {
    setMarkingNoteReadId(id)
    try {
      await markCellLeaderDirectorNoteRead(id)
    } catch { /* subscription will retry on next snapshot */ }
    finally { setMarkingNoteReadId(null) }
  }

  const handleTransfer = async () => {
    if (!transferTarget || !transferState) return
    setTransferring(true)
    try {
      await transferCellMember(selectedCellId, transferState.memberId, transferTarget)
      showToast(`${transferState.memberName} moved successfully.`)
      setTransferState(null)
      setTransferTarget('')
      const updated = await getCellGroupMembers(selectedCellId)
      setMembers(updated)
    } catch (err) {
      showToast(err.message || 'Transfer failed.', 'error')
    } finally {
      setTransferring(false)
    }
  }

  const handleMarkInactiveShepherd = async () => {
    if (!inactiveTarget || !selectedCellId) return
    setMarkingInactive(true)
    try {
      const result = await deactivateCellGroupMember(selectedCellId, inactiveTarget.id, inactiveTarget.name)
      const category = result?.memberCategory || 'not_attending'
      showToast(`${inactiveTarget.name} moved to ${memberCategoryLabel(category)}.`)
      setMembers(prev => prev.map(m => m.id === inactiveTarget.id
        ? { ...m, status: 'inactive', memberCategory: category, leftDate: new Date().toISOString().slice(0, 10) }
        : m))
      setInactiveTarget(null)
      setDetailMember(null)
    } catch { showToast('Failed to mark inactive.', 'error') }
    finally { setMarkingInactive(false) }
  }

  const [reactivatingId, setReactivatingId] = useState(null)
  const handleReactivateShepherd = async (member) => {
    if (!selectedCellId) return
    setReactivatingId(member.id)
    try {
      await updateCellGroupMember(selectedCellId, member.id, { status: 'active' })
      showToast(`${member.name} reactivated.`)
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, status: 'active', memberCategory: '' } : m))
    } catch { showToast('Failed to reactivate.', 'error') }
    finally { setReactivatingId(null) }
  }

  // Transfer only for Directors/Founders (effectiveIsDirector covers both)
  const canTransfer = useCallback(
    () => canTransferProp && isDirector,
    [canTransferProp, isDirector]
  )

  const handleAddPrayer = async () => {
    if (!prayerMember || !prayerSubject.trim() || !selectedCellId) return
    setSavingPrayer(true)
    try {
      const existing = await getMidweekPrayerPoints(selectedCellId, today)
      const newPoint = {
        id: Date.now().toString(),
        name: prayerMember.name || 'Member',
        subject: prayerSubject.trim(),
        addedBy: userProfile?.name || userProfile?.email || 'Unknown',
        addedByUid: userProfile?.id || '',
        isDirector,
        createdAt: new Date().toISOString(),
      }
      await saveMidweekPrayerPoints(
        selectedCellId,
        today,
        [...existing, newPoint],
        userProfile?.name || 'unknown'
      )
      showToast(`Prayer added for ${prayerMember.name}.`)
      setPrayerMember(null)
      setPrayerSubject('')
    } catch {
      showToast('Failed to save prayer point.', 'error')
    } finally {
      setSavingPrayer(false)
    }
  }

  const enrichedMembers = useMemo(() =>
    members.map(m => {
      if (!m.visitorId) return m
      const canonical = visitorMap.get(m.visitorId)
      return canonical && canonical !== m.name ? { ...m, name: canonical, originalName: m.name } : m
    }),
    [members, visitorMap]
  )

  const activeMembers = useMemo(
    () => enrichedMembers.filter((m) => m.status !== 'inactive'),
    [enrichedMembers]
  )

  const formerMembers = useMemo(
    () => enrichedMembers.filter((m) => m.status === 'inactive' && m.memberCategory === 'former'),
    [enrichedMembers]
  )
  const notAttendingMembers = useMemo(
    () => enrichedMembers.filter((m) => m.status === 'inactive' && m.memberCategory !== 'former'),
    [enrichedMembers]
  )
  const canEditMembers = isDirector || isLeader

  const filteredMembers = useMemo(() => {
    return activeMembers.filter((m) => {
      if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
      if (glowFilter === 'not-pcs') return !pcsLoading && !isInPCS(m)
      if (glowFilter === 'all') return true
      const glow = getGlow(m.name, heatmap, m.originalName)
      return glow === glowFilter
    })
  }, [activeMembers, search, heatmap, glowFilter, pcsNames, pcsLoading])

  const otherCells = cellGroups.filter((g) => g.id !== selectedCellId)

  // Count by status for filter bar
  const statusCounts = useMemo(() => {
    const counts = { green: 0, amber: 0, red: 0, grey: 0, notPcs: 0 }
    activeMembers.forEach((m) => {
      counts[getGlow(m.name, heatmap, m.originalName)]++
      if (!isInPCS(m)) counts.notPcs++
    })
    return counts
  }, [activeMembers, heatmap, pcsNames])

  const sundayDate = sundayAtt.date
    ? new Date(sundayAtt.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-white shadow-lg text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Director inbox — notes leaders have sent about members */}
      {isDirector && leaderNotes.length > 0 && (
        <div className="bg-amber-50 rounded-3xl border border-amber-200 p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-amber-800 text-sm">Leader Notes ({leaderNotes.length})</h3>
          <div className="space-y-2">
            {leaderNotes.map((n) => (
              <div key={n.id} className="bg-white rounded-2xl border border-amber-100 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{n.memberName || 'Member'} <span className="text-xs font-normal text-slate-400">· {n.cellName || 'Cell'}</span></p>
                  {n.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {n.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{tag}</span>
                      ))}
                    </div>
                  )}
                  {n.message && <p className="text-xs text-slate-600 mt-1.5">{n.message}</p>}
                  <p className="text-[10px] text-slate-400 mt-1.5">From {n.sentByName || 'Cell Leader'}{n.sentAt ? ` · ${fmt(n.sentAt)}` : ''}</p>
                </div>
                <button
                  type="button"
                  disabled={markingNoteReadId === n.id}
                  onClick={() => handleMarkNoteRead(n.id)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition disabled:opacity-50"
                >
                  {markingNoteReadId === n.id ? '…' : 'Mark Read'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cell selector — Directors / Founder with canSeeAllCells */}
      {isDirector && canSeeAllCells && (
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Select Cell Group</label>
          {loadingGroups ? (
            <span className="text-slate-400 text-sm">Loading…</span>
          ) : (
            <select
              value={selectedCellId || ''}
              onChange={(e) => { setSelectedCellId(e.target.value); setGlowFilter('all'); setSearch('') }}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-sm flex-1"
            >
              <option value="">— choose a cell —</option>
              {cellGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.cellName || g.id}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Shepherd's Hub Dashboard */}
      {selectedCellId && !loadingMembers && activeMembers.length > 0 && (
        <ShepherdHubDashboard
          cellName={cellGroups.find(g => g.id === selectedCellId)?.cellName || ''}
          leaderName={userProfile?.name || userProfile?.displayName || ''}
          activeMembers={activeMembers}
          statusCounts={statusCounts}
          heatmap={heatmap}
          sundayNamesHistory={sundayNamesHistory}
          pendingFillInvCount={pendingFillInvCount}
          pcsLoading={pcsLoading}
          onFillClick={pendingFillInvitations.length > 0 && onOpenFillInvite ? () => onOpenFillInvite(pendingFillInvitations[0]) : null}
        />
      )}

      {/* Status filter + legend bar */}
      {selectedCellId && !loadingMembers && (
        <div className="bg-white rounded-3xl border border-slate-200 p-3 shadow-sm space-y-1.5">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all',      label: 'All',            count: activeMembers.length, dot: 'bg-slate-400',  activeClass: 'bg-slate-900 text-white' },
              { key: 'green',    label: 'Healthy',         count: statusCounts.green,   dot: 'bg-green-400',  activeClass: 'bg-slate-900 text-white' },
              { key: 'amber',    label: 'Needs Attention', count: statusCounts.amber,   dot: 'bg-amber-400',  activeClass: 'bg-slate-900 text-white' },
              { key: 'red',      label: 'Urgent',          count: statusCounts.red,     dot: 'bg-red-400',    activeClass: 'bg-slate-900 text-white' },
              { key: 'not-pcs',  label: 'Not in PCS',      count: statusCounts.notPcs,  dot: 'bg-orange-400', activeClass: 'bg-orange-500 text-white' },
            ].map(({ key, label, count, dot, activeClass }) => (
              <button
                key={key}
                type="button"
                onClick={() => setGlowFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  glowFilter === key ? activeClass : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                {label} <span className="opacity-60">{count}</span>
              </button>
            ))}
          </div>
          {sundayDate && (
            <p className="text-xs text-slate-400 px-1">Sunday pulse: {sundayDate}</p>
          )}
        </div>
      )}

      {/* Search */}
      {selectedCellId && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members…"
          className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      )}

      {/* Empty state */}
      {!selectedCellId && !loadingGroups && (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-6 text-center text-slate-400 shadow-sm">
          {isDirector ? 'Select a cell group above.' : 'No cell group linked to your profile.'}
        </div>
      )}

      {loadingMembers && (
        <div className="py-10 text-center text-slate-500 text-sm">Loading members…</div>
      )}

      {/* Member card grid */}
      {selectedCellId && !loadingMembers && (
        <>
          <p className="text-slate-500 text-sm px-1">
            {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
            {glowFilter !== 'all' && ` · ${GLOW_LABEL[glowFilter]}`}
            {search && ` matching "${search}"`}
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {filteredMembers.map((member) => {
              const glow       = getGlow(member.name, heatmap, member.originalName)
              const phone10    = normalisePhone(member.phone)
              // Primary: doc-ID match from sunday_service_attendance (SundayMinistry.jsx writes this).
              // Fallback: name match from sunday_reports.sundayCellAttendance when the older
              // SundayReport.jsx form was used and never wrote to sunday_service_attendance.
              const memberNameLow = String(member.name || '').trim().toLowerCase()
              const isSunday = sundayHistory.length > 0
                ? sundayAtt.presentIds.includes(member.id)
                : !!(sundayNamesHistory[0]?.presentNames?.includes(memberNameLow))
              const bday       = member.birthday
              const anniv      = member.anniversary
              const bdaySoon   = isUpcomingSoon(bday)
              const bdaySoon30 = isUpcomingSoon(bday, 30)
              const annivSoon  = isUpcomingSoon(anniv)
              const inPCS      = isInPCS(member)
              const notified   = notifiedPCS.has(member.id)
              const notifying  = notifyingPCS.has(member.id)

              const pcsStatus = pcsLoading ? 'checking' : inPCS ? 'in' : 'out'

              const openMemberDetail = () => {
                setDetailMember(member)
                setDetailProfile(null)
                setDetailVisitor(null)
                setDetailAttendance([])
                setDetailSundayHistory([])
                setDetailMinistries([])
                setDetailLoading(true)
                const memberNameLower = String(member.name || '').trim().toLowerCase()
                Promise.all([
                  member.visitorId ? getMemberProfileWithContext(member.visitorId, member.phone, null, member.name).catch(() => null) : Promise.resolve(null),
                  member.visitorId ? getDelightVisitorById(member.visitorId).catch(() => null) : Promise.resolve(null),
                  selectedCellId ? getRecentCellReportsForHeatmap(selectedCellId, 5).catch(() => []) : Promise.resolve([]),
                  selectedCellId ? getRecentSundayAttendanceNamesByCell(selectedCellId, 5).catch(() => []) : Promise.resolve([]),
                ]).then(([ctx, visitor, reports, sundayRecords]) => {
                  setDetailProfile(ctx?.profile || null)
                  setDetailVisitor(visitor)
                  const deptTeams = ctx?.deptTeams || []
                  const worshipTeams = ctx?.worshipTeams || []
                  setDetailMinistries([
                    ...deptTeams.map(t => ({ ministry: t.department, role: t.rolePosition || t.role || '', from: t.since || '' })),
                    ...worshipTeams.map(t => ({ ministry: 'Worship', role: (t.positions || [])[0] || '', from: t.since || '' })),
                  ])
                  const todayStr = new Date().toISOString().slice(0, 10)
                  setDetailAttendance(
                    reports
                      .filter(r => r.reportDate && r.reportDate < todayStr)
                      .map(r => ({
                        date: r.reportDate,
                        present: r.attendeeNames.has(memberNameLower),
                      }))
                  )
                  setDetailSundayHistory(sundayRecords)
                }).finally(() => setDetailLoading(false))
              }

              return (
                <div
                  key={member.id}
                  role="button"
                  tabIndex={0}
                  onClick={openMemberDetail}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMemberDetail() } }}
                  style={pcsStatus === 'out' ? { borderLeft: '4px solid #f97316' } : { borderLeft: '4px solid #e2e8f0' }}
                  className={`bg-white rounded-3xl shadow-sm transition-all overflow-hidden cursor-pointer ${GLOW_RING[glow]}`}
                >
                  <div className="p-3 sm:p-5">
                  {/* ── Header row ── */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${GLOW_DOT[glow]}`} />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate">{member.name}</p>
                        <p className={`text-xs font-medium ${GLOW_TEXT[glow]}`}>{GLOW_LABEL[glow]}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-1">
                      {/* Sunday Pulse */}
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isSunday ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          {isSunday ? 'Sunday ✓' : 'Sunday –'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── PCS status — only show when NOT in PCS ── */}
                  {pcsStatus === 'out' && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 10,
                        padding: '5px 10px',
                        borderRadius: 8,
                        backgroundColor: '#fff7ed',
                        border: '1px solid #fed7aa',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: '#f97316' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c' }}>Not in PCS</span>
                    </div>
                  )}

                  {/* ── Birthday / Anniversary ── */}
                  {(bday || anniv) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {bdaySoon30 && (
                        <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium ${
                          bdaySoon ? 'bg-pink-100 text-pink-700' : 'bg-pink-50 text-pink-600'
                        }`}>
                          🎂 {formatShortDate(bday)}{bdaySoon && <span className="text-pink-500">· Soon!</span>}
                        </span>
                      )}
                      {anniv && (
                        <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium ${
                          annivSoon ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-600'
                        }`}>
                          💍 {formatShortDate(anniv)}{annivSoon && <span className="text-rose-500">· Soon!</span>}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ── Info pills ── */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {member.locality && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        📍 {member.locality}
                      </span>
                    )}
                    {member.role && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                        {member.role}
                      </span>
                    )}
                    {member.since && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-500">
                        Since {member.since}
                      </span>
                    )}
                  </div>

                  {/* ── Contact icons + Prayer ── */}
                  <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
                    {phone10 && (
                      <a href={`tel:+91${phone10}`} className="flex flex-col items-center gap-0.5 group flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16z"/></svg>
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">Call</span>
                      </a>
                    )}
                    {phone10 && (
                      <a href={`https://wa.me/91${phone10}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-0.5 group flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-green-50 text-green-600 flex items-center justify-center group-hover:bg-green-100 transition">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">WhatsApp</span>
                      </a>
                    )}
                    {member.email && (
                      <a href={`mailto:${member.email}`} className="flex flex-col items-center gap-0.5 group flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">Email</span>
                      </a>
                    )}
                    {(phone10 || member.email) && <div className="w-px h-7 bg-slate-200 flex-shrink-0" />}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPrayerMember(member); setPrayerSubject('') }}
                      className="flex flex-col items-center gap-0.5 group flex-shrink-0"
                      title="Add Prayer"
                    >
                      <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center group-hover:bg-violet-100 transition text-sm sm:text-base">🙏</span>
                      <span className="text-[9px] text-slate-400 font-medium">Prayer</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setNoteTarget(member); setNoteTags([]); setNoteMessage('') }}
                      className="flex flex-col items-center gap-0.5 group flex-shrink-0"
                      title="Message Cell Director"
                    >
                      <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-100 transition">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium">Notify</span>
                    </button>
                  </div>

                  {/* ── Action buttons (Transfer / Notify Caring) ── */}
                  {(canTransfer() && otherCells.length > 0 || pcsStatus === 'out') && (
                    <div className="flex gap-2 mt-2">
                      {canTransfer() && otherCells.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setTransferState({ memberId: member.id, memberName: member.name }); setTransferTarget('') }}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition"
                        >
                          Transfer
                        </button>
                      )}
                      {pcsStatus === 'out' && (
                        notified ? (
                          <span className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-orange-50 text-orange-500 text-xs font-semibold">
                            ✓ Caring Notified
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={notifying}
                            onClick={(e) => { e.stopPropagation(); handleNotifyCaring(member) }}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-orange-50 text-orange-600 text-xs font-semibold hover:bg-orange-100 transition disabled:opacity-50"
                          >
                            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                            {notifying ? 'Notifying…' : 'Notify Caring'}
                          </button>
                        )
                      )}
                    </div>
                  )}
                  </div>{/* end p-5 */}
                </div>
              )
            })}
          </div>

          {filteredMembers.length === 0 && !loadingMembers && (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-5 text-center text-slate-400 text-sm">
              No members found{search ? ` matching "${search}"` : ''}{glowFilter !== 'all' ? ` with "${GLOW_LABEL[glowFilter]}" status` : ''}.
            </div>
          )}

          <InactiveCategoryList
            title="Former Members"
            members={formerMembers}
            expanded={showFormer}
            onToggle={() => setShowFormer((v) => !v)}
            showTenure
            onReactivate={canEditMembers ? handleReactivateShepherd : null}
            reactivatingId={reactivatingId}
          />
          <InactiveCategoryList
            title="Inactive Members (Not Attending)"
            members={notAttendingMembers}
            expanded={showNotAttending}
            onToggle={() => setShowNotAttending((v) => !v)}
            onReactivate={canEditMembers ? handleReactivateShepherd : null}
            reactivatingId={reactivatingId}
          />
        </>
      )}

      {/* Prayer Modal */}
      {prayerMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div>
              <h3 className="font-bold text-slate-900">Add Prayer Point</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                For <strong>{prayerMember.name}</strong> · saved to today's active meeting
              </p>
            </div>
            <textarea
              value={prayerSubject}
              onChange={(e) => setPrayerSubject(e.target.value)}
              placeholder="Prayer request or matter…"
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddPrayer}
                disabled={savingPrayer || !prayerSubject.trim()}
                className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingPrayer ? 'Saving…' : '🙏 Save Prayer'}
              </button>
              <button
                type="button"
                onClick={() => setPrayerMember(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Cell Director Modal */}
      {noteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div>
              <h3 className="font-bold text-slate-900">Message Cell Director regarding {noteTarget.name}</h3>
              <p className="text-sm text-slate-500 mt-0.5">Sent as an in-app note — visible in the Director's Shepherd's Hub.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleNoteTag(tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                    noteTags.includes(tag)
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <textarea
              value={noteMessage}
              onChange={(e) => setNoteMessage(e.target.value)}
              placeholder="Optional details…"
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSendNoteToDirector}
                disabled={sendingNote || (noteTags.length === 0 && !noteMessage.trim())}
                className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
              >
                {sendingNote ? 'Sending…' : 'Send to Director'}
              </button>
              <button
                type="button"
                onClick={() => { setNoteTarget(null); setNoteTags([]); setNoteMessage('') }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Inactive Confirmation Modal */}
      {inactiveTarget && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Mark as Inactive?</h3>
                <p className="text-xs text-slate-500 mt-0.5">{inactiveTarget.name}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              This will remove <span className="font-semibold">{inactiveTarget.name}</span> from the active members list and move them to Inactive.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setInactiveTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={handleMarkInactiveShepherd} disabled={markingInactive}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-600">
                {markingInactive ? 'Moving…' : 'Mark Inactive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferState && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-900">Transfer Member</h3>
            <p className="text-sm text-slate-600">
              Move <strong>{transferState.memberName}</strong> to a different cell group.
            </p>
            <select
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            >
              <option value="">— Select target cell —</option>
              {otherCells.map((g) => (
                <option key={g.id} value={g.id}>{g.cellName || g.id}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTransfer}
                disabled={!transferTarget || transferring}
                className="flex-1 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {transferring ? 'Moving…' : 'Confirm Transfer'}
              </button>
              <button
                type="button"
                onClick={() => setTransferState(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Detail Sheet */}
      {detailMember && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setDetailMember(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[88vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0 ${GLOW_DOT[getGlow(detailMember.name, heatmap)].replace('bg-', 'bg-')}`}
                style={{ background: getGlow(detailMember.name, heatmap) === 'green' ? '#4ade80' : getGlow(detailMember.name, heatmap) === 'amber' ? '#fbbf24' : getGlow(detailMember.name, heatmap) === 'red' ? '#f87171' : '#94a3b8' }}
              >
                {detailMember.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-base truncate">{detailMember.name}</p>
                <p className={`text-xs font-medium ${GLOW_TEXT[getGlow(detailMember.name, heatmap)]}`}>{GLOW_LABEL[getGlow(detailMember.name, heatmap)]}</p>
              </div>
              {isLeader && !isDirector && (
                <button
                  type="button"
                  onClick={() => setInactiveTarget(detailMember)}
                  title="Mark Inactive"
                  aria-label="Mark Inactive"
                  className="w-9 h-9 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 flex-shrink-0"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>
                  </svg>
                </button>
              )}
              <button type="button" onClick={() => setDetailMember(null)} className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl flex-shrink-0">×</button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3 bg-slate-50">

              {/* Contact icons */}
              {(() => {
                const ph = normalisePhone(detailMember.phone)
                const email = detailMember.email || detailVisitor?.email
                if (!ph && !email) return null
                return (
                  <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                    <div className="flex gap-5">
                      {ph && (
                        <a href={`tel:+91${ph}`} className="flex flex-col items-center gap-1 group">
                          <span className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16z"/></svg>
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">Call</span>
                        </a>
                      )}
                      {ph && (
                        <a href={`https://wa.me/91${ph}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 group">
                          <span className="w-11 h-11 rounded-full bg-green-50 text-green-600 flex items-center justify-center group-hover:bg-green-100 transition">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">WhatsApp</span>
                        </a>
                      )}
                      {email && (
                        <a href={`mailto:${email}`} className="flex flex-col items-center gap-1 group">
                          <span className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">Email</span>
                        </a>
                      )}
                    </div>
                    {normalisePhone(detailMember.phone) && (
                      <p className="text-[10px] text-slate-400 mt-2">{detailMember.phone}</p>
                    )}
                  </div>
                )
              })()}

              {detailLoading ? (
                <p className="text-xs text-slate-400 text-center py-4">Loading details…</p>
              ) : (
                <>
                  {/* Personal */}
                  {(detailVisitor?.dob || detailMember.birthday || detailMember.anniversary || detailVisitor?.nativity || detailVisitor?.currentPlace || detailMember.locality || detailMember.address || detailMember.occupation || detailVisitor?.howKnown) && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Personal</p>
                      </div>
                      <div className="px-3 py-1 divide-y divide-slate-50">
                        {(detailVisitor?.dob || detailMember.birthday) && (() => {
                          const d = detailVisitor?.dob || detailMember.birthday
                          return (
                            <div className="flex items-start justify-between gap-2 py-1.5">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Date of Birth</span>
                              <span className="text-[11px] font-semibold text-right text-slate-800">
                                {fmt(d)}
                                {isUpcomingSoon(d, 30) && <span className="ml-1 text-pink-500">🎂</span>}
                              </span>
                            </div>
                          )
                        })()}
                        {detailMember.anniversary && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Anniversary</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">
                              {fmt(detailMember.anniversary)}
                              {isUpcomingSoon(detailMember.anniversary, 30) && <span className="ml-1 text-rose-500">💍</span>}
                            </span>
                          </div>
                        )}
                        {detailVisitor?.nativity && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Nativity</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailVisitor.nativity}</span>
                          </div>
                        )}
                        {detailVisitor?.currentPlace && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Current Place</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailVisitor.currentPlace}</span>
                          </div>
                        )}
                        {detailMember.locality && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Locality</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailMember.locality}</span>
                          </div>
                        )}
                        {detailMember.address && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Address</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800 leading-snug">{detailMember.address}</span>
                          </div>
                        )}
                        {detailMember.occupation && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Occupation</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailMember.occupation}</span>
                          </div>
                        )}
                        {detailVisitor?.howKnown && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">How Known</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailVisitor.howKnown}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Church Journey */}
                  {(detailVisitor?.attendedDate || detailVisitor?.serviceAttended || detailMember.role || detailMember.since) && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Church Journey</p>
                      </div>
                      <div className="px-3 py-3 space-y-2">
                        {detailVisitor?.attendedDate && (
                          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg px-3 py-2.5 flex items-center justify-between">
                            <div>
                              <p className="text-[8px] font-bold uppercase tracking-widest text-emerald-100 mb-0.5">Time in Church</p>
                              <p className="text-base font-black text-white leading-tight">{miniDur(detailVisitor.attendedDate)}</p>
                              <p className="text-[9px] text-emerald-100 mt-0.5">since {fmt(detailVisitor.attendedDate)}</p>
                            </div>
                            {detailVisitor.serviceAttended && (
                              <span className="text-[9px] font-bold text-emerald-100 bg-white/20 px-2 py-1 rounded-full border border-white/30">{detailVisitor.serviceAttended}</span>
                            )}
                          </div>
                        )}
                        {!detailVisitor?.attendedDate && detailVisitor?.serviceAttended && (
                          <div className="flex items-start justify-between gap-2 py-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Service</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailVisitor.serviceAttended}</span>
                          </div>
                        )}
                        {(detailMember.role || detailMember.since) && (
                          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              {detailMember.role && <p className="text-[10px] font-bold text-slate-700">{detailMember.role}</p>}
                              {detailMember.since && <p className="text-[9px] text-slate-400">Cell member since {fmt(detailMember.since)}</p>}
                            </div>
                            {detailMember.since && miniDur(detailMember.since) && (
                              <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                                {miniDur(detailMember.since)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Ministry & Leadership */}
                  {detailMinistries.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Ministry & Leadership</p>
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {detailMinistries.map((m, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold text-slate-700">
                                {m.ministry}{m.role ? <span className="font-normal text-slate-400"> · {m.role}</span> : ''}
                              </p>
                              {m.from && <p className="text-[8px] text-slate-400 mt-0.5">since {fmt(m.from)}</p>}
                            </div>
                            {m.from && miniDur(m.from) && (
                              <span className="text-[9px] font-black text-violet-700 bg-violet-100 border border-violet-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">{miniDur(m.from)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spiritual & Membership */}
                  {detailProfile && (detailProfile.baptised || detailProfile.maritalStatus || detailProfile.membershipStatus || detailProfile.permanentAddress || detailProfile.isDirector || detailProfile.leaderSince || detailProfile.ministryHistory?.length > 0) && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Spiritual & Membership</p>
                      </div>
                      <div className="px-3 py-1 divide-y divide-slate-50">
                        {detailProfile.baptised && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Baptised</span>
                            <span className={`text-[11px] font-semibold text-right ${detailProfile.baptised === 'yes' ? 'text-emerald-700' : 'text-slate-800'}`}>
                              {detailProfile.baptised === 'yes' ? 'Yes' : detailProfile.baptised === 'no' ? 'No' : detailProfile.baptised}
                            </span>
                          </div>
                        )}
                        {detailProfile.baptised === 'yes' && detailProfile.baptismDate && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Baptism Date</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{fmt(detailProfile.baptismDate)}</span>
                          </div>
                        )}
                        {detailProfile.baptised === 'yes' && detailProfile.baptismPlace && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Baptism Place</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailProfile.baptismPlace}</span>
                          </div>
                        )}
                        {detailProfile.baptised === 'yes' && detailProfile.baptismChurch && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Baptism Church</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailProfile.baptismChurch}</span>
                          </div>
                        )}
                        {detailProfile.maritalStatus && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Marital Status</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800 capitalize">{detailProfile.maritalStatus}</span>
                          </div>
                        )}
                        {detailProfile.maritalStatus?.toLowerCase() === 'married' && detailProfile.marriageDate && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Marriage Date</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{fmt(detailProfile.marriageDate)}</span>
                          </div>
                        )}
                        {detailProfile.maritalStatus?.toLowerCase() === 'married' && detailProfile.spouseName && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Spouse</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailProfile.spouseName}</span>
                          </div>
                        )}
                        {detailProfile.membershipStatus && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Membership</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800 capitalize">{detailProfile.membershipStatus}</span>
                          </div>
                        )}
                        {detailProfile.permanentAddress && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Perm. Address</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800 leading-snug">{detailProfile.permanentAddress}</span>
                          </div>
                        )}
                        {detailProfile.isDirector && detailProfile.directorOf && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Director</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailProfile.directorOf}{detailProfile.directorSince ? ` · since ${fmt(detailProfile.directorSince)}` : ''}</span>
                          </div>
                        )}
                        {detailProfile.leaderSince && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Leader Since</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{fmt(detailProfile.leaderSince)}{detailProfile.leaderUntil ? ` – ${fmt(detailProfile.leaderUntil)}` : ''}</span>
                          </div>
                        )}
                        {detailProfile.ministryHistory?.length > 0 && (
                          <div className="py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Ministry</span>
                            <div className="space-y-1">
                              {detailProfile.ministryHistory.map((h, i) => (
                                <p key={i} className="text-[11px] font-semibold text-slate-800">• {h}</p>
                              ))}
                              {detailProfile.ministryNotes && <p className="text-[10px] text-slate-400 italic mt-1">{detailProfile.ministryNotes}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Cell Attendance */}
                  {detailAttendance.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Cell Attendance (last {detailAttendance.length})</p>
                      </div>
                      <div className="px-3 py-3 flex items-center gap-2 flex-wrap">
                        {detailAttendance.map((r, i) => {
                          const isLatest = i === 0
                          return (
                            <span
                              key={i}
                              title={r.date ? fmt(r.date) : ''}
                              className={`rounded-full flex-shrink-0 ${r.present ? 'bg-green-400' : 'bg-red-300'} ${isLatest ? 'w-4 h-4' : 'w-2.5 h-2.5'}`}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sunday Attendance */}
                  {detailSundayHistory.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Sunday Attendance (last {detailSundayHistory.length})</p>
                      </div>
                      <div className="px-3 py-3 flex items-center gap-2 flex-wrap">
                        {detailSundayHistory.map((s, i) => {
                          const memberNameLower = String(detailMember.name || '').trim().toLowerCase()
                          const present = s.presentNames.includes(memberNameLower)
                          const isLatest = i === 0
                          return (
                            <span
                              key={i}
                              title={s.date ? fmt(s.date) : ''}
                              className={`rounded-full flex-shrink-0 ${present ? 'bg-emerald-400' : 'bg-red-300'} ${isLatest ? 'w-4 h-4' : 'w-2.5 h-2.5'}`}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Shepherd Notes */}
                  {detailMember.notes && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Shepherd Notes</p>
                      </div>
                      <div className="px-3 py-3">
                        <p className="text-sm text-slate-700 leading-relaxed italic">{detailMember.notes}</p>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: My Fellowship ─────────────────────────────────────────────────────

function MyFellowshipTab({ userProfile, isDirector, isLeader, autoFillInviteId, onAutoFillInviteConsumed }) {
  const [allCellGroups, setAllCellGroups]   = useState([])
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [members, setMembers]               = useState([])
  const [loading, setLoading]               = useState(false)
  const [loadingGroups, setLoadingGroups]   = useState(true)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm]         = useState(EMPTY_MEMBER_FORM)
  const [adding, setAdding]           = useState(false)
  const [addSearch, setAddSearch]               = useState('')
  const [directoryList, setDirectoryList]       = useState([])
  const [directoryLoading, setDirectoryLoading] = useState(false)

  const [editId, setEditId]     = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_MEMBER_FORM)
  const [saving, setSaving]     = useState(false)

  const [pendingDeactivationIds, setPendingDeactivationIds] = useState(new Set())

  const [deactivateTarget, setDeactivateTarget]   = useState(null)
  const [deactivateReason, setDeactivateReason]   = useState('')
  const [submittingDeactivate, setSubmittingDeactivate] = useState(false)

  // PCS lookup — to know which members are NOT yet in PCS
  const [pcsNames, setPcsNames]       = useState(new Set())
  const [pcsLoading, setPcsLoading]   = useState(true)
  const [notifyingPCS, setNotifyingPCS] = useState(new Set())
  const [notifiedPCS, setNotifiedPCS]   = useState(new Set())

  const [toast, setToast] = useState(null)
  const showToastMsg = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const [detailMember, setDetailMember]         = useState(null)
  const [detailProfile, setDetailProfile]       = useState(null)
  const [detailVisitor, setDetailVisitor]       = useState(null)
  const [detailAttendance, setDetailAttendance] = useState([])
  const [detailMinistries, setDetailMinistries] = useState([])
  const [detailLoading, setDetailLoading]       = useState(false)

  // Profile fill invitations sent by Caring Director
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [fillInviteOpen, setFillInviteOpen]         = useState(null)
  const [fillInviteForm, setFillInviteForm]         = useState({})
  const [fillInviteSaving, setFillInviteSaving]     = useState(false)

  // "Remind" notifications sent by a Director when this cell's weekly report is overdue
  const [reportReminders, setReportReminders]         = useState([])
  const [dismissingReminderId, setDismissingReminderId] = useState(null)

  const openDetail = (member) => {
    setDetailMember(member)
    setDetailProfile(null)
    setDetailVisitor(null)
    setDetailAttendance([])
    setDetailMinistries([])
    if (member.visitorId) {
      setDetailLoading(true)
      Promise.all([
        getMemberProfileWithContext(member.visitorId, member.phone, null, member.name).catch(() => null),
        getDelightVisitorById(member.visitorId).catch(() => null),
      ]).then(([ctx, visitor]) => {
        setDetailProfile(ctx?.profile || null)
        setDetailVisitor(visitor)
        const deptTeams = ctx?.deptTeams || []
        const worshipTeams = ctx?.worshipTeams || []
        setDetailMinistries([
          ...deptTeams.map(t => ({ ministry: t.department, role: t.rolePosition || t.role || '', from: t.since || '' })),
          ...worshipTeams.map(t => ({ ministry: 'Worship', role: (t.positions || [])[0] || '', from: t.since || '' })),
        ])
      }).finally(() => setDetailLoading(false))
    }
  }

  useEffect(() => {
    getCellGroups('Cell').then(setAllCellGroups).finally(() => setLoadingGroups(false))
  }, [])

  // PCS lookup — load once on mount
  useEffect(() => {
    setPcsLoading(true)
    getPCSLookup()
      .then(entries => {
        const keys = new Set()
        entries.forEach(e => {
          if (e.name) keys.add(normName(e.name))
          if (e.visitorId) keys.add(`vid:${e.visitorId}`)
          const ph = normalisePhone(e.phone)
          if (ph && ph.length >= 10) keys.add(`ph:${ph}`)
        })
        setPcsNames(keys)
      })
      .catch(() => setPcsNames(new Set()))
      .finally(() => setPcsLoading(false))
  }, [])

  // Load People's Directory eagerly for name enrichment (and re-used by the add form)
  useEffect(() => {
    setDirectoryLoading(true)
    getDelightVisitors()
      .then(setDirectoryList)
      .catch(() => setDirectoryList([]))
      .finally(() => setDirectoryLoading(false))
  }, [])

  // Subscribe to pending fill invitations for this cell leader.
  // Fall back to resolved selectedCellId for leaders matched by name.
  useEffect(() => {
    const cellId = userProfile?.cellGroupId || userProfile?.cellId || selectedCellId
    if (!cellId) return
    const unsub = subscribePCSFillInvitationsByCellId(cellId, setPendingInvitations)
    return unsub
  }, [userProfile?.cellGroupId, userProfile?.cellId, selectedCellId])

  // Subscribe to "Remind" notifications a Director sent for this cell's overdue report.
  useEffect(() => {
    const cellId = userProfile?.cellGroupId || userProfile?.cellId || selectedCellId
    if (!cellId) return
    const unsub = subscribeCellReportRemindersByCellId(cellId, setReportReminders)
    return unsub
  }, [userProfile?.cellGroupId, userProfile?.cellId, selectedCellId])

  // Auto-open fill form when parent passes an invite ID (from sidebar notification click)
  useEffect(() => {
    if (!autoFillInviteId || !pendingInvitations.length || fillInviteOpen) return
    const inv = pendingInvitations.find(i => i.id === autoFillInviteId)
    if (!inv) return
    setFillInviteOpen(inv)
    setFillInviteForm({ phone: '', dob: '', nativity: '', currentPlace: '', baptised: '', baptismDate: '', baptismPlace: '', baptismChurch: '', baptismChurchIsOther: false, maritalStatus: '', marriageDate: '', spouseName: '' })
    onAutoFillInviteConsumed?.()
  }, [autoFillInviteId, pendingInvitations, fillInviteOpen, onAutoFillInviteConsumed])

  useEffect(() => {
    if (!allCellGroups.length || !userProfile) return
    if (isDirector && !isLeader) return
    // 1. Match by cellGroupId/cellId against group's doc ID or cellId field
    const fromProfile = String(userProfile.cellGroupId || userProfile.cellId || '').trim()
    if (fromProfile) {
      const hit = allCellGroups.find((g) => g.id === fromProfile || g.cellId === fromProfile)
      if (hit) { setSelectedCellId(hit.id); return }
    }
    // 2. Match by cell group name stored in profile
    const cellGroupName = String(userProfile.cellGroup || '').trim()
    if (cellGroupName) {
      const nameMatch = allCellGroups.find(
        (g) => String(g.cellName || '').toLowerCase() === cellGroupName.toLowerCase()
      )
      if (nameMatch) { setSelectedCellId(nameMatch.id); return }
    }
    // 3. Fallback: match by the leader name field on the cell group document
    const userName = String(userProfile.displayName || userProfile.name || '').trim()
    if (userName) {
      const leaderMatch = allCellGroups.find(
        (g) => String(g.leader || '').trim().toLowerCase() === userName.toLowerCase()
      )
      if (leaderMatch) setSelectedCellId(leaderMatch.id)
    }
  }, [allCellGroups, userProfile, isDirector, isLeader])

  const refreshMembers = useCallback(async (cellId) => {
    if (!cellId) return
    setLoading(true)
    try { setMembers(await getCellGroupMembers(cellId)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (selectedCellId) refreshMembers(selectedCellId)
  }, [selectedCellId, refreshMembers])

  useEffect(() => {
    if (!selectedCellId) return
    getCellMemberPendingChanges()
      .then((changes) => {
        const ids = new Set(
          changes
            .filter((c) => c.cellId === selectedCellId && c.changeType === 'deactivate' && c.status === 'pending')
            .map((c) => c.memberId)
        )
        setPendingDeactivationIds(ids)
      })
      .catch(() => setPendingDeactivationIds(new Set()))
  }, [selectedCellId])

  const fellowshipVisitorMap = useMemo(() => new Map(directoryList.map(v => [v.id, v.name])), [directoryList])

  const enrichedMembers = useMemo(() =>
    members.map(m => {
      if (!m.visitorId) return m
      const canonical = fellowshipVisitorMap.get(m.visitorId)
      return canonical && canonical !== m.name ? { ...m, name: canonical, originalName: m.name } : m
    }),
    [members, fellowshipVisitorMap]
  )

  const activeMembers   = useMemo(() => enrichedMembers.filter((m) => m.status !== 'inactive'), [enrichedMembers])
  const inactiveMembers = useMemo(() => enrichedMembers.filter((m) => m.status === 'inactive'),  [enrichedMembers])
  const canEdit = isDirector || isLeader

  // Map each pending fill invitation to members by visitorId or normalised name
  const inviteMap = useMemo(() => {
    const m = new Map()
    pendingInvitations.forEach(inv => {
      if (inv.visitorId) m.set(inv.visitorId, inv)
      if (inv.personName) m.set(String(inv.personName).trim().toLowerCase().replace(/\s+/g, ' '), inv)
    })
    return m
  }, [pendingInvitations])

  const getInviteForMember = (member) =>
    inviteMap.get(member.visitorId) ||
    inviteMap.get(String(member.name || '').trim().toLowerCase().replace(/\s+/g, ' '))

  const handleAddMember = async (e) => {
    e.preventDefault()
    if (!selectedCellId) return
    if (!addForm.visitorId) {
      showToastMsg('Select a person from the People\'s Directory first.', 'error')
      return
    }
    setAdding(true)
    try {
      await addCellGroupMember(selectedCellId, { ...addForm, status: 'active' })
      showToastMsg(`${addForm.name} added successfully.`)
      setAddForm(EMPTY_MEMBER_FORM)
      setAddSearch('')
      setShowAddForm(false)
      await refreshMembers(selectedCellId)
    } catch { showToastMsg('Failed to add member.', 'error') }
    finally { setAdding(false) }
  }

  const startEdit = (member) => {
    setEditId(member.id)
    setEditForm(memberToForm(member))
  }

  const handleSaveEdit = async () => {
    if (!editId || !selectedCellId) return
    setSaving(true)
    try {
      await updateCellGroupMember(selectedCellId, editId, editForm)
      showToastMsg('Member updated.')
      setEditId(null)
      await refreshMembers(selectedCellId)
    } catch { showToastMsg('Failed to save changes.', 'error') }
    finally { setSaving(false) }
  }

  const handleDeactivate = async (member) => {
    if (!selectedCellId) return
    if (isDirector) {
      if (!window.confirm(`Deactivate ${member.name}? They will move to the Inactive list.`)) return
      try {
        await updateCellGroupMember(selectedCellId, member.id, { status: 'inactive' })
        showToastMsg(`${member.name} moved to Inactive.`)
        await refreshMembers(selectedCellId)
      } catch { showToastMsg('Failed to deactivate.', 'error') }
    } else {
      setDeactivateTarget(member)
      setDeactivateReason('')
    }
  }

  const handleSubmitDeactivateRequest = async () => {
    if (!deactivateTarget || !selectedCellId) return
    setSubmittingDeactivate(true)
    try {
      await addCellMemberPendingChange({
        changeType: 'deactivate',
        cellId: selectedCellId,
        memberId: deactivateTarget.id,
        memberData: { name: deactivateTarget.name, phone: deactivateTarget.phone || '', locality: deactivateTarget.locality || '' },
        requestedBy: userProfile?.name || userProfile?.email || 'Cell Leader',
        requestedByUid: userProfile?.id || '',
        reason: deactivateReason.trim(),
      })
      setPendingDeactivationIds((prev) => new Set([...prev, deactivateTarget.id]))
      showToastMsg(`Deactivation request submitted for ${deactivateTarget.name}. Awaiting Director approval.`)
      setDeactivateTarget(null)
      setDeactivateReason('')
    } catch { showToastMsg('Failed to submit request.', 'error') }
    finally { setSubmittingDeactivate(false) }
  }

  const handleReactivate = async (member) => {
    if (!selectedCellId) return
    try {
      await updateCellGroupMember(selectedCellId, member.id, { status: 'active' })
      showToastMsg(`${member.name} reactivated.`)
      await refreshMembers(selectedCellId)
    } catch { showToastMsg('Failed to reactivate.', 'error') }
  }

  const isInPCS = (member) => {
    if (member.visitorId && pcsNames.has(`vid:${member.visitorId}`)) return true
    if (pcsNames.has(normName(member.name))) return true
    const ph = normalisePhone(member.phone)
    if (ph && ph.length >= 10 && pcsNames.has(`ph:${ph}`)) return true
    return false
  }

  const handleNotifyCaringFromFellowship = async (member) => {
    setNotifyingPCS(prev => new Set([...prev, member.id]))
    try {
      const cellName = allCellGroups.find(g => g.id === selectedCellId)?.cellName || ''
      await createPCSAddNotification({
        visitorId:   member.visitorId || '',
        memberName:  member.name,
        memberPhone: member.phone || '',
        cellId:      selectedCellId,
        cellName,
        sentBy:      userProfile?.email || '',
        sentByName:  userProfile?.name  || userProfile?.email || 'Cell Leader',
      })
      setNotifiedPCS(prev => new Set([...prev, member.id]))
      showToastMsg(`Caring Director notified for ${member.name}.`)
      setDetailMember(null)
    } catch (err) {
      console.error('Notify Caring error:', err)
      showToastMsg('Failed to notify. Please try again.', 'error')
    } finally {
      setNotifyingPCS(prev => { const s = new Set(prev); s.delete(member.id); return s })
    }
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-white shadow-lg text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>{toast.msg}</div>
      )}

      {/* Reminders from a Director: this cell's weekly report is overdue */}
      {reportReminders.length > 0 && (
        <div className="space-y-2">
          {reportReminders.map((r) => (
            <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
              <span className="text-lg flex-shrink-0">🔔</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">
                  Cell report reminder{r.expectedDate ? ` — due ${r.expectedDate}` : ''}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {r.sentByName ? `From ${r.sentByName}: ` : ''}Your cell's weekly report hasn't been submitted yet. Please file it as soon as possible.
                </p>
              </div>
              <button
                type="button"
                disabled={dismissingReminderId === r.id}
                onClick={async () => {
                  setDismissingReminderId(r.id)
                  try {
                    await dismissCellReportReminder(r.id)
                  } catch { /* ignore */ }
                  setDismissingReminderId(null)
                }}
                className="text-xs font-semibold text-amber-700 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
              >
                {dismissingReminderId === r.id ? '…' : 'Dismiss'}
              </button>
            </div>
          ))}
        </div>
      )}

      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-base">
              Remove from Cell — {deactivateTarget.name}
            </h3>
            <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">This request will be sent to the Cell Director for approval.</p>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Reason for removal <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="e.g. Relocated, backslidden, long absence…"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {deactivateReason.length > 0 && deactivateReason.trim().length < 10 && (
                <p className="text-xs text-red-500">Please enter at least 10 characters.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeactivateTarget(null); setDeactivateReason('') }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitDeactivateRequest}
                disabled={deactivateReason.trim().length < 10 || submittingDeactivate}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-40 hover:bg-amber-600"
              >
                {submittingDeactivate ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDirector && (
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Cell Group</label>
          {loadingGroups ? <span className="text-slate-400 text-sm">Loading…</span> : (
            <select value={selectedCellId || ''} onChange={(e) => setSelectedCellId(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-sm flex-1">
              <option value="">— choose a cell —</option>
              {allCellGroups.map((g) => <option key={g.id} value={g.id}>{g.cellName || g.id}</option>)}
            </select>
          )}
        </div>
      )}

      {!selectedCellId && !loadingGroups && (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-6 text-center text-slate-400 shadow-sm">
          {isDirector ? 'Select a cell group above.' : 'No cell group is linked to your profile.'}
        </div>
      )}

      {selectedCellId && (
        <>
          {/* Add Member Form — directory search enforced */}
          {showAddForm && (
            <div className="bg-white rounded-3xl border border-indigo-200 p-5 shadow-sm space-y-3">
              <div>
                <h3 className="font-bold text-slate-900">Add Member</h3>
                <p className="text-xs text-slate-400 mt-0.5">Select from People&apos;s Directory. New people must first be registered via D Light Visitor Entry.</p>
              </div>

              {/* Directory search picker */}
              {!addForm.visitorId ? (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 overflow-hidden">
                  <div className="px-3 pt-3 pb-2">
                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Select from People&apos;s Directory</p>
                    <div className="relative">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                      </svg>
                      <input
                        type="text"
                        placeholder="Search by name…"
                        value={addSearch}
                        autoComplete="off"
                        onChange={e => setAddSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400"
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto border-t border-indigo-100">
                    {directoryLoading ? (
                      <p className="px-3 py-4 text-xs text-slate-400 text-center">Loading directory…</p>
                    ) : (() => {
                      const q = addSearch.trim().toLowerCase()
                      const matches = directoryList.filter(v => v.name && (!q || v.name.toLowerCase().includes(q)))
                      if (matches.length === 0) return (
                        <div className="px-3 py-3 text-center">
                          <p className="text-xs text-slate-500 font-medium">Not in People&apos;s Directory</p>
                          <p className="text-xs text-slate-400 mt-0.5">New people can only be added via D Light Visitor Entry</p>
                        </div>
                      )
                      return matches.map(v => (
                        <button key={v.id} type="button"
                          onClick={() => {
                            setAddForm(f => ({ ...f, name: v.name, visitorId: v.id, phone: f.phone || v.phone || '', birthday: f.birthday || (v.dob ? String(v.dob).slice(0, 10) : '') }))
                            setAddSearch('')
                          }}
                          className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-indigo-100 border-b border-indigo-50 last:border-0 transition-colors">
                          <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {v.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{v.name}</p>
                            {v.phone && <p className="text-xs text-slate-400">{v.phone}</p>}
                          </div>
                        </button>
                      ))
                    })()}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border-2 border-emerald-200 bg-emerald-50">
                  <span className="w-9 h-9 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                    {addForm.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-emerald-900">{addForm.name}</span>
                  <button type="button"
                    onClick={() => { setAddForm(f => ({ ...f, name: '', visitorId: '' })); setAddSearch('') }}
                    className="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-500 flex items-center justify-center text-base leading-none">×</button>
                </div>
              )}

              {/* Extra fields — only shown after a person is selected */}
              {addForm.visitorId && (
                <form onSubmit={handleAddMember} className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-2.5">
                    <input type="tel" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="Email (optional)"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <input type="text" value={addForm.locality} onChange={e => setAddForm(f => ({ ...f, locality: e.target.value }))} placeholder="Locality / Area"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs text-slate-500 font-semibold mb-1 block">Birthday</label>
                      <input type="date" value={addForm.birthday} onChange={e => setAddForm(f => ({ ...f, birthday: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-semibold mb-1 block">Anniversary</label>
                      <input type="date" value={addForm.anniversary} onChange={e => setAddForm(f => ({ ...f, anniversary: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-semibold mb-1 block">Member Since</label>
                    <input type="date" value={addForm.since} onChange={e => setAddForm(f => ({ ...f, since: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" rows={2}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  <button type="submit" disabled={adding}
                    className="w-full py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                    {adding ? 'Adding…' : '✓ Add to Fellowship'}
                  </button>
                </form>
              )}
            </div>
          )}

          {loading && <div className="py-8 text-center text-slate-500 text-sm">Loading members…</div>}

          {!loading && activeMembers.length === 0 && (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-6 text-center text-slate-400">
              No active members. Tap "+ Add Member" to get started.
            </div>
          )}

          {!loading && (
            <div className="space-y-3">
              {activeMembers.map((member) => (
                <div key={member.id} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
                  {editId === member.id ? (
                    <>
                      <h3 className="font-bold text-slate-900 text-sm">Editing: {member.name}</h3>
                      <MemberFormFields form={editForm} onChange={setEditForm} />
                      <div className="flex gap-2">
                        <button type="button" onClick={handleSaveEdit} disabled={saving}
                          className="flex-1 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                          {saving ? 'Saving…' : '✓ Save'}
                        </button>
                        <button type="button" onClick={() => setEditId(null)}
                          className="px-4 py-2.5 rounded-2xl border border-slate-200 text-slate-700 text-sm">
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <div
                      className="flex items-start justify-between gap-3 cursor-pointer"
                      onClick={() => openDetail(member)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="font-bold text-slate-900">{member.name}</p>
                          {member.role && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{member.role}</span>
                          )}
                          {pendingDeactivationIds.has(member.id) && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">⏳ Pending Deactivation</span>
                          )}
                          {getInviteForMember(member) && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">📋 Profile requested</span>
                          )}
                        </div>
                        {member.since && (
                          <p className="text-xs text-emerald-600 font-semibold mb-1.5">
                            ⏳ Attending for {calcAttendanceDuration(member.since) || '—'}
                            <span className="text-slate-400 font-normal"> · since {formatShortDate(member.since)}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {member.phone && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">📞 {member.phone}</span>}
                          {member.locality && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">📍 {member.locality}</span>}
                          {member.birthday && <span className="text-xs text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full">🎂 {formatShortDate(member.birthday)}</span>}
                          {member.anniversary && <span className="text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">💍 {formatShortDate(member.anniversary)}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {(() => {
                          const inv = getInviteForMember(member)
                          return inv ? (
                            <button
                              type="button"
                              onClick={() => {
                                setFillInviteOpen(inv)
                                setFillInviteForm({ phone: member.phone || '', dob: '', nativity: '', currentPlace: '', baptised: '', baptismDate: '', baptismPlace: '', baptismChurch: '', baptismChurchIsOther: false, maritalStatus: '', marriageDate: '', spouseName: '' })
                              }}
                              className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition"
                            >
                              Fill Profile
                            </button>
                          ) : null
                        })()}
                        {isDirector && (
                          <button type="button" onClick={() => startEdit(member)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition">
                            Edit
                          </button>
                        )}
                        {isDirector && (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(member)}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition bg-red-50 text-red-600 hover:bg-red-100"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && inactiveMembers.length > 0 && (
            <InactiveSection members={inactiveMembers} canEdit={canEdit} onReactivate={handleReactivate} />
          )}
        </>
      )}

      {/* Profile Fill Sheet — shown when Caring Director has sent a fill request */}
      {fillInviteOpen && (() => {
        const ff = fillInviteForm
        const setFf = setFillInviteForm
        const inp = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200'
        const lbl = 'block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1'
        const CODES = [
          { code: '+91',  label: '🇮🇳 +91'  },
          { code: '+971', label: '🇦🇪 +971' },
          { code: '+1',   label: '🇺🇸 +1'   },
          { code: '+44',  label: '🇬🇧 +44'  },
          { code: '+61',  label: '🇦🇺 +61'  },
          { code: '+65',  label: '🇸🇬 +65'  },
          { code: '+60',  label: '🇲🇾 +60'  },
          { code: '+966', label: '🇸🇦 +966' },
          { code: '+974', label: '🇶🇦 +974' },
        ]
        const parsePhone = (val) => {
          const v = (val || '').trim()
          for (const { code } of CODES) {
            if (v.startsWith(code + ' ')) return { code, number: v.slice(code.length + 1) }
            if (v.startsWith(code) && v.length > code.length) return { code, number: v.slice(code.length) }
          }
          return { code: '+91', number: v }
        }
        const { code: cc, number: num } = parsePhone(ff.phone)
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
                <div>
                  <p className="font-bold text-slate-800 text-sm">Fill Profile Details</p>
                  <p className="text-xs text-violet-600 font-medium mt-0.5">{fillInviteOpen.personName}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Requested by Caring Director — fill in what you know</p>
                </div>
                <button type="button" onClick={() => setFillInviteOpen(null)} className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl flex-shrink-0">×</button>
              </div>

              {/* Form */}
              <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">

                <div>
                  <label className={lbl}>Phone</label>
                  <div className="flex gap-1">
                    <select value={cc} onChange={e => setFf(p => ({ ...p, phone: e.target.value + ' ' + num }))}
                      className="px-1.5 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-violet-200 flex-shrink-0">
                      {CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                    <input type="tel" placeholder="Number" value={num}
                      onChange={e => setFf(p => ({ ...p, phone: cc + ' ' + e.target.value }))}
                      className={`${inp} flex-1 min-w-0`} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Date of Birth</label>
                    <input type="date" value={ff.dob} onChange={e => setFf(p => ({...p, dob: e.target.value}))} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Nativity</label>
                    <input type="text" value={ff.nativity} onChange={e => setFf(p => ({...p, nativity: e.target.value}))} placeholder="Hometown" className={inp} />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>Current Place</label>
                    <input type="text" value={ff.currentPlace} onChange={e => setFf(p => ({...p, currentPlace: e.target.value}))} placeholder="Current city" className={inp} />
                  </div>
                </div>

                <div>
                  <label className={lbl}>Baptised?</label>
                  <select value={ff.baptised} onChange={e => setFf(p => ({...p, baptised: e.target.value}))} className={inp}>
                    <option value="">— Select —</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                {ff.baptised === 'yes' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Baptism Date</label>
                      <input type="date" value={ff.baptismDate} onChange={e => setFf(p => ({...p, baptismDate: e.target.value}))} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Baptism Place</label>
                      <input type="text" value={ff.baptismPlace} onChange={e => setFf(p => ({...p, baptismPlace: e.target.value}))} placeholder="City / Location" className={inp} />
                    </div>
                    <div className="col-span-2">
                      <label className={lbl}>Baptism Church</label>
                      <select
                        value={ff.baptismChurchIsOther ? 'other' : ff.baptismChurch}
                        onChange={e => {
                          if (e.target.value === 'other') setFf(p => ({...p, baptismChurch: '', baptismChurchIsOther: true}))
                          else setFf(p => ({...p, baptismChurch: e.target.value, baptismChurchIsOther: false}))
                        }}
                        className={inp}>
                        <option value="">— Select —</option>
                        <option value="River Of Life Christian Church">River Of Life Christian Church</option>
                        <option value="other">Other</option>
                      </select>
                      {ff.baptismChurchIsOther && (
                        <input type="text" placeholder="Specify church name…" value={ff.baptismChurch}
                          onChange={e => setFf(p => ({...p, baptismChurch: e.target.value}))} className={`${inp} mt-2`} />
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className={lbl}>Marital Status</label>
                  <select value={ff.maritalStatus} onChange={e => setFf(p => ({...p, maritalStatus: e.target.value}))} className={inp}>
                    <option value="">— Select —</option>
                    {['Single','Married','Widowed','Divorced'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>

                {ff.maritalStatus === 'Married' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Marriage Date</label>
                      <input type="date" value={ff.marriageDate} onChange={e => setFf(p => ({...p, marriageDate: e.target.value}))} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Spouse Name</label>
                      <input type="text" value={ff.spouseName} onChange={e => setFf(p => ({...p, spouseName: e.target.value}))} placeholder="Spouse name" className={inp} />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex-shrink-0 space-y-2">
                <button
                  type="button"
                  disabled={fillInviteSaving}
                  onClick={async () => {
                    setFillInviteSaving(true)
                    try {
                      if (fillInviteOpen.visitorId) {
                        const profilePayload = {}
                        if (ff.baptised)      profilePayload.baptised      = ff.baptised
                        if (ff.baptismDate)   profilePayload.baptismDate   = ff.baptismDate
                        if (ff.baptismPlace)  profilePayload.baptismPlace  = ff.baptismPlace
                        if (ff.baptismChurch) profilePayload.baptismChurch = ff.baptismChurch
                        if (ff.maritalStatus) profilePayload.maritalStatus = ff.maritalStatus
                        if (ff.marriageDate)  profilePayload.marriageDate  = ff.marriageDate
                        if (ff.spouseName)    profilePayload.spouseName    = ff.spouseName
                        if (ff.dob)           profilePayload.dob           = ff.dob
                        if (ff.nativity)      profilePayload.nativity      = ff.nativity
                        if (ff.currentPlace)  profilePayload.currentPlace  = ff.currentPlace
                        if (ff.phone)         profilePayload.phone         = ff.phone
                        if (Object.keys(profilePayload).length) {
                          await upsertMemberProfile(fillInviteOpen.visitorId, profilePayload, userProfile?.email || '')
                        }
                      }
                      await completePCSFillInvitation(fillInviteOpen.id, userProfile?.email || '', fillInviteOpen.visitorId || '')
                      setPendingInvitations(prev => prev.filter(i => i.id !== fillInviteOpen.id))
                      setFillInviteOpen(null)
                      showToastMsg('Profile details submitted. Thank you!')
                    } catch { showToastMsg('Failed to save profile details.', 'error') }
                    setFillInviteSaving(false)
                  }}
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60 transition-colors"
                >
                  {fillInviteSaving ? 'Submitting…' : 'Submit Profile Details'}
                </button>
                <button type="button" onClick={() => setFillInviteOpen(null)} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Member Detail Sheet */}
      {detailMember && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setDetailMember(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[88vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              {detailProfile?.photoUrl
                ? <img src={detailProfile.photoUrl} alt={detailMember.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                : <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0 bg-indigo-400">{detailMember.name.charAt(0).toUpperCase()}</div>
              }
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-base truncate">{detailMember.name}</p>
                {detailMember.role && <p className="text-xs text-indigo-600 font-medium">{detailMember.role}</p>}
              </div>
              <button type="button" onClick={() => setDetailMember(null)} className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl flex-shrink-0">×</button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3 bg-slate-50">

              {/* Contact icons */}
              {(() => {
                const ph = normalisePhone(detailMember.phone)
                const email = detailMember.email || detailVisitor?.email
                if (!ph && !email) return null
                return (
                  <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                    <div className="flex gap-5">
                      {ph && (
                        <a href={`tel:+91${ph}`} className="flex flex-col items-center gap-1 group">
                          <span className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16z"/></svg>
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">Call</span>
                        </a>
                      )}
                      {ph && (
                        <a href={`https://wa.me/91${ph}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 group">
                          <span className="w-11 h-11 rounded-full bg-green-50 text-green-600 flex items-center justify-center group-hover:bg-green-100 transition">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">WhatsApp</span>
                        </a>
                      )}
                      {email && (
                        <a href={`mailto:${email}`} className="flex flex-col items-center gap-1 group">
                          <span className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">Email</span>
                        </a>
                      )}
                    </div>
                    {normalisePhone(detailMember.phone) && (
                      <p className="text-[10px] text-slate-400 mt-2">{detailMember.phone}</p>
                    )}
                  </div>
                )
              })()}

              {detailLoading ? (
                <p className="text-xs text-slate-400 text-center py-4">Loading details…</p>
              ) : (
                <>
                  {/* Personal */}
                  {(detailVisitor?.dob || detailMember.birthday || detailMember.anniversary || detailVisitor?.nativity || detailVisitor?.currentPlace || detailMember.locality || detailMember.address || detailMember.occupation || detailVisitor?.howKnown) && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Personal</p>
                      </div>
                      <div className="px-3 py-1 divide-y divide-slate-50">
                        {(detailVisitor?.dob || detailMember.birthday) && (() => {
                          const d = detailVisitor?.dob || detailMember.birthday
                          return (
                            <div className="flex items-start justify-between gap-2 py-1.5">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Date of Birth</span>
                              <span className="text-[11px] font-semibold text-right text-slate-800">
                                {fmt(d)}
                                {isUpcomingSoon(d, 30) && <span className="ml-1 text-pink-500">🎂</span>}
                              </span>
                            </div>
                          )
                        })()}
                        {detailMember.anniversary && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Anniversary</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">
                              {fmt(detailMember.anniversary)}
                              {isUpcomingSoon(detailMember.anniversary, 30) && <span className="ml-1 text-rose-500">💍</span>}
                            </span>
                          </div>
                        )}
                        {detailVisitor?.nativity && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Nativity</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailVisitor.nativity}</span>
                          </div>
                        )}
                        {detailVisitor?.currentPlace && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Current Place</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailVisitor.currentPlace}</span>
                          </div>
                        )}
                        {detailMember.locality && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Locality</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailMember.locality}</span>
                          </div>
                        )}
                        {detailMember.address && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Address</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800 leading-snug">{detailMember.address}</span>
                          </div>
                        )}
                        {detailMember.occupation && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Occupation</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailMember.occupation}</span>
                          </div>
                        )}
                        {detailVisitor?.howKnown && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">How Known</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailVisitor.howKnown}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Church Journey */}
                  {(detailVisitor?.attendedDate || detailVisitor?.serviceAttended || detailMember.role || detailMember.since) && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Church Journey</p>
                      </div>
                      <div className="px-3 py-3 space-y-2">
                        {detailVisitor?.attendedDate && (
                          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg px-3 py-2.5 flex items-center justify-between">
                            <div>
                              <p className="text-[8px] font-bold uppercase tracking-widest text-emerald-100 mb-0.5">Time in Church</p>
                              <p className="text-base font-black text-white leading-tight">{miniDur(detailVisitor.attendedDate)}</p>
                              <p className="text-[9px] text-emerald-100 mt-0.5">since {fmt(detailVisitor.attendedDate)}</p>
                            </div>
                            {detailVisitor.serviceAttended && (
                              <span className="text-[9px] font-bold text-emerald-100 bg-white/20 px-2 py-1 rounded-full border border-white/30">{detailVisitor.serviceAttended}</span>
                            )}
                          </div>
                        )}
                        {!detailVisitor?.attendedDate && detailVisitor?.serviceAttended && (
                          <div className="flex items-start justify-between gap-2 py-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Service</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailVisitor.serviceAttended}</span>
                          </div>
                        )}
                        {(detailMember.role || detailMember.since) && (
                          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              {detailMember.role && <p className="text-[10px] font-bold text-slate-700">{detailMember.role}</p>}
                              {detailMember.since && <p className="text-[9px] text-slate-400">Cell member since {fmt(detailMember.since)}</p>}
                            </div>
                            {detailMember.since && miniDur(detailMember.since) && (
                              <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                                {miniDur(detailMember.since)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Ministry & Leadership */}
                  {detailMinistries.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Ministry & Leadership</p>
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {detailMinistries.map((m, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold text-slate-700">
                                {m.ministry}{m.role ? <span className="font-normal text-slate-400"> · {m.role}</span> : ''}
                              </p>
                              {m.from && <p className="text-[8px] text-slate-400 mt-0.5">since {fmt(m.from)}</p>}
                            </div>
                            {m.from && miniDur(m.from) && (
                              <span className="text-[9px] font-black text-violet-700 bg-violet-100 border border-violet-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">{miniDur(m.from)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spiritual & Membership */}
                  {detailProfile && (detailProfile.baptised || detailProfile.maritalStatus || detailProfile.membershipStatus || detailProfile.permanentAddress || detailProfile.ministryHistory?.length > 0 || detailProfile.leaderSince || detailProfile.isDirector) && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Spiritual & Membership</p>
                      </div>
                      <div className="px-3 py-1 divide-y divide-slate-50">
                        {detailProfile.baptised && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Baptised</span>
                            <span className={`text-[11px] font-semibold text-right ${detailProfile.baptised === 'yes' ? 'text-emerald-700' : 'text-slate-800'}`}>
                              {detailProfile.baptised === 'yes' ? 'Yes' : detailProfile.baptised === 'no' ? 'No' : detailProfile.baptised}
                            </span>
                          </div>
                        )}
                        {detailProfile.baptised === 'yes' && detailProfile.baptismDate && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Baptism Date</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{fmt(detailProfile.baptismDate)}</span>
                          </div>
                        )}
                        {detailProfile.baptised === 'yes' && detailProfile.baptismPlace && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Baptism Place</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailProfile.baptismPlace}</span>
                          </div>
                        )}
                        {detailProfile.baptised === 'yes' && detailProfile.baptismChurch && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Baptism Church</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailProfile.baptismChurch}</span>
                          </div>
                        )}
                        {detailProfile.maritalStatus && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Marital Status</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800 capitalize">{detailProfile.maritalStatus}</span>
                          </div>
                        )}
                        {detailProfile.maritalStatus?.toLowerCase() === 'married' && detailProfile.marriageDate && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Marriage Date</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{fmt(detailProfile.marriageDate)}</span>
                          </div>
                        )}
                        {detailProfile.maritalStatus?.toLowerCase() === 'married' && detailProfile.spouseName && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Spouse</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailProfile.spouseName}</span>
                          </div>
                        )}
                        {detailProfile.membershipStatus && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Membership</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800 capitalize">{detailProfile.membershipStatus}</span>
                          </div>
                        )}
                        {detailProfile.permanentAddress && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Perm. Address</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800 leading-snug">{detailProfile.permanentAddress}</span>
                          </div>
                        )}
                        {detailProfile.isDirector && detailProfile.directorOf && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Director</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{detailProfile.directorOf}{detailProfile.directorSince ? ` · since ${fmt(detailProfile.directorSince)}` : ''}</span>
                          </div>
                        )}
                        {detailProfile.leaderSince && (
                          <div className="flex items-start justify-between gap-2 py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">Leader Since</span>
                            <span className="text-[11px] font-semibold text-right text-slate-800">{fmt(detailProfile.leaderSince)}{detailProfile.leaderUntil ? ` – ${fmt(detailProfile.leaderUntil)}` : ''}</span>
                          </div>
                        )}
                        {detailProfile.ministryHistory?.length > 0 && (
                          <div className="py-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Ministry</span>
                            <div className="space-y-1">
                              {detailProfile.ministryHistory.map((h, i) => (
                                <p key={i} className="text-[11px] font-semibold text-slate-800">• {h}</p>
                              ))}
                              {detailProfile.ministryNotes && <p className="text-[10px] text-slate-400 italic mt-1">{detailProfile.ministryNotes}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Shepherd Notes */}
                  {detailMember.notes && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Shepherd Notes</p>
                      </div>
                      <div className="px-3 py-3">
                        <p className="text-sm text-slate-700 leading-relaxed italic">{detailMember.notes}</p>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>

            {/* Footer — Notify Caring (cell leaders only, non-PCS members) */}
            {isLeader && !isDirector && !pcsLoading && !isInPCS(detailMember) && (
              <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
                {notifiedPCS.has(detailMember.id) ? (
                  <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-orange-50 text-orange-500 text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                    Caring Director Notified
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={notifyingPCS.has(detailMember.id)}
                    onClick={() => handleNotifyCaringFromFellowship(detailMember)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-orange-50 text-orange-600 text-sm font-semibold hover:bg-orange-100 transition disabled:opacity-50"
                  >
                    <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                    {notifyingPCS.has(detailMember.id) ? 'Notifying…' : 'Notify Caring Director'}
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inactive Section ─────────────────────────────────────────────────────────

function InactiveSection({ members, canEdit, onReactivate }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-slate-50 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-100 transition-colors">
        <span className="text-sm font-semibold text-slate-600">Inactive Members ({members.length})</span>
        <span className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-2.5">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <div>
                <p className="font-semibold text-slate-600 text-sm">{member.name}</p>
                {member.locality && <p className="text-xs text-slate-400 mt-0.5">📍 {member.locality}</p>}
              </div>
              {canEdit && (
                <button type="button" onClick={() => onReactivate(member)}
                  className="px-3 py-1.5 rounded-xl bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition flex-shrink-0">
                  Reactivate
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

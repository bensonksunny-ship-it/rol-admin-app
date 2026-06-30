import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getCellGroups,
  getCellGroupMembers,
  getActiveBackToBibleForDate,
  setCellBackToBibleShepherdFields,
  transferCellMember,
  getRecentCellReportsForHeatmap,
  getLatestSundayAttendanceForCell,
  addCellGroupMember,
  updateCellGroupMember,
  getMidweekPrayerPoints,
  saveMidweekPrayerPoints,
  addCellMemberPendingChange,
  getCellMemberPendingChanges,
  getPCSLookup,
  getMemberProfile,
  upsertMemberProfile,
  subscribePCSFillInvitationsByCellId,
  completePCSFillInvitation,
  createTask,
  getDelightVisitors,
} from '../services/firestore'
import { isCellDirectorInPositions, isCellLeaderInPositions } from '../utils/cellReportPermissions'
import { ROLES } from '../constants/roles'
import DepartmentTabBar from '../components/DepartmentTabBar'
import { useViewAs } from '../context/ViewAsContext'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'

// ─── Constants ────────────────────────────────────────────────────────────────

const SHEPHERD_FIELDS = [
  { key: 'worship_song',  label: '🎵 Worship Song',   placeholder: 'e.g. Great Are You Lord — C major' },
  { key: 'ice_breaker',   label: '🧊 Ice Breaker',    placeholder: 'A fun question or activity to open the cell...' },
  { key: 'bible_content', label: '📖 Bible Content',  placeholder: 'Passage, theme, key verses...' },
  { key: 'bible_quiz',    label: '❓ Bible Quiz',      placeholder: 'Questions to discuss or quiz the group...' },
  { key: 'prayer_points', label: '🙏 Prayer Points',  placeholder: 'Specific prayer needs for this week...' },
]

// Status Glow — based on last 2 cell reports
function getGlow(memberName, heatmapReports) {
  if (!heatmapReports || heatmapReports.length === 0) return 'grey'
  const norm = String(memberName || '').trim().toLowerCase()
  const inLatest   = heatmapReports[0]?.attendeeNames?.has(norm)
  const inPrevious = heatmapReports[1]?.attendeeNames?.has(norm)
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

// ─── Root Component ───────────────────────────────────────────────────────────

export default function ShepherdView({ embedded = false }) {
  const { userProfile } = useAuth()
  const [searchParamsRoot, setSearchParamsRoot] = useSearchParams()
  const [tab, setTab] = useState('members')

  // When a fill-invite notification is tapped, the URL gains openFillInvite=<id>.
  // Switch to My Fellowship immediately so MyFellowshipTab mounts and can open the form.
  const openFillInviteId = searchParamsRoot.get('openFillInvite') || null
  useEffect(() => {
    if (openFillInviteId) setTab('fellowship')
  }, [openFillInviteId])

  const isDirector = useMemo(() => isCellDirectorInPositions(userProfile), [userProfile])
  const isLeader   = useMemo(() => isCellLeaderInPositions(userProfile),   [userProfile])
  const isFounder  = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER

  // Founder View Switcher — use simulated capabilities when active
  const { viewAsRole, capabilities } = useViewAs()
  const isSimulating = isFounder && viewAsRole !== 'founder'
  // When simulating, override what role can do
  const effectiveIsDirector = isSimulating
    ? (viewAsRole === 'director')
    : (isDirector || isFounder)
  const effectiveCanSeeAllCells = isSimulating
    ? capabilities.canSeeAllCells
    : (isDirector || isFounder)
  const effectiveCanEditContent = isSimulating
    ? capabilities.canEditContent
    : (isDirector || isFounder)

  return (
    <div className={embedded ? undefined : 'min-h-screen bg-slate-50'}>
      {!embedded && <DepartmentTabBar slug="cell" activeTab="shepherd" />}

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Page Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Shepherd Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Shepherd your members · Manage your fellowship
          </p>
        </div>

        {/* Inner tab strip */}
        <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 overflow-x-auto">
          {[
            { key: 'members', label: '💚 Shepherd Care' },
            { key: 'fellowship', label: '👥 My Fellowship' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                tab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ViewAs indicator */}
        {isFounder && viewAsRole !== 'founder' && (
          <div className="px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
            👁 Simulating <strong>{viewAsRole}</strong> view — {capabilities.label}
          </div>
        )}

        {tab === 'members' && (
          <ShepherdCareTab
            userProfile={userProfile}
            isDirector={effectiveIsDirector}
            isLeader={isLeader}
            canSeeAllCells={effectiveCanSeeAllCells}
            canTransfer={capabilities.canTransferMembers}
          />
        )}
        {tab === 'fellowship' && (
          <MyFellowshipTab
            userProfile={userProfile}
            isDirector={effectiveIsDirector}
            isLeader={isLeader}
            cellGroups={[]}
            autoFillInviteId={openFillInviteId}
            onAutoFillInviteConsumed={() =>
              setSearchParamsRoot(prev => { const n = new URLSearchParams(prev); n.delete('openFillInvite'); return n }, { replace: true })
            }
          />
        )}
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
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-500 shadow-sm">
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

// ─── Tab 2: Shepherd Care ─────────────────────────────────────────────────────

function ShepherdCareTab({ userProfile, isDirector, isLeader, canSeeAllCells = true, canTransfer: canTransferProp = true }) {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [cellGroups, setCellGroups]         = useState([])
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [members, setMembers]               = useState([])
  const [heatmap, setHeatmap]               = useState([])
  const [sundayAtt, setSundayAtt]           = useState({ presentIds: [], date: null })
  const [loadingGroups, setLoadingGroups]   = useState(true)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [search, setSearch]                 = useState('')
  const [transferState, setTransferState]   = useState(null)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferring, setTransferring]     = useState(false)
  const [toast, setToast]                   = useState(null)
  const [glowFilter, setGlowFilter]         = useState('all')

  // Prayer state
  const [prayerMember, setPrayerMember]   = useState(null) // member object
  const [prayerSubject, setPrayerSubject] = useState('')
  const [savingPrayer, setSavingPrayer]   = useState(false)

  // Member detail sheet
  const [detailMember, setDetailMember]   = useState(null)
  const [detailProfile, setDetailProfile] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // PCS lookup — names + visitorIds of people already in PCS
  const [pcsNames, setPcsNames]     = useState(new Set())
  const [pcsLoading, setPcsLoading] = useState(true)
  const [notifyingPCS, setNotifyingPCS] = useState(new Set())
  const [notifiedPCS, setNotifiedPCS]   = useState(new Set())

  // Load cell groups
  useEffect(() => {
    getCellGroups('Cell').then(setCellGroups).finally(() => setLoadingGroups(false))
  }, [])

  // Auto-select leader's linked cell
  useEffect(() => {
    if (!cellGroups.length || !userProfile) return
    if (canSeeAllCells && isDirector) return
    const fromProfile = String(userProfile.cellGroupId || userProfile.cellId || '').trim()
    if (fromProfile) {
      const hit = cellGroups.find((g) => g.id === fromProfile || g.cellId === fromProfile)
      if (hit) { setSelectedCellId(hit.id); return }
    }
    const nameMatch = cellGroups.find(
      (g) => String(g.cellName || '').toLowerCase() === String(userProfile.cellGroup || '').toLowerCase()
    )
    if (nameMatch) setSelectedCellId(nameMatch.id)
  }, [cellGroups, userProfile, isDirector])

  // Load members + heatmap + Sunday attendance when cell changes
  useEffect(() => {
    if (!selectedCellId) return
    setLoadingMembers(true)
    setMembers([])
    setHeatmap([])
    setSundayAtt({ presentIds: [], date: null })
    setNotifiedPCS(new Set())
    Promise.all([
      getCellGroupMembers(selectedCellId),
      getRecentCellReportsForHeatmap(selectedCellId, 2),
      getLatestSundayAttendanceForCell(selectedCellId),
    ])
      .then(([m, h, s]) => { setMembers(m); setHeatmap(h); setSundayAtt(s) })
      .finally(() => setLoadingMembers(false))
  }, [selectedCellId])

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
      await createTask({
        taskTitle: `Add ${member.name} to PCS`,
        department: 'Caring',
        assignedPerson: '',
        priority: 'Medium',
        deadline: '',
        status: 'Pending',
        notes: `Referred from Cell by ${userProfile?.name || userProfile?.email || 'Cell Leader'}. ${member.name} is a cell member (${cellName}) but not yet in PCS.${member.phone ? ` Phone: ${member.phone}` : ''}`,
        createdBy: userProfile?.email || '',
        cellMemberReferral: true,
        memberName: member.name,
        memberPhone: member.phone || '',
        memberVisitorId: member.visitorId || '',
        cellId: selectedCellId,
        cellName,
      })
      setNotifiedPCS(prev => new Set([...prev, member.id]))
      showToast(`Caring Director notified for ${member.name}.`)
    } catch {
      showToast('Failed to notify. Please try again.', 'error')
    } finally {
      setNotifyingPCS(prev => { const s = new Set(prev); s.delete(member.id); return s })
    }
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

  const activeMembers = useMemo(
    () => members.filter((m) => m.status !== 'inactive'),
    [members]
  )

  const filteredMembers = useMemo(() => {
    return activeMembers.filter((m) => {
      if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
      if (glowFilter === 'not-pcs') return !pcsLoading && !isInPCS(m)
      if (glowFilter === 'all') return true
      const glow = getGlow(m.name, heatmap)
      return glow === glowFilter
    })
  }, [activeMembers, search, heatmap, glowFilter, pcsNames, pcsLoading])

  const otherCells = cellGroups.filter((g) => g.id !== selectedCellId)

  // Count by status for filter bar
  const statusCounts = useMemo(() => {
    const counts = { green: 0, amber: 0, red: 0, grey: 0, notPcs: 0 }
    activeMembers.forEach((m) => {
      counts[getGlow(m.name, heatmap)]++
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

      {/* Cell selector — Directors / Founder with canSeeAllCells */}
      {isDirector && canSeeAllCells && (
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Select Cell Group</label>
          {loadingGroups ? (
            <span className="text-slate-400 text-sm">Loading…</span>
          ) : (
            <select
              value={selectedCellId || ''}
              onChange={(e) => { setSelectedCellId(e.target.value); setGlowFilter('all') }}
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

      {/* Status filter + legend bar */}
      {selectedCellId && !loadingMembers && (
        <div className="bg-white rounded-3xl border border-slate-200 p-3 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all',      label: 'All',             count: activeMembers.length,  dot: 'bg-slate-400',  activeClass: 'bg-slate-900 text-white' },
              { key: 'green',    label: 'Healthy',          count: statusCounts.green,    dot: 'bg-green-400',  activeClass: 'bg-slate-900 text-white' },
              { key: 'amber',    label: 'Needs Attention',  count: statusCounts.amber,    dot: 'bg-amber-400',  activeClass: 'bg-slate-900 text-white' },
              { key: 'red',      label: 'Urgent',           count: statusCounts.red,      dot: 'bg-red-400',    activeClass: 'bg-slate-900 text-white' },
              { key: 'not-pcs',  label: 'Not in PCS',       count: statusCounts.notPcs,   dot: 'bg-orange-400', activeClass: 'bg-orange-500 text-white' },
            ].map(({ key, label, count, dot, activeClass }) => (
              <button
                key={key}
                type="button"
                onClick={() => setGlowFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  glowFilter === key
                    ? activeClass
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                {label} <span className="opacity-60">{count}</span>
              </button>
            ))}
            {sundayDate && (
              <span className="ml-auto text-xs text-slate-400 self-center">
                Sunday pulse: {sundayDate}
              </span>
            )}
          </div>
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
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center text-slate-400 shadow-sm">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMembers.map((member) => {
              const glow       = getGlow(member.name, heatmap)
              const phone10    = normalisePhone(member.phone)
              const isSunday   = sundayAtt.presentIds.includes(member.id)
              const bday       = member.birthday
              const anniv      = member.anniversary
              const bdaySoon   = isUpcomingSoon(bday)
              const annivSoon  = isUpcomingSoon(anniv)
              const inPCS      = isInPCS(member)
              const notified   = notifiedPCS.has(member.id)
              const notifying  = notifyingPCS.has(member.id)

              const pcsStatus = pcsLoading ? 'checking' : inPCS ? 'in' : 'out'

              return (
                <div
                  key={member.id}
                  style={pcsStatus === 'out' ? { borderLeft: '4px solid #f97316' } : { borderLeft: '4px solid #e2e8f0' }}
                  className={`bg-white rounded-3xl shadow-sm transition-all overflow-hidden ${GLOW_RING[glow]}`}
                >
                  <div className="p-5">
                  {/* ── Header row ── */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <button
                      type="button"
                      className="flex items-center gap-2 min-w-0 text-left"
                      onClick={() => {
                        setDetailMember(member)
                        setDetailProfile(null)
                        if (member.visitorId) {
                          setDetailLoading(true)
                          getMemberProfile(member.visitorId)
                            .then(p => setDetailProfile(p))
                            .catch(() => {})
                            .finally(() => setDetailLoading(false))
                        }
                      }}
                    >
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${GLOW_DOT[glow]}`} />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate underline-offset-2 hover:underline">{member.name}</p>
                        <p className={`text-xs font-medium ${GLOW_TEXT[glow]}`}>{GLOW_LABEL[glow]}</p>
                      </div>
                    </button>
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

                  {/* ── PCS status row — always visible ── */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 10,
                      padding: '5px 10px',
                      borderRadius: 8,
                      backgroundColor: pcsStatus === 'out' ? '#fff7ed' : pcsStatus === 'in' ? '#eef2ff' : '#f8fafc',
                      border: `1px solid ${pcsStatus === 'out' ? '#fed7aa' : pcsStatus === 'in' ? '#c7d2fe' : '#e2e8f0'}`,
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      backgroundColor: pcsStatus === 'out' ? '#f97316' : pcsStatus === 'in' ? '#6366f1' : '#94a3b8',
                    }} />
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: pcsStatus === 'out' ? '#c2410c' : pcsStatus === 'in' ? '#4338ca' : '#94a3b8',
                    }}>
                      {pcsStatus === 'out' ? 'Not in PCS' : pcsStatus === 'in' ? 'In PCS' : 'Checking PCS…'}
                    </span>
                  </div>

                  {/* ── Birthday / Anniversary ── */}
                  {(bday || anniv) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {bday && (
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

                  {/* ── Action buttons ── */}
                  <div className="flex flex-wrap gap-2">
                    {phone10 && (
                      <a
                        href={`https://wa.me/91${phone10}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.535 5.857L.057 23.882a.5.5 0 0 0 .598.625l6.273-1.643A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.886 0-3.655-.523-5.166-1.433l-.371-.22-3.724.976.994-3.634-.24-.381A9.961 9.961 0 0 1 2 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/>
                        </svg>
                        WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => { setPrayerMember(member); setPrayerSubject('') }}
                      className="flex-1 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition"
                    >
                      🙏 Add Prayer
                    </button>
                    {canTransfer() && otherCells.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setTransferState({ memberId: member.id, memberName: member.name }); setTransferTarget('') }}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition"
                      >
                        Transfer
                      </button>
                    )}
                    {/* Notify Caring — only visible if member is NOT in PCS */}
                    {pcsStatus === 'out' && (
                      notified ? (
                        <span className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-orange-50 text-orange-500 text-xs font-semibold">
                          ✓ Caring Notified
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={notifying}
                          onClick={() => handleNotifyCaring(member)}
                          className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-orange-50 text-orange-600 text-xs font-semibold hover:bg-orange-100 transition disabled:opacity-50"
                        >
                          <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                          {notifying ? 'Notifying…' : 'Notify Caring'}
                        </button>
                      )
                    )}
                  </div>
                  </div>{/* end p-5 */}
                </div>
              )
            })}
          </div>

          {filteredMembers.length === 0 && !loadingMembers && (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
              No members found{search ? ` matching "${search}"` : ''}{glowFilter !== 'all' ? ` with "${GLOW_LABEL[glowFilter]}" status` : ''}.
            </div>
          )}
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
              <button type="button" onClick={() => setDetailMember(null)} className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 text-xl flex-shrink-0">×</button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Contact */}
              {(detailMember.phone || detailMember.email) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Contact</p>
                  <div className="space-y-2">
                    {detailMember.phone && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">📞</span>
                        <a href={`tel:${detailMember.phone}`} className="text-sm text-slate-800 hover:text-indigo-600">{detailMember.phone}</a>
                      </div>
                    )}
                    {detailMember.email && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">✉</span>
                        <a href={`mailto:${detailMember.email}`} className="text-sm text-slate-800 hover:text-indigo-600 break-all">{detailMember.email}</a>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Location */}
              {(detailMember.locality || detailMember.address) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Location</p>
                  {detailMember.locality && <p className="text-sm text-slate-800">📍 {detailMember.locality}</p>}
                  {detailMember.address && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{detailMember.address}</p>}
                </section>
              )}

              {/* Personal */}
              {(detailMember.birthday || detailMember.anniversary || detailMember.occupation) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Personal</p>
                  <div className="space-y-1.5">
                    {detailMember.birthday && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🎂</span>
                        <span className="text-sm text-slate-800">{detailMember.birthday}</span>
                        {isUpcomingSoon(detailMember.birthday) && <span className="text-xs text-pink-500 font-semibold">Soon!</span>}
                      </div>
                    )}
                    {detailMember.anniversary && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">💍</span>
                        <span className="text-sm text-slate-800">{detailMember.anniversary}</span>
                        {isUpcomingSoon(detailMember.anniversary) && <span className="text-xs text-rose-500 font-semibold">Soon!</span>}
                      </div>
                    )}
                    {detailMember.occupation && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">💼</span>
                        <span className="text-sm text-slate-800">{detailMember.occupation}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Cell Involvement */}
              {(detailMember.role || detailMember.since) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Cell Involvement</p>
                  <div className="space-y-1.5">
                    {detailMember.role && <p className="text-sm text-slate-800">🏷 {detailMember.role}</p>}
                    {detailMember.since && <p className="text-sm text-slate-800">⏳ Member since {detailMember.since}</p>}
                  </div>
                </section>
              )}

              {/* Faith background — from member_profiles (public read) */}
              {detailLoading && (
                <p className="text-xs text-slate-400 text-center py-2">Loading faith details…</p>
              )}
              {!detailLoading && detailProfile && (detailProfile.baptised || detailProfile.maritalStatus) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Faith Background</p>
                  <div className="space-y-1.5">
                    {detailProfile.baptised === 'yes' && (
                      <div>
                        <p className="text-sm text-slate-800">✝ Baptised</p>
                        {detailProfile.baptismDate && <p className="text-xs text-slate-500 ml-5">{detailProfile.baptismDate}{detailProfile.baptismPlace ? ` · ${detailProfile.baptismPlace}` : ''}</p>}
                        {detailProfile.baptismChurch && <p className="text-xs text-slate-500 ml-5">{detailProfile.baptismChurch}</p>}
                      </div>
                    )}
                    {detailProfile.baptised === 'no' && <p className="text-sm text-slate-800">✝ Not yet baptised</p>}
                    {detailProfile.maritalStatus && (
                      <div>
                        <p className="text-sm text-slate-800">💑 {detailProfile.maritalStatus}</p>
                        {detailProfile.spouseName && <p className="text-xs text-slate-500 ml-5">Spouse: {detailProfile.spouseName}</p>}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Membership status */}
              {!detailLoading && detailProfile?.membershipStatus && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Membership</p>
                  <p className="text-sm text-slate-800">🪪 {detailProfile.membershipStatus}</p>
                </section>
              )}

              {/* Shepherd Notes */}
              {detailMember.notes && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Shepherd Notes</p>
                  <p className="text-sm text-slate-700 leading-relaxed italic">{detailMember.notes}</p>
                </section>
              )}

            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2 flex-shrink-0">
              {detailMember.phone && (() => { const ph = normalisePhone(detailMember.phone); return ph ? (
                <a
                  href={`https://wa.me/91${ph}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-green-50 text-green-700 text-sm font-semibold hover:bg-green-100 transition"
                >
                  WhatsApp
                </a>
              ) : null })()}
              <button
                type="button"
                onClick={() => { setPrayerMember(detailMember); setPrayerSubject(''); setDetailMember(null) }}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition"
              >
                🙏 Add Prayer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: My Fellowship ─────────────────────────────────────────────────────

const EMPTY_MEMBER_FORM = {
  name: '', visitorId: '', phone: '', email: '', locality: '', address: '',
  birthday: '', anniversary: '', since: '', occupation: '', role: '', notes: '',
}

// Calculate how long someone has been attending (from "since" date to today)
function calcAttendanceDuration(sinceDate) {
  if (!sinceDate) return null
  const since = new Date(sinceDate)
  const now   = new Date()
  if (isNaN(since.getTime()) || since > now) return null
  let years  = now.getFullYear() - since.getFullYear()
  let months = now.getMonth()   - since.getMonth()
  if (months < 0) { years--; months += 12 }
  const days = Math.floor((now - since) / 86400000)
  if (years > 0 && months > 0) return `${years} yr${years > 1 ? 's' : ''} ${months} mo`
  if (years > 0)  return `${years} year${years > 1 ? 's' : ''}`
  if (months > 0) return `${months} month${months > 1 ? 's' : ''}`
  if (days >= 7)  return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''}`
  return 'Less than a week'
}

function MyFellowshipTab({ userProfile, isDirector, isLeader, autoFillInviteId, onAutoFillInviteConsumed }) {
  const [allCellGroups, setAllCellGroups]   = useState([])
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [members, setMembers]               = useState([])
  const [loading, setLoading]               = useState(false)
  const [loadingGroups, setLoadingGroups]   = useState(true)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm]         = useState(EMPTY_MEMBER_FORM)
  const [adding, setAdding]           = useState(false)
  const [addSearch, setAddSearch]         = useState('')
  const [addSearchOpen, setAddSearchOpen] = useState(false)
  const [directoryList, setDirectoryList] = useState([])
  const [directoryLoading, setDirectoryLoading] = useState(false)

  const [editId, setEditId]     = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_MEMBER_FORM)
  const [saving, setSaving]     = useState(false)

  const [pendingDeactivationIds, setPendingDeactivationIds] = useState(new Set())

  const [deactivateTarget, setDeactivateTarget]   = useState(null)
  const [deactivateReason, setDeactivateReason]   = useState('')
  const [submittingDeactivate, setSubmittingDeactivate] = useState(false)

  const [toast, setToast] = useState(null)
  const showToastMsg = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const [detailMember, setDetailMember]   = useState(null)
  const [detailProfile, setDetailProfile] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Profile fill invitations sent by Caring Director
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [fillInviteOpen, setFillInviteOpen]         = useState(null)
  const [fillInviteForm, setFillInviteForm]         = useState({})
  const [fillInviteSaving, setFillInviteSaving]     = useState(false)

  const openDetail = (member) => {
    setDetailMember(member)
    setDetailProfile(null)
    if (member.visitorId) {
      setDetailLoading(true)
      getMemberProfile(member.visitorId)
        .then(p => setDetailProfile(p))
        .catch(() => {})
        .finally(() => setDetailLoading(false))
    }
  }

  useEffect(() => {
    getCellGroups('Cell').then(setAllCellGroups).finally(() => setLoadingGroups(false))
  }, [])

  // Subscribe to pending fill invitations for this cell leader
  useEffect(() => {
    const cellId = userProfile?.cellGroupId || userProfile?.cellId
    if (!cellId) return
    const unsub = subscribePCSFillInvitationsByCellId(cellId, setPendingInvitations)
    return unsub
  }, [userProfile?.cellGroupId, userProfile?.cellId])

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
    const fromProfile = String(userProfile.cellGroupId || userProfile.cellId || '').trim()
    if (fromProfile) {
      const hit = allCellGroups.find((g) => g.id === fromProfile || g.cellId === fromProfile)
      if (hit) { setSelectedCellId(hit.id); return }
    }
    const nameMatch = allCellGroups.find(
      (g) => String(g.cellName || '').toLowerCase() === String(userProfile.cellGroup || '').toLowerCase()
    )
    if (nameMatch) setSelectedCellId(nameMatch.id)
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
    getCellMemberPendingChanges(selectedCellId)
      .then((changes) => {
        const ids = new Set(
          changes
            .filter((c) => c.changeType === 'deactivate' && c.status === 'pending')
            .map((c) => c.memberId)
        )
        setPendingDeactivationIds(ids)
      })
      .catch(() => setPendingDeactivationIds(new Set()))
  }, [selectedCellId])

  const activeMembers   = useMemo(() => members.filter((m) => m.status !== 'inactive'), [members])
  const inactiveMembers = useMemo(() => members.filter((m) => m.status === 'inactive'),  [members])
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
    setEditForm({
      name:        member.name        || '',
      phone:       member.phone       || '',
      email:       member.email       || '',
      locality:    member.locality    || '',
      address:     member.address     || '',
      birthday:    member.birthday    || '',
      anniversary: member.anniversary || '',
      since:       member.since       || '',
      occupation:  member.occupation  || '',
      role:        member.role        || '',
      notes:       member.notes       || '',
    })
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

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-white shadow-lg text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>{toast.msg}</div>
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
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center text-slate-400 shadow-sm">
          {isDirector ? 'Select a cell group above.' : 'No cell group is linked to your profile.'}
        </div>
      )}

      {selectedCellId && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Active Members</h2>
              <p className="text-slate-400 text-sm">{activeMembers.length} member{activeMembers.length !== 1 ? 's' : ''}</p>
            </div>
            {canEdit && (
              <button type="button"
                onClick={() => {
                  const next = !showAddForm
                  setShowAddForm(next)
                  setAddForm(EMPTY_MEMBER_FORM)
                  setAddSearch('')
                  if (next && directoryList.length === 0) {
                    setDirectoryLoading(true)
                    getDelightVisitors().then(setDirectoryList).catch(() => {}).finally(() => setDirectoryLoading(false))
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all">
                {showAddForm ? '✕ Cancel' : '+ Add Member'}
              </button>
            )}
          </div>

          {/* Add Member Form — directory search enforced */}
          {showAddForm && (
            <div className="bg-white rounded-3xl border border-indigo-200 p-5 shadow-sm space-y-3">
              <div>
                <h3 className="font-bold text-slate-900">Add Member</h3>
                <p className="text-xs text-slate-400 mt-0.5">Select from People&apos;s Directory. New people must first be registered via D Light Visitor Entry.</p>
              </div>

              {/* Directory search picker */}
              {!addForm.visitorId ? (
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder={directoryLoading ? 'Loading directory…' : 'Search People\'s Directory…'}
                    value={addSearch}
                    autoComplete="off"
                    disabled={directoryLoading}
                    onChange={e => { setAddSearch(e.target.value); setAddSearchOpen(true) }}
                    onFocus={() => setAddSearchOpen(true)}
                    onBlur={() => setTimeout(() => setAddSearchOpen(false), 150)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-60"
                  />
                  {addSearchOpen && addSearch.trim().length > 0 && (() => {
                    const q = addSearch.trim().toLowerCase()
                    const matches = directoryList.filter(v => v.name && v.name.toLowerCase().includes(q)).slice(0, 8)
                    return (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-xl z-20 overflow-hidden max-h-56 overflow-y-auto">
                        {matches.length === 0 ? (
                          <div className="px-4 py-3 text-center">
                            <p className="text-sm text-slate-500 font-medium">Not in People&apos;s Directory</p>
                            <p className="text-xs text-slate-400 mt-0.5">New people can only be added via D Light Visitor Entry</p>
                          </div>
                        ) : matches.map(v => (
                          <button key={v.id} type="button"
                            onMouseDown={() => {
                              setAddForm(f => ({ ...f, name: v.name, visitorId: v.id, phone: f.phone || v.phone || '', birthday: f.birthday || (v.dob ? String(v.dob).slice(0, 10) : '') }))
                              setAddSearch('')
                              setAddSearchOpen(false)
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 text-left border-b border-slate-50 last:border-0">
                            <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {v.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{v.name}</p>
                              {v.phone && <p className="text-xs text-slate-400">{v.phone}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
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
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
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
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(member)}
                            disabled={pendingDeactivationIds.has(member.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                              pendingDeactivationIds.has(member.id)
                                ? 'bg-amber-50 text-amber-500 cursor-not-allowed opacity-70'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                          >
                            {pendingDeactivationIds.has(member.id) ? 'Pending…' : isDirector ? 'Deactivate' : 'Remove'}
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
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Contact */}
              {(detailMember.phone || detailMember.email) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Contact</p>
                  <div className="space-y-2">
                    {detailMember.phone && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">📞</span>
                        <a href={`tel:${detailMember.phone}`} className="text-sm text-slate-800 hover:text-indigo-600">{detailMember.phone}</a>
                      </div>
                    )}
                    {detailMember.email && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">✉</span>
                        <a href={`mailto:${detailMember.email}`} className="text-sm text-slate-800 hover:text-indigo-600 break-all">{detailMember.email}</a>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Location */}
              {(detailMember.locality || detailMember.address || detailProfile?.permanentAddress) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Location</p>
                  <div className="space-y-1">
                    {detailMember.locality && <p className="text-sm text-slate-800">📍 {detailMember.locality}</p>}
                    {detailMember.address && <p className="text-xs text-slate-500 leading-relaxed">Current: {detailMember.address}</p>}
                    {detailProfile?.permanentAddress && <p className="text-xs text-slate-500 leading-relaxed">Permanent: {detailProfile.permanentAddress}</p>}
                  </div>
                </section>
              )}

              {/* Personal */}
              {(detailMember.birthday || detailMember.anniversary || detailMember.occupation) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Personal</p>
                  <div className="space-y-1.5">
                    {detailMember.birthday && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🎂</span>
                        <span className="text-sm text-slate-800">{detailMember.birthday}</span>
                        {isUpcomingSoon(detailMember.birthday) && <span className="text-xs text-pink-500 font-semibold">Soon!</span>}
                      </div>
                    )}
                    {detailMember.anniversary && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">💍</span>
                        <span className="text-sm text-slate-800">{detailMember.anniversary}</span>
                        {isUpcomingSoon(detailMember.anniversary) && <span className="text-xs text-rose-500 font-semibold">Soon!</span>}
                      </div>
                    )}
                    {detailMember.occupation && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm">💼</span>
                        <span className="text-sm text-slate-800">{detailMember.occupation}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Cell Involvement */}
              {(detailMember.role || detailMember.since) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Cell Involvement</p>
                  <div className="space-y-1.5">
                    {detailMember.role && <p className="text-sm text-slate-800">🏷 {detailMember.role}</p>}
                    {detailMember.since && <p className="text-sm text-slate-800">⏳ Attending since {detailMember.since} · {calcAttendanceDuration(detailMember.since) || '—'}</p>}
                  </div>
                </section>
              )}

              {detailLoading && (
                <p className="text-xs text-slate-400 text-center py-2">Loading profile…</p>
              )}

              {/* Faith Background */}
              {!detailLoading && detailProfile && (detailProfile.baptised || detailProfile.maritalStatus) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Faith Background</p>
                  <div className="space-y-1.5">
                    {detailProfile.baptised === 'yes' && (
                      <div>
                        <p className="text-sm text-slate-800">✝ Baptised</p>
                        {detailProfile.baptismDate && <p className="text-xs text-slate-500 ml-5">{detailProfile.baptismDate}{detailProfile.baptismPlace ? ` · ${detailProfile.baptismPlace}` : ''}</p>}
                        {detailProfile.baptismChurch && <p className="text-xs text-slate-500 ml-5">{detailProfile.baptismChurch}</p>}
                      </div>
                    )}
                    {detailProfile.baptised === 'no' && <p className="text-sm text-slate-800">✝ Not yet baptised</p>}
                    {detailProfile.maritalStatus && (
                      <div>
                        <p className="text-sm text-slate-800">💑 {detailProfile.maritalStatus}</p>
                        {detailProfile.marriageDate && <p className="text-xs text-slate-500 ml-5">Since {detailProfile.marriageDate}</p>}
                        {detailProfile.spouseName && <p className="text-xs text-slate-500 ml-5">Spouse: {detailProfile.spouseName}</p>}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Ministry */}
              {!detailLoading && detailProfile && (detailProfile.ministryNotes || detailProfile.ministryHistory?.length > 0) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ministry</p>
                  <div className="space-y-1.5">
                    {detailProfile.ministryHistory?.map((h, i) => (
                      <p key={i} className="text-sm text-slate-800">• {h}</p>
                    ))}
                    {detailProfile.ministryNotes && <p className="text-xs text-slate-500 leading-relaxed italic">{detailProfile.ministryNotes}</p>}
                  </div>
                </section>
              )}

              {/* Leadership */}
              {!detailLoading && detailProfile && (detailProfile.leaderSince || detailProfile.directorOf || detailProfile.isDirector) && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Leadership</p>
                  <div className="space-y-1">
                    {detailProfile.isDirector && detailProfile.directorOf && (
                      <p className="text-sm text-slate-800">👑 Director — {detailProfile.directorOf}{detailProfile.directorSince ? ` (since ${detailProfile.directorSince})` : ''}</p>
                    )}
                    {detailProfile.leaderSince && (
                      <p className="text-sm text-slate-800">🏷 Leader since {detailProfile.leaderSince}{detailProfile.leaderUntil ? ` to ${detailProfile.leaderUntil}` : ''}</p>
                    )}
                  </div>
                </section>
              )}

              {/* Membership status (no number) */}
              {!detailLoading && detailProfile?.membershipStatus && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Membership</p>
                  <p className="text-sm text-slate-800">🪪 {detailProfile.membershipStatus}</p>
                </section>
              )}

              {/* Shepherd Notes */}
              {detailMember.notes && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Shepherd Notes</p>
                  <p className="text-sm text-slate-700 leading-relaxed italic">{detailMember.notes}</p>
                </section>
              )}

            </div>

            {/* Footer */}
            {detailMember.phone && (() => { const ph = normalisePhone(detailMember.phone); return ph ? (
              <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
                <a
                  href={`https://wa.me/91${ph}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-green-50 text-green-700 text-sm font-semibold hover:bg-green-100 transition"
                >
                  WhatsApp
                </a>
              </div>
            ) : null })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Member Form Fields ───────────────────────────────────────────────────────

function MemberFormFields({ form, onChange }) {
  const set     = (key) => (e) => onChange((f) => ({ ...f, [key]: e.target.value }))
  const duration = calcAttendanceDuration(form.since)

  return (
    <div className="space-y-3">
      {/* Section: Identity */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Personal Details</p>

      <input type="text" value={form.name} onChange={set('name')} placeholder="Full name *" required
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      <div className="grid grid-cols-2 gap-2.5">
        <input type="tel" value={form.phone} onChange={set('phone')} placeholder="Phone number"
          className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <input type="email" value={form.email} onChange={set('email')} placeholder="Email (optional)"
          className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      </div>

      <input type="text" value={form.locality} onChange={set('locality')} placeholder="Locality / Area"
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      <textarea value={form.address} onChange={set('address')} placeholder="Full address (optional)" rows={2}
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      <input type="text" value={form.occupation} onChange={set('occupation')} placeholder="Occupation (optional)"
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      {/* Section: Dates */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Important Dates</p>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="text-xs text-slate-500 font-semibold mb-1 block">🎂 Birthday</label>
          <input type="date" value={form.birthday} onChange={set('birthday')}
            className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-semibold mb-1 block">💍 Anniversary</label>
          <input type="date" value={form.anniversary} onChange={set('anniversary')}
            className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 font-semibold mb-1 block">⏳ Member Since (first attended)</label>
        <input type="date" value={form.since} onChange={set('since')}
          className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        {duration && (
          <p className="text-xs text-emerald-600 font-semibold mt-1.5 px-1">
            ✓ Attending for {duration}
          </p>
        )}
      </div>

      {/* Section: Cell Role */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Cell Involvement</p>

      <input type="text" value={form.role} onChange={set('role')}
        placeholder="Role in cell (e.g. Host, Worship Lead, Regular Member…)"
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      <textarea value={form.notes} onChange={set('notes')}
        placeholder="Shepherd notes (prayer needs, follow-up, concerns…)" rows={3}
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />
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

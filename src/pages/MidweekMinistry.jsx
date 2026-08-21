import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import LiveElapsedTimer from '../components/LiveElapsedTimer'
import ProgramConfirmSheet from '../components/ProgramConfirmSheet'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import { useViewAs } from '../context/ViewAsContext'
import {
  getCellGroups,
  getCellGroupMembers,
  getActiveBackToBibleForDate,
  getMidweekPrayerPoints,
  saveMidweekPrayerPoints,
  getMidweekSettings,
  setMidweekSettings,
  saveMidweekSessionSummary,
  syncMidweekAttendanceToCellReport,
  getDepartmentChildren,
  createTask,
} from '../services/firestore'
import { isCellDirectorInPositions, isCellLeaderInPositions } from '../utils/cellReportPermissions'
import { ROLES } from '../constants/roles'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SEGMENTS = ['Worship', 'Ice Breaker', 'Back to Bible', 'Prayer']

const SEGMENT_STYLES = {
  Worship:          { icon: '🎵', activeBg: 'bg-indigo-900', activeText: 'text-indigo-50',  ringColor: 'ring-indigo-400' },
  'Ice Breaker':    { icon: '🧊', activeBg: 'bg-sky-800',    activeText: 'text-sky-50',     ringColor: 'ring-sky-400' },
  'Back to Bible':  { icon: '📖', activeBg: 'bg-blue-900',   activeText: 'text-blue-50',    ringColor: 'ring-blue-400' },
  Prayer:           { icon: '🙏', activeBg: 'bg-slate-900',  activeText: 'text-slate-50',   ringColor: 'ring-slate-400' },
  // Fallbacks for any legacy segment names
  Word:             { icon: '📖', activeBg: 'bg-blue-900',   activeText: 'text-blue-50',    ringColor: 'ring-blue-400' },
}

const SHEPHERD_FIELDS = [
  { key: 'worship_song',  label: '🎵 Worship Song' },
  { key: 'ice_breaker',   label: '🧊 Ice Breaker' },
  { key: 'bible_content', label: '📖 Bible Content' },
  { key: 'bible_quiz',    label: '❓ Bible Quiz' },
  { key: 'prayer_points', label: '🙏 Prayer Points' },
]

function formatDuration(minutes) {
  if (minutes == null) return '—'
  const m = Number(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

function getInitials(name) {
  return String(name || '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function MidweekMinistry({ embedded = false }) {
  const { userProfile } = useAuth()
  const [subTab, setSubTab] = useState('live')
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const isDirector = useMemo(() => isCellDirectorInPositions(userProfile), [userProfile])
  const isLeader   = useMemo(() => isCellLeaderInPositions(userProfile),   [userProfile])
  const isFounder  = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER

  const { viewAsRole, capabilities } = useViewAs()
  const isSimulating        = isFounder && viewAsRole !== 'founder'
  const effectiveIsDirector = isSimulating ? (viewAsRole === 'director') : (isDirector || isFounder)
  const effectiveIsLeader   = isSimulating ? (viewAsRole === 'leader')   : isLeader
  const canUseLive          = isSimulating ? capabilities.canUseLiveControl : true

  return (
    <div className={embedded ? undefined : 'min-h-screen bg-slate-50'}>
      <div className={`max-w-2xl mx-auto space-y-4 ${embedded ? 'py-4' : 'px-4 py-6'}`}>
        {/* Minimal page label — the "Begin Meeting" hero below is the real focal
            point, so this stays small instead of competing with it. */}
        <div>
          <h1 className="text-base font-bold text-slate-800">Mid-week Ministry</h1>
        </div>

        {/* ── Session Config (fixed placement) — Report Date + Live Control/Cell
            Prep toggle, always directly under the page heading regardless of
            which sub-tab is active, so switching tabs never shifts these
            controls. ── */}
        <SessionConfigBar
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          subTab={subTab}
          onSubTabChange={setSubTab}
        />

        {isFounder && viewAsRole !== 'founder' && (
          <div className="px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
            👁 Simulating <strong>{viewAsRole}</strong> view — {capabilities.label}
          </div>
        )}

        {subTab === 'live' ? (
          canUseLive ? (
            <LiveControlTab
              userProfile={userProfile}
              isDirector={effectiveIsDirector}
              isLeader={effectiveIsLeader}
              reportDate={selectedDate}
              onSwitchToPrep={() => setSubTab('prep')}
            />
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center text-slate-400 shadow-sm">
              <p className="text-4xl mb-3">🔒</p>
              <p className="font-medium text-slate-500">Live Control is not available for this role.</p>
              <p className="text-sm mt-1">Switch to Director or Leader view to access it.</p>
            </div>
          )
        ) : (
          <CellPrepTab
            userProfile={userProfile}
            isDirector={effectiveIsDirector}
            isLeader={effectiveIsLeader}
            reportDate={selectedDate}
          />
        )}
      </div>
    </div>
  )
}

// ─── Session Config Bar ───────────────────────────────────────────────────────
// Auxiliary controls (Report Date + Live Control/Cell Prep toggle) — deliberately
// lower visual weight than the "Begin Meeting" hero, one compact row instead of
// two separate cards, so it reads as secondary session config, not a focal point.
function SessionConfigBar({ selectedDate, onDateChange, subTab, onSubTabChange }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-100/70 rounded-2xl px-3 py-2.5">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-slate-400 text-sm shrink-0">📅</span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
          title="Report date — change to enter data for a past session"
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 shrink-0">
        {[
          { key: 'live', label: 'Live Control' },
          { key: 'prep', label: 'Cell Prep' },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSubTabChange(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              subTab === key
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Live Control Tab ─────────────────────────────────────────────────────────

function LiveControlTab({ userProfile, isDirector, isLeader, reportDate, onSwitchToPrep }) {
  const today = reportDate || format(new Date(), 'yyyy-MM-dd')

  const [cellGroups, setCellGroups]         = useState([])
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [members, setMembers]               = useState([])
  const [loadingGroups, setLoadingGroups]   = useState(true)
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Session state
  const [segmentOrder, setSegmentOrder]       = useState(DEFAULT_SEGMENTS)
  const [segmentDurations, setSegmentDurations] = useState({})
  const [segmentIdx, setSegmentIdx]           = useState(-1)
  const [presentIds, setPresentIds]           = useState(new Set())

  // Timing tracking
  const segmentStartTime  = useRef(null)
  const segmentTimingsRef = useRef([])
  const [segmentStartedAt, setSegmentStartedAt] = useState(null)

  // Program confirmation before first tap
  const [showConfirmSheet, setShowConfirmSheet] = useState(false)

  // End-meeting confirmation modal
  const [showEndModal, setShowEndModal]     = useState(false)
  const [pendingTimings, setPendingTimings] = useState([])
  const [saveError, setSaveError]           = useState(null)


  // Visitor state
  const [visitors, setVisitors]           = useState([])
  const [visitorInput, setVisitorInput]   = useState('')

  // River Kids parent-child linkage — riverKidsChildren is the full registry
  // (fetched once per mount, not per cell); childrenAttending is this session's
  // confirmed roster; askedParentIds tracks who's already been prompted so toggling
  // a member on/off repeatedly doesn't re-show the popover every time.
  const [riverKidsChildren, setRiverKidsChildren] = useState([])
  const [childrenAttending, setChildrenAttending] = useState([])
  const [askedParentIds, setAskedParentIds]       = useState(new Set())
  const [childPrompt, setChildPrompt]             = useState(null) // { memberId, memberName, matches: [{name}], checked: Set<name> }

  // Prayer state
  const [prayerPoints, setPrayerPoints]   = useState([])
  const [loadingPrayer, setLoadingPrayer] = useState(false)

  // Persist in-progress attendance so navigating away doesn't lose it.
  // Cleared only on save or manual reset.
  const _lsKeyRef = useRef(null)
  useEffect(() => {
    if (!selectedCellId) return
    const key = `rol_live_${selectedCellId}_${today}`
    if (_lsKeyRef.current !== key) {
      _lsKeyRef.current = key
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null')
        if (saved) {
          if (saved.presentIds)              setPresentIds(new Set(saved.presentIds))
          if (saved.visitors)                setVisitors(saved.visitors)
          if (saved.visitorInput !== undefined) setVisitorInput(saved.visitorInput)
          if (saved.childrenAttending)       setChildrenAttending(saved.childrenAttending)
          if (saved.askedParentIds)          setAskedParentIds(new Set(saved.askedParentIds))
        }
      } catch {}
      return
    }
    try {
      localStorage.setItem(key, JSON.stringify({
        presentIds: [...presentIds],
        visitors,
        visitorInput,
        childrenAttending,
        askedParentIds: [...askedParentIds],
      }))
    } catch {}
  }, [selectedCellId, today, presentIds, visitors, visitorInput, childrenAttending, askedParentIds])

  // River Kids registry — loaded once; used to spot parents among cell members via
  // name matching (fatherName/motherName are free-text, no ID linkage exists).
  useEffect(() => {
    getDepartmentChildren('River Kids').then(setRiverKidsChildren).catch(() => setRiverKidsChildren([]))
  }, [])

  // Load cell groups
  useEffect(() => {
    getCellGroups('Cell').then(setCellGroups).finally(() => setLoadingGroups(false))
  }, [])

  // Auto-select leader's cell
  useEffect(() => {
    if (!cellGroups.length || !userProfile) return
    if (isDirector && !isLeader) return
    const fromProfile = String(userProfile.cellGroupId || userProfile.cellId || '').trim()
    if (fromProfile) {
      const hit = cellGroups.find((g) => g.id === fromProfile || g.cellId === fromProfile)
      if (hit) { setSelectedCellId(hit.id); return }
    }
    const nameMatch = cellGroups.find(
      (g) => String(g.cellName || '').toLowerCase() === String(userProfile.cellGroup || '').toLowerCase()
    )
    if (nameMatch) setSelectedCellId(nameMatch.id)
  }, [cellGroups, userProfile, isDirector, isLeader])

  // Load members + segment order + prayer points when cell changes
  useEffect(() => {
    if (!selectedCellId) return
    setLoadingMembers(true)
    setMembers([])
    getCellGroupMembers(selectedCellId).then(setMembers).finally(() => setLoadingMembers(false))

    getMidweekSettings(selectedCellId).then((s) => {
      if (s?.segmentOrder?.length) setSegmentOrder(s.segmentOrder)
      else setSegmentOrder(DEFAULT_SEGMENTS)
      if (s?.segmentDetails?.length) {
        const map = {}
        s.segmentDetails.forEach((d) => { if (d.name) map[d.name] = Number(d.durationMinutes) || null })
        setSegmentDurations(map)
      }
    })

    setLoadingPrayer(true)
    getMidweekPrayerPoints(selectedCellId, today)
      .then(setPrayerPoints)
      .finally(() => setLoadingPrayer(false))
  }, [selectedCellId, today])

  // De-duplicate by name (case/whitespace-insensitive) — keeps the first occurrence
  // only, so a member listed twice in the underlying roster shows once in Attendance.
  const activeMembers = useMemo(() => {
    const seen = new Set()
    return members
      .filter((m) => m.status !== 'inactive')
      .filter((m) => {
        const key = String(m.name || '').trim().toLowerCase()
        if (!key) return true
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [members])

  // name (lowercased/trimmed) → River Kids children who list that name as a parent.
  // Name-string matching is the only linkage available — department_children has no
  // parentMemberId, just free-text fatherName/motherName fields.
  const childrenByParentName = useMemo(() => {
    const map = new Map()
    riverKidsChildren.forEach((child) => {
      if (child.active === false) return
      ;[child.fatherName, child.motherName].forEach((parentName) => {
        const key = String(parentName || '').trim().toLowerCase()
        if (!key) return
        if (!map.has(key)) map.set(key, [])
        map.get(key).push({ name: child.name })
      })
    })
    return map
  }, [riverKidsChildren])

  const togglePresent = useCallback((id) => {
    setPresentIds((prev) => {
      const wasPresent = prev.has(id)
      const next = new Set(prev)
      if (wasPresent) next.delete(id)
      else next.add(id)

      // Only prompt on the transition to present, and only once per parent per
      // session — repeatedly toggling the same member shouldn't re-show the popover.
      if (!wasPresent && !askedParentIds.has(id)) {
        const member = activeMembers.find((m) => m.id === id)
        const key = String(member?.name || '').trim().toLowerCase()
        const matches = key ? childrenByParentName.get(key) : null
        if (matches?.length) {
          setAskedParentIds((prevAsked) => new Set(prevAsked).add(id))
          setChildPrompt({
            memberId: id,
            memberName: member.name,
            matches,
            checked: new Set(matches.map((c) => c.name)), // default all checked
          })
        }
      }
      return next
    })
  }, [askedParentIds, activeMembers, childrenByParentName])

  const toggleChildPromptCheck = useCallback((name) => {
    setChildPrompt((prev) => {
      if (!prev) return prev
      const next = new Set(prev.checked)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return { ...prev, checked: next }
    })
  }, [])

  const confirmChildPrompt = useCallback(() => {
    setChildPrompt((prev) => {
      if (!prev) return null
      const toAdd = prev.matches.filter((c) => prev.checked.has(c.name))
      if (toAdd.length) {
        setChildrenAttending((prevChildren) => {
          const existingNames = new Set(prevChildren.map((c) => c.name.trim().toLowerCase()))
          const fresh = toAdd
            .filter((c) => !existingNames.has(c.name.trim().toLowerCase()))
            .map((c) => ({ id: `${prev.memberId}_${c.name}`, name: c.name, parentName: prev.memberName }))
          return [...prevChildren, ...fresh]
        })
      }
      return null
    })
  }, [])

  const removeChildAttending = useCallback((id) => {
    setChildrenAttending((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const selectAllMembers = useCallback(() => {
    setPresentIds(new Set(activeMembers.map((m) => m.id)))
  }, [activeMembers])

  const clearAllMembers = useCallback(() => setPresentIds(new Set()), [])

  // Segment state machine
  const isEnded    = segmentIdx >= segmentOrder.length
  const currentSeg = !isEnded && segmentIdx >= 0 ? segmentOrder[segmentIdx] : null
  const nextSeg    = !isEnded && segmentIdx >= 0 && segmentIdx < segmentOrder.length - 1 ? segmentOrder[segmentIdx + 1] : null
  const segStyle   = currentSeg ? (SEGMENT_STYLES[currentSeg] || SEGMENT_STYLES.Prayer) : null

  const startFirstSegment = () => {
    const now = Date.now()
    segmentStartTime.current  = now
    segmentTimingsRef.current = []
    setSegmentStartedAt(now)
    setSegmentIdx(0)
  }

  const handleMasterTap = () => {
    const now = Date.now()

    // First tap — show confirmation sheet instead of starting immediately
    if (segmentIdx === -1) {
      setShowConfirmSheet(true)
      return
    }

    if (isEnded) {
      // Reset everything
      setSegmentIdx(-1)
      setPresentIds(new Set())
      setVisitors([])
      setVisitorInput('')
      setChildrenAttending([])
      setAskedParentIds(new Set())
      setChildPrompt(null)
      segmentStartTime.current  = null
      segmentTimingsRef.current = []
      setPendingTimings([])
      setSegmentStartedAt(null)
      setShowConfirmSheet(false)
      if (selectedCellId) localStorage.removeItem(`rol_live_${selectedCellId}_${today}`)
      return
    }

    const nextIdx = segmentIdx + 1

    // Record duration of the segment that just ran
    let updatedTimings = [...segmentTimingsRef.current]
    if (segmentIdx >= 0 && segmentStartTime.current) {
      const durationMinutes = Math.round((now - segmentStartTime.current) / 60000)
      updatedTimings = [...updatedTimings, { name: segmentOrder[segmentIdx], durationMinutes }]
    }

    if (nextIdx >= segmentOrder.length) {
      // All segments done — show confirmation modal before saving
      setPendingTimings(updatedTimings)
      setShowEndModal(true)
      setSegmentStartedAt(null)
    } else {
      // Advance to next segment
      segmentTimingsRef.current = updatedTimings
      segmentStartTime.current  = now
      setSegmentStartedAt(now)
      setSegmentIdx(nextIdx)
    }
  }

  const addVisitor = useCallback(() => {
    const name = visitorInput.trim()
    if (!name) return
    setVisitors((prev) => [...prev, { id: Date.now().toString(), name }])
    setVisitorInput('')
  }, [visitorInput])

  const removeVisitor = useCallback((id) => {
    setVisitors((prev) => prev.filter((v) => v.id !== id))
  }, [])

  const confirmEndMeeting = useCallback(async (finalPresentIds, editedTimings) => {
    const ids = finalPresentIds ?? presentIds
    const timingsToSave = editedTimings ?? pendingTimings
    segmentTimingsRef.current = timingsToSave
    setPresentIds(ids)
    setShowEndModal(false)
    setSegmentIdx(segmentOrder.length)   // isEnded = true
    setSaveError(null)
    if (selectedCellId) {
      const updatedBy = userProfile?.name || userProfile?.email || 'unknown'
      const cellName = cellGroups.find((g) => g.id === selectedCellId)?.cellName || ''
      const presentMembers = members.filter((m) => ids.has(m.id))

      localStorage.removeItem(`rol_live_${selectedCellId}_${today}`)

      saveMidweekSessionSummary(selectedCellId, today, {
        segmentTimings: timingsToSave,
        presentIds: Array.from(ids),
        updatedBy,
      }).catch((err) => {
        console.error('Failed to save session summary:', err)
        setSaveError('Session could not be saved. Please check your connection and try again.')
      })

      syncMidweekAttendanceToCellReport(selectedCellId, cellName, today, presentMembers, updatedBy, visitors, childrenAttending)
        .catch((err) => {
          console.error('Failed to sync attendance to cell report:', err)
          setSaveError('Attendance could not be saved to reports. Ask your Cell Director to update your profile with the correct Cell ID.')
        })
    }
  }, [pendingTimings, selectedCellId, today, presentIds, userProfile, segmentOrder.length, cellGroups, members, visitors, childrenAttending])

  // Master button appearance
  let masterBg, masterText, masterIcon, masterLabel, masterSub
  if (isEnded) {
    masterBg = 'bg-emerald-800'; masterText = 'text-emerald-50'
    masterIcon = '✅'; masterLabel = 'Meeting Ended'; masterSub = 'Tap to reset'
  } else if (segmentIdx === -1) {
    masterBg = 'bg-slate-900'; masterText = 'text-white'
    masterIcon = '⚡'; masterLabel = 'Begin Meeting'; masterSub = 'Tap to start'
  } else {
    masterBg = segStyle?.activeBg || 'bg-slate-900'
    masterText = segStyle?.activeText || 'text-white'
    masterIcon = segStyle?.icon || '▶'
    masterLabel = currentSeg
    masterSub = nextSeg ? `Next: ${nextSeg} →` : 'Tap to end meeting'
  }

  // Prayer handlers
  const addPrayerPoint = useCallback(async (name, subject) => {
    if (!selectedCellId) return
    const newPoint = {
      id: Date.now().toString(),
      name: name.trim(),
      subject: subject.trim(),
      addedBy: userProfile?.name || userProfile?.email || 'Unknown',
      addedByUid: userProfile?.id || '',
      isDirector: isDirector,
      createdAt: new Date().toISOString(),
    }
    const updated = [...prayerPoints, newPoint]
    setPrayerPoints(updated)
    await saveMidweekPrayerPoints(selectedCellId, today, updated, userProfile?.name || 'unknown')
  }, [selectedCellId, today, prayerPoints, userProfile, isDirector])

  const removePrayerPoint = useCallback(async (pointId) => {
    if (!selectedCellId) return
    const updated = prayerPoints.filter((p) => p.id !== pointId)
    setPrayerPoints(updated)
    await saveMidweekPrayerPoints(selectedCellId, today, updated, userProfile?.name || 'unknown')
  }, [selectedCellId, today, prayerPoints, userProfile])

  return (
    <div className="space-y-6 pb-24">

      {/* Cell selector — Directors only */}
      {isDirector && (
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Cell Group</label>
          {loadingGroups ? (
            <span className="text-slate-400 text-sm">Loading…</span>
          ) : (
            <select
              value={selectedCellId || ''}
              onChange={(e) => setSelectedCellId(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-sm flex-1"
            >
              <option value="">— select cell —</option>
              {cellGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.cellName || g.id}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selectedCellId && !loadingGroups && (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-400 shadow-sm">
          {isDirector ? 'Select a cell group above to begin.' : 'No cell group is linked to your profile.'}
        </div>
      )}

      {/* ── Program Confirmation Sheet ── */}
      {showConfirmSheet && (
        <ProgramConfirmSheet
          title="Today's Cell Program"
          items={segmentOrder.map(s => ({ name: s, detail: segmentDurations[s] ? `${segmentDurations[s]} min` : null }))}
          onConfirm={() => { setShowConfirmSheet(false); startFirstSegment() }}
          onEdit={() => { setShowConfirmSheet(false); onSwitchToPrep?.() }}
        />
      )}

      {/* ── Meeting Controller — primary card. The master button is the page's
          focal point, so it keeps the strongest elevation of any element on
          the page; the card around it gives that focal point a defined,
          premium container instead of floating loose against the page bg. ── */}
      {selectedCellId && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 space-y-5">
          <div className="flex justify-center">
            <motion.button
              type="button"
              onClick={handleMasterTap}
              whileTap={{ scale: 0.96 }}
              className={`${masterBg} ${masterText} w-full rounded-3xl shadow-lg ring-1 ring-black/5 p-12 flex flex-col items-center gap-3 transition-colors select-none`}
            >
              <span className="text-7xl leading-none">{masterIcon}</span>
              <span className="text-4xl font-bold tracking-tight">{masterLabel}</span>
              <span className="text-sm font-medium opacity-60">{masterSub}</span>
              {!isEnded && segmentIdx >= 0 && (
                <div className="flex gap-2 mt-1">
                  {segmentOrder.map((seg, i) => (
                    <div
                      key={seg}
                      className={`rounded-full transition-all ${
                        i < segmentIdx    ? 'w-2 h-2 bg-white/30'
                        : i === segmentIdx ? 'w-3 h-3 bg-white'
                        : 'w-2 h-2 bg-white/15'
                      }`}
                    />
                  ))}
                </div>
              )}
            </motion.button>
          </div>

          {/* ── Live Elapsed Timer — tied directly to the hero's active state ── */}
          {currentSeg && !isEnded && segmentStartedAt && (
            <div className="flex justify-center">
              <LiveElapsedTimer
                startedAtMs={segmentStartedAt}
                plannedMinutes={segmentDurations[currentSeg] || null}
                label={currentSeg}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Save Error ── */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Save Failed</p>
            <p className="text-sm text-red-600 mt-0.5">{saveError}</p>
          </div>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="text-red-400 hover:text-red-600 text-xl leading-none flex-shrink-0"
          >×</button>
        </div>
      )}

      {/* ── Attendance & Visitor Management — secondary cards. Same elevation
          tier (shadow-sm) as each other, one clear step below the Meeting
          Controller's shadow-md, with a larger top margin than the internal
          card rhythm to read as "the next section" rather than more of the
          controller above. ── */}

      {/* ── Attendance Bubbles ── */}
      {selectedCellId && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 mt-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-bold text-slate-900 text-lg">Attendance</h2>
            <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
              {presentIds.size} / {activeMembers.length}
            </span>
          </div>
          {!loadingMembers && activeMembers.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllMembers}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAllMembers}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Clear All
              </button>
            </div>
          )}
          {loadingMembers ? (
            <div className="text-center text-slate-400 py-8 text-sm">Loading members…</div>
          ) : activeMembers.length === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">No active members found.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {activeMembers.map((member) => (
                <MemberBubble
                  key={member.id}
                  member={member}
                  present={presentIds.has(member.id)}
                  onToggle={togglePresent}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Visitor Management ── */}
      {selectedCellId && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">Visitor Management</h2>
            {visitors.length > 0 && (
              <span className="text-sm font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
                {visitors.length} visitor{visitors.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={visitorInput}
              onChange={(e) => setVisitorInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVisitor() } }}
              placeholder="Visitor name"
              className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-300 placeholder-slate-400"
            />
            <button
              type="button"
              onClick={addVisitor}
              disabled={!visitorInput.trim()}
              className="px-4 py-2.5 rounded-2xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40 transition-all"
            >
              + Add
            </button>
          </div>
          {visitors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {visitors.map((v) => (
                <span
                  key={v.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-sm font-medium"
                >
                  {v.name}
                  <button
                    type="button"
                    onClick={() => removeVisitor(v.id)}
                    className="text-teal-400 hover:text-teal-700 leading-none text-base"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Children Attending (River Kids) — populated only via the "Is [Child]
          also attending?" prompt triggered from Attendance above, not manually
          added here (that mirrors how the linkage is meant to work: a child's
          attendance is tied to their parent being marked present). ── */}
      {selectedCellId && childrenAttending.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">Children Attending</h2>
            <span className="text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
              {childrenAttending.length} child{childrenAttending.length > 1 ? 'ren' : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {childrenAttending.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium"
              >
                {c.name}
                {c.parentName && <span className="text-amber-500 font-normal text-xs">· {c.parentName}</span>}
                <button
                  type="button"
                  onClick={() => removeChildAttending(c.id)}
                  className="text-amber-400 hover:text-amber-700 leading-none text-base"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Prayer Points List ── */}
      {selectedCellId && !loadingPrayer && prayerPoints.length > 0 && (
        <PrayerPointsList
          points={prayerPoints}
          currentUserUid={userProfile?.id}
          isDirector={isDirector}
          onRemove={removePrayerPoint}
        />
      )}


      {/* ── Floating Prayer Button ── */}
      {selectedCellId && (
        <FloatingPrayerButton onAdd={addPrayerPoint} />
      )}

      {/* ── End Meeting Confirmation Modal ── */}
      <AnimatePresence>
        {showEndModal && (
          <EndMeetingModal
            timings={pendingTimings}
            presentIds={presentIds}
            members={activeMembers}
            visitors={visitors}
            prayerPoints={prayerPoints}
            onConfirm={confirmEndMeeting}
            onCancel={() => setShowEndModal(false)}
          />
        )}
      </AnimatePresence>

      {/* ── River Kids child-attendance prompt — shown once per parent per session,
          right after they're marked present in Attendance above. ── */}
      <AnimatePresence>
        {childPrompt && (
          <ChildAttendancePrompt
            prompt={childPrompt}
            onToggle={toggleChildPromptCheck}
            onConfirm={confirmChildPrompt}
            onSkip={() => setChildPrompt(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── End Meeting Modal ────────────────────────────────────────────────────────

function EndMeetingModal({ timings, presentIds, members, visitors, prayerPoints, onConfirm, onCancel }) {
  const [localPresent, setLocalPresent] = useState(() => new Set(presentIds))
  const [localTimings, setLocalTimings] = useState(() => timings.map((t) => ({ ...t })))
  const totalMinutes = localTimings.reduce((s, t) => s + (Number(t.durationMinutes) || 0), 0)

  const adjustMinutes = (i, delta) => {
    setLocalTimings((prev) => prev.map((t, j) =>
      j === i ? { ...t, durationMinutes: Math.max(0, (Number(t.durationMinutes) || 0) + delta) } : t
    ))
  }

  const setMinutes = (i, val) => {
    setLocalTimings((prev) => prev.map((t, j) =>
      j === i ? { ...t, durationMinutes: Math.max(0, Number(val) || 0) } : t
    ))
  }

  const toggleMember = (id) => {
    setLocalPresent((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="end-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onCancel}
      />

      {/* Bottom sheet */}
      <motion.div
        key="end-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-6 pt-2 pb-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900">End Meeting?</h2>
          <p className="text-slate-500 text-sm mt-0.5">Review your session before saving to History.</p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Segment Timings */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">⏱ Segment Timings</p>
            {localTimings.length === 0 ? (
              <p className="text-slate-400 text-sm">No timings recorded.</p>
            ) : (
              <div className="space-y-1.5">
                {localTimings.map((t, i) => {
                  const style = SEGMENT_STYLES[t.name] || SEGMENT_STYLES.Prayer
                  return (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-2xl bg-slate-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{style.icon}</span>
                        <span className="font-semibold text-slate-800 text-sm truncate">{t.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={() => adjustMinutes(i, -1)}
                          className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 font-bold text-base leading-none flex items-center justify-center active:bg-slate-300 hover:bg-slate-300"
                        >−</button>
                        <input
                          type="number"
                          min="0"
                          value={t.durationMinutes}
                          onChange={(e) => setMinutes(i, e.target.value)}
                          className="w-12 text-center text-sm font-semibold rounded-lg border border-slate-200 bg-white py-1 px-1 tabular-nums"
                        />
                        <span className="text-xs text-slate-400 w-5">min</span>
                        <button
                          type="button"
                          onClick={() => adjustMinutes(i, 1)}
                          className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 font-bold text-base leading-none flex items-center justify-center active:bg-slate-300 hover:bg-slate-300"
                        >+</button>
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-indigo-50">
                  <span className="font-bold text-indigo-900 text-sm">Total</span>
                  <span className="font-bold text-indigo-900 text-sm">{formatDuration(totalMinutes)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Attendance — interactive bubbles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                👥 Attendance — {localPresent.size} / {members.length} members
                {visitors?.length > 0 && ` · ${visitors.length} visitor${visitors.length > 1 ? 's' : ''}`}
              </p>
              {members.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalPresent(new Set(members.map((m) => m.id)))}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalPresent(new Set())}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>
            {members.length === 0 ? (
              <p className="text-slate-400 text-sm">No members loaded.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {members.map((m) => (
                  <MemberBubble
                    key={m.id}
                    member={m}
                    present={localPresent.has(m.id)}
                    onToggle={toggleMember}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Visitors in modal */}
          {visitors?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">🙋 Visitors — {visitors.length}</p>
              <div className="flex flex-wrap gap-2">
                {visitors.map((v) => (
                  <span key={v.id} className="px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-sm font-medium">
                    {v.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Prayer Points */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              🙏 Prayer Matters — {prayerPoints.length} recorded
            </p>
            {prayerPoints.length === 0 ? (
              <p className="text-slate-400 text-sm">No prayer matters added.</p>
            ) : (
              <div className="space-y-1.5">
                {prayerPoints.map((p, i) => (
                  <div key={p.id || i} className="px-4 py-3 rounded-2xl bg-slate-50">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">{p.name}</span>
                      {p.isDirector && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                          From Director
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600 text-sm">{p.subject}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-5 border-t border-slate-100 flex-shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all"
          >
            Go Back
          </button>
          <motion.button
            type="button"
            onClick={() => onConfirm(localPresent, localTimings)}
            whileTap={{ scale: 0.97 }}
            className="flex-1 py-3.5 rounded-2xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 transition-all shadow-lg shadow-emerald-200"
          >
            ✅ Save & End Meeting
          </motion.button>
        </div>
      </motion.div>
    </>
  )
}

// ─── Child Attendance Prompt (River Kids linkage) ──────────────────────────────
// Small centered confirm card, styled to match ProgramConfirmSheet's convention
// (accent bar, rounded-3xl white card, tap-outside dismisses like "Skip") rather
// than the full bottom-sheet pattern EndMeetingModal uses — this is a quick,
// low-stakes confirmation, not a review step.

function ChildAttendancePrompt({ prompt, onToggle, onConfirm, onSkip }) {
  const { memberName, matches, checked } = prompt
  const single = matches.length === 1

  return (
    <>
      <motion.div
        key="child-prompt-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/55 z-[70] flex items-center justify-center p-4"
        onClick={onSkip}
      >
        <motion.div
          key="child-prompt-card"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-amber-400 mb-4" />
          <p className="text-lg font-bold text-slate-900">
            {single
              ? `Is ${matches[0].name} also attending?`
              : `${memberName}'s children — also attending?`}
          </p>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            {memberName} is registered as a parent in River Kids{single ? '.' : ` of ${matches.length} children.`}
          </p>

          {!single && (
            <div className="space-y-2 mb-5">
              {matches.map((c) => {
                const isChecked = checked.has(c.name)
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => onToggle(c.name)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors ${
                      isChecked ? 'bg-amber-50 border border-amber-200 text-amber-900' : 'bg-slate-50 border border-slate-200 text-slate-500'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isChecked ? 'bg-amber-500 text-white' : 'bg-white border border-slate-300'
                    }`}>
                      {isChecked && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 text-left">{c.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              No / Skip
            </button>
            <motion.button
              type="button"
              onClick={onConfirm}
              whileTap={{ scale: 0.97 }}
              disabled={!single && checked.size === 0}
              className="flex-1 py-3 rounded-2xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-40 transition-colors"
            >
              Yes, Add {single ? '' : `(${checked.size})`}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}

// ─── Member Bubble ────────────────────────────────────────────────────────────

function MemberBubble({ member, present, onToggle }) {
  const initials = getInitials(member.name)

  return (
    <motion.button
      type="button"
      onClick={() => onToggle(member.id)}
      whileTap={{ scale: 0.97 }}
      className={`w-full min-h-[52px] flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors ${
        present
          ? 'bg-emerald-600 text-white shadow-sm'
          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
      }`}
    >
      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
        present ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
      }`}>
        {initials}
      </span>
      <span className="flex-1 text-left leading-tight truncate">{member.name}</span>
      {present && <Check size={18} strokeWidth={3} className="flex-shrink-0" />}
    </motion.button>
  )
}

// ─── Prayer Points List ───────────────────────────────────────────────────────

function PrayerPointsList({ points, currentUserUid, isDirector, onRemove }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
      <h2 className="font-bold text-slate-900 text-lg">Prayer Points</h2>
      <AnimatePresence initial={false}>
        {points.map((point) => {
          const isMine     = point.addedByUid === currentUserUid
          const badgeLabel = point.isDirector ? 'From Director' : isMine ? 'Added by You' : point.addedBy
          return (
            <motion.div
              key={point.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="font-semibold text-slate-900 text-sm">{point.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    point.isDirector ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {badgeLabel}
                  </span>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">{point.subject}</p>
              </div>
              {(isMine || isDirector) && (
                <button
                  type="button"
                  onClick={() => onRemove(point.id)}
                  className="text-slate-300 hover:text-red-400 transition-colors text-xl leading-none flex-shrink-0 mt-0.5"
                  aria-label="Remove"
                >
                  ×
                </button>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// ─── Floating Prayer Button (Framer Motion) ───────────────────────────────────

function FloatingPrayerButton({ onAdd }) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName]         = useState('')
  const [subject, setSubject]   = useState('')
  const [saving, setSaving]     = useState(false)

  const [pos, setPos]   = useState({ x: 24, y: 24 })
  const isDragging      = useRef(false)
  const hasMoved        = useRef(false)
  const startRef        = useRef({})

  const onPointerDown = useCallback((e) => {
    if (expanded) return
    isDragging.current = true
    hasMoved.current   = false
    startRef.current   = { clientX: e.clientX, clientY: e.clientY, px: pos.x, py: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [expanded, pos])

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return
    const dx = e.clientX - startRef.current.clientX
    const dy = e.clientY - startRef.current.clientY
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved.current = true
    setPos({
      x: Math.max(10, startRef.current.px - dx),
      y: Math.max(10, startRef.current.py - dy),
    })
  }, [])

  const onPointerUp = useCallback(() => {
    isDragging.current = false
    if (!hasMoved.current) setExpanded(true)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !subject.trim()) return
    setSaving(true)
    try {
      await onAdd(name, subject)
      setName('')
      setSubject('')
      setExpanded(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="prayer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Slide-up prayer form */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="prayer-form"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl p-6 space-y-4"
          >
            <div className="flex justify-center -mt-2 mb-2">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Add Prayer Point</h3>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
              >×</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Person's name"
                autoFocus
                className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <textarea
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Prayer subject / request…"
                rows={3}
                className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <motion.button
                type="submit"
                disabled={saving || !name.trim() || !subject.trim()}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3.5 rounded-2xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving…' : '🙏 Done'}
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button (draggable) */}
      {!expanded && (
        <motion.button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ bottom: pos.y, right: pos.x }}
          whileTap={{ scale: 0.9 }}
          className="fixed z-40 w-14 h-14 rounded-full bg-slate-900 text-white text-2xl flex items-center justify-center shadow-2xl hover:bg-slate-800 transition-colors cursor-grab active:cursor-grabbing select-none touch-none"
          aria-label="Add prayer point"
        >
          🙏
        </motion.button>
      )}
    </>
  )
}

// ─── Cell Prep Tab ────────────────────────────────────────────────────────────

// Default program template — used when no settings are saved yet
const DEFAULT_PROGRAM = [
  { name: 'Worship',        order: 1, durationMinutes: 20 },
  { name: 'Ice Breaker',    order: 2, durationMinutes: 10 },
  { name: 'Back to Bible',  order: 3, durationMinutes: 30 },
  { name: 'Prayer',         order: 4, durationMinutes: 20 },
]

// Convert "19:00" + accumulated minutes → "7:00 PM"
function toAmPm(timeStr, extraMinutes = 0) {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + (m || 0) + extraMinutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  const ampm = nh >= 12 ? 'PM' : 'AM'
  const h12  = nh > 12 ? nh - 12 : nh === 0 ? 12 : nh
  return `${h12}:${String(nm).padStart(2, '0')} ${ampm}`
}

function CellPrepTab({ userProfile, isDirector, isLeader, reportDate }) {
  const today = reportDate || format(new Date(), 'yyyy-MM-dd')

  const [cellGroups, setCellGroups]         = useState([])
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [loadingGroups, setLoadingGroups]   = useState(true)

  // Program schedule state
  const [programStartTime, setProgramStartTime] = useState('19:00')
  const [programSegments, setProgramSegments]   = useState(DEFAULT_PROGRAM)
  const [savingProgram, setSavingProgram]       = useState(false)
  const [savedProgram, setSavedProgram]         = useState(false)
  const [newSegmentName, setNewSegmentName]     = useState('')
  const [addingSegment, setAddingSegment]       = useState(false)

  // Prayer points
  const [prayerPoints, setPrayerPoints]   = useState([])
  const [loadingPrayer, setLoadingPrayer] = useState(false)
  const [savingPrayer, setSavingPrayer]   = useState(false)
  const [prayerName, setPrayerName]       = useState('')
  const [prayerSubject, setPrayerSubject] = useState('')

  // Back to Bible imported content
  const [b2b, setB2b]           = useState(null)
  const [loadingB2b, setLoadingB2b] = useState(true)
  const [notifyingDirector, setNotifyingDirector] = useState(false)
  const [notifiedDirector, setNotifiedDirector]   = useState(false)

  useEffect(() => {
    getCellGroups('Cell').then(setCellGroups).finally(() => setLoadingGroups(false))
  }, [])

  useEffect(() => {
    if (!cellGroups.length || !userProfile) return
    if (isDirector && !isLeader) return
    const fromProfile = String(userProfile.cellGroupId || userProfile.cellId || '').trim()
    if (fromProfile) {
      const hit = cellGroups.find((g) => g.id === fromProfile || g.cellId === fromProfile)
      if (hit) { setSelectedCellId(hit.id); return }
    }
    const nameMatch = cellGroups.find(
      (g) => String(g.cellName || '').toLowerCase() === String(userProfile.cellGroup || '').toLowerCase()
    )
    if (nameMatch) setSelectedCellId(nameMatch.id)
  }, [cellGroups, userProfile, isDirector, isLeader])

  // Load saved settings + prayer points when cell changes
  useEffect(() => {
    if (!selectedCellId) return

    getMidweekSettings(selectedCellId).then((s) => {
      if (s?.segmentDetails?.length) {
        // Restore saved program details
        setProgramSegments(s.segmentDetails)
        if (s.programStartTime) setProgramStartTime(s.programStartTime)
      } else if (s?.segmentOrder?.length) {
        // Migrate from old segmentOrder-only format
        setProgramSegments(
          s.segmentOrder.map((name, i) => ({ name, order: i + 1, durationMinutes: 20 }))
        )
      } else {
        setProgramSegments(DEFAULT_PROGRAM)
      }
    })

    setLoadingPrayer(true)
    getMidweekPrayerPoints(selectedCellId, today)
      .then(setPrayerPoints)
      .finally(() => setLoadingPrayer(false))
  }, [selectedCellId, today])

  const loadB2b = useCallback(() => {
    setLoadingB2b(true)
    getActiveBackToBibleForDate(today).then(setB2b).finally(() => setLoadingB2b(false))
  }, [today])

  useEffect(() => { loadB2b() }, [loadB2b])

  const handleNotifyDirector = async () => {
    if (!selectedCellId) return
    setNotifyingDirector(true)
    try {
      const cellName = cellGroups.find((g) => g.id === selectedCellId)?.cellName || 'this cell'
      await createTask({
        taskTitle: `Post Back to Bible content — ${cellName}`,
        department: 'Cell',
        assignedPerson: '',
        priority: 'Medium',
        deadline: '',
        status: 'Pending',
        notes: `No Back to Bible study has been shared yet for the week of ${today}. Requested by ${userProfile?.name || userProfile?.email || 'a cell leader'} via Mid-week Ministry.`,
        createdBy: userProfile?.email || '',
        // Identity + action-kind pair the To-Do List dedupes on (ToDoListCard.jsx) —
        // scoped per cell per week so next week's reminder isn't merged with this one.
        personId: selectedCellId,
        taskType: `backToBibleReminder:${today}`,
        // Function is literally "notify Director" — this was never meant to also land
        // on every other Cell Leader's To-Do list (ToDoListCard.jsx).
        visibleToRole: 'DIRECTOR',
      })
      setNotifiedDirector(true)
      setTimeout(() => setNotifiedDirector(false), 5000)
    } finally {
      setNotifyingDirector(false)
    }
  }

  // Segments sorted by their current order number
  const sortedSegments = useMemo(
    () => [...programSegments].sort((a, b) => a.order - b.order),
    [programSegments]
  )

  // Total duration
  const totalMinutes = useMemo(
    () => sortedSegments.reduce((s, seg) => s + (Number(seg.durationMinutes) || 0), 0),
    [sortedSegments]
  )

  const updateSegment = (name, field, value) => {
    setProgramSegments((prev) =>
      prev.map((s) => s.name === name ? { ...s, [field]: field === 'durationMinutes' ? Number(value) || 0 : Number(value) || 1 } : s)
    )
    setSavedProgram(false)
  }

  const addSegment = () => {
    const name = newSegmentName.trim()
    if (!name) return
    if (programSegments.some((s) => s.name.toLowerCase() === name.toLowerCase())) return
    const nextOrder = programSegments.length + 1
    setProgramSegments((prev) => [...prev, { name, order: nextOrder, durationMinutes: 20 }])
    setNewSegmentName('')
    setAddingSegment(false)
    setSavedProgram(false)
  }

  const removeSegment = (name) => {
    setProgramSegments((prev) => {
      const filtered = prev.filter((s) => s.name !== name)
      return filtered.map((s, i) => ({ ...s, order: i + 1 }))
    })
    setSavedProgram(false)
  }

  const addPrayerPoint = async () => {
    const name = prayerName.trim()
    const subject = prayerSubject.trim()
    if (!name || !subject || !selectedCellId) return
    setSavingPrayer(true)
    try {
      const newPoint = {
        id: Date.now().toString(),
        name,
        subject,
        addedBy: userProfile?.name || userProfile?.email || 'Unknown',
        addedByUid: userProfile?.id || '',
        isDirector: isDirector,
        createdAt: new Date().toISOString(),
      }
      const updated = [...prayerPoints, newPoint]
      setPrayerPoints(updated)
      await saveMidweekPrayerPoints(selectedCellId, today, updated, userProfile?.name || 'unknown')
      setPrayerName('')
      setPrayerSubject('')
    } finally {
      setSavingPrayer(false)
    }
  }

  const removePrayerPoint = async (pointId) => {
    if (!selectedCellId) return
    const updated = prayerPoints.filter((p) => p.id !== pointId)
    setPrayerPoints(updated)
    await saveMidweekPrayerPoints(selectedCellId, today, updated, userProfile?.name || 'unknown')
  }

  const handleSaveProgram = async () => {
    if (!selectedCellId) return
    setSavingProgram(true)
    try {
      const derivedOrder = sortedSegments.map((s) => s.name)
      await setMidweekSettings(
        selectedCellId,
        derivedOrder,
        userProfile?.name || 'unknown',
        { programStartTime, segmentDetails: sortedSegments }
      )
      setSavedProgram(true)
      setTimeout(() => setSavedProgram(false), 3000)
    } finally {
      setSavingProgram(false)
    }
  }

  const canEdit = selectedCellId && (isDirector || isLeader)

  // Accumulated start time offset for each row
  const getOffset = (idx) =>
    sortedSegments.slice(0, idx).reduce((s, seg) => s + (Number(seg.durationMinutes) || 0), 0)

  return (
    <div className="space-y-5">

      {/* Cell selector — Directors only */}
      {isDirector && (
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Cell Group</label>
          {loadingGroups ? <span className="text-slate-400 text-sm">Loading…</span> : (
            <select value={selectedCellId || ''} onChange={(e) => setSelectedCellId(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-sm flex-1">
              <option value="">— select cell —</option>
              {cellGroups.map((g) => <option key={g.id} value={g.id}>{g.cellName || g.id}</option>)}
            </select>
          )}
        </div>
      )}

      {/* ── Inline Program Table ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-slate-900">Schedule</h2>
            <p className="text-slate-500 text-xs mt-0.5">
              {programStartTime ? `Starts ${toAmPm(programStartTime, 0)}` : 'No start time set'} · {sortedSegments.length} segment{sortedSegments.length !== 1 ? 's' : ''} · {totalMinutes} min
            </p>
          </div>
          {savedProgram && (
            <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-semibold shrink-0">✓ Saved</span>
          )}
        </div>

        {/* Meeting start time */}
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
          <span className="text-lg">🕐</span>
          <label className="text-sm font-semibold text-slate-700 flex-1">Program starts at</label>
          <input
            type="time"
            value={programStartTime}
            onChange={(e) => { setProgramStartTime(e.target.value); setSavedProgram(false) }}
            disabled={!canEdit}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
          />
        </div>

        {/* Column headers — grid template mirrors the row template exactly below,
            so the two stay aligned; widened Duration/Time Window columns are what
            actually fix the clustered "8:15 PM - 8:17 PM" wrapping. */}
        <div className="grid grid-cols-[36px_1fr_110px_190px_40px] gap-3 px-2">
          <span className="text-xs font-bold text-slate-400 text-center">#</span>
          <span className="text-xs font-bold text-slate-400">Segment</span>
          <span className="text-xs font-bold text-slate-400 text-center">Duration</span>
          <span className="text-xs font-bold text-slate-400 text-center">Time Window</span>
          <span className="text-xs font-bold text-slate-400 text-center">Actions</span>
        </div>

        {/* Segment rows — each its own card: generous padding, clear column
            separation, no cramped wrapping on the time-window text. */}
        <div className="space-y-3">
          {sortedSegments.map((seg, idx) => {
            const style        = SEGMENT_STYLES[seg.name] || SEGMENT_STYLES.Prayer
            const startOffset  = getOffset(idx)
            const endOffset    = startOffset + (Number(seg.durationMinutes) || 0)
            const timeLabel    = programStartTime
              ? `${toAmPm(programStartTime, startOffset)} – ${toAmPm(programStartTime, endOffset)}`
              : '—'

            return (
              <div
                key={seg.name}
                className="grid grid-cols-[36px_1fr_110px_190px_40px] gap-3 items-center bg-slate-50 rounded-2xl px-4 py-3.5 border border-slate-100 shadow-sm"
              >
                {/* Order number input */}
                <input
                  type="number"
                  min={1}
                  max={programSegments.length}
                  value={seg.order}
                  onChange={(e) => updateSegment(seg.name, 'order', e.target.value)}
                  disabled={!canEdit}
                  className="w-9 px-1 py-1.5 rounded-lg border border-slate-300 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 bg-white"
                />

                {/* Segment name + icon */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-base flex-shrink-0">
                    {style.icon}
                  </span>
                  <span className="font-semibold text-slate-800 text-sm truncate">{seg.name}</span>
                </div>

                {/* Duration input */}
                <div className="flex items-center gap-1.5 justify-center">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={seg.durationMinutes}
                    onChange={(e) => updateSegment(seg.name, 'durationMinutes', e.target.value)}
                    disabled={!canEdit}
                    className="w-14 px-2 py-1.5 rounded-lg border border-slate-300 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 bg-white"
                  />
                  <span className="text-xs text-slate-500">min</span>
                </div>

                {/* Calculated time window — fixed-width column + whitespace-nowrap
                    is what stops "8:15 PM - 8:17 PM" from wrapping/overlapping. */}
                <span className="text-xs text-indigo-600 font-semibold text-center whitespace-nowrap">
                  {timeLabel}
                </span>

                {/* Remove button */}
                <div className="flex justify-center">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeSegment(seg.name)}
                      className="w-7 h-7 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors text-lg leading-none"
                      aria-label={`Remove ${seg.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Add Segment */}
        {canEdit && (
          addingSegment ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={newSegmentName}
                onChange={(e) => setNewSegmentName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSegment(); if (e.key === 'Escape') { setAddingSegment(false); setNewSegmentName('') } }}
                placeholder="Segment name…"
                autoFocus
                className="flex-1 px-3 py-2 rounded-xl border border-indigo-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button type="button" onClick={addSegment} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Add</button>
              <button type="button" onClick={() => { setAddingSegment(false); setNewSegmentName('') }} className="px-3 py-2 rounded-xl border border-slate-300 text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingSegment(true)}
              className="w-full py-2.5 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm font-medium hover:border-indigo-400 hover:text-indigo-600 transition"
            >
              + Add Segment
            </button>
          )
        )}

        {/* Summary row */}
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-sm text-slate-500">
            Total · <span className="font-semibold text-slate-700">{totalMinutes} min</span>
          </span>
          {programStartTime && (
            <span className="text-sm text-indigo-600 font-semibold">
              Ends {toAmPm(programStartTime, totalMinutes)}
            </span>
          )}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleSaveProgram}
            disabled={savingProgram}
            className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {savingProgram ? 'Saving…' : '💾 Save Program'}
          </button>
        )}
      </div>

      {/* ── Prayer Points ── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
        <div>
          <h2 className="font-bold text-slate-900">🙏 Prayer Points</h2>
          <p className="text-slate-500 text-xs mt-0.5">Prayer matters for today's cell meeting</p>
        </div>

        {!selectedCellId ? (
          <p className="text-slate-400 text-sm">Select a cell group to view prayer points.</p>
        ) : loadingPrayer ? (
          <div className="text-center text-slate-400 py-4 text-sm">Loading…</div>
        ) : (
          <>
            {prayerPoints.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-3xl mb-2">🙏</p>
                <p className="text-slate-400 text-sm">No prayer points recorded yet for today.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {prayerPoints.map((p, i) => (
                  <div key={p.id || i} className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="font-semibold text-slate-900 text-sm">{p.name}</p>
                        {p.isDirector && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">From Director</span>
                        )}
                      </div>
                      <p className="text-slate-600 text-sm leading-relaxed">{p.subject}</p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removePrayerPoint(p.id)}
                        className="text-slate-300 hover:text-red-400 transition text-lg leading-none flex-shrink-0 mt-0.5"
                        aria-label="Remove prayer point"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
              <div className="space-y-2 pt-1">
                <input
                  type="text"
                  value={prayerName}
                  onChange={(e) => setPrayerName(e.target.value)}
                  placeholder="Person / matter name…"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <input
                  type="text"
                  value={prayerSubject}
                  onChange={(e) => setPrayerSubject(e.target.value)}
                  placeholder="Prayer request / subject…"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  type="button"
                  onClick={addPrayerPoint}
                  disabled={savingPrayer || !prayerName.trim() || !prayerSubject.trim()}
                  className="w-full py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {savingPrayer ? 'Saving…' : '🙏 Add Prayer Point'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Back to Bible (imported from Director) ── */}
      <div className="bg-white rounded-3xl border border-indigo-100 p-5 shadow-sm space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h2 className="font-bold text-slate-900">📖 Back to Bible</h2>
            <p className="text-slate-500 text-xs mt-0.5">Imported from Director · Read-only</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium flex-shrink-0">Imported</span>
        </div>

        {loadingB2b ? (
          <div className="text-center text-slate-400 py-4 text-sm">Loading…</div>
        ) : !b2b ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-3xl mb-1">📭</p>
            <p className="text-slate-400 text-sm">No study has been shared for this week.</p>
            {notifiedDirector && (
              <p className="inline-block text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                ✓ Director notified
              </p>
            )}
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleNotifyDirector}
                disabled={notifyingDirector || !selectedCellId}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {notifyingDirector ? 'Notifying…' : 'Notify Director'}
              </button>
              <button
                type="button"
                onClick={loadB2b}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-100">
              <p className="font-semibold text-indigo-900 text-sm">{b2b.title || 'This Week'}</p>
              {b2b.passage && <p className="text-indigo-700 text-xs mt-1">📖 {b2b.passage}</p>}
              {b2b.fromDate && <p className="text-indigo-400 text-xs mt-0.5">{b2b.fromDate} – {b2b.toDate}</p>}
            </div>
            {SHEPHERD_FIELDS.map(({ key, label }) =>
              b2b[key] ? (
                <div key={key} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">{label}</p>
                  <p className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">{b2b[key]}</p>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  )
}

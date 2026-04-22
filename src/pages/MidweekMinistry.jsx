import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import DepartmentTabBar from '../components/DepartmentTabBar'
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
  saveMidweekShepherdNotes,
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

export default function MidweekMinistry() {
  const { userProfile } = useAuth()
  const [subTab, setSubTab] = useState('live')

  const isDirector = useMemo(() => isCellDirectorInPositions(userProfile), [userProfile])
  const isLeader   = useMemo(() => isCellLeaderInPositions(userProfile),   [userProfile])
  const isFounder  = userProfile?.globalRole === 'FOUNDER' || userProfile?.role === ROLES.FOUNDER

  const { viewAsRole, capabilities } = useViewAs()
  const isSimulating        = isFounder && viewAsRole !== 'founder'
  const effectiveIsDirector = isSimulating ? (viewAsRole === 'director') : (isDirector || isFounder)
  const effectiveIsLeader   = isSimulating ? (viewAsRole === 'leader')   : isLeader
  const canUseLive          = isSimulating ? capabilities.canUseLiveControl : true

  return (
    <div className="min-h-screen bg-slate-50">
      <DepartmentTabBar slug="cell" activeTab="midweek" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mid-week Ministry</h1>
          <p className="text-slate-500 text-sm mt-0.5">Live cell meeting tools</p>
        </div>

        {isFounder && viewAsRole !== 'founder' && (
          <div className="px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
            👁 Simulating <strong>{viewAsRole}</strong> view — {capabilities.label}
          </div>
        )}

        {/* Sub-tab strip */}
        <div className="flex gap-1 bg-slate-100 rounded-2xl p-1">
          {[
            { key: 'live', label: '⚡ Live Control' },
            { key: 'prep', label: '📋 Cell Prep' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                subTab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {subTab === 'live' && (
          canUseLive ? (
            <LiveControlTab
              userProfile={userProfile}
              isDirector={effectiveIsDirector}
              isLeader={effectiveIsLeader}
            />
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-slate-400 shadow-sm">
              <p className="text-4xl mb-3">🔒</p>
              <p className="font-medium text-slate-500">Live Control is not available for this role.</p>
              <p className="text-sm mt-1">Switch to Director or Leader view to access it.</p>
            </div>
          )
        )}
        {subTab === 'prep' && (
          <CellPrepTab
            userProfile={userProfile}
            isDirector={effectiveIsDirector}
            isLeader={effectiveIsLeader}
          />
        )}
      </div>
    </div>
  )
}

// ─── Live Control Tab ─────────────────────────────────────────────────────────

function LiveControlTab({ userProfile, isDirector, isLeader }) {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [cellGroups, setCellGroups]         = useState([])
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [members, setMembers]               = useState([])
  const [loadingGroups, setLoadingGroups]   = useState(true)
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Session state
  const [segmentOrder, setSegmentOrder] = useState(DEFAULT_SEGMENTS)
  const [segmentIdx, setSegmentIdx]     = useState(-1)
  const [presentIds, setPresentIds]     = useState(new Set())

  // Timing tracking
  const segmentStartTime  = useRef(null)
  const segmentTimingsRef = useRef([])

  // End-meeting confirmation modal
  const [showEndModal, setShowEndModal]     = useState(false)
  const [pendingTimings, setPendingTimings] = useState([])

  // Shepherd notes
  const [shepherdNotes, setShepherdNotes] = useState('')
  const [savingNotes, setSavingNotes]     = useState(false)
  const [savedNotes, setSavedNotes]       = useState(false)

  // Prayer state
  const [prayerPoints, setPrayerPoints]   = useState([])
  const [loadingPrayer, setLoadingPrayer] = useState(false)

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
    })

    setLoadingPrayer(true)
    getMidweekPrayerPoints(selectedCellId, today)
      .then(setPrayerPoints)
      .finally(() => setLoadingPrayer(false))
  }, [selectedCellId, today])

  const activeMembers = useMemo(() => members.filter((m) => m.status !== 'inactive'), [members])

  const togglePresent = useCallback((id) => {
    setPresentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Segment state machine
  const isEnded    = segmentIdx >= segmentOrder.length
  const currentSeg = !isEnded && segmentIdx >= 0 ? segmentOrder[segmentIdx] : null
  const nextSeg    = !isEnded && segmentIdx >= 0 && segmentIdx < segmentOrder.length - 1 ? segmentOrder[segmentIdx + 1] : null
  const segStyle   = currentSeg ? (SEGMENT_STYLES[currentSeg] || SEGMENT_STYLES.Prayer) : null

  const handleMasterTap = () => {
    const now = Date.now()

    if (isEnded) {
      // Reset everything
      setSegmentIdx(-1)
      setPresentIds(new Set())
      segmentStartTime.current  = null
      segmentTimingsRef.current = []
      setPendingTimings([])
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
    } else {
      // Advance to next segment
      segmentTimingsRef.current = updatedTimings
      segmentStartTime.current  = now
      setSegmentIdx(nextIdx)
    }

    // When starting from idle, record start time for first segment
    if (segmentIdx === -1) {
      segmentStartTime.current  = now
      segmentTimingsRef.current = []
    }
  }

  const confirmEndMeeting = useCallback(async () => {
    segmentTimingsRef.current = pendingTimings
    setShowEndModal(false)
    setSegmentIdx(segmentOrder.length)   // isEnded = true
    if (selectedCellId) {
      saveMidweekSessionSummary(selectedCellId, today, {
        segmentTimings: pendingTimings,
        presentIds: Array.from(presentIds),
        updatedBy: userProfile?.name || userProfile?.email || 'unknown',
      }).catch(() => {})
    }
  }, [pendingTimings, selectedCellId, today, presentIds, userProfile, segmentOrder.length])

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
    <div className="space-y-5 pb-24">

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

      {/* ── Master Button ── */}
      {selectedCellId && (
        <div className="flex justify-center">
          <motion.button
            type="button"
            onClick={handleMasterTap}
            whileTap={{ scale: 0.96 }}
            className={`${masterBg} ${masterText} w-full rounded-3xl shadow-2xl p-10 flex flex-col items-center gap-3 transition-colors select-none`}
          >
            <span className="text-6xl leading-none">{masterIcon}</span>
            <span className="text-3xl font-bold tracking-tight">{masterLabel}</span>
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
      )}

      {/* ── Attendance Bubbles ── */}
      {selectedCellId && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-slate-900 text-lg">Attendance</h2>
            <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
              {presentIds.size} / {activeMembers.length}
            </span>
          </div>
          {loadingMembers ? (
            <div className="text-center text-slate-400 py-8 text-sm">Loading members…</div>
          ) : activeMembers.length === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">No active members found.</div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-4">
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

      {/* ── Prayer Points List ── */}
      {selectedCellId && !loadingPrayer && prayerPoints.length > 0 && (
        <PrayerPointsList
          points={prayerPoints}
          currentUserUid={userProfile?.id}
          isDirector={isDirector}
          onRemove={removePrayerPoint}
        />
      )}

      {/* ── Shepherd Notes ── */}
      {selectedCellId && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">Shepherd Notes</h2>
            {savedNotes && (
              <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-semibold">✓ Saved</span>
            )}
          </div>
          <textarea
            value={shepherdNotes}
            onChange={(e) => { setShepherdNotes(e.target.value); setSavedNotes(false) }}
            placeholder="Private notes for this meeting (follow-ups, concerns, prayer requests…)"
            rows={4}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-300 text-slate-800 placeholder-slate-400 bg-slate-50"
          />
          <button
            type="button"
            disabled={savingNotes || !shepherdNotes.trim()}
            onClick={async () => {
              if (!selectedCellId) return
              setSavingNotes(true)
              try {
                await saveMidweekShepherdNotes(selectedCellId, today, shepherdNotes, userProfile?.name || 'unknown')
                setSavedNotes(true)
                setTimeout(() => setSavedNotes(false), 3000)
              } finally {
                setSavingNotes(false)
              }
            }}
            className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 transition-all active:scale-[0.98]"
          >
            {savingNotes ? 'Saving…' : '💾 Save Notes'}
          </button>
        </div>
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
            prayerPoints={prayerPoints}
            onConfirm={confirmEndMeeting}
            onCancel={() => setShowEndModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── End Meeting Modal ────────────────────────────────────────────────────────

function EndMeetingModal({ timings, presentIds, members, prayerPoints, onConfirm, onCancel }) {
  const presentMembers = members.filter((m) => presentIds.has(m.id))
  const totalMinutes   = timings.reduce((s, t) => s + (Number(t.durationMinutes) || 0), 0)

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
            {timings.length === 0 ? (
              <p className="text-slate-400 text-sm">No timings recorded.</p>
            ) : (
              <div className="space-y-1.5">
                {timings.map((t, i) => {
                  const style = SEGMENT_STYLES[t.name] || SEGMENT_STYLES.Prayer
                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span>{style.icon}</span>
                        <span className="font-semibold text-slate-800 text-sm">{t.name}</span>
                      </div>
                      <span className="text-sm text-slate-500 font-medium">{formatDuration(t.durationMinutes)}</span>
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

          {/* Attendance */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              👥 Attendance — {presentIds.size} present
            </p>
            {presentMembers.length === 0 ? (
              <p className="text-slate-400 text-sm">No one marked present.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {presentMembers.map((m) => (
                  <span
                    key={m.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 text-sm font-medium"
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-400/30 text-emerald-900 text-xs font-bold flex items-center justify-center">
                      {getInitials(m.name).slice(0, 1)}
                    </span>
                    {(m.name || '').split(' ')[0]}
                  </span>
                ))}
              </div>
            )}
          </div>

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
            onClick={onConfirm}
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

// ─── Member Bubble ────────────────────────────────────────────────────────────

function MemberBubble({ member, present, onToggle }) {
  const initials  = getInitials(member.name)
  const firstName = (member.name || '').split(' ')[0]

  return (
    <motion.button
      type="button"
      onClick={() => onToggle(member.id)}
      whileTap={{ scale: 0.88 }}
      className="flex flex-col items-center gap-1.5 group"
    >
      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-150 ${
        present
          ? 'bg-emerald-500 text-white ring-4 ring-emerald-200 shadow-lg shadow-emerald-100 scale-110'
          : 'bg-slate-100 text-slate-500 group-active:bg-slate-200'
      }`}>
        {initials}
      </div>
      <span className={`text-xs text-center leading-tight max-w-[56px] truncate font-medium transition-colors ${
        present ? 'text-emerald-700' : 'text-slate-500'
      }`}>
        {firstName}
      </span>
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

function CellPrepTab({ userProfile, isDirector, isLeader }) {
  const today = format(new Date(), 'yyyy-MM-dd')

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

  useEffect(() => {
    setLoadingB2b(true)
    getActiveBackToBibleForDate(today).then(setB2b).finally(() => setLoadingB2b(false))
  }, [today])

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

      {/* ── Set Default Program ── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Set Default Program</h2>
            <p className="text-slate-500 text-xs mt-0.5">Enter start time and duration for each segment</p>
          </div>
          {savedProgram && (
            <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-semibold">✓ Saved</span>
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

        {/* Column headers */}
        <div className="grid grid-cols-[36px_1fr_90px_96px] gap-2 px-1">
          <span className="text-xs font-bold text-slate-400 text-center">#</span>
          <span className="text-xs font-bold text-slate-400">Segment</span>
          <span className="text-xs font-bold text-slate-400 text-center">Duration</span>
          <span className="text-xs font-bold text-slate-400 text-center">Time</span>
        </div>

        {/* Segment rows */}
        <div className="space-y-2">
          {sortedSegments.map((seg, idx) => {
            const style        = SEGMENT_STYLES[seg.name] || SEGMENT_STYLES.Prayer
            const startOffset  = getOffset(idx)
            const endOffset    = startOffset + (Number(seg.durationMinutes) || 0)
            const timeLabel    = programStartTime
              ? `${toAmPm(programStartTime, startOffset)}–${toAmPm(programStartTime, endOffset)}`
              : '—'

            return (
              <div
                key={seg.name}
                className="grid grid-cols-[36px_1fr_90px_80px_28px] gap-2 items-center bg-slate-50 rounded-2xl px-3 py-3 border border-slate-100"
              >
                {/* Order number input */}
                <input
                  type="number"
                  min={1}
                  max={programSegments.length}
                  value={seg.order}
                  onChange={(e) => updateSegment(seg.name, 'order', e.target.value)}
                  disabled={!canEdit}
                  className="w-9 px-1 py-1 rounded-lg border border-slate-300 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 bg-white"
                />

                {/* Segment name + icon */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base flex-shrink-0">{style.icon}</span>
                  <span className="font-semibold text-slate-800 text-sm truncate">{seg.name}</span>
                </div>

                {/* Duration input */}
                <div className="flex items-center gap-1 justify-center">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={seg.durationMinutes}
                    onChange={(e) => updateSegment(seg.name, 'durationMinutes', e.target.value)}
                    disabled={!canEdit}
                    className="w-14 px-2 py-1 rounded-lg border border-slate-300 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 bg-white"
                  />
                  <span className="text-xs text-slate-400">m</span>
                </div>

                {/* Calculated time */}
                <span className="text-xs text-indigo-600 font-semibold text-center leading-tight">{timeLabel}</span>

                {/* Remove button */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeSegment(seg.name)}
                    className="text-slate-300 hover:text-red-400 transition text-lg leading-none"
                    aria-label={`Remove ${seg.name}`}
                  >
                    ×
                  </button>
                )}
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
          <div className="text-center py-6">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-slate-400 text-sm">Director hasn't posted content for this week yet.</p>
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

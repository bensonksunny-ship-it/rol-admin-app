import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { formatDisplayDate } from '../../utils/date'
import {
  getCellGroupMembers,
  getCellReportByCellAndDate,
  getCellReportAttendees,
  getMidweekSessionData,
  updateCellReportFull,
} from '../../services/firestore'

const TABS = ['Attendance', 'Timing', 'Counts']

/**
 * Bottom sheet for editing an existing cell meeting report or creating a new manual entry.
 *
 * Props:
 *   row         – history/live row { cellId, cellName, meetingDateISO, membersAttended, visitors, children, meetingDurationMinutes, programList }
 *   isNew       – true = New Entry mode (empty form, no existing session)
 *   cellGroups  – array of cell groups (for director new-entry cell selector)
 *   linkedCellId – pre-selected cell for cell leaders
 *   isDirector  – boolean
 *   onClose     – () => void
 *   onSaved     – (updatedRow) => void
 */
export default function EditReportSheet({ row, isNew = false, cellGroups = [], linkedCellId = null, isDirector = false, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('Attendance')

  // Form state
  const [attendees, setAttendees]           = useState([])
  const [segmentTimings, setSegmentTimings] = useState([])
  const [visitors, setVisitors]             = useState(0)
  const [children, setChildren]             = useState(0)
  const [meetingDate, setMeetingDate]       = useState(isNew ? '' : (row?.meetingDateISO || ''))
  const [newCellId, setNewCellId]           = useState(isNew ? (linkedCellId || '') : '')

  // Member list
  const [allMembers, setAllMembers] = useState([])

  // UI
  const [loading, setLoading]     = useState(!isNew)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState(null)

  const effectiveCellId = isNew ? newCellId : row?.cellId

  // Load existing data (edit mode only)
  useEffect(() => {
    if (isNew) return
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const [sessionData, existingAttendees] = await Promise.all([
          getMidweekSessionData(row.cellId, row.meetingDateISO),
          (async () => {
            const report = await getCellReportByCellAndDate(row.cellId, row.meetingDateISO)
            return report ? getCellReportAttendees(report.id) : []
          })(),
        ])
        if (!alive) return
        setVisitors(row.visitors || 0)
        setChildren(row.children || 0)
        setAttendees(existingAttendees.map((a) => ({
          id: a.id,
          memberId: a.memberId,
          name: a.name,
          birthday: a.birthday,
          anniversary: a.anniversary,
          phone: a.phone,
          locality: a.locality,
        })))
        if (sessionData) {
          setSegmentTimings(
            Array.isArray(sessionData.segmentTimings)
              ? sessionData.segmentTimings.map((s) => ({ name: s.name || '', durationMinutes: Number(s.durationMinutes) || 0 }))
              : []
          )
        } else if (row.programList?.length) {
          setSegmentTimings(row.programList.map((p) => ({ name: p.programName || '', durationMinutes: Number(p.durationMinutes) || 0 })))
        }
      } catch {
        // non-fatal — user can still edit
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [row, isNew])

  // Load all members for attendance search (whenever effective cell is known)
  useEffect(() => {
    if (!effectiveCellId) return
    getCellGroupMembers(effectiveCellId)
      .then((ms) => setAllMembers(ms.filter((m) => m.status !== 'inactive')))
      .catch(() => setAllMembers([]))
  }, [effectiveCellId])

  const totalDurationMinutes = useMemo(
    () => segmentTimings.reduce((s, t) => s + (Number(t.durationMinutes) || 0), 0),
    [segmentTimings]
  )

  function addAttendee(member) {
    setAttendees((prev) => {
      const alreadyPresent = prev.some(
        (a) => String(a.name || '').trim().toLowerCase() === member.name.trim().toLowerCase()
      )
      if (alreadyPresent) return prev
      return [...prev, { memberId: member.id, name: member.name, birthday: member.birthday || '', anniversary: member.anniversary || '', phone: member.phone || '', locality: member.locality || '' }]
    })
    setMemberSearch('')
  }

  function removeAttendee(index) {
    setAttendees((prev) => prev.filter((_, i) => i !== index))
  }

  function addSegment() {
    setSegmentTimings((prev) => [...prev, { name: '', durationMinutes: 0 }])
  }

  function updateSegment(index, field, value) {
    setSegmentTimings((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, [field]: field === 'durationMinutes' ? Number(value) || 0 : value } : s
      )
    )
  }

  function removeSegment(index) {
    setSegmentTimings((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    const cellId = isNew ? newCellId : row?.cellId
    const dateISO = isNew ? meetingDate : row?.meetingDateISO
    if (!cellId || !dateISO) { setSaveError('Cell and date are required.'); return }

    setSaving(true)
    setSaveError(null)
    try {
      const cellGroup = cellGroups.find((g) => g.id === cellId)
      const cellName = isNew ? (cellGroup?.cellName || '') : (row?.cellName || '')
      const effectiveRow = { cellId, cellName, meetingDateISO: dateISO, meetingDay: row?.meetingDay || '' }

      const result = await updateCellReportFull(effectiveRow, {
        attendees,
        segmentTimings,
        shepherdNotes: '',
        visitors: Number(visitors) || 0,
        children: Number(children) || 0,
        updatedBy: 'user',
      })

      onSaved({
        ...(row || {}),
        cellId,
        cellName,
        meetingDateISO: dateISO,
        ...result,
        totalAttendance: result.membersAttended + result.visitors + result.children,
      })
      onClose()
    } catch {
      setSaveError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const title = isNew ? 'New Entry' : `Edit Report — ${formatDisplayDate(row?.meetingDateISO)}`

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="edit-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <motion.div
        key="edit-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="px-6 pt-2 pb-3 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>

          {/* New Entry — date + cell pickers */}
          {isNew && (
            <div className="mt-3 space-y-2">
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {isDirector && (
                <select
                  value={newCellId}
                  onChange={(e) => setNewCellId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">Select cell group…</option>
                  {cellGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.cellName}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 mt-3 bg-slate-100 rounded-xl p-1">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all ${
                  activeTab === tab ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-slate-400 text-sm text-center py-8">Loading…</div>
          ) : (
            <>
              {activeTab === 'Attendance' && (
                <AttendanceTab
                  attendees={attendees}
                  allMembers={allMembers}
                  onAdd={addAttendee}
                  onRemove={removeAttendee}
                />
              )}
              {activeTab === 'Timing' && (
                <TimingTab
                  segments={segmentTimings}
                  totalMinutes={totalDurationMinutes}
                  onAdd={addSegment}
                  onUpdate={updateSegment}
                  onRemove={removeSegment}
                />
              )}
              {activeTab === 'Counts' && (
                <CountsTab
                  membersAttended={attendees.length}
                  visitors={visitors}
                  children={children}
                  onVisitorsChange={setVisitors}
                  onChildrenChange={setChildren}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 space-y-2">
          {saveError && (
            <p className="text-red-500 text-xs text-center">{saveError}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <motion.button
              type="button"
              onClick={handleSave}
              disabled={saving}
              whileTap={{ scale: 0.97 }}
              className="flex-1 py-3.5 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

// ── Tab sub-components ────────────────────────────────────────────────────────

function AttendanceTab({ attendees, allMembers, onAdd, onRemove }) {
  const [search, setSearch] = useState('')

  const presentSet = new Set(attendees.map((a) => String(a.name || '').trim().toLowerCase()))

  const filtered = allMembers.filter(
    (m) => !search.trim() || m.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  const toggle = (member) => {
    const key = member.name.trim().toLowerCase()
    if (presentSet.has(key)) {
      const idx = attendees.findIndex((a) => String(a.name || '').trim().toLowerCase() === key)
      if (idx !== -1) onRemove(idx)
    } else {
      onAdd(member)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        👥 Members Attended — {attendees.length}
      </p>

      {allMembers.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No cell members found.</p>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members…"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <div className="space-y-1.5">
            {filtered.map((m) => {
              const present = presentSet.has(m.name.trim().toLowerCase())
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                    present
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${
                    present ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300'
                  }`}>
                    {present ? '✓' : ''}
                  </span>
                  <span className="text-sm font-medium text-left flex-1">{m.name}</span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No members match "{search}"</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function TimingTab({ segments, totalMinutes, onAdd, onUpdate, onRemove }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">⏱ Segment Timings</p>

      {segments.map((seg, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={seg.name}
            onChange={(e) => onUpdate(i, 'name', e.target.value)}
            placeholder="Segment name"
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <input
            type="number"
            min="0"
            value={seg.durationMinutes}
            onChange={(e) => onUpdate(i, 'durationMinutes', e.target.value)}
            className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <span className="text-slate-400 text-sm flex-shrink-0">min</span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="text-slate-300 hover:text-red-400 transition-colors font-bold text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm font-medium hover:border-indigo-300 hover:text-indigo-500 transition-all"
      >
        + Add Segment
      </button>

      {segments.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 rounded-2xl">
          <span className="font-semibold text-indigo-900 text-sm">Total</span>
          <span className="font-bold text-indigo-900 text-sm">{formatDuration(totalMinutes)}</span>
        </div>
      )}
    </div>
  )
}

function CountsTab({ membersAttended, visitors, children, onVisitorsChange, onChildrenChange }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">📊 Counts</p>
      <div className="space-y-3">
        <CountRow label="Members attended" value={membersAttended} readOnly />
        <CountRow label="Visitors" value={visitors} onChange={onVisitorsChange} />
        <CountRow label="Children" value={children} onChange={onChildrenChange} />
        <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 rounded-2xl">
          <span className="font-semibold text-indigo-900 text-sm">Total</span>
          <span className="font-bold text-indigo-900 text-sm">{membersAttended + Number(visitors || 0) + Number(children || 0)}</span>
        </div>
      </div>
    </div>
  )
}

function CountRow({ label, value, readOnly = false, onChange }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl gap-4">
      <span className="font-medium text-slate-700 text-sm">{label}</span>
      {readOnly ? (
        <span className="font-bold text-slate-900 text-sm">{value}</span>
      ) : (
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-20 border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      )}
    </div>
  )
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(minutes) {
  const m = Number(minutes) || 0
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

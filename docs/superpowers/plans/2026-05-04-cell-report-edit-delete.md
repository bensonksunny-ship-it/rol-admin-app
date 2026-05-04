# Cell Report Edit / Delete + Manual Timing Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow cell leaders to edit their own meeting reports and directors to edit or delete any report, and allow manual creation of meeting records.

**Architecture:** A new `EditReportSheet` bottom-sheet component handles both editing existing records and creating new manual entries. It wires into `CellHistory` with per-row edit/delete buttons and a `+ New Entry` button. All writes go to `cell_reports`, `cell_reports/{id}/attendees`, and `cell_midweek_sessions`; archived `cell_report_history` docs are patched for immediate UI consistency.

**Tech Stack:** React, Firebase Firestore, Framer Motion (existing `EndMeetingModal` pattern in `MidweekMinistry.jsx`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/services/firestore.js` | Modify | Add `updateCellReportFull` and `deleteCellReportFull` |
| `src/pages/cell/EditReportSheet.jsx` | **Create** | Bottom sheet with Attendance / Timing / Counts / Notes tabs |
| `src/pages/CellHistory.jsx` | Modify | Edit/delete buttons on cards, `+ New Entry` button, permission logic, sheet wiring |

---

## Task 1: Firestore — `updateCellReportFull` and `deleteCellReportFull`

**Files:**
- Modify: `src/services/firestore.js` (append after `syncMidweekAttendanceToCellReport` at line ~2740)

### Context

`cell_reports` docs have shape `{ cellId, cellName, reportDate (YYYY-MM-DD), membersAttended, visitors, children, ... }`.
Attendees live in `cell_reports/{id}/attendees` subcollection: `{ memberId, name, birthday, anniversary, phone, locality }`.
Midweek sessions live in `cell_midweek_sessions/{cellId}_{date}`: `{ cellId, date, segmentTimings, shepherdNotes, presentIds, ... }`.
History archive lives in `cell_report_history/{weekStartISO}_{cellId}`.

`getCellReportByCellAndDate(cellId, dateStr)` already exists and returns `{ id, ... }` or `null`.

- [ ] **Step 1: Add helper `toMondayISO`**

Append this private helper near the top of the cell-reports section (after line 1716, before `cellReportAttendeesRef`). Or add it just before the two new functions at the end of the file — whichever keeps the diff clean.

```js
// Returns the ISO date string (YYYY-MM-DD) of the Monday of the week containing dateStr
function toMondayISO(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10))
  const day = d.getDay() // 0 = Sun, 1 = Mon, …
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Add `updateCellReportFull`**

Append after `syncMidweekAttendanceToCellReport` (after line 2740 of current file):

```js
/**
 * Full update of a cell meeting report.
 * Reconciles cell_reports, its attendees subcollection, cell_midweek_sessions,
 * and patches cell_report_history if an archived doc exists.
 *
 * @param {object} row - history/live row with { cellId, cellName, meetingDateISO }
 * @param {object} payload
 * @param {Array<{id?:string, memberId?:string, name:string}>} payload.attendees - full desired list
 * @param {Array<{name:string, durationMinutes:number}>} payload.segmentTimings
 * @param {string} payload.shepherdNotes
 * @param {number} payload.visitors
 * @param {number} payload.children
 * @param {string} [payload.updatedBy]
 * @returns {Promise<{membersAttended:number, visitors:number, children:number, meetingDurationMinutes:number, programList:Array}>}
 */
export async function updateCellReportFull(row, { attendees, segmentTimings, shepherdNotes, visitors, children, updatedBy }) {
  if (!db || !row?.cellId || !row?.meetingDateISO) throw new Error('updateCellReportFull: missing row fields')
  const d = String(row.meetingDateISO).slice(0, 10)

  // 1. Find or create cell_reports doc
  let report = await getCellReportByCellAndDate(row.cellId, d)
  if (!report) {
    const ref = await addDoc(collection(db, CELL_REPORTS_COLLECTION), {
      cellId: row.cellId,
      cellName: row.cellName || '',
      meetingDay: row.meetingDay || '',
      membersAttended: 0,
      visitors: Number(visitors) || 0,
      children: Number(children) || 0,
      visitorsList: [],
      childrenList: [],
      reportDate: d,
      createdBy: updatedBy || 'unknown',
      createdAt: Timestamp.now(),
    })
    report = { id: ref.id, cellId: row.cellId, cellName: row.cellName || '' }
  }
  const reportId = report.id

  // 2. Update counts on cell_reports doc
  await updateDoc(doc(db, CELL_REPORTS_COLLECTION, reportId), {
    membersAttended: attendees.length,
    visitors: Number(visitors) || 0,
    children: Number(children) || 0,
  })

  // 3. Reconcile attendees subcollection
  const attendeesRef = collection(db, CELL_REPORTS_COLLECTION, reportId, 'attendees')
  const existingSnap = await getDocs(attendeesRef)
  const existingDocs = existingSnap.docs.map((sd) => ({ docId: sd.id, ...sd.data() }))

  // Build desired set by name (case-insensitive) for matching
  const desiredNames = new Set(attendees.map((a) => String(a.name || '').trim().toLowerCase()).filter(Boolean))

  // Delete removed docs
  const batch = writeBatch(db)
  for (const ex of existingDocs) {
    const exName = String(ex.name || '').trim().toLowerCase()
    if (!desiredNames.has(exName)) {
      batch.delete(doc(attendeesRef, ex.docId))
    }
  }
  await batch.commit()

  // Add new docs (those not already present by memberId or name)
  const existingMemberIds = new Set(existingDocs.map((e) => e.memberId).filter(Boolean))
  const existingNames = new Set(existingDocs.map((e) => String(e.name || '').trim().toLowerCase()))
  const addBatch = writeBatch(db)
  for (const a of attendees) {
    const normName = String(a.name || '').trim().toLowerCase()
    const alreadyById = a.memberId && existingMemberIds.has(a.memberId)
    const alreadyByName = normName && existingNames.has(normName)
    if (!alreadyById && !alreadyByName) {
      addBatch.set(doc(attendeesRef), {
        memberId: a.memberId || null,
        name: String(a.name || '').trim(),
        birthday: a.birthday || '',
        anniversary: a.anniversary || '',
        phone: a.phone || '',
        locality: a.locality || '',
      })
    }
  }
  await addBatch.commit()

  // 4. Upsert cell_midweek_sessions
  const sessionId = `${row.cellId}_${d}`
  await setDoc(doc(db, MIDWEEK_SESSIONS, sessionId), {
    cellId: row.cellId,
    date: d,
    segmentTimings: Array.isArray(segmentTimings) ? segmentTimings : [],
    shepherdNotes: shepherdNotes || '',
    updatedBy: updatedBy || 'unknown',
    updatedAt: Timestamp.now(),
  }, { merge: true })

  // 5. Patch cell_report_history if an archived doc exists
  const weekStart = toMondayISO(d)
  const historyId = `${weekStart}_${row.cellId}`
  try {
    const historyRef = doc(db, CELL_REPORT_HISTORY_COLLECTION, historyId)
    const historySnap = await getDoc(historyRef)
    if (historySnap.exists()) {
      const meetingDurationMinutes = (segmentTimings || []).reduce((s, t) => s + (Number(t.durationMinutes) || 0), 0)
      await updateDoc(historyRef, {
        membersAttended: attendees.length,
        totalAttendance: attendees.length + (Number(visitors) || 0) + (Number(children) || 0),
        visitors: Number(visitors) || 0,
        children: Number(children) || 0,
        meetingDurationMinutes,
        programList: (segmentTimings || []).map((t) => ({ programName: t.name, durationMinutes: t.durationMinutes })),
      })
    }
  } catch (err) {
    console.warn('updateCellReportFull: could not patch cell_report_history', err)
  }

  const meetingDurationMinutes = (segmentTimings || []).reduce((s, t) => s + (Number(t.durationMinutes) || 0), 0)
  return {
    membersAttended: attendees.length,
    visitors: Number(visitors) || 0,
    children: Number(children) || 0,
    meetingDurationMinutes,
    programList: (segmentTimings || []).map((t) => ({ programName: t.name, durationMinutes: t.durationMinutes })),
  }
}
```

- [ ] **Step 3: Add `deleteCellReportFull`**

Append immediately after `updateCellReportFull`:

```js
/**
 * Delete all Firestore data for a cell meeting report:
 * cell_report_history (if archived), cell_reports attendees, cell_reports doc,
 * and cell_midweek_sessions doc.
 *
 * @param {object} row - { cellId, meetingDateISO }
 */
export async function deleteCellReportFull(row) {
  if (!db || !row?.cellId || !row?.meetingDateISO) throw new Error('deleteCellReportFull: missing row fields')
  const d = String(row.meetingDateISO).slice(0, 10)

  // 1. Delete cell_report_history if archived
  const weekStart = toMondayISO(d)
  const historyId = `${weekStart}_${row.cellId}`
  try {
    await deleteDoc(doc(db, CELL_REPORT_HISTORY_COLLECTION, historyId))
  } catch {
    // may not exist — ignore
  }

  // 2. Find and delete cell_reports + attendees subcollection
  const q = query(
    collection(db, CELL_REPORTS_COLLECTION),
    where('cellId', '==', row.cellId),
    where('reportDate', '==', d)
  )
  const snap = await getDocs(q)
  for (const reportDoc of snap.docs) {
    const attendeesRef = collection(db, CELL_REPORTS_COLLECTION, reportDoc.id, 'attendees')
    const attendeesSnap = await getDocs(attendeesRef)
    const batch = writeBatch(db)
    attendeesSnap.docs.forEach((ad) => batch.delete(ad.ref))
    batch.delete(reportDoc.ref)
    await batch.commit()
  }

  // 3. Delete cell_midweek_sessions doc
  try {
    await deleteDoc(doc(db, MIDWEEK_SESSIONS, `${row.cellId}_${d}`))
  } catch {
    // may not exist — ignore
  }
}
```

- [ ] **Step 4: Verify file compiles (run dev server)**

```bash
npm run dev
```

Expected: Vite dev server starts with no errors. Check the browser console for any import/syntax errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/firestore.js
git commit -m "feat: add updateCellReportFull and deleteCellReportFull to firestore service"
```

---

## Task 2: Create `EditReportSheet` Bottom Sheet Component

**Files:**
- Create: `src/pages/cell/EditReportSheet.jsx`

### Context

The bottom-sheet visual pattern is identical to `EndMeetingModal` in `MidweekMinistry.jsx` (lines 530–671):
- `AnimatePresence` wrapper sits at call-site (in `CellHistory`)
- Component renders: fixed backdrop `motion.div` + fixed bottom `motion.div` with `rounded-t-3xl`, `max-h-[90vh]`, `flex flex-col`
- Drag handle: `<div className="w-10 h-1 rounded-full bg-slate-200" />`
- Scrollable content area with `flex-1 overflow-y-auto`
- Footer with Cancel + Save buttons pinned at bottom

`getCellGroupMembers` returns `{ id, name, birthday, anniversary, phone, locality, status }`.
`getCellReportByCellAndDate` returns `{ id, cellId, cellName, membersAttended, visitors, children, ... }` or null.
`getMidweekSessionData` returns `{ segmentTimings, shepherdNotes, presentIds, ... }` or null.
`getCellReportAttendees` returns `[{ id, memberId, name, birthday, anniversary, phone, locality }]`.

- [ ] **Step 1: Create the file with skeleton**

Create `src/pages/cell/EditReportSheet.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  getCellGroupMembers,
  getCellReportByCellAndDate,
  getCellReportAttendees,
  getMidweekSessionData,
  updateCellReportFull,
} from '../../services/firestore'

const TABS = ['Attendance', 'Timing', 'Counts', 'Notes']

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
  const [attendees, setAttendees]           = useState([])   // [{ id?, memberId?, name, birthday?, anniversary?, phone?, locality? }]
  const [segmentTimings, setSegmentTimings] = useState([])   // [{ name, durationMinutes }]
  const [shepherdNotes, setShepherdNotes]   = useState('')
  const [visitors, setVisitors]             = useState(0)
  const [children, setChildren]             = useState(0)
  const [meetingDate, setMeetingDate]       = useState(isNew ? '' : (row?.meetingDateISO || ''))
  const [newCellId, setNewCellId]           = useState(isNew ? (linkedCellId || '') : '')

  // Member search
  const [allMembers, setAllMembers]   = useState([])
  const [memberSearch, setMemberSearch] = useState('')

  // UI
  const [loading, setLoading]   = useState(!isNew)
  const [saving, setSaving]     = useState(false)
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
        setAttendees(existingAttendees.map((a) => ({ id: a.id, memberId: a.memberId, name: a.name, birthday: a.birthday, anniversary: a.anniversary, phone: a.phone, locality: a.locality })))
        if (sessionData) {
          setSegmentTimings(Array.isArray(sessionData.segmentTimings) ? sessionData.segmentTimings.map((s) => ({ name: s.name || '', durationMinutes: Number(s.durationMinutes) || 0 })) : [])
          setShepherdNotes(sessionData.shepherdNotes || '')
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

  const memberSuggestions = useMemo(() => {
    const q = memberSearch.trim().toLowerCase()
    if (!q) return []
    const presentNames = new Set(attendees.map((a) => String(a.name || '').trim().toLowerCase()))
    return allMembers
      .filter((m) => !presentNames.has(m.name.trim().toLowerCase()) && m.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [memberSearch, allMembers, attendees])

  function addAttendee(member) {
    setAttendees((prev) => {
      const alreadyPresent = prev.some((a) => (a.memberId && a.memberId === member.id) || String(a.name || '').trim().toLowerCase() === member.name.trim().toLowerCase())
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
    setSegmentTimings((prev) => prev.map((s, i) => i === index ? { ...s, [field]: field === 'durationMinutes' ? Number(value) || 0 : value } : s))
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
        shepherdNotes,
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

  const title = isNew ? 'New Entry' : `Edit Report — ${formatDate(row?.meetingDateISO)}`

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
                  memberSearch={memberSearch}
                  memberSuggestions={memberSuggestions}
                  onSearchChange={setMemberSearch}
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
              {activeTab === 'Notes' && (
                <NotesTab notes={shepherdNotes} onChange={setShepherdNotes} />
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

function AttendanceTab({ attendees, memberSearch, memberSuggestions, onSearchChange, onAdd, onRemove }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        👥 Members Attended — {attendees.length}
      </p>

      {/* Current attendees as removable pills */}
      {attendees.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attendees.map((a, i) => (
            <span
              key={a.id || i}
              className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm font-medium px-3 py-1.5 rounded-full"
            >
              {a.name}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="ml-0.5 text-emerald-500 hover:text-red-500 transition-colors font-bold leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Member search */}
      <div className="relative">
        <input
          type="text"
          value={memberSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="+ Add member…"
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        {memberSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
            {memberSuggestions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onAdd(m)}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>
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

function NotesTab({ notes, onChange }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">📝 Shepherd Notes</p>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder="Write your shepherd notes here…"
        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function formatDuration(minutes) {
  const m = Number(minutes) || 0
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}
```

- [ ] **Step 2: Verify file has no import errors (run dev server)**

```bash
npm run dev
```

Expected: Vite starts with no errors. The new file doesn't need to be wired in yet — just no parse errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/cell/EditReportSheet.jsx
git commit -m "feat: add EditReportSheet bottom sheet with Attendance/Timing/Counts/Notes tabs"
```

---

## Task 3: Wire `CellHistory.jsx` — Edit/Delete Buttons + New Entry

**Files:**
- Modify: `src/pages/CellHistory.jsx`

### Context

Current `CellHistory.jsx` structure (line references to the file at time of plan writing):
- Lines 1–16: imports
- Line 51: `export default function CellHistory({ embedded = false })`
- Line 59: `isDirector` computed from `isCellDirectorInPositions`
- Lines 143–147: sorted list
- Lines 153–182: embedded return (has "Past Meeting Records" heading)
- Lines 184–229: full-page return
- Lines 232–280: `HistoryCard({ row, expanded, onToggle })`
- Lines 283–441: `HistoryDetail({ row })`

`isCellLeaderInPositions` and `canEditCellReport` are already exported from `src/utils/cellReportPermissions.js`.
`deleteCellReportFull` will be in `src/services/firestore.js` after Task 1.
`EditReportSheet` will be in `src/pages/cell/EditReportSheet.jsx` after Task 2.

- [ ] **Step 1: Update imports**

In `src/pages/CellHistory.jsx`, replace the existing import block (lines 1–15) with:

```js
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getCellGroups,
  getCellReportHistory,
  getCellReportsByCell,
  getCellReportAttendees,
  getMidweekSessionData,
  getMidweekPrayerPoints,
  getLatestCellReports,
  getCellGroupMembers,
  deleteCellReportFull,
} from '../services/firestore'
import { isCellDirectorInPositions, isCellLeaderInPositions } from '../utils/cellReportPermissions'
import DepartmentTabBar from '../components/DepartmentTabBar'
import { AnimatePresence } from 'framer-motion'
import EditReportSheet from './cell/EditReportSheet'
```

- [ ] **Step 2: Add `isLeader`, `canEditRow`, and `editRow` state to `CellHistory`**

In `CellHistory`, after the existing:
```js
const isDirector = useMemo(() => isCellDirectorInPositions(userProfile), [userProfile])
```

Add:
```js
const isLeader = useMemo(() => isCellLeaderInPositions(userProfile), [userProfile])
const canEditRow = useCallback(
  (row) => isDirector || (isLeader && row.cellId === linkedCellId),
  [isDirector, isLeader, linkedCellId]
)

const [editRow, setEditRow]     = useState(null)   // null = sheet closed; row object = open for edit
const [isNewEntry, setIsNewEntry] = useState(false) // true when opening sheet in new-entry mode
```

- [ ] **Step 3: Add `handleSaved` callback**

In `CellHistory`, add after the `canEditRow` declaration:
```js
const handleSaved = useCallback((updatedRow) => {
  setHistory((prev) =>
    prev.map((h) =>
      h.cellId === updatedRow.cellId && h.meetingDateISO === updatedRow.meetingDateISO
        ? { ...h, ...updatedRow }
        : h
    )
  )
  if (isNewEntry) {
    // Add the new entry to the list
    setHistory((prev) => {
      const alreadyExists = prev.some(
        (h) => h.cellId === updatedRow.cellId && h.meetingDateISO === updatedRow.meetingDateISO
      )
      return alreadyExists ? prev : [updatedRow, ...prev]
    })
  }
}, [isNewEntry])
```

- [ ] **Step 4: Add `handleDelete` callback**

In `CellHistory`, add after `handleSaved`:
```js
const handleDelete = useCallback(async (row) => {
  const confirmed = window.confirm(`Delete the meeting record for ${row.cellName} on ${row.meetingDateISO}? This cannot be undone.`)
  if (!confirmed) return
  try {
    await deleteCellReportFull(row)
    setHistory((prev) => prev.filter((h) => !(h.cellId === row.cellId && h.meetingDateISO === row.meetingDateISO)))
  } catch {
    alert('Could not delete. Please try again.')
  }
}, [])
```

- [ ] **Step 5: Add `+ New Entry` button to embedded return**

Replace the embedded `<div>` heading section (lines 155–160 approximately):

```jsx
// BEFORE:
<div>
  <h2 className="font-bold text-slate-900 text-base">Past Meeting Records</h2>
  <p className="text-slate-500 text-xs mt-0.5">Read only · newest first</p>
</div>

// AFTER:
<div className="flex items-center justify-between gap-4">
  <div>
    <h2 className="font-bold text-slate-900 text-base">Past Meeting Records</h2>
    <p className="text-slate-500 text-xs mt-0.5">Newest first</p>
  </div>
  {(isDirector || isLeader) && (
    <button
      type="button"
      onClick={() => { setIsNewEntry(true); setEditRow({}) }}
      className="text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all"
    >
      + New Entry
    </button>
  )}
</div>
```

- [ ] **Step 6: Add `+ New Entry` button to full-page return header**

Find the full-page header section. After the existing description `<p>` and `← Cell Report` link, add the `+ New Entry` button. Replace the header div:

```jsx
// BEFORE (approximately lines 189–201):
<div className="flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold text-slate-900">Cell History</h1>
    <p className="text-slate-500 text-sm mt-0.5">Past meeting records — read only</p>
  </div>
  <Link
    to="/department/cell/cell-report"
    className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap mt-1"
  >
    ← Cell Report
  </Link>
</div>

// AFTER:
<div className="flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold text-slate-900">Cell History</h1>
    <p className="text-slate-500 text-sm mt-0.5">Past meeting records</p>
  </div>
  <div className="flex items-center gap-3 flex-shrink-0 mt-1">
    {(isDirector || isLeader) && (
      <button
        type="button"
        onClick={() => { setIsNewEntry(true); setEditRow({}) }}
        className="text-sm font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-all"
      >
        + New Entry
      </button>
    )}
    <Link
      to="/department/cell/cell-report"
      className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap"
    >
      ← Cell Report
    </Link>
  </div>
</div>
```

- [ ] **Step 7: Pass edit/delete handlers down through `HistoryCard`**

Update the two `{sorted.map((row) => ...)}` blocks (embedded and full-page) to pass the extra props:

```jsx
{sorted.map((row) => (
  <HistoryCard
    key={row.id}
    row={row}
    expanded={expandedId === row.id}
    onToggle={() => toggleExpand(row.id)}
    canEdit={canEditRow(row)}
    isDirector={isDirector}
    onEdit={() => { setIsNewEntry(false); setEditRow(row) }}
    onDelete={() => handleDelete(row)}
  />
))}
```

Apply this change in **both** the embedded render (around line 170) and the full-page render (around line 216).

- [ ] **Step 8: Add edit/delete buttons to `HistoryCard`**

`HistoryCard` currently takes `{ row, expanded, onToggle }`. Update the signature and add buttons. The card header `<button>` currently takes the full row width. Change it so the row is a flex container with the toggle-button and the action buttons side-by-side.

Replace the entire `HistoryCard` function:

```jsx
function HistoryCard({ row, expanded, onToggle, canEdit = false, isDirector = false, onEdit, onDelete }) {
  const total    = Number(row.totalAttendance) || 0
  const members  = Number(row.membersAttended) || 0
  const duration = formatDuration(row.meetingDurationMinutes)

  return (
    <div className={`bg-white rounded-3xl border shadow-sm overflow-hidden transition-all ${
      expanded ? 'border-indigo-200 shadow-indigo-50' : 'border-slate-200'
    }`}>
      {/* Card header row */}
      <div className="flex items-center gap-2 pr-3">
        {/* Expand toggle — takes remaining space */}
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors min-w-0"
        >
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-base">{row.cellName || '—'}</span>
              {row.meetingDateISO && (
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {toDDMMYYYY(row.meetingDateISO)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{members}</span> members
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{total}</span> total
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-sm text-slate-500">{duration}</span>
            </div>
          </div>
          <div className={`text-slate-400 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}>
            ›
          </div>
        </button>

        {/* Action buttons */}
        {canEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex-shrink-0"
            title="Edit report"
          >
            ✏️
          </button>
        )}
        {isDirector && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
            title="Delete report"
          >
            🗑️
          </button>
        )}
      </div>

      {/* Expanded detail panel */}
      {expanded && <HistoryDetail row={row} />}
    </div>
  )
}
```

- [ ] **Step 9: Render `EditReportSheet` at the bottom of `CellHistory`**

Both the embedded `return` and the full-page `return` need the sheet appended before the closing tag.

In the embedded return, replace the closing `</div>` (after the cards list `</div>`) with:

```jsx
      </div>   {/* end space-y-3 wrapper */}

      {/* Edit / New Entry sheet */}
      <AnimatePresence>
        {editRow !== null && (
          <EditReportSheet
            row={isNewEntry ? null : editRow}
            isNew={isNewEntry}
            cellGroups={cellGroups}
            linkedCellId={linkedCellId}
            isDirector={isDirector}
            onClose={() => { setEditRow(null); setIsNewEntry(false) }}
            onSaved={(updated) => { handleSaved(updated); setEditRow(null); setIsNewEntry(false) }}
          />
        )}
      </AnimatePresence>
    </div>  {/* end root space-y-3 */}
```

In the full-page return, similarly append the `AnimatePresence` + `EditReportSheet` before the closing `</div>` of the outer page wrapper.

- [ ] **Step 10: Verify in browser**

```bash
npm run dev
```

Open the Cell History page (or the embedded version inside CellLeaderEntryTab). Verify:
1. Edit (✏️) buttons appear on rows where `canEdit` is true (cell leaders see their own cell's rows; directors see all).
2. Delete (🗑️) buttons appear only for directors.
3. `+ New Entry` button appears in both embedded and full-page views for leaders and directors.
4. Clicking ✏️ opens the bottom sheet pre-populated with current data.
5. Tabs switch correctly.
6. Attendance: existing members show as pills; member search autocomplete works; × removes a member.
7. Timing: segments editable; `+ Add Segment` adds a row; × removes; total updates live.
8. Counts: visitors/children editable; members count read-only; total shown.
9. Notes: textarea editable.
10. Save button writes data; the card in the list updates without full reload.
11. Delete button: confirmation prompt appears; on confirm, card disappears from list.
12. `+ New Entry`: sheet opens with empty form, date picker, and (for director) cell selector.

- [ ] **Step 11: Commit**

```bash
git add src/pages/CellHistory.jsx
git commit -m "feat: add edit/delete/new-entry to CellHistory — wires EditReportSheet and permission buttons"
```

---

## Self-Review Checklist

Before calling this done, verify against the spec (`docs/superpowers/specs/2026-05-04-cell-report-edit-delete-design.md`):

- [ ] `updateCellReportFull` reconciles all 4 collections (cell_reports, attendees, cell_midweek_sessions, cell_report_history)
- [ ] `deleteCellReportFull` removes all 4 (with soft-fail on missing docs)
- [ ] `EditReportSheet` has all 4 tabs: Attendance, Timing, Counts, Notes
- [ ] Edit buttons visible: cell leaders see only their cell; directors see all
- [ ] Delete buttons visible: directors only
- [ ] `+ New Entry` visible to leaders (own cell) and directors (any cell with dropdown)
- [ ] New Entry mode: date picker + optional cell selector (directors only)
- [ ] Save error displayed inline in sheet footer
- [ ] Delete error shown via `alert` (acceptable per spec for card-level)
- [ ] `onSaved` patches local history list — no full reload needed
- [ ] `cell_report_history` patch failure is non-blocking (logged, not thrown)

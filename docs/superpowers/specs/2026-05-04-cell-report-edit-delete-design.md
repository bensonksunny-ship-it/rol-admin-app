# Cell Report Edit / Delete + Manual Timing Entry — Design Spec

## Goal

Allow cell leaders to edit their own meeting reports and Directors to edit or delete any report. Also allow manual creation of a timing record for a meeting that was never tracked live.

## Architecture

A new `EditReportSheet` bottom-sheet component handles both editing existing records and creating new manual entries. It is wired into `CellHistory` (the Reports tab). All edits write to the three live collections (`cell_reports`, `cell_reports/{id}/attendees`, `cell_midweek_sessions`) and, when an archived entry exists, also patch `cell_report_history` for immediate UI consistency.

**Tech Stack:** React, Firebase Firestore, Framer Motion (existing patterns)

---

## Components

### New: `src/pages/cell/EditReportSheet.jsx`

Bottom sheet component, same visual pattern as `EndMeetingModal`. Props:

```js
<EditReportSheet
  row={rowData}          // history row (cellId, cellName, meetingDateISO, id, ...)
  isNew={false}          // true = New Entry mode (no existing session)
  cellGroups={[]}        // for Directors in New Entry mode — cell selector list
  linkedCellId={null}    // for cell leaders — pre-selects their cell
  isDirector={false}
  onClose={() => {}}
  onSaved={(updatedRow) => {}}  // called with patched row after save
/>
```

**Internal structure:**
- Header: "Edit Report — DD/MM/YYYY" (or "New Entry" in new mode)
- Four tabs: Attendance | Timing | Counts | Notes
- Footer: Cancel + Save buttons

**Attendance tab:**
- Current attendees as removable pills (`name × `)
- `+ Add Member` button → inline searchable list from `getCellGroupMembers(cellId)`, filtered to exclude already-present members
- `Members attended` count updates live

**Timing tab:**
- Each segment row: `[name text input]  [duration number input] min  [× remove]`
- `+ Add Segment` row at bottom (name + duration inline)
- Total duration shown at bottom, computed live from all segment durations

**Counts tab:**
- `Visitors` — number input
- `Children` — number input
- `Members attended` — read-only, driven by attendance list length

**Notes tab:**
- `Shepherd notes` — textarea, full width

**Save logic:**
1. Update `cell_reports/{id}` — `membersAttended`, `visitors`, `children`
2. Reconcile `cell_reports/{id}/attendees` — delete removed docs, add new docs
3. Upsert `cell_midweek_sessions/{cellId}_{date}` — `segmentTimings`, `shepherdNotes`
4. If `cell_report_history` doc exists for this cell+week — patch `membersAttended`, `totalAttendance`, `visitors`, `children`, `meetingDurationMinutes`, `programList`

In New Entry mode: find-or-create `cell_reports` doc first (same as `syncMidweekAttendanceToCellReport` pattern), then run save logic above.

---

### Modified: `src/pages/CellHistory.jsx`

**HistoryCard — edit/delete buttons:**

In the card header row (right side, before the expand chevron):
- Pencil icon button (`✏`) — visible when `canEdit` is true
- Trash icon button (`🗑`) — visible when `isDirector` is true only

Permission logic (added to `CellHistory`):
```js
const isLeader = useMemo(() => isCellLeaderInPositions(userProfile), [userProfile])

// Per-card: canEdit
const canEditRow = (row) =>
  isDirector || (isLeader && row.cellId === linkedCellId)
```

**"+ New Entry" button:**

In the embedded header (top of `CellHistory` when `embedded === true`), alongside the "Past Meeting Records" heading. Also shown in the full-page header. Clicking opens `EditReportSheet` with `isNew={true}`.

**Delete flow:**
- Clicking 🗑 shows an inline confirmation (`window.confirm` or small inline prompt: "Delete this meeting record? This cannot be undone.")
- On confirm: calls `deleteCellReportFull(row)` then removes the row from local `history` state

**After save:** `onSaved` callback patches the matching row in local `history` state so the card updates without a full reload.

---

### Modified: `src/services/firestore.js`

**New: `updateCellReportFull(row, { attendees, segmentTimings, shepherdNotes, visitors, children })`**

```
1. Update cell_reports/{reportId}: membersAttended, visitors, children
2. Reconcile cell_reports/{reportId}/attendees subcollection
3. Upsert cell_midweek_sessions/{cellId}_{date}: segmentTimings, shepherdNotes
4. If cell_report_history doc exists: patch summary fields
```

Where `reportId` is found by querying `cell_reports` by `cellId + reportDate`, or created if missing (New Entry mode).

**New: `deleteCellReportFull(row)`**

```
1. Delete cell_report_history doc (if exists): id = `${weekStartISO}_${cellId}`
   - weekStartISO derived from meetingDateISO (Monday of that week)
2. Get cell_reports docs for cellId + meetingDateISO
3. For each: delete all attendees subcollection docs, then delete the report doc
4. Delete cell_midweek_sessions doc: id = `${cellId}_${date}`
```

---

## Permissions Summary

| Action | Cell Leader | Director |
|--------|------------|----------|
| Edit own cell's report | ✅ | ✅ |
| Edit other cell's report | ❌ | ✅ |
| Delete any report | ❌ | ✅ |
| New Entry (own cell) | ✅ | ✅ |
| New Entry (any cell) | ❌ | ✅ (cell dropdown) |

---

## Data Flow

```
EditReportSheet.save()
  ├── updateCellReportFull()
  │     ├── cell_reports/{id}           ← counts
  │     ├── cell_reports/{id}/attendees ← member list
  │     ├── cell_midweek_sessions/{id}  ← timings + notes
  │     └── cell_report_history/{id}    ← summary patch (if archived)
  └── onSaved(updatedRow) → CellHistory patches local state

EditReportSheet (New Entry)
  ├── find-or-create cell_reports doc
  └── same save flow as above

DeleteButton (Director)
  └── deleteCellReportFull()
        ├── cell_report_history/{id}    ← delete
        ├── cell_reports/{id}/attendees ← delete all
        ├── cell_reports/{id}           ← delete
        └── cell_midweek_sessions/{id}  ← delete
```

---

## Error Handling

- Save errors: show inline error message in sheet footer ("Could not save. Please try again.")
- Delete errors: show inline error in the card
- If `cell_report_history` patch fails: log warning but don't block — the Cloud Function will correct it on Sunday

## Out of Scope

- Editing prayer points (`cell_midweek_prayer`) — separate concern
- Audit trail / change history
- Bulk delete

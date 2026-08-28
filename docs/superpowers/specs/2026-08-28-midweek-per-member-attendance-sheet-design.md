# Mid-week Ministry — Per-Member Attendance & Profile Sheet

**Date:** 2026-08-28
**Page:** Mid-week Ministry / Cell View (`/department/cell?tab=midweek`)
**Component:** `src/pages/MidweekMinistry.jsx` → `LiveControlTab` → Attendance card

## Problem

The Attendance card in `LiveControlTab` is a grid of `MemberBubble` buttons.
One tap toggles a member present (green + ✓) or absent. That is the only
per-member interaction — there is no way to record *why* someone is absent, add
a follow-up note, or fix a member's profile details without leaving the meeting
view for the Shepherd Care tab.

## Goal

From the Attendance card, a cell leader can open a per-person sheet that lets
them, for one individual, without navigating away:

1. Set an attendance status — **Present / Absent / Excused** — with an optional
   reason and a follow-up note.
2. Edit that member's full profile (the same fields the Shepherd Care member
   form already has) and save it.

The whole-bubble tap keeps working exactly as today (quick present/absent
toggle). The sheet is an additional affordance, opened from a small secondary
button on each bubble.

## Data model

### Per-week attendance detail — session doc only

`attendanceDetails`: a plain object on the `cell_midweek_sessions/{cellId}_{date}`
doc, keyed by memberId:

```
attendanceDetails: {
  "<memberId>": { status: "present" | "absent" | "excused", reason: "", note: "" }
}
```

- `presentIds[]` stays the source of truth for the attendance **count** and for
  `syncMidweekAttendanceToCellReport`. `attendanceDetails` only enriches it.
- Sync rule between the two:
  - status `present`  → `presentIds` contains the id; `reason` ignored/blank.
  - status `absent` / `excused` → id removed from `presentIds`; `reason` + `note`
    kept.
  - A plain bubble tap to present → `attendanceDetails[id].status = 'present'`
    (create the entry if missing). Tap to absent → `status = 'absent'`, existing
    `reason`/`note` preserved.
- Members with no entry in `attendanceDetails` behave exactly as today (present
  iff in `presentIds`).

**Not** propagated to `cell_reports` — deliberately out of scope. The reports
history and director views are unchanged.

### Member profile

Reuses `updateCellGroupMember(cellId, memberId, form)` as-is (same call
`ShepherdView.jsx` uses). Saved immediately on the sheet's "Save profile" button,
then `getCellGroupMembers(selectedCellId)` re-run to refresh the local `members`
array.

## Changes

### 1. Extract `MemberFormFields` → `src/components/cell/MemberFormFields.jsx`

Currently a local function in `ShepherdView.jsx` (~line 2982). Move it verbatim
into a new shared module. Also export:

- `EMPTY_MEMBER_FORM` — the blank form-shape object (currently a module const in
  `ShepherdView.jsx`, used by `handleAddMember`).
- `memberToForm(member)` — returns the 11-field object currently built inline in
  `ShepherdView.jsx`'s `startEdit` (`name`, `phone`, `email`, `locality`,
  `address`, `birthday`, `anniversary`, `since`, `occupation`, `role`, `notes`,
  each `|| ''`).

`calcAttendanceDuration` (local function in `ShepherdView.jsx` line 1789, used
both inside `MemberFormFields` and separately at line ~2405) moves into the new
module and is exported.

`ShepherdView.jsx`: delete the local `MemberFormFields`, `EMPTY_MEMBER_FORM`, and
`calcAttendanceDuration`; import all four (`MemberFormFields`,
`EMPTY_MEMBER_FORM`, `memberToForm`, `calcAttendanceDuration`) from the new
module; and replace the inline object in `startEdit` with
`setEditForm(memberToForm(member))`. The line ~2405 call site keeps working via
the import.

No markup or styling changes. No behaviour change in Shepherd Care.

### 2. New component `src/components/cell/MemberAttendanceSheet.jsx`

Centered modal, `framer-motion` entrance matching `EndMeetingModal` (backdrop
`bg-black/50`, white panel `rounded-3xl` / `max-w-[480px]` / `max-h-[85vh]`
scroll).

Props:

| prop | meaning |
|---|---|
| `member` | the member doc |
| `detail` | `attendanceDetails[member.id]` or `undefined` |
| `present` | `presentIds.has(member.id)` |
| `savingAttendance`, `savingProfile` | in-flight flags for the two buttons |
| `onSaveAttendance(status, reason, note)` | |
| `onSaveProfile(form)` | |
| `onClose()` | |

Layout:

- **Header:** member name + initials avatar, close button.
- **Attendance block:**
  - 3-way segmented control Present / Absent / Excused. Initial value: from
    `detail.status`, else `present ? 'present' : 'absent'`.
  - "Reason" `<input>` — rendered only when the selected status is `absent` or
    `excused`. Initial value `detail.reason || ''`.
  - "Follow-up note" `<textarea>` (rows 2). Initial `detail.note || ''`.
  - "Save attendance" button → `onSaveAttendance(status, reason, note)` then
    `onClose()`.
- **Divider.**
- **Profile block:**
  - `<MemberFormFields form={form} onChange={setForm} />`, `form` initialised
    with `memberToForm(member)`.
  - "Save profile" button → `onSaveProfile(form)`. Stays open on success (toast
    confirms); closing is the leader's choice.

Local state only: `status`, `reason`, `note`, `form`. No data fetching in the
sheet.

### 3. `MidweekMinistry.jsx` — `LiveControlTab`

**State (near `presentIds`, ~line 192):**

```js
const [attendanceDetails, setAttendanceDetails] = useState({})   // { [id]: {status, reason, note} }
const [sheetMemberId, setSheetMemberId] = useState(null)
const [savingProfileId, setSavingProfileId] = useState(null)
const [savingAttendanceId, setSavingAttendanceId] = useState(null)
```

**`togglePresent` (~line 338):** after computing `next` (the new `presentIds`
set), also update `attendanceDetails`:

```js
setAttendanceDetails((prev) => ({
  ...prev,
  [id]: { ...(prev[id] || { reason: '', note: '' }), status: next.has(id) ? 'present' : 'absent' },
}))
```

Keep the existing River-Kids child prompt logic unchanged.

**New handlers:**

```js
const saveMemberAttendance = useCallback((id, status, reason, note) => {
  setPresentIds((prev) => {
    const n = new Set(prev)
    if (status === 'present') n.add(id); else n.delete(id)
    return n
  })
  setAttendanceDetails((prev) => ({
    ...prev,
    [id]: { status, reason: status === 'present' ? '' : (reason || ''), note: note || '' },
  }))
  setSheetMemberId(null)
}, [])

const saveMemberProfile = useCallback(async (id, form) => {
  setSavingProfileId(id)
  try {
    await updateCellGroupMember(selectedCellId, id, form)
    const fresh = await getCellGroupMembers(selectedCellId)
    setMembers(fresh)
    showToast('Member updated.')            // see toast note below
  } catch {
    showToast('Failed to save profile.', 'error')
  } finally {
    setSavingProfileId(null)
  }
}, [selectedCellId])
```

`updateCellGroupMember` + `getCellGroupMembers` added to the `firestore` import.

**Toast:** `LiveControlTab` has no toast primitive today. Add a minimal one — a
fixed top-right `div` driven by `const [toast, setToast] = useState(null)` and a
`showToast(msg, type)` that clears after ~3s (copy the pattern from
`ToDoListCard.jsx` lines 124–127 / 266–272). Used for profile save feedback and
the existing `setSaveError` cases can stay as they are.

**`MemberBubble` (~line 1155):** restructure from a single `motion.button` to:

```
<div className="relative">
  <motion.button ... onClick={() => onToggle(member.id)}>   {/* unchanged classes/content */}
    ...
    {/* subtitle line under the name when a detail exists: */}
    {detailLabel && <span className="text-[11px] ...">{detailLabel}</span>}
  </motion.button>
  <button
    type="button"
    onClick={() => onOpenSheet(member.id)}
    aria-label={`Open ${member.name} details`}
    className="absolute top-1 right-1 min-h-[44px] min-w-[44px] flex items-center justify-center ..."
  >
    <Pencil size={14} />   {/* lucide-react, add to import */}
  </button>
</div>
```

- `detailLabel`: `detail?.status === 'excused' ? 'Excused' : detail?.status === 'absent' && detail.reason ? \`Absent — ${detail.reason}\` : null`.
- New props on `MemberBubble`: `detail`, `onOpenSheet`. Passed from the
  Attendance grid `.map` (~line 707).
- The corner button sits inside the toggle button's padding; give the toggle
  button `pr-10` so text never slides under it. Verify the ✓ check icon
  (shown when present) still has room — move it left of the corner button or
  keep it (they don't overlap at `pr-10`).

**Render the sheet** near the other `AnimatePresence` modals (~line 820):

```jsx
<AnimatePresence>
  {sheetMemberId && (() => {
    const m = activeMembers.find((x) => x.id === sheetMemberId)
    if (!m) return null
    return (
      <MemberAttendanceSheet
        member={m}
        detail={attendanceDetails[sheetMemberId]}
        present={presentIds.has(sheetMemberId)}
        savingProfile={savingProfileId === sheetMemberId}
        onSaveAttendance={(s, r, n) => saveMemberAttendance(sheetMemberId, s, r, n)}
        onSaveProfile={(form) => saveMemberProfile(sheetMemberId, form)}
        onClose={() => setSheetMemberId(null)}
      />
    )
  })()}
</AnimatePresence>
```

### 4. Persistence — `MidweekMinistry.jsx` + `firestore.js`

**localStorage (`LiveControlTab`, ~line 236 / ~line 246):**
- Restore: `if (saved.attendanceDetails) setAttendanceDetails(saved.attendanceDetails)`.
- Save: add `attendanceDetails` to the `JSON.stringify({ … })` blob and to the
  effect's dependency array.

**`saveMidweekSessionSummary` (`src/services/firestore.js` ~line 4314):** accept
`attendanceDetails` in the destructured arg and write it:

```js
attendanceDetails: attendanceDetails && typeof attendanceDetails === 'object' ? attendanceDetails : {},
```

(the `setDoc` is already `{ merge: true }`).

**`confirmEndMeeting` (~line 492):** pass `attendanceDetails` in the
`saveMidweekSessionSummary(...)` call and add it to the `useCallback` deps.

**No rules changes:** `cell_midweek_sessions` already allows
`create, update: canAccessDept('Cell')`; `cell_groups/{cellId}/members/{memberId}`
already allows Cell Leader writes within their own cell.

## Out of scope

- `EndMeetingModal`'s own attendance bubble grid — unchanged.
- `ProgramConfirmSheet` — unchanged (it has no attendance list).
- Absence reasons / notes flowing into `cell_reports` or director dashboards.
- Loading `attendanceDetails` back from Firestore on mount for a past session —
  the localStorage restore covers the in-progress case, consistent with how
  `presentIds` is handled today.

## Verification (manual, browser)

1. Mid-week / Cell View, select a cell, open the Attendance card.
2. Whole-bubble tap still toggles present/absent; count pill updates.
3. Tap the pencil on a bubble → sheet opens for that member without leaving the
   page.
4. Set **Excused**, type a reason, Save attendance → sheet closes, bubble shows
   "Excused" subtitle, member removed from the present count.
5. Set **Present** in the sheet → member added back to the count, subtitle clears.
6. Edit the member's phone + shepherd notes, Save profile → toast confirms; the
   Shepherd Care tab shows the updated values.
7. Reload the page mid-session → statuses/reasons restored from localStorage.
8. End the meeting → `cell_midweek_sessions/{cellId}_{date}` doc has both
   `presentIds` and `attendanceDetails`.
9. Shepherd Care member add/edit still works (regression check on the
   `MemberFormFields` extraction).

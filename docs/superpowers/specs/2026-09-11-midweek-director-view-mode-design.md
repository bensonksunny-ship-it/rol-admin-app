# Mid-week Live Control: Director View-Only Default + Live Mirroring

## Problem

On the Mid-week Ministry Live Control tab (`src/pages/MidweekMinistry.jsx`), a Cell Director who
selects a cell group gets the *exact same fully-interactive UI* the Cell Leader gets — master
meeting button, attendance toggles, visitor add/remove, prayer point add/remove, per-member
profile edit sheet. There is no gate today: a Director can accidentally tap through and modify a
Leader's in-progress meeting.

Separately, the screen has **no cross-device real-time sync** today. `segmentIdx`, `presentIds`,
`attendanceDetails`, `visitors`, `childrenAttending` are local component state persisted only to
`localStorage` (same-device crash recovery); they only reach Firestore once, at "End Meeting"
(`saveMidweekSessionSummary`). So even with a permission gate, a Director opening the same cell
today would not actually see the Leader's live progress — they'd see their own blank/local state.

## Goals

1. Cell Director (and Founder, who already reaches this screen as an effective Director) defaults
   to a **read-only mirror** of the Leader's live meeting screen — no interactive controls.
2. An explicit **View Mode / Live Control** toggle near the top, always defaulting to View Mode,
   that a Director can flip to gain real editing/action-trigger ability.
3. The "mirror" is real: the Director's read-only view reflects the Leader's actual live progress
   via Firestore, not a separate local session.
4. Cell Leaders are unaffected — always full control of their own cell, as today.

## Non-goals

- **Cell Prep** sub-tab (segment order/durations/program start time config) is unaffected — stays
  editable by Directors as today. Confirmed with user: this request is scoped to the Live Control
  sub-tab only.
- No concurrent-edit locking/merge system. If a Director enables Live Control while the Leader is
  also actively editing, last Firestore write wins — acceptable for this low-concurrency use case
  (one cell, a handful of people, deliberate rare interventions).
- No push from a Director's edits back to the Leader's own open tab in real time. The Leader's tab
  keeps writing local state as authoritative and does not re-subscribe to remote updates (avoids
  local-edit flicker/overwrite while the Leader is actively tapping through their own meeting).
  Director interventions still land in Firestore, so they're visible on next load/refresh and to
  any other read-only viewer.

## Data model

Reuse the existing `cell_midweek_sessions/{cellId}_{date}` doc (no new collection, no rules
change — it already allows read/write to anyone with `canAccessDept('Cell')`). Add a `live` map
field alongside the existing end-of-meeting summary fields:

```
live: {
  segmentIdx: number,            // -1 not started, 0..n-1 in segment, >=n ended
  segmentStartedAt: number|null, // ms epoch, for LiveElapsedTimer
  completedTimings: [{ name, durationMinutes }],
  presentIds: string[],
  attendanceDetails: { [memberId]: { status, reason, note } },
  visitors: [{ id, name }],
  childrenAttending: [{ id, name, parentName }],
  askedParentIds: string[],
  updatedBy: string,
  updatedAt: Timestamp,
}
```

Written wholesale (not per-field) on every debounced push, so merge semantics stay simple.

`cell_midweek_prayer/{cellId}_{date}` (existing collection) switches from a one-time `getDoc` read
to a live `onSnapshot` subscription, so prayer points also mirror in real time. No schema or rules
change.

## Firestore service changes (`src/services/firestore.js`)

- `subscribeMidweekLiveSession(cellId, dateStr, callback)` — `onSnapshot` on the session doc,
  calls back with `snap.data()?.live || null`. Returns the unsubscribe function.
- `pushMidweekLiveState(cellId, dateStr, liveState, updatedBy)` — `setDoc(..., { cellId, date,
  live: { ...liveState, updatedBy, updatedAt: Timestamp.now() } }, { merge: true })`.
- `subscribeMidweekPrayerPoints(cellId, dateStr, callback)` — `onSnapshot` replacement for
  `getMidweekPrayerPoints`, calling back with `snap.data()?.points || []`.

## Component changes (`MidweekMinistry.jsx`)

### Who can write

```
canWrite = isLeader || (isDirector && liveControlEnabled)
```

- Leaders: unchanged behavior, `canWrite` is always true. New: a debounced effect pushes the
  live-state shape to Firestore on every relevant state change (segmentIdx, presentIds,
  attendanceDetails, visitors, childrenAttending, askedParentIds, segmentStartedAt).
- Directors (incl. Founder): `liveControlEnabled` starts `false` on mount and resets to `false`
  whenever `selectedCellId` or `today` changes (switching cells/dates always re-defaults to View
  Mode — matches "default state must always be View Mode").

### View Mode (Director, `!liveControlEnabled`)

- Subscribes to `subscribeMidweekLiveSession` and applies every incoming snapshot straight to the
  same local state vars the Leader's UI already renders from (segmentIdx, presentIds, etc.) — no
  separate render path, just a different data source.
- All interactive elements disabled/hidden:
  - Master meeting button: no `onClick`, no tap animation, `cursor-default`.
  - Attendance bubbles: `onToggle`/`onOpenSheet` not wired (pencil icon already conditionally
    hidden when `onOpenSheet` is absent); bubble gets a `readOnly` style (no hover state).
  - Select All / Clear All: hidden.
  - Visitor input + Add button: hidden. Existing visitor chips shown without the × remove control.
  - Children Attending chips: shown without × remove control.
  - Prayer Points: shown without remove (×) controls, regardless of `isMine`/`isDirector`.
  - Floating "add prayer" button: hidden entirely.
- A slim status banner (same visual language as the existing amber "Simulating" banner) reads
  "👁 Viewing `<Cell>`'s live session — read-only."

### Live Control Mode (Director, `liveControlEnabled === true`)

- On the toggle flipping on: local state is hydrated once from the last-known remote snapshot
  (so the Director picks up mid-meeting rather than resetting it), then the component stops
  auto-applying further remote snapshots and behaves like the Leader's writer path (local state
  authoritative, debounced push to Firestore) for as long as the toggle stays on.
- All controls enabled exactly as the Leader's today, including ending the meeting
  (`confirmEndMeeting`) — counts as "an active intervention."
- A slim amber banner reads "⚡ Live Control active — your changes affect `<Cell>`'s live
  meeting."

### Toggle UI

A segmented switch ("View Mode" / "Enable Live Control"), placed directly under/beside the
existing Director-only Cell Group selector card (the current top control bar), so it's the first
thing a Director sees after picking a cell. Only rendered when `isDirector` is true; Leaders never
see it.

## Edge cases

- A Director who is *also* a Leader of a different cell (rare, `isDirector && isLeader`): gating
  is keyed purely on the `isDirector` flag, so they still get View Mode by default when using this
  screen as a Director. Auto-select-own-cell logic (`isDirector && !isLeader`) is unrelated and
  untouched.
- No live session yet for the selected cell/date (`live` doc absent): View Mode renders the same
  idle "Begin Meeting" look the Leader would see before their first tap, purely as a display state
  (no interaction).
- Founder: per user decision, treated identically to a real Director (`effectiveIsDirector`
  already covers both cases) — defaults to View Mode, must flip the toggle to intervene.

## Testing plan

Manual (no test suite in this repo, per `CLAUDE.md`):
1. As a Leader, run a mid-week session (start, mark attendance, add a visitor, add a prayer
   point) in one browser tab.
2. As a Director, open the same cell/date in a second tab/profile — confirm it renders read-only
   and mirrors the Leader's live state within the debounce window, with no working controls.
3. Flip Live Control on as the Director — confirm controls become live and an action (e.g. mark
   one more member present) persists to Firestore.
4. Switch the Director's cell selector to a different cell — confirm the toggle resets to View
   Mode.
5. Confirm Cell Prep tab is unaffected (still editable by the Director) regardless of the Live
   Control toggle's state on the Live Control tab.

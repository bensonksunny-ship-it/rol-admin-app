# Today's Cell Program — Schedule Time Stamp

**Date:** 2026-08-28
**Component:** `src/pages/MidweekMinistry.jsx` → `LiveControlTab` → `ProgramConfirmSheet` ("Today's Cell Program" modal)

## Problem

The "Today's Cell Program" confirmation modal (shown before the meeting timer's
first tap) lists each segment with only its planned duration pill, e.g. `20 min`.
The Cell Prep tab in the same file already computes and displays a per-segment
clock-time window from the configured program start time, but the confirm modal
does not. Cell leaders want that same schedule view when confirming the program.

## Goal

In the modal, show each segment's computed start–end clock range next to its
duration, e.g. `20 min • 7:00 PM – 7:20 PM`, calculated sequentially from the
cell's configured program start time (default 7:00 PM).

## Data

`getMidweekSettings(cellId)` returns:
- `segmentOrder: string[]` — segment names in order (already loaded by `LiveControlTab`)
- `segmentDetails: [{ name, order, durationMinutes }]` — used to build `segmentDurations` name→minutes map (already loaded)
- `programStartTime: "HH:mm"` — **currently read only by `CellPrepTab`, not by `LiveControlTab`**

## Changes

### 1. `LiveControlTab` — capture the start time

In the existing `getMidweekSettings(selectedCellId).then((s) => { … })` block
(~line 288), add state `programStartTime` (default `'19:00'`) and set it from
`s.programStartTime` when present. Reset to `'19:00'` when absent, consistent
with how `segmentOrder` falls back to `DEFAULT_SEGMENTS`.

### 2. `LiveControlTab` — build the confirm-sheet items with ranges

Where `ProgramConfirmSheet` is rendered (~line 582), replace the inline
`items={segmentOrder.map(...)}` with a computed list that walks the segments
keeping a running minute offset:

```
let offset = 0
const items = segmentOrder.map((name) => {
  const dur = segmentDurations[name]
  const durLabel = dur ? `${dur} min` : null
  let detail = durLabel
  if (dur && programStartTime) {
    const start = toAmPm(programStartTime, offset)
    const end = toAmPm(programStartTime, offset + dur)
    detail = `${dur} min • ${start} – ${end}`
    offset += dur
  }
  return { name, detail }
})
```

- Segments with no configured duration keep today's behavior (`null` detail, or
  bare `X min` if only duration is missing a start time) and do **not** advance
  the offset.
- `toAmPm(timeStr, extraMinutes)` (line 1359, function-hoisted) is reused as-is;
  it already handles hour rollover and 12h formatting.

### 3. `ProgramConfirmSheet.jsx` — no change

It renders `item.detail` as a single pill. The combined string flows through.
Event and Sunday callers are unaffected (they pass `detail` without a range).

## Out of scope

- No new "separate badge" UI in the shared sheet — the combined pill matches the
  requested format.
- No changes to how `programStartTime` is edited (still Prep tab only).
- No persistence changes.

## Verification (manual, browser)

1. Cell Prep tab: set a program start time (e.g. 6:30 PM) and segment durations, save.
2. Open the Live meeting flow for that cell → tap the master button → "Today's Cell Program" modal appears.
3. Each segment shows `<dur> min • <start> – <end>`, ranges cumulative and matching the Prep tab's Time Window column.
4. Cell with no saved `programStartTime`: ranges compute from 7:00 PM default.
5. Segment with a blank duration: still renders without a range, following segments continue from the correct offset.

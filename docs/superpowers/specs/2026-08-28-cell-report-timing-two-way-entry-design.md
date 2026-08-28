# Cell Report Timing — Two-Way Time/Duration Entry

**Date:** 2026-08-28
**Component:** `src/pages/cell/EditReportSheet.jsx` → `TimingTab` (Edit Report modal, "Timing" tab)
**Scope:** Report-section data entry only. The live meeting timer (`MidweekMinistry.jsx` `LiveControlTab`) is unaffected.

## Problem

In the Edit Report modal's Timing tab, each segment row has an editable **duration**
box and a **read-only** computed clock window (`6:33 PM – 6:45 PM`) underneath it.
Someone filling in a report after the meeting often knows the actual clock times
("worship ran till 6:52") rather than the durations, and currently has to do the
subtraction in their head to enter it.

## Goal

Make each segment's **end time** an editable field. Editing it back-computes that
segment's duration. Editing the duration still updates the end time. Both inputs
drive the same underlying value, so the person can enter timings whichever way is
natural for that row.

## Behaviour

Answers that fix the design:
- **Editable field:** end time of each segment. Start stays read-only.
- **Knock-on effect:** later segments keep their durations and slide — identical to
  what editing a duration does today.

### Per-segment math

- `segStart` = Start Time (top field) + sum of every prior segment's duration → **read-only**
- `segEnd` = `segStart` + this segment's `durationMinutes` → **editable**
- Edit `segEnd` → `durationMinutes = max(0, minutesBetween(segStart, segEnd))` for that row only
- Edit the duration box → unchanged from today
- Because later rows are still rendered from `segStart(i) = startTime + Σ prior durations`,
  they move automatically when an earlier duration changes. No extra cascade code.

### First segment

Its `segStart` is the top **Start Time** field. Editing its end time sets its
duration relative to that.

## Data model — unchanged

`segmentTimings[]` stays `[{ name, durationMinutes }]`. End times are never stored —
editing one only rewrites `durationMinutes`. `handleSave` already derives
`endTime = addMinutesToTime(startTime, totalDurationMinutes)` and persists
`segmentTimings` + `startTime` + `endTime` via `updateCellReportFull`; none of that
changes. No Firestore schema or rules change.

## Changes — `src/pages/cell/EditReportSheet.jsx` only

### 1. `segmentRanges` memo returns structured data, not label strings

Currently (`~line 107`) it returns `string[]` of `"6:33 PM – 6:45 PM"` or `null`.
Change it to return, per segment:

```
{ startHHMM: "18:33", endHHMM: "18:45", startLabel: "6:33 PM" }   // when startTime is set
null                                                              // when startTime is empty
```

Still computed by walking the list with a running `cursor` (24h `HH:MM`), reusing
`addMinutesToTime`. `formatTime12h` is used for `startLabel` only; the raw
`startHHMM` / `endHHMM` feed the `<input type="time">` value and the diff.

### 2. New handler `onSegmentEndChange(index, endHHMM)`

```
const segStartHHMM = segmentRanges[index].startHHMM
const dur = Math.max(0, minutesBetween(segStartHHMM, endHHMM))
updateSegment(index, 'durationMinutes', dur)
```

`minutesBetween(a, b)` = `(hb*60+mb) - (ha*60+ma)` on the two `HH:MM` strings.
A negative result (end before start) clamps to `0`. No cross-midnight handling —
cell meetings do not span midnight; the person corrects an obviously-wrong entry.
Add `minutesBetween` as a small local helper in this file (next to the existing
`formatDuration`), or inline it in the handler.

### 3. `TimingTab` row markup

Replace the single read-only `<p>{segmentRanges[i]}</p>` line with a start
label + editable end input. Duration box and remove button are unchanged.

```
┌─────────────────────────────────────────────┐
│ [ Worship ................. ]  [ 12 ] min  × │
│   starts 6:33 PM   ·   ends [ 06:45 PM ⌄ ]   │
└─────────────────────────────────────────────┘
```

- `starts 6:33 PM` — plain text from `segmentRanges[i].startLabel`
- `ends` — `<input type="time">`, same styling family as the existing Start Time
  input, `value={segmentRanges[i].endHHMM}`, `onChange` → `onSegmentEndChange(i, e.target.value)`
- When `segmentRanges[i]` is `null` (no Start Time set): render nothing under the
  row (exactly today's behaviour) — the end input needs an anchor to compute
  against. Duration box still works.

`TimingTab` gains one prop: `onSegmentEndChange`. Wired at the call site
(`~line 278`) alongside the existing `onUpdate` / `onAdd` / `onRemove`.

## Out of scope

- No editable per-segment **start** time (start is always derived).
- No editable start time for anything other than the existing top Start Time field.
- No gap/overlap model — segments remain strictly back-to-back.
- No cross-midnight handling.
- No changes to `MidweekMinistry.jsx`, `firestore.js`, `date.js`, or the Cell Prep tab.
- `date.js` helpers are reused as-is; `minutesBetween` lives in `EditReportSheet.jsx`
  since no other file needs it.

## Verification (manual, browser)

1. Edit Report → Timing tab. Set Start Time `6:30 PM`; add segments with durations
   `3 / 12 / 25 / 15`. Each row shows `starts <t>` and `ends <t>` matching the
   cumulative schedule.
2. In row 2, change the **ends** time from `6:45 PM` to `6:50 PM`. Row 2's duration
   box becomes `17`. Rows 3 and 4 slide 5 min later; their durations stay `25` / `15`.
3. In row 1, type duration `5` instead of `3`. Row 1's end time input updates to
   `6:35 PM`; every later row slides.
4. Set an end time earlier than the row's start. Duration clamps to `0`
   (start == end); no negative value, no crash.
5. Clear the Start Time field. End-time inputs disappear; duration boxes still
   editable. Re-enter Start Time — inputs return with correct values.
6. Save, reopen the report. Durations round-trip; `startTime` / `endTime` persist
   as before.

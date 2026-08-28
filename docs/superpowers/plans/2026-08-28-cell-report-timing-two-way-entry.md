# Cell Report Timing — Two-Way Time/Duration Entry — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-08-28-cell-report-timing-two-way-entry-design.md`

**Goal:** In the Edit Report modal's Timing tab, make each segment's **end time** an
editable `<input type="time">`. Editing it back-computes that row's
`durationMinutes`; editing the duration still updates the end time. Later rows keep
their durations and slide automatically. No data-model, save-path, or Firestore change.

**Architecture:** One file — `src/pages/cell/EditReportSheet.jsx`. The `segmentRanges`
memo changes from `string[]` to a per-segment `{ startHHMM, endHHMM, startLabel } | null`.
A new `handleSegmentEndChange(index, endHHMM)` rewrites `durationMinutes` via the
existing `updateSegment`. `TimingTab` renders the new row and takes one new prop.
`date.js` (`addMinutesToTime`, `formatTime12h`) is reused unchanged.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/pages/cell/EditReportSheet.jsx` | Modify | `segmentRanges` memo shape; `minutesBetween` helper; `handleSegmentEndChange`; `TimingTab` row markup + new prop |

---

## Task 1: `segmentRanges` memo returns structured data

**File:** `src/pages/cell/EditReportSheet.jsx` (~line 105–116)

- [ ] **Step 1.** Replace the memo body so each element is either `null` (when
  `startTime` is falsy — unchanged condition) or an object:

  ```js
  const segmentRanges = useMemo(() => {
    if (!startTime) return segmentTimings.map(() => null)
    let cursor = startTime
    return segmentTimings.map((seg) => {
      const startHHMM = cursor
      const endHHMM = addMinutesToTime(cursor, Number(seg.durationMinutes) || 0)
      cursor = endHHMM
      return endHHMM
        ? { startHHMM, endHHMM, startLabel: formatTime12h(startHHMM) }
        : null
    })
  }, [startTime, segmentTimings])
  ```

  Keeps deps `[startTime, segmentTimings]`. `addMinutesToTime` returns `''` only on
  a malformed `cursor`; the `endHHMM ?` guard preserves today's null fallback.

## Task 2: `minutesBetween` helper + end-time change handler

**File:** `src/pages/cell/EditReportSheet.jsx`

- [ ] **Step 2.** Add `minutesBetween` to the Helpers block at the bottom of the file
  (next to `formatDuration`, ~line 506):

  ```js
  // Signed minute delta between two "HH:MM" strings (b - a). Negative when b is
  // earlier than a; callers clamp. No cross-midnight handling by design.
  function minutesBetween(aHHMM, bHHMM) {
    const [ah, am] = String(aHHMM).split(':').map(Number)
    const [bh, bm] = String(bHHMM).split(':').map(Number)
    if ([ah, am, bh, bm].some((n) => Number.isNaN(n))) return 0
    return (bh * 60 + bm) - (ah * 60 + am)
  }
  ```

- [ ] **Step 3.** Add the handler inside the component, next to `updateSegment`
  (~line 136):

  ```js
  function handleSegmentEndChange(index, endHHMM) {
    const range = segmentRanges[index]
    if (!range || !endHHMM) return
    const dur = Math.max(0, minutesBetween(range.startHHMM, endHHMM))
    updateSegment(index, 'durationMinutes', dur)
  }
  ```

  `updateSegment` already coerces `durationMinutes` via `Number(value) || 0`, so
  passing a number is fine.

## Task 3: Wire the new prop

**File:** `src/pages/cell/EditReportSheet.jsx` (~line 278, the `<TimingTab .../>` call)

- [ ] **Step 4.** Add `onSegmentEndChange={handleSegmentEndChange}` alongside the
  existing `onUpdate` / `onAdd` / `onRemove` props.

## Task 4: `TimingTab` row markup

**File:** `src/pages/cell/EditReportSheet.jsx` (~line 404–465)

- [ ] **Step 5.** Add `onSegmentEndChange` to the `TimingTab` destructured params.

- [ ] **Step 6.** In the `segments.map(...)` body, replace the current trailing
  block:

  ```jsx
  {segmentRanges?.[i] && (
    <p className="text-xs text-indigo-500 font-medium pl-1">{segmentRanges[i]}</p>
  )}
  ```

  with a start label + editable end input:

  ```jsx
  {segmentRanges?.[i] && (
    <div className="flex items-center gap-2 pl-1 text-xs text-slate-500">
      <span>starts <span className="font-medium text-indigo-500">{segmentRanges[i].startLabel}</span></span>
      <span className="text-slate-300">·</span>
      <label className="flex items-center gap-1">
        ends
        <input
          type="time"
          value={segmentRanges[i].endHHMM}
          onChange={(e) => onSegmentEndChange(i, e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </label>
    </div>
  )}
  ```

  Duration `<input>`, `min` label, and `×` button in the row above are untouched.
  When `segmentRanges[i]` is `null` (no Start Time) nothing renders here — same as today.

---

## Verification (manual, browser — `npm run dev`)

Edit Report modal → **Timing** tab (Cell Reports tab; new entry or edit existing):

1. Set Start Time `6:30 PM`; segments with durations `3 / 12 / 25 / 15`. Each row
   shows `starts <t> · ends <t>` cumulative: `6:30→6:33`, `6:33→6:45`, `6:45→7:10`,
   `7:10→7:25`.
2. Row 2 **ends** `6:45 PM` → `6:50 PM`: row 2 duration box becomes `17`; rows 3–4
   slide to `6:50→7:15`, `7:15→7:30`; their duration boxes stay `25` / `15`.
3. Row 1 duration `3` → `5`: row 1 end input shows `6:35 PM`; all later rows slide.
4. Row 3 **ends** set earlier than its start: duration box clamps to `0`, end == start,
   no negative, no crash. Correcting the value recovers.
5. Clear Start Time: the `starts/ends` line disappears on every row; duration boxes
   still editable. Re-enter Start Time: lines return with correct values.
6. Save, close, reopen the report: durations round-trip; `startTime` / `endTime`
   persist (unchanged save path).
7. `npm run build` succeeds.

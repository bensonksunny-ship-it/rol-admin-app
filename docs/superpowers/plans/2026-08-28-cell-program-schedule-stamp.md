# Today's Cell Program — Schedule Time Stamp — Implementation Plan

**Goal:** Show each segment's cumulative clock range (`20 min • 7:00 PM – 7:20 PM`) in the
"Today's Cell Program" confirmation modal, computed from the cell's configured program start time.

**Spec:** `docs/superpowers/specs/2026-08-28-cell-program-schedule-stamp-design.md`

**Architecture:** Two small edits inside `LiveControlTab` in `src/pages/MidweekMinistry.jsx`.
`ProgramConfirmSheet.jsx` is unchanged — the combined string rides through its existing
`item.detail` pill. `toAmPm()` (module-scope, function-hoisted, line ~1359) is reused.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/pages/MidweekMinistry.jsx` | Modify | `LiveControlTab`: read `programStartTime`; build confirm-sheet items with cumulative ranges |

---

## Task 1: `LiveControlTab` reads `programStartTime`

**File:** `src/pages/MidweekMinistry.jsx`

- [ ] **Step 1: Add state.** Near the other session state (~line 188, beside `segmentOrder` /
  `segmentDurations`):

  ```js
  const [programStartTime, setProgramStartTime] = useState('19:00')
  ```

- [ ] **Step 2: Populate from settings.** In the `getMidweekSettings(selectedCellId).then((s) => { … })`
  block (~line 288), set it alongside the existing `segmentOrder` / `segmentDurations` handling:

  ```js
  setProgramStartTime(s?.programStartTime || '19:00')
  ```

  Placed so it always runs (sets the `'19:00'` default when the cell has no saved start time),
  mirroring how `segmentOrder` falls back to `DEFAULT_SEGMENTS`.

## Task 2: Build confirm-sheet items with cumulative ranges

**File:** `src/pages/MidweekMinistry.jsx`

- [ ] **Step 3: Replace the inline `items` prop.** At the `ProgramConfirmSheet` render (~line 580),
  change:

  ```jsx
  items={segmentOrder.map(s => ({ name: s, detail: segmentDurations[s] ? `${segmentDurations[s]} min` : null }))}
  ```

  to a computed list (define just above the `return`, or as an IIFE in the prop):

  ```js
  const confirmItems = (() => {
    let offset = 0
    return segmentOrder.map((name) => {
      const dur = segmentDurations[name]
      if (!dur) return { name, detail: null }
      let detail = `${dur} min`
      if (programStartTime) {
        const start = toAmPm(programStartTime, offset)
        const end = toAmPm(programStartTime, offset + dur)
        detail = `${dur} min • ${start} – ${end}`
        offset += dur
      }
      return { name, detail }
    })
  })()
  ```

  and pass `items={confirmItems}`.

  - Segments with no configured duration → `detail: null` (today's behavior), offset not advanced.
  - `–` is an en dash, matching the Prep tab's Time Window column (line ~1634).

---

## Verification (manual, browser — `npm run dev`)

1. Cell Prep tab: set program start time 6:30 PM + segment durations, save.
2. Live meeting flow for that cell → tap master button → "Today's Cell Program" modal.
3. Each segment shows `<dur> min • <start> – <end>`; ranges cumulative, matching the Prep tab.
4. Cell with no saved `programStartTime` → ranges start from 7:00 PM.
5. Segment with blank duration → renders name only, later segments keep the right offset.
6. Regression: Event Program modal (`DepartmentHub`) and Sunday confirm sheet still show plain `X min`.

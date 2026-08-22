# Worklist Sheet: Workhub Insights Panel

## Problem

The Worklist Sheet (`/worklist`, `src/pages/WorklistSheet.jsx`) tracks up to 30 tasks per sheet (`row.work`, `row.date`, `row.department`, `row.doneDate`) but gives the Founder no at-a-glance read on how a sheet is doing — how many tasks are assigned, how many are done, which departments the work is concentrated in, or what's been sitting open the longest. This adds a "Workhub" insights panel to answer those questions without leaving the page.

## Scope

**Active sheet only** — the Workhub reflects whichever sheet tab is currently open, not a cross-sheet total. Rationale: sheets are sequential pages of the same physical notebook: aggregating across all of them would mix old, already-worked-through pages with the current one, and the numbers would need to shift every time a new page auto-appears. Scoping to the active sheet keeps the panel answering "how is *this* page doing" — consistent with how the existing `{filled} / {total} tasks` counter in the table's toolbar already works.

## Data Source

Purely derived from `activeSheet.rows` (already in memory from the existing `subscribeWorklistSheets` live subscription) — no new Firestore reads, no new collection, no persisted state. Recomputed inline on every render; 30 rows is cheap enough that no `useMemo` is needed.

## Component: `WorkHub`

New function component in `WorklistSheet.jsx`, rendered in `WorklistSheet`'s return between the page title/subtitle and the sheet-tabs row (`role="tablist"`), so it sits above the tabs — not inside `WorklistTable`, since it needs to stay visible independent of which cell is being edited.

```jsx
<WorkHub sheet={activeSheet} />
```

### Stat cards (row 1)

Four compact cards, computed from `sheet.rows`:

1. **Assigned** — `{filledCount} / {WORKLIST_ROWS_PER_SHEET}`, where `filledCount` = rows with a non-empty `work` (same definition already used by the toolbar counter and `isSheetFull`).
2. **Completed** — count of rows with a non-empty `doneDate`. Styled emerald, matching the Completed column's existing color convention.
3. **Avg. completion** — average of `(doneDate − date)` in days, across rows where **both** `date` and `doneDate` are set (parsed the same way `formatDuration` already does). The average is then formatted through the same compact bucketing `formatDuration` uses ("Same day", "1 day", "Nd", "Nw", "Nmo", "Ny") so the label style matches the table. Shows "—" when no row has both dates yet.
4. **Oldest open** — among rows with `work` set but **no** `doneDate`, the one with the earliest `date`. Displays the elapsed-since-`date` span (reusing the existing day-bucketing) plus a truncated snippet of `work` (e.g. "5d · Call the vendor…"). Shows "None" when every assigned task already has a `doneDate`, or when there are no assigned tasks at all.

### Department breakdown (row 2)

Small pill/chip per department, one per distinct non-empty `row.department` value among **assigned** rows (`work` set), labeled via the existing `displayDeptName` helper, showing a count (e.g. `Cell 4`, `Worship 2`), sorted by count descending. The whole row is omitted entirely if no assigned row has a department set yet — no "no data" placeholder chip, just nothing.

### Empty state

The four stat cards always render, even on a sheet with zero assigned rows (`Assigned` shows `0 / 30`, `Completed` shows `0`, `Avg. completion` and `Oldest open` show their "—"/"None" fallback) — the panel doesn't appear/disappear as a fresh sheet goes from empty to having its first task, avoiding layout jump.

## Visual Style

Matches the existing stat-card language already used elsewhere in the app (rounded-lg, bordered, `bg-white dark:bg-slate-900` cards) rather than introducing a new visual pattern. Cards wrap responsively (`flex flex-wrap gap-2`) rather than forcing a fixed 4-column grid, so they degrade gracefully at narrower widths. Department chips reuse the small-pill style already established by `SheetTab`/toolbar buttons (rounded-full or rounded-lg, `text-xs font-semibold`).

## Out of Scope

- No cross-sheet aggregation (see Scope above).
- No persisted/cached stats — always computed live from the current `rows` array.
- No click-through/filtering from a stat card or department chip back into the table (e.g. clicking "Cell 4" doesn't filter rows) — this is a read-only glance panel, not an interactive dashboard.
- No date-range filtering (e.g. "this week's completions") — the whole sheet's data is always what's shown.

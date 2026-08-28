# Director Dashboard — Mobile Card Layouts for Cell Report Tables

**Date:** 2026-08-28
**Component:** `src/components/DirectorDashboard.jsx` → `MissingCellReportsTable`, `TenWeekComplianceTable`
**Where it renders:** Cell **summary** tab, via `CellDirectorCockpit` → `DirectorDashboardCellWidgets`.

## Problem

Both tables use a multi-column `<table>` inside `overflow-x-auto`. On phones the
columns collapse: dates wrap mid-string (`2026-\n08-26`), leader names wrap, and
the status pills squish. `overflow-x-auto` doesn't help because the table's
`min-w-full` lets it shrink rather than scroll.

## Goal

On screens below `md` (768px), replace each table with a stacked card list. Keep
the desktop table exactly as-is.

## Behaviour (fixed by clarifying answers)

- **Target:** the two tables in `DirectorDashboard.jsx`. Not `CellReport.jsx`'s
  separate table; not `CellHistory` (already card-based).
- **10-week missing-weeks reveal:** expands **inline** inside the mobile card
  (desktop keeps its floating dropdown).
- **Compact dates (`26 Aug`):** mobile cards only. The desktop table keeps its
  ISO `2026-08-26`.
- **FAB clearance (req #3):** already provided by `MainLayout.jsx:53`
  (`pb-[calc(7rem + env(safe-area-inset-bottom))]` on every mobile page). No
  per-component padding added.

## Changes — `src/components/DirectorDashboard.jsx` only

### 1. Shared helpers (extract from currently-duplicated inline JSX)

- [ ] `cellReportStatusBadge(row, isDismissed)` → `{ label, cls, dotCls }`.
  Collapses the 5-way branch currently inline in `MissingCellReportsTable`'s
  status `<td>` (submitted / dismissed / `isDue` / `isMeetingToday` / upcoming).
  A small `<StatusPill>` component renders `{ label, cls, dotCls }` as the existing
  `inline-flex … rounded-full` pill with its leading dot. Table cell and mobile
  card both use it.
- [ ] `<MissingWeeksList weeks={missingWeeks} />` — the
  `• Week of {format(parseISO(w.weekStart), 'd MMM yyyy')}` `<ul>` currently inside
  `TenWeekComplianceTable`'s dropdown. Reused by the desktop dropdown and the
  mobile inline expansion.

### 2. `MissingCellReportsTable` — responsive split

Wrap the existing `<div className="overflow-x-auto"><table>…</table></div>` as
`hidden md:block`. Add a sibling `<div className="md:hidden divide-y divide-slate-100">`
rendering one card per `row`:

```
┌─────────────────────────────────────────┐
│ {row.cellName}                 <StatusPill>  │   name: font-semibold text-slate-800
│ {row.leaderName || '—'}  ·  Due {compactDate} │   text-xs text-slate-500
│ [ Remind ] [ Dismiss ]   |  [ Undo ]         │   same states as table
└─────────────────────────────────────────┘
```

- Card container: `px-5 py-4`
- Top row: `flex items-start justify-between gap-3` — name left, `<StatusPill>` right
- Meta line: leader + `Due {compactDate(row.expectedDate)}` where
  `compactDate(iso)` = `iso ? format(parseISO(iso), 'd MMM') : '—'`
- Actions: reuse the exact button JSX/handlers from the table's last `<td>`
  (`remindLeader`, `remindingIds`, `remindedIds`, `onDismiss`, `onUndismiss`);
  render the row only when `row.isDue && !isDismissed`, plus the `Undo` button when
  `isDismissed`. Left-aligned (`flex gap-2`), `mt-3`.

### 3. `TenWeekComplianceTable` — responsive split

Same wrap: existing table becomes `hidden md:block`; new
`<div className="md:hidden divide-y divide-slate-100">` with one card per row:

```
┌─────────────────────────────────────────┐
│ {row.cellName}                              │   font-semibold text-slate-800
│ {row.leaderName || '—'}                     │   text-xs text-slate-500
│ <badge button — same as table>              │   toggles openCellId
│ <MissingWeeksList> (when isOpen && missing) │   inline, mt-2, no absolute layer
└─────────────────────────────────────────┘
```

- The badge `<button>` is the same element as the desktop table
  (`tenWeekBadgeStyle` / `tenWeekBadgeLabel`, `onClick` toggles
  `openCellId === row.cellId`).
- When `isOpen && missingWeeks.length > 0`: render `<MissingWeeksList>` directly
  below the badge inside the card flow (no `fixed` backdrop, no `absolute` panel).
- Desktop `<td>` keeps its existing `fixed` backdrop + `absolute` dropdown
  unchanged.

## Out of scope

- Any change to the desktop tables' markup, columns, or date format.
- `CellReport.jsx`, `CellHistory.jsx`.
- FAB / container padding (handled by `MainLayout`).
- `CellWeeklyTrendsChart`, `CellMemberGrowthChart` (already responsive via recharts).

## Verification (manual, browser — `npm run dev`, DevTools mobile viewport ~390px)

Cell page → **summary** tab (as a Cell Director / Founder):

1. **Cell Report Status** renders as cards below `md`: cell name + status pill on
   the top line, `Leader · Due 26 Aug` beneath, no wrapped/split dates.
2. Resize past 768px → the original table returns; cards hidden. Both never show at
   once.
3. A due cell's card shows **Remind** + **Dismiss**; tap Remind → `Sending…` →
   `✓ Reminded`; tap Dismiss → card's pill becomes **Dismissed** and an **Undo**
   button appears; Undo restores.
4. Status pill wording matches the desktop table for each state (Submitted,
   Dismissed, Due, Meeting Today, Upcoming).
5. **Report Submission Tracking** renders as cards below `md`. Tapping a cell's
   badge expands the missing-week list *inside* that card, pushing later cards
   down; tapping again collapses it. No panel clipping at the screen edge.
6. Desktop 10-week table: badge still opens the floating dropdown as before.
7. Cells with 0 missing: badge shows `10/10 Submitted`, not clickable, no expansion.
8. `npm run build` succeeds; `npx eslint src/components/DirectorDashboard.jsx` clean.

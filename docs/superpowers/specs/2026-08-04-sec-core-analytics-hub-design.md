# Sec-Core Analytics Hub — Design Spec

**Date:** 2026-08-04
**Status:** Approved

## Overview

Replace the Sec-Core `summary` tab's generic placeholder (tasks/entries feed, not meaningful for this department) with a read-only analytics dashboard summarizing board agenda health, Sunday leader coverage, leadership roster, and department expenses. Uses Recharts (already installed) for all charts, following the pattern established by `DLightDirectorDashboard.jsx`. All data derives from existing Firestore collections already read by Sec-Core's other tabs — no new backend work, no schema changes, no new dependencies.

## Access Control

Visible to anyone with Sec-Core department access (department-level access is already gated before `DepartmentHub` renders). No separate `canEdit` gate — the hub is purely read-only reporting with no write actions.

## Data Sources

| Data | Source | Function |
|------|--------|----------|
| Leadership roster | `sec_core/director_board` doc, `members[]` | `subscribeToDirectorBoard` |
| Sunday leader schedule | `sec_core_sunday_leader` collection | `getSecCoreSundayLeaderEntries(26)` |
| Board agenda points (all departments) | `board_points` collection | `subscribeToBoardPoints` |
| Sec-Core expenses | `finance_expense` filtered by `department === 'Sec-Core'` | `subscribeFinanceExpenseByDept('Sec-Core', ...)` |

All four are subscribed independently inside the new component (self-contained, matching how `DirectorBoardTab`/`SundayLeaderTab`/`BoardAgendaTab` already fetch their own data rather than threading state through `DepartmentHub`).

## Component

New export `SecCoreAnalyticsHub` added to `src/pages/seccore/SecCoreSummary.jsx` (same file as the other three Sec-Core tab components). No props required.

`DepartmentHub.jsx` renders `<SecCoreAnalyticsHub />` in a new `slug === 'sec-core'` branch of the `summary` tab's if/else chain (inserted before the final generic-default branch, alongside the existing `caring`/`d-light`/`accounts` branches). The existing "Total Expense (This Month)" card above the branch (shown for every department) is left untouched.

## Layout

```
[ KPI row: 4 tiles — grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ]
[ Charts row: 3 charts — grid-cols-1 lg:grid-cols-3 gap-4 ]
[ Insight cards: up to 4 — grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ]
```

## Sections

### 1. KPI Tiles (top row, 4 columns)

| Tile | Value | Sub-text |
|------|-------|----------|
| Agenda Completion | `round(approved / total * 100)`% of all board points | `"{pending} pending"` |
| Sunday Coverage | `"{covered}/{4}"` of next 4 upcoming Sundays with a `leader` assigned | list of missing dates, or "All covered" |
| Active Roster | count of roster members where `!to \|\| to >= today` | `"D:{d} · C:{c} · S:{s}"` breakdown by `type` |
| Board Points This Month | count of points with `createdAt` (fallback `meetingDate`) in current month | `"from {N} departments"` (distinct `department` values) |

### 2. Agenda Completion (Recharts BarChart)

- Two bars: Approved vs Pending, counted from all `board_points` (`status === 'approved'` vs not).
- Colors: emerald (`#10b981`) approved, amber (`#f59e0b`) pending.

### 3. Expense Trend (Recharts BarChart)

- X axis: last 6 months (labels).
- Y axis: total Sec-Core expense amount per month, summed from `finance_expense` entries' `amount`/`date`.
- Same bar styling as `DLightDirectorDashboard`'s monthly trend (indigo `#6366f1`).

### 4. Leadership Rotation (Recharts BarChart)

- X axis: last 4 quarters (labels e.g. "Q1 '26").
- Y axis: count of roster members whose `from` date falls in that quarter (new appointments started).
- Color: violet (`#8b5cf6`), matching the Coordinator accent already used in `POSITION_STYLES` in this file.

### 5. Insight Cards (bottom row, up to 4)

| Card | Logic |
|------|-------|
| Unassigned Sundays | Next 4 upcoming Sundays (from today) without a `leader` in `sec_core_sunday_leader`. Empty state: "All upcoming Sundays covered." |
| Stale Pending Points | Board points with `status !== 'approved'` and `createdAt` older than 14 days. Shows count + oldest department. |
| Roster Renewals Due | Roster members with `to` set and within the next 30 days. Lists name + date. |
| Most Active Sunday Leader | From the last 12 `sec_core_sunday_leader` entries, the `leader` name appearing most often, with count (rotation-fairness nudge). |

Each card: empty state renders a muted "Nothing to flag" message rather than hiding, so the grid stays stable.

## Chart Library

**Recharts** (`recharts@^3.8.0`, already in `package.json`). Import only `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `Cell`. No new dependencies.

## Styling

Matches the existing design system (same as `DLightDirectorDashboard.jsx`):
- Card container: `bg-white rounded-xl border border-slate-200 shadow-sm`
- KPI values: `text-2xl`/`text-3xl font-bold`/`font-extrabold`
- Chart tooltips: `contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}`
- Colors: emerald (good/approved), amber (pending/warning), indigo (expenses/primary), violet (roster/rotation) — consistent with existing `POSITION_STYLES` accents in `SecCoreSummary.jsx`.

## File Changes

| File | Change |
|------|--------|
| `src/pages/seccore/SecCoreSummary.jsx` | Add `SecCoreAnalyticsHub` export (new data hooks + KPI/chart/insight JSX) |
| `src/pages/DepartmentHub.jsx` | Import `SecCoreAnalyticsHub`; add `slug === 'sec-core'` branch in the `summary` tab's if/else chain |

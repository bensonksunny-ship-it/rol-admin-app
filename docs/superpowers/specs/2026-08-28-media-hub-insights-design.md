# Media Hub — graphs & insights

**Date:** 2026-08-28
**Page:** `/department/media` (summary tab), `DepartmentHub.jsx` `slug === 'media'`

## Problem

The Media Hub shows only a "Total Expense (This Month)" strip and the Sunday
Program assignment table. A Media director has no at-a-glance view of crew
coverage, rotation balance, team make-up, or operational load.

## Goal

A dashboard on the Media Hub — a stat grid plus Recharts chart tiles — covering
crew coverage, serving load, team composition, and tasks/spend. The existing
Sunday Program table stays, below the insights.

## Approach

New component **`src/components/MediaHub.jsx`** (`DepartmentHub.jsx` is already
~11k lines — this stays out of it). Rendered in the `slug === 'media'` branch of
the summary tab, above the Sunday Program card. Visual language follows the
existing Caring-Hub dashboard: a 2×2 stat grid + collapsible chart tiles (like
its "PCS by Year" tile).

Charts use **Recharts** (already a dependency; used in `DirectorDashboard`,
`SecCoreSummary`, `DepartmentWorship`, `Finance`, …). Palette and light/dark
handling per the `dataviz` skill — semantic roles: indigo = primary/neutral,
emerald = filled / done / positive, rose = gap / open / overdue.

## Data

| Source | How |
|---|---|
| `media_schedule` docs | **new** `getMediaSchedules()` in `firestore.js` — `getDocs(query(collection 'media_schedule', where department == 'Media'))`, mapped to `{ id, date, assignments }`, sorted by `date` asc. New load effect on `slug === 'media' && activeTab === 'summary'` → `mediaSchedules` state. |
| team | existing `team` state (`subscribeDepartmentTeamMembers`) |
| tasks | existing `tasks` state (`subscribeTasksByDepartment`) |
| sub-departments | re-add `(slug === 'media' && activeTab === 'summary')` to the `wantsSubOrTeam` condition of the sub-dept load effect (it was removed with the old assignment panel) → existing `subDepartments` state |
| expenses | reuse `subscribeFinanceExpenseByDept('Media')` — keep the raw entries array in a new `mediaExpenseEntries` state alongside the existing this-month total, pass through to `<MediaHub>` |

`<MediaHub>` props: `team`, `tasks`, `subDepartments`, `schedules`,
`expenseEntries`, `onGoToAssign` (calls `setActiveTab('assign')` +
`setSearchParams({ tab: 'assign' })`).

A `media_schedule` doc's `assignments` array holds **only** rows where a member
was picked: `[{ subDeptId, role, memberId, memberName }]`. So for a given Sunday:
`totalRoles = subDepartments.length`, `filled = assignments.length`.

## Sections

### 1. Stat row — four tiles

| Tile | Value | Sub-line |
|---|---|---|
| Team | count of active members (`!isFormer && status !== 'former'`) | `+N former` when any |
| Serving areas | `subDepartments.length` | — |
| This Sunday | `filled / totalRoles` + a progress bar | `N slots open` (rose when > 0); "no plan yet" when no schedule doc for the coming Sunday |
| Open tasks | `tasks.filter(status !== 'Completed').length` | `N overdue` (deadline < today) when any |

"Coming Sunday" = the next Sunday date string (today if today is Sunday), matched
against `schedules` by `date`.

### 2. Crew coverage — next 5 Sundays

Recharts stacked `BarChart`, one bar per upcoming Sunday: `filled` (emerald)
stacked under `open` (rose), `open = max(0, totalRoles - filled)`. X axis = `d
MMM`. Below: for the coming Sunday, a comma list of the sub-department names with
no assignment, and a **"Go to Assign"** button (`onGoToAssign`). Empty state (no
schedules at all): *"Assign crew in the Assign tab to see coverage here."*

### 3. Serving load — recent Sundays

Take the last 8 `schedules` by date. Count `memberId` occurrences across their
`assignments`. Horizontal `BarChart`, one row per member who has ≥1 assignment,
sorted desc (indigo). Caption: when the top member holds > 40% of all
assignments, *"{name} has {n} of {total} assignments — consider spreading the
load."* Plus a line listing active team members with **0** assignments in that
window (*"Not yet rostered: …"*). Empty state as §2.

### 4. Team by serving area

Recharts vertical `BarChart`: active-member count per sub-department (a member
counts once per entry in their `subDepartments`), plus an **Unassigned** bar
(active members with an empty `subDepartments`). Caption: `{active} active ·
{former} former`.

### 5. Tasks & spend — two mini panels

- **Tasks**: open vs completed over the last 60 days — a single split horizontal
  bar (rose = open, emerald = done) with the two counts beside it.
- **Spend**: last 6 calendar months bucketed from `expenseEntries` (`₹` per
  month) as small bars; the current month's value called out above. Undated
  entries ignored.

## Layout

Stat grid → coverage tile → serving-load tile → team-by-area tile → tasks/spend
row. Chart tiles are collapsible (default expanded; the Caring Hub's tile
component pattern). Then the existing Sunday Program card, unchanged.

## Files touched

| File | Change |
|---|---|
| `src/components/MediaHub.jsx` | **new** — the dashboard |
| `src/services/firestore.js` | `getMediaSchedules()` |
| `src/pages/DepartmentHub.jsx` | `mediaSchedules` + `mediaExpenseEntries` state + load; re-enable sub-dept load on media summary; render `<MediaHub>` in the media summary branch |

## Out of scope

No new collections beyond the `getMediaSchedules` reader. No other department
hubs. No change to the Assign tab, the Expense tab's own chart, or the Sunday
Program table.

## Verification (manual)

1. Media Hub shows the stat grid + four chart areas above Sunday Program.
2. With no `media_schedule` data: coverage and serving-load tiles show their
   empty states; team and stat tiles still render from team data.
3. Save a crew plan in the Assign tab for a coming Sunday → "This Sunday" tile
   and the coverage chart reflect it; "Go to Assign" navigates to the Assign tab.
4. Assign the same person to many Sundays → they top the serving-load chart and
   the imbalance caption appears.
5. Add expense entries across months → the spend mini-panel shows the trend.
6. Other departments' hubs unchanged.

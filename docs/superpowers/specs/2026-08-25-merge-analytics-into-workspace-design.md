# Merge Analytics ("Hub") into My Workspace

## Problem

`Analytics.jsx` (route `/analytics`) is a Founder-only page with the church-wide stat tiles, charts (attendance/visitors/finance trends), advance payout review, and recent-activity lists the Founder thinks of as "the hub." Nothing in the app currently links to it — it's reachable only by typing the URL directly, so in practice the Founder doesn't have a way to reach it from normal navigation. Meanwhile `MyWorkspace.jsx` (`/`) is the Founder's actual landing page, showing `EdenGardenGrid` (a department icon grid) plus the notification-center widgets (to-do list, worship assignment, board meeting invite). The Founder wants the graphs/insights folded into this one landing page instead of living on a separate, unreachable route.

## Goals

- The Founder sees the graphs/insights (today's `/analytics` content) directly on `/` (My Workspace), without navigating anywhere else.
- Keep the existing department icon grid (`EdenGardenGrid`) and the notification-center widgets (to-do list, worship widget, board meeting widget) exactly as they are today — this only adds the insights content, doesn't remove anything.
- Retire the orphaned `/analytics` route cleanly (redirect, not a dead link) since its content now lives on `/`.

## Non-goals

- No change to non-Founder My Workspace — this only affects what a Founder sees on `/`.
- No change to the underlying data-fetching logic of any of the moved charts/stats — the same Firestore calls (`getTasks`, `getAttendance`, `getFinanceIncome`, `getFinanceExpense`, `getDelightVisitors`, `getCellGroups`, `getAllBoardPoints`), just relocated.
- No consolidation of this panel's data-fetching with `ToDoListCard`/`BoardMeetingWorkspaceWidget`'s own independent fetches, even where there's topical overlap (e.g. board points) — matches the existing pattern where every workspace widget manages its own data.

## Design

### 1. `src/components/workspace/FounderInsightsPanel.jsx` (new)

Extracted from `Analytics.jsx`'s body:
- The 7 stat tiles (Attendance YTD, Visitors This Month, Active Cell Groups, Income YTD, Expense YTD, Balance YTD, Pending Tasks).
- The 3 charts (Attendance trend, New Visitors trend, Income vs Expense) — same Recharts components, same data shaping.
- `AdvancePayoutReviewer`.
- The bottom bento (Recent Visitors, Board Meeting Agenda, Open Tasks).

Dropped from the extraction:
- The hero banner ("Eden Garden" title, date, quick counts) — redundant once this renders inside `MyWorkspace.jsx`, which already has its own greeting header showing "Eden Garden" for a Founder.
- The `if (userProfile && !isFounder) return <Navigate to="/" />` guard — redundant once the only call site (`MyWorkspace.jsx`) already wraps this in `{isFounder && ...}`.

Everything else (the data-loading `useEffect`, all derived stats, the loading spinner state) moves over unchanged.

### 2. `src/pages/MyWorkspace.jsx`

```jsx
{isFounder && (
  <>
    <FounderInsightsPanel />
    <EdenGardenGrid />
  </>
)}
<ToDoListCard />
<WorshipWorkspaceWidget />
<BoardMeetingWorkspaceWidget />
```
Insights panel first, then the department icon grid, then the existing notification-center widgets — per your call on ordering.

### 3. `src/App.jsx`

Replace the `<Route path="analytics" element={<Analytics />} />` route with a redirect to `/`, and delete `src/pages/Analytics.jsx` (its content now lives in `FounderInsightsPanel.jsx`):
```jsx
<Route path="analytics" element={<Navigate to="/" replace />} />
```

## Data flow

```
MyWorkspace mounts (Founder) →
  FounderInsightsPanel's own useEffect fetches tasks/attendance/finance/visitors/cells/boardPoints
  EdenGardenGrid renders its own department tiles (unchanged, own data)
  ToDoListCard / WorshipWorkspaceWidget / BoardMeetingWorkspaceWidget each fetch independently (unchanged)
```

## Testing

Manual, per `CLAUDE.md`:
1. Log in as Founder, land on `/` — confirm the insights panel (stat tiles + 3 charts + payout reviewer + bottom bento) renders above the department icon grid, above the to-do list.
2. Log in as a non-Founder director — confirm `/` is unchanged (no insights panel, no department grid, just the notification-center widgets as before).
3. Navigate to `/analytics` directly — confirm it redirects to `/` instead of 404ing or showing a stale page.
4. Confirm every stat tile's "→" link (Visitors, Active Cell Groups, Pending Tasks) still navigates correctly from its new location.

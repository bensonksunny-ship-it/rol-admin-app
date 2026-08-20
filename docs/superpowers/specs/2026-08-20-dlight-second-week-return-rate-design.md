# D-Light Hub: 2nd Week Return Rate KPI Card

## Problem

The D-Light Hub dashboard (`DLightDirectorDashboard.jsx`, rendered on `/department/d-light?tab=summary` for D-Light directors) shows visitor counts, source breakdowns, and team stats, but has no retention metric. Directors have no way to see what fraction of first-time visitors come back for a second Sunday.

## Formula

```
2nd Week Return Rate = (First-time visitors who returned for a 2nd Sunday
                         / Total first-time visitors in the selected period) × 100
```

- **First-time visitor** = a `delight_visitors` record, keyed by its `attendedDate` (the date of their first visit).
- **Returned for a 2nd Sunday** = the visitor's name appears in a `sunday_reports` attendance field on any date strictly after their `attendedDate`, within a 29-day window (`SECOND_WEEK_WINDOW_DAYS`, already defined in `src/utils/weekComers.js` and used by the existing "second week comer" Follow-Up panel), capped at today if the window hasn't closed yet.
- **Selected period** filters which visitors count as "first-time" for the denominator: **This Month**, **Last 30 Days**, or **Year-to-Date**. Visitors are included even if their 29-day return window hasn't fully elapsed yet (they just won't show as returned until they actually come back).

### Why "strictly after attendedDate", not "≥2 weeks logged"

Adding a D-Light visitor writes only to `delight_visitors` — it does **not** create or touch an entry in that Sunday's `sunday_reports` doc (confirmed via existing comment in `SundayReport.jsx` describing D-Light suggestions that "never wrote to report.newComers"). So a visitor's first-visit Sunday may never appear in `sunday_reports` at all. Counting "attended on any date after `attendedDate`, within the window" sidesteps that gap entirely — it doesn't matter whether the first visit was logged, only whether a later one was.

### Why the 29-day window

`src/utils/weekComers.js` already defines `SECOND_WEEK_WINDOW_DAYS = 29` and uses it to decide which visitors are candidates for the "second week comer" list shown in the D-Light Follow-Up panel and Sunday Ministry Report. Reusing the same constant keeps this new metric consistent with that existing feature rather than introducing a second, different definition of "second week."

## Data Sources

- `delight_visitors` (already loaded in `DepartmentHub.jsx` as `delightVisitors`, passed to `DLightDirectorDashboard` as the `visitors` prop) — no change.
- `sunday_reports` — needs per-week, per-name attendance detail (not just an aggregate count), which no existing `firestore.js` export provides. New helper described below.

## New firestore.js Helper

```js
export async function getSundayAttendanceNameSetsInRange(startDateStr, endDateStr)
// returns: [{ date: 'yyyy-MM-dd', names: Set<normalizedLowercaseName> }, ...]
```

- Queries `sunday_reports` where `date` is between `startDateStr` and `endDateStr` (same pattern as the existing `getSundayAttendanceCountsByNameInRange`).
- For each report doc, unions the same fields already unioned by `addSundayReportAttendanceCounts` (`nonCell`, `others`, `newComers`, `secondWeekAttendeesNames`, `thirdWeekAttendeesNames`, `fourthWeekAttendeesNames`, and every cell's `sundayCellAttendance` array), normalized via `trim().toLowerCase()`.
- Refactor: extract the per-doc name-union logic currently inlined in `addSundayReportAttendanceCounts` into a shared `extractAttendanceNamesFromReport(data) => Set<string>` helper, used by both the existing counts function and this new one. No behavior change to existing callers.

## Component Change: `DLightDirectorDashboard.jsx`

New card, placed directly after the existing 4-tile KPI row (`This Month` / `Visitors This Year` / `Team Members` / `Open Tasks`) and before the "Charts Row 1" (Monthly Trend / Year-on-Year).

**State:**
- `returnPeriod` (`'thisMonth' | 'last30' | 'ytd'`, default `'thisMonth'`) — local `useState`.
- `attendanceNameSets` (`[]`) — result of the new helper, loaded via `useEffect`.
- `loadingReturnRate` (`bool`).

**Fetch:** On mount and whenever `returnPeriod` changes, compute `periodStartStr` (start of month / today-30 / start of year) and call `getSundayAttendanceNameSetsInRange(periodStartStr, todayStr)`. Wrapped in try/catch; on failure, sets an empty result set (card shows `—`) rather than throwing, matching the app's existing `.catch(() => [])` convention.

**Calculation** (`useMemo`, depends on `visitors`, `returnPeriod`, `attendanceNameSets`):
1. `firstTimers = visitors.filter(v => v.attendedDate is within [periodStart, today])`
2. For each visitor, `windowEnd = min(today, attendedDate + 29 days)`
3. `returned = firstTimers.filter(v => some entry in attendanceNameSets has date in (v.attendedDate, windowEnd] AND its names set contains normalizeName(v.name))`
4. `rate = firstTimers.length ? Math.round(returned.length / firstTimers.length * 100) : 0`

**Rendering:**
- Card header: "2nd Week Return Rate"
- Segmented toggle (3 buttons: This Month / Last 30 Days / YTD) — same visual language as other toggle controls in the codebase (small pill buttons, active state highlighted)
- Large percentage (`text-3xl font-extrabold`, same scale as existing `KpiTile`)
- Sub-text: `"{returned.length} of {firstTimers.length} first-time visitors returned within 4 weeks"`, or `"No first-time visitors in this period"` when `firstTimers.length === 0`
- Loading state: card shows "Loading…" while `loadingReturnRate` is true, matching the dashboard's existing top-level loading pattern

## Out of Scope

- No changes to `DepartmentHub.jsx` — the dashboard component already owns all D-Light KPI computation, this follows the same pattern.
- No new Firestore collections or security rule changes — reads only from collections D-Light directors already have access to.
- No backfill/historical exclusion logic for visitors whose window hasn't closed (explicitly decided: include them in the denominator as-is).

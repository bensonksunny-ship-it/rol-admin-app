# Accounts Summary Month Picker

Extends [2026-08-21-accounts-summary-year-picker-design.md](2026-08-21-accounts-summary-year-picker-design.md) with month-level drill-down.

## Problem

The year picker on the Accounts Summary tab only offers two granularities: "this month" (current year, hardcoded to today) or "the whole year" (past years). There's no way to look at, say, March of last year, or June of this year while it's August.

## Goals

- For any selected year (current or past), let the user drill into a specific month via a Jan–Dec picker, or view the whole year via an "All" option.
- Selecting a month filters the Summary cards to that month, and carries into the Income/Expense quick-nav tiles so they open on that exact month.
- The month choice persists the same way the year does (sticky across reloads, reset only after the tab's been closed/hidden for more than 5 minutes).

## Non-goals

- No change to `WeeklyEntryPage.jsx` or the Weekly quick-nav tile — still a rolling current-week view, untouched by month selection.
- No restriction on picking a future month of the current year (e.g. December while it's August) — it'll simply show zero entries, consistent with how the rest of the app doesn't guard against empty date ranges.
- No change to any other department's pages.

## Design

### 1. `src/hooks/useAccountsSummaryPeriod.js` (renamed from `useAccountsSummaryYear.js`)

Manages both `selectedYear` and `selectedMonth` (`0`–`11`, or `null` meaning "All months").

**Storage keys (localStorage):**
- `accountsSummaryYear` — selected year, as a string.
- `accountsSummaryMonth` — selected month index as a string, or absent/`"all"` for "All months".
- `accountsSummaryClosedAt` — ms timestamp of the last time the tab went hidden/closed (shared clock for both year and month, unchanged from the existing hook).

**Resolution (on init and on `visibilitychange` → visible):**
- If `accountsSummaryClosedAt` is set and `Date.now() - closedAt > 5 * 60 * 1000`: clear all three keys, resolve to `{ year: currentYear(), month: currentMonthIndex() }`.
- Otherwise: `year` = persisted `accountsSummaryYear` or `currentYear()`. `month` = persisted `accountsSummaryMonth` if present; otherwise default to `currentMonthIndex()` when `year === currentYear()`, or `null` (All) when `year` is a past year.

**Setters:**
- `setSelectedYear(year)`: writes `accountsSummaryYear`, clears `accountsSummaryClosedAt`, and resets `selectedMonth` to the year-appropriate default (current month if `year === currentYear()`, else `null`) — both in state and in `accountsSummaryMonth` storage. Switching years never carries over an unrelated month.
- `setSelectedMonth(month)`: writes `accountsSummaryMonth` (or removes the key when `month` is `null`), clears `accountsSummaryClosedAt`, keeps `selectedYear` unchanged.

**Interface:**
```js
const { selectedYear, selectedMonth, setSelectedYear, setSelectedMonth } = useAccountsSummaryPeriod()
```

`visibilitychange`/`beforeunload` wiring for stamping `accountsSummaryClosedAt` is unchanged from the existing hook.

### 2. `DepartmentHub.jsx` — Accounts Summary tab

- Replace the `useAccountsSummaryYear()` call with `useAccountsSummaryPeriod()`.
- Below the year `<select>`, render a wrapping pill row: `All`, `Jan`, `Feb`, … `Dec`. The active pill (`selectedMonth === null` → "All", else the matching month index) is visually highlighted; clicking a pill calls `setSelectedMonth`.
- The summary-fetch effect now depends on `[slug, activeTab, selectedYear, selectedMonth]`:
  - `selectedMonth !== null`: fetch `getFinanceIncome({ year: selectedYear, month: selectedMonth })` / `getFinanceExpense({ year: selectedYear, month: selectedMonth })` (existing month-scoped query shape, already supported).
  - `selectedMonth === null`: fetch whole-year totals via `getFinanceIncome({ year: selectedYear })` / `getFinanceExpense({ year: selectedYear })` — the existing "All"/past-year branch, unchanged.
  - The weekly-range query only runs when `selectedYear === currentYear() && selectedMonth === currentMonthIndex()` (i.e. genuinely viewing the current month right now) — not merely `isCurrentYear` as in the prior spec. `acctSummary.isCurrentMonth` replaces `isCurrentYear` as the flag driving the Weekly card and its query.
- Card label: `format(new Date(selectedYear, selectedMonth, 1), 'MMMM yyyy')` when a month is selected, else `Jan – Dec {selectedYear}` (unchanged "All" format from the prior spec).
- Weekly Entry card: rendered only when `acctSummary.isCurrentMonth`.
- Quick-nav tiles: Income/Expense paths append `&year=${selectedYear}&month=${selectedMonth}` when a month is selected, or `&year=${selectedYear}` alone when "All" is selected (existing January-fallback behavior in `EntryPage.jsx`, unchanged) — both only when not viewing the current month/year (to match the existing pattern of omitting params for the default "now" case). The Weekly tile's path is unchanged.

### 3. `EntryPage.jsx`

- Read `searchParams.get('month')` alongside the existing `year` read.
- Initialization:
  - `year` and `month` both present and valid → `startOfMonth(new Date(year, month, 1))`.
  - Only `year` present → `startOfMonth(new Date(year, 0, 1))` (existing behavior, unchanged).
  - Neither present → `startOfMonth(new Date())` (existing default, unchanged).

## Data flow summary

```
Summary tab: pick year → setSelectedYear() → month resets to year-appropriate default → refetch
Summary tab: pick month pill → setSelectedMonth() → refetch (month totals, or whole-year for "All")
  → user clicks Income/Expense tile → navigate(`...?tab=income&year=YYYY[&month=M]`)
       → EntryPage reads year/month params → activeMonth starts there
```

## Error handling

Unchanged from the prior spec — the summary fetch keeps its existing silent `.catch(() => {})`.

## Testing

Manual, per `CLAUDE.md` (no test suite exists):
1. Current year, current month (today) — confirm identical to today's behavior: this-month totals + Weekly card.
2. Current year, pick a different month (e.g. one earlier this year) — confirm totals switch to that month and the Weekly card disappears.
3. Current year, pick "All" — confirm whole-year totals, no Weekly card.
4. Past year — confirm it defaults to "All" (whole-year totals), then pick a specific month and confirm it narrows correctly.
5. Reload mid-session — confirm both the selected year and month persist.
6. Simulate a >5-minute close (edit `accountsSummaryClosedAt` in localStorage to an old timestamp, reload) — confirm it resets to the current year *and* current month.
7. With a month selected, click Income and Expense tiles — confirm the Entry page opens on that exact month/year. With "All" selected, confirm it still opens on January (unchanged fallback). Click Weekly — confirm it's unaffected by any of this.

# Accounts Summary Year Picker

## Problem

The Accounts department's Summary tab (`DepartmentHub.jsx`, `slug === 'accounts'`, `activeTab === 'summary'`) always shows the current month's income/expense totals and the current week's entry counts — there's no way to look at a past year's totals. The Income/Expense entry pages (`EntryPage.jsx` → `IncomePage.jsx`/`ExpensePage.jsx`) are month-navigated one step at a time from whatever month they open on, with no way to jump straight to a different year.

## Goals

- Let a user pick a year on the Accounts Summary tab and see that year's income/expense/net totals instead of the current month's.
- Let that choice carry forward into the Income/Expense entry sub-pages when navigated to from Summary's quick-nav tiles.
- Keep the picked year sticky across normal use, but self-reset to the current calendar year if the tab has been closed/backgrounded for more than 5 minutes.

## Non-goals

- No app-wide/global year concept — this is scoped to the Accounts department only.
- No change to the Weekly Entry or Budget tabs, or to `WeeklyEntryPage.jsx` (it's a rolling current-week view clamped to the last 3 months; a year jump doesn't apply to it).
- No change to any other department's pages (Finance.jsx, Analytics.jsx, Reports.jsx, etc.) — those keep their own independent local year state, unrelated to this feature.
- No "activity" timer (clicks/keypresses). The 5-minute clock is driven solely by the tab closing/backgrounding, not general interaction.

## Design

### 1. `src/hooks/useAccountsSummaryYear.js` (new)

Owns the sticky, self-expiring `selectedYear` state for the Accounts Summary tab.

**Storage keys (localStorage):**
- `accountsSummaryYear` — the selected year, as a string.
- `accountsSummaryClosedAt` — ms timestamp of the last time the tab went hidden/closed.

**Behavior:**
- On init, read `accountsSummaryClosedAt`. If `Date.now() - closedAt > 5 * 60 * 1000`, the initial `selectedYear` is the current calendar year (`new Date().getFullYear()`) and any stale `accountsSummaryYear`/`accountsSummaryClosedAt` are cleared. Otherwise the initial value is the persisted `accountsSummaryYear` (falling back to the current year if nothing was ever persisted).
- A `visibilitychange` listener: when `document.visibilityState === 'hidden'`, write `accountsSummaryClosedAt = Date.now()`. When it becomes `'visible'` again, re-run the same expiry check (covers the case where the SPA never unmounted — e.g. the user switched tabs and came back — so a fresh mount-time check alone wouldn't fire).
- A `beforeunload` listener also stamps `accountsSummaryClosedAt`, covering an actual tab/window close.
- `setSelectedYear(year)`: updates state, writes `accountsSummaryYear`, and clears `accountsSummaryClosedAt` (an explicit pick is never treated as stale).

**Interface:**
```js
const [selectedYear, setSelectedYear] = useAccountsSummaryYear()
```

This hook is self-contained — it doesn't know about Firestore, DepartmentHub, or any other page. It can be reasoned about and (if ever needed) tested purely in terms of localStorage + document visibility.

### 2. `DepartmentHub.jsx` — Accounts Summary tab

- Call `useAccountsSummaryYear()` where the other `accts*` state lives (near `acctSummary`/`acctSummaryLoading`, ~line 359).
- Add a year `<select>` in the summary tab header area (next to/replacing the current `monthLabel` line, ~line 2663), listing the current year and the 4 years before it (5 options), styled consistent with existing selects in this file.
- Extend the summary-fetch effect (~line 1653) to depend on `selectedYear`:
  - If `selectedYear === new Date().getFullYear()`: unchanged — fetch `{year, month: now.getMonth()}` for income/expense, plus the current-week range for weekly entries.
  - Else: fetch `getFinanceIncome({ year: selectedYear })` and `getFinanceExpense({ year: selectedYear })` (whole-year, no `month`, already supported by `firestore.js`), and skip the weekly-range query entirely (`weeklyCount`/`weeklyPending`/`weeklyApproved` unset).
- Card rendering: when a past year is selected, the Income/Expense/Net cards show that year's totals under a "Jan–Dec {year}" label instead of the month label, and the Weekly Entry card is not rendered (there's no "this week" for a past year).
- Quick-nav tiles (~line 2709): the Income and Expense tiles append `&year=${selectedYear}` to their `navigate()` path when `selectedYear` isn't the current year. The Weekly tile's path is unchanged.

### 3. `EntryPage.jsx`

- Read `searchParams.get('year')` alongside the existing `searchParams.get('tab')` read.
- Initialize `activeMonth` (currently always `useState(startOfMonth(new Date()))`) to `startOfMonth(new Date(Number(yearParam), 0, 1))` when a valid `year` param is present, otherwise the current behavior (`startOfMonth(new Date())`).
- No other change — the existing prev/next month arrows, and `IncomePage`/`ExpensePage`'s use of `controlledMonth`, work unchanged from that starting point.

## Data flow summary

```
Summary tab mount
  → useAccountsSummaryYear() resolves selectedYear (persisted, or reset if closed >5min)
  → fetch effect keys off selectedYear → acctSummary (month+week, or whole-year)
  → user picks a different year → setSelectedYear() → persists + refetches
  → user clicks Income/Expense tile → navigate(`/department/accounts/entry?tab=income&year=YYYY`)
       → EntryPage reads `year` param → activeMonth starts at Jan of that year
```

## Error handling

Matches existing conventions in this codebase: the summary fetch keeps its existing `.catch(() => {})` (silent — errors already aren't surfaced elsewhere in this effect). No new error states are introduced.

## Testing

No test suite exists in this repo (per `CLAUDE.md`); verification is manual in the browser:
1. Open Accounts → Summary, confirm current-year default matches today's month/week totals (unchanged from today).
2. Pick a past year, confirm cards switch to whole-year totals and the Weekly card disappears.
3. Reload the page — confirm the picked year is still selected (persisted).
4. Simulate a >5-minute close (edit `accountsSummaryClosedAt` in localStorage to an old timestamp, then reload) — confirm it resets to the current year.
5. With a past year selected, click the Income and Expense tiles — confirm the Entry page opens on January of that year. Click the Weekly tile — confirm it opens on the current week as always.

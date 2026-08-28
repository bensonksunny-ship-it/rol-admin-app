# Department Finance — Monthly Expense Grouping & Breakdown Chart

**Date:** 2026-08-28
**Page:** any department's Finance → Expense view
(`/department/:slug?tab=finance&financeSub=expense`, e.g. Worship)
**Component:** `src/components/DeptExpenseTab.jsx`

## Problem

`DeptExpenseTab` renders every expense entry as one flat, chronological list of
cards. There is no month structure and no at-a-glance sense of how spend breaks
down over time. As entries accumulate the list becomes a long undifferentiated
scroll.

Every department's Finance → Expense view renders this one component (Worship,
Sec-Core, and all generic `DepartmentHub` departments), so a single change
covers all of them.

## Goal

1. Group the entry list under month section headers ("July 2026", "February
   2026", …), newest month first, each header carrying a subtotal badge
   ("July 2026 — ₹500").
2. Add a compact "Monthly breakdown" bar-chart card at the top of the view for
   an at-a-glance view of recent months.
3. Month sections are collapsible (expanded by default).

## Scope

- **One file:** `src/components/DeptExpenseTab.jsx`.
- **Not touched:** the Accounts department's dedicated weekly
  `src/pages/accounts/ExpensePage.jsx` (separate component, different workflow).
- **No** Firestore / rules / `services/firestore.js` changes — this is a pure
  presentation layer over the `entries` array already streamed by
  `subscribeFinanceExpenseByDept`.
- Implementation should consult the `dataviz` skill before writing the bar-chart
  markup (colour, label, axis guidance).

## Data — month grouping

A `useMemo` over `entries` (already newest-first from the subscription) produces
an ordered array of groups:

```js
{ key: '2026-07', label: 'July 2026', total: 500, entries: [ …entry ] }
```

- Bucket key: from `entry.date` formatted `yyyy-MM` (`entry.date` is a `Date` —
  see the optimistic-add path which sets `new Date(form.date + 'T12:00:00')`).
- `label`: `format(monthDate, 'MMMM yyyy')` via the existing `date-fns` import.
- `total`: sum of `Number(e.amount) || 0` for every entry in the month —
  **all statuses** (pending, approved, disapproved), matching the existing
  "Total Expense" card which also sums everything.
- Group order: newest month first. Entries within a group keep their existing
  order (already newest-first).
- Entries whose `date` is missing or unparseable go into a single group
  `{ key: '__undated', label: 'Undated', … }` pinned to the **bottom**.

## Changes to `DeptExpenseTab.jsx`

### 1. Grouping memo + collapse state

- Add the `monthGroups` `useMemo` described above.
- Add `const [collapsedKeys, setCollapsedKeys] = useState(() => new Set())` —
  holds the keys of collapsed months (so default = all expanded). A
  `toggleMonth(key)` helper adds/removes.

### 2. Monthly breakdown bar-chart card

New block rendered **between** the existing "Total Expense" summary card
(line ~113) and the "Expense Entries" section header (line ~124). Rendered only
when `entries.length > 0` and not during `loadingEntries` / `loadErr`.

- Card shell matches the existing summary card
  (`rounded-xl border border-slate-200 bg-white p-4 shadow-sm`).
- Heading: "Monthly breakdown" (`text-[10px] font-bold uppercase tracking-widest
  text-slate-400`, same as other card labels).
- Take the **6 most recent** `monthGroups` that have `total > 0` (exclude the
  Undated group), then reverse them so the **newest is on the right** (timeline
  reading order).
- One vertical bar per month in a flex row:
  - bar height = `(group.total / maxTotalInWindow) * 100`% of a fixed track
    height (~72px), min a few px so a tiny month is still visible.
  - bar fill: a single indigo tone (`bg-indigo-500`), rounded top. No gradient,
    no library.
  - under each bar: month short label (`format(d, 'MMM')`, e.g. "Jul") and the
    amount, compact — `₹500`, `₹2.8k`, `₹12.4k` (helper: `< 1000` → `₹N`,
    else `₹{(n/1000).toFixed(1)}k`).
  - Tapping a bar calls `scrollToMonth(key)` — smooth-scrolls that month's
    section header into view (each header gets `ref` via a `Map`, or an
    `id={`exp-month-${key}`}` and `scrollIntoView`). Non-essential polish; if a
    section is collapsed, expand it first.
- Single-month data → one bar, still renders. Never crashes on `max === 0`
  (guard: if no month has `total > 0`, hide the card).

### 3. Grouped, collapsible entry list

Replace the current `entries.map(...)` (lines ~149–202) with
`monthGroups.map(group => …)`:

- **Section header row** per group:
  - `<button>` (full width, `flex items-center justify-between`, `py-2`) calling
    `toggleMonth(group.key)`.
  - Left: a chevron icon (`lucide-react` `ChevronDown`, rotated `-90deg` when
    collapsed) + `group.label` (`text-sm font-semibold text-slate-700`).
  - Right: subtotal badge — reuse the rose pill style from the summary card
    (`text-xs font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2.5
    py-1 rounded-full`) showing `fmtAmt(group.total)` alone (the month label is
    already immediately to its left, so "July 2026 — ₹500" reads across the
    header row without repeating the label inside the pill).
  - `id={`exp-month-${group.key}`}` for the chart's scroll target.
- **Entry cards:** when `!collapsedKeys.has(group.key)`, render
  `group.entries.map(e => …)` using the **existing entry-card markup unchanged**
  (item / date / billNo / amount / `StatusBadge` / approve / disapprove / delete
  — lines ~150–201 as-is).
- Loading / error / empty-list states (lines ~139–147) unchanged and still
  rendered instead of the grouped list when appropriate.

### 4. Optimistic add still works

`handleSubmit` already prepends the new entry to `entries` with
`date: new Date(form.date + 'T12:00:00')`. No change needed — `monthGroups`
recomputes and the entry lands in the right month bucket (creating the month
section and updating the chart) on the next render.

### 5. `totalAmt` / top card

Unchanged — still `entries.reduce(...)` over everything.

## Out of scope

- Filtering the list by month / a month picker or tab bar — the chart is
  at-a-glance only, the list stays fully grouped (decided during design).
- Per-status subtotals.
- Persisting which months are collapsed across reloads.
- Any change to `WorshipExpenseTab.jsx` (legacy/unused variant) or the Accounts
  `ExpensePage`.

## Verification (manual, browser)

1. Worship → Finance → Expense with entries spanning ≥3 months: entries appear
   under "Month YYYY" headers, newest month first, each header showing its
   subtotal.
2. Header subtotal = sum of that month's visible entries (all statuses).
3. "Monthly breakdown" card shows one bar per recent month (max 6), newest on
   the right, heights proportional, compact amounts under each.
4. Tap a bar → the page scrolls to that month's section (expanding it if
   collapsed).
5. Collapse a month via its header chevron → entries hide, subtotal + chart
   unchanged; expand again → entries return.
6. Add an expense dated in a new month → a new section appears in the right
   position and a new bar shows in the chart.
7. Add an expense in an existing month → it prepends within that section, the
   subtotal and that bar update.
8. Zero entries → no chart card; the existing "No expense entries yet." empty
   state shows.
9. Entry with a blank/invalid date → appears under an "Undated" section at the
   bottom; not counted in any month bar.
10. Sec-Core Finance and a generic `DepartmentHub` department (e.g. Media) show
    the same behaviour.

# Finance Ledger — Shared Month Across Income & Expense Tabs

**Date:** 2026-09-03
**Status:** Approved

## Problem

On `/department/accounts` (`DepartmentHub.jsx`, `slug === 'accounts'`), the `income` and
`expense` tabs render `<IncomePage />` and `<ExpensePage />` with **no month prop**. Each
component keeps its own `internalMonth` state, initialised to `startOfMonth(new Date())`.
Consequences:

- Change the month on the Income tab, switch to Expense — Expense is still on the current
  month. No sync.
- The selection is lost on reload and is not shareable via URL.

The nested `/department/accounts/entry/*` route (`EntryPage.jsx`) already shares one
`activeMonth` between its Income/Expense sub-tabs via the `controlledMonth` prop. That path
is **out of scope** and must keep working unchanged.

## Source of Truth

A `?month=YYYY-MM` query parameter on the `/department/accounts` URL, owned by
`DepartmentHub`. Chosen over a React context store: shareable, survives reload, matches the
existing pattern of tab state living in `searchParams` (`?tab=`, `?opsSub=`,
`?financeSub=`). No new provider.

`sessionStorage` (`key: "accountsMonth"`) is a secondary mirror used only to re-populate the
URL param when a tab-navigation `<Link>` drops it (see Stickiness below).

## Changes

### 1. `src/pages/accounts/IncomePage.jsx` and `src/pages/accounts/ExpensePage.jsx`

New optional prop `onMonthChange: (date: Date) => void`.

- Signature: `function IncomePage({ controlledMonth, onMonthChange } = {})` (same for
  `ExpensePage`).
- `activeMonth = controlledMonth || internalMonth` — unchanged.
- Month picker visibility changes from `{!controlledMonth && (...)}` to
  `{(!controlledMonth || onMonthChange) && (...)}`. Result:
  - `EntryPage` passes `controlledMonth` and **no** `onMonthChange` → picker stays hidden,
    parent picker drives it. Unchanged behaviour.
  - `DepartmentHub` passes both → the page's own picker is visible and drives the shared
    param.
- `prevMonth()` / `nextMonth()`:
  - When `onMonthChange` is provided: call
    `onMonthChange(subMonths(activeMonth, 1))` / `onMonthChange(addMonths(activeMonth, 1))`.
  - Otherwise: existing `setInternalMonth(...)` behaviour.
  - `ExpensePage` keeps its `setFilterDept('all')` side effect on both branches.

No other component consumes these two pages, so the new prop is additive and safe.

### 2. `src/pages/DepartmentHub.jsx`

Add `startOfMonth` to the existing `date-fns` import.

Inside the component, near the other search-param-derived tab state:

```js
const accountsMonthParam = searchParams.get('month')          // "2026-09" | null
const accountsMonth = useMemo(() => {
  const m = /^(\d{4})-(\d{2})$/.exec(accountsMonthParam || '')
  if (m) return startOfMonth(new Date(Number(m[1]), Number(m[2]) - 1, 1))
  return startOfMonth(new Date())
}, [accountsMonthParam])

const setAccountsMonth = useCallback((date) => {
  const value = format(date, 'yyyy-MM')
  const next = new URLSearchParams(searchParams)
  next.set('month', value)
  setSearchParams(next, { replace: true })
  try { sessionStorage.setItem('accountsMonth', value) } catch { /* private mode */ }
}, [searchParams, setSearchParams])
```

Stickiness effect — restores the param when a nav `<Link>` (built by
`getDepartmentSubpages`, e.g. `/department/accounts?tab=expense`) navigates without it:

```js
useEffect(() => {
  if (slug !== 'accounts') return
  if (activeTab !== 'income' && activeTab !== 'expense') return
  if (accountsMonthParam) return
  let remembered = null
  try { remembered = sessionStorage.getItem('accountsMonth') } catch { /* ignore */ }
  if (!remembered || !/^\d{4}-\d{2}$/.test(remembered)) return
  const next = new URLSearchParams(searchParams)
  next.set('month', remembered)
  setSearchParams(next, { replace: true })
}, [slug, activeTab, accountsMonthParam, searchParams, setSearchParams])
```

Render sites (currently lines ~4218–4224):

```jsx
{activeTab === 'income' && slug === 'accounts' && (
  <IncomePage controlledMonth={accountsMonth} onMonthChange={setAccountsMonth} />
)}
{activeTab === 'expense' && slug === 'accounts' && (
  <ExpensePage controlledMonth={accountsMonth} onMonthChange={setAccountsMonth} />
)}
```

`SavingsPage`, rendered inside `ExpensePage` with `activeMonth={activeMonth}`, follows
automatically.

## Data Flow

1. User opens `/department/accounts?tab=income` — no `month` param, no sessionStorage →
   `accountsMonth` = current month. Picker shows current month.
2. User clicks `‹` on the Income picker → `onMonthChange(prevMonth)` →
   `setAccountsMonth` writes `?month=2026-08` and `sessionStorage`.
3. `IncomePage` re-renders with `controlledMonth` = August, refetches August entries.
4. User switches to the Expense tab:
   - Via in-page state change (`?tab=expense` merged): `month` param survives →
     `ExpensePage` mounts on August.
   - Via a nav `<Link to="/department/accounts?tab=expense">` that drops `month`: the
     stickiness effect reads `sessionStorage` and rewrites `?month=2026-08` →
     `ExpensePage` lands on August.
5. Reload / shared link with `?month=2026-08` → both tabs open on August.

## Out of Scope

- `EntryPage.jsx` (`/department/accounts/entry/*`) — already shares month; keeps its
  existing `?year=/?month=` (0-indexed) params untouched.
- Budget, Weekly Entry, Tally, Savings-as-standalone.
- The legacy `/finance` page (`Finance.jsx`).
- Any change to `DesktopDepartmentNav.jsx` / `DepartmentDock.jsx` / `getDepartmentSubpages`
  — the sessionStorage mirror covers the param-dropping `<Link>` case instead.

## Testing (manual, in browser)

1. `/department/accounts?tab=income`, change month back 2 months, switch to Expense —
   Expense shows the same month.
2. Change month on Expense, switch back to Income — Income matches.
3. Reload on `?month=2026-07` — both tabs open on July.
4. Open `/department/accounts/entry` — month picker still lives on `EntryPage`, Income/
   Expense sub-tabs still share it, no double picker.
5. Navigate away to another department and back via the nav bar — month is restored from
   sessionStorage.

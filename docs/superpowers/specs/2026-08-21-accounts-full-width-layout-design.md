# Accounts Department Full-Width Layout

## Problem

`MainLayout.jsx` wraps every routed page in a single shared `max-w-5xl mx-auto` column (per `CLAUDE.md`: "the one place this needs to be set for it to apply app-wide"). The Accounts department's pages (Summary/Finance/Operations tabs in `DepartmentHub.jsx`, and the nested Income/Expense/Weekly/Budget tabs in `EntryPage.jsx`) are constrained to that same narrow, print-page-like width, even though their content (tables, entry grids) would benefit from more horizontal room.

## Goals

- Accounts department pages (both the hub and its nested entry sub-pages) render edge-to-edge — no `max-w` cap — while keeping the existing side padding (`px-4 sm:px-6 py-6`) and the sidebar rail offset.
- Every other department keeps today's centered `max-w-5xl` column, unchanged.

## Non-goals

- No change to the internal layout/styling of `DepartmentHub.jsx` or `EntryPage.jsx` themselves — only the outer width constraint in `MainLayout.jsx` changes. If specific tables/cards inside Accounts still visually look narrow, that's a follow-up, not part of this change.
- No per-tab distinction within Accounts — the whole department (all `/department/accounts*` routes) goes full width uniformly.

## Design

In `MainLayout.jsx`, use `useLocation()` (from `react-router-dom`, not currently imported there) to check whether the current path starts with `/department/accounts`. Conditionally apply the width class on the content wrapper div:

```jsx
const location = useLocation()
const isAccounts = location.pathname.startsWith('/department/accounts')
...
<div className={isAccounts ? 'w-full px-4 sm:px-6 py-6' : 'max-w-5xl mx-auto px-4 sm:px-6 py-6'}>
  <Outlet context={{ ... }} />
</div>
```

This covers both `/department/accounts` (the hub tabs) and `/department/accounts/entry/*` (the nested `EntryPage` sub-tabs), since both render through this same `<Outlet>`.

## Testing

Manual, per `CLAUDE.md`:
1. Open Accounts → Summary/Finance/Operations — confirm content stretches to the full width (minus padding and sidebar), not capped at the old narrow column.
2. Open Accounts → Entry → Income/Expense/Weekly/Budget — confirm the same.
3. Open any other department (e.g. Cell, Worship) — confirm it's still capped at the narrow centered column, unchanged.

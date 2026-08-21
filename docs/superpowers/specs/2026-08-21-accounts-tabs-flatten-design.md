# Accounts Department: Flatten Entry/Finance into Hub/Income/Expense/Budget/Operations — Design Spec

**Date:** 2026-08-21
**Status:** Approved

---

## Problem

The Accounts department page (`/department/accounts`) currently has tabs `Summary | Entry | Finance | Operations`. "Entry" (`EntryPage.jsx`) contains Income / Expense / Weekly Entry / Budget. "Finance" contains Expense / Budget / Add Departments — and its Expense and Budget are literally the same components as Entry's (`AccountsExpensePage` is a re-import of `src/pages/accounts/ExpensePage.jsx`; Finance's `BudgetPage` is the same `src/pages/accounts/BudgetPage.jsx` Entry uses). So the same Expense and Budget pages are reachable two different ways, which is what's been reading as confusing/redundant.

---

## New tab structure (Accounts only)

`Hub | Income | Expense | Budget | Operations` — replacing `Summary | Entry | Finance | Operations`.

- **Hub** — unchanged (this is the existing `summary` tab; `getTabLabel('summary')` already returns "Hub").
- **Income** — `IncomePage.jsx`, promoted to a direct top-level tab.
- **Expense** — `ExpensePage.jsx` (the department-grid + Grid/Ledger view built earlier), promoted to a direct top-level tab, gaining a third view mode: **Weekly** (see below).
- **Budget** — `BudgetPage.jsx`, promoted to a direct top-level tab, unscoped (`department={undefined}`, same as how Finance→Budget renders it for Accounts today — one combined budget list, not per-department).
- **Operations** — unchanged content (Sub Department / Team / Planning), plus one new option: **Add Departments** (`AddDepartmentsPage.jsx`), moved here from Finance→Add Departments.

**Removed for Accounts only:** the `Finance` tab, and Income/Expense/Weekly/Budget no longer live nested under an `Entry` umbrella tab in the visible tab bar. No other department's tabs change — `finance` and `operations` keep working exactly as they do today everywhere else (Worship, Cell, Caring, Sunday Ministry, D Light, Media, River Kids, Event M, Administration, Sec-Core all keep their current `finance` tab).

### Weekly mode inside Expense

Today, "Weekly Entry" (`WeeklyEntryPage.jsx`) is a full tab of `EntryPage.jsx`: a week-by-week quick entry form with a pending → "Add"/"Add All" approval step, plus an Advance Payout Requests review panel. It's used both by regular Accounts staff (to review/approve) and by a restricted role (see below) who can *only* use this form.

Rather than merging its internals into `ExpensePage.jsx`, the Expense tab gains a third view-mode button — **Grid | Ledger | Weekly** — and selecting **Weekly** mounts the existing `WeeklyEntryPage.jsx` component unchanged. This keeps 100% of its current behavior (week picker, pending/approve workflow, payout panel) working exactly as it does today, just reached from the Expense tab instead of a separate Entry tab.

---

## Access control — must not change

**Regular staff** (Founder, Admin, Accounts Director/Coordinator, anyone with `enterFinance` permission): today they reach Income/Expense/Budget by clicking into Entry or Finance, both gated by the same outer `hasAccess(userProfile, 'Accounts')` check DepartmentHub already applies to every tab. Moving Income/Expense/Budget to be direct top-level tabs keeps them behind that exact same gate — no widening, no narrowing, same population of users who could already reach these pages today.

**Restricted "Weekly Expense Manager" / Weekly Entry role** (`canAccessWeeklyEntryOnly`): today, `DepartmentHub.jsx` has a special passthrough (`isAccountsEntryPassthrough`, line ~1825-1851) — a user who passes `canAccessAccountsEntry` but fails the general `hasAccess` check skips the whole department hub and renders bare `<Outlet />`, which resolves to the nested route `entry/*` → `EntryPage.jsx`, itself filtered down to only the Weekly Entry tab for this role.

**This mechanism is not touched.** `EntryPage.jsx`, `WeeklyEntryPage.jsx`, the nested `entry/*` route in `App.jsx`, `accountsEntryAccess.js`, and the `isAccountsEntryPassthrough` block in `DepartmentHub.jsx` all stay exactly as they are. `EntryPage.jsx` simply stops being linked from the visible tab bar for regular staff — it keeps existing solely to serve this restricted role's passthrough, which is what it was effectively already narrowed to being most useful for. A Weekly-Entry-only user's experience is completely unchanged: same URL, same single-tab view, same restrictions.

---

## Files to Change

| File | Change |
|---|---|
| `src/constants/departmentTabs.js` | `case 'accounts':` → `return ['summary', 'income', 'expense', 'budget', 'operations']` |
| `src/utils/departmentSubpages.js` | `getTabLabel`: add `'income' → 'Income'`, `'expense' → 'Expense'` (`'budget'` label already exists). `getTabIcon`: add `'income' → Banknote`, `'expense' → CreditCard` (`'budget'` icon already exists → `Wallet`). `getTabPath`: remove the `tab === 'entry' && slug === 'accounts'` special case (dead once `'entry'` leaves Accounts' tab list); remove the now-unused `ACCOUNTS_ENTRY_BASE_PATH` import if nothing else in the file uses it. `getOperationsChildren(slug)`: add an `slug === 'accounts'` case appending `{ key: 'addDepartments', label: 'Add Departments', Icon: Building2 }` to `DEFAULT_OPS_CHILDREN`. `getFinanceChildren(slug)`: remove the `slug === 'accounts'` special case (revert to always `DEFAULT_FINANCE_CHILDREN`) since Accounts no longer has a Finance tab to drive. |
| `src/pages/DepartmentHub.jsx` | Import `IncomePage` from `./accounts/IncomePage`. Rename the `AccountsExpensePage` import to `ExpensePage` (still `from './accounts/ExpensePage'`) for clarity now that it's the top-level Expense tab, not a Finance sub-page. Add three new render blocks: `activeTab === 'income' && slug === 'accounts'` → `<IncomePage />`; `activeTab === 'expense' && slug === 'accounts'` → `<ExpensePage />`; `activeTab === 'budget' && slug === 'accounts'` → `<BudgetPage />` (unscoped). Simplify the existing `activeTab === 'finance'` block: drop all `slug === 'accounts'` special-casing (the `tabs={...}` ternary, the `AccountsExpensePage`/`DeptExpenseTab` ternary, the `BudgetPage` department-prop ternary, the `slug !== 'accounts'` guard on Payout Request) since Accounts no longer reaches this block at all; delete the `financeSubTab === 'addDepartments' && slug === 'accounts'` block entirely. Add `activeTab === 'operations' && opsSubTab === 'addDepartments' && slug === 'accounts'` → `<AddDepartmentsPage />`. |
| `src/pages/accounts/ExpensePage.jsx` | Extend the `Grid`/`Ledger` toggle to a third option, `Weekly`. Import `WeeklyEntryPage` and render it unchanged when `viewMode === 'weekly'` (no props needed — it already manages its own state/access internally). |

**Not changed:** `src/pages/accounts/EntryPage.jsx`, `src/pages/accounts/WeeklyEntryPage.jsx`, `src/pages/accounts/IncomePage.jsx`, `src/pages/accounts/BudgetPage.jsx`, `src/pages/accounts/AddDepartmentsPage.jsx`, `src/App.jsx` routing, `src/utils/accountsEntryAccess.js`, Firestore schema/rules, and every other department's tabs.

---

## Edge Cases

- **Deep links to the old `/department/accounts?tab=finance...` URLs**: these simply stop matching any tab button (Finance is no longer in Accounts' tab list), so DepartmentHub falls back to whatever it already does for an unrecognized `tab` query value today (no special handling needed — this isn't a new failure mode, it's the same behavior any stale/unknown `?tab=` value already gets).
- **Deep links to `/department/accounts/entry`**: keep working exactly as today for anyone who already has `canAccessAccountsEntry` — this URL isn't removed, just unlinked from the main tab bar.
- **A regular (non-restricted) staff member wants to review/approve weekly entries**: they open Expense → Weekly, same `WeeklyEntryPage.jsx` UI as before, same approve buttons, same data.
- **Other departments' Finance/Operations tabs**: entirely unaffected — the code changes are gated by `slug === 'accounts'` everywhere except the general `getFinanceChildren`/`getOperationsChildren` simplification, which only removes the accounts-specific branch and leaves the default path (used by every other department) untouched.

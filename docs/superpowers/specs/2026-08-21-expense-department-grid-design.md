# Expense Department Grid — Design Spec

**Date:** 2026-08-21
**Status:** Approved

---

## Problem

`ExpensePage` (My Workspace → Accounts → Entry → Expense) already supports department-wise tracking: a `filterDept` dropdown both selects the department for a new entry and filters the list below it (implemented per [[2026-05-02-departmental-expense-view-design]]). This works but the dropdown is a plain `<select>` — there's no at-a-glance view of how much each department has spent this month, and picking a department requires opening the dropdown rather than seeing all departments at once.

The user wants to replace the dropdown with a grid of department tiles so they can see every department's month-to-date spend and pick one visually.

---

## Access

No change. `canAccessAccountsEntry` still gates the whole page.

---

## Data Model

No changes. `finance_expense` docs keep the existing `department` field (with `category` fallback for legacy records). No new Firestore collection, no new query — `listenFinanceExpense` already loads every entry for the active month regardless of department, so per-department totals are computed client-side from the existing `entries` array.

---

## UI Layout

Top to bottom within `ExpensePage`:

```
[ Month picker ]
[ Department grid ]          <- new, replaces the <select> dropdown
[ Total Expense summary card + Add/Edit Expense form ]
[ Expense table ]
```

### Department grid

- Renders where the old `filterDept` `<select>` was (inside the bento row area, above the stat card + form).
- One card per entry in `deptOptions` (`EXPENSE_CATEGORIES` + any dynamic departments from `getExpenseDepartments()`), plus a leading **"All"** card.
- Grid: `grid-cols-2` on mobile, `sm:grid-cols-3 lg:grid-cols-4` on wider screens — consistent with existing bento/card patterns in the file.
- Each department card shows:
  - Department name
  - ₹ total for the active month (sum of `amount` for entries where `department === card`, computed from the already-loaded `entries`, not a new query)
  - Entry count for that department this month
- The "All" card shows the grand total and total entry count across all departments (sum/count of the full `entries` array).
- Clicking a card sets `filterDept` to that department name (or `'all'` for the All card) — same state variable that already drives the list filter today, so no new state model.
- The selected card gets a visual highlight (ring/border + accent), matching the existing indigo/rose accent palette already used on the page.
- Clicking a card smooth-scrolls to the entry form/list section below (`window.scrollTo` / `scrollIntoView`), same technique already used in `handleEdit`.

### Entry form

- No dropdown. Shows the currently selected department as a read-only label/chip (e.g. "Adding expense for **Worship**").
- If `filterDept === 'all'` (nothing selected), the form area shows a prompt — "Select a department above to add an entry" — and the Save button stays disabled. This mirrors today's `validate()` rule ("Select a department before adding an entry"), just surfaced proactively instead of only on submit.
- All other fields (Date, Amount, Item, Bill No) and the Excel upload control are unchanged.

### Expense table / list

- Unchanged: filtered by `filterDept` via the existing `visibleEntries` logic. "All" shows the combined flat list, same as today — no new grouping/sectioning in the list itself, since the grid above already gives the per-department breakdown.

### Edit flow

- `handleEdit` already sets `filterDept` to the entry's department when editing — this now also visually selects that card in the grid (since it's the same state), and should scroll to the form as it does today.

---

## Files to Change

| File | Change |
|---|---|
| `src/pages/accounts/ExpensePage.jsx` | Replace the `filterDept` `<select>` with a department grid (cards computed from `entries` + `deptOptions`); update the entry form to show a read-only department chip instead of a dropdown, with a prompt state when none is selected; add scroll-to-form on card click. |

No changes to `src/services/firestore.js`, routing, access control, or constants.

---

## Edge Cases

- **Zero entries for a department**: card still renders, shows ₹0 and "0 entries" — departments aren't hidden just because they're unused this month.
- **Legacy records with `category` but no `department`**: same fallback as today (`entry.department ?? entry.category`); counted under "All" but not under any specific department card unless `category` matches a card name.
- **New month with no entries at all**: all cards show ₹0; "All" card shows ₹0 too. No error state needed — this already degrades gracefully today.
- **Dynamic departments added via Add Departments page**: automatically appear as new cards next time `deptOptions` loads (`getExpenseDepartments()` already runs on mount).

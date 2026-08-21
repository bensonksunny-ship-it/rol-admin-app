# Excel-Style Department Ledger View — Design Spec

**Date:** 2026-08-21
**Status:** Approved

---

## Problem

`ExpensePage` (My Workspace → Accounts → Entry → Expense) now has a department grid (per [[2026-08-21-expense-department-grid-design]]) for picking one department at a time to enter/review expenses. There's no way to see every department's expenses for a month at once, side by side, the way a printed monthly ledger would look. The user wants an Excel-style view: each department as its own columnar table (`SI No`, `Date`, `Item`, `Bill No`, `Amount`), all departments laid out side by side, with month navigation via a bottom tab bar (`Jan`…`Dec`).

---

## Access

No change. `canAccessAccountsEntry` still gates the whole page.

---

## Data Model

No changes. Same `finance_expense` collection, same `department`/`category` fields, same `listenFinanceExpense(filters, callback, onError)` function from `src/services/firestore.js`. No new Firestore collections or queries beyond a second `listenFinanceExpense` subscription scoped to the ledger's own month.

---

## UI Layout

### View toggle

A small segmented control (`Grid` / `Ledger`) near the top of `ExpensePage`, above the existing month picker area. Default: `Grid` — i.e. today's behavior (department grid + single filtered entry form/list) is unchanged and remains the default.

Selecting `Ledger` swaps everything below the toggle (department grid, stat card, entry form, filtered list) for the new ledger layout. Switching back to `Grid` restores the current behavior exactly as it exists today.

### Ledger view

Top to bottom, when `Ledger` is selected:

```
[ Grid / Ledger toggle ]
[ ‹ year › ]
[ Department tables — side by side, horizontal scroll ]
[ Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec ]   <- bottom month tabs
```

**Department tables**
- One table per entry in `deptOptions` (same list the Grid view uses — `EXPENSE_CATEGORIES` + dynamic departments from `getExpenseDepartments()`), in document order.
- Layout: `flex gap-4 overflow-x-auto` row; each table has a fixed width (~280px, `shrink-0`) so tables never compress — the row scrolls horizontally instead.
- Each table:
  - Header: department name + that department's total for the selected month (₹, computed client-side from the ledger's loaded entries).
  - Columns: `SI No | Date | Item | Bill No | Amount`.
  - Rows: that department's entries for the selected month, sorted by date (already the sort order `listenFinanceExpense` returns).
  - Departments with zero entries this month still render a table, with a single "No entries" placeholder row instead of a data row.
- **Read-only.** No inline add/edit/delete. Clicking a data row switches the page to `Grid` view, selects that row's department (reusing the existing `selectDept` function so the card grid highlights it and the page scrolls to the entry form), so all editing continues to happen in the one place it already does.

**Month navigation (bottom tabs)**
- A row of 12 tabs, `Jan`–`Dec`, for the currently selected ledger year. Clicking a tab sets the ledger's active month.
- A `‹ year ›` control (matching the existing prev/next arrow style used elsewhere on this page) changes the selected year; tabs re-render for that year's 12 months.
- Default on first entering Ledger view: current real-world month/year.

### Independent month state

Ledger view uses its own `ledgerMonth` (0–11) and `ledgerYear` state, entirely separate from the Grid view's `activeMonth` (which may be `controlledMonth` from the parent `EntryPage`, or `internalMonth` when used standalone). This keeps the change contained to `ExpensePage.jsx`:

- When embedded under `EntryPage.jsx`'s Accounts Entry tabs, the Grid view's month is driven by `EntryPage`'s own top prev/next-month arrows via the `controlledMonth` prop — `ExpensePage` has no way to tell that parent "jump to March" from inside a child control. Rather than adding a callback prop and modifying `EntryPage.jsx`, Ledger view owns its own month state and its own `listenFinanceExpense` subscription (mirroring the pattern already used for the Grid view's `unsubRef`/`useEffect`), scoped to `{ year: ledgerYear, month: ledgerMonth }`.
- Practically: switching to `Ledger` view hides the Grid view's month picker (top arrows shown by the parent, or internal arrows when standalone) since the bottom tabs take over navigation while in that view. Switching back to `Grid` restores the original month picker and `activeMonth` behavior untouched.
- The two subscriptions only run while their respective view is active, to avoid two simultaneous Firestore listeners: the ledger listener attaches on mount of Ledger view (or when the toggle switches to it) and detaches when switching back to Grid, same lifecycle pattern as the existing `unsubRef` effect.

---

## Files to Change

| File | Change |
|---|---|
| `src/pages/accounts/ExpensePage.jsx` | Add `Grid`/`Ledger` view toggle; add `ledgerMonth`/`ledgerYear` state + dedicated `listenFinanceExpense` subscription; add side-by-side scrollable department tables; add bottom Jan–Dec month tabs + year arrows; wire row click to `selectDept` + switch to Grid view. |

No changes to `src/services/firestore.js`, `EntryPage.jsx`, routing, access control, or constants.

---

## Edge Cases

- **Legacy records with `category` but no `department`**: same fallback as Grid view (`entry.department ?? entry.category`); appear under the matching department table if `category` matches a `deptOptions` name, otherwise don't appear in any ledger table (same gap that already exists in Grid view's filter).
- **Empty month (no entries anywhere)**: every department table renders with its "No entries" placeholder; no page-level error state needed.
- **Switching Grid ↔ Ledger repeatedly**: no data loss — Grid view's form/edit state (`form`, `editingId`) is untouched by the toggle since it's a separate state slice; only the ledger's own listener mounts/unmounts.
- **Dynamic departments added via Add Departments page**: appear as new ledger tables next time `deptOptions` loads, same as Grid view.
- **Month/year in Ledger view is independent of Grid view's month**: switching to Grid after browsing Ledger's June does not change Grid's currently selected month — this is a deliberate consequence of the independent-state decision above, not a bug.

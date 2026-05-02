# Departmental Expense View — Design Spec

**Date:** 2026-05-02
**Status:** Approved

---

## Problem

The current ExpensePage records expenses with a `category` field but provides no way to view expenses broken down by department. Accounts users need to filter and enter expenses per department.

---

## Access

No change to access control. `canAccessAccountsEntry` already restricts ExpensePage to Accounts/Finance Team users only. Other departments cannot see this page.

---

## Data Model

Rename the `category` field to `department` on expense documents in `finance_expense` Firestore collection.

- `createFinanceExpense` writes `department` (not `category`)
- `updateFinanceExpense` writes `department` (not `category`)
- `getFinanceExpense` returns documents as-is; display code falls back to `entry.category` for legacy records that predate this change

Values come from the existing `EXPENSE_CATEGORIES` constant in `src/constants/roles.js`:
```
Worship, Cell Ministry, Caring, Sunday Ministry, Junior Church,
Outreach, Building, Media, Accounts, Human Resources,
General Affairs, Thunderstorm, SP Office
```

---

## UI Layout

Top to bottom within `ExpensePage`:

```
[ Month picker ]
[ Department filter dropdown ]
[ Total Expense summary card ]
[ Add / Edit Expense form ]
[ Expense table ]
```

### Department filter dropdown

- Placed between the month picker and the summary card
- Options: "All Departments" (default) + each value from `EXPENSE_CATEGORIES`
- Selecting a department filters both the table and the summary card total
- Filtering is client-side — entries are already loaded by month

### Total Expense summary card

- Shows sum of `amount` across currently visible (filtered) entries
- Label stays "Total Expense" regardless of filter selection

### Entry form

- `department` field replaces `category` field
- Label: "Department"
- Dropdown values: `EXPENSE_CATEGORIES`
- Default: first item in the list (`EXPENSE_CATEGORIES[0]`)
- All other fields unchanged: Date, Amount

### Expense table

- Filtered by selected department (or all if "All Departments")
- Columns: Date | Department | Amount | Actions
- Edit/delete behaviour unchanged

---

## Files to Change

| File | Change |
|------|--------|
| `src/pages/accounts/ExpensePage.jsx` | Add dept filter state + dropdown; rename `category` → `department` in form, payload, edit handler, table |
| `src/services/firestore.js` | `createFinanceExpense` and `updateFinanceExpense` write `department` instead of `category` |

No routing, access, or constants changes required.

---

## Edge Cases

- **Legacy records** with `category` but no `department`: display falls back to `entry.category ?? ''`; they appear under "All Departments" but not under any specific dept filter
- **Empty filter result**: show "No expenses recorded for [dept] this month." message

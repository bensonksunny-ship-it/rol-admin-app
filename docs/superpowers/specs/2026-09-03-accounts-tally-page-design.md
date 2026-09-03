# Accounts — Tally Page

**Date:** 2026-09-03
**Status:** Approved

## Goal

A new **Tally** tab under `/department/accounts` that shows a month's full income and
expense ledger with a running balance:

```
Opening Balance  +  Total Income  −  Total Expense  =  Closing Balance
```

The opening balance is normally **computed automatically** by carrying forward every prior
month's net. An **optional manual opening balance** can be saved for a month — an escape
hatch (e.g. the first month, before historical data was entered) that then becomes the
carry-forward baseline for every later month.

## Starting Point

`src/pages/accounts/TallyPage.jsx` already exists as an unrouted draft: month picker,
3 summary cards, an expense-only table. It is **not** referenced by any route or tab.
This work rewrites it and wires it in.

## Opening Balance — "Anchor + carry-forward"

`monthKey` = `format(month, 'yyyy-MM')` (lexicographically sortable).

Given the viewed month `M`:

1. Load all anchor docs from `finance_tally` (tiny collection, one doc per month at most).
2. Let `A` = the anchor with the greatest `monthKey <= M`, if any.
3. **Opening(M):**
   - If `A` exists and `A.monthKey === M` → `A.openingBalance` exactly.
   - If `A` exists and `A.monthKey < M` →
     `A.openingBalance + netMovement([start of A.month, start of M))`
   - If no `A` → `netMovement([epoch, start of M))` where epoch = `2000-01-01`.
4. `netMovement([from, to))` = Σ income with `from ≤ date < to`
   − Σ expense with `from ≤ date < to` and `status !== 'pending'`.
5. **Closing(M)** = `Opening(M) + totalIncome(M) − totalExpense(M)`.

`totalIncome(M)` / `totalExpense(M)` are this month's entries (expense excludes
`status === 'pending'`), same as the draft.

Tally is **date-based**: it ignores ExpensePage's `sheetYear/sheetMonth` re-anchoring (an
entry counts in the month of its own `date`). Matches the existing draft; can revisit if it
causes confusion.

### Data fetching per view

- `getFinanceIncome({ startDate, endDate })` / `getFinanceExpense({ startDate, endDate })`
  for the prior range `[rangeStart, startOfMonth(M))`, where `rangeStart` = start of
  `A.month` (or `2000-01-01`). Skipped entirely when `A.monthKey === M`.
- `getFinanceIncome({ year, month })` / `getFinanceExpense({ year, month })` for `M` itself
  (drives the tables and this-month totals).

## Firestore

### New collection `finance_tally`

Doc id = `monthKey` (`"2026-09"`). Fields:
`{ openingBalance: number, note: string, updatedBy: string, updatedAt: Timestamp }`.

### `src/services/firestore.js`

- **Extend `getFinanceIncome`** to accept `filters.startDate` / `filters.endDate`
  (Timestamps-from-Date range), mirroring `getFinanceExpense`'s existing branch. The
  `month/year` and `year` branches stay.
- **`getFinanceTallyAnchors()`** → `getDocs(collection(db, 'finance_tally'))` →
  `[{ monthKey: doc.id, ...data }]`.
- **`setFinanceTallyAnchor(monthKey, { openingBalance, note, updatedBy })`** →
  `setDoc(doc(db, 'finance_tally', monthKey), { openingBalance: Number(...)||0, note: note||'', updatedBy: updatedBy||'', updatedAt: Timestamp.now() }, { merge: true })`.
- **`deleteFinanceTallyAnchor(monthKey)`** → `deleteDoc(...)`.

### `firestore.rules`

Add alongside the other `finance_*` blocks:

```
match /finance_tally/{docId} {
  allow read, write: if isSignedIn();
}
```

Must be deployed (`firebase deploy --only firestore:rules` or `npm run deploy`) — localhost
hits production Firestore.

## UI — `TallyPage.jsx`

Props `{ controlledMonth, onMonthChange }`, same contract as `IncomePage`/`ExpensePage`:

- `activeMonth = controlledMonth || internalMonth`.
- Month picker shown when `!controlledMonth || onMonthChange`; prev/next route through
  `onMonthChange` when provided.

Sections top-to-bottom:

1. **Month picker** (shared, as above).
2. **Opening Balance card** — shows the current opening value and whether it's `Auto` or
   `Manual` (a small badge). A "Set manually" / "Edit" button reveals an amount input +
   optional note, with **Save** and (when a manual anchor exists) **Reset to auto**.
   - Save → `setFinanceTallyAnchor(monthKey, { openingBalance, note, updatedBy: displayName })`
     then reload.
   - Reset → `deleteFinanceTallyAnchor(monthKey)` then reload.
   - When manual, also show `note` and "set by {updatedBy}" if present.
3. **Tally strip** — Opening → `+` Total Income → `−` Total Expense → `=` Closing, with
   Closing coloured by sign (surplus/deficit), same palette as the draft.
4. **Income table** — No. / Date / Type (`category`) / Description (`description`/`note`) /
   Amount, `tfoot` total. Empty state when none.
5. **Expense table** — No. / Date / Department (`department || category`) / Item / Bill No /
   Amount, `tfoot` total. (Same as the draft.) Empty state when none.

Currency: `₹{n.toLocaleString('en-IN')}`, matching the draft.

Access: `canAccessAccountsEntry(userProfile, hasPermission, isFounder)` → `<Navigate to="/" replace />` otherwise (unchanged from draft).

## Wiring

- **`src/constants/departmentTabs.js`** — accounts case:
  `['summary', 'income', 'expense', 'tally', 'budget', 'operations']`.
- **`src/utils/departmentSubpages.js`** — `getTabLabel`: `case 'tally': return 'Tally'`;
  `getTabIcon`: `case 'tally': return Calculator` (add `Calculator` to the lucide import).
- **`src/pages/DepartmentHub.jsx`** — import `TallyPage`; render
  `{activeTab === 'tally' && slug === 'accounts' && (
     <TallyPage controlledMonth={accountsMonth} onMonthChange={setAccountsMonth} />
  )}`.
  `accountsMonth` / `setAccountsMonth` already exist (from the shared-month change) and the
  stickiness effect already covers `income`/`expense`; extend its `activeTab` guard to also
  include `'tally'`.

## Out of Scope

- Editing income/expense rows from Tally (read-only view; use the Income/Expense tabs).
- PDF/print export.
- Respecting `sheetYear/sheetMonth` expense re-anchoring.
- The legacy `/finance` page.

## Testing (manual)

1. No anchors anywhere: open Tally on the current month → Opening = (all income − all
   non-pending expense before this month), badge `Auto`. Closing = Opening + month totals.
2. Set a manual opening of ₹100000 for 2026-06 → 2026-06 opens at exactly ₹100000;
   2026-07, 2026-08 carry forward from it (100000 + net movement since 1 Jun).
3. Reset 2026-06 to auto → later months revert to pure all-time running.
4. Switch Tally ↔ Income ↔ Expense → month stays put (`?month=` shared).
5. Non-accounts user → redirected to `/`.

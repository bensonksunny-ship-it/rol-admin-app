# Savings tab for Accounts — design

## Purpose

Accounts currently tracks Income and Expense, both of which are naturally
month-scoped (Expense even has an explicit "sheet" concept so a mis-dated entry
doesn't silently jump months). Savings is different: it's money set aside in
named funds (Emergency Reserve, Building Fund, etc.) that accumulates over
time. The church wants to record deposits and withdrawals against these funds
without those numbers ever touching or inflating the regular Expense totals.

## Decisions (confirmed with the user)

1. **Balance model: running balance per fund**, not a per-month reset. Each
   fund's balance carries forward forever. The month filter only changes which
   transactions are *displayed*, never what the balance *is*.
2. **Fund categories: fixed list**, hardcoded — not a configurable collection
   like Expense's `expense_departments`. The four funds: Emergency Reserve,
   Building Fund, Future Project Savings, General Savings.
3. **Entry type: a Deposit/Withdrawal toggle per row**, plus a plain positive
   amount field (not a signed amount).
4. **Overdraft handling: blocked.** A withdrawal that would take a fund's
   balance negative is rejected with an inline error naming the available
   balance, rather than allowed or silently warned.
5. **Visibility: also add a "Total Savings" summary card to the existing
   Accounts Hub** (`/department/accounts?tab=summary`), in addition to the new
   dedicated tab.

## Data model

New collection, one document per transaction (not per fund — the fund's
balance is *derived* by summing its transactions, so there is a single source
of truth and no separate counter that can drift out of sync):

```
finance_savings/{docId}
  fund:      string              // one of the 4 fixed fund names
  type:      'deposit' | 'withdrawal'
  date:      Timestamp
  item:      string              // purpose / description
  reference: string              // transaction reference
  amount:    number              // always positive; `type` gives the sign
  createdAt: serverTimestamp
```

No `status` field (pending/approved) — this page is gated the same way
Expense's direct-entry view is (`canAccessAccountsEntry`: Accounts/Founder
tier only), and unlike Expense there is no separate restricted-role
submission path (no Savings equivalent of Weekly Entry) that would need an
approval step.

No `sheetYear`/`sheetMonth` anchoring — that field pair exists on
`finance_expense` specifically to answer "which month-sheet does this belong
to" for a model that resets every month. Savings never resets, so there is no
sheet to anchor to. The transaction's own `date` is used only to drive the
month filter's *view*, never the balance calculation.

**Balance for a fund** = `Σ(deposits) − Σ(withdrawals)` across *all* of that
fund's transactions, computed client-side from the live Firestore listener on
every render (same "recompute from live state, never store a derived total"
approach already used for Expense's per-department totals).

## Component: `SavingsPage` (`src/pages/accounts/SavingsPage.jsx`)

Deliberately reuses Expense's proven UX rather than reinventing it:

- **"TOTAL SAVINGS" banner** above the grid = sum of all 4 funds' current
  balances. Always all-time — does not change when the month filter moves.
  Labeled clearly (e.g. a small "current balance, all-time" caption) so it
  doesn't read as month-scoped the way Expense's total does.
- **Accordion grid of 4 fund tiles** — one expands at a time, click-outside
  collapses (same interaction as Expense's department grid). Each tile shows
  the fund's current running balance (bold) and this month's transaction
  count (small subtext, following the month filter).
- **Month filter** controls which transactions are listed inside an expanded
  fund's table, so old entries don't clutter the view. It never affects any
  balance figure.
- **Inside an expanded fund**: one continuous table — date / item / reference
  / amount columns, plus a Deposit/Withdrawal segmented toggle per row.
  Flexible date parsing (any common day-first format, normalized to
  `dd.MM.yyyy`), flexible amount parsing (strips ₹/Rs/commas), paste-from-
  Excel with auto-expanding rows, stable per-row identity so the async save
  loop can't mis-attribute a `savedId` if the row array reshuffles mid-save,
  a single "Save rows" button that auto-collapses the card back to its tile
  on a fully clean save. Per-row ⋮ menu (edit in place / immediate delete, no
  confirmation) — the same portal-based menu Expense uses, so it isn't
  clipped by the card's overflow.
- **Overdraft check**: before saving, withdrawals are validated sequentially
  against a running projected balance — so if a single save batch contains
  two withdrawals from the same fund, the second is checked against the
  balance *after* the first is applied, not just the stale pre-save snapshot.
  Any withdrawal that would overdraw is skipped with an inline error ("1
  withdrawal skipped — Building Fund only has ₹3,200 available"), reusing
  Expense's existing "N saved, M skipped" inline-error pattern rather than
  introducing a new modal type.
- No date-mismatch warning modal — that concept is specific to Expense's
  sheet-anchoring model, which Savings doesn't have.

### Shared helpers extracted from ExpensePage.jsx

`parseFlexibleDate`, `toDisplayDate`, `parseFlexibleAmount`, and the portal-
based `RowActionsMenu` component currently live as module-private code inside
`ExpensePage.jsx`. They'll move to a new `src/utils/entryTableHelpers.jsx`
(the `.jsx` extension because `RowActionsMenu` renders JSX), imported by both
`ExpensePage.jsx` and the new `SavingsPage.jsx`. This is a contained,
low-risk extraction — all four are pure/self-contained with no dependency on
`ExpensePage`'s own state — done specifically to avoid duplicating non-trivial
parsing logic across two files, not a broader refactor.

## Wiring

- **`src/constants/departmentTabs.js`**: add `'savings'` to the `accounts`
  case's tab array, after `'expense'` and before `'budget'`:
  `['summary', 'income', 'expense', 'savings', 'budget', 'operations']`.
- **`src/utils/departmentSubpages.js`**: add a `'savings'` case to
  `getTabLabel` (→ `'Savings'`) and `getTabIcon` (→ `PiggyBank` from
  `lucide-react`).
- **`src/pages/DepartmentHub.jsx`**: add
  `{activeTab === 'savings' && slug === 'accounts' && <SavingsPage />}`,
  matching the existing Income/Expense/Budget render branches exactly.
- **`firestore.rules`**: add
  ```
  match /finance_savings/{docId} {
    allow read, write: if isSignedIn();
  }
  ```
  identical in shape to the existing `finance_income`/`finance_expense`
  blocks (access is enforced client-side via `canAccessAccountsEntry`, same
  as those two collections today).
- **`src/services/firestore.js`**: add `listenFinanceSavings`,
  `createFinanceSavings`, `updateFinanceSavings`, `deleteFinanceSavings`,
  reusing the exact local-date-construction fix already applied to
  `finance_expense`/`finance_income` (building dates from explicit local
  y/m/d components rather than `new Date(isoString)`, which avoids the
  UTC-vs-local off-by-one-day bug fixed earlier in this project).

## Accounts Hub summary card

A 4th card added to the existing Income/Expense/Net row on
`/department/accounts?tab=summary` (or a small banner just below it),
labeled **Total Savings**, sourced from a new all-time fetch of
`finance_savings` folded into the same `useEffect` that already loads
`acctSummary` (alongside the existing `getFinanceIncome`/`getFinanceExpense`
calls). Explicitly labeled as an all-time balance so it doesn't read as
scoped to the Hub's year/month picker the way Income/Expense/Net are.

## Access control

Reuses `canAccessAccountsEntry` from `src/utils/accountsEntryAccess.js` —
identical gate to `ExpensePage.jsx` (Founder, Admin, `enterFinance`
permission, or Accounts Director/Coordinator). No new access tier.

## Out of scope

- No configurable/addable fund categories (fixed list only, per decision 2).
- No changes to `WeeklyEntryPage.jsx`, `Finance.jsx`, or any other page that
  reads `finance_expense`/`finance_income` — this feature is additive only.
- No approval/pending workflow for Savings entries.

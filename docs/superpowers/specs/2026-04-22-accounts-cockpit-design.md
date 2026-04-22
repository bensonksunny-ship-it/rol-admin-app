# Accounts Cockpit — Phase 1 Design Spec

**Date:** 2026-04-22
**Status:** Approved for implementation

---

## Summary

Upgrade `Finance.jsx` (the Accounts page) from a manual-entry ledger into a cockpit-first workflow with four stat cards, a voucher request approval flow, a unified Add Transaction modal with date persistence, and a clean recent-transactions list. All existing charts are reused unchanged below the new cockpit. No new pages — everything lives in `Finance.jsx`.

---

## 1. Constants Changes (`src/constants/roles.js`)

### 1.1 Add `"Missions"` to `INCOME_TYPES`

```js
export const INCOME_TYPES = [
  'Offering 1', 'Offering 2', 'Offering 3', 'Offering 4', 'Offering 5',
  'Tithe', 'Contribution', 'Missions', 'RSM', 'RFF', 'Donations',
]
```

### 1.2 Add `DEPARTMENT_TAGS` constant (used by both modals)

```js
export const DEPARTMENT_TAGS = [
  'General',
  'Worship',
  'Cell',
  'Caring',
  'Sunday Ministry',
  'D Light',
  'River Kids',
  'Outreach',
  'Building Care',
  'Event M',
  'Mission',
  'Media',
  'Accounts',
  'Human Resources',
  'Gen Affairs',
  'Thunderstorm',
  'SP Office',
]
```

---

## 2. Firestore Schema

### 2.1 Existing collections — backward-compatible field additions

**`finance_income`** — add two fields (existing docs without them return `undefined`, treated as `''`):
- `departmentTag: string` — value from `DEPARTMENT_TAGS`
- `submittedBy: string` — display name of the person who recorded the entry

**`finance_expense`** — add three fields:
- `departmentTag: string`
- `submittedBy: string`
- `voucherRequestId: string | null` — populated when the expense originated from an approved voucher; `null` for direct Finance entries

### 2.2 New collection: `finance_voucher_requests`

```
{
  id: auto-generated
  date: Timestamp            — the intended expense date (from date picker)
  category: string           — one of EXPENSE_CATEGORIES
  amount: number
  description: string
  departmentTag: string      — one of DEPARTMENT_TAGS
  submittedBy: string        — display name
  submittedByUid: string     — Firebase UID (for auth checks)
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy: string | null  — display name of approver/rejecter
  reviewedAt: Timestamp | null
  rejectionReason: string | null
  createdAt: Timestamp
}
```

---

## 3. New Firestore Functions (`src/services/firestore.js`)

### 3.1 `getFinanceVoucherRequests(statusFilter?)`
- Queries `finance_voucher_requests`, optionally filtered by `status`
- Default: returns all `status === 'pending'` docs ordered by `createdAt desc`
- Returns array of plain objects with JS dates

### 3.2 `createFinanceVoucherRequest(data)`
- Adds a doc to `finance_voucher_requests` with `status: 'pending'`, `createdAt: Timestamp.now()`

### 3.3 `approveFinanceVoucherRequest(requestId, approvedBy, expenseData)`
- In a Firestore batch:
  1. Updates the voucher request doc: `status: 'approved'`, `reviewedBy`, `reviewedAt: Timestamp.now()`
  2. Creates a new `finance_expense` doc with all `expenseData` fields + `voucherRequestId: requestId` + `approvedBy`
- Returns the new expense doc ID

### 3.4 `rejectFinanceVoucherRequest(requestId, rejectedBy, rejectionReason?)`
- Updates the voucher request doc: `status: 'rejected'`, `reviewedBy: rejectedBy`, `reviewedAt: Timestamp.now()`, `rejectionReason`

### 3.5 Update `createFinanceIncome` and `createFinanceExpense`
- Accept `departmentTag` and `submittedBy` in their data payload and write them to Firestore (they already spread `...data`, so no structural change needed — just ensure callers pass the new fields)

---

## 4. UI Architecture (`src/pages/Finance.jsx`)

### 4.1 New State

```js
// Date picker — persists across modal submissions
const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

// Voucher requests
const [voucherRequests, setVoucherRequests] = useState([])
const [loadingVouchers, setLoadingVouchers] = useState(false)
const [showVoucherPanel, setShowVoucherPanel] = useState(false)

// Voucher submission modal
const [voucherModal, setVoucherModal] = useState(false)
const [voucherForm, setVoucherForm] = useState({
  date: selectedDate,
  category: EXPENSE_CATEGORIES[0],
  departmentTag: DEPARTMENT_TAGS[0],
  amount: '',
  description: '',
})
```

`voucherRequests` loads on mount and after any approval/rejection.

### 4.2 Updated `form` state (Add Transaction modal)

```js
const [form, setForm] = useState({
  type: 'income',
  date: selectedDate,       // uses persistent selectedDate
  category: INCOME_TYPES[0],
  departmentTag: DEPARTMENT_TAGS[0],
  amount: '',
  description: '',
  submittedBy: userProfile?.name || userProfile?.email || '',
})
```

When the modal is opened, `form.date` is set to `selectedDate` (the current picker value). When the user submits, `selectedDate` is **not reset** — so opening the modal again re-uses the same date. The user can change `selectedDate` at the top of the page to enter multiple entries on a past date.

### 4.3 Cockpit Layout (replaces existing 3-card row)

**4 stat cards using the same style as `CellDirectorCockpit`:**

| Card | Colour scheme | Value | Note |
|------|--------------|-------|------|
| Current Balance | Blue (`bg-blue-50 border-blue-200`, `text-blue-900`) | All-time `totalIncome − totalExpense` | Not affected by month filter |
| This Month's Income | Green (`bg-emerald-50 border-emerald-200`, `text-emerald-900`) | Income sum for selected month/year filter | |
| This Month's Expenses | Red (`bg-red-50 border-red-200`, `text-red-900`) | Expense sum for selected month/year filter | |
| Pending Vouchers | Amber (`bg-amber-50 border-amber-200`, `text-amber-900`), clickable `<button>` | Count of `status === 'pending'` voucher requests | Clicking toggles `showVoucherPanel` |

**Stat card markup** (matching `CellDirectorCockpit` exactly):
```jsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
    <div className="text-2xl font-black text-blue-900">RM {balance.toLocaleString()}</div>
    <div className="text-xs font-semibold text-blue-700 mt-1">💰 Current Balance</div>
  </div>
  {/* … green, red, amber cards … */}
</div>
```

### 4.4 Date Picker Row (above stat cards)

A persistent date picker row sits above the stat cards, styled like the MidweekMinistry banner but for the Finance page:

```jsx
<div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
  <span className="text-indigo-500 text-lg">📅</span>
  <div className="flex-1">
    <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Entry Date</p>
    <p className="text-xs text-indigo-500 mt-0.5">Selected date is used when you add a transaction or voucher</p>
  </div>
  <input
    type="date"
    value={selectedDate}
    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
    className="px-3 py-2 rounded-xl border border-indigo-300 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
  />
</div>
```

### 4.5 Recent Transactions List (replaces the dense tab/table view in Overview)

Shows the last 20 transactions (income + expense merged, sorted by date descending). Rendered before the existing charts:

Each row:
- Coloured left-border stripe (green = income, red = expense)
- Date (short format)
- `INCOME` / `EXPENSE` pill tag
- Category
- `departmentTag` chip (grey pill)
- `submittedBy` (small, grey)
- Amount (right-aligned, bold, green or red)

Empty state: "No transactions recorded yet."

### 4.6 Voucher Approval Panel (conditional block, not a modal)

Appears inline below the stat cards when `showVoucherPanel === true` (amber card clicked).

Each pending voucher card shows:
- Requester name, department tag, category, amount, date, description
- **Approve** button (green): calls `approveFinanceVoucherRequest`, removes card optimistically
- **Reject** button (red): calls `rejectFinanceVoucherRequest`, removes card optimistically

Empty state: "No pending voucher requests."

### 4.7 Unified "Add Transaction" Modal (Finance/Founder only)

Triggered by existing "+ Income" and "+ Expense" buttons (buttons remain, each pre-sets the `form.type` toggle).

Fields:
- **Toggle**: `Income | Expense` — switches category dropdown
- **Date**: pre-filled from `selectedDate` (editable within modal, updates `selectedDate` on change)
- **Category**: dropdown from `INCOME_TYPES` (income) or `EXPENSE_CATEGORIES` (expense)
- **Department Tag**: dropdown from `DEPARTMENT_TAGS`
- **Amount**: number input
- **Description**: text input
- **Submitted By**: pre-filled from `userProfile.name`, editable

### 4.8 Voucher Request Modal (any authenticated user)

Triggered by a new "📋 Request Voucher" button visible to all logged-in users.

Fields:
- **Date**: pre-filled from `selectedDate`
- **Category**: dropdown from `EXPENSE_CATEGORIES`
- **Department Tag**: dropdown from `DEPARTMENT_TAGS`
- **Amount**: number input
- **Description**: textarea
- **Submitted By**: auto-filled, read-only

On submit: calls `createFinanceVoucherRequest`. Modal closes. Pending Vouchers count increments (if user is Finance/Founder).

---

## 5. Edge Cases — Decisions Made

| Edge Case | Decision |
|-----------|----------|
| **Partial payments** | Enter each instalment as a separate income entry. Use `description` convention: `"Building Fund — 2 of 3"`. No linking in Phase 1. |
| **Reversals** | Allow negative `amount` on any entry. Add optional `isReversal: boolean` field. Reversal entries render with strikethrough and a `REVERSAL` pill in the transaction list. |
| **Duplicate prevention** | No automatic lock. `submittedBy + date + category` visible on each row allows visual spotting. |
| **Balance scope** | "Current Balance" = all-time total (not month-filtered). Month filter only affects the Income/Expense month cards. |
| **Rejected vouchers** | Set `status: 'rejected'` (not deleted) for audit trail. They don't appear in the pending panel. |
| **Existing docs without new fields** | `departmentTag` and `submittedBy` return `undefined`/`''` — handled with `|| ''` in render. No migration needed. |

---

## 6. Files Changed

| File | Change |
|------|--------|
| `src/constants/roles.js` | Add `"Missions"` to `INCOME_TYPES`; add `DEPARTMENT_TAGS` export |
| `src/services/firestore.js` | Add `getFinanceVoucherRequests`, `createFinanceVoucherRequest`, `approveFinanceVoucherRequest`, `rejectFinanceVoucherRequest` |
| `src/pages/Finance.jsx` | Add `selectedDate` state + date picker; 4-card cockpit replacing 3-card row; recent transactions list; voucher panel; unified modal with `departmentTag` + `submittedBy`; "Request Voucher" modal |

---

## 7. What Is Not Changing

- `getFinanceIncome`, `getFinanceExpense`, `getFinanceBudgetItems` query logic — unchanged
- All existing chart components (bar, pie) — reused as-is, placed below the cockpit
- The Budget tab — unchanged
- The Income and Expense detail tabs — unchanged (existing table views remain accessible via tabs)
- All other pages and departments

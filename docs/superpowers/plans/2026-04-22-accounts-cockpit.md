# Accounts Cockpit — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `Finance.jsx` to a cockpit-first accounting page with 4 stat cards, a voucher-request approval flow, a persistent date picker, and a clean recent-transactions list, while reusing all existing charts.

**Architecture:** Three files change: `roles.js` gets two new constants (`"Missions"` and `DEPARTMENT_TAGS`); `firestore.js` gets four new voucher-request functions; `Finance.jsx` gets new state, a date picker, a 4-card cockpit replacing the 3-card row, a recent-transactions list above the existing charts, an updated Add Transaction modal (department tag + submittedBy), and a new Voucher Request modal.

**Tech Stack:** React 19, Firebase Firestore, Tailwind CSS v4, date-fns, existing recharts charts (unchanged)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/constants/roles.js` | Modify | Add `"Missions"` to `INCOME_TYPES`; export `DEPARTMENT_TAGS` |
| `src/services/firestore.js` | Modify | Add 4 voucher-request functions |
| `src/pages/Finance.jsx` | Modify | All UI and state changes — cockpit, date picker, modals, recent transactions |

---

## Task 1: Constants — `INCOME_TYPES` + `DEPARTMENT_TAGS`

**Files:**
- Modify: `src/constants/roles.js`

- [ ] **Step 1: Add `"Missions"` to `INCOME_TYPES`**

  Find the existing `INCOME_TYPES` array (currently ends with `'Donations'`). Replace the whole array:

  ```js
  export const INCOME_TYPES = [
    'Offering 1',
    'Offering 2',
    'Offering 3',
    'Offering 4',
    'Offering 5',
    'Tithe',
    'Contribution',
    'Missions',
    'RSM',
    'RFF',
    'Donations',
  ]
  ```

- [ ] **Step 2: Add `DEPARTMENT_TAGS` export after `EXPENSE_CATEGORIES`**

  Insert this block directly after the `EXPENSE_CATEGORIES` closing bracket:

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

- [ ] **Step 3: Verify — open DevTools console, no errors expected**

  Run dev server: `npm run dev`. Navigate to Accounts page. No console errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/constants/roles.js
  git commit -m "feat: add Missions income type and DEPARTMENT_TAGS constant"
  ```

---

## Task 2: Firestore — Voucher Request Functions

**Files:**
- Modify: `src/services/firestore.js`

- [ ] **Step 1: Add the `FINANCE_VOUCHER_REQUESTS_COLLECTION` constant**

  Find the block where other collection name constants are defined (e.g. near `SUNDAY_REPORTS_COLLECTION`). Add:

  ```js
  const FINANCE_VOUCHER_REQUESTS_COLLECTION = 'finance_voucher_requests'
  ```

- [ ] **Step 2: Add `getFinanceVoucherRequests` after `createFinanceExpense` (~line 893)**

  ```js
  export async function getFinanceVoucherRequests(status = 'pending') {
    if (!db) return []
    const q = query(
      collection(db, FINANCE_VOUCHER_REQUESTS_COLLECTION),
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        date: toDate(data.date),
        category: data.category || '',
        amount: Number(data.amount) || 0,
        description: data.description || '',
        departmentTag: data.departmentTag || '',
        submittedBy: data.submittedBy || '',
        submittedByUid: data.submittedByUid || '',
        status: data.status || 'pending',
        reviewedBy: data.reviewedBy || null,
        reviewedAt: toDate(data.reviewedAt),
        rejectionReason: data.rejectionReason || null,
        createdAt: toDate(data.createdAt),
      }
    })
  }
  ```

- [ ] **Step 3: Add `createFinanceVoucherRequest`**

  Immediately after `getFinanceVoucherRequests`:

  ```js
  export async function createFinanceVoucherRequest(data) {
    if (!db) return null
    const ref = await addDoc(collection(db, FINANCE_VOUCHER_REQUESTS_COLLECTION), {
      date: Timestamp.fromDate(new Date(data.date)),
      category: data.category || '',
      amount: Number(data.amount) || 0,
      description: data.description || '',
      departmentTag: data.departmentTag || '',
      submittedBy: data.submittedBy || '',
      submittedByUid: data.submittedByUid || '',
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: Timestamp.now(),
    })
    return ref.id
  }
  ```

- [ ] **Step 4: Add `approveFinanceVoucherRequest`**

  `writeBatch` is already imported at the top of firestore.js. Add:

  ```js
  export async function approveFinanceVoucherRequest(requestId, approvedBy) {
    if (!db || !requestId) return null
    const voucherRef = doc(db, FINANCE_VOUCHER_REQUESTS_COLLECTION, requestId)
    const voucherSnap = await getDoc(voucherRef)
    if (!voucherSnap.exists()) throw new Error('Voucher not found')
    const voucherData = voucherSnap.data()
    const now = Timestamp.now()
    const batch = writeBatch(db)
    // Mark voucher as approved
    batch.update(voucherRef, {
      status: 'approved',
      reviewedBy: approvedBy,
      reviewedAt: now,
    })
    // Create the expense record
    const expenseRef = doc(collection(db, 'finance_expense'))
    batch.set(expenseRef, {
      date: voucherData.date,
      category: voucherData.category,
      amount: voucherData.amount,
      description: voucherData.description,
      departmentTag: voucherData.departmentTag,
      submittedBy: voucherData.submittedBy,
      approvedBy,
      voucherRequestId: requestId,
      createdAt: now,
    })
    await batch.commit()
    return expenseRef.id
  }
  ```

- [ ] **Step 5: Add `rejectFinanceVoucherRequest`**

  ```js
  export async function rejectFinanceVoucherRequest(requestId, rejectedBy, rejectionReason = '') {
    if (!db || !requestId) return
    await updateDoc(doc(db, FINANCE_VOUCHER_REQUESTS_COLLECTION, requestId), {
      status: 'rejected',
      reviewedBy: rejectedBy,
      reviewedAt: Timestamp.now(),
      rejectionReason: rejectionReason || '',
    })
  }
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/services/firestore.js
  git commit -m "feat: add voucher request Firestore functions"
  ```

---

## Task 3: Finance.jsx — New State + Data Loading

**Files:**
- Modify: `src/pages/Finance.jsx`

- [ ] **Step 1: Update imports**

  Find the existing import from `'../services/firestore'`. Add the four new functions:

  ```js
  import {
    getFinanceIncome,
    getFinanceExpense,
    createFinanceIncome,
    createFinanceExpense,
    getFinanceBudgetItems,
    addFinanceBudgetItem,
    updateFinanceBudgetItem,
    deleteFinanceBudgetItem,
    getFinanceVoucherRequests,
    createFinanceVoucherRequest,
    approveFinanceVoucherRequest,
    rejectFinanceVoucherRequest,
  } from '../services/firestore'
  ```

  Find the existing import from `'../constants/roles'`. Add `DEPARTMENT_TAGS`:

  ```js
  import { INCOME_TYPES, EXPENSE_CATEGORIES, DEPARTMENT_TAGS } from '../constants/roles'
  ```

- [ ] **Step 2: Add new state variables inside `Finance()`**

  After the existing `const [budgetForm, setBudgetForm] = useState({...})` block, add:

  ```js
  // Persistent date for all entry modals
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  // All-time balance (not affected by year/month filter)
  const [allTimeBalance, setAllTimeBalance] = useState(null)

  // Voucher requests
  const [voucherRequests, setVoucherRequests] = useState([])
  const [loadingVouchers, setLoadingVouchers] = useState(true)
  const [showVoucherPanel, setShowVoucherPanel] = useState(false)

  // Voucher request modal
  const [voucherModal, setVoucherModal] = useState(false)
  const [voucherForm, setVoucherForm] = useState({
    date: '',
    category: EXPENSE_CATEGORIES[0],
    departmentTag: DEPARTMENT_TAGS[0],
    amount: '',
    description: '',
  })
  const [submittingVoucher, setSubmittingVoucher] = useState(false)
  ```

- [ ] **Step 3: Add all-time balance useEffect**

  After the existing `useEffect(() => { load() }, [year, month])`:

  ```js
  useEffect(() => {
    Promise.all([getFinanceIncome({}), getFinanceExpense({})])
      .then(([inc, exp]) => {
        const totalInc = inc.reduce((s, i) => s + (Number(i.amount) || 0), 0)
        const totalExp = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0)
        setAllTimeBalance(totalInc - totalExp)
      })
      .catch(() => setAllTimeBalance(0))
  }, [])
  ```

- [ ] **Step 4: Add `loadVouchers` function + useEffect**

  After the `loadBudget` function:

  ```js
  async function loadVouchers() {
    setLoadingVouchers(true)
    try {
      const list = await getFinanceVoucherRequests('pending')
      setVoucherRequests(list)
    } catch (e) {
      console.error(e)
    }
    setLoadingVouchers(false)
  }
  ```

  After the `useEffect` that loads budget:

  ```js
  useEffect(() => {
    loadVouchers()
  }, [])
  ```

- [ ] **Step 5: Add `handleApproveVoucher` and `handleRejectVoucher`**

  After `handleSubmit`:

  ```js
  async function handleApproveVoucher(request) {
    const approvedBy = userProfile?.name || userProfile?.email || 'Finance'
    try {
      await approveFinanceVoucherRequest(request.id, approvedBy)
      setVoucherRequests((prev) => prev.filter((r) => r.id !== request.id))
      // Reload income/expense data so new expense appears
      load()
      setAllTimeBalance(null)
      Promise.all([getFinanceIncome({}), getFinanceExpense({})])
        .then(([inc, exp]) => {
          setAllTimeBalance(
            inc.reduce((s, i) => s + (Number(i.amount) || 0), 0) -
            exp.reduce((s, e) => s + (Number(e.amount) || 0), 0)
          )
        })
        .catch(() => {})
    } catch (err) {
      console.error(err)
      alert('Failed to approve voucher')
    }
  }

  async function handleRejectVoucher(request) {
    const rejectedBy = userProfile?.name || userProfile?.email || 'Finance'
    try {
      await rejectFinanceVoucherRequest(request.id, rejectedBy)
      setVoucherRequests((prev) => prev.filter((r) => r.id !== request.id))
    } catch (err) {
      console.error(err)
      alert('Failed to reject voucher')
    }
  }
  ```

- [ ] **Step 6: Add `handleVoucherSubmit`**

  After `handleRejectVoucher`:

  ```js
  async function handleVoucherSubmit(e) {
    e.preventDefault()
    setSubmittingVoucher(true)
    try {
      await createFinanceVoucherRequest({
        ...voucherForm,
        submittedBy: userProfile?.name || userProfile?.email || 'Unknown',
        submittedByUid: userProfile?.id || userProfile?.uid || '',
      })
      setVoucherModal(false)
      setVoucherForm({
        date: selectedDate,
        category: EXPENSE_CATEGORIES[0],
        departmentTag: DEPARTMENT_TAGS[0],
        amount: '',
        description: '',
      })
      loadVouchers()
    } catch (err) {
      console.error(err)
      alert('Failed to submit voucher request')
    }
    setSubmittingVoucher(false)
  }
  ```

- [ ] **Step 7: Update `handleSubmit` to pass `departmentTag` and `submittedBy`**

  Find the existing `handleSubmit`. Replace the two `createFinance*` calls:

  ```js
  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const payload = {
        date: form.date,
        category: form.category,
        amount: Number(form.amount) || 0,
        description: form.description || '',
        departmentTag: form.departmentTag || '',
        submittedBy: form.submittedBy || userProfile?.name || userProfile?.email || '',
      }
      if (form.type === 'income') {
        await createFinanceIncome(payload)
      } else {
        await createFinanceExpense({ ...payload, voucherRequestId: null })
      }
      // Keep selectedDate in sync with what was just submitted
      setSelectedDate(form.date)
      setModal(null)
      load()
      // Refresh all-time balance
      Promise.all([getFinanceIncome({}), getFinanceExpense({})])
        .then(([inc, exp]) => {
          setAllTimeBalance(
            inc.reduce((s, i) => s + (Number(i.amount) || 0), 0) -
            exp.reduce((s, e) => s + (Number(e.amount) || 0), 0)
          )
        })
        .catch(() => {})
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
  }
  ```

- [ ] **Step 8: Add `recentTransactions` computed value**

  After `const expenseByCat = ...` computation:

  ```js
  const recentTransactions = [
    ...income.map((i) => ({ ...i, _type: 'income' })),
    ...expense.map((e) => ({ ...e, _type: 'expense' })),
  ]
    .sort((a, b) => {
      const da = a.date ? new Date(a.date) : new Date(0)
      const db2 = b.date ? new Date(b.date) : new Date(0)
      return db2 - da
    })
    .slice(0, 20)
  ```

- [ ] **Step 9: Verify — no console errors on page load**

  Run `npm run dev`. Open Accounts page. Check DevTools console — no errors.

- [ ] **Step 10: Commit**

  ```bash
  git add src/pages/Finance.jsx
  git commit -m "feat: add voucher/cockpit state and data loading to Finance"
  ```

---

## Task 4: Finance.jsx — Cockpit UI (Date Picker + 4 Stat Cards + Voucher Panel)

**Files:**
- Modify: `src/pages/Finance.jsx`

- [ ] **Step 1: Update the header button row to add "Request Voucher" button**

  Find this in the JSX (inside the header `<div className="flex flex-wrap items-center justify-between gap-4">`):

  ```jsx
        {canEnter && (
          <div className="flex gap-2">
            <button onClick={() => { setForm({ type: 'income', ... }); setModal('form') }} ...>
              + Income
            </button>
            <button onClick={() => { setForm({ type: 'expense', ... }); setModal('form') }} ...>
              + Expense
            </button>
          </div>
        )}
  ```

  Replace with (keeping both buttons and adding the voucher button; update the `onClick` of both existing buttons to also set `departmentTag` and `submittedBy`):

  ```jsx
        <div className="flex flex-wrap gap-2">
          {canEnter && (
            <>
              <button
                onClick={() => {
                  setForm({
                    type: 'income',
                    date: selectedDate,
                    category: INCOME_TYPES[0],
                    departmentTag: DEPARTMENT_TAGS[0],
                    amount: '',
                    description: '',
                    submittedBy: userProfile?.name || userProfile?.email || '',
                  })
                  setModal('form')
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
              >
                + Income
              </button>
              <button
                onClick={() => {
                  setForm({
                    type: 'expense',
                    date: selectedDate,
                    category: EXPENSE_CATEGORIES[0],
                    departmentTag: DEPARTMENT_TAGS[0],
                    amount: '',
                    description: '',
                    submittedBy: userProfile?.name || userProfile?.email || '',
                  })
                  setModal('form')
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700"
              >
                + Expense
              </button>
            </>
          )}
          <button
            onClick={() => {
              setVoucherForm({
                date: selectedDate,
                category: EXPENSE_CATEGORIES[0],
                departmentTag: DEPARTMENT_TAGS[0],
                amount: '',
                description: '',
              })
              setVoucherModal(true)
            }}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600"
          >
            📋 Request Voucher
          </button>
        </div>
  ```

- [ ] **Step 2: Add the Entry Date picker banner**

  Find the `<div className="flex flex-wrap gap-3 items-center">` that contains the year/month filter selects. Insert this block ABOVE that div:

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

- [ ] **Step 3: Replace the existing 3-card row with the 4-card cockpit**

  Find and remove this block:

  ```jsx
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Income</p>
          <p className="text-2xl font-bold text-emerald-600">RM {totalIncome.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Expense</p>
          <p className="text-2xl font-bold text-red-600">RM {totalExpense.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Balance</p>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
            RM {balance.toLocaleString()}
          </p>
        </div>
      </div>
  ```

  Replace with:

  ```jsx
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-blue-900">
            {allTimeBalance === null ? '—' : `RM ${allTimeBalance.toLocaleString()}`}
          </div>
          <div className="text-xs font-semibold text-blue-700 mt-1">💰 Current Balance</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-emerald-900">RM {totalIncome.toLocaleString()}</div>
          <div className="text-xs font-semibold text-emerald-700 mt-1">📈 This Period Income</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-red-900">RM {totalExpense.toLocaleString()}</div>
          <div className="text-xs font-semibold text-red-700 mt-1">📉 This Period Expenses</div>
        </div>
        <button
          type="button"
          onClick={() => setShowVoucherPanel((v) => !v)}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center hover:bg-amber-100 transition-all"
        >
          <div className="text-2xl font-black text-amber-900">
            {loadingVouchers ? '—' : voucherRequests.length}
          </div>
          <div className="text-xs font-semibold text-amber-700 mt-1">⏳ Pending Vouchers</div>
          <div className="text-xs text-amber-400 mt-0.5">tap to review ↗</div>
        </button>
      </div>
  ```

- [ ] **Step 4: Add the Voucher Approval Panel**

  After the 4-card grid block (and before the year/month filter row), add:

  ```jsx
      {showVoucherPanel && canEnter && (
        <div className="bg-white border border-amber-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            ⏳ Pending Voucher Requests
            {voucherRequests.length > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {voucherRequests.length}
              </span>
            )}
          </h3>
          {loadingVouchers ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : voucherRequests.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-400">
              No pending voucher requests.
            </div>
          ) : (
            voucherRequests.map((req) => (
              <div key={req.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">RM {req.amount.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      👤 {req.submittedBy || '—'} · 🏷 {req.departmentTag || '—'} · {req.category || '—'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {req.date ? formatDMY(req.date) : '—'}
                      {req.description ? ` · ${req.description}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleApproveVoucher(req)}
                    className="flex-1 py-2 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition"
                  >
                    ✓ Approve — Move to Expenses
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectVoucher(req)}
                    className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition"
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
  ```

- [ ] **Step 5: Verify in browser**

  - The 4 stat cards appear where the 3-card row was
  - "Current Balance" shows all-time total (may take a moment to load — shows `—` until resolved)
  - "This Period Income/Expenses" change when you pick a different year/month filter
  - Clicking the amber "Pending Vouchers" card toggles the approval panel
  - No console errors

- [ ] **Step 6: Commit**

  ```bash
  git add src/pages/Finance.jsx
  git commit -m "feat: cockpit stat cards, date picker, and voucher approval panel"
  ```

---

## Task 5: Finance.jsx — Recent Transactions List

**Files:**
- Modify: `src/pages/Finance.jsx`

- [ ] **Step 1: Add the recent transactions list inside the Overview tab**

  Find this block in the JSX:

  ```jsx
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  ```

  Insert the following block BEFORE that `<div className="grid ...">`, but still inside `{tab === 'overview' && (`:

  Change from:
  ```jsx
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  ```

  To:
  ```jsx
      {tab === 'overview' && (
        <>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 text-sm">Recent Transactions</h2>
            <p className="text-xs text-slate-400 mt-0.5">Last 20 entries — income and expenses</p>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No transactions recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`flex items-center gap-3 px-5 py-3 border-l-4 ${
                    tx._type === 'income'
                      ? 'border-emerald-400'
                      : tx.isReversal
                      ? 'border-orange-400'
                      : 'border-red-400'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        tx._type === 'income'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {tx._type === 'income' ? 'INCOME' : tx.isReversal ? 'REVERSAL' : 'EXPENSE'}
                      </span>
                      <span className="text-xs text-slate-600 font-medium">{tx.category || '—'}</span>
                      {tx.departmentTag && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                          {tx.departmentTag}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{tx.date ? formatDMY(tx.date) : '—'}</span>
                      {tx.submittedBy && (
                        <span className="text-xs text-slate-400">· {tx.submittedBy}</span>
                      )}
                      {tx.description && (
                        <span className="text-xs text-slate-400 truncate max-w-[160px]">· {tx.description}</span>
                      )}
                    </div>
                  </div>
                  <div className={`text-sm font-bold flex-shrink-0 ${
                    tx._type === 'income' ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {tx._type === 'income' ? '+' : '−'} RM {(Number(tx.amount) || 0).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  ```

  Then find the closing `</div>` of the `{tab === 'overview' && (` block (the one that closes the `grid` div at ~line 331) and add a closing `</>` after it:

  From:
  ```jsx
        </div>
      )}
  ```

  To:
  ```jsx
        </div>
        </>
      )}
  ```

- [ ] **Step 2: Verify in browser**

  Open Accounts → Overview tab. The recent transactions list appears above the charts. Each row has a coloured left border, type pill, category, department tag chip, date, submittedBy, and amount. Charts remain unchanged below it.

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/Finance.jsx
  git commit -m "feat: recent transactions list in Finance overview tab"
  ```

---

## Task 6: Finance.jsx — Updated Add Transaction Modal

**Files:**
- Modify: `src/pages/Finance.jsx`

- [ ] **Step 1: Replace the existing `modal === 'form'` block**

  Find the existing modal (starts at `{modal === 'form' && (`). Replace the entire block with:

  ```jsx
      {modal === 'form' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Add {form.type === 'income' ? 'Income' : 'Expense'}
              </h2>
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: 'income', category: INCOME_TYPES[0] }))}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                    form.type === 'income' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  Income
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: 'expense', category: EXPENSE_CATEGORIES[0] }))}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                    form.type === 'expense' ? 'bg-white shadow-sm text-red-700' : 'text-slate-500'
                  }`}
                >
                  Expense
                </button>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, date: e.target.value }))
                    if (e.target.value) setSelectedDate(e.target.value)
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {form.type === 'income' ? 'Type' : 'Category'} *
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                >
                  {(form.type === 'income' ? INCOME_TYPES : EXPENSE_CATEGORIES).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department *</label>
                <select
                  value={form.departmentTag}
                  onChange={(e) => setForm((f) => ({ ...f, departmentTag: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                >
                  {DEPARTMENT_TAGS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (RM) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Submitted By</label>
                <input
                  type="text"
                  value={form.submittedBy}
                  onChange={(e) => setForm((f) => ({ ...f, submittedBy: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
  ```

- [ ] **Step 2: Verify in browser**

  Click `+ Income`. Modal opens with Income/Expense toggle at top, department dropdown, submittedBy field. Change date — the Entry Date banner updates to match. Submit an entry — modal closes, the date banner keeps the submitted date.

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/Finance.jsx
  git commit -m "feat: updated Add Transaction modal with department tag and submittedBy"
  ```

---

## Task 7: Finance.jsx — Voucher Request Modal

**Files:**
- Modify: `src/pages/Finance.jsx`

- [ ] **Step 1: Add the Voucher Request modal just before the closing `</div>` of the component return**

  Find the last `</div>` before `</div>` + `}` (end of the Finance component return). Insert before it:

  ```jsx
      {voucherModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">📋 Request a Voucher</h2>
              <p className="text-xs text-slate-500 mt-1">Submit an expense for Finance team approval</p>
            </div>
            <form onSubmit={handleVoucherSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={voucherForm.date}
                  onChange={(e) => {
                    setVoucherForm((f) => ({ ...f, date: e.target.value }))
                    if (e.target.value) setSelectedDate(e.target.value)
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
                <select
                  value={voucherForm.category}
                  onChange={(e) => setVoucherForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department *</label>
                <select
                  value={voucherForm.departmentTag}
                  onChange={(e) => setVoucherForm((f) => ({ ...f, departmentTag: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                >
                  {DEPARTMENT_TAGS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (RM) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={voucherForm.amount}
                  onChange={(e) => setVoucherForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={voucherForm.description}
                  onChange={(e) => setVoucherForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 resize-none"
                  placeholder="What is this expense for?"
                />
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
                Submitted by: <strong>{userProfile?.name || userProfile?.email || 'You'}</strong>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submittingVoucher}
                  className="flex-1 px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  {submittingVoucher ? 'Submitting…' : 'Submit for Approval'}
                </button>
                <button
                  type="button"
                  onClick={() => setVoucherModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
  ```

- [ ] **Step 2: Verify end-to-end voucher flow**

  1. Log in as any user. Click "📋 Request Voucher". Fill date (past date), category, department, amount, description. Click "Submit for Approval" — modal closes.
  2. Log in as Finance/Founder. The amber "Pending Vouchers" card shows count `1`. Click it — panel opens showing the request.
  3. Click "✓ Approve". Card disappears from panel. Check the Expense tab — the new expense record appears.
  4. Submit another voucher. On the panel, click "✕ Reject". Card disappears; no expense is created.

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/Finance.jsx
  git commit -m "feat: voucher request modal and complete approval flow"
  ```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|---|---|
| Add "Missions" to INCOME_TYPES | Task 1 |
| Add DEPARTMENT_TAGS constant | Task 1 |
| getFinanceVoucherRequests | Task 2 |
| createFinanceVoucherRequest | Task 2 |
| approveFinanceVoucherRequest (batch) | Task 2 |
| rejectFinanceVoucherRequest | Task 2 |
| selectedDate state | Task 3 |
| All-time balance load | Task 3 |
| loadVouchers + handleApprove/Reject | Task 3 |
| handleVoucherSubmit | Task 3 |
| handleSubmit passes departmentTag + submittedBy | Task 3 |
| recentTransactions computed | Task 3 |
| Entry Date picker banner | Task 4 |
| 4 stat cards (CellDirectorCockpit style) | Task 4 |
| "Request Voucher" button (all users) | Task 4 |
| Voucher approval panel | Task 4 |
| Recent transactions list above charts | Task 5 |
| Updated Add Transaction modal (toggle, dept, submittedBy) | Task 6 |
| Date sync: modal date ↔ selectedDate | Task 6 |
| Voucher Request modal | Task 7 |
| Existing charts untouched | ✅ not touched in any task |
| Budget tab untouched | ✅ not touched in any task |

**No placeholders found.** All steps contain complete code.

**Type consistency:** `DEPARTMENT_TAGS` used in Task 1 → imported in Task 3 → used in Task 6 form and Task 7 form. `voucherForm` shape set in Task 3 → used in Task 7. `handleApproveVoucher`/`handleRejectVoucher` defined in Task 3 → called in Task 4. ✅ Consistent.

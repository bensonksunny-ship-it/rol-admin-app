# Accounts Income Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder IncomePage and its surrounding entry scaffolding with a fully working monthly income entry and management page inside the Accounts department hub.

**Architecture:** Self-contained `IncomePage.jsx` handles all state and data — month picker controls which month's entries are loaded, an always-visible inline form handles add/edit, and a list below shows entries for the selected month with inline delete confirmation. Two new Firestore functions (`updateFinanceIncome`, `deleteFinanceIncome`) are added to the existing `firestore.js` service. Old placeholder files are deleted and routing is simplified from `entry/*` to `entry`.

**Tech Stack:** React 18, React Router v6, Firebase Firestore, Tailwind CSS, date-fns

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/services/firestore.js` | Add `updateFinanceIncome` and `deleteFinanceIncome` |
| Create | `src/pages/accounts/IncomePage.jsx` | Full income entry + list component |
| Modify | `src/App.jsx` | Change `entry/*` route to `entry`, swap import |
| Modify | `src/components/DepartmentTabBar.jsx` | Fix link from `.../tally` to `.../entry` |
| Delete | `src/pages/accounts/AccountsEntryGate.jsx` | Replaced by permission check inside IncomePage |
| Delete | `src/pages/accounts/EntryPage.jsx` | Replaced |
| Delete | `src/pages/accounts/TallyPage.jsx` | Placeholder, removed |
| Delete | `src/pages/accounts/WeeklyEntryPage.jsx` | Placeholder, removed |

`src/pages/accounts/ExpensePage.jsx` is **kept** — out of scope.

---

## Task 1: Add Firestore update and delete functions for income

**Files:**
- Modify: `src/services/firestore.js` (after the existing `createFinanceIncome` function, around line 856)

- [ ] **Step 1: Add `updateFinanceIncome` and `deleteFinanceIncome` after `createFinanceIncome`**

Open `src/services/firestore.js`. Find the line `// Finance Expense` (around line 858). Insert the following two functions immediately before it:

```js
export async function updateFinanceIncome(id, data) {
  await updateDoc(doc(db, 'finance_income', id), {
    date: Timestamp.fromDate(new Date(data.date)),
    category: data.category,
    departmentTag: data.departmentTag || '',
    amount: Number(data.amount) || 0,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteFinanceIncome(id) {
  await deleteDoc(doc(db, 'finance_income', id))
}
```

Both `updateDoc`, `deleteDoc`, `doc`, `Timestamp`, and `db` are already imported at the top of the file — no new imports needed.

- [ ] **Step 2: Commit**

```bash
git add src/services/firestore.js
git commit -m "feat: add updateFinanceIncome and deleteFinanceIncome Firestore functions"
```

---

## Task 2: Create IncomePage.jsx

**Files:**
- Create: `src/pages/accounts/IncomePage.jsx`

- [ ] **Step 1: Create the file with the full implementation**

Create `src/pages/accounts/IncomePage.jsx` with this exact content:

```jsx
import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { INCOME_TYPES, DEPARTMENT_TAGS } from '../../constants/roles'
import {
  getFinanceIncome,
  createFinanceIncome,
  updateFinanceIncome,
  deleteFinanceIncome,
} from '../../services/firestore'

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  category: INCOME_TYPES[0],
  departmentTag: DEPARTMENT_TAGS[0],
  amount: '',
}

export default function IncomePage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [activeMonth, setActiveMonth] = useState(startOfMonth(new Date()))
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    load()
  }, [activeMonth, canAccess])

  if (!canAccess) return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    try {
      const data = await getFinanceIncome({
        year: activeMonth.getFullYear(),
        month: activeMonth.getMonth(),
      })
      setEntries(data)
    } catch {
      // list stays empty on error
    } finally {
      setLoading(false)
    }
  }

  const totalIncome = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  function prevMonth() { setActiveMonth(m => subMonths(m, 1)) }
  function nextMonth() { setActiveMonth(m => addMonths(m, 1)) }

  function validate() {
    if (!form.date) return 'Date is required.'
    if (!form.amount || Number(form.amount) <= 0) return 'Amount must be greater than 0.'
    return ''
  }

  async function handleSave(e) {
    e.preventDefault()
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError('')
    setSaving(true)
    try {
      const payload = {
        date: form.date,
        category: form.category,
        departmentTag: form.departmentTag,
        amount: Number(form.amount),
      }
      if (editingId) {
        await updateFinanceIncome(editingId, payload)
      } else {
        await createFinanceIncome(payload)
      }
      setForm(EMPTY_FORM)
      setEditingId(null)
      await load()
    } catch {
      setSaveError('Failed to save. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(entry) {
    setEditingId(entry.id)
    setForm({
      date: entry.date instanceof Date
        ? format(entry.date, 'yyyy-MM-dd')
        : format(new Date(entry.date), 'yyyy-MM-dd'),
      category: entry.category || INCOME_TYPES[0],
      departmentTag: entry.departmentTag || DEPARTMENT_TAGS[0],
      amount: String(entry.amount ?? ''),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function handleDelete(id) {
    try {
      await deleteFinanceIncome(id)
      setDeletingId(null)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      setSaveError('Failed to delete. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    }
  }

  return (
    <div className="space-y-5 pb-12">

      {/* Month picker */}
      <div className="flex items-center justify-center gap-4 py-2">
        <button
          type="button"
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-base font-semibold text-slate-800 w-36 text-center">
          {format(activeMonth, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">Total Income</p>
        <p className="text-2xl font-bold text-indigo-700">
          ₹{totalIncome.toLocaleString('en-IN')}
        </p>
      </div>

      {/* Entry form */}
      <form
        onSubmit={handleSave}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4"
      >
        <h3 className="text-sm font-semibold text-slate-700">
          {editingId ? 'Edit Income Entry' : 'Add Income Entry'}
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Income Type</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Department Tag</label>
            <select
              value={form.departmentTag}
              onChange={e => setForm(f => ({ ...f, departmentTag: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DEPARTMENT_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {formError && (
          <p className="text-red-600 text-xs font-medium">{formError}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
            >
              Cancel
            </button>
          )}
        </div>

        {saveError && (
          <p className="text-red-600 text-xs font-medium">{saveError}</p>
        )}
      </form>

      {/* Income list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            No income recorded for this month.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Income Type</th>
                  <th className="px-4 py-3">Dept Tag</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-slate-700">
                      {entry.date instanceof Date
                        ? format(entry.date, 'dd/MM/yyyy')
                        : format(new Date(entry.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entry.category}</td>
                    <td className="px-4 py-3 text-slate-500">{entry.departmentTag}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      ₹{Number(entry.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {deletingId === entry.id ? (
                        <span className="flex items-center justify-end gap-2 text-xs text-slate-600">
                          <span>Confirm delete?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="text-red-600 font-medium hover:underline"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="text-slate-500 hover:underline"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(entry)}
                            className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 transition"
                            aria-label="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(entry.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition"
                            aria-label="Delete"
                          >
                            🗑️
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/accounts/IncomePage.jsx
git commit -m "feat: add IncomePage — monthly income entry and list"
```

---

## Task 3: Update routing, fix tab link, delete old files

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/DepartmentTabBar.jsx`
- Delete: `src/pages/accounts/AccountsEntryGate.jsx`
- Delete: `src/pages/accounts/EntryPage.jsx`
- Delete: `src/pages/accounts/TallyPage.jsx`
- Delete: `src/pages/accounts/WeeklyEntryPage.jsx`

- [ ] **Step 1: Update the import in App.jsx**

In `src/App.jsx`, replace:
```jsx
import AccountsEntryGate from './pages/accounts/AccountsEntryGate'
```
with:
```jsx
import IncomePage from './pages/accounts/IncomePage'
```

- [ ] **Step 2: Update the nested route in App.jsx**

In `src/App.jsx`, replace:
```jsx
<Route path="department/:slug" element={<DepartmentHub />}>
  <Route path="entry/*" element={<AccountsEntryGate />} />
</Route>
```
with:
```jsx
<Route path="department/:slug" element={<DepartmentHub />}>
  <Route path="entry" element={<IncomePage />} />
</Route>
```

- [ ] **Step 3: Fix the tab link in DepartmentTabBar.jsx**

In `src/components/DepartmentTabBar.jsx`, find the block that starts with `if (tab === 'entry' && slug === 'accounts')` (around line 86). Change:
```jsx
const to = `${ACCOUNTS_ENTRY_BASE_PATH}/tally`
```
to:
```jsx
const to = ACCOUNTS_ENTRY_BASE_PATH
```
`ACCOUNTS_ENTRY_BASE_PATH` is already imported at the top of that file and equals `'/department/accounts/entry'`.

- [ ] **Step 4: Delete old placeholder files**

```bash
rm "src/pages/accounts/AccountsEntryGate.jsx"
rm "src/pages/accounts/EntryPage.jsx"
rm "src/pages/accounts/TallyPage.jsx"
rm "src/pages/accounts/WeeklyEntryPage.jsx"
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/DepartmentTabBar.jsx
git rm src/pages/accounts/AccountsEntryGate.jsx src/pages/accounts/EntryPage.jsx src/pages/accounts/TallyPage.jsx src/pages/accounts/WeeklyEntryPage.jsx
git commit -m "feat: wire IncomePage into accounts entry route, remove old placeholders"
```

---

## Task 4: Smoke test in browser

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to Accounts department hub**

Go to `/department/accounts`. Verify the tab bar shows "Accounts Entry".

- [ ] **Step 3: Click "Accounts Entry" tab**

URL should change to `/department/accounts/entry`. Verify:
- Month picker shows the current month (e.g. "April 2026")
- "Total Income" summary card shows ₹0 (or correct amount if existing entries)
- "Add Income Entry" form is visible with Date, Income Type, Department Tag, Amount fields
- List shows "No income recorded for this month." if empty

- [ ] **Step 4: Add an income entry**

Fill in: Date = today, Income Type = Tithe, Department Tag = General, Amount = 5000. Click Save.
Verify: form clears, new entry appears in the list, Total Income updates to ₹5,000.

- [ ] **Step 5: Edit the entry**

Click the ✏️ icon on the row. Verify:
- Form pre-fills with the entry's values
- Heading changes to "Edit Income Entry"
- Button changes to "Update"
- "Cancel" link appears

Change Amount to 6000. Click Update.
Verify: entry in list updates to ₹6,000, Total Income updates to ₹6,000, form returns to Add mode.

- [ ] **Step 6: Delete the entry**

Click the 🗑️ icon. Verify inline confirmation appears ("Confirm delete? Yes / No").
Click Yes. Verify entry is removed from list, Total Income returns to ₹0.

- [ ] **Step 7: Test month navigation**

Click ‹ to go to the previous month. Verify URL stays at `/department/accounts/entry`, month label updates, list reloads for that month.

- [ ] **Step 8: Test validation**

Clear the Amount field. Click Save. Verify the error message "Amount must be greater than 0." appears below the form fields without any page reload.

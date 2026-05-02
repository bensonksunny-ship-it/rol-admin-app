# Departmental Expense View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a department filter dropdown to ExpensePage so Accounts users can view and enter expenses per department, with the total card updating to reflect the filtered selection.

**Architecture:** Two-file change. `firestore.js` writes `department` instead of `category` on expense documents. `ExpensePage.jsx` renames `category` → `department` throughout, adds a `filterDept` state, and derives `visibleEntries` by filtering `entries` client-side before rendering.

**Tech Stack:** React 19, Firestore v12, Tailwind CSS v4, date-fns

---

### Task 1: Update firestore.js — write `department` on expense documents

**Files:**
- Modify: `src/services/firestore.js`

- [ ] **Step 1: Update `createFinanceExpense` to write `department`**

In `createFinanceExpense`, the spread `...data` already passes through all fields. No change needed there — callers will now pass `department` instead of `category` and the spread handles it. Verify the function looks like this (no explicit `category` reference):

```js
export async function createFinanceExpense(data) {
  const ref = await addDoc(collection(db, 'finance_expense'), {
    ...data,
    date: Timestamp.fromDate(new Date(data.date)),
    amount: Number(data.amount) || 0,
    createdAt: Timestamp.now(),
  })
  return ref.id
}
```

No edit required for `createFinanceExpense` — confirm it has no hardcoded `category:` line, then move on.

- [ ] **Step 2: Update `updateFinanceExpense` to write `department`**

Find `updateFinanceExpense` in `src/services/firestore.js`. Replace:

```js
export async function updateFinanceExpense(id, data) {
  await updateDoc(doc(db, 'finance_expense', id), {
    date: Timestamp.fromDate(new Date(data.date)),
    category: data.category,
    amount: Number(data.amount) || 0,
    updatedAt: Timestamp.now(),
  })
}
```

With:

```js
export async function updateFinanceExpense(id, data) {
  await updateDoc(doc(db, 'finance_expense', id), {
    date: Timestamp.fromDate(new Date(data.date)),
    department: data.department,
    amount: Number(data.amount) || 0,
    updatedAt: Timestamp.now(),
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/firestore.js
git commit -m "feat: write department field on expense update"
```

---

### Task 2: Rewrite ExpensePage.jsx with department field + filter dropdown

**Files:**
- Modify: `src/pages/accounts/ExpensePage.jsx`

- [ ] **Step 1: Update `EMPTY_FORM` — rename `category` → `department`**

Replace:
```js
const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  category: EXPENSE_CATEGORIES[0],
  amount: '',
}
```
With:
```js
const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  department: EXPENSE_CATEGORIES[0],
  amount: '',
}
```

- [ ] **Step 2: Add `filterDept` state and `visibleEntries` derived value**

After the existing state declarations (after `deletingId`), add:

```js
const [filterDept, setFilterDept] = useState('all')
```

Replace the existing `totalExpense` line:
```js
const totalExpense = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
```
With:
```js
const visibleEntries = filterDept === 'all'
  ? entries
  : entries.filter(e => (e.department || e.category) === filterDept)

const totalExpense = visibleEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
```

- [ ] **Step 3: Update `handleSave` payload — `department` instead of `category`**

Replace:
```js
      const payload = {
        date: form.date,
        category: form.category,
        amount: Number(form.amount),
      }
```
With:
```js
      const payload = {
        date: form.date,
        department: form.department,
        amount: Number(form.amount),
      }
```

- [ ] **Step 4: Update `handleEdit` — read `department` from entry**

Replace:
```js
      category: entry.category || EXPENSE_CATEGORIES[0],
```
With:
```js
      department: entry.department || entry.category || EXPENSE_CATEGORIES[0],
```

- [ ] **Step 5: Add department filter dropdown to JSX — between month picker and summary card**

After the closing `</div>` of the month picker block and before the summary card `<div>`, insert:

```jsx
      {/* Department filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600 shrink-0">Department</label>
        <select
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Departments</option>
          {EXPENSE_CATEGORIES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
```

- [ ] **Step 6: Update the entry form field — rename Category label + bind to `department`**

Replace the Category select in the form:
```jsx
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {EXPENSE_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
```
With:
```jsx
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Department</label>
            <select
              value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {EXPENSE_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
```

- [ ] **Step 7: Update table to use `visibleEntries` and rename column header**

Replace `entries.map(entry =>` with `visibleEntries.map(entry =>` in the tbody.

Replace table column header:
```jsx
                  <th className="px-4 py-3">Category</th>
```
With:
```jsx
                  <th className="px-4 py-3">Department</th>
```

Replace table cell that renders the department:
```jsx
                    <td className="px-4 py-3 text-slate-700">{entry.category}</td>
```
With:
```jsx
                    <td className="px-4 py-3 text-slate-700">{entry.department || entry.category}</td>
```

- [ ] **Step 8: Update the empty state message to reflect dept filter**

Replace:
```jsx
          <div className="p-10 text-center text-slate-400 text-sm">
            No expenses recorded for this month.
          </div>
```
With:
```jsx
          <div className="p-10 text-center text-slate-400 text-sm">
            {filterDept === 'all'
              ? 'No expenses recorded for this month.'
              : `No expenses recorded for ${filterDept} this month.`}
          </div>
```

Also update the condition that controls which branch to show — change `entries.length === 0` to `visibleEntries.length === 0`:
```jsx
        ) : visibleEntries.length === 0 ? (
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/accounts/ExpensePage.jsx
git commit -m "feat: departmental expense filter — department field + dropdown filter"
```

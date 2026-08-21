# Expense Grid — Multi-Expand, Compact Side-by-Side Cards

## Problem

In the Accounts Expense grid (`src/pages/accounts/ExpensePage.jsx`), clicking a department card expands it into a full-width inline table (existing entries + an "add new rows" paste grid). Two things make this worse now than before:

1. Only one department can ever be expanded at a time (`expandedDept` is a single string) — expanding a new one auto-collapses whichever was open.
2. The expanded card spans the entire grid width (`col-span-2 sm:col-span-3 lg:col-span-4`), and since the Accounts department just went edge-to-edge full-width (`docs/superpowers/specs/2026-08-21-accounts-full-width-layout-design.md`), that's now the full browser width — a 5-column table (Sl, Date, Item, Bill No, Amount) stretched across it looks sparse and empty.

## Goals

- Multiple departments can be expanded simultaneously, each fully independent (its own in-progress new-rows/paste state and its own edit-existing-entries state) — you can be pasting rows into one department while mid-edit on another.
- Expanded cards shrink to a compact width instead of spanning the full grid, so two fit side-by-side on the same row at desktop width.
- Column padding stays as compact as it already is; the existing horizontal-scroll wrapper handles any overflow at the narrower width.
- Excel paste-multiple-rows-at-once keeps working, independently, in every currently-expanded department.

## Non-goals

- No change to the Firestore read/write logic (`createFinanceExpense`, `updateFinanceExpense`, `listenFinanceExpense`) — only how the expand/edit UI state is organized and laid out.
- No change to the "All" summary card, the bottom entry form/stat card, or the top-level Excel bulk-import flow (`handleXlsxFile`/`handleImportAll`) — unrelated to per-department expand state.
- No hard cap on how many departments can be expanded at once — the grid just wraps naturally as more are opened.
- `IncomePage.jsx` is out of scope — this only touches `ExpensePage.jsx`. (It has a similar but not identical expand pattern; if the same treatment is wanted there later, that's a separate spec.)

## Design

### 1. State model

Replace these seven flat, singular pieces of state:
```js
const [expandedDept, setExpandedDept] = useState(null)
const [newRows, setNewRows] = useState(() => blankRows())
const [savingRows, setSavingRows] = useState(false)
const [rowsError, setRowsError] = useState('')
const [isEditingSaved, setIsEditingSaved] = useState(false)
const [editRows, setEditRows] = useState([])
const [editSaving, setEditSaving] = useState(false)
const [editError, setEditError] = useState('')
```
with:
```js
const [expandedDepts, setExpandedDepts] = useState([])          // string[]
const [deptEditState, setDeptEditState] = useState({})          // { [dept]: DeptEditState }
```
where `DeptEditState` is `{ newRows, savingRows, rowsError, isEditingSaved, editRows, editSaving, editError }`, defaulting (for any department not yet in the map) to `{ newRows: blankRows(), savingRows: false, rowsError: '', isEditingSaved: false, editRows: [], editSaving: false, editError: '' }` (call this `DEFAULT_DEPT_STATE`, a module-level constant — never mutated directly, always spread into a fresh object on write).

A helper centralizes reads/writes:
```js
function getDeptState(dept) {
  return deptEditState[dept] || DEFAULT_DEPT_STATE
}
function updateDeptState(dept, updater) {
  setDeptEditState(prev => {
    const current = prev[dept] || DEFAULT_DEPT_STATE
    return { ...prev, [dept]: { ...current, ...updater(current) } }
  })
}
```

`toggleExpand(dept)` becomes:
```js
function toggleExpand(dept) {
  setExpandedDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept])
  setDeptEditState(prev => ({ ...prev, [dept]: { ...DEFAULT_DEPT_STATE, newRows: blankRows() } }))
}
```
This resets that one department's edit state to blank on every toggle (open or close) — identical to today's behavior, just scoped to the department being toggled instead of wiping global state.

### 2. Function signature changes

Each of these gains a `dept` parameter (already present on some) and reads/writes via `getDeptState(dept)` / `updateDeptState(dept, ...)` instead of the old closed-over state:

| Function | Old | New |
|---|---|---|
| `updateRowField` | `(idx, field, value)` | `(dept, idx, field, value)` |
| `addMoreRows` | `(count)` | `(dept, count)` |
| `handlePasteRow` | `(e, idx, field)` | `(e, dept, idx, field)` |
| `handleSaveRows` | `(dept)` | unchanged signature, reads `getDeptState(dept).newRows` |
| `handleStartEditSaved` | `(rows)` | `(dept, rows)` |
| `handleCancelEditSaved` | `()` | `(dept)` |
| `updateEditRowField` | `(idx, field, value)` | `(dept, idx, field, value)` |
| `handleSaveEditedRows` | `(dept)` | unchanged signature, reads `getDeptState(dept).editRows` |
| `handleUploadDeptExcel` | `(e, dept)` | unchanged signature; adds `dept` to `expandedDepts` if not already present (instead of replacing it), and sets only that department's `newRows` |

All call sites are inside `deptStats.map(({ dept, total, count, rows }) => ...)`, so `dept` is already in scope at every call site that needs it added.

### 3. Auto-save — independent per department

The current effect (keyed on `[newRows, expandedDept]`, single `autoSaveTimerRef`) is rewritten to track each expanded department's `newRows` array *by reference* and only touch that department's own debounce timer when its rows actually changed — since `updateRowField`/`handlePasteRow`/`handleUploadDeptExcel` always replace `newRows` immutably, reference inequality reliably signals "this department's rows changed." This prevents one department's typing from resetting or delaying another's pending auto-save, which a single shared effect over the whole `deptEditState` object would otherwise cause.

```js
const autoSaveTimersRef = useRef({})     // { [dept]: timeoutId }
const prevNewRowsRef = useRef({})        // { [dept]: rows array reference last seen }
const autoSavingRef = useRef({})         // { [dept]: bool }

useEffect(() => {
  expandedDepts.forEach(dept => {
    const rows = getDeptState(dept).newRows
    if (prevNewRowsRef.current[dept] === rows) return
    prevNewRowsRef.current[dept] = rows
    if (autoSaveTimersRef.current[dept]) clearTimeout(autoSaveTimersRef.current[dept])
    const hasFillable = rows.some(r => parseFlexibleDate(r.date) && Number(r.amount) > 0)
    if (!hasFillable) return
    autoSaveTimersRef.current[dept] = setTimeout(() => autoSaveFillableRows(dept, rows), 900)
  })
  Object.keys(autoSaveTimersRef.current).forEach(dept => {
    if (!expandedDepts.includes(dept)) {
      clearTimeout(autoSaveTimersRef.current[dept])
      delete autoSaveTimersRef.current[dept]
      delete prevNewRowsRef.current[dept]
    }
  })
}, [deptEditState, expandedDepts])

useEffect(() => () => { Object.values(autoSaveTimersRef.current).forEach(clearTimeout) }, [])
```
`autoSaveFillableRows(dept, rows)` takes the rows explicitly (the value captured at schedule time) rather than re-reading state, guards re-entrancy via `autoSavingRef.current[dept]`, and on success clears only the successfully-saved indices from `deptEditState[dept].newRows` via `updateDeptState`.

### 4. Grid/CSS

```jsx
className={`rounded-2xl border overflow-hidden transition-colors ${
  expandedDepts.includes(dept)
    ? 'border-indigo-400 ring-1 ring-indigo-300 col-span-2 sm:col-span-3 lg:col-span-2'
    : 'border-slate-200 bg-white'
}`}
```
and the conditional render becomes `{expandedDepts.includes(dept) && (...)}`. At `lg:grid-cols-4`, two `col-span-2` expanded cards fill one row side-by-side. At `sm:grid-cols-3` and the mobile `grid-cols-2` base, an expanded card stays full width (`sm:col-span-3`, base `col-span-2`) since neither breakpoint divides evenly for pairing and a 5-column table needs more room than a narrow fraction gives. No changes to table cell padding — the existing `overflow-x-auto` wrapper on both tables handles horizontal scroll if a narrower card doesn't fit its columns.

## Data flow summary

```
Click a card → toggleExpand(dept) → expandedDepts adds/removes dept, deptEditState[dept] resets to blank
Type/paste in dept A's grid → updateRowField/handlePasteRow(dept=A, ...) → deptEditState.A.newRows changes
  → auto-save effect sees deptEditState.A.newRows reference changed → restarts ONLY A's timer
  → deptEditState.B (if also expanded) untouched, its own timer (if pending) keeps running unaffected
"Save rows" / "Save Changes" (edit mode) → handleSaveRows(dept) / handleSaveEditedRows(dept)
  → reads getDeptState(dept), writes to Firestore, clears that dept's rows/edit state only
```

## Testing

Manual, per `CLAUDE.md`:
1. Expand two different departments — confirm both stay open side-by-side (desktop width) instead of one collapsing the other.
2. Type/paste new rows into department A, then switch to typing in department B — confirm A's auto-save still fires ~900ms after you stopped typing in A, unaffected by B's activity.
3. Click "Edit entries" (pencil) on department A's existing entries while department B is also expanded with its own in-progress new rows — confirm B's new-rows grid is untouched by A's edit mode, and vice versa.
4. Paste a multi-row/multi-column block from Excel into one expanded department's grid — confirm it still fills multiple rows/columns correctly.
5. Collapse a department mid-edit, then re-expand it — confirm it resets to blank (matches today's behavior, just scoped to that one department instead of every department).
6. Resize to `lg:` width with two departments expanded — confirm they sit side-by-side, each roughly half the grid's width, with `overflow-x-auto` scroll if the table doesn't fit within that width.
7. On mobile width, expand a department — confirm it's still full width (unchanged from today).

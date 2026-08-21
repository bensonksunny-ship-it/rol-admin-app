# Add Departments — Searchable Department Picker

## Problem

The Accounts → Operations → Add Departments screen (`src/pages/accounts/AddDepartmentsPage.jsx`, reached via `/department/accounts?tab=operations&opSub=addDepartments`) lets a user type a free-text "Department name" to add a new option to the expense-department dropdown (backed by `EXPENSE_CATEGORIES` defaults + a Firestore-backed custom list via `getExpenseDepartments`/`addExpenseDepartment`). Because it's plain free text, users retype department names from memory, risking typos/near-duplicates (the codebase already has one such drift: `EXPENSE_CATEGORIES` has `"Human Resources"` while the nav's `DEPARTMENT_LIST` has `"Human Resourses"`).

## Goals

- Replace the plain text input with a searchable combobox: type to filter a list of the app's real departments (from the main nav), click a suggestion to select it, or keep typing a name that isn't in the list to add it as free text — exactly as today.
- Suggestions are sourced from `DEPARTMENT_LIST` (`src/constants/departments.js`), the canonical nav department list, using their display names (the existing `Event M` → `"Event Management"` mapping).
- Suggestions exclude names already present in the dropdown (`EXPENSE_CATEGORIES` defaults + already-added custom departments), so nothing shown would just hit the existing "This department already exists" error.

## Non-goals

- No change to the underlying add/delete logic, Firestore collection, or duplicate-check in `AddDepartmentsPage.jsx` — only the input UI changes.
- No change to `EXPENSE_CATEGORIES` itself (including its naming drift from `DEPARTMENT_LIST`) — out of scope here.
- No new combobox component — reuse the existing `PersonSearchInput.jsx`, which already implements "search a list or type a custom value" with matching styling.

## Design

### 1. `src/constants/departments.js` — extract shared `displayDeptName`

The `Event M` → `"Event Management"` display-name mapping currently exists twice, inline, in `src/pages/Departments.jsx` and `src/components/Layout/DesktopDepartmentNav.jsx`:
```js
if (deptName === 'Event M') return 'Event Management'
```
Move this into a single exported `displayDeptName(name)` function in `constants/departments.js` (next to `DEPARTMENT_LIST`), and update both existing call sites to import and use it instead of their own inline copy. This avoids adding a third duplicate for the new use in `AddDepartmentsPage.jsx`.

### 2. `src/pages/accounts/AddDepartmentsPage.jsx`

- Import `DEPARTMENT_LIST`, `displayDeptName` from `../../constants/departments`, and `PersonSearchInput` from `../../components/PersonSearchInput`.
- Build the suggestion list: `DEPARTMENT_LIST.map(d => ({ id: d.slug, name: displayDeptName(d.name) }))`, filtered to exclude any name already in `EXPENSE_CATEGORIES` or `departments` (case-insensitive, mirroring the existing duplicate check in `handleAdd`).
- Replace the `<input type="text" ...>` for the department name with:
  ```jsx
  <PersonSearchInput
    value={newName}
    onChange={(val) => { setNewName(val); setError('') }}
    people={suggestions}
    placeholder="Department name"
  />
  ```
  wrapped to keep it inline with the existing "Add" button (the form's `flex items-center gap-3` layout is preserved).
- No change to `handleAdd`, `handleDelete`, or the list-rendering below — they already operate on `newName` as a plain string, which `PersonSearchInput` provides via `onChange` whether the value came from a click or free typing.

## Data flow

```
DEPARTMENT_LIST (nav departments) → displayDeptName() → filtered against EXPENSE_CATEGORIES + departments
  → PersonSearchInput suggestions
User types → filters suggestions, OR clicks one → newName set either way
"Add" → existing handleAdd() duplicate-check + addExpenseDepartment() — unchanged
```

## Testing

Manual, per `CLAUDE.md`:
1. Open Add Departments, start typing a nav department name (e.g. "Cell") — confirm a matching suggestion appears, click it, confirm the field fills with the canonical name.
2. Type a name that's already in the dropdown (default or custom) — confirm no suggestion for it appears (since it's filtered out), and adding it still shows the existing "already exists" error if submitted.
3. Type a name that matches nothing (custom department not in the nav list) — confirm no dropdown appears and typing/submitting still works as free text, unchanged.
4. Add a department via a clicked suggestion — confirm it saves and appears in the "Departments in dropdown" list below, same as today.

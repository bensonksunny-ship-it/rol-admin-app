# Accounts Entry — Income Page Design

**Date:** 2026-04-23
**Scope:** Replace placeholder `IncomePage.jsx` (and the surrounding entry scaffolding) with a fully working monthly income entry and management page, accessible from the Accounts department hub → Accounts Entry tab.

---

## 1. Architecture & File Changes

### Files deleted
| File | Reason |
|------|--------|
| `src/pages/accounts/TallyPage.jsx` | Placeholder, no longer needed |
| `src/pages/accounts/WeeklyEntryPage.jsx` | Placeholder, out of scope |
| `src/pages/accounts/EntryPage.jsx` | Replaced — routing goes directly to IncomePage |
| `src/pages/accounts/AccountsEntryGate.jsx` | Replaced — simpler permission gate inlined into the route |

### Files kept
| File | Reason |
|------|--------|
| `src/pages/accounts/ExpensePage.jsx` | Out of scope — kept as placeholder for future work |

### Files modified
| File | Change |
|------|--------|
| `src/services/firestore.js` | Add `updateFinanceIncome(id, data)` and `deleteFinanceIncome(id)` |
| `src/App.jsx` | Child route `entry/*` → `entry` (no sub-routing); renders `IncomePage` directly with permission guard |

### Files created
| File | Purpose |
|------|---------|
| `src/pages/accounts/IncomePage.jsx` | Full self-contained income entry + list component |

### Routing
`/department/accounts/entry` renders `IncomePage` inside `DepartmentHub`'s `<Outlet />`.
The existing `isAccountsEntryRoute` logic in `DepartmentHub` already handles this correctly once the route is simplified.

---

## 2. Data Layer

### Existing Firestore functions reused
- `getFinanceIncome({ year, month })` — fetches entries filtered by year + month, sorted date desc
- `createFinanceIncome(data)` — creates a new `finance_income` document

### New Firestore functions to add
```js
// Updates date, category, departmentTag, amount on an existing income doc
updateFinanceIncome(id, data)

// Deletes a finance_income doc by id
deleteFinanceIncome(id)
```

### Firestore collection
`finance_income` — existing collection, no schema changes needed.

### Entry data shape
```js
{
  id: string,           // Firestore doc id
  date: Date,           // converted from Timestamp on read
  category: string,     // one of INCOME_TYPES
  departmentTag: string,// one of DEPARTMENT_TAGS
  amount: number,
  createdAt: Timestamp,
}
```

### Month/year state
- Default: current month and year
- Changing the month picker triggers a re-fetch with new `{ year, month }` filters
- No restriction on past or future months (historical entry must be supported)

---

## 3. UI Layout

The page is a single scrollable column with four stacked sections:

### 3.1 Month Picker
- Left arrow — right arrow navigation with centre label (e.g. "April 2026")
- Changing month reloads the entry list and recalculates the summary
- Stays at the top of the page, above all other content

### 3.2 Summary Card
- One stat card: **Total Income** for the selected month
- Computed from the fetched list (client-side sum)
- Updates immediately after any add / update / delete

### 3.3 Inline Entry Form
Always visible — not inside a modal or drawer.

| Field | Input type | Source |
|-------|-----------|--------|
| Date | `<input type="date">` | Defaults to today |
| Income Type | `<select>` | `INCOME_TYPES` from `constants/roles.js` |
| Department Tag | `<select>` | `DEPARTMENT_TAGS` from `constants/roles.js` |
| Amount | `<input type="number">` | Min 0 |

- **Add mode:** Button label "Save". Submitting clears the form and prepends the new entry to the list.
- **Edit mode:** Form pre-fills with selected entry's values. Button label changes to "Update". A "Cancel" link beside the button exits edit mode without saving.

### 3.4 Income List
Scrollable list below the form. Each row shows:

| Column | Notes |
|--------|-------|
| Date | Formatted as DD/MM/YYYY |
| Income Type | Category label |
| Department Tag | Tag label |
| Amount | Formatted as currency (₹) |
| Actions | Edit (pencil icon) + Delete (trash icon) |

- Sorted by date descending (newest first)
- **Edit:** Clicking pencil scrolls to top and pre-fills the form
- **Delete:** Clicking trash replaces the row's action buttons with inline "Confirm delete? Yes / No" — no modal

---

## 4. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Loading entries | Subtle spinner/skeleton in list area; form stays enabled |
| No entries for month | "No income recorded for this month." empty state message |
| Form validation fail | Inline field-level error (amount ≤ 0, or date empty); no alert dialogs |
| Firestore save/update/delete error | Red error banner below form, auto-dismisses after 4 seconds; no `alert()` |
| Delete confirmation | Inline in row — "Confirm delete? Yes / No" replaces action buttons |

---

## 5. Permissions

Access is controlled by `canAccessAccountsEntry(userProfile, hasPermission, isFounder)` (from `utils/accountsEntryAccess.js`). Allowed roles: Founder, Admin, Finance Team, or Accounts Department Director/Coordinator.

The permission check is the first thing `IncomePage.jsx` renders — if the user lacks access, it returns `<Navigate to="/" replace />`. `App.jsx` routes directly to `IncomePage` with no separate gate component.

---

## 6. Out of Scope

- Expense page (existing placeholder kept)
- Tally / Weekly entry pages (deleted, not rebuilt)
- Export / reporting
- Pagination (list shows all entries for the selected month — expected to be manageable in size)

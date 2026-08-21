# Income Categorized Tables — Design Spec

**Date:** 2026-08-21
**Status:** Approved

---

## Problem

`IncomePage` (My Workspace → Accounts → Entry → Income) currently shows one flat, chronologically-sorted list of income entries below the Add/Edit form. There's no at-a-glance breakdown by category (English/Tamil/Online Offering, Tithe by language, Contribution, Other Income, Support from ROLCC), and no Excel-style summary or date-wise offering ledger.

The user wants the flat list replaced with a set of categorized, Excel-style tables: an aggregate Income Summary, a date-wise Offering matrix (English/Tamil/Online columns), and per-category line-item tables (Tithe - English, Tithe - Tamil, Contribution, Support from ROLCC, Other Income).

---

## Access

No change. `canAccessAccountsEntry` still gates the whole page.

---

## Data Model

### `INCOME_TYPES` (`src/constants/roles.js`)

```js
export const INCOME_TYPES = [
  'Online Offering',
  'English Offering',
  'Tamil Offering',
  'Tithe - English',
  'Tithe - Tamil',
  'Contribution',
  'Support from ROLCC',
  'Missions', 'RSM', 'RFF', 'Donations', // kept for historical entries; not the point of new "Other Income" entries going forward
]
```

Plain `'Tithe'` is retired as a selectable option for new entries. Existing `finance_income` docs keep whatever category string they already have — no migration, no schema change to the collection itself.

### "Other Income" bucket (computed, not stored)

Other Income is **not** a fixed category value. It's computed as: any entry whose `category` is not one of the 7 named categories above (`Online Offering`, `English Offering`, `Tamil Offering`, `Tithe - English`, `Tithe - Tamil`, `Contribution`, `Support from ROLCC`). This automatically absorbs `Missions`, `RSM`, `RFF`, `Donations`, legacy plain `'Tithe'` docs, and any future/unrecognized category string — no hardcoded list to maintain.

```js
const NAMED_CATEGORIES = ['Online Offering', 'English Offering', 'Tamil Offering', 'Tithe - English', 'Tithe - Tamil', 'Contribution', 'Support from ROLCC']
const isOtherIncome = (entry) => !NAMED_CATEGORIES.includes(entry.category)
```

---

## Component Architecture

New folder `src/pages/accounts/income/`:

| Component | Responsibility |
|---|---|
| `IncomeSummaryTable.jsx` | Pure, takes `entries`. Renders the 8-row aggregate (7 named categories + Other Income) plus a bold Total Income footer row. |
| `OfferingMatrixTable.jsx` | Takes `entries` + `editMode` + edit/delete callbacks. Filters to Online/English/Tamil Offering, groups by date, renders the matrix with row/column totals and per-cell drill-down. |
| `CategoryListTable.jsx` | Generic Date/Name/Amount table + total footer, parameterized by a `matchesCategory(entry) => boolean` predicate and a `title`. Reused for Tithe - English, Tithe - Tamil, Contribution, Support from ROLCC, and Other Income (5 instances). Carries the existing Edit-mode / three-dots-menu row pattern (from the prior IncomePage refactor) forward unchanged in behavior.

`IncomePage.jsx` continues to own `entries`, `editMode`, `openMenuId`, `deletingId`, `handleEdit`, `handleDelete`, and now a `formRef`, passing what's needed down as props. **One page-level Edit/Done toggle governs every table** — no per-table toggles. The old flat "Income list" section (and its own header/toggle) is removed entirely, replaced by the new sections below.

---

## UI Layout

Top to bottom within `IncomePage`:

```
[ Month picker ]                                (unchanged)
[ Excel-upload result toast ]                   (unchanged)
[ Edit / Done toggle ]                          <- page-level, replaces old per-list toggle
[ Income Summary Table ]                        <- new, full width
[ Offering Matrix Table ]                       <- new, full width
[ Category tables grid ]                        <- new: Tithe-English, Tithe-Tamil, Contribution, Support from ROLCC, Other Income
[ Total Income stat card + Add/Edit Entry form ] (unchanged, incl. Excel upload control)
[ Pending imports / load error / Excel preview modal ] (unchanged)
```

### Income Summary Table

2-column Excel-style block (Category | Amount), right-aligned amounts, rows in this fixed order:

1. English Offering
2. Tamil Offering
3. Online Offering
4. Tithe - English
5. Tithe - Tamil
6. Contribution
7. Other Income
8. Support from ROLCC

Bold **Total Income** footer row (sum of all entries for the month — same figure as today's stat card).

### Offering Matrix Table

Columns: Date | English | Tamil | Online | Row Total.

- One row per unique date (within the active month) that has at least one Online/English/Tamil Offering entry.
- **Sorted ascending by date** — an intentional exception to the rest of the app's newest-first convention, matching a spreadsheet ledger.
- A cell = sum of all same-date, same-type entries. Empty cells render `–` (not `₹0`) so a genuine zero-amount entry stays visually distinct.
- Footer row = column totals (English, Tamil, Online) + grand total, bold.
- Clicking any non-empty cell expands an inline drill-down beneath that row, listing the raw entries behind the sum (Date, Type, Name, Amount). The drill-down is always viewable; Edit/Delete controls inside it only render when the page is in Edit mode.
- Deleting the last entry behind a cell removes it from `entries`; the matrix recomputes and the drill-down auto-collapses.
- No offering entries in the month → the table's body is replaced with a "No offering entries this month" message (no header row of dashes).

### Category List Tables

`CategoryListTable` instances for Tithe - English, Tithe - Tamil, Contribution, Support from ROLCC, Other Income, laid out `grid-cols-1 sm:grid-cols-2`.

Each card:
- Header: category name, entry count, subtotal.
- Body: Date | Name | Amount rows, sorted newest-first (consistent with the rest of the app).
- Footer: repeats the subtotal.
- Three-dots menu (Edit / Delete) per row, shown only in Edit mode — same interaction pattern as the prior flat-list refactor (inline "Confirm delete? Yes/No", click-outside closes the menu).
- Renders even when empty: ₹0 subtotal, "No entries" body — matching the Expense Department Grid precedent of not hiding unused categories.
- "Name" comes from `entry.giverName`, shown as `—` when blank (field stays optional, no new validation).

### Entry Form

Unchanged in every respect (fields, Excel upload, validation, add/edit/cancel flow) — just repositioned below the new tables instead of above the old flat list. `handleEdit`'s scroll target changes from `window.scrollTo({top:0})` to `formRef.current.scrollIntoView({behavior:'smooth'})` via a new ref on the form's wrapper div, since the form is no longer at the top of the page. This applies whether Edit is triggered from a category table row or from inside the Offering drill-down.

---

## Files to Change

| File | Change |
|---|---|
| `src/constants/roles.js` | Update `INCOME_TYPES`: split `'Tithe'` into `'Tithe - English'` / `'Tithe - Tamil'`, add `'Support from ROLCC'`. |
| `src/pages/accounts/income/IncomeSummaryTable.jsx` | New. Aggregate summary table. |
| `src/pages/accounts/income/OfferingMatrixTable.jsx` | New. Date-wise offering matrix with drill-down. |
| `src/pages/accounts/income/CategoryListTable.jsx` | New. Generic category list table (reused 5x). |
| `src/pages/accounts/IncomePage.jsx` | Remove the flat list section (and its own Edit toggle/menu code from the prior refactor); add `formRef`; compose the three new components above the form; move the Edit/Done toggle to page level; update `handleEdit`'s scroll behavior. |

No changes to `src/services/firestore.js`, routing, access control, or the Firestore collection schema.

---

## Edge Cases

- **Legacy plain `'Tithe'` docs**: don't match `Tithe - English` or `Tithe - Tamil`, so they fall into Other Income via the computed-bucket rule — same as `Missions`/`RSM`/`RFF`/`Donations`.
- **Zero entries for a category**: list table still renders (₹0, "No entries"); Summary table row still shows ₹0.
- **No offering entries at all**: matrix shows an empty-state message instead of a header-only table.
- **Multiple same-day, same-type offering entries**: summed into one matrix cell; drill-down reveals the individual entries.
- **Deleting the last entry in a drill-down cell**: cell reverts to `–`, drill-down auto-closes.
- **Excel import with an unrecognized category string**: automatically lands in Other Income (computed bucket), no special-case import logic needed.
- **New month with no entries**: all tables degrade gracefully to their empty states, matching today's behavior for the stat card and flat list.

---

## Out of Scope

- Export/printing of the summary tables.
- Editing multiple drill-down entries at once (bulk edit).
- Changing the Excel import column-mapping logic.
- Pagination — all tables still show the full month's entries, as today.

# Accounts — Tally tab Excel "Account Sheet" workbook export

**Date:** 2026-09-04
**Status:** Approved
**Builds on:** `2026-09-04-accounts-tally-account-sheet-design.md`

## Goal

Add a **Download Excel** action to the Tally tab (`/department/accounts` → `tally`) that
generates a styled multi-sheet `.xlsx` workbook replicating the church's legacy Excel
**Account Sheet**: terracotta outer fill, peach table containers/headers, blue-teal line
items, red negatives, explicit thin gridlines, and live Excel formulas for the balance
rollup.

The legacy workbook file is not available. This is a faithful build to the written spec and
hex codes — column widths, merged-cell geometry and exact colour placement are a best
reading and get refined from the first real export.

## Scope

- All four sheets in one build: `Accounts`, `Income Sheet`, `Expense Sheet`,
  `Department Expense`.
- Excel export sits **alongside** the existing PDF export — the `⬇ Download PDF` button
  stays.
- No Ministry vs Administration classification (explicitly dropped).
- The on-screen Income / Expense master tables become collapsible (see section below).

## Library

Add `exceljs` (MIT) to `package.json`. `xlsx` (the installed community build) cannot write
fills, borders or fonts, so it cannot meet the visual spec. `exceljs` is **lazy-imported**
(`await import('exceljs')` inside the click handler) so it never enters the main bundle.

Verify `npm run build` succeeds with the lazy chunk (ExcelJS + Vite browser interop is the
main technical risk).

## Architecture

New folder `src/pages/accounts/tally/`:

| File | Responsibility |
|---|---|
| `styles.js` | Palette constants, reusable ExcelJS style objects (fills, borders, fonts), the money number format, and helpers: `boxBorder(cell)`, `headerCell(cell, text)`, `drawTable(ws, { origin, columns, rows, ... })` returning the written range. |
| `selectors.js` | Pure functions turning the already-loaded `incomeEntries` / `expenseEntries` into the shapes each sheet needs. No Firestore. |
| `sheetAccounts.js` | Builds Sheet 1. Exports `buildAccountsSheet(wb, ctx)` → `{ incomeRef, expenseRef }` anchor cells other sheets/rows reference. |
| `sheetIncome.js` | Builds Sheet 2. Returns `{ summaryTotalRef }`. |
| `sheetExpense.js` | Builds Sheet 3. Returns `{ summaryTotalRef, deptRowRefs }`. |
| `sheetDeptGrids.js` | Builds Sheet 4. Returns `{ deptGridTotalRefs: Map<deptLabel, cellRef> }`. |
| `index.js` | `buildAccountSheetWorkbook(ctx)` orchestrates the sheet builders in dependency order and wires cross-sheet formulas; `downloadAccountSheetXlsx(ctx)` calls it, writes a buffer, and triggers the browser download. |

`ctx` shape:

```js
{
  month: Date,                 // startOfMonth(activeMonth)
  monthLabel: string,          // "September 2026"
  monthKey: string,            // "2026-09"
  incomeEntries: Entry[],      // this month, as already in TallyPage state
  expenseEntries: Entry[],     // this month, non-pending, as already in state
  openingBalance: number,      // TallyPage's computed/anchored previous balance
}
```

### Cross-sheet formula wiring

Sheet builders run in this order: `Income Sheet` → `Department Expense` → `Expense Sheet`
→ `Accounts`. Each returns the A1 refs of the cells later sheets point at (e.g.
`"'Income Sheet'!C14"`). Refs are **computed from each sheet's own layout-constants
object**, never hard-coded, so adding a row shifts every dependent ref automatically.

- `Expense Sheet` summary amount per department = `SUM('Department Expense'!<grid range>)`.
- `Expense Sheet` Total = `SUM(<department amount cells>)`.
- `Accounts` Income of the Month = `='Income Sheet'!<summary total>`.
- `Accounts` Total Expense = `='Expense Sheet'!<summary total>`.
- `Accounts` Available / Current Balance = intra-sheet formulas (below).

## Style kit (`styles.js`)

| Token | Hex | Use |
|---|---|---|
| `TERRACOTTA` | `A35248` | outer fill — flood each sheet's used range; tables inset with a 1-row / 1-col gutter |
| `TERRACOTTA_DK` | `934B42` | title band / grid outer edge accent |
| `PEACH` | `F2D7C2` | table container fill |
| `PEACH_DK` | `EBD0B9` | header-cell fill |
| `BLUE_TEAL` | `0070C0` | font colour for line items and values |
| `RED` | `FF0000` | negative amounts (applied via number format, not a separate style) |
| `GRIDLINE` | `D9D9D9` | thin box border on every data cell |
| `INPUT_YELLOW` | `FFF6D9` | the Previous Balance input cell |
| `WHITE` | `FFFFFF` | data-cell fill inside tables |

- Money number format (every amount cell): `₹ #,##0.00;[Red]₹ -#,##0.00;₹ -`
- Each worksheet: `ws.views = [{ showGridLines: false }]` so only explicit borders show.
- Column widths set per sheet in its layout constants.
- Fonts: headers bold blue-teal on `PEACH_DK`; data cells blue-teal on `WHITE`; totals
  bold.

## Sheet 1 — `Accounts`

- Terracotta flood over the used range (approx `A1:J34`).
- Title block (merged, bold blue-teal on peach): line 1 `River Of Life Community Church`,
  line 2 `Account Sheet — {monthLabel}`.
- **Accounts table** — peach header cell reading `Accounts table`, blue text, thin
  gridlines around every cell:

  | Row label | Value cell |
  |---|---|
  | Income of the Month | `='Income Sheet'!{summaryTotalRef}` |
  | Previous Balance | `={helper input cell}` |
  | Available Balance | `={Income cell}+{Previous cell}` |
  | Total Expense | `='Expense Sheet'!{summaryTotalRef}` |
  | Current Balance | `={Available cell}-{Total Expense cell}` |

  `Current Balance` renders red when negative via the number format's `[Red]` section.

- **Top-right helper card** — peach fill, text `Please enter previous balance here`, and
  directly below it the **input cell** (fill `INPUT_YELLOW`, money format), pre-filled with
  `ctx.openingBalance`. This is the single source of truth; the table's Previous Balance
  row is `=` this cell.

## Sheet 2 — `Income Sheet`

Data via `categorizeEntries(incomeEntries)` from `../income/incomeCategorize`.

- **Top-left — `Income summary`**: rows `English Offering`, `Tamil Offering`,
  `Online Offering`, `Tithe - English`, `Tithe - Tamil`, `Contribution`,
  `Support from ROLCC`, `Other Income`, then **`Total`**. Each amount is a `SUM()` over
  that category's detail block on this sheet. `Total` = `SUM()` of the eight category
  cells. `Total` is the ref Sheet 1 uses.
- **Bottom-left — `Offering Table`**: columns `Date | English | Tamil | Online | Total`.
  One row per distinct date across the three offering categories (sorted ascending);
  `English`/`Tamil`/`Online` = that date's sum in each category; `Total` = row sum. Footer
  `Total` row = column sums.
  Below it — **`Support from ROLCC`** sub-table: `Date | Name | Amount` (one row per entry,
  `Name` from `giverName`), footer total.
- **Centre — side by side**: **`Tithe - English`** and **`Tithe - Tamil`** ledgers,
  columns `Date | Name | Amount`, one row per entry, footer total each.
- **Right — stacked**: **`Contribution table`** and **`Other Income`**, columns
  `Date | Name | Amount`, one row per entry, footer total each. (`Other Income` `Name` =
  `giverName` or, if blank, `category`.)

All money cells use the money number format; all cells get the thin box border; headers use
the peach header style.

## Sheet 3 — `Expense Sheet`

Data via `groupExpenseByDepartment(expenseEntries)` (`selectors.js`):

- One bucket per department that has ≥1 non-pending expense entry this month.
- Ordered by the existing `DEPT_ROWS` order first (`Worship, Cell, Caring, Sunday M,
  D Light, Junior C, Outreach, Build C, Event M, Mission, Media, Accounts,
  Human Resources, Gen Affairs, Thunderstorm, SP Office`), then any unmapped departments
  alphabetically.
- Label = the `DEPT_ROWS` short label where a match exists (matching lower-cased/trimmed
  against `label` or `match[]`, using `normalizeDepartmentName(e.department || e.category)`),
  otherwise the raw department string.

**`Expense sheet summary`** table: columns `SL No | Department | Amount`. One row per
bucket; `SL No` is 1..n; `Amount` = `SUM('Department Expense'!<that dept's grid amount
range>)`. Footer **`Total`** row = `SUM()` of the amount cells → the ref Sheet 1 uses for
Total Expense.

No "Category of expense" table.

## Sheet 4 — `Department Expense`

One grid per department bucket from Sheet 3 (same set, same order).

- Grids laid **3 across**, one spacer column between, wrapping to a new band of rows after
  every 3. Each band's height = the tallest grid in it.
- Each grid:
  - Peach header row: department label (merged across the 5 columns).
  - Column headers: `SL No | Date | Item | Bill No | Amount`.
  - One row per entry: `SL No` 1..n, `Date` `dd/MM/yyyy`, `Item` from `item`, `Bill No`
    from `billNo` (blank → empty), `Amount` money format.
  - **3 blank spare rows** inside the grid, included in the subtotal `SUM` range, so a
    manual addition auto-totals.
  - **`Subtotal`** row: `=SUM(<entry rows + 3 spare rows>)`.
- **Summary block** at the top of the sheet: `Department | Subtotal` repeating each grid's
  subtotal ref — mirrors the Sheet 3 summary as a sanity check.

## Download flow

`src/pages/accounts/TallyPage.jsx` changes only:

- New `⬇ Download Excel` button beside `⬇ Download PDF` in the toolbar (both outside
  `sheetRef`).
- New state: `exportingXlsx` (bool), `xlsxError` (string).
- Handler:
  ```js
  setExportingXlsx(true); setXlsxError('')
  try {
    const { downloadAccountSheetXlsx } = await import('./tally/index.js')
    await downloadAccountSheetXlsx({ month, monthLabel, monthKey, incomeEntries, expenseEntries, openingBalance })
  } catch (err) {
    console.error('[Tally] Excel export failed', err)
    setXlsxError('Could not generate the Excel file. Try again.')
  } finally { setExportingXlsx(false) }
  ```
- `downloadAccountSheetXlsx` builds the workbook, `const buf = await wb.xlsx.writeBuffer()`,
  wraps in `new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })`,
  creates an object URL, clicks a temporary `<a download="account-sheet-{monthKey}.xlsx">`,
  revokes the URL.
- No `alert()` anywhere (browser dialogs block the Chrome extension); errors surface via
  the existing `loadError || pdfError` banner — extend it to `|| xlsxError`.

## On-screen: collapsible Income / Expense master tables

The month's Income and Expense line-item tables below the Account Sheet block (screen only,
outside `sheetRef` — `TallyPage.jsx` ~L419–504) become **collapsible**.

- Each card's coloured header row (`Income` / `Expense`, currently a static `div`) becomes a
  full-width `<button>` toggling that section.
- Header keeps the label and the total on the right, and gains a rotating chevron (`▸` /
  `▾`) plus an entry count, e.g. `Income · 12 entries` … `₹1,23,456`.
- **Collapsed by default** — the styled Account Sheet is the focus; the raw ledgers are
  drill-down. State is two `useState` booleans (`incomeOpen`, `expenseOpen`), no
  persistence.
- When collapsed, only the header shows; the table (or the empty-state message) is hidden.
- Purely presentational — no change to data loading, totals, or the Excel/PDF exports
  (which already read from state, not the DOM).

## No backend / rules changes

Pure client-side from data already loaded by `TallyPage`. No Firestore reads, no
`firestore.rules` change.

## Testing (manual)

1. Tally tab → `⬇ Download Excel` → a `.xlsx` downloads named `account-sheet-2026-09.xlsx`.
2. Open in Excel / LibreOffice / Google Sheets:
   - Terracotta outer fill, peach headers, blue-teal line items, thin `D9D9D9` gridlines,
     no default Excel gridlines.
   - `Accounts` sheet: editing the yellow Previous Balance cell recalculates Available and
     Current Balance; a negative Current Balance shows red.
   - `Income of the Month` == `Income Sheet` summary Total == sum of income entries.
   - `Total Expense` == `Expense Sheet` Total == `Department Expense` subtotals summed ==
     sum of non-pending expense entries.
3. Income Sheet: Offering Table row/column totals reconcile; tithe/contribution/other
   ledgers list every entry with names.
4. Expense Sheet: one row per department with spend, `SL No` sequential, Total reconciles.
5. Department Expense: a grid per spending department, 3 spare rows each, subtotal SUM
   covers them; typing an amount in a spare row updates the subtotal and (via the
   formula chain) the Accounts sheet.
6. A month with no income / no expense → empty tables render with headers and a zero
   total, no crash.
7. Switch months in the toolbar → export follows the shared `?month=`.
8. Non-accounts user → still redirected (unchanged).
9. `npm run build` succeeds; `exceljs` is in a lazy chunk, not the main bundle.
10. Income / Expense cards render collapsed; clicking a header expands it with a chevron
    flip; totals and entry counts show in both states; export still works while collapsed.

## Implementation notes (built 2026-09-04)

- **Fund Reserved row.** A concurrent change added a "Fund Reserved" line to the on-screen
  Tally strip (net savings-fund movement reduces the balance like an expense). To keep the
  workbook matching the page, Sheet 1 gets a `Fund Reserved` row (static value, shown only
  when non-zero) between Total Expense and Current Balance, and
  `Current Balance = Available − Total Expense − Fund Reserved`. `fundReserved` is passed in
  `ctx`.
- **Date timezone.** ExcelJS serialises `Date` against UTC, so an IST local-midnight date
  lands a day early in the sheet. `selectors.xlDate()` pins every exported date to UTC-noon
  of its calendar day; all sheet date cells go through it.
- `styles.js` `drawTable` gained a `total.sum: [key…]` option that auto-writes
  `SUM(<column data range>)` for the footer.

## Wiring

None beyond the button. The `tally` tab, its label/icon and the shared `?month=` param
already exist. Files touched: `package.json` (add `exceljs`), `TallyPage.jsx` (button +
handler + error string + collapsible Income/Expense cards), plus the new
`src/pages/accounts/tally/` folder.

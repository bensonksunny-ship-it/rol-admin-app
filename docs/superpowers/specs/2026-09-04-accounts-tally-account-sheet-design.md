# Accounts — Tally tab as the Excel "Account Sheet"

**Date:** 2026-09-04
**Status:** Approved
**Builds on:** `2026-09-03-accounts-tally-page-design.md`

## Goal

Rebuild the Tally tab (`/department/accounts` → `tally`) to replicate the church's Excel
**Account Sheet**: a monthly tally table beside a per-department expense grid, with a
Senior Pastor sign-off, exportable to a one-page PDF.

## Layout

```
┌ toolbar (NOT exported) ───────────────────────────────────────┐
│  ‹  September 2026  ›        [Set Previous Balance ▾]  [⬇ PDF] │
└──────────────────────────────────────────────────────────────┘
┌ Account Sheet  (sheetRef — the export target) ───────────────┐
│  River Of Life Community Church                               │
│  Account Sheet — September 2026                               │
│                                                              │
│  ┌ Tally Table ────────────┐   ┌ Departmental Expense ─────┐ │
│  │ Income of the Month   ₹ │   │ Worship            ₹ …    │ │
│  │ Previous Balance  [A] ₹ │   │ Cell               ₹ …    │ │
│  │ Available Balance    ₹ │   │ … 16 fixed rows …         │ │
│  │ Total Expense        ₹ │   │ Other / Unallocated ₹ …   │ │
│  │ Current Balance      ₹ │   │ Total              ₹ …    │ │
│  └─────────────────────────┘   └───────────────────────────┘ │
│                                                              │
│                                     _______________________  │
│                                     Senior Pastor, ROLCC     │
└──────────────────────────────────────────────────────────────┘
  Income entries table   (on screen only, below the sheet)
  Expense entries table  (on screen only, below the sheet)
```

Side-by-side at `md+` and in the PDF; stacked on narrow screens. The sheet block uses
inline styles with `mm` units (same approach as `SundayReportPrintView.jsx`) so
html2canvas rasterises it cleanly.

## Fields

| Row | Value |
|---|---|
| Income of the Month | Σ income entries for the month |
| Previous Balance | the `finance_tally` opening-balance anchor — auto carry-forward, optional manual override (unchanged from the 2026-09-03 spec). Badge shows `Auto` / `Manual`. |
| Available Balance | `Income of the Month + Previous Balance` |
| Total Expense | Σ non-pending expense entries for the month (= the departmental grid total) |
| Current Balance | `Available Balance − Total Expense` |

These are the same numbers as the previous Tally strip, relabelled
(Previous Balance = opening, Current Balance = closing).

## Departmental Expense grid

Fixed 16 rows, in this order:

`Worship, Cell, Caring, Sunday M, D Light, Junior C, Outreach, Build C, Event M, Mission,
Media, Accounts, Human Resources, Gen Affairs, Thunderstorm, SP Office`

Each row = Σ of this month's non-pending expense entries whose
`normalizeDepartmentName(e.department || e.category)`, lower-cased and trimmed, matches that
row's alias list (or the row label). Aliases bridge the app's own category names
(`Cell Ministry`, `Sunday Ministry`, `River Kids`/`Junior Church`, `Building`,
`General Affairs`) to the sheet's short labels.

Unmatched entries fall into an **Other / Unallocated** row, shown only when `> 0`, so
`Σ(16 rows) + Other === Total Expense` always reconciles.

Mapping table (`DEPT_ROWS` in `TallyPage.jsx`):

| Label | Aliases (lower-case) |
|---|---|
| Worship | worship |
| Cell | cell, cell ministry |
| Caring | caring |
| Sunday M | sunday ministry, sunday m, sunday |
| D Light | d light, d-light, dlight |
| Junior C | junior church, river kids, junior c |
| Outreach | outreach |
| Build C | building, building care, build c |
| Event M | event m, event management, events |
| Mission | mission, missions |
| Media | media |
| Accounts | accounts, account, finance |
| Human Resources | human resources, hr |
| Gen Affairs | general affairs, gen affairs |
| Thunderstorm | thunderstorm |
| SP Office | sp office, senior pastor office |

## PDF export

`⬇ Download PDF` button in the toolbar. Lazy-`import('jspdf')` + `import('html2canvas')`,
`html2canvas(sheetRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true })`,
one PNG onto a portrait A4 page scaled to fit (identical maths to
`SundayReportPrintView.handleDownloadPdf`). Filename `account-sheet-YYYY-MM.pdf`.
On failure set a `pdfError` string (no `alert()` — browser dialogs block the extension).
A `downloading` flag disables the button while it runs.

## No new backend

Reuses `getFinanceIncome` / `getFinanceExpense` (month) and the `finance_tally`
anchor helpers already added on 2026-09-03. Department grouping is client-side from the
already-loaded `expenseEntries`. No firestore.rules change beyond the `finance_tally` block
already pending deploy.

## Wiring

None. The `tally` tab, its label/icon, and the shared `?month=` param already exist. Only
`src/pages/accounts/TallyPage.jsx` changes.

## On-screen extras kept

The month's Income and Expense line-item tables stay below the sheet (screen only, outside
`sheetRef`) — unchanged from the current Tally page, just repositioned.

## Testing (manual)

1. Tally tab shows the sheet; grid total == Total Expense == sum of the Expense table below.
2. An expense under a category not in the 16 (e.g. a custom `expense_departments` name) →
   lands in "Other / Unallocated"; totals still reconcile.
3. Set a manual Previous Balance → Available and Current recompute; later months carry it
   (per the 2026-09-03 anchor semantics).
4. Download PDF → one A4 page, sheet + sign-off, no toolbar, filename
   `account-sheet-2026-09.pdf`.
5. Switch months → sheet + grid + PDF all follow the shared `?month=`.
6. Non-accounts user → redirected.

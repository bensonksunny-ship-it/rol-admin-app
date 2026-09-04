// Sheet 3 — "Expense Sheet".
// A single "Expense sheet summary" table: SL No | Department | Amount, one row per
// department that has spend this month. Each amount SUMs that department's grid on
// the Department Expense sheet; the footer Total is what the Accounts sheet uses
// for Total Expense.

import { drawTable, flood, ref } from './styles'

export function buildExpenseSheet(wb, ctx, deptBuckets, sumRangeByLabel) {
  const ws = wb.addWorksheet('Expense Sheet', { views: [{ showGridLines: false }] })
  flood(ws, 1, 1, Math.max(20, deptBuckets.length + 12), 8)
  ws.getColumn(1).width = 3

  const rows = deptBuckets.map((b, i) => ({
    sl: i + 1,
    dept: b.label,
    // sumRangeByLabel holds a fully-qualified range, e.g. 'Department Expense'!E7:E11
    amount: { formula: `SUM(${sumRangeByLabel.get(b.label)})` },
  }))

  const table = drawTable(ws, {
    top: 3,
    left: 2,
    title: 'Expense sheet summary',
    columns: [
      { key: 'sl', header: 'SL No', width: 7, kind: 'text' },
      { key: 'dept', header: 'Department', width: 24, kind: 'text' },
      { key: 'amount', header: 'Amount', width: 18, kind: 'money' },
    ],
    rows: rows.length ? rows : [{ sl: '', dept: '—', amount: 0 }],
    total: {
      label: 'Total',
      sum: rows.length ? ['amount'] : [],
      cells: rows.length ? {} : { amount: { value: 0 } },
    },
  })

  const summaryTotalRef = `'Expense Sheet'!${ref(table.totalRow, table.colOf('amount'))}`
  return { summaryTotalRef }
}

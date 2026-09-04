// Account Sheet workbook — assembles the four styled sheets and triggers a
// browser download. `exceljs` is imported here (this whole module is itself
// lazy-imported by TallyPage) so it never lands in the main bundle.

import { groupExpenseByDepartment } from './selectors'
import { buildIncomeSheet } from './sheetIncome'
import { buildDeptGridsSheet } from './sheetDeptGrids'
import { buildExpenseSheet } from './sheetExpense'
import { buildAccountsSheet } from './sheetAccounts'

/**
 * @param {{
 *  monthLabel:string, monthKey:string,
 *  incomeEntries:Array, expenseEntries:Array, openingBalance:number
 * }} ctx
 */
export async function buildAccountSheetWorkbook(ctx) {
  const mod = await import('exceljs')
  const ExcelJS = mod.default || mod
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ROL Admin App'
  wb.created = new Date()
  // ExcelJS never computes formula results, so force every reader (Excel,
  // LibreOffice, Google Sheets, Numbers) to recalc on open — otherwise the
  // formula cells show blank / stale until the user edits something.
  wb.calcProperties.fullCalcOnLoad = true

  const deptBuckets = groupExpenseByDepartment(ctx.expenseEntries)

  // Create the Accounts sheet first so it holds tab position 1, but populate it
  // last — the other three sheets must exist for its cross-sheet formulas.
  const accountsWs = wb.addWorksheet('Accounts', { views: [{ showGridLines: false }] })

  const { summaryTotalRef: incomeSummaryRef } = buildIncomeSheet(wb, ctx)
  const { sumRangeByLabel } = buildDeptGridsSheet(wb, ctx, deptBuckets)
  const { summaryTotalRef: expenseSummaryRef } = buildExpenseSheet(wb, ctx, deptBuckets, sumRangeByLabel)
  buildAccountsSheet(accountsWs, ctx, { incomeSummaryRef, expenseSummaryRef })

  return wb
}

export async function downloadAccountSheetXlsx(ctx) {
  const wb = await buildAccountSheetWorkbook(ctx)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `account-sheet-${ctx.monthKey}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

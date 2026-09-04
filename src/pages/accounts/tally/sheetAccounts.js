// Sheet 1 — "Accounts" (the Tally sheet).
// Terracotta flood, title band, the Accounts table (Income / Previous / Available /
// Total Expense / Current Balance) with live formulas, and a top-right helper card
// whose yellow input cell is the single source for Previous Balance.

import { drawTable, flood, titleBand, ref, styleCell, COLORS } from './styles'

const INPUT_CELL = 'H4' // the yellow "previous balance" input on the helper card

export function buildAccountsSheet(ws, ctx, { incomeSummaryRef, expenseSummaryRef }) {
  flood(ws, 1, 1, 34, 10)
  ws.getColumn(1).width = 3
  ws.getColumn(2).width = 26
  ws.getColumn(3).width = 20
  ;[8, 9, 10].forEach((c) => (ws.getColumn(c).width = 16))

  titleBand(ws, 2, 2, 6, ['River Of Life Community Church', `Account Sheet — ${ctx.monthLabel}`])

  // ── Helper card (top-right) ──
  ws.mergeCells('H2:J3')
  const help = ws.getCell('H2')
  help.value = 'Please enter previous balance here'
  styleCell(help, 'header', { align: 'center' })
  ws.mergeCells('H4:J4')
  const input = ws.getCell(INPUT_CELL)
  input.value = Math.round((Number(ctx.openingBalance) || 0) * 100) / 100
  styleCell(input, 'input')
  styleCell(ws.getCell('I4'), 'input')
  styleCell(ws.getCell('J4'), 'input')

  // ── Accounts table (B6) ──
  const top = 6
  const amtCol = 3 // column C
  const AC = (offset) => `${ref(top + 2 + offset, amtCol)}` // C8, C9, …

  const fundReserved = Math.round((Number(ctx.fundReserved) || 0) * 100) / 100
  const hasFund = fundReserved !== 0

  const rows = [
    { label: 'Income of the Month', amount: { formula: incomeSummaryRef } },
    { label: 'Previous Balance', amount: { formula: `$${INPUT_CELL[0]}$${INPUT_CELL.slice(1)}` } },
    { label: 'Available Balance', amount: { formula: `${AC(0)}+${AC(1)}`, kind: 'total' } },
    { label: 'Total Expense', amount: { formula: expenseSummaryRef } },
  ]
  if (hasFund) rows.push({ label: 'Fund Reserved', amount: fundReserved })
  // Current Balance = Available − Total Expense [− Fund Reserved]
  const currentFormula = hasFund ? `${AC(2)}-${AC(3)}-${AC(4)}` : `${AC(2)}-${AC(3)}`
  rows.push({ label: 'Current Balance', amount: { formula: currentFormula, kind: 'total' } })

  const table = drawTable(ws, {
    top,
    left: 2,
    title: 'Accounts table',
    columns: [
      { key: 'label', header: 'Accounts table', width: 26, kind: 'text' },
      { key: 'amount', header: 'Amount', width: 20, kind: 'money' },
    ],
    rows,
  })

  // Emphasise Available + Current Balance rows.
  ;[table.firstDataRow + 2, table.lastDataRow].forEach((r) => {
    const c = ws.getCell(ref(r, 2))
    c.font = { bold: true, color: { argb: COLORS.BLUE_TEAL } }
    const v = ws.getCell(ref(r, amtCol))
    v.font = { bold: true, color: { argb: COLORS.BLUE_TEAL } }
  })

  return { table }
}

// Sheet 4 — "Department Expense".
// One grid per department that has spend this month, laid 3 across then wrapping.
// Each grid: SL No | Date | Item | Bill No | Amount, the entry rows plus 3 blank
// spare rows inside the subtotal SUM range, then a Subtotal row.
// A summary block at the top repeats every grid's subtotal.

import { drawTable, flood, ref } from './styles'

const SPARE_ROWS = 3
const GRIDS_PER_ROW = 3
const GRID_COLS = 5
const GRID_PITCH = GRID_COLS + 1 // one spacer column between grids

const GRID_COLUMNS = [
  { key: 'sl', header: 'SL No', width: 6, kind: 'text' },
  { key: 'date', header: 'Date', width: 12, kind: 'date' },
  { key: 'item', header: 'Item', width: 22, kind: 'text' },
  { key: 'bill', header: 'Bill No', width: 12, kind: 'text' },
  { key: 'amount', header: 'Amount', width: 14, kind: 'money' },
]

export function buildDeptGridsSheet(wb, ctx, deptBuckets) {
  const ws = wb.addWorksheet('Department Expense', { views: [{ showGridLines: false }] })

  const rowsPerGrid = deptBuckets.map((b) => b.entries.length + SPARE_ROWS)
  const maxRowsInAnyBand = (bandIdx) => {
    let m = 0
    for (let i = bandIdx * GRIDS_PER_ROW; i < Math.min((bandIdx + 1) * GRIDS_PER_ROW, deptBuckets.length); i += 1) {
      m = Math.max(m, rowsPerGrid[i])
    }
    return m
  }

  // ── Summary block (top) ── drawn last, once every grid subtotal ref exists.
  const summaryTop = 2
  // grids start below the summary block: title+header+deptCount+total
  const gridsTop = summaryTop + 3 + deptBuckets.length + 1 + 2

  // Terracotta flood FIRST — grids/summary drawn afterwards overwrite their own
  // cells. Height is the sum of every band's height (tallest grid + chrome).
  const bandCount = Math.ceil(deptBuckets.length / GRIDS_PER_ROW)
  let floodEstimate = gridsTop
  for (let b = 0; b < bandCount; b += 1) floodEstimate += maxRowsInAnyBand(b) + 6
  flood(ws, 1, 1, floodEstimate + 4, 2 + GRIDS_PER_ROW * GRID_PITCH + GRID_COLS)

  let bandTop = gridsTop
  const subtotalRefByLabel = new Map()
  const sumRangeByLabel = new Map()

  deptBuckets.forEach((bucket, idx) => {
    const band = Math.floor(idx / GRIDS_PER_ROW)
    const posInBand = idx % GRIDS_PER_ROW
    if (posInBand === 0 && idx !== 0) {
      bandTop += maxRowsInAnyBand(band - 1) + 4 // header+title+subtotal+gap
    }
    const left = 2 + posInBand * GRID_PITCH

    const entryRows = bucket.entries.map((e, i) => ({
      sl: i + 1,
      date: e.date, // already a UTC-noon Date from selectors.xlDate
      item: e.item || '',
      bill: e.billNo || '',
      amount: Number(e.amount) || 0,
    }))
    for (let s = 0; s < SPARE_ROWS; s += 1) {
      entryRows.push({ sl: '', date: '', item: '', bill: '', amount: null })
    }

    const grid = drawTable(ws, {
      top: bandTop,
      left,
      title: bucket.label,
      columns: GRID_COLUMNS,
      rows: entryRows,
      total: { label: 'Subtotal', sum: ['amount'] },
    })

    const amtCol = grid.colOf('amount')
    const range = `'Department Expense'!${ref(grid.firstDataRow, amtCol)}:${ref(grid.lastDataRow, amtCol)}`
    sumRangeByLabel.set(bucket.label, range)
    subtotalRefByLabel.set(bucket.label, `'Department Expense'!${ref(grid.totalRow, amtCol)}`)
  })

  // ── Summary block, now that subtotal refs exist ──
  drawTable(ws, {
    top: summaryTop,
    left: 2,
    title: 'Department subtotals',
    columns: [
      { key: 'label', header: 'Department', width: 22, kind: 'text' },
      { key: 'amount', header: 'Subtotal', width: 16, kind: 'money' },
    ],
    rows: deptBuckets.map((b) => ({
      label: b.label,
      amount: { formula: subtotalRefByLabel.get(b.label).split('!')[1] },
    })),
    total: {
      label: 'Total',
      cells: {
        amount: {
          formula: deptBuckets.length
            ? deptBuckets.map((b) => subtotalRefByLabel.get(b.label).split('!')[1]).join('+')
            : '0',
        },
      },
    },
  })

  return { sumRangeByLabel, subtotalRefByLabel }
}

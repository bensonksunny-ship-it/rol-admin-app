// Sheet 2 — "Income Sheet".
// Income summary (top-left) whose amounts reference their detail blocks on this
// sheet; Offering Table + Support from ROLCC (bottom-left); Tithe ledgers (centre);
// Contribution + Other Income (right).

import { drawTable, flood, ref } from './styles'
import { buildIncomeModel } from './selectors'

const DATE_COL = { key: 'date', header: 'Date', width: 13, kind: 'date' }
const NAME_COL = { key: 'name', header: 'Name', width: 22, kind: 'text' }
const AMT_COL = { key: 'amount', header: 'Amount', width: 15, kind: 'money' }

function ledgerBlock(ws, top, left, title, rows) {
  return drawTable(ws, {
    top,
    left,
    title,
    columns: [DATE_COL, NAME_COL, AMT_COL],
    rows: rows.length
      ? rows.map((r) => ({ date: r.date, name: r.name, amount: r.amount }))
      : [{ date: '', name: '', amount: 0 }],
    total: { label: 'Total', sum: rows.length ? ['amount'] : [], cells: rows.length ? {} : { amount: { value: 0 } } },
  })
}

export function buildIncomeSheet(wb, ctx) {
  const ws = wb.addWorksheet('Income Sheet', { views: [{ showGridLines: false }] })
  const model = buildIncomeModel(ctx.incomeEntries)

  flood(ws, 1, 1, 90, 20)
  ws.getColumn(1).width = 3

  // ── Offering Table (B15) ──
  const hasOffering = model.offeringRows.length > 0
  const offering = drawTable(ws, {
    top: 15,
    left: 2,
    title: 'Offering Table',
    columns: [
      { key: 'date', header: 'Date', width: 13, kind: 'date' },
      { key: 'english', header: 'English', width: 13, kind: 'money' },
      { key: 'tamil', header: 'Tamil', width: 13, kind: 'money' },
      { key: 'online', header: 'Online', width: 13, kind: 'money' },
      { key: 'total', header: 'Total', width: 14, kind: 'money' },
    ],
    rows: hasOffering
      ? model.offeringRows.map((r) => ({
          date: r.date,
          english: r.english,
          tamil: r.tamil,
          online: r.online,
          total: 0,
        }))
      : [{ date: '', english: 0, tamil: 0, online: 0, total: 0 }],
    total: { label: 'Total', sum: hasOffering ? ['english', 'tamil', 'online', 'total'] : [] },
  })
  // per-row Total = SUM(English:Online)
  if (hasOffering) {
    for (let r = offering.firstDataRow; r <= offering.lastDataRow; r += 1) {
      ws.getCell(ref(r, offering.colOf('total'))).value = {
        formula: `SUM(${ref(r, offering.colOf('english'))}:${ref(r, offering.colOf('online'))})`,
      }
    }
  }

  const englishTotalCell = ref(offering.totalRow, offering.colOf('english'))
  const tamilTotalCell = ref(offering.totalRow, offering.colOf('tamil'))
  const onlineTotalCell = ref(offering.totalRow, offering.colOf('online'))

  // ── Support from ROLCC (below Offering Table) ──
  const support = ledgerBlock(ws, offering.bottom + 2, 2, 'Support from ROLCC', model.supportRows)

  // ── Tithe ledgers (centre) ──
  const titheE = ledgerBlock(ws, 3, 7, 'Tithe - English', model.titheEnglishRows)
  const titheT = ledgerBlock(ws, 3, 11, 'Tithe - Tamil', model.titheTamilRows)

  // ── Contribution + Other Income (right) ──
  const contrib = ledgerBlock(ws, 3, 15, 'Contribution table', model.contributionRows)
  const other = ledgerBlock(ws, contrib.bottom + 2, 15, 'Other Income', model.otherIncomeRows)

  const totalCellOf = (block) => ref(block.totalRow, block.colOf('amount'))

  // ── Income summary (B3) — amounts reference the detail blocks ──
  const formulaByLabel = {
    'English Offering': englishTotalCell,
    'Tamil Offering': tamilTotalCell,
    'Online Offering': onlineTotalCell,
    'Tithe - English': totalCellOf(titheE),
    'Tithe - Tamil': totalCellOf(titheT),
    Contribution: totalCellOf(contrib),
    'Support from ROLCC': totalCellOf(support),
    'Other Income': totalCellOf(other),
  }
  const summary = drawTable(ws, {
    top: 3,
    left: 2,
    title: 'Income summary',
    columns: [
      { key: 'label', header: 'Category', width: 22, kind: 'text' },
      { key: 'amount', header: 'Amount', width: 16, kind: 'money' },
    ],
    rows: model.summary.map((s) => ({
      label: s.label,
      amount: { formula: formulaByLabel[s.label] || '0' },
    })),
    total: {
      label: 'Total',
      sum: ['amount'],
    },
  })

  const summaryTotalRef = `'Income Sheet'!${ref(summary.totalRow, summary.colOf('amount'))}`
  return { summaryTotalRef }
}

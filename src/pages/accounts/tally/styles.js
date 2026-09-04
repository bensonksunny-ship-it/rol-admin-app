// Shared ExcelJS style kit for the Account Sheet workbook.
//
// The legacy Excel "Account Sheet" reads as: a terracotta flood behind everything,
// peach table containers with peach-dark header cells, blue-teal text for every
// line item and value, red negatives, and thin light-grey box borders on every
// data cell (the sheet's own gridlines are switched off). All colours below are
// the hex codes from the design spec, expressed as ARGB (opaque, so `FF` prefix).

export const COLORS = {
  TERRACOTTA: 'FFA35248',
  TERRACOTTA_DK: 'FF934B42',
  PEACH: 'FFF2D7C2',
  PEACH_DK: 'FFEBD0B9',
  BLUE_TEAL: 'FF0070C0',
  RED: 'FFFF0000',
  GRIDLINE: 'FFD9D9D9',
  INPUT_YELLOW: 'FFFFF6D9',
  WHITE: 'FFFFFFFF',
}

// ₹ with two decimals; negative in red with a minus; zero as "₹ -".
export const MONEY_FMT = '"₹" #,##0.00;[Red]"₹" -#,##0.00;"₹" -'
export const DATE_FMT = 'dd/mm/yyyy'

const THIN = (argb) => ({ style: 'thin', color: { argb } })

export function boxBorder(cell, argb = COLORS.GRIDLINE) {
  cell.border = { top: THIN(argb), left: THIN(argb), bottom: THIN(argb), right: THIN(argb) }
}

export function fill(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

// 1 -> "A", 27 -> "AA"
export function colLetter(n) {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function ref(row, col) {
  return `${colLetter(col)}${row}`
}

// Flood a rectangular range with a solid fill — used for the terracotta margin.
export function flood(ws, top, left, bottom, right, argb = COLORS.TERRACOTTA) {
  for (let r = top; r <= bottom; r += 1) {
    for (let c = left; c <= right; c += 1) {
      fill(ws.getCell(ref(r, c)), argb)
    }
  }
}

// A merged, centred title band on peach-dark with bold blue-teal text.
export function titleBand(ws, top, left, right, lines) {
  const arr = Array.isArray(lines) ? lines : [lines]
  arr.forEach((text, i) => {
    const row = top + i
    ws.mergeCells(`${ref(row, left)}:${ref(row, right)}`)
    const cell = ws.getCell(ref(row, left))
    cell.value = text
    fill(cell, COLORS.PEACH_DK)
    cell.font = { bold: true, color: { argb: COLORS.BLUE_TEAL }, size: i === 0 ? 13 : 11 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    for (let c = left; c <= right; c += 1) boxBorder(ws.getCell(ref(row, c)))
  })
  return top + arr.length
}

// Style one data cell. `kind`: 'text' | 'money' | 'date' | 'header' | 'total' | 'input'.
export function styleCell(cell, kind, { bold = false, align } = {}) {
  const base = { color: { argb: COLORS.BLUE_TEAL } }
  switch (kind) {
    case 'header':
      fill(cell, COLORS.PEACH_DK)
      cell.font = { bold: true, color: { argb: COLORS.BLUE_TEAL } }
      cell.alignment = { horizontal: align || 'center', vertical: 'middle', wrapText: true }
      break
    case 'money':
      fill(cell, COLORS.WHITE)
      cell.numFmt = MONEY_FMT
      cell.font = { ...base, bold }
      cell.alignment = { horizontal: align || 'right' }
      break
    case 'total':
      fill(cell, COLORS.PEACH)
      cell.numFmt = MONEY_FMT
      cell.font = { bold: true, color: { argb: COLORS.BLUE_TEAL } }
      cell.alignment = { horizontal: align || 'right' }
      break
    case 'date':
      fill(cell, COLORS.WHITE)
      cell.numFmt = DATE_FMT
      cell.font = { ...base, bold }
      cell.alignment = { horizontal: align || 'center' }
      break
    case 'input':
      fill(cell, COLORS.INPUT_YELLOW)
      cell.numFmt = MONEY_FMT
      cell.font = { bold: true, color: { argb: COLORS.BLUE_TEAL } }
      cell.alignment = { horizontal: align || 'right' }
      break
    default: // text
      fill(cell, kind === 'label' ? COLORS.PEACH : COLORS.WHITE)
      cell.font = { ...base, bold }
      cell.alignment = { horizontal: align || 'left' }
  }
  boxBorder(cell)
}

/**
 * Draw a bordered table block.
 *
 * @returns {{
 *   top:number,left:number,right:number,bottom:number,
 *   headerRow:number,firstDataRow:number,lastDataRow:number,
 *   totalRow:number|null, colOf:(key:string)=>number
 * }}
 *
 * opts:
 *  - top,left            1-based origin
 *  - title               optional string -> merged peach-dark band across all columns
 *  - columns             [{ key, header, width, kind }]  kind: 'text'|'money'|'date'
 *  - rows                [ { <key>: value } ]  value: primitive, or { formula } , or { value, kind }
 *  - total               optional { label, cells: { <key>: {formula|value} }, sum: [<key>...] }
 *                        `sum` auto-writes SUM(<col data range>) for each listed key.
 */
export function drawTable(ws, opts) {
  const { top, left, columns, rows, title, total } = opts
  const nCols = columns.length
  const right = left + nCols - 1
  let row = top

  if (title != null) {
    ws.mergeCells(`${ref(row, left)}:${ref(row, right)}`)
    const c = ws.getCell(ref(row, left))
    c.value = title
    fill(c, COLORS.PEACH_DK)
    c.font = { bold: true, color: { argb: COLORS.BLUE_TEAL } }
    c.alignment = { horizontal: 'left', vertical: 'middle' }
    for (let cc = left; cc <= right; cc += 1) boxBorder(ws.getCell(ref(row, cc)))
    row += 1
  }

  const headerRow = row
  columns.forEach((col, i) => {
    const cell = ws.getCell(ref(row, left + i))
    cell.value = col.header
    styleCell(cell, 'header')
    if (col.width) ws.getColumn(left + i).width = col.width
  })
  row += 1

  const firstDataRow = row
  rows.forEach((r) => {
    columns.forEach((col, i) => {
      const cell = ws.getCell(ref(row, left + i))
      const raw = r[col.key]
      const kind = col.kind || 'text'
      if (raw && typeof raw === 'object' && 'formula' in raw) {
        cell.value = { formula: String(raw.formula).replace(/^=/, '') }
        styleCell(cell, raw.kind || (kind === 'text' ? 'money' : kind))
      } else if (raw && typeof raw === 'object' && 'value' in raw) {
        cell.value = raw.value
        styleCell(cell, raw.kind || kind)
      } else {
        cell.value = raw ?? (kind === 'money' ? 0 : '')
        styleCell(cell, kind)
      }
    })
    row += 1
  })
  const lastDataRow = row - 1

  let totalRow = null
  if (total) {
    totalRow = row
    const sumKeys = total.sum || []
    const hasData = lastDataRow >= firstDataRow
    columns.forEach((col, i) => {
      const cell = ws.getCell(ref(row, left + i))
      const colIdx = left + i
      if (i === 0) {
        cell.value = total.label || 'Total'
        fill(cell, COLORS.PEACH)
        cell.font = { bold: true, color: { argb: COLORS.BLUE_TEAL } }
        boxBorder(cell)
      } else if (total.cells && total.cells[col.key]) {
        const spec = total.cells[col.key]
        cell.value = 'formula' in spec ? { formula: String(spec.formula).replace(/^=/, '') } : spec.value
        styleCell(cell, 'total')
      } else if (sumKeys.includes(col.key)) {
        cell.value = hasData
          ? { formula: `SUM(${ref(firstDataRow, colIdx)}:${ref(lastDataRow, colIdx)})` }
          : 0
        styleCell(cell, 'total')
      } else {
        fill(cell, COLORS.PEACH)
        boxBorder(cell)
      }
    })
    row += 1
  }

  const colOf = (key) => left + columns.findIndex((c) => c.key === key)

  return {
    top, left, right, bottom: row - 1,
    headerRow, firstDataRow, lastDataRow, totalRow,
    colOf,
  }
}

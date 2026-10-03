import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { ACCENT_STYLES, toDate, isOtherIncomeCategory } from './incomeCategorize'
import { parseIncomePaste } from './incomePaste'
import { GridCell, GridSelect, SaveStatus } from './gridKit'
import { handleGridKeyDown, readGridPaste, parseCellDate, parseCellAmount, isoInMonth, isoToDisplay, fmtAmount } from './gridUtils'

// Empty rows kept under the entries, as in the original card layout — typing or
// pasting into one starts a new entry.
const BLANK_ROWS = 5

const CELL_PAD = 'px-4 py-2.5'

function entryIso(entry) {
  return format(toDate(entry.date), 'yyyy-MM-dd')
}

function dupKey(iso, category, amount, name) {
  return [iso, String(category).trim().toLowerCase(), Number(amount), String(name || '').trim().toLowerCase()].join('|')
}

// One Income section (Tithe, Contribution, RSM, …) in its card layout: Date |
// [Category] | Name | [Towards] | Amount, with blank rows underneath. Every cell
// is editable in place and saves when left (IncomePage.applyOps).
//
// Paste (Ctrl+V): click anywhere in the card — or a blank row — and paste rows
// from Excel; Date / Name / Towards / Amount are read by meaning (spacer columns
// are ignored) and added as new entries. Pasting while on an existing entry's
// cell overwrites cells from there instead, like a spreadsheet.
export default function CategoryListTable({
  title,
  accent = 'indigo',
  entries,
  activeMonth,
  categoryOptions,
  customCategory = false, // Other Income: any non-named category is allowed
  towardsColumn = false,
  saveState,
  onApply,
  onPastePlan,
  onError,
}) {
  const styles = ACCENT_STYLES[accent]
  const categoryColumn = categoryOptions.length > 1
  const cols = [
    { key: 'date', label: 'Date', width: 'w-32' },
    categoryColumn && { key: 'category', label: 'Category', width: 'w-32' },
    { key: 'giverName', label: 'Name' },
    towardsColumn && { key: 'towards', label: 'Towards' },
    { key: 'amount', label: 'Amount', width: 'w-32', align: 'right' },
  ].filter(Boolean)

  const blankValues = { date: '', category: categoryOptions[0], giverName: '', towards: '', amount: '' }
  const nextRowId = useRef(BLANK_ROWS)
  // Rows under the entries that aren't saved yet: blank ones plus any typed into
  // but still without an amount. A row keeps its key from blank → typed → saved
  // entry, so it never re-mounts (or loses focus) on the way.
  const [drafts, setDrafts] = useState(() => Array.from({ length: BLANK_ROWS }, (_, i) => ({ ...blankValues, key: `draft-${i}` })))
  const [live, setLive] = useState(null) // { key, amount } — the amount cell being typed in

  const isBlank = v => !v.date && !v.giverName && !v.towards && v.amount === ''
  // Keeps BLANK_ROWS empty rows at the bottom.
  function topUp(list) {
    let trailing = 0
    for (let i = list.length - 1; i >= 0 && isBlank(list[i]); i--) trailing++
    const extra = Array.from({ length: Math.max(0, BLANK_ROWS - trailing) }, () => ({ ...blankValues, key: `draft-${nextRowId.current++}` }))
    return [...list, ...extra]
  }
  const updateDrafts = fn => setDrafts(d => topUp(fn(d)))
  // Rows keep the order of `entries`: chronological as loaded, edits stay in
  // place and new rows append — so a row never jumps while it's being edited.
  const rows = [
    ...entries.map(e => ({
      key: e._key || e.id,
      entry: e,
      values: {
        date: entryIso(e),
        category: e.category || '',
        giverName: e.giverName || '',
        towards: e.towards || '',
        amount: String(Number(e.amount) || 0),
      },
    })),
    ...drafts.map(d => ({ key: d.key, entry: null, blank: isBlank(d), values: d })),
  ]

  const amountOfRow = row => {
    if (live?.key === row.key) return live.amount
    const { amount, error } = parseCellAmount(row.values.amount)
    return error ? 0 : amount
  }
  const total = rows.reduce((s, row) => s + amountOfRow(row), 0)

  // A blank row takes the date of the entry above it (or today, if in this month).
  function defaultDate() {
    const last = [...rows].reverse().find(r => r.values.date)?.values.date
    if (last) return last
    const today = format(new Date(), 'yyyy-MM-dd')
    return isoInMonth(today, activeMonth) ? today : format(activeMonth, 'yyyy-MM-01')
  }

  // A typed date outside the month is usually a typo — Cancel (the default) goes
  // back to the saved date so it can be corrected.
  function confirmOtherMonth(iso) {
    const [y, m] = iso.split('-').map(Number)
    const other = format(new Date(y, m - 1, 1), 'MMMM yyyy')
    return window.confirm(
      `${isoToDisplay(iso)} is not in ${format(activeMonth, 'MMMM yyyy')} — please check the date.\n\n` +
      `Cancel: go back and correct it.\nOK: it really belongs to ${other} (the entry moves there).`
    )
  }

  // Text from a cell → the field's stored value, or { error }.
  function parseField(key, text) {
    if (key === 'date') {
      const iso = parseCellDate(text, activeMonth)
      return iso ? { value: iso } : { error: text.trim() ? `Can't read date "${text.trim()}" — use dd/mm/yyyy.` : 'Date is required.' }
    }
    if (key === 'amount') {
      const { amount, error } = parseCellAmount(text)
      return error ? { error: `${error} — amounts must be numbers of 0 or more.` } : { value: amount }
    }
    if (key === 'category') {
      const t = text.trim()
      const match = categoryOptions.find(o => o.toLowerCase() === t.toLowerCase())
      if (match) return { value: match }
      if (customCategory && t && isOtherIncomeCategory(t)) return { value: t }
      return { error: `"${t}" isn't a ${title} category.` }
    }
    return { value: text.trim() }
  }

  function createFrom(values, key) {
    return {
      _key: key,
      date: values.date || defaultDate(),
      category: values.category || categoryOptions[0],
      giverName: String(values.giverName || '').trim(),
      towards: towardsColumn ? String(values.towards || '').trim() : '',
      amount: Number(values.amount) || 0,
    }
  }

  function commitCell(row, key, text) {
    if (row.blank && !String(text).trim()) return true
    const parsed = parseField(key, text)
    if (parsed.error) { onError(`${title}: ${parsed.error}`); return false }
    const value = parsed.value

    if (row.entry) {
      const current = key === 'amount' ? Number(row.entry.amount) || 0 : row.values[key]
      if (value === current) return true
      if (key === 'date' && !isoInMonth(value, activeMonth) && !confirmOtherMonth(value)) return false
      onApply({ updates: [{ id: row.entry.id, data: { [key]: value } }] })
      return true
    }

    // New row: keep the value here; create the entry once it has an amount.
    if (key === 'date' && !isoInMonth(value, activeMonth) && !confirmOtherMonth(value)) return false
    const next = { ...row.values, [key]: key === 'amount' ? String(value) : value }
    if (Number(next.amount) > 0) {
      updateDrafts(d => d.filter(x => x.key !== row.key))
      onApply({ creates: [createFrom(next, row.key)] })
    } else {
      updateDrafts(d => d.map(x => (x.key === row.key ? next : x)))
    }
    return true
  }

  function deleteRow(row) {
    if (row.entry) onApply({ deletes: [row.entry.id] }, { label: `${title}: row deleted — Ctrl+Z to undo` })
    else updateDrafts(d => d.filter(x => x.key !== row.key))
  }

  function handlePaste(e) {
    const anchor = e.target.closest?.('[data-c]')
    const anchorRow = anchor ? rows[Number(anchor.dataset.r)] : null
    if (anchorRow?.entry) { pasteOverwrite(e, anchorRow, anchor); return }

    const text = (e.clipboardData || window.clipboardData)?.getData('text') ?? ''
    const multiCell = /[\t\n]/.test(text.replace(/[\r\n]+$/, '')) || /\S\s{2,}\S/.test(text)
    if (anchor && !multiCell) return // a single value types into the focused cell
    e.preventDefault()
    pasteAsNewEntries(text)
  }

  // Excel rows → new entries, read by meaning (same parser as before the grid).
  function pasteAsNewEntries(text) {
    const { rows: parsed } = parseIncomePaste(text, {
      kind: 'list',
      towards: towardsColumn,
      category: categoryOptions[0],
      activeMonth,
      existing: entries,
    })
    const plan = { ops: { creates: [] }, heldRows: [], invalid: [] }
    parsed.forEach(r => {
      if (r.status === 'invalid') { plan.invalid.push(`Line ${r.line}: ${r.message}`); return }
      const create = { date: r.iso, category: r.category, giverName: r.name, towards: r.towards, amount: r.amount }
      if (r.status === 'ok') plan.ops.creates.push(create)
      else plan.heldRows.push({ key: r.key, iso: r.iso, name: r.name, amount: r.amount, status: r.status, op: { type: 'create', data: create } })
    })
    if (!parsed.length) { onError(`${title}: nothing to paste — no rows found in the copied cells.`); return }
    onPastePlan(plan)
  }

  // Pasting while on an existing entry: overwrite cell by cell from there, like
  // a spreadsheet; lines running past the entries become new ones. Blank pasted
  // cells leave the field as it is.
  function pasteOverwrite(e, anchorRow, anchor) {
    const parsed = readGridPaste(e)
    if (!parsed) return
    e.preventDefault()
    const r0 = Number(anchor.dataset.r)
    const c0 = Number(anchor.dataset.c)
    const lineOffset = parsed.headerSkipped ? 2 : 1
    const plan = { ops: { creates: [], updates: [] }, heldRows: [], invalid: [] }
    const existingKeys = new Set(entries.map(x => dupKey(entryIso(x), x.category, x.amount, x.giverName)))
    const consumed = []
    let lastDate = anchorRow.values.date

    parsed.matrix.forEach((cells, i) => {
      if (!cells.some(Boolean)) return
      const line = i + lineOffset
      const row = rows[r0 + i]
      const patch = {}
      let bad = ''
      cells.forEach((raw, j) => {
        const col = cols[c0 + j]
        if (!col || !raw || bad) return
        const p = parseField(col.key, raw)
        if (p.error) bad = p.error
        else patch[col.key] = p.value
      })
      if (bad) { plan.invalid.push(`Line ${line}: ${bad}`); return }

      if (row?.entry) {
        const data = {}
        Object.entries(patch).forEach(([k, v]) => {
          const current = k === 'amount' ? Number(row.entry.amount) || 0 : row.values[k]
          if (v !== current) data[k] = v
        })
        lastDate = data.date || row.values.date
        if (!Object.keys(data).length) return
        const update = { id: row.entry.id, data }
        if (data.date && !isoInMonth(data.date, activeMonth)) {
          plan.heldRows.push({ key: `u${i}`, iso: data.date, name: row.values.giverName, amount: data.amount ?? Number(row.entry.amount), status: 'outOfMonth', op: { type: 'update', ...update } })
        } else {
          plan.ops.updates.push(update)
        }
        return
      }

      const values = { ...(row?.values || blankValues), ...patch }
      if (!values.date) values.date = lastDate
      if (row) consumed.push(row.key)
      lastDate = values.date
      const create = createFrom(values, row?.key)
      const k = dupKey(create.date, create.category, create.amount, create.giverName)
      const outOfMonth = !isoInMonth(create.date, activeMonth)
      if (outOfMonth || existingKeys.has(k)) {
        plan.heldRows.push({ key: `c${i}`, iso: create.date, name: create.giverName, amount: create.amount, status: outOfMonth ? 'outOfMonth' : 'duplicate', op: { type: 'create', data: create } })
      } else {
        plan.ops.creates.push(create)
      }
      existingKeys.add(k)
    })

    if (consumed.length) updateDrafts(d => d.filter(x => !consumed.includes(x.key)))
    onPastePlan(plan)
  }

  // Ctrl+V with the mouse over this card pastes into it — no click needed first.
  // Skipped while typing in an input elsewhere (that paste belongs there); when
  // focus is inside this card, the card's own onPaste handles it.
  const cardRef = useRef(null)
  const hovered = useRef(false)
  const pasteRef = useRef(null)
  useEffect(() => { pasteRef.current = pasteAsNewEntries })
  useEffect(() => {
    function onDocPaste(e) {
      if (!hovered.current || e.defaultPrevented) return
      const active = document.activeElement
      if (cardRef.current?.contains(active)) return
      if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (!text.trim()) return
      e.preventDefault()
      pasteRef.current?.(text)
    }
    document.addEventListener('paste', onDocPaste)
    return () => document.removeEventListener('paste', onDocPaste)
  }, [])

  return (
    // Ctrl+V pastes into the card when the mouse is over it, or after clicking in it.
    <div
      ref={cardRef}
      tabIndex={-1}
      onPaste={handlePaste}
      onMouseEnter={() => { hovered.current = true }}
      onMouseLeave={() => { hovered.current = false }}
      className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${styles.accentBorder} shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col outline-none focus-within:ring-2 focus-within:ring-indigo-300`}
    >
      <div className={`px-5 py-3 border-b border-slate-100 ${styles.header} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full ${styles.dot} shrink-0`} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-700 truncate">{title}</h3>
            <p className="text-xs text-slate-400">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SaveStatus state={saveState} />
          <p className={`text-sm font-bold tabular-nums ${styles.text}`}>₹{fmtAmount(total)}</p>
        </div>
      </div>

      <div className="overflow-x-auto" onKeyDown={e => handleGridKeyDown(e)}>
        <table className="w-full text-xs bg-white table-fixed">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider">
              {cols.map(col => (
                <th key={col.key} className={`px-4 py-2.5 ${col.width || ''} ${col.align === 'right' ? 'text-right' : ''}`}>{col.label}</th>
              ))}
              <th className="w-8" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {rows.map((row, r) => (
              <tr key={row.key} className="group bg-white hover:bg-slate-50 transition-colors">
                {cols.map((col, c) => {
                  const cellLabel = `${title} row ${r + 1} ${col.label}`
                  if (col.key === 'category') {
                    return (
                      <td key={col.key} className="p-0">
                        <GridSelect
                          r={r}
                          c={c}
                          padClass={CELL_PAD}
                          ariaLabel={cellLabel}
                          value={row.values.category}
                          options={categoryOptions}
                          onCommit={v => commitCell(row, 'category', v)}
                        />
                      </td>
                    )
                  }
                  const isAmount = col.key === 'amount'
                  const isDate = col.key === 'date'
                  const hasAmount = row.values.amount !== ''
                  return (
                    <td key={col.key} className="p-0">
                      <GridCell
                        r={r}
                        c={c}
                        padClass={CELL_PAD}
                        ariaLabel={cellLabel}
                        align={col.align}
                        inputMode={isAmount ? 'decimal' : undefined}
                        value={isDate ? isoToDisplay(row.values.date) : row.values[col.key]}
                        display={isAmount && hasAmount ? `₹${fmtAmount(row.values.amount)}` : undefined}
                        placeholder={row.blank ? '' : isAmount ? '₹0' : isDate ? 'dd/mm/yyyy' : '—'}
                        className={isAmount ? 'font-medium text-slate-800' : 'text-slate-700'}
                        onLiveChange={isAmount ? text => {
                          const p = parseCellAmount(text ?? '')
                          setLive(text == null ? null : { key: row.key, amount: p.error ? 0 : p.amount })
                        } : undefined}
                        onCommit={text => commitCell(row, col.key, text)}
                      />
                    </td>
                  )
                })}
                <td className="p-0 text-center">
                  {!row.blank && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => deleteRow(row)}
                      aria-label={`Delete ${title} row ${r + 1}`}
                      className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={`border-t-2 border-slate-200 ${styles.header}`}>
              <td className="px-4 py-2.5 font-semibold text-slate-600" colSpan={cols.length - 1}>Total</td>
              <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${styles.text}`}>₹{fmtAmount(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

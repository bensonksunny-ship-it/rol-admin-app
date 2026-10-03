import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { ClipboardPaste, X } from 'lucide-react'
import { createFinanceIncomeMany } from '../../../services/firestore'
import { fmtDate } from './incomeCategorize'
import { parseIncomePaste } from './incomePaste'

const STATUS_STYLES = {
  ok: { row: '', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Ready' },
  outOfMonth: { row: 'bg-amber-50/60', badge: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Other month' },
  duplicate: { row: 'bg-slate-50', badge: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Duplicate' },
  invalid: { row: 'bg-red-50/60', badge: 'bg-red-50 text-red-700 border-red-200', label: 'Can’t save' },
}

// Rows that are safe to save are ticked by default; out-of-month and duplicate rows
// start unticked so nothing lands outside the month being viewed (or twice) unless
// the user deliberately ticks it. Invalid rows can never be ticked.
const DEFAULT_CHECKED = { ok: true, outOfMonth: false, duplicate: false, invalid: false }

/**
 * "Paste from Excel" for one Income table.
 * kind: 'offering' (Date | English | Tamil | Online) or 'list' (Date | Name | [Towards] | Amount)
 */
export default function PasteIncomeModal({
  title,
  kind,
  towards = false,
  categoryOptions = [],
  activeMonth,
  existing,
  onClose,
  onSaved,
}) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState(categoryOptions[0] || '')
  const [overrides, setOverrides] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { rows, headerDetected } = useMemo(
    () => parseIncomePaste(text, { kind, towards, category, activeMonth, existing }),
    [text, kind, towards, category, activeMonth, existing],
  )

  const isChecked = row => row.status !== 'invalid' && (overrides[row.key] ?? DEFAULT_CHECKED[row.status])
  const selected = rows.filter(isChecked)
  const selectedTotal = selected.reduce((s, r) => s + r.amount, 0)
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})
  const columns = kind === 'offering'
    ? ['Date', 'Column', 'Amount']
    : ['Date', 'Name', ...(towards ? ['Towards'] : []), 'Amount']
  const monthLabel = format(activeMonth, 'MMMM yyyy')

  function handleTextChange(value) {
    setText(value)
    setOverrides({})
    setError('')
  }

  function toggleAll(checked) {
    const next = {}
    rows.forEach(r => { if (r.status !== 'invalid') next[r.key] = checked })
    setOverrides(next)
  }

  async function handleSave() {
    if (!selected.length) return
    setSaving(true)
    setError('')
    try {
      const payloads = selected.map(r => ({
        date: r.iso,
        category: r.category,
        amount: r.amount,
        giverName: r.name,
        towards: r.towards,
      }))
      const ids = await createFinanceIncomeMany(payloads)
      onSaved(payloads.map((p, i) => {
        const [y, m, d] = p.date.split('-').map(Number)
        return { ...p, id: ids[i], date: new Date(y, m - 1, d) }
      }))
    } catch (err) {
      console.error('Paste save failed:', err)
      setError('Could not save — nothing was saved. Check your connection and try again.')
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={saving ? undefined : onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardPaste size={16} className="text-indigo-600 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-700 truncate">Paste from Excel — {title}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <p className="text-xs text-slate-500">
            Copy the rows in Excel and paste below. Expected columns:{' '}
            <span className="font-semibold text-slate-700">
              {kind === 'offering' ? 'Date · English · Tamil · Online' : `Date · Name${towards ? ' · Towards' : ''} · Amount`}
            </span>
            . A header row is optional. Dates are read day-first (DD/MM/YYYY).
          </p>

          {categoryOptions.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">Category for all rows</span>
              <select
                value={category}
                onChange={e => { setCategory(e.target.value); setOverrides({}) }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}

          <textarea
            autoFocus
            value={text}
            onChange={e => handleTextChange(e.target.value)}
            disabled={saving}
            rows={rows.length ? 3 : 8}
            placeholder={kind === 'offering'
              ? 'Click here and press Ctrl+V\n\n05/01/2025\t12,500\t3,200\t1,000'
              : `Click here and press Ctrl+V\n\n05/01/2025\tJohn${towards ? '\tBuilding fund' : ''}\t₹5,000`}
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-mono text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
          />

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {headerDetected && <span className="text-slate-500">Header row detected ·</span>}
                {['ok', 'outOfMonth', 'duplicate', 'invalid'].filter(s => counts[s]).map(s => (
                  <span key={s} className={`px-2 py-0.5 rounded-full border ${STATUS_STYLES[s].badge}`}>
                    {counts[s]} {STATUS_STYLES[s].label.toLowerCase()}
                  </span>
                ))}
              </div>

              {counts.outOfMonth > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠ {counts.outOfMonth} {counts.outOfMonth === 1 ? 'row is' : 'rows are'} dated outside {monthLabel} and {counts.outOfMonth === 1 ? 'is' : 'are'} unticked.
                  Fix the date in Excel and paste again, or tick {counts.outOfMonth === 1 ? 'it' : 'them'} to save under {counts.outOfMonth === 1 ? 'its' : 'their'} own month.
                </p>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider">
                      <th className="px-3 py-2 w-8">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={selected.length > 0 && selected.length === rows.filter(r => r.status !== 'invalid').length}
                          onChange={e => toggleAll(e.target.checked)}
                        />
                      </th>
                      {columns.map(c => <th key={c} className={`px-3 py-2 ${c === 'Amount' ? 'text-right' : ''}`}>{c}</th>)}
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(r => (
                      <tr key={r.key} className={STATUS_STYLES[r.status].row}>
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            disabled={r.status === 'invalid' || saving}
                            checked={isChecked(r)}
                            onChange={e => setOverrides(o => ({ ...o, [r.key]: e.target.checked }))}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.iso ? fmtDate(r.iso) : <span className="text-red-600">{r.rawDate || '—'}</span>}</td>
                        {kind === 'offering' ? (
                          <td className="px-3 py-1.5 text-slate-600">{r.category ? r.category.replace(' Offering', '') : '—'}</td>
                        ) : (
                          <>
                            <td className="px-3 py-1.5 text-slate-600">{r.name || '—'}</td>
                            {towards && <td className="px-3 py-1.5 text-slate-600">{r.towards || '—'}</td>}
                          </>
                        )}
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-800">
                          {r.status === 'invalid' && !r.amount ? '—' : `₹${r.amount.toLocaleString('en-IN')}`}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${STATUS_STYLES[r.status].badge}`} title={r.message}>
                            {STATUS_STYLES[r.status].label}
                          </span>
                          {r.message && <span className="block text-[10px] text-slate-500 mt-0.5">Line {r.line}: {r.message}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {selected.length > 0
              ? <>{selected.length} {selected.length === 1 ? 'entry' : 'entries'} · <span className="font-semibold text-slate-700">₹{selectedTotal.toLocaleString('en-IN')}</span></>
              : 'Nothing selected'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-medium">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || selected.length === 0}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Save ${selected.length || ''} ${selected.length === 1 ? 'entry' : 'entries'}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

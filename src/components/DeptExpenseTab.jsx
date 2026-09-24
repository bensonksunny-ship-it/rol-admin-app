import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Receipt, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { createFinanceExpense, subscribeFinanceExpenseByDept, deleteFinanceExpense, updateFinanceExpenseStatus } from '../services/firestore'
import FinanceModal from './finance/FinanceModal'
import StatusBadge from './finance/StatusBadge'

function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(new Date(d), 'dd MMM yyyy') } catch { return '—' }
}

function fmtAmt(n) {
  if (n == null || n === '') return '—'
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// Compact amount for the tight bar-chart labels: ₹500, ₹2.8k, ₹12.4k
function fmtCompactAmt(n) {
  const v = Number(n) || 0
  if (v < 1000) return `₹${v}`
  return `₹${(v / 1000).toFixed(1)}k`
}

// yyyy-MM bucket key for an entry's date, or null when missing/unparseable.
function monthKeyOf(d) {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? null : format(dt, 'yyyy-MM')
}

function monthLabel(key) {
  return format(new Date(`${key}-01T12:00:00`), 'MMMM yyyy')
}

const EMPTY_FORM = { date: today(), item: '', billNo: '', amount: '' }

export default function DeptExpenseTab({ department }) {
  const { userProfile, canManageDepartment, isFounder, isSeniorPastor } = useAuth()
  const canEdit = isFounder || isSeniorPastor || canManageDepartment(department)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  // Bill No is a secondary, optional field — hidden by default behind a trigger icon
  // so the form's default state is just date/amount/description.
  const [showBillNo, setShowBillNo] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [actioningId, setActioningId] = useState(null)
  // Everything below (total, entry count, chart, month cards) is scoped to one
  // calendar year — the current one by default. The year switcher only steps
  // through years that actually have entries, so older records stay reachable.
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  useEffect(() => {
    setLoadingEntries(true)
    setLoadErr('')
    const unsub = subscribeFinanceExpenseByDept(department, (entries) => {
      setEntries(entries)
      setLoadingEntries(false)
    })
    return unsub
  }, [department, retryKey])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.item.trim() || !form.amount || !form.date) return
    setSaving(true)
    try {
      const id = await createFinanceExpense({
        department,
        date: form.date,
        item: form.item.trim(),
        billNo: form.billNo.trim(),
        amount: Number(form.amount),
        createdBy: userProfile?.email || 'unknown',
      })
      setEntries(prev => [{
        id, department,
        date: new Date(form.date + 'T12:00:00'),
        item: form.item.trim(),
        billNo: form.billNo.trim(),
        amount: Number(form.amount),
        status: 'pending',
      }, ...prev])
      // Jump to the new entry's year so it doesn't vanish from a year-scoped view.
      setYear(Number(form.date.slice(0, 4)) || currentYear)
      setForm(f => ({ ...EMPTY_FORM, date: f.date }))
      setShowBillNo(false)
      setModalOpen(false)
    } catch {
      alert('Failed to save expense. Please try again.')
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    try {
      await deleteFinanceExpense(id)
      setEntries(prev => prev.filter(e => e.id !== id))
      setDeletingId(null)
    } catch {
      alert('Failed to delete.')
    }
  }

  const handleStatus = async (id, status) => {
    setActioningId(id + status)
    try {
      await updateFinanceExpenseStatus(id, status, userProfile?.displayName || userProfile?.email || 'Unknown')
      setEntries(prev => prev.map(e => e.id === id ? { ...e, status } : e))
    } catch {
      alert('Failed to update status.')
    } finally {
      setActioningId(null)
    }
  }

  // Years that have at least one dated entry, plus the current year, ascending.
  const availableYears = useMemo(() => {
    const ys = new Set([currentYear])
    for (const e of entries) {
      const key = monthKeyOf(e.date)
      if (key) ys.add(Number(key.slice(0, 4)))
    }
    return [...ys].sort((a, b) => a - b)
  }, [entries, currentYear])
  const yearIdx = availableYears.indexOf(year)
  const prevYear = yearIdx > 0 ? availableYears[yearIdx - 1] : null
  const nextYear = yearIdx >= 0 && yearIdx < availableYears.length - 1 ? availableYears[yearIdx + 1] : null

  // Dated entries in the selected year. Undated entries can't be placed in any
  // year, so they're kept out of the year's totals but still listed (as their own
  // "Undated" card) under the current year so they never become unreachable.
  const yearEntries = useMemo(
    () => entries.filter(e => monthKeyOf(e.date)?.startsWith(`${year}-`)),
    [entries, year]
  )
  const undatedEntries = useMemo(
    () => (year === currentYear ? entries.filter(e => !monthKeyOf(e.date)) : []),
    [entries, year, currentYear]
  )

  const totalAmt = yearEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  // The selected year's entries grouped under month headers, newest month first;
  // undated entries fall into a single group pinned to the bottom. Subtotals sum
  // every status.
  const monthGroups = useMemo(() => {
    const buckets = new Map()
    const undated = undatedEntries
    for (const e of yearEntries) {
      const key = monthKeyOf(e.date)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(e)
    }
    const groups = [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, es]) => ({
        key,
        label: monthLabel(key),
        total: es.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        entries: es,
      }))
    if (undated.length) {
      groups.push({
        key: '__undated',
        label: 'Undated',
        total: undated.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        entries: undated,
      })
    }
    return groups
  }, [yearEntries, undatedEntries])

  // The breakdown chart shows every month of the selected year, January onward —
  // up to the current month for this year, all twelve for a past year — with
  // zero-spend months as empty slots so the year reads as a continuous timeline.
  const chartMonths = useMemo(() => {
    const lastMonth = year === currentYear ? new Date().getMonth() + 1 : 12
    const byKey = new Map(monthGroups.map(g => [g.key, g]))
    return Array.from({ length: lastMonth }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`
      return byKey.get(key) || { key, label: monthLabel(key), total: 0, entries: [] }
    })
  }, [monthGroups, year, currentYear])
  const chartMax = chartMonths.reduce((m, g) => Math.max(m, g.total), 0)

  // Months render collapsed by default as a compact card grid; opening a card
  // pops a modal with that month's itemized entries. `openMonthKey` is the one
  // month currently expanded (or null). It's cleared automatically if that
  // month's last entry gets deleted while the modal is open.
  const [openMonthKey, setOpenMonthKey] = useState(null)
  const openGroup = useMemo(
    () => monthGroups.find(g => g.key === openMonthKey) || null,
    [monthGroups, openMonthKey]
  )
  useEffect(() => {
    if (openMonthKey && !monthGroups.some(g => g.key === openMonthKey)) setOpenMonthKey(null)
  }, [openMonthKey, monthGroups])

  // One itemized expense row — rendered inside the month-details modal. Carries
  // the amount, status badge and (for editors) the approve/disapprove/delete
  // actions.
  const renderEntry = (e) => (
    <div key={e.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate max-w-[220px]">{e.item || '—'}</p>
          <p className="text-xs text-slate-400 mt-0.5">{fmtDate(e.date)}{e.billNo ? ` · ${e.billNo}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-sm font-bold text-slate-800 tabular-nums">{fmtAmt(e.amount)}</p>
          <StatusBadge status={e.status} />
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          {(e.status || 'pending') === 'pending' && (
            <>
              <button
                type="button"
                disabled={!!actioningId}
                onClick={() => handleStatus(e.id, 'approved')}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {actioningId === e.id + 'approved' ? 'Approving…' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={!!actioningId}
                onClick={() => handleStatus(e.id, 'disapproved')}
                className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actioningId === e.id + 'disapproved' ? 'Disapproving…' : 'Disapprove'}
              </button>
            </>
          )}
          {deletingId === e.id ? (
            <span className="flex items-center gap-1.5 text-xs ml-auto">
              <span className="text-slate-500">Delete?</span>
              <button type="button" onClick={() => handleDelete(e.id)} className="text-red-600 font-semibold">Yes</button>
              <button type="button" onClick={() => setDeletingId(null)} className="text-slate-400">No</button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setDeletingId(e.id)}
              aria-label="Delete expense"
              className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4 pb-20">

      {/* Merged total-expense summary — a single sleek horizontal card instead of a
          separate stat box duplicating whatever "Expense" header the caller renders
          above this component. Always visible (not gated on canEdit) since everyone
          who can see this tab should see the running total. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Expense · {year}</p>
          <p className="text-2xl font-bold text-slate-800 tabular-nums mt-0.5">{fmtAmt(totalAmt)}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {availableYears.length > 1 && (
            <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                disabled={prevYear == null}
                onClick={() => setYear(prevYear)}
                aria-label="Previous year"
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-1.5 text-xs font-semibold text-slate-700 tabular-nums">{year}</span>
              <button
                type="button"
                disabled={nextYear == null}
                onClick={() => setYear(nextYear)}
                aria-label="Next year"
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full">
            {yearEntries.length} {yearEntries.length === 1 ? 'Entry' : 'Entries'}
          </span>
        </div>
      </div>

      {/* Monthly breakdown — one bar per recent month, at-a-glance only.
          Tapping a bar opens that month's entries modal. */}
      {!loadErr && !loadingEntries && chartMonths.length > 0 && chartMax > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Monthly breakdown · {year}</p>
          <div className="mt-3 flex items-end justify-between gap-1 sm:gap-2">
            {chartMonths.map(g => (
              <button
                key={g.key}
                type="button"
                disabled={g.total <= 0}
                onClick={() => setOpenMonthKey(g.key)}
                title={`${g.label} — ${fmtAmt(g.total)}`}
                className="group flex flex-1 min-w-0 flex-col items-center gap-1.5 disabled:cursor-default"
              >
                <span className="text-[10px] font-semibold text-slate-500 tabular-nums truncate max-w-full">
                  {g.total > 0 ? fmtCompactAmt(g.total) : ' '}
                </span>
                {g.total > 0 ? (
                  <span
                    className="w-full max-w-[36px] rounded-t bg-indigo-500 transition-colors group-hover:bg-indigo-600"
                    style={{ height: Math.max(6, Math.round((g.total / chartMax) * 72)) }}
                  />
                ) : (
                  <span className="w-full max-w-[36px] h-1 rounded bg-slate-100" />
                )}
                <span className="text-[10px] font-medium text-slate-400">
                  {format(new Date(`${g.key}-01T12:00:00`), 'MMM')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section header + add action */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">Expense Entries</h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Plus size={16} /> Add Expense
          </button>
        )}
      </div>

      {/* Monthly grid — every month collapsed by default into a compact card
          (name · entry count · subtotal). Tapping a card opens its entries. */}
      {loadErr ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 text-center">
          <p className="text-sm text-red-500">{loadErr}</p>
          <button type="button" onClick={() => setRetryKey(k => k + 1)} className="mt-2 text-sm text-indigo-600 hover:underline">Retry</button>
        </div>
      ) : loadingEntries ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-6 text-center text-slate-400 text-sm">Loading…</div>
      ) : monthGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5 text-center text-slate-400 text-sm">
          {entries.length === 0 ? 'No expense entries yet.' : `No expense entries in ${year}.`}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {monthGroups.map(group => (
            <button
              key={group.key}
              type="button"
              onClick={() => setOpenMonthKey(group.key)}
              className="group flex flex-col text-left bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <p className="text-sm font-semibold text-slate-800 truncate">{group.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
              </p>
              <p className="text-lg font-bold text-slate-800 tabular-nums mt-2">{fmtAmt(group.total)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600">
                View Entries
                <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Month details — itemized entries for the tapped month card */}
      <FinanceModal
        open={!!openGroup}
        onClose={() => setOpenMonthKey(null)}
        title={openGroup ? `${openGroup.label} · ${fmtAmt(openGroup.total)}` : ''}
      >
        <div className="space-y-2">
          {openGroup?.entries.length
            ? openGroup.entries.map(e => renderEntry(e))
            : <p className="text-center text-slate-400 text-sm py-4">No entries.</p>}
        </div>
      </FinanceModal>

      {/* Add Expense modal */}
      <FinanceModal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Expense">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                required
                className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          <input
            type="text"
            value={form.item}
            onChange={e => setForm(f => ({ ...f, item: e.target.value }))}
            placeholder="What was this for?"
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />

          {showBillNo && (
            <input
              type="text"
              value={form.billNo}
              onChange={e => setForm(f => ({ ...f, billNo: e.target.value }))}
              placeholder="Bill number (optional)"
              autoFocus
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBillNo(v => !v)}
              title="Bill No (optional)"
              aria-label="Toggle bill number"
              className={`w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center transition-colors active:scale-95 ${
                showBillNo || form.billNo
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-600'
                  : 'border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
            >
              <Receipt size={18} />
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 active:scale-95 text-white text-sm font-semibold disabled:opacity-50 transition-all shadow-sm"
            >
              {saving ? 'Saving…' : 'Add Expense'}
            </button>
          </div>
        </form>
      </FinanceModal>
    </div>
  )
}

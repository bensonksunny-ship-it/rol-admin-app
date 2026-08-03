import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Receipt, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { createFinanceExpense, subscribeFinanceExpenseByDept, deleteFinanceExpense } from '../services/firestore'

function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(new Date(d), 'dd MMM yyyy') } catch { return '—' }
}

// Mobile transaction cards show a short "10 Jul" date (no year) to stay compact —
// the desktop table keeps the full dd MMM yyyy via fmtDate above.
function fmtDateShort(d) {
  if (!d) return '—'
  try { return format(new Date(d), 'd MMM') } catch { return '—' }
}

function fmtAmt(n) {
  if (n == null || n === '') return '—'
  return `₹${Number(n).toLocaleString('en-IN')}`
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
      }, ...prev])
      setForm(f => ({ ...EMPTY_FORM, date: f.date }))
      setShowBillNo(false)
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

  const totalAmt = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  return (
    <div className="space-y-4 pb-20">

      {/* Merged total-expense summary — a single sleek horizontal card instead of a
          separate stat box duplicating whatever "Expense" header the caller renders
          above this component. Always visible (not gated on canEdit) since everyone
          who can see this tab should see the running total. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Expense</p>
          <p className="text-2xl font-bold text-slate-800 tabular-nums mt-0.5">{fmtAmt(totalAmt)}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full">
          {entries.length} {entries.length === 1 ? 'Entry' : 'Entries'}
        </span>
      </div>

      {/* Compact entry form */}
      {canEdit && (
        <form
          onSubmit={handleSubmit}
          className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_rgba(99,102,241,0.08)] ring-1 ring-inset ring-slate-100 p-4 space-y-3"
        >
          {/* Row 1: date + amount side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
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
                className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>
          </div>

          {/* Row 2: single-line description */}
          <input
            type="text"
            value={form.item}
            onChange={e => setForm(f => ({ ...f, item: e.target.value }))}
            placeholder="What was this for?"
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
          />

          {/* Bill No — optional, revealed only after tapping the trigger icon below */}
          {showBillNo && (
            <input
              type="text"
              value={form.billNo}
              onChange={e => setForm(f => ({ ...f, billNo: e.target.value }))}
              placeholder="Bill number (optional)"
              autoFocus
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
            />
          )}

          {/* Action bar: Bill No trigger + prominent Add button */}
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
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {/* Entries list — the merged summary card above already shows the running
          total, so no separate "Expense Entries" / Total header repeats it here. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loadErr ? (
          <div className="px-5 py-4 text-center">
            <p className="text-sm text-red-500">{loadErr}</p>
            <button type="button" onClick={() => setRetryKey(k => k + 1)} className="mt-2 text-sm text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : loadingEntries ? (
          <div className="px-5 py-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-5 text-center text-slate-400 text-sm">No expense entries yet.</div>
        ) : (
          <>
            {/* Mobile transaction cards */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {entries.map(e => (
                <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">{e.item || '—'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{fmtDateShort(e.date)}{e.billNo ? ` · ${e.billNo}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{fmtAmt(e.amount)}</p>
                    {canEdit && (
                      deletingId === e.id ? (
                        <span className="flex items-center gap-1.5 text-xs">
                          <button type="button" onClick={() => handleDelete(e.id)} className="text-red-600 font-semibold">Yes</button>
                          <button type="button" onClick={() => setDeletingId(null)} className="text-slate-400">No</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingId(e.id)}
                          aria-label="Delete expense"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Item</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Bill No</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Amount</th>
                    {canEdit && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{fmtDate(e.date)}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{e.item || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{e.billNo || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">{fmtAmt(e.amount)}</td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          {deletingId === e.id ? (
                            <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                              <span>Delete?</span>
                              <button type="button" onClick={() => handleDelete(e.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                              <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setDeletingId(e.id)} className="text-xs text-red-400 hover:text-red-600 hover:underline">
                              Delete
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-rose-700 tabular-nums">{fmtAmt(totalAmt)}</td>
                    {canEdit && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

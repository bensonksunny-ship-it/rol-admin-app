import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { createFinanceExpense, getFinanceExpenseByDept, deleteFinanceExpense } from '../../services/firestore'

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

const EMPTY_FORM = { date: today(), item: '', billNo: '', amount: '' }

export default function WorshipExpenseTab({ department }) {
  const { userProfile, canManageDepartment, isFounder, isSeniorPastor } = useAuth()
  const canEdit = isFounder || isSeniorPastor || canManageDepartment(department)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [loadErr, setLoadErr] = useState('')

  const load = () => {
    setLoadingEntries(true)
    setLoadErr('')
    getFinanceExpenseByDept(department)
      .then(setEntries)
      .catch(() => setLoadErr('Failed to load entries. Tap to retry.'))
      .finally(() => setLoadingEntries(false))
  }

  useEffect(() => { load() }, [department])

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
      setEntries((prev) => [
        {
          id,
          department,
          date: new Date(form.date + 'T12:00:00'),
          item: form.item.trim(),
          billNo: form.billNo.trim(),
          amount: Number(form.amount),
        },
        ...prev,
      ])
      setForm({ ...EMPTY_FORM, date: form.date })
    } catch {
      alert('Failed to save expense. Please try again.')
    }
    setSaving(false)
  }

  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete expense "${entry.item}"?`)) return
    try {
      await deleteFinanceExpense(entry.id)
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    } catch {
      alert('Failed to delete.')
    }
  }

  const totalAmt = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  return (
    <div className="space-y-5">

      {/* ── Entry form ── */}
      {canEdit && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">New Expense Entry</p>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  required
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Item */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item</label>
              <input
                type="text"
                value={form.item}
                onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))}
                placeholder="Item description"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                required
              />
            </div>

            {/* Bill No */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Bill No <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.billNo}
                onChange={(e) => setForm((f) => ({ ...f, billNo: e.target.value }))}
                placeholder="Bill number"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Add Expense'}
            </button>
          </form>
        </div>
      )}

      {/* ── Entries list ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">Expense Entries</p>
          {entries.length > 0 && (
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
              Total {fmtAmt(totalAmt)}
            </span>
          )}
        </div>

        {loadErr ? (
          <div className="px-5 py-4 text-center">
            <p className="text-sm text-red-500">{loadErr}</p>
            <button type="button" onClick={load} className="mt-2 text-sm text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : loadingEntries ? (
          <div className="px-5 py-5 text-center text-slate-400 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-5 text-center text-slate-400 text-sm">No expense entries yet.</div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {entries.map((e) => (
                <div key={e.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{e.item || '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDate(e.date)}</p>
                      {e.billNo && <p className="text-xs text-slate-400 mt-0.5">Bill: {e.billNo}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-bold text-slate-800">{fmtAmt(e.amount)}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleDelete(e)}
                          className="text-red-400 hover:text-red-600 text-xs font-bold px-2 py-0.5 rounded"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Item</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Bill No</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">Amount</th>
                    {canEdit && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{e.item || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{e.billNo || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">{fmtAmt(e.amount)}</td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(e)}
                            className="text-xs text-red-400 hover:text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-indigo-700 tabular-nums">{fmtAmt(totalAmt)}</td>
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

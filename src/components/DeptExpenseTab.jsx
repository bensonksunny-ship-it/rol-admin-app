import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { createFinanceExpense, subscribeFinanceExpenseByDept, deleteFinanceExpense } from '../services/firestore'

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
    <div className="space-y-5">

      {/* Bento: stat card + compact form */}
      {canEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">

          {/* Stat card */}
          <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-rose-300 shadow-sm px-4 py-3 flex flex-col justify-center gap-1">
            <p className="text-xs font-semibold text-slate-500">Total Expense</p>
            <p className="text-lg font-bold text-slate-700 tabular-nums">{fmtAmt(totalAmt)}</p>
            <p className="text-[11px] text-slate-400">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="sm:col-span-2 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_rgba(99,102,241,0.08)] ring-1 ring-inset ring-slate-100 p-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  required
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
                />
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-medium text-slate-500">Item</label>
                <input
                  type="text"
                  value={form.item}
                  onChange={e => setForm(f => ({ ...f, item: e.target.value }))}
                  placeholder="Item description"
                  required
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">
                  Bill No <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.billNo}
                  onChange={e => setForm(f => ({ ...f, billNo: e.target.value }))}
                  placeholder="optional"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full min-h-[40px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
                >
                  {saving ? 'Saving…' : 'Add Expense'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Entries list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {!canEdit && entries.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">Expense Entries</p>
            <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-full">
              Total {fmtAmt(totalAmt)}
            </span>
          </div>
        )}

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
            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {entries.map(e => (
                <div key={e.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{e.item || '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDate(e.date)}{e.billNo ? ` · ${e.billNo}` : ''}</p>
                    </div>
                    <p className="text-sm font-bold text-slate-800 shrink-0">{fmtAmt(e.amount)}</p>
                  </div>
                  {canEdit && (
                    deletingId === e.id ? (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-600">Confirm delete?</span>
                        <button type="button" onClick={() => handleDelete(e.id)} className="text-red-600 font-medium">Yes</button>
                        <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500">No</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setDeletingId(e.id)} className="text-xs text-red-400 hover:text-red-600 font-medium">
                        Delete
                      </button>
                    )
                  )}
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

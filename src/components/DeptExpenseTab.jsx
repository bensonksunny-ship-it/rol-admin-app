import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Plus, Receipt, Trash2 } from 'lucide-react'
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

      {/* Card-table entries list — one responsive row shape at every width */}
      <div className="space-y-2">
        {loadErr ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 text-center">
            <p className="text-sm text-red-500">{loadErr}</p>
            <button type="button" onClick={() => setRetryKey(k => k + 1)} className="mt-2 text-sm text-indigo-600 hover:underline">Retry</button>
          </div>
        ) : loadingEntries ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5 text-center text-slate-400 text-sm">No expense entries yet.</div>
        ) : (
          entries.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
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
              <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                {canEdit && (e.status || 'pending') === 'pending' && (
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
                {canEdit && (
                  deletingId === e.id ? (
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
                  )
                )}
              </div>
            </div>
          ))
        )}
      </div>

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

import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { EXPENSE_CATEGORIES } from '../../constants/roles'
import {
  getFinanceExpense,
  createFinanceExpense,
  updateFinanceExpense,
  deleteFinanceExpense,
} from '../../services/firestore'

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  item: '',
  billNo: '',
  amount: '',
}

export default function ExpensePage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [activeMonth, setActiveMonth] = useState(startOfMonth(new Date()))
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [filterDept, setFilterDept] = useState('all')

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    load()
  }, [activeMonth, canAccess])

  if (!canAccess) return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    try {
      const data = await getFinanceExpense({
        year: activeMonth.getFullYear(),
        month: activeMonth.getMonth(),
      })
      setEntries(data)
    } catch {
      // list stays empty on error
    } finally {
      setLoading(false)
    }
  }

  const visibleEntries = filterDept === 'all'
    ? entries
    : entries.filter(e => (e.department || e.category) === filterDept)

  const totalExpense = visibleEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  function prevMonth() { setActiveMonth(m => subMonths(m, 1)); setFilterDept('all') }
  function nextMonth() { setActiveMonth(m => addMonths(m, 1)); setFilterDept('all') }

  function validate() {
    if (filterDept === 'all') return 'Select a department before adding an entry.'
    if (!form.date) return 'Date is required.'
    if (!form.amount || Number(form.amount) <= 0) return 'Amount must be greater than 0.'
    return ''
  }

  async function handleSave(e) {
    e.preventDefault()
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError('')
    setSaving(true)
    try {
      const payload = {
        date: form.date,
        department: filterDept,
        item: form.item,
        billNo: form.billNo,
        amount: Number(form.amount),
      }
      if (editingId) {
        await updateFinanceExpense(editingId, payload)
      } else {
        await createFinanceExpense(payload)
      }
      setForm(EMPTY_FORM)
      setEditingId(null)
      await load()
    } catch {
      setSaveError('Failed to save. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(entry) {
    setEditingId(entry.id)
    setFilterDept(entry.department || entry.category || 'all')
    setForm({
      date: entry.date instanceof Date
        ? format(entry.date, 'yyyy-MM-dd')
        : format(new Date(entry.date), 'yyyy-MM-dd'),
      item: entry.item || '',
      billNo: entry.billNo || '',
      amount: String(entry.amount ?? ''),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function handleDelete(id) {
    try {
      await deleteFinanceExpense(id)
      setDeletingId(null)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      setSaveError('Failed to delete. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    }
  }

  return (
    <div className="space-y-5 pb-12">

      {/* Month picker */}
      <div className="flex items-center justify-center gap-4 py-2">
        <button
          type="button"
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-base font-semibold text-slate-800 w-36 text-center">
          {format(activeMonth, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Department filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600 shrink-0">Department</label>
        <select
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Departments</option>
          {EXPENSE_CATEGORIES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">Total Expense</p>
        <p className="text-2xl font-bold text-rose-600">
          ₹{totalExpense.toLocaleString('en-IN')}
        </p>
      </div>

      {/* Entry form */}
      <form
        onSubmit={handleSave}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4"
      >
        <h3 className="text-sm font-semibold text-slate-700">
          {editingId ? 'Edit Expense Entry' : 'Add Expense Entry'}
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Item</label>
            <input
              type="text"
              value={form.item}
              onChange={e => setForm(f => ({ ...f, item: e.target.value }))}
              placeholder="Item description"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Bill No</label>
            <input
              type="text"
              value={form.billNo}
              onChange={e => setForm(f => ({ ...f, billNo: e.target.value }))}
              placeholder="Bill number"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {formError && (
          <p className="text-red-600 text-xs font-medium">{formError}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
            >
              Cancel
            </button>
          )}
        </div>

        {saveError && (
          <p className="text-xs font-medium text-red-600">{saveError}</p>
        )}
      </form>

      {/* Expense list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>
        ) : visibleEntries.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            {filterDept === 'all'
              ? 'No expenses recorded for this month.'
              : `No expenses recorded for ${filterDept} this month.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Bill No</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-slate-700">
                      {entry.date instanceof Date
                        ? format(entry.date, 'dd/MM/yyyy')
                        : format(new Date(entry.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entry.department || entry.category}</td>
                    <td className="px-4 py-3 text-slate-700">{entry.item || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{entry.billNo || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      ₹{Number(entry.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {deletingId === entry.id ? (
                        <span className="flex items-center justify-end gap-2 text-xs text-slate-600">
                          <span>Confirm delete?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="text-red-600 font-medium hover:underline"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="text-slate-500 hover:underline"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(entry)}
                            className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 transition"
                            aria-label="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(entry.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition"
                            aria-label="Delete"
                          >
                            🗑️
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

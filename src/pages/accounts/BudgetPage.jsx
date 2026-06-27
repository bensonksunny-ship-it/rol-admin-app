import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { EXPENSE_CATEGORIES } from '../../constants/roles'
import {
  getFinanceBudgetItems,
  addFinanceBudgetItem,
  updateFinanceBudgetItem,
  deleteFinanceBudgetItem,
  getExpenseDepartments,
} from '../../services/firestore'

const BUDGET_TYPES = ['Recurring', 'One-time', 'Capital']
const EMPTY_FORM = {
  department: '',
  category: '',
  subCategory: '',
  description: '',
  quantity: '',
  unitCost: '',
  type: 'Recurring',
  expectedDate: '',
}

function calcTotal(qty, unit) {
  return (Number(qty) || 0) * (Number(unit) || 0)
}

export default function BudgetPage({ department } = {}) {
  const { userProfile } = useAuth()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(department ? { ...EMPTY_FORM, department } : EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [filterDept, setFilterDept] = useState(department || 'all')
  const [deptOptions, setDeptOptions] = useState(EXPENSE_CATEGORIES)

  useEffect(() => {
    getExpenseDepartments()
      .then(dynamic => {
        if (!dynamic.length) return
        const extra = dynamic.map(d => d.name).filter(n => !EXPENSE_CATEGORIES.includes(n))
        if (extra.length) setDeptOptions([...EXPENSE_CATEGORIES, ...extra])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getFinanceBudgetItems()
      setItems(data)
    } catch {
      setLoadError('Failed to load budget items. Tap to retry.')
    } finally {
      setLoading(false)
    }
  }

  const visible = (department || filterDept === 'all')
    ? (department ? items.filter(i => i.department === department) : items)
    : items.filter(i => i.department === filterDept)
  const totalCost = visible.reduce((s, i) => s + (Number(i.totalCost) || 0), 0)

  async function handleSave(e) {
    e.preventDefault()
    if (!form.department) { setFormError('Select a department.'); return }
    if (!form.description.trim()) { setFormError('Description is required.'); return }
    setFormError('')
    setSaving(true)
    try {
      const payload = {
        department: form.department,
        category: form.category,
        subCategory: form.subCategory,
        description: form.description.trim(),
        quantity: Number(form.quantity) || 0,
        unitCost: Number(form.unitCost) || 0,
        totalCost: calcTotal(form.quantity, form.unitCost),
        type: form.type,
        expectedDate: form.expectedDate,
      }
      if (editingId) {
        await updateFinanceBudgetItem(editingId, payload)
        setItems(prev => prev.map(i => i.id === editingId ? { ...i, ...payload } : i))
        setEditingId(null)
      } else {
        const id = await addFinanceBudgetItem(payload, userProfile?.email || 'unknown')
        setItems(prev => [...prev, { id, ...payload }])
      }
      setForm(EMPTY_FORM)
    } catch {
      setFormError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(item) {
    setEditingId(item.id)
    setForm({
      department: item.department || '',
      category: item.category || '',
      subCategory: item.subCategory || '',
      description: item.description || '',
      quantity: String(item.quantity ?? ''),
      unitCost: String(item.unitCost ?? ''),
      type: item.type || 'Recurring',
      expectedDate: item.expectedDate || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    try {
      await deleteFinanceBudgetItem(id)
      setItems(prev => prev.filter(i => i.id !== id))
      setDeletingId(null)
    } catch {
      alert('Failed to delete. Please try again.')
    }
  }

  const liveTotal = calcTotal(form.quantity, form.unitCost)

  return (
    <div className="space-y-5 pb-12">

      {/* Bento: stat card + form */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">

        {/* Stat card */}
        <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-lg p-5 text-white flex flex-col justify-between min-h-[148px]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-100">Total Budget</p>
          <div>
            <p className="text-2xl font-bold leading-tight mt-1">
              ₹{totalCost.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-violet-200 mt-1.5">
              {visible.length} {visible.length === 1 ? 'item' : 'items'}
              {filterDept !== 'all' && ` · ${filterDept}`}
            </p>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSave}
          className="sm:col-span-2 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_rgba(99,102,241,0.08)] ring-1 ring-inset ring-slate-100 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-700">
            {editingId ? 'Edit Budget Item' : 'Add Budget Item'}
          </h3>

          <div className="grid grid-cols-2 gap-3">

            {!department && (
              <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                <label className="text-xs font-medium text-slate-500">Department</label>
                <select
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
                >
                  <option value="">— Select —</option>
                  {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Equipment"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Sub-category</label>
              <input
                type="text"
                value={form.subCategory}
                onChange={e => setForm(f => ({ ...f, subCategory: e.target.value }))}
                placeholder="optional"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-xs font-medium text-slate-500">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Item description"
                required
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Quantity</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="0"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Unit Cost (₹)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.unitCost}
                onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))}
                placeholder="0"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>

            {(form.quantity || form.unitCost) && (
              <div className="col-span-2 flex items-center gap-2 -mt-1">
                <span className="text-xs text-slate-400">Total:</span>
                <span className="text-sm font-bold text-indigo-700">₹{liveTotal.toLocaleString('en-IN')}</span>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              >
                {BUDGET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Expected Date</label>
              <input
                type="date"
                value={form.expectedDate}
                onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>
          </div>

          {formError && <p className="text-red-600 text-xs font-medium">{formError}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? 'Saving…' : editingId ? 'Update' : 'Add Item'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setFormError('') }}
                className="text-sm text-slate-400 hover:text-slate-600 hover:underline"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Department filter pills — hidden when viewing a specific department */}
      {!department && (
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 pb-1" style={{ minWidth: 'max-content' }}>
            {['all', ...deptOptions].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setFilterDept(d)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  filterDept === d
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d === 'all' ? 'All Departments' : d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 font-medium">{loadError}</p>
          <button type="button" onClick={load} className="text-xs text-red-600 font-semibold hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* Budget list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            {filterDept === 'all' ? 'No budget items yet.' : `No budget items for ${filterDept}.`}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {visible.map((item, idx) => (
                <div key={item.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">
                        <span className="text-xs font-normal text-slate-400 mr-1">#{idx + 1}</span>
                        {item.description || '—'}
                      </p>
                      {(item.category || item.subCategory) && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {[item.category, item.subCategory].filter(Boolean).join(' › ')}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-indigo-700 shrink-0">
                      ₹{Number(item.totalCost || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.department && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {item.department}
                      </span>
                    )}
                    {item.type && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                        {item.type}
                      </span>
                    )}
                    {item.expectedDate && (
                      <span className="text-[10px] text-slate-400">{item.expectedDate}</span>
                    )}
                  </div>
                  {deletingId === item.id ? (
                    <div className="flex items-center gap-3 text-xs pt-1">
                      <span className="text-slate-600">Confirm delete?</span>
                      <button type="button" onClick={() => handleDelete(item.id)} className="text-red-600 font-medium">
                        Yes
                      </button>
                      <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500">
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="text-xs text-indigo-600 font-medium hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(item.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 w-10 text-center">#</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Cost</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Expected</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{item.department || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {[item.category, item.subCategory].filter(Boolean).join(' › ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{item.description || '—'}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{item.quantity ?? 0}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        ₹{Number(item.unitCost || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700">
                        ₹{Number(item.totalCost || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{item.type || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{item.expectedDate || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {deletingId === item.id ? (
                          <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                            <span>Delete?</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
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
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEdit(item)}
                              className="p-1.5 rounded hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition text-xs font-medium"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingId(item.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition text-xs font-medium"
                            >
                              Del
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-slate-700">
                      Total ({visible.length} items)
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-indigo-700">
                      ₹{totalCost.toLocaleString('en-IN')}
                    </td>
                    <td colSpan={3} />
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

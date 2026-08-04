import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { EXPENSE_CATEGORIES } from '../../constants/roles'
import {
  getFinanceBudgetItems,
  addFinanceBudgetItem,
  updateFinanceBudgetItem,
  updateFinanceBudgetItemStatus,
  deleteFinanceBudgetItem,
  getExpenseDepartments,
} from '../../services/firestore'
import FinanceModal from '../../components/finance/FinanceModal'
import StatusBadge from '../../components/finance/StatusBadge'

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
  const { userProfile, canManageDepartment, isFounder, isSeniorPastor } = useAuth()
  const canEditRow = (rowDept) => isFounder || isSeniorPastor || canManageDepartment(rowDept)

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(department ? { ...EMPTY_FORM, department } : EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [actioningId, setActioningId] = useState(null)
  const [filterDept, setFilterDept] = useState(department || 'all')
  const [deptOptions, setDeptOptions] = useState(EXPENSE_CATEGORIES)
  const [modalOpen, setModalOpen] = useState(false)

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

  function openAddModal() {
    setEditingId(null)
    setForm(department ? { ...EMPTY_FORM, department } : EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

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
        setItems(prev => [...prev, { id, status: 'pending', ...payload }])
      }
      setForm(department ? { ...EMPTY_FORM, department } : EMPTY_FORM)
      setModalOpen(false)
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
    setFormError('')
    setModalOpen(true)
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

  async function handleStatus(id, status) {
    setActioningId(id + status)
    try {
      await updateFinanceBudgetItemStatus(id, status, userProfile?.displayName || userProfile?.email || 'Unknown')
      setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    } catch {
      alert('Failed to update status.')
    } finally {
      setActioningId(null)
    }
  }

  const liveTotal = calcTotal(form.quantity, form.unitCost)

  return (
    <div className="space-y-5 pb-12">

      {/* Stat card + add action */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-lg p-5 text-white flex-1 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-100">Total Budget</p>
            <p className="text-2xl font-bold leading-tight mt-1">₹{totalCost.toLocaleString('en-IN')}</p>
            <p className="text-xs text-violet-200 mt-1.5">
              {visible.length} {visible.length === 1 ? 'item' : 'items'}
              {filterDept !== 'all' && ` · ${filterDept}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-sm transition-colors shrink-0"
        >
          <Plus size={16} /> New Budget Line
        </button>
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

      {/* Card-table list — one responsive row shape at every width */}
      <div className="space-y-2">
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-400 text-sm">
            {filterDept === 'all' ? 'No budget items yet.' : `No budget items for ${filterDept}.`}
          </div>
        ) : (
          visible.map((item, idx) => {
            const rowCanEdit = canEditRow(item.department)
            return (
              <div key={item.id} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
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
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-bold text-indigo-700">₹{Number(item.totalCost || 0).toLocaleString('en-IN')}</p>
                    <StatusBadge status={item.status} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
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
                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                  {rowCanEdit && (item.status || 'pending') === 'pending' && (
                    <>
                      <button
                        type="button"
                        disabled={!!actioningId}
                        onClick={() => handleStatus(item.id, 'approved')}
                        className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {actioningId === item.id + 'approved' ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={!!actioningId}
                        onClick={() => handleStatus(item.id, 'disapproved')}
                        className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {actioningId === item.id + 'disapproved' ? 'Disapproving…' : 'Disapprove'}
                      </button>
                    </>
                  )}
                  {deletingId === item.id ? (
                    <span className="flex items-center gap-2 text-xs ml-auto">
                      <span className="text-slate-600">Confirm delete?</span>
                      <button type="button" onClick={() => handleDelete(item.id)} className="text-red-600 font-medium">Yes</button>
                      <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500">No</button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-3 ml-auto">
                      <button type="button" onClick={() => handleEdit(item)} className="text-xs text-indigo-600 font-medium hover:underline">
                        Edit
                      </button>
                      <button type="button" onClick={() => setDeletingId(item.id)} className="text-xs text-red-500 hover:underline">
                        Delete
                      </button>
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add/Edit Budget Item modal */}
      <FinanceModal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Budget Item' : 'Add Budget Item'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">

            {!department && (
              <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                <label className="text-xs font-medium text-slate-500">Department</label>
                <select
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Sub-category</label>
              <input
                type="text"
                value={form.subCategory}
                onChange={e => setForm(f => ({ ...f, subCategory: e.target.value }))}
                placeholder="optional"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          {formError && <p className="text-red-600 text-xs font-medium">{formError}</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-5 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? 'Saving…' : editingId ? 'Update' : 'Add Item'}
          </button>
        </form>
      </FinanceModal>
    </div>
  )
}

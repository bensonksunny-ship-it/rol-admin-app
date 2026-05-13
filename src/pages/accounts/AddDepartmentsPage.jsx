import { useState, useEffect } from 'react'
import { EXPENSE_CATEGORIES } from '../../constants/roles'
import {
  getExpenseDepartments,
  addExpenseDepartment,
  deleteExpenseDepartment,
} from '../../services/firestore'

export default function AddDepartmentsPage() {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await getExpenseDepartments()
      setDepartments(data)
    } catch {
      // list stays empty
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) { setError('Department name is required.'); return }
    const allNames = [
      ...EXPENSE_CATEGORIES.map(n => n.toLowerCase()),
      ...departments.map(d => d.name.toLowerCase()),
    ]
    if (allNames.includes(trimmed.toLowerCase())) {
      setError('This department already exists.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await addExpenseDepartment(trimmed)
      setNewName('')
      await load()
    } catch (err) {
      console.error('addExpenseDepartment error:', err)
      setError(err?.message || err?.code || 'Failed to add. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteExpenseDepartment(id)
      setDeletingId(null)
      setDepartments(prev => prev.filter(d => d.id !== id))
    } catch {
      setError('Failed to delete. Please try again.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Add Department</h3>
        <form onSubmit={handleAdd} className="flex items-center gap-3">
          <input
            type="text"
            value={newName}
            onChange={e => { setNewName(e.target.value); setError('') }}
            placeholder="Department name"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 transition"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </form>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">
            Departments in dropdown
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({EXPENSE_CATEGORIES.length} default · {departments.length} added)
            </span>
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {EXPENSE_CATEGORIES.map(name => (
              <li key={name} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-slate-700">{name}</span>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Default</span>
              </li>
            ))}
            {departments.map(dept => (
              <li key={dept.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-slate-700">{dept.name}</span>
                {deletingId === dept.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-slate-600">Delete?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(dept.id)}
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
                  <button
                    type="button"
                    onClick={() => setDeletingId(dept.id)}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
            {departments.length === 0 && (
              <li className="px-4 py-6 text-center text-slate-400 text-sm">
                No custom departments added yet.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

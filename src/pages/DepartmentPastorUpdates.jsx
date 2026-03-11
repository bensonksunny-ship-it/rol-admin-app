import { useParams, Link, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDepartmentBySlug } from '../constants/departments'
import {
  getDepartmentPastorUpdates,
  addDepartmentPastorUpdate,
  updateDepartmentPastorUpdate,
  deleteDepartmentPastorUpdate,
} from '../services/firestore'
import { ROLES } from '../constants/roles'
import { format } from 'date-fns'
import { formatDMY } from '../utils/date'

export default function DepartmentPastorUpdates() {
  const { slug } = useParams()
  const { userProfile, isFounder, isSeniorPastor } = useAuth()
  const department = getDepartmentBySlug(slug)

  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
    pastorRating: 5,
    changesSuggested: '',
  })

  const canManage = (isFounder || isSeniorPastor) && !!department

  useEffect(() => {
    if (!department) {
      setLoading(false)
      return
    }
    setLoading(true)
    getDepartmentPastorUpdates(slug)
      .then(setUpdates)
      .finally(() => setLoading(false))
  }, [department, slug])

  if (!department) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/senior-pastor" className="text-blue-600 hover:underline">← Senior Pastor Office</Link>
        <p className="mt-4">Department not found.</p>
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/" className="text-blue-600 hover:underline">← Dashboard</Link>
        <p className="mt-4">You don&apos;t have access to pastor updates for this department.</p>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = { ...form, department: slug }
      if (editingId) {
        await updateDepartmentPastorUpdate(editingId, payload)
        setUpdates((prev) => prev.map((u) => (u.id === editingId ? { ...u, ...payload } : u)))
      } else {
        const id = await addDepartmentPastorUpdate(
          payload,
          userProfile?.displayName || userProfile?.email || 'unknown',
          userProfile?.role || ''
        )
        setUpdates((prev) => [{ id, ...payload }, ...prev])
      }
      setModalOpen(false)
      setEditingId(null)
      setForm({ date: format(new Date(), 'yyyy-MM-dd'), notes: '', pastorRating: 5, changesSuggested: '' })
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`/department/${slug}/pastor`}
          className="text-slate-600 hover:text-slate-800 text-sm"
        >
          ← {department.name} Pastor view
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Updates</h1>
        <p className="text-slate-500 mt-1">
          Pastor notes, ratings, and suggested changes for {department.name}. Only Senior Pastor and Founder can edit.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setEditingId(null)
            setForm({
              date: format(new Date(), 'yyyy-MM-dd'),
              notes: '',
              pastorRating: 5,
              changesSuggested: '',
            })
            setModalOpen(true)
          }}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + Add entry
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-5 py-8 text-center text-slate-500">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-600 w-12">SL No</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Date</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Notes</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Pastor Rating (out of 10)</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Changes Suggested by Pastor</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Submitted by</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {updates.map((u, idx) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-600">{idx + 1}</td>
                    <td className="px-5 py-3 text-slate-800">{u.date ? formatDMY(u.date) : '—'}</td>
                    <td className="px-5 py-3 text-slate-600 max-w-[200px] whitespace-pre-wrap">{u.notes || '—'}</td>
                    <td className="px-5 py-3 text-slate-800">{u.pastorRating ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-600 max-w-[220px] whitespace-pre-wrap">{u.changesSuggested || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {u.addedBy || '—'}
                      {(u.addedByRole === ROLES.DIRECTOR || u.addedByRole === ROLES.COORDINATOR) && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          {u.addedByRole}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(u.id)
                          setForm({
                            date: u.date ? (typeof u.date === 'string' ? u.date : format(new Date(u.date), 'yyyy-MM-dd')) : format(new Date(), 'yyyy-MM-dd'),
                            notes: u.notes || '',
                            pastorRating: u.pastorRating ?? 5,
                            changesSuggested: u.changesSuggested || '',
                          })
                          setModalOpen(true)
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('Delete this update?')) return
                          await deleteDepartmentPastorUpdate(u.id)
                          setUpdates((prev) => prev.filter((x) => x.id !== u.id))
                        }}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {updates.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                      No updates yet. Add an entry to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">{editingId ? 'Edit entry' : 'Add entry'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pastor Rating (1–10) *</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.pastorRating}
                  onChange={(e) => setForm((f) => ({ ...f, pastorRating: Number(e.target.value) || 5 }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Changes Suggested by Pastor</label>
                <textarea
                  value={form.changesSuggested}
                  onChange={(e) => setForm((f) => ({ ...f, changesSuggested: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">Save</button>
                <button type="button" onClick={() => { setModalOpen(false); setEditingId(null) }} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

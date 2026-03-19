import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { getAllUsers, updateUserByAdmin, setUserStatus } from '../services/firestore'

export default function CellUserManagement() {
  const { userProfile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    role: '',
    department: '',
    cellGroup: '',
    status: 'active',
  })

  const isAdminOrFounder =
    userProfile?.role === ROLES.ADMIN || userProfile?.role === ROLES.FOUNDER
  const isCellDirector =
    userProfile?.role === ROLES.DIRECTOR && userProfile?.department === 'Cell'
  const isCellLeader =
    userProfile?.role === ROLES.COORDINATOR && userProfile?.department === 'Cell'

  useEffect(() => {
    setLoading(true)
    getAllUsers()
      .then(setUsers)
      .finally(() => setLoading(false))
  }, [])

  const filteredUsers = useMemo(() => {
    if (isAdminOrFounder) return users
    if (isCellDirector) {
      return users.filter((u) => u.department === 'Cell')
    }
    if (isCellLeader) {
      const myCell = userProfile?.cellGroup || userProfile?.cellId || ''
      if (!myCell) return []
      return users.filter((u) => u.department === 'Cell' && u.cellGroup === myCell)
    }
    return []
  }, [users, isAdminOrFounder, isCellDirector, isCellLeader, userProfile])

  const sortedUsers = useMemo(
    () =>
      [...filteredUsers].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [filteredUsers]
  )

  const canEdit = isAdminOrFounder || isCellDirector || isCellLeader

  const openEdit = (u) => {
    if (!canEdit) return
    setEditingId(u.id)
    setForm({
      name: u.name || '',
      phone: u.phone || '',
      role: u.role || '',
      department: u.department || '',
      cellGroup: u.cellGroup || '',
      status: u.status || 'active',
    })
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!canEdit || !editingId) return
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        status: form.status,
      }
      // Only Admin can change role/department/cellGroup
      if (isAdminOrFounder) {
        payload.role = form.role
        payload.department = form.department
        payload.cellGroup = form.cellGroup
      }
      await updateUserByAdmin(editingId, payload)
      setUsers((prev) =>
        prev.map((u) => (u.id === editingId ? { ...u, ...payload } : u))
      )
      setModalOpen(false)
      setEditingId(null)
    } catch (err) {
      console.error(err)
      alert('Failed to save user.')
    }
  }

  const handleDeactivate = async (u) => {
    if (!canEdit) return
    if (!window.confirm(`Deactivate ${u.name || u.email}?`)) return
    try {
      await setUserStatus(u.id, 'inactive')
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: 'inactive' } : x)))
    } catch (err) {
      console.error(err)
      alert('Failed to deactivate user.')
    }
  }

  const handleReactivate = async (u) => {
    if (!canEdit) return
    try {
      await setUserStatus(u.id, 'active')
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: 'active' } : x)))
    } catch (err) {
      console.error(err)
      alert('Failed to reactivate user.')
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Cell User Management</h1>
        <p className="text-slate-500 mt-1 text-sm">
          View and manage users connected to cell groups, according to your access level.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Department</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Cell Group</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              {canEdit && (
                <th className="text-left px-4 py-3 font-medium text-slate-600 w-40">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-4 py-6 text-center text-slate-500">
                  Loading users…
                </td>
              </tr>
            ) : sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="px-4 py-6 text-center text-slate-500">
                  No users found for your access.
                </td>
              </tr>
            ) : (
              sortedUsers.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-slate-800">{u.name || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{u.role || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{u.department || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{u.cellGroup || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{u.phone || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        (u.status || 'active') === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {(u.status || 'active').replace(/^\w/, (c) => c.toUpperCase())}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 space-x-2">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      {((u.status || 'active') === 'active' && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(u)}
                          className="text-amber-600 hover:underline"
                        >
                          Deactivate
                        </button>
                      )) ||
                        (((u.status || 'active') !== 'active') && (
                          <button
                            type="button"
                            onClick={() => handleReactivate(u)}
                            className="text-emerald-600 hover:underline"
                          >
                            Reactivate
                          </button>
                        ))}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Edit User</h3>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              {isAdminOrFounder && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                    <input
                      type="text"
                      value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={form.department}
                      onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                </div>
              )}
              {isAdminOrFounder && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cell Group
                  </label>
                  <input
                    type="text"
                    value={form.cellGroup}
                    onChange={(e) => setForm((f) => ({ ...f, cellGroup: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false)
                    setEditingId(null)
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


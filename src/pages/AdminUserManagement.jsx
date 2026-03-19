import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENT_LIST } from '../constants/departments'
import { ROLES, POSITION_OPTIONS, deriveRoleFromPositions, deriveDepartmentsFromPositions } from '../constants/roles'
import { getAllUsers, createUserByAdmin, updateUserByAdmin, setUserStatus } from '../services/firestore'
import { auth, functions, httpsCallable } from '../lib/firebase'
import { logAction } from '../utils/auditLog'

const MAX_POSITIONS = 4
const emptyPosition = () => ({ department: '', position: '' })

export default function AdminUserManagement() {
  const { userProfile, user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    membershipNumber: '',
    positions: [emptyPosition()],
    cellGroup: '',
    cellId: '',
    roleOverride: '',
    globalRole: '',
    status: 'active',
  })
  const [error, setError] = useState('')

  const isFounderGlobal = userProfile?.globalRole === 'FOUNDER'
  const isFounderLegacy = userProfile?.role === ROLES.FOUNDER
  const canManageUsers = isFounderGlobal || isFounderLegacy

  useEffect(() => {
    if (!canManageUsers) return
    setLoading(true)
    getAllUsers()
      .then(setUsers)
      .finally(() => setLoading(false))
  }, [canManageUsers])

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [users]
  )

  if (!canManageUsers) {
    return (
      <div className="p-6 text-slate-600">
        <p className="font-semibold text-slate-800 mb-2">User Management</p>
        <p>Only Founder can access this page.</p>
      </div>
    )
  }

  const openAdd = () => {
    setEditingId(null)
    setForm({
      name: '',
      email: '',
      phone: '',
      membershipNumber: '',
      positions: [emptyPosition()],
      cellGroup: '',
      cellId: '',
      roleOverride: '',
      globalRole: '',
      status: 'active',
    })
    setError('')
    setModalOpen(true)
  }

  const openEdit = (u) => {
    setEditingId(u.id)
    let positions = Array.isArray(u.positions) && u.positions.length ? u.positions : []
    if (positions.length === 0 && (u.department || (u.departments && u.departments.length))) {
      const depts = u.departments?.length ? u.departments : [u.department]
      positions = depts.map((d) => ({ department: d, position: u.role || 'Associate' }))
    }
    if (positions.length === 0) positions = [emptyPosition()]
    setForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      membershipNumber: u.membershipNumber || '',
      positions: positions.slice(0, MAX_POSITIONS),
      cellGroup: u.cellGroup || '',
      cellId: u.cellId || '',
      roleOverride: [ROLES.FOUNDER, ROLES.ADMIN, ROLES.SENIOR_PASTOR].includes(u.role) ? u.role : '',
      globalRole: u.globalRole === 'FOUNDER' ? 'FOUNDER' : '',
      status: u.status || 'active',
    })
    setError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    const email = (form.email || '').trim().toLowerCase()
    const membershipNumber = String(form.membershipNumber || '').trim()
    if (!email || !membershipNumber) {
      setError('Email and Membership Number are required.')
      return
    }
    setSaving(true)
    try {
      const all = users
      const emailClash = all.find(
        (u) => u.email?.toLowerCase() === email && u.id !== editingId
      )
      if (emailClash) {
        setError('Email is already used by another user.')
        setSaving(false)
        return
      }
      const memClash = all.find(
        (u) => String(u.membershipNumber || '') === membershipNumber && u.id !== editingId
      )
      if (memClash) {
        setError('Membership Number is already used by another user.')
        setSaving(false)
        return
      }
      const positions = (form.positions || [])
        .filter((p) => p.department || p.position)
        .slice(0, MAX_POSITIONS)
      const departments = deriveDepartmentsFromPositions(positions)
      const role = form.roleOverride || deriveRoleFromPositions(positions)

      const { globalRole: formGlobalRole, ...formRest } = form
      const payload = {
        ...formRest,
        email,
        membershipNumber,
        positions,
        role,
        departments,
        department: departments[0] || '',
        ...(editingId ? {} : { globalRole: formGlobalRole === 'FOUNDER' ? 'FOUNDER' : null }),
      }
      if (editingId) {
        const beforeUser = users.find((x) => x.id === editingId) || null
        await updateUserByAdmin(editingId, payload)
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingId ? { ...u, ...payload } : u
          )
        )

        // Optional director assignment detection (logged as separate action)
        try {
          const beforePositions = Array.isArray(beforeUser?.positions) ? beforeUser.positions : []
          const afterPositions = Array.isArray(payload.positions) ? payload.positions : []
          const toDirector = afterPositions.filter((p) => p?.department && p?.position === 'Director')
          const wasDirector = new Set(beforePositions.filter((p) => p?.department && p?.position === 'Director').map((p) => p.department))
          const newlyDirector = toDirector.filter((p) => !wasDirector.has(p.department))
          for (const p of newlyDirector) {
            await logAction({
              action: 'ASSIGN_DIRECTOR',
              user,
              targetId: editingId,
              targetType: 'USER',
              department: p.department,
              details: { department: p.department, position: 'Director' },
            })
          }
        } catch (logErr) {
          console.warn('Audit log failed (ASSIGN_DIRECTOR):', logErr)
        }

        // User update audit (must not fail save)
        try {
          await logAction({
            action: 'UPDATE_USER',
            user,
            targetId: editingId,
            targetType: 'USER',
            department: null,
            details: { before: beforeUser, after: payload },
          })
        } catch (logErr) {
          console.warn('Audit log failed (UPDATE_USER):', logErr)
        }
        setModalOpen(false)
        setEditingId(null)

        // Global Role change (Founder-only; must sync custom claims)
        const beforeGlobal = beforeUser?.globalRole === 'FOUNDER' ? 'FOUNDER' : ''
        const nextGlobal = formGlobalRole === 'FOUNDER' ? 'FOUNDER' : ''
        if (beforeGlobal !== nextGlobal) {
          await handleGlobalRoleChange(editingId, nextGlobal)
        }
      } else {
        // Prefer Cloud Function so Auth user is created automatically (Blaze plan)
        if (!functions) {
          setError('Firebase Functions is not configured in this build. Cannot create Auth users automatically.')
          setSaving(false)
          return
        }
        try {
          if (!auth?.currentUser) {
            setError('You are not signed in. Please refresh the page and sign in again, then try creating the user.')
            setSaving(false)
            return
          }
          // Ensure we have a fresh token so callable sends auth context
          await auth.currentUser.getIdToken(true)
          // Sanity check: confirm Functions receives auth context
          const whoAmI = httpsCallable(functions, 'whoAmI')
          const who = await whoAmI()
          if (!who?.data?.uid) {
            setError('Your login is not being sent to Cloud Functions. Please sign out, refresh, and sign in again.')
            setSaving(false)
            return
          }
          const createUser = httpsCallable(functions, 'adminCreateUser')
          const res = await createUser(payload)
          const uid = res?.data?.uid || null
          if (!uid) throw new Error('User created but uid was not returned.')
          setUsers((prev) => [...prev, { id: uid, ...payload }])

          // Optional: audit log (CREATE_USER) is recorded in Cloud Function for reliability
          setModalOpen(false)
          setEditingId(null)
        } catch (fnErr) {
          console.error('adminCreateUser failed:', fnErr)
          const code = fnErr?.code ? ` (${fnErr.code})` : ''
          const msg = fnErr?.message || 'Cloud Function failed'
          setError(`Failed to create login account${code}: ${msg}`)
          setSaving(false)
          return
        }
      }
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Failed to save user.')
    } finally {
      setSaving(false)
    }
  }

  const handleGlobalRoleChange = async (targetUid, next) => {
    if (!functions) {
      alert('Cloud Functions is not configured. Cannot update global role safely.')
      return
    }
    try {
      if (!auth?.currentUser) {
        alert('You are not signed in. Please refresh and sign in again.')
        return
      }
      await auth.currentUser.getIdToken(true)
      const setRole = httpsCallable(functions, 'setGlobalRole')
      const res = await setRole({ uid: targetUid, globalRole: next === 'FOUNDER' ? 'FOUNDER' : null })
      const updated = res?.data?.globalRole || null
      setUsers((prev) => prev.map((u) => (u.id === targetUid ? { ...u, globalRole: updated } : u)))
      try {
        await logAction({
          action: 'ASSIGN_ROLE',
          user,
          targetId: targetUid,
          targetType: 'USER',
          department: null,
          details: { globalRole: updated },
        })
      } catch (logErr) {
        console.warn('Audit log failed (ASSIGN_ROLE):', logErr)
      }
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Failed to update Global Role.')
    }
  }

  const handleDeactivate = async (u) => {
    if (!window.confirm(`Deactivate ${u.name || u.email}?`)) return
    try {
      await setUserStatus(u.id, 'inactive')
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: 'inactive' } : x)))
    } catch (err) {
      console.error(err)
      alert('Failed to deactivate user.')
    }
  }

  const handleResetPassword = async (u) => {
    alert(
      `Username: ${u.email}\nPassword (membership number): ${u.membershipNumber || ''}\n\nPlease set this password in Firebase Auth or share it securely with the user.`
    )
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Create and manage users. Username is email; password is membership number.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          Add User
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Positions</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Cell Group</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 w-40">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Loading users…
                </td>
              </tr>
            ) : sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No users found.
                </td>
              </tr>
            ) : (
              sortedUsers.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-slate-800">{u.name || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{u.email || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{u.phone || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{u.role || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {Array.isArray(u.positions) && u.positions.length
                      ? u.positions
                          .filter((p) => p.department || p.position)
                          .map((p) => `${p.department || '?'} (${p.position || '?'})`)
                          .join(', ')
                      : Array.isArray(u.departments) && u.departments.length
                        ? u.departments.join(', ')
                        : (u.department || '—')}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{u.cellGroup || '—'}</td>
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
                  <td className="px-4 py-2 space-x-2">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeactivate(u)}
                      className="text-amber-600 hover:underline"
                    >
                      Deactivate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetPassword(u)}
                      className="text-slate-600 hover:underline"
                    >
                      Reset Password
                    </button>
                  </td>
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
              <h3 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Edit User' : 'Add User'}
              </h3>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Membership Number (password)
                  </label>
                  <input
                    type="text"
                    value={form.membershipNumber}
                    onChange={(e) => setForm((f) => ({ ...f, membershipNumber: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Account Role (Admin/Founder only)
                  </label>
                  <select
                    value={form.roleOverride}
                    onChange={(e) => setForm((f) => ({ ...f, roleOverride: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">Auto (from positions)</option>
                    <option value={ROLES.FOUNDER}>Founder</option>
                    <option value={ROLES.ADMIN}>Admin</option>
                    <option value={ROLES.SENIOR_PASTOR}>Senior Pastor</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Use this only for Founder/Admin accounts. Leave as Auto for normal users.
                  </p>
                </div>
                {isFounderGlobal && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Global Role</label>
                    <select
                      value={form.globalRole}
                      onChange={(e) => setForm((f) => ({ ...f, globalRole: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                    >
                      <option
                        value=""
                        disabled={Boolean(editingId && user?.uid && editingId === user.uid && isFounderGlobal)}
                      >
                        None
                      </option>
                      <option value="FOUNDER">
                        Founder
                      </option>
                    </select>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Founder is displayed as “Senior Pastor” in the app.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cell Group (optional)
                  </label>
                  <input
                    type="text"
                    value={form.cellGroup}
                    onChange={(e) => setForm((f) => ({ ...f, cellGroup: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cell ID (optional, recommended for Cell Leaders)
                  </label>
                  <input
                    type="text"
                    value={form.cellId}
                    onChange={(e) => setForm((f) => ({ ...f, cellId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    placeholder="Paste the Cell Group document ID"
                  />
                  <p className="text-xs text-slate-500 mt-0.5">
                    This locks the leader to exactly one cell even if names change.
                  </p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Positions in department (up to {MAX_POSITIONS})
                  </label>
                  {form.positions.length < MAX_POSITIONS && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          positions: [...f.positions, emptyPosition()],
                        }))
                      }
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      + Add position
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-2">Select department and position for each role. Position: Director, Coordinator, Cell Leader, or Associate.</p>
                <div className="space-y-3">
                  {(form.positions || [emptyPosition()]).map((pos, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <select
                        value={pos.department}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            positions: f.positions.map((p, i) =>
                              i === idx ? { ...p, department: e.target.value } : p
                            ),
                          }))
                        }
                        className="px-3 py-2 rounded-lg border border-slate-300 text-sm min-w-[140px]"
                      >
                        <option value="">— Department —</option>
                        {DEPARTMENT_LIST.map((d) => (
                          <option key={d.slug} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={pos.position}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            positions: f.positions.map((p, i) =>
                              i === idx ? { ...p, position: e.target.value } : p
                            ),
                          }))
                        }
                        className="px-3 py-2 rounded-lg border border-slate-300 text-sm min-w-[140px]"
                      >
                        <option value="">— Position —</option>
                        {POSITION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {form.positions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              positions: f.positions.filter((_, i) => i !== idx),
                            }))
                          }
                          className="text-red-600 text-xs hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
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


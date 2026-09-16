import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENT_LIST } from '../constants/departments'
import { ROLES, POSITION_OPTIONS, deriveRoleFromPositions, deriveDepartmentsFromPositions, formatPositionLabel } from '../constants/roles'
import { getAllUsers, getDelightVisitors, getCellGroups, getPeople, addPerson, updatePerson, getPerson } from '../services/firestore'
import { auth, functions, httpsCallable } from '../lib/firebase'
import { logAction } from '../utils/auditLog'

const MAX_POSITIONS = 10
const emptyPosition = () => ({ department: '', position: '' })

// Badge label for a position pill — Director is always suffixed with its department
// (via the shared formatPositionLabel, e.g. "Director - Worship") so a multi-department
// director reads unambiguously; Worship still gets a friendlier "Leader"/"Member"
// distinction for its other legacy positions than the generic "{Department} ({Position})"
// every other department uses.
function formatPositionBadge(department, position) {
  const dept = department || '—'
  const pos = String(position || '').trim().toLowerCase()
  if (pos === 'director') return formatPositionLabel(department, position)
  if (dept === 'Worship') {
    const isLeaderish = ['coordinator', 'cell leader'].includes(pos)
    return isLeaderish ? 'Worship Leader' : 'Worship Member'
  }
  return position ? `${dept} (${position})` : dept
}

export default function AdminUserManagement() {
  const { userProfile, user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Directory cards start collapsed (name + positions only); tapping one reveals
  // contact details and actions. Tracked as a Set so multiple cards can be open at once.
  const [expandedUserIds, setExpandedUserIds] = useState(() => new Set())
  const toggleUserExpanded = (id) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    membershipNumber: '',
    personId: '',
    positions: [emptyPosition()],
    cellGroup: '',
    cellId: '',
    roleOverride: '',
    globalRole: '',
    status: 'active',
  })
  const [error, setError] = useState('')
  const [membersList, setMembersList] = useState([])
  const [nameSuggestions, setNameSuggestions] = useState([])
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [cellGroupsList, setCellGroupsList] = useState([])

  const isCellLeaderSelected = (form.positions || []).some(
    (p) => String(p?.department || '').trim().toLowerCase() === 'cell' && String(p?.position || '').trim().toLowerCase() === 'cell leader'
  )

  const isFounderGlobal = userProfile?.globalRole === 'FOUNDER'
  const isFounderLegacy = userProfile?.role === ROLES.FOUNDER
  const canManageUsers = isFounderGlobal || isFounderLegacy

  useEffect(() => {
    if (!canManageUsers) return
    setLoading(true)
    getAllUsers()
      .then(setUsers)
      .finally(() => setLoading(false))
    // People's Directory is the primary source; D-Light visitors fill in anyone not yet in it.
    // `source` is tagged per-entry so selection/save logic knows which ids are real
    // `people` doc ids (safe to updatePerson against) vs. delight_visitors ids (not).
    Promise.all([getPeople().catch(() => []), getDelightVisitors().catch(() => [])]).then(([people, visitors]) => {
      const seen = new Set()
      const unique = []
      for (const p of [
        ...people.map((p) => ({ ...p, source: 'people' })),
        ...visitors.map((v) => ({ ...v, source: 'delight_visitor' })),
      ]) {
        const key = p.phone ? `p:${p.phone}` : `n:${(p.name || '').toLowerCase()}`
        if (p.name && !seen.has(key)) { seen.add(key); unique.push(p) }
      }
      setMembersList(unique)
    })
    getCellGroups('Cell').then(setCellGroupsList).catch(() => {})
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
      personId: '',
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
      personId: u.personId || '',
      positions: positions.slice(0, MAX_POSITIONS),
      cellGroup: u.cellGroup || '',
      cellId: u.cellId || '',
      roleOverride: [ROLES.FOUNDER, ROLES.ADMIN, ROLES.SENIOR_PASTOR, ROLES.WEEKLY_ENTRY].includes(u.role) ? u.role : '',
      globalRole: u.globalRole === 'FOUNDER' ? 'FOUNDER' : '',
      status: u.status || 'active',
    })
    setError('')
    setModalOpen(true)
  }

  // Keeps the People's Directory (`people` collection) in sync with whatever Name/
  // Email/Phone ended up in this form, without ever creating a duplicate record:
  //   1. If we already have a real `people` doc id, update it in place.
  //   2. Otherwise, conflict-resolve by email — if someone in the directory already
  //      has this email, update that record instead of creating a second one for them.
  //   3. Only if neither matches does this create a brand-new directory record.
  // Returns the resolved personId to link onto the application user.
  const syncDirectoryRecord = async ({ personId, name, email, phone, membershipNumber }) => {
    const directoryPayload = { name, email, phone, membershipNumber }
    const updatedBy = userProfile?.email || ''

    if (personId) {
      const existing = await getPerson(personId)
      if (existing) {
        await updatePerson(personId, directoryPayload, updatedBy)
        return personId
      }
      // Stale/invalid id (e.g. the record was deleted) — fall through to conflict resolution.
    }

    const emailMatch = email
      ? membersList.find((m) => m.source === 'people' && (m.email || '').toLowerCase() === email.toLowerCase())
      : null
    if (emailMatch) {
      await updatePerson(emailMatch.id, directoryPayload, updatedBy)
      return emailMatch.id
    }

    return await addPerson(directoryPayload, updatedBy)
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

      // If the user is a Cell Leader, cellGroup is mandatory (so we can link their report permissions).
      if (positions.some((p) => String(p?.department || '').trim().toLowerCase() === 'cell' && String(p?.position || '').trim().toLowerCase() === 'cell leader')) {
        const cellGroupVal = String(form.cellGroup || '').trim()
        if (!cellGroupVal) {
          setError('Cell Group is required when assigning a Cell Leader position.')
          setSaving(false)
          return
        }
      }

      const departments = deriveDepartmentsFromPositions(positions)
      const role = form.roleOverride || deriveRoleFromPositions(positions)

      // Upsert the People's Directory record before touching the user account, so the
      // user we're about to create/update always links to a real, de-duplicated personId.
      const personId = await syncDirectoryRecord({
        personId: form.personId,
        name: form.name.trim(),
        email,
        phone: form.phone.trim(),
        membershipNumber,
      })

      const { globalRole: formGlobalRole, ...formRest } = form
      const payload = {
        ...formRest,
        personId,
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
        if (!auth?.currentUser) {
          setError('You are not signed in. Please refresh and sign in again.')
          setSaving(false)
          return
        }
        await auth.currentUser.getIdToken(true)
        const updateUser = httpsCallable(functions, 'adminUpdateUser')
        await updateUser({ uid: editingId, ...payload })
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
      await auth.currentUser.getIdToken(true)
      const updateUser = httpsCallable(functions, 'adminUpdateUser')
      await updateUser({ uid: u.id, status: 'inactive' })
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

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
  }

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors'
  const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5'

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">User Management</h1>
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

      {loading ? (
        <p className="text-center text-slate-500 py-10">Loading users…</p>
      ) : sortedUsers.length === 0 ? (
        <p className="text-center text-slate-500 py-10">No users found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedUsers.map((u) => {
            const isActive = (u.status || 'active') === 'active'
            const positions = Array.isArray(u.positions) ? u.positions.filter((p) => p.department || p.position) : []
            const fallbackDepts = positions.length === 0
              ? (Array.isArray(u.departments) && u.departments.length ? u.departments : (u.department ? [u.department] : []))
              : []

            const expanded = expandedUserIds.has(u.id)

            return (
              <div
                key={u.id}
                onClick={() => toggleUserExpanded(u.id)}
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleUserExpanded(u.id) } }}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3 cursor-pointer transition-colors hover:border-indigo-200 hover:shadow-md"
              >
                {/* Name & status — always visible */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-800 truncate" title={u.name || ''}>{u.name || '—'}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>

                {/* Role & Positions badges — always visible */}
                <div className="flex flex-wrap gap-1.5">
                  {u.role && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {u.role}
                    </span>
                  )}
                  {positions.map((p, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                      {formatPositionBadge(p.department, p.position)}
                    </span>
                  ))}
                  {fallbackDepts.map((d) => (
                    <span key={d} className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                      {d}
                    </span>
                  ))}
                </div>

                {/* Everything below only renders while expanded */}
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden flex flex-col gap-3"
                    >
                      {/* Contact & Cell Group details */}
                      <div className="text-xs text-slate-500 space-y-1 min-w-0">
                        <p className="truncate"><span className="text-slate-400">Email:</span> {u.email || '—'}</p>
                        <p className="truncate"><span className="text-slate-400">Phone:</span> {u.phone || '—'}</p>
                        <p className="truncate"><span className="text-slate-400">Cell Group:</span> {u.cellGroup || '—'}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEdit(u) }}
                          className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeactivate(u) }}
                          className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          Deactivate
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleResetPassword(u) }}
                          className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Reset Password
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="shrink-0 flex items-start justify-between gap-4 px-5 sm:px-8 py-5 sm:py-6 border-b border-slate-200">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-slate-800">
                  {editingId ? 'Edit User' : 'Add User'}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {editingId
                    ? 'Update account details, role, and department positions.'
                    : 'Create a login and assign department positions.'}
                </p>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              </div>
              <button
                type="button"
                onClick={closeModal}
                title="Close"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <label className={labelCls}>Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => {
                        const q = e.target.value
                        // Typing breaks any existing directory link — it no longer names a specific record.
                        setForm((f) => ({ ...f, name: q, personId: '' }))
                        const hits = q.trim().length >= 1
                          ? membersList.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 7)
                          : []
                        setNameSuggestions(hits)
                        setShowNameSuggestions(hits.length > 0)
                      }}
                      onFocus={() => { if (nameSuggestions.length > 0) setShowNameSuggestions(true) }}
                      onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                      className={inputCls}
                      placeholder="Type to search the People's Directory…"
                      autoComplete="off"
                    />
                    {showNameSuggestions && (
                      <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                        {nameSuggestions.map((m) => (
                          <li
                            key={m.id}
                            onMouseDown={() => {
                              // Auto-fill Email/Phone from the selected directory record (overwriting
                              // whatever was typed so far — the whole point of picking a match is to
                              // pull in their existing details). `personId` only gets set when this
                              // came from an actual `people` doc; a delight_visitors-sourced pick has
                              // no `people` record yet, so submit-time sync will create/match one.
                              setForm((f) => ({
                                ...f,
                                name: m.name,
                                email: m.email || f.email,
                                phone: m.phone || f.phone,
                                personId: m.source === 'people' ? m.id : '',
                                membershipNumber: f.membershipNumber || m.membershipNumber || '',
                              }))
                              setShowNameSuggestions(false)
                              setNameSuggestions([])
                            }}
                            className="px-3 py-2 hover:bg-indigo-50 cursor-pointer"
                          >
                            <span className="text-sm font-medium text-slate-800">{m.name}</span>
                            {(m.phone || m.membershipNumber) && (
                              <span className="ml-2 text-xs text-slate-400">{m.phone || m.membershipNumber}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {form.personId && (
                      <p className="mt-1.5 text-xs text-indigo-600 flex items-center gap-1.5">
                        Linked to People's Directory
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, personId: '' }))}
                          className="text-slate-400 hover:text-red-500 underline"
                        >
                          Unlink
                        </button>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Membership Number (password)</label>
                    <input
                      type="text"
                      value={form.membershipNumber}
                      onChange={(e) => setForm((f) => ({ ...f, membershipNumber: e.target.value }))}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Account Role (Admin/Founder only)</label>
                    <select
                      value={form.roleOverride}
                      onChange={(e) => setForm((f) => ({ ...f, roleOverride: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Auto (from positions)</option>
                      <option value={ROLES.FOUNDER}>Founder</option>
                      <option value={ROLES.ADMIN}>Admin</option>
                      <option value={ROLES.SENIOR_PASTOR}>Senior Pastor</option>
                      <option value={ROLES.WEEKLY_ENTRY}>Weekly Entry</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Use this only for Founder/Admin accounts or Weekly Entry restricted users. Leave as Auto for normal users.
                    </p>
                  </div>
                  {isFounderGlobal && (
                    <div>
                      <label className={labelCls}>Global Role</label>
                      <select
                        value={form.globalRole}
                        onChange={(e) => setForm((f) => ({ ...f, globalRole: e.target.value }))}
                        className={inputCls}
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
                      <p className="text-xs text-slate-500 mt-1">
                        Founder is displayed as “Senior Pastor” in the app.
                      </p>
                    </div>
                  )}
                  {isCellLeaderSelected && (
                    <div>
                      <label className={labelCls}>Cell Group (required)</label>
                      {cellGroupsList.length > 0 ? (
                        <select
                          value={form.cellId || ''}
                          onChange={(e) => {
                            const cg = cellGroupsList.find((g) => g.id === e.target.value)
                            setForm((f) => ({
                              ...f,
                              cellId: cg ? cg.id : '',
                              cellGroup: cg ? cg.cellName : '',
                            }))
                          }}
                          className={inputCls}
                          required
                        >
                          <option value="">— select cell group —</option>
                          {cellGroupsList.filter((g) => g.status !== 'inactive').map((g) => (
                            <option key={g.id} value={g.id}>{g.cellName}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={form.cellGroup}
                          onChange={(e) => setForm((f) => ({ ...f, cellGroup: e.target.value }))}
                          className={inputCls}
                          placeholder="Cell group name"
                          required
                        />
                      )}
                      <p className="text-xs text-slate-500 mt-1">
                        Links the leader to their cell's reports and attendance.
                      </p>
                    </div>
                  )}
                </div>

                {/* Positions */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 active:scale-95 transition-all"
                      >
                        + Add position
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Select department and position for each role. Position: Director, Coordinator, Cell Leader, or Associate.</p>
                  <div className="space-y-2">
                    {(form.positions || [emptyPosition()]).map((pos, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
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
                          className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors"
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
                          className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors"
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
                            className="shrink-0 px-2.5 py-1.5 rounded-lg text-red-600 text-xs font-medium hover:bg-red-50 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      {String(pos.position || '').trim().toLowerCase() === 'director' && pos.department && (
                        <p className="text-xs font-medium text-indigo-600">
                          Will be saved as <span className="font-semibold">{formatPositionLabel(pos.department, pos.position)}</span>
                        </p>
                      )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 flex justify-end gap-3 px-5 sm:px-8 py-4 border-t border-slate-200 bg-white rounded-b-xl">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


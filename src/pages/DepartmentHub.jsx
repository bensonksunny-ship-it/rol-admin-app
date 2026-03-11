import { useParams, Link, Navigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDepartmentBySlug } from '../constants/departments'
import {
  getTasks,
  getDepartmentEntries,
  addDepartmentEntry,
  getDepartmentTeamMembers,
  addDepartmentTeamMember,
  updateDepartmentTeamMember,
  deleteDepartmentTeamMember,
} from '../services/firestore'
import { ROLES } from '../constants/roles'
import { differenceInDays } from 'date-fns'

const TABS = ['summary', 'team', 'planning', 'financial']

export default function DepartmentHub() {
  const { slug } = useParams()
  const { userProfile, canManageDepartment, isDepartmentHead } = useAuth()
  const department = getDepartmentBySlug(slug)

  const [tasks, setTasks] = useState([])
  const [entries, setEntries] = useState([])
  const [planningNotes, setPlanningNotes] = useState('')
  const [savingPlanning, setSavingPlanning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary')
  const [team, setTeam] = useState([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [teamError, setTeamError] = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [memberForm, setMemberForm] = useState({
    name: '',
    role: '',
    memberSince: new Date().toISOString().slice(0, 10),
    isFormer: false,
  })

  useEffect(() => {
    if (!department) {
      setLoading(false)
      return
    }
    setLoading(true)
    const name = department.name
    setLoadingTeam(true)
    Promise.all([
      getTasks({ department: name }),
      getDepartmentEntries(name, { limit: 20 }),
      getDepartmentTeamMembers(name),
    ])
      .then(([taskList, entryList, teamList]) => {
        setTasks(taskList)
        setEntries(entryList)
        setTeam(teamList)
        const latest = entryList.find((e) => e.type === 'planning' || e.notes) || entryList[0]
        setPlanningNotes(latest?.notes ?? '')
        setTeamError('')
      })
      .catch(() => {
        setTeam([])
        setTeamError('Could not load team members. Check Firestore rules for department_team_members.')
      })
      .finally(() => {
        setLoading(false)
        setLoadingTeam(false)
      })
  }, [department])

  if (!department) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">Department not found.</p>
      </div>
    )
  }

  if (department.customPage === 'worship') return <Navigate to="/department/worship" replace />
  if (department.customPage === 'sundayMinistry') return <Navigate to="/department/sunday-ministry" replace />

  if (!canManageDepartment(department.name)) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">You don&apos;t have access to this department page.</p>
      </div>
    )
  }

  const canEdit = canManageDepartment(department.name)
  const headLabel = userProfile?.department === department.name && isDepartmentHead(department.name)
    ? (userProfile?.role === ROLES.DIRECTOR ? 'Director' : 'Coordinator')
    : null

  const handleSavePlanning = async (e) => {
    e.preventDefault()
    if (!canEdit) return
    setSavingPlanning(true)
    try {
      await addDepartmentEntry({
        department: department.name,
        type: 'planning',
        period: new Date().toISOString().slice(0, 7),
        notes: planningNotes,
        enteredBy: userProfile?.displayName || userProfile?.email || 'unknown',
      })
      setEntries((prev) => [{ notes: planningNotes, type: 'planning', createdAt: new Date() }, ...prev])
    } finally {
      setSavingPlanning(false)
    }
  }

  const pending = useMemo(
    () => tasks.filter((t) => t.status !== 'Completed'),
    [tasks]
  )
  const completed = useMemo(
    () => tasks.filter((t) => t.status === 'Completed'),
    [tasks]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/departments" className="text-slate-500 hover:text-slate-700">← Departments</Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{department.name} dashboard</h1>
        {headLabel && <p className="text-sm text-slate-500 mt-0.5">Department head: {headLabel}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 border-b border-slate-200 pb-0.5 mt-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab
                ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            {tab === 'summary' && 'Summary'}
            {tab === 'team' && 'Team'}
            {tab === 'planning' && 'Planning'}
            {tab === 'financial' && 'Financial'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-500">Loading...</div>
      ) : (
        <>
          {activeTab === 'summary' && (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h2 className="font-semibold text-slate-800 mb-3">Summary</h2>
                <p className="text-sm text-slate-600">
                  Overview of tasks and recent entries for this department.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Total tasks</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{tasks.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Pending</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{pending.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Completed</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{completed.length}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-500 mt-4">
                  <Link to={`/departments/${slug}`} className="text-blue-600 hover:underline">
                    View all tasks for {department.name} →
                  </Link>
                </p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Recent reports & entries</h2>
                {entries.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-sm">No entries yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {entries.slice(0, 5).map((e) => (
                      <li key={e.id} className="px-5 py-3 text-sm">
                        <span className="text-slate-500">{e.period || e.type || 'Entry'}</span>
                        {e.notes && <p className="text-slate-800 mt-0.5 whitespace-pre-wrap">{e.notes}</p>}
                        <p className="text-xs text-slate-400 mt-1">
                          {e.enteredBy} · {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {activeTab === 'planning' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-3">Planning</h2>
              {canEdit ? (
                <form onSubmit={handleSavePlanning} className="space-y-2">
                  <textarea
                    value={planningNotes}
                    onChange={(e) => setPlanningNotes(e.target.value)}
                    placeholder="Planning notes for this department..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[140px]"
                    rows={6}
                  />
                  <button
                    type="submit"
                    disabled={savingPlanning}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingPlanning ? 'Saving...' : 'Save planning'}
                  </button>
                </form>
              ) : (
                <div className="text-slate-600 whitespace-pre-wrap">
                  {planningNotes || '— No planning notes yet —'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'team' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-800">Team</h2>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMember(null)
                      setMemberForm({
                        name: '',
                        role: '',
                        memberSince: new Date().toISOString().slice(0, 10),
                        isFormer: false,
                      })
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                  >
                    + Add member
                  </button>
                )}
              </div>
              {teamError && team.length === 0 && (
                <p className="text-sm text-red-600">{teamError}</p>
              )}
              {loadingTeam ? (
                <div className="py-4 text-sm text-slate-500">Loading team...</div>
              ) : team.length === 0 ? (
                <div className="py-4 text-sm text-slate-500">No team members yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium w-10">SL</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Name</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Role / Position</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Member since</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Duration & positions</th>
                        <th className="text-left px-4 py-2 text-slate-600 font-medium">Status</th>
                        {canEdit && (
                          <th className="text-left px-4 py-2 text-slate-600 font-medium">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {team.map((m, idx) => {
                        const durationDays = m.memberSince
                          ? differenceInDays(new Date(), new Date(m.memberSince))
                          : null
                        const positionsText = m.role || ''
                        return (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-600">{idx + 1}</td>
                          <td className="px-4 py-2 text-slate-800">{m.name}</td>
                          <td className="px-4 py-2 text-slate-600">{m.role || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{m.memberSince || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">
                            {durationDays != null && <div>{durationDays} days</div>}
                            {positionsText && (
                              <div className="text-slate-600 mt-0.5">
                                {durationDays != null ? 'Positions: ' : ''}{positionsText}
                              </div>
                            )}
                            {!durationDays && !positionsText && '—'}
                          </td>
                          <td className="px-4 py-2 text-slate-600">{m.isFormer ? 'Former' : 'Current'}</td>
                          {canEdit && (
                            <td className="px-4 py-2 text-sm space-x-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMember(m)
                                  setMemberForm({
                                    name: m.name || '',
                                    role: m.role || '',
                                    memberSince: m.memberSince || new Date().toISOString().slice(0, 10),
                                    isFormer: !!m.isFormer,
                                  })
                                }}
                                className="text-blue-600 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('Remove this member from team?')) return
                                  await deleteDepartmentTeamMember(m.id)
                                  setTeam((prev) => prev.filter((x) => x.id !== m.id))
                                }}
                                className="text-red-600 hover:underline"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}

              {canEdit && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    try {
                      if (editingMember) {
                        await updateDepartmentTeamMember(editingMember.id, memberForm)
                        setTeam((prev) =>
                          prev.map((m) => (m.id === editingMember.id ? { ...m, ...memberForm } : m))
                        )
                      } else {
                        const id = await addDepartmentTeamMember(
                          department.name,
                          memberForm,
                          userProfile?.email || 'unknown'
                        )
                        setTeam((prev) => [
                          ...prev,
                          { id, department: department.name, ...memberForm },
                        ])
                      }
                      setTeamError('')
                      setEditingMember(null)
                      setMemberForm({
                        name: '',
                        role: '',
                        memberSince: new Date().toISOString().slice(0, 10),
                        isFormer: false,
                      })
                    } catch (err) {
                      console.error(err)
                      setTeamError('Failed to save team member.')
                    }
                  }}
                  className="mt-4 space-y-3 border-t border-slate-200 pt-4"
                >
                  <h3 className="text-sm font-semibold text-slate-800">
                    {editingMember ? 'Edit member' : 'Add new member'}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        required
                        value={memberForm.name}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, name: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Role / Position
                      </label>
                      <input
                        type="text"
                        value={memberForm.role}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, role: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Member since
                      </label>
                      <input
                        type="date"
                        value={memberForm.memberSince}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, memberSince: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-4 sm:mt-7">
                      <input
                        id="isFormer"
                        type="checkbox"
                        checked={memberForm.isFormer}
                        onChange={(e) =>
                          setMemberForm((f) => ({ ...f, isFormer: e.target.checked }))
                        }
                        className="h-4 w-4 text-indigo-600 border-slate-300 rounded"
                      />
                      <label
                        htmlFor="isFormer"
                        className="text-xs font-medium text-slate-700"
                      >
                        Former member
                      </label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  >
                    {editingMember ? 'Update member' : 'Add member'}
                  </button>
                </form>
              )}
            </div>
          )}

          {activeTab === 'financial' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-3">Financial</h2>
              <p className="text-sm text-slate-500">
                Financial summaries for this department will be connected to the Finance module
                later. For now, use Finance → Reports for detailed figures.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

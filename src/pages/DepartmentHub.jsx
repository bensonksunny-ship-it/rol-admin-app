import { useParams, Link, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDepartmentBySlug } from '../constants/departments'
import { getTasks, getDepartmentEntries, addDepartmentEntry } from '../services/firestore'
import { ROLES } from '../constants/roles'

export default function DepartmentHub() {
  const { slug } = useParams()
  const { userProfile, canManageDepartment, isDepartmentHead } = useAuth()
  const department = getDepartmentBySlug(slug)

  const [tasks, setTasks] = useState([])
  const [entries, setEntries] = useState([])
  const [planningNotes, setPlanningNotes] = useState('')
  const [savingPlanning, setSavingPlanning] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!department) {
      setLoading(false)
      return
    }
    setLoading(true)
    const name = department.name
    Promise.all([
      getTasks({ department: name }),
      getDepartmentEntries(name, { limit: 20 }),
    ])
      .then(([taskList, entryList]) => {
        setTasks(taskList)
        setEntries(entryList)
        const latest = entryList.find((e) => e.type === 'planning' || e.notes) || entryList[0]
        setPlanningNotes(latest?.notes ?? '')
      })
      .finally(() => setLoading(false))
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

  const pending = tasks.filter((t) => t.status !== 'Completed')
  const completed = tasks.filter((t) => t.status === 'Completed')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/departments" className="text-slate-500 hover:text-slate-700">← Departments</Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{department.name}</h1>
        {headLabel && <p className="text-sm text-slate-500 mt-0.5">Department head: {headLabel}</p>}
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-500">Loading...</div>
      ) : (
        <>
          {/* Planning */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-3">Planning</h2>
            {canEdit ? (
              <form onSubmit={handleSavePlanning} className="space-y-2">
                <textarea
                  value={planningNotes}
                  onChange={(e) => setPlanningNotes(e.target.value)}
                  placeholder="Planning notes for this department..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[100px]"
                  rows={4}
                />
                <button type="submit" disabled={savingPlanning} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {savingPlanning ? 'Saving...' : 'Save planning'}
                </button>
              </form>
            ) : (
              <div className="text-slate-600 whitespace-pre-wrap">{planningNotes || '— No planning notes yet —'}</div>
            )}
          </div>

          {/* Reports / recent entries */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Recent reports & entries</h2>
            {entries.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">No entries yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {entries.slice(0, 10).map((e) => (
                  <li key={e.id} className="px-5 py-3 text-sm">
                    <span className="text-slate-500">{e.period || e.type || 'Entry'}</span>
                    {e.notes && <p className="text-slate-800 mt-0.5 whitespace-pre-wrap">{e.notes}</p>}
                    <p className="text-xs text-slate-400 mt-1">{e.enteredBy} · {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tasks summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm text-slate-500">Total tasks</p>
              <p className="text-2xl font-bold text-slate-800">{tasks.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm text-slate-500">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm text-slate-500">Completed</p>
              <p className="text-2xl font-bold text-emerald-600">{completed.length}</p>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            <Link to={`/departments/${slug}`} className="text-blue-600 hover:underline">View all tasks for {department.name} →</Link>
          </p>
        </>
      )}
    </div>
  )
}

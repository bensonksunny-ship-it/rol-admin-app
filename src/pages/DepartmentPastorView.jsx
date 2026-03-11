import { useParams, Link, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDepartmentBySlug } from '../constants/departments'
import { getDepartmentEntries, getPastorRemarks, setPastorRemarks } from '../services/firestore'

export default function DepartmentPastorView() {
  const { slug } = useParams()
  const { hasPermission, isFounder, userProfile } = useAuth()
  const department = getDepartmentBySlug(slug)

  const [entries, setEntries] = useState([])
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const canAccess = (hasPermission('pastorHub') || isFounder) && !!department

  useEffect(() => {
    if (!department) {
      setLoading(false)
      return
    }
    const load = async () => {
      setLoading(true)
      try {
        const [list, pastor] = await Promise.all([
          getDepartmentEntries(department.name, { limit: 5 }),
          getPastorRemarks(department.name),
        ])
        setEntries(list || [])
        setRemarks(pastor?.notes ?? '')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [department])

  if (!department) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/senior-pastor" className="text-blue-600 hover:underline">← Senior Pastor Office</Link>
        <p className="mt-4">Department not found.</p>
      </div>
    )
  }

  if (!canAccess) {
    return (
      <div className="p-6 text-slate-600">
        <Link to="/" className="text-blue-600 hover:underline">← Dashboard</Link>
        <p className="mt-4">You don&apos;t have access to the pastor view for this department.</p>
      </div>
    )
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await setPastorRemarks(
        department.name,
        { notes: remarks },
        userProfile?.displayName || userProfile?.email || 'unknown'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>
  }

  const dashboardPath =
    department.customPage === 'worship'
      ? '/department/worship'
      : department.customPage === 'sundayMinistry'
      ? '/department/sunday-ministry'
      : `/department/${slug}`

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Link
          to="/senior-pastor"
          className="block rounded-lg bg-slate-800 text-white px-3 py-3 text-center text-sm font-semibold shadow-sm hover:bg-slate-900 transition"
        >
          Senior Pastor Office
        </Link>
        <Link
          to={dashboardPath}
          className="block rounded-lg bg-indigo-700 text-white px-3 py-3 text-center text-sm font-semibold shadow-sm hover:bg-indigo-800 transition"
        >
          {department.name} department dashboard
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{department.name} – Senior Pastor view</h1>
        <p className="text-slate-500 mt-1">
          Your private planning and notes for this department. Directors / coordinators cannot see this page.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-3">Your planning & remarks</h2>
        <form onSubmit={handleSave} className="space-y-2">
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[140px]"
            placeholder="Your plan, concerns, and focus areas for this department..."
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save pastor notes'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">
          Key updates from department dashboard
        </h2>
        {entries.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">
            No recent entries from the department yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id} className="px-5 py-3 text-sm">
                <span className="text-slate-500">{e.period || e.type || 'Entry'}</span>
                {e.notes && (
                  <p className="text-slate-800 mt-0.5 whitespace-pre-wrap">
                    {e.notes.length > 260 ? `${e.notes.slice(0, 260)}…` : e.notes}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  {e.enteredBy} · {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-sm text-slate-500" />
    </div>
  )
}


import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENT_LIST, getDepartmentPath } from '../constants/departments'
import { getDepartmentEntries, getPastorRemarks, setPastorRemarks } from '../services/firestore'

export default function SeniorPastorHub() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [entriesByDept, setEntriesByDept] = useState({})
  const [remarksByDept, setRemarksByDept] = useState({})
  const [editingRemarks, setEditingRemarks] = useState(null)
  const [remarksDraft, setRemarksDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const canAccess = hasPermission('pastorHub') || isFounder
  const canEdit = canAccess

  useEffect(() => {
    const load = async () => {
      setLoadError('')
      try {
        const ent = {}
        const rem = {}

        const results = await Promise.allSettled(
          DEPARTMENT_LIST.map(async (d) => {
            const [list, remark] = await Promise.all([
              getDepartmentEntries(d.name, { limit: 1 }).catch(() => []),
              getPastorRemarks(d.name).catch(() => null),
            ])
            return { name: d.name, list, remark }
          })
        )

        for (const r of results) {
          if (r.status === 'fulfilled') {
            ent[r.value.name] = r.value.list
            rem[r.value.name] = r.value.remark
          } else {
            // Ensure the page still renders even if some departments failed
            // eslint-disable-next-line no-continue
            continue
          }
        }

        setEntriesByDept(ent)
        setRemarksByDept(rem)
      } catch (e) {
        setLoadError('Some data could not be loaded. Please refresh to try again.')
      } finally {
        setLoading(false)
      }
    }
    load().catch(() => {
      setLoadError('Some data could not be loaded. Please refresh to try again.')
      setLoading(false)
    })
  }, [])

  const handleSaveRemarks = async (departmentName) => {
    setSaving(true)
    try {
      await setPastorRemarks(
        departmentName,
        { notes: remarksDraft },
        userProfile?.displayName || userProfile?.email || 'unknown'
      )
      setRemarksByDept((prev) => ({
        ...prev,
        [departmentName]: { ...prev[departmentName], notes: remarksDraft, updatedAt: new Date() },
      }))
      setEditingRemarks(null)
    } finally {
      setSaving(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="p-8 text-slate-600">
        You don&apos;t have access to the Senior Pastor hub. Senior Pastor or Founder only.
      </div>
    )
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Senior Pastor hub</h1>
        <p className="text-slate-500 mt-1">View all departments and add your remarks. Reports and planning from department heads are reflected here.</p>
      </div>

      {loadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {DEPARTMENT_LIST.map((d) => {
          const latest = entriesByDept[d.name]?.[0]
          const remark = remarksByDept[d.name]
          const isEditing = editingRemarks === d.name
          return (
            <div key={d.slug} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h2 className="font-semibold text-slate-800">{d.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {latest ? `Last entry: ${latest.createdAt ? new Date(latest.createdAt).toLocaleDateString() : ''}` : 'No entries yet'}
              </p>
              {latest?.notes && <p className="text-sm text-slate-600 mt-2 line-clamp-2">{latest.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={getDepartmentPath(d.name)} className="text-sm text-blue-600 hover:underline font-medium">Open department dashboard →</Link>
                <Link
                  to={`/department/${d.slug}/pastor`}
                  className="text-sm text-indigo-600 hover:underline font-medium"
                >
                  Pastor view →
                </Link>
              </div>
              {canEdit && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-600 mb-1">Your remarks</p>
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={remarksDraft}
                        onChange={(e) => setRemarksDraft(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 min-h-[60px]"
                        placeholder="Add remarks..."
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleSaveRemarks(d.name)} disabled={saving} className="px-2 py-1 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">Save</button>
                        <button type="button" onClick={() => { setEditingRemarks(null); setRemarksDraft(remark?.notes ?? '') }} className="px-2 py-1 rounded border border-slate-300 text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-slate-600 whitespace-pre-wrap">{remark?.notes || '—'}</div>
                      <button type="button" onClick={() => { setEditingRemarks(d.name); setRemarksDraft(remark?.notes ?? '') }} className="mt-1 text-xs text-blue-600 hover:underline">Edit remarks</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

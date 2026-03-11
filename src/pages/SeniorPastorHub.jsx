import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENT_LIST } from '../constants/departments'
import { getDepartmentEntries, getPastorRemarks, setPastorRemarks } from '../services/firestore'

const TILE_COLORS = [
  'from-amber-500 to-orange-400',
  'from-sky-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-purple-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-indigo-500',
]

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
        {DEPARTMENT_LIST.map((d, idx) => {
          const color = TILE_COLORS[idx % TILE_COLORS.length]
          const latest = entriesByDept[d.name]?.[0]
          const remark = remarksByDept[d.name]
          const isEditing = editingRemarks === d.name
          return (
            <Link
              key={d.slug}
              to={`/department/${d.slug}/pastor`}
              className="block rounded-xl border border-slate-200 shadow-sm bg-white hover:shadow-md hover:-translate-y-0.5 transition transform overflow-hidden"
            >
              <div className={`px-4 py-2 bg-gradient-to-r ${color}`}>
                <h2 className="font-semibold text-white text-sm">{d.name}</h2>
                <p className="text-[11px] text-white/80">
                  {latest
                    ? `Last entry: ${
                        latest.createdAt ? new Date(latest.createdAt).toLocaleDateString() : ''
                      }`
                    : 'No entries yet'}
                </p>
              </div>
              <div className="p-4">
                {latest?.notes && (
                  <p className="text-sm text-slate-700 line-clamp-2">{latest.notes}</p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Your remarks:{' '}
                  <span className="font-medium text-slate-700">
                    {remark?.notes ? 'Saved' : 'None yet'}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-indigo-600 font-medium">
                  Click tile to open pastor view →
                </p>
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
            </Link>
          )
        })}
      </div>
    </div>
  )
}

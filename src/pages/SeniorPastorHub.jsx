import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENT_LIST } from '../constants/departments'
import { getDepartmentEntries, getPastorRemarks, setPastorRemarks } from '../services/firestore'

const TILE_COLORS = [
  'bg-amber-700',
  'bg-sky-700',
  'bg-emerald-700',
  'bg-violet-700',
  'bg-rose-700',
  'bg-cyan-700',
]

// RFF is deliberately excluded from the church-wide department roster (see
// docs/superpowers/specs/2026-08-26-rff-department-design.md) — it must not
// appear here even though it's a real DEPARTMENT_LIST entry, since this page
// otherwise lists every department unconditionally (unlike the regular
// dock/nav, which only shows departments a user personally has a position
// in).
const PASTOR_HUB_DEPARTMENTS = DEPARTMENT_LIST.filter((d) => d.slug !== 'rff')

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
          PASTOR_HUB_DEPARTMENTS.map(async (d) => {
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
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Senior Pastor hub</h1>
        <p className="text-slate-500 mt-1">View all departments and add your remarks. Reports and planning from department heads are reflected here.</p>
      </div>

      {loadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {PASTOR_HUB_DEPARTMENTS.map((d, idx) => {
          const color = TILE_COLORS[idx % TILE_COLORS.length]
          return (
            <Link
              key={d.slug}
              to={`/department/${d.slug}/pastor`}
              className={`block rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition transform overflow-hidden ${color}`}
            >
              <div className="h-16 flex items-center justify-center px-2">
                <h2 className="font-semibold text-white text-base text-center">{d.name}</h2>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

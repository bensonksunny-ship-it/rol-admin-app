import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getSundayProgramDefault, setSundayProgramDefault } from '../services/firestore'
import DepartmentTabBar from '../components/DepartmentTabBar'

const DEFAULT_SEED = [
  { programName: 'Pre Worship Talk', order: 0 },
  { programName: 'Worship', order: 1 },
  { programName: 'Leader Prayer', order: 2 },
  { programName: 'Announcements', order: 3 },
  { programName: 'Sermon', order: 4 },
  { programName: 'Prayer & Benediction', order: 5 },
]

export default function SundayProgram() {
  const { userProfile, canManageDepartment } = useAuth()
  const canEdit = canManageDepartment('Sunday Ministry')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ programName: '', order: 0 })
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    setLoading(true)
    getSundayProgramDefault()
      .then((doc) => {
        const list = doc.items?.length ? doc.items : [...DEFAULT_SEED]
        setItems(
          list.map((x, i) => ({
            ...x,
            localId: `lp-${i}-${String(x.programName || '').slice(0, 20)}`,
          }))
        )
      })
      .catch(() =>
        setItems(DEFAULT_SEED.map((x, i) => ({ ...x, localId: `seed-${i}` })))
      )
      .finally(() => setLoading(false))
  }, [])

  const persist = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      const payload = [...items]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((x, i) => ({
          programName: String(x.programName || '').trim(),
          order: typeof x.order === 'number' ? x.order : i,
        }))
        .filter((x) => x.programName)
      await setSundayProgramDefault(payload, userProfile?.email || userProfile?.displayName || 'unknown')
      setItems(payload.map((x, i) => ({ ...x, localId: `lp-${i}-${String(x.programName || '').slice(0, 20)}` })))
    } catch (e) {
      console.error(e)
      alert('Failed to save program')
    }
    setSaving(false)
  }

  const addRow = () => {
    const name = (form.programName || '').trim()
    if (!name) return
    if (editingId) {
      setItems((prev) =>
        prev.map((x) => (x.localId === editingId ? { ...x, programName: name, order: Number(form.order) || 0 } : x))
      )
      setEditingId(null)
    } else {
      setItems((prev) => [...prev, { programName: name, order: Number(form.order) || prev.length, localId: `new-${Date.now()}` }])
    }
    setForm({ programName: '', order: items.length })
  }

  if (!canManageDepartment('Sunday Ministry')) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">← Sunday Ministry</Link>
        <p className="mt-4">You do not have permission to manage Sunday Program.</p>
      </div>
    )
  }

  const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return (
    <div>
      <DepartmentTabBar slug="sunday-ministry" activeTab="sundayProgram" />
      <div className="space-y-6 p-4 max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-800">Sunday Program</h1>
          <p className="text-sm text-slate-500">Define the default order of service. The Sunday Report page uses this list for timing.</p>
        </div>

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
            <h2 className="font-semibold text-slate-800">Program items</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs text-slate-500 mb-1">Name</label>
                <input
                  type="text"
                  value={form.programName}
                  onChange={(e) => setForm((f) => ({ ...f, programName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  placeholder="Program name"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs text-slate-500 mb-1">Order</label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={addRow}
                disabled={!canEdit}
                className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {editingId ? 'Apply edit' : 'Add Program'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null)
                    setForm({ programName: '', order: sorted.length })
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                >
                  Cancel edit
                </button>
              )}
            </div>

            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {sorted.map((row, idx) => (
                <li key={row.localId || row.programName + idx} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="text-slate-400 w-6">{idx + 1}.</span>
                  <span className="font-medium text-slate-800 flex-1">{row.programName}</span>
                  <span className="text-slate-500 text-xs">order {row.order ?? idx}</span>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(row.localId)
                          setForm({ programName: row.programName, order: row.order ?? idx })
                        }}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((x) => x.localId !== row.localId))}
                        className="text-red-600 hover:underline text-xs"
                      >
                        Remove
                      </button>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const prev = sorted[idx - 1]
                            setItems((list) =>
                              list.map((x) => {
                                if (x.localId === row.localId || x === row) return { ...x, order: prev.order ?? idx - 1 }
                                if (x.localId === prev.localId || x === prev) return { ...x, order: row.order ?? idx }
                                return x
                              })
                            )
                          }}
                          className="text-slate-600 text-xs px-1"
                        >
                          ↑
                        </button>
                      )}
                      {idx < sorted.length - 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = sorted[idx + 1]
                            setItems((list) =>
                              list.map((x) => {
                                if (x.localId === row.localId || x === row) return { ...x, order: next.order ?? idx + 1 }
                                if (x.localId === next.localId || x === next) return { ...x, order: row.order ?? idx }
                                return x
                              })
                            )
                          }}
                          className="text-slate-600 text-xs px-1"
                        >
                          ↓
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>

            {canEdit && (
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={persist}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Update'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={persist}
                  className="px-4 py-2 rounded-lg border border-indigo-600 text-indigo-700 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
                >
                  Set as Default Program
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

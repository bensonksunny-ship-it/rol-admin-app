import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getSundayProgramDefault,
  setSundayProgramDefault,
  pushProgramToSundayReport,
} from '../services/firestore'
import DepartmentTabBar from '../components/DepartmentTabBar'

function nextSunday() {
  const today = new Date()
  const daysUntil = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const d = new Date(today)
  d.setDate(today.getDate() + daysUntil)
  return format(d, 'yyyy-MM-dd')
}

const DEFAULT_SEED = [
  { programName: 'Pre Worship Talk', order: 0 },
  { programName: 'Worship', order: 1 },
  { programName: 'Leader Prayer', order: 2 },
  { programName: 'Announcements', order: 3 },
  { programName: 'Sermon', order: 4 },
  { programName: 'Prayer & Benediction', order: 5 },
]

// ─── Default Program tab ─────────────────────────────────────────────────────

function DefaultProgramTab({ canEdit, userProfile, navigate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushDate, setPushDate] = useState(nextSunday)
  const [pushing, setPushing] = useState(false)
  const [pushSuccess, setPushSuccess] = useState(false)
  const [form, setForm] = useState({ programName: '', order: 1 })
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    setLoading(true)
    getSundayProgramDefault()
      .then((doc) => {
        const list = doc.items?.length ? doc.items : [...DEFAULT_SEED]
        setItems(list.map((x, i) => ({ ...x, localId: `lp-${i}-${String(x.programName || '').slice(0, 20)}` })))
      })
      .catch(() => setItems(DEFAULT_SEED.map((x, i) => ({ ...x, localId: `seed-${i}` }))))
      .finally(() => setLoading(false))
  }, [])

  const persist = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      const payload = [...items]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((x, i) => ({ programName: String(x.programName || '').trim(), order: typeof x.order === 'number' ? x.order : i }))
        .filter((x) => x.programName)
      await setSundayProgramDefault(payload, userProfile?.email || userProfile?.displayName || 'unknown')
      setItems(payload.map((x, i) => ({ ...x, localId: `lp-${i}-${String(x.programName || '').slice(0, 20)}` })))
    } catch (e) {
      console.error(e)
      alert('Failed to save program')
    }
    setSaving(false)
  }

  const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const addRow = () => {
    const name = (form.programName || '').trim()
    if (!name) return
    if (editingId) {
      setItems((prev) => prev.map((x) => (x.localId === editingId ? { ...x, programName: name } : x)))
      setEditingId(null)
      setForm({ programName: '', order: sorted.length + 1 })
      return
    }
    // Insert at the 1-based position the user entered, shifting items at that position and below down
    const pos = Math.max(1, Math.min(sorted.length + 1, Number(form.order) || sorted.length + 1))
    const newItem = { programName: name, order: 0, localId: `new-${Date.now()}` }
    const next = [...sorted]
    next.splice(pos - 1, 0, newItem)
    // Reindex so orders are always 0,1,2,3…
    setItems(next.map((x, i) => ({ ...x, order: i })))
    setForm({ programName: '', order: next.length + 1 })
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
      <h2 className="font-semibold text-slate-800">Program items</h2>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-slate-500 mb-1">Name</label>
          <input type="text" value={form.programName} onChange={(e) => setForm((f) => ({ ...f, programName: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" placeholder="Program name" />
        </div>
        <div className="w-24">
          <label className="block text-xs text-slate-500 mb-1">Position</label>
          <input type="number" min={1} value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) || 1 }))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        </div>
        <button type="button" onClick={addRow} disabled={!canEdit} className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50">{editingId ? 'Apply edit' : 'Add Program'}</button>
        {editingId && <button type="button" onClick={() => { setEditingId(null); setForm({ programName: '', order: sorted.length + 1 }) }} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Cancel edit</button>}
      </div>

      <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
        {sorted.map((row, idx) => (
          <li key={row.localId || row.programName + idx} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="text-slate-400 w-6 font-medium">{idx + 1}.</span>
            <span className="font-medium text-slate-800 flex-1">{row.programName}</span>
            {canEdit && (
              <>
                <button type="button" onClick={() => { setEditingId(row.localId); setForm({ programName: row.programName, order: idx + 1 }) }} className="text-blue-600 hover:underline text-xs">Edit</button>
                <button type="button" onClick={() => {
                  const next = sorted.filter((x) => x.localId !== row.localId).map((x, i) => ({ ...x, order: i }))
                  setItems(next)
                }} className="text-red-600 hover:underline text-xs">Remove</button>
                {idx > 0 && <button type="button" onClick={() => {
                  const next = [...sorted]
                  ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                  setItems(next.map((x, i) => ({ ...x, order: i })))
                }} className="text-slate-600 text-xs px-1">↑</button>}
                {idx < sorted.length - 1 && <button type="button" onClick={() => {
                  const next = [...sorted]
                  ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                  setItems(next.map((x, i) => ({ ...x, order: i })))
                }} className="text-slate-600 text-xs px-1">↓</button>}
              </>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="space-y-3 pt-2">
          <button type="button" disabled={saving} onClick={persist} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : 'Update Default'}</button>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <label className="text-sm text-slate-600 font-medium">Push to Live Control for:</label>
            <input type="date" value={pushDate} onChange={(e) => { setPushDate(e.target.value); setPushSuccess(false) }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
            <button type="button" disabled={pushing || !pushDate} onClick={async () => {
              setPushing(true); setPushSuccess(false)
              try {
                const payload = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x, i) => ({ programName: String(x.programName || '').trim(), order: typeof x.order === 'number' ? x.order : i })).filter((x) => x.programName)
                await pushProgramToSundayReport(pushDate, payload)
                navigate(`/department/sunday-ministry/sunday-report?date=${pushDate}`)
              } catch (e) { console.error(e); alert('Failed to push program') }
              setPushing(false)
            }} className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{pushing ? 'Pushing…' : 'Push to Live Control'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SundayProgram() {
  const { userProfile, canManageDepartment, isCellDirector } = useAuth()
  const navigate = useNavigate()
  const canEdit = canManageDepartment('Sunday Ministry') || isCellDirector

  if (!canManageDepartment('Sunday Ministry') && !isCellDirector) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">← Sunday Ministry</Link>
        <p className="mt-4">You do not have permission to manage Sunday Program.</p>
      </div>
    )
  }

  return (
    <div>
      <DepartmentTabBar slug="sunday-ministry" activeTab="sundayProgram" />
      <div className="space-y-2 p-4 max-w-3xl">
        <h1 className="text-xl font-semibold text-slate-800">Sunday Program</h1>
        <DefaultProgramTab canEdit={canEdit} userProfile={userProfile} navigate={navigate} />
      </div>
    </div>
  )
}

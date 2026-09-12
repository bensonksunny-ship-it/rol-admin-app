import { useEffect, useMemo, useState } from 'react'
import { Search, X, Phone, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getPCSEntries } from '../services/firestore'
import { formatDisplayDate } from '../utils/date'

function Field({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm text-slate-700 mt-0.5">{value}</p>
    </div>
  )
}

// Read-only PCS browser for the First Lady hub — lets the assigned person look up and
// keep track of people in Personal Caring System without any of Caring's edit/remove/
// assignment actions. Pulls straight from getPCSEntries() (already open to any signed-in
// user per firestore.rules) rather than reusing DepartmentHub's PCS tab, which is deeply
// tied to Caring-only editing state.
function PCSViewOnly() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    getPCSEntries().then(setEntries).catch(() => setEntries([])).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.phone || '').toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q)
    )
  }, [entries, search])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-800">PCS — People</h2>
        <span className="text-xs font-semibold text-slate-400">{entries.length} people</span>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No one found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e)}
              className="text-left rounded-lg border border-slate-200 bg-white p-3 hover:border-rose-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {(e.name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{e.name || 'Unnamed'}</p>
                  <p className="text-xs text-slate-400 truncate">{e.phone || e.email || '—'}</p>
                </div>
              </div>
              {e.leadershipPosition && (
                <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                  {e.leadershipPosition}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-b from-rose-600 to-orange-500 px-5 pt-5 pb-4 flex flex-col items-center text-center relative">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute top-3 right-3 text-white/80 hover:text-white"
              >
                <X size={18} />
              </button>
              <div className="w-16 h-16 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center text-2xl font-black text-white mb-2">
                {(selected.name || '?')[0].toUpperCase()}
              </div>
              <p className="text-white font-black text-lg leading-tight">{selected.name || '—'}</p>
              {selected.leadershipPosition && (
                <span className="mt-2 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30">
                  {selected.leadershipPosition}
                </span>
              )}
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Phone" value={selected.phone} />
              <Field label="Email" value={selected.email} />
              <Field label="Date of Birth" value={selected.dob ? formatDisplayDate(selected.dob) : null} />
              <Field label="Nativity" value={selected.nativity} />
              <Field label="Current Place" value={selected.currentPlace} />
              <Field label="How Known" value={selected.howKnown} />
              <Field label="Service Attended" value={selected.serviceAttended} />
              <Field label="First Visit" value={selected.attendedDate ? formatDisplayDate(selected.attendedDate) : null} />
              <Field label="PCS Year" value={selected.year ? String(selected.year) : null} />
              <Field label="Membership Number" value={selected.membershipNumber} />
            </div>
            {(selected.phone || selected.email) && (
              <div className="px-4 pb-4 flex gap-2">
                {selected.phone && (
                  <a href={`tel:${selected.phone}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100">
                    <Phone size={13} /> Call
                  </a>
                )}
                {selected.email && (
                  <a href={`mailto:${selected.email}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-50 text-slate-700 text-xs font-bold hover:bg-slate-100">
                    <Mail size={13} /> Email
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FirstLadyHub() {
  const { hasPermission, isFounder } = useAuth()
  const canAccess = hasPermission('firstLadyHub') || isFounder

  if (!canAccess) {
    return (
      <div className="p-8 text-slate-600">
        You don&apos;t have access to the First Lady hub.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">First Lady</h1>
        <p className="text-slate-500 mt-1">Welcome to your hub.</p>
      </div>

      <PCSViewOnly />
    </div>
  )
}

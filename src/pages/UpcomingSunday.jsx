import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { getSundayProgramDefault, getSundayPlan, getWorshipScheduleByDate } from '../services/firestore'

const DEFAULT_SEED = [
  { programName: 'Pre Worship Talk' },
  { programName: 'Worship' },
  { programName: 'Leader Prayer' },
  { programName: 'Announcements' },
  { programName: 'Sermon' },
  { programName: 'Prayer & Benediction' },
]

function getNextSundayISO() {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? 0 : 7 - day
  const next = new Date(today)
  next.setDate(today.getDate() + diff)
  return format(next, 'yyyy-MM-dd')
}

function formatDisplay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'EEEE, dd MMMM yyyy')
}

export default function UpcomingSunday({ slug }) {
  const sundayDate = getNextSundayISO()

  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [worshipPlan, setWorshipPlan] = useState(null)
  const [isPushed, setIsPushed] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getSundayProgramDefault(),
      getSundayPlan(sundayDate),
    ])
      .then(([defaultDoc, plan]) => {
        const defaults = defaultDoc?.items?.length
          ? defaultDoc.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          : [...DEFAULT_SEED]

        const savedOrder = plan?.programOrder
        if (Array.isArray(savedOrder) && savedOrder.length) {
          const byName = Object.fromEntries(defaults.map((i) => [i.programName, i]))
          const ordered = savedOrder.map((k) => byName[k]).filter(Boolean)
          const savedSet = new Set(savedOrder)
          defaults.forEach((i) => { if (!savedSet.has(i.programName)) ordered.push(i) })
          setPrograms(ordered.map((i) => i.programName))
          setIsPushed(true)
        } else {
          setPrograms(defaults.map((i) => i.programName))
          setIsPushed(false)
        }
      })
      .catch(() => setPrograms(DEFAULT_SEED.map((i) => i.programName)))
      .finally(() => setLoading(false))
  }, [sundayDate])

  useEffect(() => {
    getWorshipScheduleByDate('Worship', sundayDate)
      .then(setWorshipPlan)
      .catch(() => setWorshipPlan(null))
  }, [sundayDate])

  const leadVocals = (worshipPlan?.assignments || [])
    .filter((a) => a.role?.startsWith('Lead Vocal') && (a.songName || a.memberName))
    .sort((a, b) => a.role.localeCompare(b.role))

  return (
    <div className="space-y-4 max-w-lg">

      {/* Header card */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-indigo-100">
        <div style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 60%, #7c3aed 100%)' }} className="px-5 py-4 text-white">
          <p className="text-indigo-200 text-xs uppercase tracking-widest mb-0.5">Upcoming Sunday</p>
          <h2 className="text-lg font-bold">{formatDisplay(sundayDate)}</h2>
          <div className="mt-2">
            {isPushed ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 inline-block" />
                Program confirmed by Sunday Ministry
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-indigo-200 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-300 inline-block" />
                Default program — not yet confirmed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Program list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <span className="text-base">📋</span>
          <h3 className="font-semibold text-slate-800 text-sm">Service Programme</h3>
          <span className="ml-auto text-xs text-slate-400">{programs.length} items</span>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-slate-400 text-sm">Loading…</div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {programs.map((name, idx) => {
              const isWorship = name === 'Worship'
              return (
                <li key={name} className={isWorship ? 'bg-amber-50/60' : ''}>
                  {/* Main row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: isWorship ? '#f59e0b' : '#6366f1',
                      color: '#fff', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {idx + 1}
                    </span>
                    <span className={`font-semibold text-sm flex-1 ${isWorship ? 'text-amber-900' : 'text-slate-800'}`}>
                      {name}
                    </span>
                    {isWorship && (
                      <span className="text-xs text-amber-600 font-medium bg-amber-100 px-2 py-0.5 rounded-full">Worship</span>
                    )}
                  </div>

                  {/* Worship songs sub-rows */}
                  {isWorship && leadVocals.length > 0 && (
                    <div className="border-t border-amber-100">
                      {leadVocals.map((a, si) => (
                        <div
                          key={a.role}
                          className="flex items-center gap-2 px-4 py-2 flex-wrap"
                          style={{ paddingLeft: 52, borderTop: si > 0 ? '1px solid #fef3c7' : 'none', background: '#fffbeb' }}
                        >
                          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg flex-shrink-0">
                            {a.role.replace('Lead Vocal-', 'Lead Vocal ')}
                          </span>
                          {a.songName && (
                            <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">{a.songName}</span>
                          )}
                          {a.key && (
                            <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                              {a.key}
                            </span>
                          )}
                          {a.memberName && (
                            <span className="text-xs text-slate-500">{a.memberName}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

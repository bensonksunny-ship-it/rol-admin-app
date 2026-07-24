import { useEffect, useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { getSundayPlan, getSundayPreServiceEntry } from '../../services/firestore'
import { DigitalBulletin } from '../../pages/SundayPlanning'
import { formatDMY, nextSundayISO } from '../../utils/date'

// Read-only summary of the upcoming Sunday's plan — roles and status across
// departments — reusing the same Digital Bulletin the sidebar's Sunday Plan bubble
// already opens in a modal, just rendered inline instead of behind a popover.
export default function SundayPlanningOverviewCard() {
  const dateISO = nextSundayISO()
  const [plan, setPlan] = useState(null)
  const [preServiceEntry, setPreServiceEntry] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getSundayPlan(dateISO).catch(() => null),
      getSundayPreServiceEntry(dateISO).catch(() => null),
    ]).then(([p, pse]) => {
      if (cancelled) return
      setPlan(p)
      setPreServiceEntry(pse)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dateISO])

  const isPublished = plan?.status === 'published'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
            <CalendarCheck size={18} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">Sunday Plan</p>
            <p className="text-xs text-slate-400">{formatDMY(dateISO)} · Read-only</p>
          </div>
        </div>
        {!loading && (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            isPublished ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {isPublished ? '✓ Published' : 'Not yet published'}
          </span>
        )}
      </div>
      <div className="p-4 max-h-[420px] overflow-y-auto">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Checking…</p>
        ) : isPublished ? (
          <DigitalBulletin plan={plan} preServiceEntry={preServiceEntry} selectedDate={dateISO} />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
            <p className="text-2xl mb-2">📋</p>
            <p className="font-medium text-sm">Not published yet</p>
            <p className="text-xs mt-1">Check back once the Sunday Plan for {formatDMY(dateISO)} is published.</p>
          </div>
        )}
      </div>
    </div>
  )
}

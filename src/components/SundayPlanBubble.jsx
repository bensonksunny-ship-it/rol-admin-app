import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { getSundayPlan, getSundayPreServiceEntry } from '../services/firestore'
import { DigitalBulletin } from '../pages/SundayPlanning'
import { formatDMY, nextSundayISO } from '../utils/date'

function SundayPlanPopover({ isDay, dateISO, loading, isPublished, posStyle, onViewFull }) {
  return (
    <div
      className="w-64 rounded-2xl overflow-hidden"
      style={{
        position: 'fixed',
        zIndex: 9999,
        maxWidth: 'calc(100vw - 24px)',
        background: isDay ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.98)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        border: isDay ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        ...posStyle,
      }}
    >
      <div className={`px-4 py-3 ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>
        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Upcoming Sunday Plan</p>
        <p className="text-sm font-bold mt-0.5">{formatDMY(dateISO)}</p>

        {loading ? (
          <p className={`text-xs mt-2 ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>Checking…</p>
        ) : (
          <>
            <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              isPublished ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {isPublished ? '✓ Published' : 'Not yet published'}
            </span>
            <p className={`text-xs mt-2 leading-relaxed ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
              {isPublished
                ? 'Schedule, roles, and order of service are ready to view.'
                : "The Sunday Plan for this date hasn't been published yet."}
            </p>
          </>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={onViewFull}
          className="mt-3 w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          View Full Plan →
        </button>
      </div>
    </div>
  )
}

// Small round "bubble" trigger in the sidebar — replaces the old dedicated Sunday Plan
// nav link. Click expands a compact popover with this Sunday's status; "View Full Plan"
// opens the same read-only Digital Bulletin used on the (now unlinked) /sunday-planning page.
export default function SundayPlanBubble({ isDay = true }) {
  const dateISO = nextSundayISO()
  const [plan, setPlan] = useState(null)
  const [preServiceEntry, setPreServiceEntry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const wrapRef = useRef(null)

  useLayoutEffect(() => {
    if (!popoverOpen) return
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setPopoverPos({ top: r.bottom + 8, left: Math.min(r.left, window.innerWidth - 272) })
  }, [popoverOpen])

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

  useEffect(() => {
    if (!popoverOpen) return
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setPopoverOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close) }
  }, [popoverOpen])

  const isPublished = plan?.status === 'published'

  return (
    <div className="relative flex-shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        className="relative p-1.5 rounded-lg transition-colors hover:bg-white/10"
        style={{ color: isDay ? '#64748b' : '#94a3b8' }}
        aria-label="Upcoming Sunday Plan"
        title="Upcoming Sunday Plan"
      >
        <CalendarCheck size={18} strokeWidth={1.5} />
        {!loading && isPublished && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
        )}
      </button>

      {popoverOpen && popoverPos && (
        <SundayPlanPopover
          isDay={isDay}
          dateISO={dateISO}
          loading={loading}
          isPublished={isPublished}
          posStyle={popoverPos}
          onViewFull={() => { setPopoverOpen(false); setModalOpen(true) }}
        />
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div className="bg-slate-50 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white rounded-t-3xl flex-shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">Sunday Plan</h3>
                <p className="text-xs text-slate-500 mt-0.5">{formatDMY(dateISO)} · Read-only</p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors text-lg flex-shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1">
              {isPublished ? (
                <DigitalBulletin plan={plan} preServiceEntry={preServiceEntry} selectedDate={dateISO} />
              ) : (
                <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-6 text-center text-slate-400">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="font-medium">Not published yet</p>
                  <p className="text-sm mt-1">Check back once the Sunday Plan for {formatDMY(dateISO)} is published.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

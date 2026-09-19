import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { getSundayPlan, getSundayPreServiceEntry, getWorshipScheduleByDate, getDlightAssignmentsForDate, getMediaScheduleByDate } from '../services/firestore'
import { DigitalBulletin, WorshipPlanSummary, DLitePlanSummary, MediaPlanSummary, SundayMinistryPlanSummary } from '../pages/SundayPlanning'
import { formatDMY, nextSundayISO } from '../utils/date'

const ROSTER_DEPARTMENTS = [
  { key: 'sundayMinistry', label: 'Sunday Ministry' },
  { key: 'worship', label: 'Worship' },
  { key: 'dLite', label: 'D-Light' },
  { key: 'media', label: 'Media' },
  { key: 'riverKids', label: 'River Kids' },
]

// Live cross-department status for dateISO — reads straight from each department's
// own saved assignments (worship_schedule, dlight_assignments, media_schedule) plus
// the River Kids notes already sitting on the sunday_plans doc, rather than gating
// everything on plan.status === 'published'. That flag only reflects a deliberate
// Admin "Confirm & Publish" action, which can lag well behind departments having
// already saved real duty assignments for the date — this gives an always-live
// "who's ready" read instead of a dead "Not published yet" until someone publishes.
function useSundayRosterStatus(dateISO, plan) {
  const [live, setLive] = useState({ loading: true, worship: false, dLite: false, media: false })

  useEffect(() => {
    let cancelled = false
    setLive((s) => ({ ...s, loading: true }))
    Promise.all([
      getWorshipScheduleByDate('Worship', dateISO).catch(() => null),
      getDlightAssignmentsForDate(dateISO).catch(() => null),
      getMediaScheduleByDate(dateISO).catch(() => null),
    ]).then(([worship, dlight, media]) => {
      if (cancelled) return
      const worshipAssigned = (worship?.assignments || []).some((a) => a?.memberName)
      const dLiteAssigned = Object.values(dlight?.assignments || {}).some((v) =>
        Array.isArray(v) ? v.filter(Boolean).length > 0 : !!v
      )
      const mediaAssigned = (media?.assignments || []).some((a) => a?.memberName)
      setLive({ loading: false, worship: worshipAssigned, dLite: dLiteAssigned, media: mediaAssigned })
    })
    return () => { cancelled = true }
  }, [dateISO])

  const riverKidsAssigned = !!(plan?.riverKids?.notes || '').trim()
  // "Assigned" once either someone has typed notes for these sections, or Sunday
  // Ministry has pushed the order of service to Live Control (SundayProgram.jsx's
  // "Push to Live Control" button) — that push is itself Sunday Ministry's concrete
  // action for the date, same signal as Worship/D-Light/Media saving assignments.
  const sundayMinistryAssigned = !!(
    (plan?.sundayMinistry?.notes || '').trim() ||
    (plan?.sundayLeader?.notes || '').trim() ||
    (plan?.announcements?.notes || '').trim() ||
    plan?.sundayMinistry?.pushedToLiveControl
  )
  const statusByKey = { ...live, riverKids: riverKidsAssigned, sundayMinistry: sundayMinistryAssigned }
  const departments = ROSTER_DEPARTMENTS.map((d) => ({ ...d, assigned: !!statusByKey[d.key] }))
  const anyAssigned = departments.some((d) => d.assigned)
  return { loading: live.loading, departments, anyAssigned }
}

function DepartmentStatusRow({ label, assigned, loading, isDay }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-xs ${isDay ? 'text-slate-600' : 'text-slate-300'}`}>{label}</span>
      {loading ? (
        <span className={`text-xs ${isDay ? 'text-slate-300' : 'text-slate-500'}`}>…</span>
      ) : (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
          assigned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {assigned ? 'Assigned' : 'Pending'}
        </span>
      )}
    </div>
  )
}

function SundayPlanPopover({ isDay, dateISO, loading, isPublished, roster, posStyle, onViewFull }) {
  const overallLabel = isPublished ? '✓ Published' : roster.anyAssigned ? 'In Progress' : 'Not started'
  const overallClass = isPublished
    ? 'bg-green-100 text-green-700'
    : roster.anyAssigned
      ? 'bg-blue-100 text-blue-700'
      : 'bg-amber-100 text-amber-700'

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
            <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold ${overallClass}`}>
              {overallLabel}
            </span>

            <div className={`mt-2.5 pt-2 border-t divide-y ${isDay ? 'border-slate-100 divide-slate-100' : 'border-white/10 divide-white/10'}`}>
              {roster.departments.map((d) => (
                <DepartmentStatusRow key={d.key} label={d.label} assigned={d.assigned} loading={roster.loading} isDay={isDay} />
              ))}
            </div>
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

// Read-only preview of what's been saved so far, shown when the plan hasn't been
// formally published but at least one department already has real data — replaces
// the dead-end "Not published yet" card for that in-between state.
function LiveRosterPreview({ selectedDate, plan, preServiceEntry }) {
  const riverKidsNotes = (plan?.riverKids?.notes || '').trim()
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
        ⏳ Draft — not officially published yet. Showing what each department has saved so far.
      </div>
      {/* Side by side instead of stacked — the full roster fits one A4 page/screen. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Modal-only display mappings (see WorshipPlanSummary/SundayMinistryPlanSummary
            in SundayPlanning.jsx): Lead Vocal-4 shows as "Altar Call Worship" here, and
            its assignee also appears as the Intercessory Prayer leader. Scoped to this
            modal only via the opt-in props — the standalone /sunday-planning page and
            Worship's own Assign tab are unaffected. */}
        <SundayMinistryPlanSummary plan={plan} preServiceEntry={preServiceEntry} selectedDate={selectedDate} showIntercessoryPrayer />
        <WorshipPlanSummary selectedDate={selectedDate} altarCallMapping />
        <DLitePlanSummary selectedDate={selectedDate} />
        <MediaPlanSummary selectedDate={selectedDate} />
        <div className="bg-white rounded-xl border border-teal-200 border-l-4 border-l-teal-500 p-2.5 shadow-sm">
          <h3 className="font-semibold text-teal-900 text-sm mb-1">River Kids</h3>
          {riverKidsNotes ? (
            <p className="text-slate-700 whitespace-pre-wrap text-xs leading-relaxed">{riverKidsNotes}</p>
          ) : (
            <p className="text-slate-400 italic text-xs">No notes saved yet.</p>
          )}
        </div>
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
  const roster = useSundayRosterStatus(dateISO, plan)

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
  const hasAnyPlan = isPublished || roster.anyAssigned

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
        {!loading && !roster.loading && hasAnyPlan && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
        )}
      </button>

      {popoverOpen && popoverPos && (
        <SundayPlanPopover
          isDay={isDay}
          dateISO={dateISO}
          loading={loading || roster.loading}
          isPublished={isPublished}
          roster={roster}
          posStyle={popoverPos}
          onViewFull={() => { setPopoverOpen(false); setModalOpen(true) }}
        />
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center print:static print:bg-white print:p-0"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          {/* A4-proportioned container — wide enough for a 2-column department grid
              and capped in height so the whole plan fits one screen/page without
              scrolling; the same box works as the printable/exportable surface. */}
          <div className="bg-slate-50 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-4xl max-h-[90vh] flex flex-col shadow-2xl print:max-h-none print:w-[210mm] print:mx-auto print:shadow-none print:rounded-none">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white rounded-t-3xl flex-shrink-0 print:hidden">
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
            <div className="overflow-y-auto p-4 flex-1 print:overflow-visible print:p-[10mm]">
              {isPublished ? (
                <DigitalBulletin plan={plan} preServiceEntry={preServiceEntry} selectedDate={dateISO} modalMappings />
              ) : roster.anyAssigned ? (
                <LiveRosterPreview selectedDate={dateISO} plan={plan} preServiceEntry={preServiceEntry} />
              ) : (
                <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-6 text-center text-slate-400">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="font-medium">Nothing saved yet</p>
                  <p className="text-sm mt-1">No department has entered their Sunday plan yet for {formatDMY(dateISO)}.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

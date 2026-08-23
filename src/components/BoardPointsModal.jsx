import { useState, useEffect } from 'react'
import { addBoardPoint, getBoardPoints, getBoardMeeting } from '../services/firestore'

function nextSundayISO() {
  const now = new Date()
  const day = now.getDay()
  const daysTo = day === 0 ? 0 : 7 - day
  const d = new Date(now)
  d.setDate(now.getDate() + daysTo)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function labelDate(iso) {
  const d = new Date(iso + 'T12:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// `meetingId` (optional) scopes this modal to one scheduled sec_core_board_meetings
// instance — used when opened from a "Board Meeting: {title}" notification or the
// BoardMeetingWorkspaceWidget's Submit Point action. Points get a meetingId in
// addition to meetingDate, and the submitted-points list only shows this meeting's
// points instead of the department's whole backlog. Without it, behaves exactly as
// before (WorkspaceHeader's generic "Director Board" entry point — next Sunday).
export default function BoardPointsModal({ department, userEmail, userId = '', displayName = '', meetingId = null, onClose }) {
  const [points,     setPoints]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [point,      setPoint]      = useState('')
  const [timeNeeded, setTimeNeeded] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [meeting,    setMeeting]    = useState(null)

  useEffect(() => {
    if (!meetingId) { setMeeting(null); return }
    getBoardMeeting(meetingId).then(setMeeting).catch(() => setMeeting(null))
  }, [meetingId])

  const targetSunday = meeting?.date || nextSundayISO()
  const sundayLabel  = labelDate(targetSunday)
  const meetingBadge = meeting?.title ? meeting.title : `For Sunday ${sundayLabel}`

  useEffect(() => {
    if (!department) { setLoading(false); return }
    getBoardPoints(department)
      .then((pts) => setPoints(meetingId ? pts.filter((p) => p.meetingId === meetingId) : pts))
      .catch(() => setPoints([]))
      .finally(() => setLoading(false))
  }, [department, meetingId])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const handleSubmit = async () => {
    if (!point.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const slNo = String(points.length + 1)
      const id = await addBoardPoint({
        department,
        slNo,
        point: point.trim(),
        timeNeeded: timeNeeded.trim(),
        meetingDate: targetSunday,
        meetingId: meetingId || '',
        // `createdBy` stays an email string — every other write in the app
        // (DeptExpenseTab, CellDirectorCockpit, DepartmentHub, etc.) uses that same
        // convention, and other screens display/match on it as such. `createdByUid`/
        // `authorName` are additive audit fields, not a replacement.
        createdBy: userEmail || 'unknown',
        createdByUid: userId || '',
        authorName: displayName || '',
      })
      if (id) {
        setPoints(prev => [...prev, {
          id, department, slNo,
          point: point.trim(),
          timeNeeded: timeNeeded.trim(),
          meetingDate: targetSunday,
          meetingId: meetingId || '',
          status: 'pending', allottedTime: '',
        }])
        setPoint('')
        setTimeNeeded('')
      } else {
        setError('Could not save — please try again.')
      }
    } catch (e) {
      // Firestore's own permission-denied message is a raw SDK string that isn't
      // useful to a non-technical user — swap in guidance pointing at the actual
      // cause (their account isn't allowed to submit under this department) instead
      // of surfacing the SDK's wording verbatim.
      const isPermissionError = e?.code === 'permission-denied'
        || /insufficient permissions|permission.denied/i.test(e?.message || '')
      setError(
        isPermissionError
          ? `You don't have permission to submit a point for ${department || 'this department'}. Contact Sec-Core if this seems wrong.`
          : 'Submission failed: ' + (e?.message || 'Unknown error')
      )
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = point.trim().length > 0 && !submitting

  return (
    <>
      {/* Backdrop — opaque enough that no page content underneath (workspace
          greeting, a floating assignment banner, etc.) can visually bleed through.
          z-[9998]/[9999] below intentionally sit far above every other fixed-position
          layer in the app (mobile top bar tops out at z-50, the mobile department
          dock at z-40), so this modal always wins regardless of where it's opened
          from. */}
      <div
        className="fixed inset-0 bg-black/70 z-[9998]"
        onClick={onClose}
      />

      {/* Centered modal — the outer wrapper reserves the safe-area inset (notch/
          Dynamic Island) as extra top/bottom padding, not just a flat p-4, so a
          tall card (many submitted points + the add-point form) centered against
          the full viewport can never grow up into it. */}
      <div
        className="fixed inset-0 flex items-center justify-center px-4 z-[9999]"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div
          className="animate-folder-zoom-in max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: '85vh' }}
          onClick={e => e.stopPropagation()}
        >

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Board Meeting Points</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {loading ? 'Loading…' : `${points.length} point${points.length !== 1 ? 's' : ''} submitted · ${department || '—'}${meeting ? ` · ${sundayLabel}` : ''}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-xl flex-shrink-0 transition-colors"
            >×</button>
          </div>

          {/* ── Submitted points list ── */}
          {!loading && points.length > 0 && (
            <div className="overflow-y-auto flex-shrink-0" style={{ maxHeight: 160 }}>
              {points.map((bp, idx) => (
                <div key={bp.id} className="flex gap-2 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800/70">
                  <span className="text-xs text-slate-300 dark:text-slate-600 flex-shrink-0 pt-0.5 w-4">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{bp.point}</p>
                    <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                      {bp.timeNeeded && <span className="text-[10px] text-slate-400 dark:text-slate-500">Need: {bp.timeNeeded}</span>}
                      {bp.allottedTime
                        ? <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">Allotted: {bp.allottedTime}</span>
                        : <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">{bp.status}</span>
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Add point form ── */}
          <div className={`px-5 pt-3.5 pb-6 flex-shrink-0 ${points.length > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">New Point</span>
              <span
                className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800 px-3 py-1 rounded-full max-w-[220px] truncate"
                title={meeting?.title ? `${meeting.title} · ${sundayLabel}` : undefined}
              >
                {meetingBadge}
              </span>
            </div>

            <textarea
              value={point}
              onChange={e => setPoint(e.target.value)}
              placeholder="Describe the point to present at the board meeting…"
              rows={3}
              className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm resize-none outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
            <input
              type="text"
              value={timeNeeded}
              onChange={e => setTimeNeeded(e.target.value)}
              placeholder="Time needed (e.g. 10 min)"
              className="w-full p-3 mt-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
            {error && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{error}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="block w-full mt-2.5 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium text-sm shadow-sm active:scale-[0.98] disabled:active:scale-100 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? 'Submitting…' : 'Submit Point'}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}

import { useState, useEffect } from 'react'
import { addBoardPoint, getBoardPoints } from '../services/firestore'

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

export default function BoardPointsModal({ department, userEmail, onClose }) {
  const [points,     setPoints]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [point,      setPoint]      = useState('')
  const [timeNeeded, setTimeNeeded] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  const targetSunday = nextSundayISO()
  const sundayLabel  = labelDate(targetSunday)

  useEffect(() => {
    if (!department) { setLoading(false); return }
    getBoardPoints(department)
      .then(setPoints)
      .catch(() => setPoints([]))
      .finally(() => setLoading(false))
  }, [department])

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
        createdBy: userEmail || 'unknown',
      })
      if (id) {
        setPoints(prev => [...prev, {
          id, department, slNo,
          point: point.trim(),
          timeNeeded: timeNeeded.trim(),
          meetingDate: targetSunday,
          status: 'pending', allottedTime: '',
        }])
        setPoint('')
        setTimeNeeded('')
      } else {
        setError('Could not save — please try again.')
      }
    } catch (e) {
      setError('Submission failed: ' + (e?.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = point.trim().length > 0 && !submitting

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/55 z-[9998]"
        onClick={onClose}
      />

      {/* Centered modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4 z-[9999]">
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
                {loading ? 'Loading…' : `${points.length} point${points.length !== 1 ? 's' : ''} submitted · ${department || '—'}`}
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
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800 px-3 py-1 rounded-full">
                For Sunday {sundayLabel}
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

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getCellReportsByCell } from '../../services/firestore'
import { isRealCellReportSubmission, totalAttendanceFromCellReport } from '../../utils/cellWeek'
import { isoToDMY } from '../../utils/date'

const HISTORY_COUNT = 10

/**
 * Cell Groups tab → click a cell card: name, leader, meeting day, the active
 * roster and the last 10 submitted meetings' attendance with simple stats.
 * `members` is the cell's active roster (already filtered by the caller).
 * `onManage` (optional) opens the in-page management view (edit cell, add /
 * edit members) the card used to expand into.
 */
export default function CellDetailsModal({ cell, members, onClose, onManage }) {
  const [reports, setReports] = useState(null) // null = loading
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    getCellReportsByCell(cell.id)
      .then((rows) => { if (!cancelled) setReports(rows.filter(isRealCellReportSubmission).slice(0, HISTORY_COUNT)) })
      .catch(() => { if (!cancelled) setReports([]) })
    return () => { cancelled = true }
  }, [cell.id])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const stats = useMemo(() => {
    if (!reports?.length) return null
    const totals = reports.map(totalAttendanceFromCellReport)
    return {
      meetings: reports.length,
      avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
      best: Math.max(...totals),
      last: reports[0].reportDate,
    }
  }, [reports])
  const maxTotal = stats?.best || 1

  const roster = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...members]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .filter((m) => !needle || [m.name, m.phone, m.locality].some((v) => String(v || '').toLowerCase().includes(needle)))
  }, [members, q])

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={`${cell.cellName || 'Cell'} details`}
        className="bg-white w-full sm:max-w-4xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-start gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 truncate">{cell.cellName || 'Unnamed cell'}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Leader: <b className="text-slate-700">{cell.leader || '—'}</b>
              <span className="mx-2 text-slate-300">·</span>
              Meets: <b className="text-slate-700">{cell.meetingDay || '—'}</b>
            </p>
          </div>
          {onManage && (
            <button type="button" onClick={onManage}
              className="hidden sm:inline-flex px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200">
              Manage cell
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-xl flex-shrink-0">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Members" value={members.length} tone="bg-blue-600" />
            <Stat label="Avg attendance" value={reports === null ? '—' : stats ? stats.avg : 0} tone="bg-emerald-600" />
            <Stat label="Best attendance" value={reports === null ? '—' : stats ? stats.best : 0} tone="bg-violet-600" />
            <Stat label="Last meeting" value={reports === null ? '—' : stats ? isoToDMY(stats.last) : 'None'} tone="bg-amber-500" small />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Roster */}
            <section>
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Members ({members.length})</h3>
              </div>
              {members.length > 6 && (
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or area"
                  className="w-full mb-2 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              )}
              {roster.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">{members.length ? 'No match.' : 'No active members yet.'}</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
                  {roster.map((m) => (
                    <li key={m.id || m.name} className="px-3 py-2.5 flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                        {String(m.name || '?')[0].toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{m.name || '—'}</p>
                        {(m.locality || m.since) && (
                          <p className="text-xs text-slate-500 truncate">{[m.locality, m.since && `Since ${isoToDMY(m.since)}`].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                      {m.phone && <a href={`tel:${m.phone}`} className="text-xs font-semibold text-blue-600 hover:underline flex-shrink-0">{m.phone}</a>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Attendance history */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Recent meetings</h3>
              {reports === null ? (
                <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>
              ) : reports.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No submitted reports yet.</p>
              ) : (
                <ul className="space-y-2">
                  {reports.map((r) => {
                    const total = totalAttendanceFromCellReport(r)
                    return (
                      <li key={r.id} className="border border-slate-100 rounded-2xl px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-slate-800 tabular-nums">{isoToDMY(r.reportDate)}</p>
                          <p className="text-lg font-black text-slate-900 tabular-nums">{total}</p>
                        </div>
                        <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((total / maxTotal) * 100)}%` }} />
                        </div>
                        <p className="text-xs text-slate-500 mt-1.5">
                          {r.membersAttended} members · {r.visitors} visitors · {r.children} children
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          {onManage && (
            <button type="button" onClick={onManage}
              className="sm:hidden w-full min-h-[44px] rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200">
              Manage cell
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function Stat({ label, value, tone, small }) {
  return (
    <div className={`${tone} text-white rounded-2xl p-4`}>
      <p className={`${small ? 'text-xl sm:text-2xl' : 'text-3xl sm:text-4xl'} font-black leading-none tabular-nums`}>{value}</p>
      <p className="text-sm font-bold mt-2 opacity-90">{label}</p>
    </div>
  )
}

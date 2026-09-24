import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronRight, X } from 'lucide-react'
import {
  getSundayReportSummaries, getDelightVisitors, getCellGroups, getLatestCellReports,
} from '../../services/firestore'
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, endOfWeek, isThisMonth } from 'date-fns'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const range = payload[0]?.payload?.range
  return (
    <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
      {label && <p className="text-slate-400 mb-1">{label}{range ? ` · ${range}` : ''}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {p.value?.toLocaleString?.() ?? p.value}
        </p>
      ))}
      <p className="text-[10px] text-slate-400 mt-1">Click for details</p>
    </div>
  )
}

// Drill-down sheet shared by all three cards — same Escape/backdrop-click-to-close
// behavior as EdenGardenGrid's DepartmentOverlay. `link` sends the Founder on to the
// full filtered page that owns the underlying data.
function DrillDownModal({ title, subtitle, link, onClose, children }) {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6 bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg max-h-[85vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div>
            <p className="text-base font-bold text-slate-800">{title}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {link && (
          <div className="px-5 py-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { onClose(); navigate(link.to) }}
              className="w-full flex items-center justify-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800 py-2 rounded-xl hover:bg-indigo-50 transition-colors"
            >
              {link.label} <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function EmptyRow({ children }) {
  return <p className="text-sm text-slate-400 text-center py-8">{children}</p>
}

function VisitorList({ visitors }) {
  if (!visitors.length) return <EmptyRow>No visitors recorded in this period.</EmptyRow>
  const sorted = [...visitors].sort((a, b) => String(b.attendedDate).localeCompare(String(a.attendedDate)))
  return (
    <ul className="divide-y divide-slate-100">
      {sorted.map(v => (
        <li key={v.id} className="py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-700 truncate">{v.name || 'Unnamed visitor'}</p>
            <p className="text-xs text-slate-400 truncate">
              {[v.serviceAttended, v.currentPlace, v.phone].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <span className="shrink-0 text-xs text-slate-500">
            {v.attendedDate ? format(new Date(v.attendedDate), 'd MMM') : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

function CountRow({ label, value, sub }) {
  return (
    <li className="py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{label}</p>
        {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
      </div>
      <span className="shrink-0 text-sm font-bold text-slate-800 tabular-nums">{Number(value || 0).toLocaleString()}</span>
    </li>
  )
}

function SundayBreakdown({ sunday, cellNameById }) {
  if (!sunday) return <EmptyRow>No Sunday service recorded yet.</EmptyRow>
  const cellRows = Object.entries(sunday.sundayCellAttendance || {})
    .map(([cellId, names]) => ({
      cellId,
      name: cellNameById[cellId] || 'Unknown cell',
      count: Array.isArray(names) ? names.filter(Boolean).length : 0,
    }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
  const cellTotal = cellRows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Adults</p>
        <ul className="divide-y divide-slate-100">
          <CountRow label="Cell members" value={cellTotal} sub={`${cellRows.length} cell${cellRows.length === 1 ? '' : 's'} represented`} />
          <CountRow label="Newcomers" value={sunday.newcomers} />
          <CountRow label="Second-week attendees" value={sunday.secondWeekAttendees} />
          <CountRow label="Non-cell" value={sunday.nonCellCount} />
          <CountRow label="Pastoral" value={sunday.pastoralCount} />
          <CountRow label="Others" value={sunday.othersCount} />
        </ul>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Children</p>
        <ul className="divide-y divide-slate-100">
          <CountRow label="Sunday School" value={sunday.sundaySchool} />
          <CountRow label="River Kids" value={sunday.riverKidsCount} />
        </ul>
      </div>
      {cellRows.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Cell members by cell</p>
          <ul className="divide-y divide-slate-100">
            {cellRows.map(r => <CountRow key={r.cellId} label={r.name} value={r.count} />)}
          </ul>
        </div>
      )}
      <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2.5">
        <span className="text-sm font-bold text-indigo-700">Total</span>
        <span className="text-sm font-black text-indigo-700 tabular-nums">{sunday.totalAttendance.toLocaleString()}</span>
      </div>
    </div>
  )
}

function CellBreakdown({ reported, missing }) {
  if (!reported.length && !missing.length) return <EmptyRow>No active cells found.</EmptyRow>
  return (
    <div className="space-y-4">
      {reported.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {reported.map(r => (
            <CountRow
              key={r.cellId}
              label={r.cellName || 'Unnamed cell'}
              value={r.membersAttended}
              sub={[
                r.reportDate ? format(new Date(r.reportDate + 'T12:00:00'), 'd MMM yyyy') : null,
                r.visitors ? `${r.visitors} visitor${r.visitors === 1 ? '' : 's'}` : null,
                r.children ? `${r.children} child${r.children === 1 ? '' : 'ren'}` : null,
              ].filter(Boolean).join(' · ')}
            />
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-500">No report yet</p>
          <ul className="divide-y divide-slate-100">
            {missing.map(c => (
              <li key={c.id} className="py-2 text-sm text-slate-500">{c.cellName || 'Unnamed cell'}{c.leader ? ` · ${c.leader}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Clickable summary tile — hover lift/outline signals it opens a breakdown.
const CLICKABLE_CARD =
  'group text-left w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 cursor-pointer ' +
  'transition-all duration-150 hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'

function CardHint() {
  return (
    <span className="mt-3 inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-400 group-hover:text-indigo-600 transition-colors">
      View breakdown <ChevronRight size={12} />
    </span>
  )
}

// Three stat cards a Founder actually wants at a glance — replaces the earlier
// full church-wide analytics panel (stat tiles, finance charts, payout review,
// activity lists), which felt cluttered on the landing page. Visitors of the
// Month, Total Attendance (Last Sunday), and Total Cell Attendance only.
// Each card (and each visitor bar) opens a DrillDownModal with the rows behind the
// number, plus a link through to the owning department page.
export default function FounderInsightsPanel() {
  const [visitors, setVisitors] = useState([])
  const [lastSunday, setLastSunday] = useState(null)
  const [cells, setCells] = useState([])
  const [cellReports, setCellReports] = useState([])
  const [loading, setLoading] = useState(true)
  // { kind: 'visitors', weekIdx: number|null } | { kind: 'sunday' } | { kind: 'cell' } | null
  const [drill, setDrill] = useState(null)

  useEffect(() => {
    Promise.all([
      getDelightVisitors(),
      getSundayReportSummaries(1),
      getCellGroups('Cell'),
      getLatestCellReports(200),
    ]).then(([vis, sundaySummaries, cellGroups, reports]) => {
      setVisitors(vis)
      setLastSunday(sundaySummaries[0] || null)
      setCells(cellGroups)
      setCellReports(reports)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">Loading insights…</p>
        </div>
      </div>
    )
  }

  const activeCells = cells.filter(c => c.status !== 'inactive')
  const activeCellIds = new Set(activeCells.map(c => c.id))
  const latestPerCell = {}
  cellReports.forEach(r => {
    if (!activeCellIds.has(r.cellId)) return
    if (!latestPerCell[r.cellId] || r.reportDate > latestPerCell[r.cellId].reportDate) {
      latestPerCell[r.cellId] = r
    }
  })
  const reportedCells = Object.values(latestPerCell).sort((a, b) => b.membersAttended - a.membersAttended)
  const cellAttendance = {
    total: reportedCells.reduce((s, r) => s + (r.membersAttended || 0), 0),
    cellCount: reportedCells.length,
  }
  const cellsWithoutReport = activeCells.filter(c => !latestPerCell[c.id])
  // sundayCellAttendance is keyed by either the doc id or the legacy cellId field.
  const cellNameById = {}
  cells.forEach(c => { cellNameById[c.id] = c.cellName; cellNameById[c.cellId] = c.cellName })

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const visitorsThisMonth = visitors.filter(v => v.attendedDate && isThisMonth(new Date(v.attendedDate)))

  const weekStarts = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 })
  const visitorsByWeek = weekStarts.map((wStart, idx) => {
    const wEnd = endOfWeek(wStart, { weekStartsOn: 1 })
    const clampedStart = wStart < monthStart ? monthStart : wStart
    const clampedEnd = wEnd > monthEnd ? monthEnd : wEnd
    const list = visitorsThisMonth.filter(v => {
      const d = new Date(v.attendedDate)
      return d >= clampedStart && d <= clampedEnd
    })
    return {
      week: `Wk ${idx + 1}`,
      range: `${format(clampedStart, 'd MMM')} – ${format(clampedEnd, 'd MMM')}`,
      Visitors: list.length,
      list,
    }
  })

  // Chart-level click so the whole column band is a hit target (zero-count weeks
  // have no visible bar to click). Recharts 3 may report the index as a string.
  const onVisitorChartClick = (state) => {
    const idx = Number(state?.activeTooltipIndex ?? state?.activeIndex)
    if (Number.isInteger(idx) && visitorsByWeek[idx]) setDrill({ kind: 'visitors', weekIdx: idx })
  }

  const closeDrill = () => setDrill(null)
  const drillWeek = drill?.kind === 'visitors' && drill.weekIdx != null ? visitorsByWeek[drill.weekIdx] : null

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

      {/* Visitors of the Month — header opens the full month, each bar opens its week */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 transition-shadow hover:shadow-md">
        <button
          type="button"
          onClick={() => setDrill({ kind: 'visitors', weekIdx: null })}
          className="group w-full flex items-center justify-between mb-4 text-left rounded-lg -m-1 p-1 cursor-pointer hover:bg-teal-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 transition-colors"
        >
          <div>
            <p className="text-sm font-bold text-slate-800 group-hover:text-teal-700 transition-colors">Visitors of the Month</p>
            <p className="text-xs text-slate-400">{format(now, 'MMMM yyyy')}</p>
          </div>
          <span className="inline-flex items-center gap-0.5 text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-600 font-semibold group-hover:bg-teal-100 transition-colors">
            {visitorsThisMonth.length} total <ChevronRight size={12} />
          </span>
        </button>
        <div className="[&_.recharts-surface]:cursor-pointer">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={visitorsByWeek} onClick={onVisitorChartClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(20,184,166,0.08)', radius: 6 }} />
              <Bar
                dataKey="Visitors"
                fill="#14b8a6"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                activeBar={{ fill: '#0d9488', stroke: '#0f766e', strokeWidth: 1 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Total Attendance — Last Sunday */}
      <button type="button" onClick={() => setDrill({ kind: 'sunday' })} className={`${CLICKABLE_CARD} flex flex-col justify-between`}>
        <div>
          <p className="text-sm font-bold text-slate-800">Total Attendance</p>
          <p className="text-xs text-slate-400">
            {lastSunday?.date ? `Last Sunday · ${format(new Date(lastSunday.date + 'T12:00:00'), 'd MMM yyyy')}` : 'No service recorded yet'}
          </p>
        </div>
        <div>
          <p className="text-4xl font-black text-indigo-700 mt-6">
            {(lastSunday?.totalAttendance || 0).toLocaleString()}
          </p>
          <CardHint />
        </div>
      </button>

      {/* Total Cell Attendance */}
      <button type="button" onClick={() => setDrill({ kind: 'cell' })} className={`${CLICKABLE_CARD} flex flex-col justify-between`}>
        <div>
          <p className="text-sm font-bold text-slate-800">Total Cell Attendance</p>
          <p className="text-xs text-slate-400">Latest report per active cell · {cellAttendance.cellCount} cell{cellAttendance.cellCount === 1 ? '' : 's'} reporting</p>
        </div>
        <div>
          <p className="text-4xl font-black text-emerald-700 mt-6">
            {cellAttendance.total.toLocaleString()}
          </p>
          <CardHint />
        </div>
      </button>

      {drill?.kind === 'visitors' && (
        <DrillDownModal
          title={drillWeek ? `Visitors · ${drillWeek.week}` : 'Visitors of the Month'}
          subtitle={`${drillWeek ? drillWeek.range : format(now, 'MMMM yyyy')} · ${(drillWeek ? drillWeek.list : visitorsThisMonth).length} visitor${(drillWeek ? drillWeek.list : visitorsThisMonth).length === 1 ? '' : 's'}`}
          link={{ label: 'Open D Light visitors', to: '/department/d-light?tab=visitorEntry' }}
          onClose={closeDrill}
        >
          <VisitorList visitors={drillWeek ? drillWeek.list : visitorsThisMonth} />
        </DrillDownModal>
      )}

      {drill?.kind === 'sunday' && (
        <DrillDownModal
          title="Sunday Attendance Breakdown"
          subtitle={lastSunday?.date ? format(new Date(lastSunday.date + 'T12:00:00'), 'EEEE, d MMM yyyy') : undefined}
          link={{ label: 'Open Sunday reports', to: '/department/sunday-ministry/reports' }}
          onClose={closeDrill}
        >
          <SundayBreakdown sunday={lastSunday} cellNameById={cellNameById} />
        </DrillDownModal>
      )}

      {drill?.kind === 'cell' && (
        <DrillDownModal
          title="Cell Attendance by Cell"
          subtitle={`${cellAttendance.total.toLocaleString()} members · ${cellAttendance.cellCount} of ${activeCells.length} active cells reporting`}
          link={{ label: 'Open cell reports', to: '/department/cell?tab=reports' }}
          onClose={closeDrill}
        >
          <CellBreakdown reported={reportedCells} missing={cellsWithoutReport} />
        </DrillDownModal>
      )}

    </div>
  )
}

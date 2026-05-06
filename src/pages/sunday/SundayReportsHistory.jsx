import { useEffect, useState, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { getSundayReportSummaries, deleteSundayReport, getCellGroups } from '../../services/firestore'
import { formatDisplayDate } from '../../utils/date'
import { useAuth } from '../../context/AuthContext'
import DepartmentTabBar from '../../components/DepartmentTabBar'

const FIXED_COLS = [
  { key: 'othersCount',         label: 'Others'       },
  { key: 'sundaySchool',        label: 'Sun. School'  },
  { key: 'secondWeekAttendees', label: '2nd Week'     },
  { key: 'newcomers',           label: 'New Comers'   },
  { key: 'totalAdults',         label: 'Total Adults' },
  { key: 'totalAttendance',     label: 'Total'        },
]

function formatTime(isoString) {
  try { return format(parseISO(isoString), 'h:mm a') } catch { return isoString }
}

function Td({ value }) {
  return (
    <td className="px-3 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
      {value !== '' && value != null && value !== 0 ? value : '—'}
    </td>
  )
}

function KebabMenu({ onEdit, onDelete, canEdit, canDelete, deleting }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition"
        aria-label="Actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[120px] bg-white rounded-xl shadow-lg border border-slate-200 py-1 overflow-hidden">
          {canEdit && (
            <button
              type="button"
              onClick={() => { setOpen(false); onEdit() }}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => { setOpen(false); onDelete() }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function SundayReportsHistory() {
  const { isFounder, canManageDepartment } = useAuth()
  const navigate = useNavigate()

  const canEdit   = canManageDepartment('Sunday Ministry')
  const canDelete = isFounder

  const [rows, setRows]             = useState([])
  const [cellGroups, setCellGroups] = useState([])
  const [loading, setLoading]       = useState(true)
  const [expandedDate, setExpanded] = useState(null)
  const [deletingDate, setDeleting] = useState(null)

  useEffect(() => {
    getCellGroups('Cell')
      .then((gs) => setCellGroups((gs || []).filter((g) => g.status !== 'inactive')))
      .catch(() => setCellGroups([]))
  }, [])

  const loadRows = () => {
    setLoading(true)
    getSundayReportSummaries(12)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadRows() }, [])

  const handleDelete = async (date) => {
    if (!window.confirm(`Delete the report for ${formatDisplayDate(date)}? This cannot be undone.`)) return
    setDeleting(date)
    try {
      await deleteSundayReport(date)
      setRows((prev) => prev.filter((r) => r.date !== date))
    } catch {
      alert('Failed to delete report.')
    }
    setDeleting(null)
  }

  const cellCols = useMemo(
    () => cellGroups.map((g) => ({ id: g.id, name: g.cellName || 'Unnamed' })),
    [cellGroups]
  )

  return (
    <div>
      <DepartmentTabBar slug="sunday-ministry" activeTab="sundayReportsHistory" />
      <div className="p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Sunday Reports</h2>
          <p className="text-sm text-slate-500 mt-0.5">Summary figures from the last 12 saved reports.</p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-500">
            <p>No reports found.</p>
            <Link
              to="/department/sunday-ministry/sunday-report"
              className="mt-2 inline-block text-indigo-600 hover:underline"
            >
              Go to Live Control to enter this week's report →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-3 font-medium whitespace-nowrap text-left sticky left-0 bg-slate-50">Date</th>
                  {cellCols.map((c) => (
                    <th key={c.id} className="px-3 py-3 font-medium whitespace-nowrap text-right text-indigo-700">
                      {c.name}
                    </th>
                  ))}
                  {FIXED_COLS.map((c) => (
                    <th key={c.key} className="px-3 py-3 font-medium whitespace-nowrap text-right">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-3 font-medium whitespace-nowrap text-center">Timing</th>
                  {(canEdit || canDelete) && (
                    <th className="px-3 py-3 font-medium whitespace-nowrap text-center w-12"></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isExpanded = expandedDate === row.date
                  const hasTimings = row.programTimings.length > 0
                  const totalCols  = cellCols.length + FIXED_COLS.length + 2 + (canEdit || canDelete ? 1 : 0)
                  const sca        = row.sundayCellAttendance || {}
                  return (
                    <>
                      <tr
                        key={row.date}
                        className={`border-b border-slate-100 ${isExpanded ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap tabular-nums sticky left-0 bg-inherit">
                          {formatDisplayDate(row.date)}
                        </td>
                        {cellCols.map((c) => (
                          <Td key={c.id} value={(sca[c.id] || []).length || ''} />
                        ))}
                        {FIXED_COLS.map((c) => (
                          <Td key={c.key} value={row[c.key]} />
                        ))}
                        <td className="px-3 py-3 text-center">
                          {hasTimings ? (
                            <button
                              type="button"
                              className="text-xs text-indigo-600 hover:underline font-medium"
                              onClick={() => setExpanded(isExpanded ? null : row.date)}
                            >
                              {isExpanded ? 'Hide' : `${row.programTimings.length} items`}
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-2 py-2 text-center">
                            <KebabMenu
                              canEdit={canEdit}
                              canDelete={canDelete}
                              deleting={deletingDate === row.date}
                              onEdit={() => navigate(`/department/sunday-ministry/sunday-report?date=${row.date}`)}
                              onDelete={() => handleDelete(row.date)}
                            />
                          </td>
                        )}
                      </tr>
                      {isExpanded && (
                        <tr key={`${row.date}-timing`} className="bg-indigo-50/30 border-b border-slate-100">
                          <td colSpan={totalCols} className="px-6 py-3">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Program Timing</p>
                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                              {row.programTimings.map((t, i) => (
                                <div key={i} className="text-sm text-slate-700">
                                  <span className="font-medium">{t.programName}</span>
                                  <span className="text-slate-500 ml-1.5">{formatTime(t.startTime)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

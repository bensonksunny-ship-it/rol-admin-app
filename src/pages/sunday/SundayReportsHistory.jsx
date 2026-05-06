import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { getSundayReportSummaries } from '../../services/firestore'
import { formatDisplayDate } from '../../utils/date'
import DepartmentTabBar from '../../components/DepartmentTabBar'

const COLS = [
  { key: 'totalAttendance',          label: 'Total'        },
  { key: 'totalAdults',              label: 'Adults'       },
  { key: 'cellAttendance',           label: 'Cell'         },
  { key: 'newcomers',                label: 'Newcomers'    },
  { key: 'secondWeekAttendees',      label: '2nd Week'     },
  { key: 'riverKids',                label: 'River Kids'   },
  { key: 'totalVolunteers',          label: 'Volunteers'   },
  { key: 'englishServiceAttendance', label: 'English Svc'  },
  { key: 'tamilServiceAttendance',   label: 'Tamil Svc'    },
]

function formatTime(isoString) {
  try {
    return format(parseISO(isoString), 'h:mm a')
  } catch {
    return isoString
  }
}

export default function SundayReportsHistory() {
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [expandedDate, setExpanded] = useState(null)

  useEffect(() => {
    getSundayReportSummaries(12)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

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
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Date</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="px-4 py-3 font-medium whitespace-nowrap text-right">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-center">Timing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isExpanded = expandedDate === row.date
                  const hasTimings = row.programTimings.length > 0
                  return (
                    <>
                      <tr
                        key={row.date}
                        className={`border-b border-slate-100 ${hasTimings ? 'cursor-pointer hover:bg-slate-50' : ''} ${isExpanded ? 'bg-indigo-50/40' : ''}`}
                        onClick={() => hasTimings && setExpanded(isExpanded ? null : row.date)}
                      >
                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap tabular-nums">
                          {formatDisplayDate(row.date)}
                        </td>
                        {COLS.map((c) => (
                          <td key={c.key} className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {row[c.key] !== '' && row[c.key] != null ? row[c.key] : '—'}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center">
                          {hasTimings ? (
                            <button
                              type="button"
                              className="text-xs text-indigo-600 hover:underline font-medium"
                              onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : row.date) }}
                            >
                              {isExpanded ? 'Hide' : `${row.programTimings.length} items`}
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${row.date}-timing`} className="bg-indigo-50/30 border-b border-slate-100">
                          <td colSpan={COLS.length + 2} className="px-6 py-3">
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

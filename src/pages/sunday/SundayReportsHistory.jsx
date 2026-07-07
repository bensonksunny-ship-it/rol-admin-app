import { useEffect, useState, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import * as XLSX from 'xlsx'
import { getSundayReportSummaries, deleteSundayReport, getCellGroups, bulkImportSundayReports } from '../../services/firestore'
import { formatDisplayDate } from '../../utils/date'
import { useAuth } from '../../context/AuthContext'
import DepartmentTabBar from '../../components/DepartmentTabBar'
import SundayReportPrintView from './SundayReportPrintView'

const FIXED_COLS = [
  { key: 'othersCount',         label: 'Others'       },
  { key: 'nonCellCount',        label: 'Non Cell'     },
  { key: 'riverKidsCount',      label: 'River Kids'   },
  { key: 'secondWeekAttendees', label: '2nd Week'     },
  { key: 'newcomers',           label: 'New Comers'   },
  { key: 'totalAdults',         label: 'Total Adults' },
  { key: 'totalAttendance',     label: 'Total'        },
]

// ─── Import helpers ───────────────────────────────────────────────────────────

function normHeader(h) {
  return String(h).toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}

// Fixed column header → field name
const FIXED_HEADER_MAP = {
  date:                    'date',
  others:                  'others',
  sunschool:               'sundaySchool',
  sundayschool:            'sundaySchool',
  sunschl:                 'sundaySchool',
  '2ndweek':               'secondWeekAttendees',
  '2ndweekattendees':      'secondWeekAttendees',
  secondweek:              'secondWeekAttendees',
  secondweekattendees:     'secondWeekAttendees',
  newcomers:               'newcomers',
  newcomer:                'newcomers',
  program:                 'program',
  programs:                'program',
  programname:             'program',
  programnames:            'program',
  timing:                  'timing',
  timings:                 'timing',
  time:                    'timing',
  times:                   'timing',
  starttime:               'timing',
}

function parseDate(val) {
  if (val == null || val === '') return null
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : format(val, 'yyyy-MM-dd')
  }
  const s = String(val).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : format(d, 'yyyy-MM-dd')
}

function cellVal(val) {
  if (val == null || val === '') return ''
  return String(val).trim()
}

function parseTime(timeStr, dateStr) {
  const s = String(timeStr || '').trim()
  if (!s || !dateStr) return null
  const ampm = s.match(/^(\d{1,2})[:\.](\d{2})\s*(am|pm)$/i)
  if (ampm) {
    let h = parseInt(ampm[1])
    const m = ampm[2]
    const pm = ampm[3].toLowerCase() === 'pm'
    if (pm && h < 12) h += 12
    if (!pm && h === 12) h = 0
    return `${dateStr}T${String(h).padStart(2, '0')}:${m}:00`
  }
  const h24 = s.match(/^(\d{1,2})[:\.](\d{2})$/)
  if (h24) return `${dateStr}T${h24[1].padStart(2, '0')}:${h24[2]}:00`
  return null
}

function parseExcelFile(file, cellGroups) {
  const cellNameToId = {}
  ;(cellGroups || []).forEach((cg) => {
    if (cg.cellName) cellNameToId[normHeader(cg.cellName)] = cg.id
  })

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb   = XLSX.read(data, { type: 'array', cellDates: true })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
        if (!raw.length) return resolve({ rows: [], errors: ['Sheet is empty.'], unmatched: [] })

        // Classify column headers
        const colTypes  = {}
        const unmatched = []
        Object.keys(raw[0]).forEach((h) => {
          const n = normHeader(h)
          if (n === 'date') { colTypes[h] = { type: 'date' }; return }
          const fixed = FIXED_HEADER_MAP[n]
          if (fixed) { colTypes[h] = { type: 'fixed', field: fixed }; return }
          const cellId = cellNameToId[n]
          if (cellId) { colTypes[h] = { type: 'cell', cellId }; return }
          unmatched.push(h)
        })

        const dateKey = Object.keys(colTypes).find((k) => colTypes[k].type === 'date')
        if (!dateKey) {
          return resolve({ rows: [], errors: ['No "Date" column found. Make sure the first row has headers.'], unmatched })
        }

        // Group raw rows by date — date on first row of each group (or repeated)
        const groups = []  // [{ date, rawRows: [...] }]
        let current  = null
        raw.forEach((r) => {
          const date = parseDate(r[dateKey])
          if (date) {
            if (current && current.date === date) {
              current.rawRows.push(r)
            } else {
              current = { date, rawRows: [r] }
              groups.push(current)
            }
          } else if (current) {
            current.rawRows.push(r)
          }
        })

        const errors = []
        const rows   = groups.map(({ date, rawRows }) => {
          const row = {
            date,
            sundayCellAttendance: {},
            others: [],
            newcomers: [],
            secondWeekAttendees: [],
            sundaySchool: 0,
            programTimings: [],
          }
          const programNames = []
          const timingStrs   = []

          rawRows.forEach((r) => {
            Object.keys(colTypes).forEach((h) => {
              const col = colTypes[h]
              if (col.type === 'date') return
              const v = cellVal(r[h])

              if (col.type === 'cell') {
                if (!v) return
                if (!row.sundayCellAttendance[col.cellId]) row.sundayCellAttendance[col.cellId] = []
                row.sundayCellAttendance[col.cellId].push(v)
              } else if (col.type === 'fixed') {
                if (col.field === 'sundaySchool') {
                  if (row.sundaySchool === 0 && v) row.sundaySchool = Number(v) || 0
                } else if (col.field === 'others') {
                  if (v) row.others.push(v)
                } else if (col.field === 'newcomers') {
                  if (v) row.newcomers.push(v)
                } else if (col.field === 'secondWeekAttendees') {
                  if (v) row.secondWeekAttendees.push(v)
                } else if (col.field === 'program') {
                  if (v) programNames.push(v)
                } else if (col.field === 'timing') {
                  if (v) timingStrs.push(v)
                }
              }
            })
          })

          row.programTimings = programNames
            .map((name, i) => ({
              programName: name,
              startTime: parseTime(timingStrs[i], date) || `${date}T00:00:00`,
            }))
            .filter((p) => p.programName)

          return row
        })

        resolve({ rows, errors, unmatched })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file.'))
    reader.readAsArrayBuffer(file)
  })
}

function downloadTemplate(cellGroups) {
  const cellCols = (cellGroups || []).map((cg) => cg.cellName || 'Cell')
  const headers  = ['Date', ...cellCols, 'Others', 'Sun. School', '2nd Week', 'New Comers', 'Program', 'Timing']

  // Build example rows: date on first row only, names stacked below
  const makeGroup = (date, names, others, school, week2, newcomer, programs, timings) => {
    const maxRows = Math.max(names.length, programs.length, 1)
    return Array.from({ length: maxRows }, (_, i) => [
      i === 0 ? date : '',
      ...cellCols.map(() => names[i] || ''),
      others[i] || '',
      i === 0 ? school : '',
      week2[i] || '',
      newcomer[i] || '',
      programs[i] || '',
      timings[i] || '',
    ])
  }

  const group1 = makeGroup(
    '2024-01-07',
    ['John Doe', 'Jane Smith', 'Bob'],
    ['Mike', 'Sara'],
    20,
    ['Chris Lee'],
    ['Lisa Ray'],
    ['Pre Worship Talk', 'Worship', 'Sermon'],
    ['9:00 AM', '9:15 AM', '10:30 AM'],
  )
  const group2 = makeGroup(
    '2024-01-14',
    ['Alice Bob', 'Dave'],
    ['Tom'],
    18,
    [],
    ['David'],
    ['Worship', 'Sermon'],
    ['9:10 AM', '10:00 AM'],
  )

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...group1, ...group2])
  ws['!cols'] = headers.map((h) =>
    h === 'Date' ? { wch: 12 } : h === 'Program' || h === 'Timing' ? { wch: 20 } : { wch: 18 }
  )
  XLSX.utils.book_append_sheet(wb, ws, 'Sunday Reports')
  XLSX.writeFile(wb, 'sunday-reports-template.xlsx')
}

// ─── Computed preview totals ──────────────────────────────────────────────────

function rowTotals(row) {
  const cellCount = Object.values(row.sundayCellAttendance || {})
    .reduce((s, a) => s + (Array.isArray(a) ? a.filter(Boolean).length : 0), 0)
  const others    = (row.others || []).filter(Boolean).length
  const newcomers = (row.newcomers || []).filter(Boolean).length
  const secondWk  = (row.secondWeekAttendees || []).filter(Boolean).length
  const totalAdults = cellCount + others + newcomers + secondWk
  return { cellCount, others, newcomers, secondWk, totalAdults, total: totalAdults + (row.sundaySchool || 0) }
}

// ─── Import panel ─────────────────────────────────────────────────────────────

function ImportPanel({ onClose, onImported, importedBy, cellGroups }) {
  const [parsedRows, setParsedRows]     = useState(null)
  const [parseErrors, setParseErrors]   = useState([])
  const [unmatched, setUnmatched]       = useState([])
  const [importing, setImporting]       = useState(false)
  const [result, setResult]             = useState(null)
  const fileRef = useRef(null)

  const cellCols = useMemo(
    () => (cellGroups || []).map((cg) => ({ id: cg.id, name: cg.cellName || 'Unnamed' })),
    [cellGroups]
  )

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setParsedRows(null); setParseErrors([]); setUnmatched([]); setResult(null)
    try {
      const { rows, errors, unmatched: um } = await parseExcelFile(file, cellGroups)
      setParsedRows(rows)
      setParseErrors(errors)
      setUnmatched(um || [])
    } catch (err) {
      setParseErrors([err.message || 'Failed to parse file.'])
    }
    e.target.value = ''
  }

  const handleImport = async () => {
    if (!parsedRows?.length) return
    setImporting(true)
    try {
      const res = await bulkImportSundayReports(parsedRows, importedBy)
      setResult(res)
      if (res.imported > 0) onImported()
    } catch {
      setParseErrors(['Import failed. Please try again.'])
    }
    setImporting(false)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Import from Excel</h3>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
      </div>

      {/* Format guide */}
      <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-sm">
        <p className="font-medium text-slate-700 text-xs uppercase tracking-wide">Column layout</p>
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="px-2 py-1.5 text-left font-semibold border-r border-slate-200 whitespace-nowrap">Date</th>
                {cellCols.map((c) => (
                  <th key={c.id} className="px-2 py-1.5 text-left font-semibold text-indigo-700 border-r border-slate-200 whitespace-nowrap">{c.name}</th>
                ))}
                <th className="px-2 py-1.5 text-left font-semibold border-r border-slate-200 whitespace-nowrap">Others</th>
                <th className="px-2 py-1.5 text-left font-semibold border-r border-slate-200 whitespace-nowrap">Sun. School</th>
                <th className="px-2 py-1.5 text-left font-semibold border-r border-slate-200 whitespace-nowrap">2nd Week</th>
                <th className="px-2 py-1.5 text-left font-semibold border-r border-slate-200 whitespace-nowrap">New Comers</th>
                <th className="px-2 py-1.5 text-left font-semibold border-r border-slate-200 whitespace-nowrap">Program</th>
                <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Timing</th>
              </tr>
            </thead>
            <tbody className="text-slate-500 divide-y divide-slate-100">
              <tr>
                <td className="px-2 py-1 border-r border-slate-200 text-slate-700 font-medium whitespace-nowrap">07/01/2024</td>
                {cellCols.map((c, i) => <td key={c.id} className="px-2 py-1 border-r border-slate-200 whitespace-nowrap">{i === 0 ? 'John Doe' : 'Alice'}</td>)}
                <td className="px-2 py-1 border-r border-slate-200">Mike</td>
                <td className="px-2 py-1 border-r border-slate-200">20</td>
                <td className="px-2 py-1 border-r border-slate-200">Chris</td>
                <td className="px-2 py-1 border-r border-slate-200">Lisa</td>
                <td className="px-2 py-1 border-r border-slate-200 whitespace-nowrap">Worship</td>
                <td className="px-2 py-1 whitespace-nowrap">9:15 AM</td>
              </tr>
              <tr className="bg-slate-50/50">
                <td className="px-2 py-1 border-r border-slate-200 text-slate-400 italic">↑ same date</td>
                {cellCols.map((c, i) => <td key={c.id} className="px-2 py-1 border-r border-slate-200 whitespace-nowrap">{i === 0 ? 'Jane Smith' : 'Dave'}</td>)}
                <td className="px-2 py-1 border-r border-slate-200">Sara</td>
                <td className="px-2 py-1 border-r border-slate-200"></td>
                <td className="px-2 py-1 border-r border-slate-200"></td>
                <td className="px-2 py-1 border-r border-slate-200"></td>
                <td className="px-2 py-1 border-r border-slate-200 whitespace-nowrap">Sermon</td>
                <td className="px-2 py-1 whitespace-nowrap">10:30 AM</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="text-xs text-slate-500 space-y-0.5 list-disc list-inside">
          <li>One name per cell — each person on their own row under the column</li>
          <li>Date only on the first row of each Sunday's group (or repeat it — both work)</li>
          <li>Sun. School is a count, not names</li>
          <li>Program &amp; Timing: one item per row, matched by row order</li>
          <li>Existing dates are never overwritten</li>
        </ul>
        <button
          type="button"
          onClick={() => downloadTemplate(cellGroups)}
          className="text-indigo-600 hover:underline text-xs font-medium"
        >
          Download template (.xlsx) →
        </button>
      </div>

      {/* File picker */}
      {!result && (
        <div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-lg py-6 text-sm text-slate-500 hover:text-indigo-600 transition font-medium"
          >
            Click to select .xlsx / .xls / .csv file
          </button>
        </div>
      )}

      {/* Warnings for unmatched columns */}
      {unmatched.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          <span className="font-semibold">Unrecognised columns (ignored):</span> {unmatched.join(', ')}
        </div>
      )}

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="space-y-1">
          {parseErrors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>
          ))}
        </div>
      )}

      {/* Preview */}
      {parsedRows && parsedRows.length > 0 && !result && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">{parsedRows.length} rows parsed — preview:</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-72 overflow-y-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-slate-500">
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Date</th>
                  {cellCols.map((c) => (
                    <th key={c.id} className="px-3 py-2 text-right font-medium text-indigo-700 whitespace-nowrap">{c.name}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Others</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Sun. School</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">2nd Week</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">New Comers</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Program</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedRows.map((r, i) => {
                  const t = rowTotals(r)
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-medium text-slate-700 whitespace-nowrap">{formatDisplayDate(r.date)}</td>
                      {cellCols.map((c) => {
                        const names = (r.sundayCellAttendance || {})[c.id] || []
                        return (
                          <td key={c.id} className="px-3 py-1.5 text-right tabular-nums text-slate-600" title={names.join(', ')}>
                            {names.length || '—'}
                          </td>
                        )
                      })}
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600" title={(r.others || []).join(', ')}>
                        {(r.others || []).length || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
                        {r.sundaySchool || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600" title={(r.secondWeekAttendees || []).join(', ')}>
                        {(r.secondWeekAttendees || []).length || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600" title={(r.newcomers || []).join(', ')}>
                        {(r.newcomers || []).length || '—'}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right tabular-nums text-slate-600"
                        title={(r.programTimings || []).map((p) => `${p.programName} – ${p.startTime.slice(11, 16)}`).join(', ')}
                      >
                        {(r.programTimings || []).length || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-700">
                        {t.total || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">Hover over a cell count to see the names.</p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setParsedRows(null); setParseErrors([]); setUnmatched([]) }}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {importing ? 'Importing…' : `Import ${parsedRows.length} records`}
            </button>
          </div>
        </div>
      )}

      {parsedRows && parsedRows.length === 0 && parseErrors.length === 0 && (
        <p className="text-sm text-slate-500">No valid rows found in the file.</p>
      )}

      {/* Result */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-green-800">Import complete</p>
          <p className="text-sm text-green-700">{result.imported} records added.</p>
          {result.skipped > 0 && (
            <p className="text-xs text-slate-500">{result.skipped} skipped (already exist).</p>
          )}
          <button type="button" onClick={onClose} className="mt-1 text-xs text-indigo-600 hover:underline">
            Close
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(isoString) {
  try { return format(parseISO(isoString), 'h:mm a') } catch { return isoString }
}

function formatDuration(isoA, isoB) {
  try {
    const ms = parseISO(isoB) - parseISO(isoA)
    if (ms <= 0) return null
    const totalMins = Math.round(ms / 60000)
    const h = Math.floor(totalMins / 60)
    const m = totalMins % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${m}m`
  } catch { return null }
}

function Td({ value }) {
  return (
    <td className="px-3 py-3 text-right tabular-nums text-slate-700 whitespace-nowrap">
      {value !== '' && value != null && value !== 0 ? value : '—'}
    </td>
  )
}

function downloadSingleReport(row, cellCols) {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Summary
  const summaryRows = []
  summaryRows.push([`Sunday Report — ${row.date}`])
  summaryRows.push([])

  if (row.programTimings?.length > 0) {
    summaryRows.push(['Program', 'Start Time', 'Duration'])
    row.programTimings.forEach((t, i) => {
      const duration = formatDuration(t.startTime, row.programTimings[i + 1]?.startTime) || '—'
      summaryRows.push([t.programName, formatTime(t.startTime), duration])
    })
    summaryRows.push([])
  }

  const sca = row.sundayCellAttendance || {}
  summaryRows.push(['Attendance', 'Count'])
  cellCols.forEach((c) => {
    const count = (sca[c.id] || []).filter(Boolean).length
    summaryRows.push([c.name, count || 0])
  })
  FIXED_COLS.forEach((c) => summaryRows.push([c.label, row[c.key] || 0]))

  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  ws1['!cols'] = [{ wch: 30 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

  // Sheet 2: Cell Attendance (individual names)
  const detailRows = [['Cell', 'Member']]
  cellCols.forEach((c) => {
    ;(sca[c.id] || []).filter(Boolean).forEach((name) => detailRows.push([c.name, name]))
  })
  if (detailRows.length > 1) {
    const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
    ws2['!cols'] = [{ wch: 28 }, { wch: 28 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Cell Attendance')
  }

  XLSX.writeFile(wb, `sunday-report-${row.date}.xlsx`)
}

function KebabMenu({ onEdit, onDelete, onDownload, canEdit, canDelete, deleting }) {
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
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[130px] bg-white rounded-xl shadow-lg border border-slate-200 py-1 overflow-hidden">
          {canEdit && (
            <button
              type="button"
              onClick={() => { setOpen(false); onEdit() }}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => { setOpen(false); onDownload() }}
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            Download
          </button>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SundayReportsHistory() {
  const { isFounder, isSundayMinistryDirector, userProfile } = useAuth()
  const navigate = useNavigate()

  const canEdit   = isSundayMinistryDirector
  const canDelete = isFounder

  const [rows, setRows]             = useState([])
  const [cellGroups, setCellGroups] = useState([])
  const [loading, setLoading]       = useState(true)
  const [expandedDate, setExpanded] = useState(null)
  const [deletingDate, setDeleting] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [printRow, setPrintRow] = useState(null)

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

  if (!isSundayMinistryDirector) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">← Sunday Ministry</Link>
        <p className="mt-4">You do not have access to Sunday Ministry.</p>
      </div>
    )
  }

  return (
    <div>
      <DepartmentTabBar slug="sunday-ministry" activeTab="sundayReportsHistory" />
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800">Sunday Reports</h2>
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
          <div className="space-y-3">
            {/* Compact 5-per-row tiles */}
            <div className="grid grid-cols-5 gap-1.5">
              {rows.map((row) => {
                const isSelected = expandedDate === row.date
                const d = parseISO(row.date)
                const mon = format(d, 'MMM')
                const day = format(d, 'd')
                return (
                  <button
                    key={row.date}
                    type="button"
                    onClick={() => setExpanded(isSelected ? null : row.date)}
                    className={`rounded-xl border text-center py-2 px-0.5 transition-all active:scale-95 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide leading-none">{mon}</p>
                    <p className="text-sm font-bold text-slate-700 leading-tight">{day}</p>
                    <p className="text-base font-extrabold text-indigo-600 tabular-nums leading-tight">{row.totalAttendance || 0}</p>
                    <p className="text-[8px] text-slate-400 leading-none">total</p>
                  </button>
                )
              })}
            </div>

            {/* Expanded detail panel */}
            {expandedDate && (() => {
              const row = rows.find((r) => r.date === expandedDate)
              if (!row) return null
              const sca = row.sundayCellAttendance || {}
              const hasTimings = row.programTimings?.length > 0
              return (
                <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-indigo-50/60">
                    <div>
                      <span className="font-semibold text-slate-800 text-sm">{formatDisplayDate(row.date)}</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-xl font-bold text-indigo-600 tabular-nums">{row.totalAttendance || 0}</span>
                        <span className="text-xs text-slate-400">total attendance</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPrintRow(row)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap"
                      >
                        📄 View Report
                      </button>
                      <KebabMenu
                        canEdit={canEdit}
                        canDelete={canDelete}
                        deleting={deletingDate === row.date}
                        onEdit={() => navigate(`/department/sunday-ministry/sunday-report?date=${row.date}`)}
                        onDelete={() => handleDelete(row.date)}
                        onDownload={() => downloadSingleReport(row, cellCols)}
                      />
                      <button
                        type="button"
                        onClick={() => setExpanded(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M2 2l10 10M12 2L2 12"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {/* Fixed stats grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {FIXED_COLS.filter((c) => c.key !== 'totalAttendance').map((c) => (
                        <div key={c.key} className="bg-slate-50 rounded-lg px-2 py-1.5 text-center">
                          <p className="text-xs text-slate-400 leading-none mb-0.5 truncate">{c.label}</p>
                          <p className="text-sm font-semibold text-slate-700 tabular-nums">{row[c.key] || 0}</p>
                        </div>
                      ))}
                    </div>

                    {/* Cell attendance */}
                    {cellCols.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Cell Groups</p>
                        <div className="grid grid-cols-2 gap-1">
                          {cellCols.map((c) => {
                            const count = (sca[c.id] || []).length
                            return (
                              <div key={c.id} className="flex items-center justify-between px-2 py-1 rounded-md bg-indigo-50/60">
                                <span className="text-xs text-slate-600 truncate mr-1">{c.name}</span>
                                <span className="text-xs font-semibold text-indigo-700 tabular-nums flex-shrink-0">{count || 0}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Program timings */}
                    {hasTimings && (
                      <div className="border-t border-slate-100 pt-2 space-y-1">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Program</p>
                        {row.programTimings.map((t, i) => {
                          const duration = formatDuration(t.startTime, row.programTimings[i + 1]?.startTime)
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-slate-700 font-medium flex-1 min-w-0 truncate">{t.programName}</span>
                              <span className="text-slate-400 tabular-nums flex-shrink-0">{formatTime(t.startTime)}</span>
                              {duration && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 tabular-nums font-medium">
                                  {duration}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {printRow && (
        <SundayReportPrintView
          row={printRow}
          cellCols={cellCols}
          onClose={() => setPrintRow(null)}
        />
      )}
    </div>
  )
}

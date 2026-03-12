import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, addWeeks, subWeeks } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { getSundayReport, setSundayReport } from '../services/firestore'

const CELL_GROUP_KEYS = [
  { key: 'pastoralAttendees', title: 'Pastoral Attendees' },
  { key: 'olive', title: 'Olive' },
  { key: 'jordan', title: 'Jordan' },
  { key: 'bethany', title: 'Bethany' },
  { key: 'edenStream', title: 'Eden Stream' },
  { key: 'bethel', title: 'Bethel' },
  { key: 'newCell1', title: 'New Cell - 1' },
  { key: 'children', title: 'Children' },
]

const DEFAULT_PROGRAM_ENTRIES = [
  { timeStart: '10:14', program: 'Pre Worship Talk', timeEnd: '' },
  { timeStart: '10:18', program: 'Worship', timeEnd: '' },
  { timeStart: '10:51', program: 'Leader Prayer', timeEnd: '' },
  { timeStart: '10:53', program: 'Psalm', timeEnd: '' },
  { timeStart: '10:55', program: 'Announcements', timeEnd: '' },
  { timeStart: '11:15', program: 'Sister Prayer', timeEnd: '' },
  { timeStart: '11:17', program: 'Pastor Testimony', timeEnd: '' },
  { timeStart: '11:23', program: 'Holy Communion', timeEnd: '' },
  { timeStart: '11:44', program: 'Sermon', timeEnd: '' },
  { timeStart: '12:13', program: 'Small Worship', timeEnd: '' },
  { timeStart: '12:16', program: 'Prayer & Benediction', timeEnd: '' },
]

const SUMMARY_KEYS = [
  'totalVolunteers',
  'cellAttendance',
  'newcomers',
  'secondWeekAttendees',
  'riverKids',
  'englishServiceAttendance',
  'tamilServiceAttendance',
  'totalAdults',
  'totalAttendance',
]
const SUMMARY_LABELS = {
  totalVolunteers: 'Total Volunteers',
  cellAttendance: 'Cell Attendance',
  newcomers: 'Newcomers',
  secondWeekAttendees: 'Second Week Attendees',
  riverKids: 'River Kids',
  englishServiceAttendance: 'English Service Attendance',
  tamilServiceAttendance: 'Tamil Service Attendance',
  totalAdults: 'Total Adults',
  totalAttendance: 'Total Attendance',
}

function NameListSection({ title, names, canEdit, onAdd, onEdit, onRemove }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>
      <ul className="space-y-2">
        {(names || []).map((name, idx) => (
          <li key={idx} className="flex items-center gap-2">
            {canEdit ? (
              <>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => onEdit(idx, e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded border border-slate-300 text-sm"
                />
                <button type="button" onClick={() => onRemove(idx)} className="text-red-600 hover:underline text-sm">Remove</button>
              </>
            ) : (
              <span className="text-slate-800">{name || '—'}</span>
            )}
          </li>
        ))}
        {canEdit && (
          <li>
            <button type="button" onClick={onAdd} className="text-indigo-600 hover:underline text-sm font-medium">+ Add person</button>
          </li>
        )}
      </ul>
    </div>
  )
}

function TeamSection({ rows, canEdit, onAdd, onEdit, onRemove }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h3 className="font-semibold text-slate-800 mb-3">Sunday Ministry Team</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 pr-4 font-medium text-slate-600">Designation</th>
              <th className="text-left py-2 font-medium text-slate-600">Member</th>
              {canEdit && <th className="w-20 py-2" />}
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row, idx) => (
              <tr key={idx} className="border-b border-slate-100">
                <td className="py-2 pr-4">
                  {canEdit ? (
                    <input type="text" value={row.designation || ''} onChange={(e) => onEdit(idx, 'designation', e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300" />
                  ) : (
                    <span>{row.designation || '—'}</span>
                  )}
                </td>
                <td className="py-2">
                  {canEdit ? (
                    <input type="text" value={row.member || ''} onChange={(e) => onEdit(idx, 'member', e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300" />
                  ) : (
                    <span>{row.member || '—'}</span>
                  )}
                </td>
                {canEdit && (
                  <td className="py-2">
                    <button type="button" onClick={() => onRemove(idx)} className="text-red-600 hover:underline text-xs">Remove</button>
                  </td>
                )}
              </tr>
            ))}
            {canEdit && (
              <tr>
                <td colSpan={canEdit ? 3 : 2} className="py-2">
                  <button type="button" onClick={onAdd} className="text-indigo-600 hover:underline text-sm font-medium">+ Add row</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SundayReport() {
  const { userProfile, canManageDepartment } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const canEdit = canManageDepartment('Sunday Ministry')

  useEffect(() => {
    setLoading(true)
    getSundayReport(selectedDate)
      .then((r) => {
        if (r && (!r.programList || r.programList.length === 0) && DEFAULT_PROGRAM_ENTRIES.length) {
          setReport({ ...r, programList: [...DEFAULT_PROGRAM_ENTRIES] })
        } else {
          setReport(r || null)
        }
      })
      .catch(() => setReport(null))
      .finally(() => setLoading(false))
  }, [selectedDate])

  const updateReport = (patch) => setReport((prev) => (prev ? { ...prev, ...patch } : { ...patch }))

  const handleSave = async () => {
    if (!report || !canEdit) return
    setSaving(true)
    try {
      await setSundayReport(selectedDate, report, userProfile?.email || 'unknown')
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
    setSaving(false)
  }

  const updateTeamRow = (idx, field, value) => {
    const list = [...(report?.sundayMinistryTeam || [])]
    if (!list[idx]) list[idx] = { designation: '', member: '' }
    list[idx] = { ...list[idx], [field]: value }
    updateReport({ sundayMinistryTeam: list })
  }
  const addTeamRow = () => updateReport({ sundayMinistryTeam: [...(report?.sundayMinistryTeam || []), { designation: '', member: '' }] })
  const removeTeamRow = (idx) => updateReport({ sundayMinistryTeam: (report?.sundayMinistryTeam || []).filter((_, i) => i !== idx) })

  const updateCellList = (key, idx, value) => {
    const list = [...(report?.[key] || [])]
    list[idx] = value
    updateReport({ [key]: list })
  }
  const addCellName = (key) => updateReport({ [key]: [...(report?.[key] || []), ''] })
  const removeCellName = (key, idx) => updateReport({ [key]: (report?.[key] || []).filter((_, i) => i !== idx) })

  const updateProgramRow = (idx, field, value) => {
    const list = [...(report?.programList || [])]
    if (!list[idx]) list[idx] = { timeStart: '', program: '', timeEnd: '' }
    list[idx] = { ...list[idx], [field]: value }
    updateReport({ programList: list })
  }
  const addProgramRow = () => updateReport({ programList: [...(report?.programList || []), { timeStart: '', program: '', timeEnd: '' }] })
  const removeProgramRow = (idx) => updateReport({ programList: (report?.programList || []).filter((_, i) => i !== idx) })

  const updateSummary = (key, value) => updateReport({ summary: { ...(report?.summary || {}), [key]: value } })
  const updatePreservice = (field, value) => updateReport({ preservice: { ...(report?.preservice || {}), [field]: value } })

  if (!canManageDepartment('Sunday Ministry')) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/sunday-ministry" className="text-blue-600 hover:underline">← Sunday Ministry</Link>
        <p className="mt-4">You do not have permission to view the Sunday Report. Sunday Ministry Director, Coordinator, Admin, or Senior Pastor only.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/department/sunday-ministry" className="text-slate-500 hover:text-slate-700">← Sunday Ministry</Link>
        <h1 className="text-2xl font-bold text-slate-800">Sunday Report</h1>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-slate-700">Date:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300"
        />
        <button type="button" onClick={() => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">← Prev</button>
        <button type="button" onClick={() => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Next →</button>
        {canEdit && (
          <button type="button" onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save report'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading report…</div>
      ) : (
        <>
          <TeamSection
            rows={report?.sundayMinistryTeam || []}
            canEdit={canEdit}
            onAdd={addTeamRow}
            onEdit={updateTeamRow}
            onRemove={removeTeamRow}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CELL_GROUP_KEYS.map(({ key, title }) => (
              <NameListSection
                key={key}
                title={title}
                names={report?.[key] || []}
                canEdit={canEdit}
                onAdd={() => addCellName(key)}
                onEdit={(idx, value) => updateCellList(key, idx, value)}
                onRemove={(idx) => removeCellName(key, idx)}
              />
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-3">Program List</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 pr-4 font-medium text-slate-600 w-24">Time Start</th>
                    <th className="text-left py-2 font-medium text-slate-600">Program</th>
                    <th className="text-left py-2 pl-4 font-medium text-slate-600 w-24">Time End</th>
                    {canEdit && <th className="w-16 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {(report?.programList || []).map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2 pr-4">
                        {canEdit ? (
                          <input type="text" value={row.timeStart || ''} onChange={(e) => updateProgramRow(idx, 'timeStart', e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300" placeholder="10:14" />
                        ) : (
                          <span>{row.timeStart || '—'}</span>
                        )}
                      </td>
                      <td className="py-2">
                        {canEdit ? (
                          <input type="text" value={row.program || ''} onChange={(e) => updateProgramRow(idx, 'program', e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300" />
                        ) : (
                          <span>{row.program || '—'}</span>
                        )}
                      </td>
                      <td className="py-2 pl-4">
                        {canEdit ? (
                          <input type="text" value={row.timeEnd || ''} onChange={(e) => updateProgramRow(idx, 'timeEnd', e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300" />
                        ) : (
                          <span>{row.timeEnd || '—'}</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="py-2">
                          <button type="button" onClick={() => removeProgramRow(idx)} className="text-red-600 hover:underline text-xs">Remove</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {canEdit && (
                    <tr>
                      <td colSpan={canEdit ? 4 : 3} className="py-2">
                        <button type="button" onClick={addProgramRow} className="text-indigo-600 hover:underline text-sm font-medium">+ Add row</button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-3">Preservice</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Lead 1</label>
                {canEdit ? (
                  <input type="text" value={report?.preservice?.lead1 || ''} onChange={(e) => updatePreservice('lead1', e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300" />
                ) : (
                  <p className="text-slate-800">{report?.preservice?.lead1 || '—'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Lead 2</label>
                {canEdit ? (
                  <input type="text" value={report?.preservice?.lead2 || ''} onChange={(e) => updatePreservice('lead2', e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300" />
                ) : (
                  <p className="text-slate-800">{report?.preservice?.lead2 || '—'}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-3">Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SUMMARY_KEYS.map((key) => (
                <div key={key}>
                  <label className="block text-sm text-slate-600 mb-1">{SUMMARY_LABELS[key]}</label>
                  {canEdit ? (
                    <input
                      type="text"
                      value={report?.summary?.[key] ?? ''}
                      onChange={(e) => updateSummary(key, e.target.value)}
                      className="w-full px-3 py-2 rounded border border-slate-300"
                    />
                  ) : (
                    <p className="text-slate-800">{report?.summary?.[key] ?? '—'}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <button type="button" onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save report'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

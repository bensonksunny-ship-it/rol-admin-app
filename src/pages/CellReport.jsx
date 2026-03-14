import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import {
  getCellGroups,
  getCellGroup,
  getCellReportByCellAndDate,
  createCellReport,
  updateCellReport,
  getCellReportAttendees,
  addCellReportAttendee,
  updateCellReportAttendee,
  deleteCellReportAttendee,
  updateUser,
} from '../services/firestore'
import { ROLES } from '../constants/roles'
import * as XLSX from 'xlsx'

const CELL_DEPARTMENT = 'Cell'

export default function CellReport() {
  const { userProfile, user: authUser } = useAuth()
  const [cellGroups, setCellGroups] = useState([])
  const [selectedCellId, setSelectedCellId] = useState(null)
  const [reportDate, setReportDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [report, setReport] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [memberForm, setMemberForm] = useState({ name: '', birthday: '', anniversary: '', phone: '', locality: '' })
  const [editForm, setEditForm] = useState(null)
  const [importPreview, setImportPreview] = useState([])
  const [importModalOpen, setImportModalOpen] = useState(false)

  const isCellDirector = userProfile?.department === CELL_DEPARTMENT && userProfile?.role === ROLES.DIRECTOR
  const isSeniorPastor = userProfile?.role === ROLES.SENIOR_PASTOR
  const isFullAccess = [ROLES.FOUNDER, ROLES.ADMIN].includes(userProfile?.role)
  const canViewAllCells = isCellDirector || isSeniorPastor || isFullAccess

  const myCellId = useMemo(() => {
    const cid = userProfile?.cellId
    if (cid) return cid
    const name = (userProfile?.displayName || userProfile?.name || userProfile?.email || '').trim()
    if (!name || !cellGroups.length) return null
    const match = cellGroups.find(
      (g) => (g.leader || '').trim() === name || (g.leader || '').toLowerCase().includes(name.toLowerCase())
    )
    return match?.id || null
  }, [userProfile?.cellId, userProfile?.displayName, userProfile?.name, userProfile?.email, cellGroups])

  const effectiveCellId = canViewAllCells ? selectedCellId : myCellId
  const cell = useMemo(() => cellGroups.find((g) => g.id === effectiveCellId) || null, [cellGroups, effectiveCellId])

  useEffect(() => {
    getCellGroups(CELL_DEPARTMENT)
      .then(setCellGroups)
      .catch(() => setCellGroups([]))
  }, [])

  // So Firestore rules allow create: set user cellId when we detect leader by name
  useEffect(() => {
    if (authUser?.uid && myCellId && !userProfile?.cellId) {
      updateUser(authUser.uid, { cellId: myCellId }).catch(() => {})
    }
  }, [authUser?.uid, myCellId, userProfile?.cellId])

  useEffect(() => {
    if (!effectiveCellId) {
      setReport(null)
      setAttendees([])
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      getCellReportByCellAndDate(effectiveCellId, reportDate),
      getCellGroup(effectiveCellId),
    ])
      .then(([r, c]) => {
        if (r) {
          setReport(r)
          return getCellReportAttendees(r.id).then(setAttendees)
        }
        setReport(null)
        setAttendees([])
        if (c) {
          const newReport = {
            cellId: c.id,
            cellName: c.cellName,
            meetingDay: c.meetingDay,
            membersAttended: 0,
            visitors: 0,
            children: 0,
            reportDate,
          }
          return createCellReport(newReport, userProfile?.email || 'unknown').then((id) => {
            setReport({ id, ...newReport, createdBy: userProfile?.email })
            setAttendees([])
          })
        }
      })
      .catch(() => {
        setReport(null)
        setAttendees([])
      })
      .finally(() => setLoading(false))
  }, [effectiveCellId, reportDate, userProfile?.email])

  useEffect(() => {
    if (report && attendees.length !== report.membersAttended) {
      updateCellReport(report.id, { membersAttended: attendees.length }).then(() => {
        setReport((prev) => (prev ? { ...prev, membersAttended: attendees.length } : null))
      })
    }
  }, [attendees.length, report?.id])

  const handleAddMember = async (e) => {
    e.preventDefault()
    const name = (memberForm.name || '').trim()
    if (!name || !report) return
    setSaving(true)
    try {
      await addCellReportAttendee(report.id, memberForm, userProfile?.email)
      const list = await getCellReportAttendees(report.id)
      setAttendees(list)
      setMemberForm({ name: '', birthday: '', anniversary: '', phone: '', locality: '' })
    } catch (err) {
      console.error(err)
      alert('Failed to add member')
    }
    setSaving(false)
  }

  const handleUpdateAttendee = async () => {
    if (!report || !editForm) return
    const { id, ...data } = editForm
    try {
      await updateCellReportAttendee(report.id, id, data)
      setAttendees((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)))
      setEditForm(null)
    } catch (err) {
      console.error(err)
      alert('Failed to update')
    }
  }

  const handleRemoveAttendee = async (attendeeId) => {
    if (!report || !window.confirm('Remove this attendee?')) return
    try {
      await deleteCellReportAttendee(report.id, attendeeId)
      setAttendees((prev) => prev.filter((a) => a.id !== attendeeId))
    } catch (err) {
      console.error(err)
      alert('Failed to remove')
    }
  }

  const handleSaveCounters = async () => {
    if (!report) return
    setSaving(true)
    try {
      await updateCellReport(report.id, {
        visitors: Number(report.visitors) || 0,
        children: Number(report.children) || 0,
      })
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
    setSaving(false)
  }

  const parseFileForImport = (file) => {
    const ext = (file.name || '').toLowerCase()
    if (ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = ev.target?.result
          let rows = []
          if (ext.endsWith('.csv')) {
            const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
            rows = text.split(/\r?\n/).map((line) => line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, '')))
          } else {
            const wb = XLSX.read(data, { type: 'binary' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
          }
          const headers = (rows[0] || []).map((h) => String(h || '').toLowerCase())
          const nameIdx = headers.findIndex((h) => h.includes('name'))
          const bdayIdx = headers.findIndex((h) => h.includes('birthday') || h.includes('dob') || h.includes('date'))
          const annIdx = headers.findIndex((h) => h.includes('anniversary'))
          const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('mobile'))
          const locIdx = headers.findIndex((h) => h.includes('locality') || h.includes('location') || h.includes('place'))
          const parsed = []
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i] || []
            const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : String(row[0] || '').trim()
            if (!name) continue
            parsed.push({
              name,
              birthday: bdayIdx >= 0 ? String(row[bdayIdx] || '').trim().slice(0, 10) : '',
              anniversary: annIdx >= 0 ? String(row[annIdx] || '').trim().slice(0, 10) : '',
              phone: phoneIdx >= 0 ? String(row[phoneIdx] || '').trim() : '',
              locality: locIdx >= 0 ? String(row[locIdx] || '').trim() : '',
            })
          }
          const seen = new Set()
          const deduped = parsed.filter((p) => {
            const key = p.name.toLowerCase()
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          setImportPreview(deduped)
          setImportModalOpen(true)
        } catch (err) {
          console.error(err)
          alert('Could not parse file. Use CSV or Excel with a header row.')
        }
      }
      if (ext.endsWith('.csv')) reader.readAsText(file)
      else reader.readAsBinaryString(file)
    } else {
      alert('Please use CSV or Excel (.xlsx) for import.')
    }
  }

  const handleConfirmImport = async () => {
    if (!report || !importPreview.length) return
    setSaving(true)
    try {
      const existingNames = new Set(attendees.map((a) => (a.name || '').toLowerCase()))
      for (const row of importPreview) {
        const n = (row.name || '').trim()
        if (!n || existingNames.has(n.toLowerCase())) continue
        await addCellReportAttendee(report.id, row, userProfile?.email)
        existingNames.add(n.toLowerCase())
      }
      const list = await getCellReportAttendees(report.id)
      setAttendees(list)
      setImportModalOpen(false)
      setImportPreview([])
      setImportFile(null)
    } catch (err) {
      console.error(err)
      alert('Failed to import some members')
    }
    setSaving(false)
  }

  const canAccess = useMemo(() => {
    if (!userProfile) return false
    if (isFullAccess || isSeniorPastor) return true
    if (userProfile.department !== CELL_DEPARTMENT) return false
    if (isCellDirector) return true
    return !!myCellId
  }, [userProfile, isFullAccess, isSeniorPastor, isCellDirector, myCellId])

  if (!canAccess) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">You do not have access to Cell Report. Cell Leaders can only access their own cell; Cell Director and Senior Pastor can view all.</p>
      </div>
    )
  }

  if (!canViewAllCells && !myCellId && cellGroups.length > 0) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/department/cell" className="text-blue-600 hover:underline">← Cell Department</Link>
        <p className="mt-4">Your user is not linked to a cell. Ask an admin to set your <strong>cellId</strong> in your profile, or ensure your name matches the <strong>Leader</strong> of a cell group.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/department/cell" className="text-slate-500 hover:text-slate-700">← Cell Department</Link>
        <h1 className="text-2xl font-bold text-slate-800">Cell Report</h1>
      </div>

      {canViewAllCells && (
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-slate-700">Cell:</label>
          <select
            value={selectedCellId || ''}
            onChange={(e) => setSelectedCellId(e.target.value || null)}
            className="px-3 py-2 rounded-lg border border-slate-300"
          >
            <option value="">— Select cell —</option>
            {cellGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.cellName || g.id}</option>
            ))}
          </select>
        </div>
      )}

      {!effectiveCellId && canViewAllCells && (
        <p className="text-slate-500">Select a cell to view or create a report.</p>
      )}

      {effectiveCellId && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-3">Cell Information</h2>
            <p className="text-slate-700"><strong>Cell Name:</strong> {cell?.cellName || '—'}</p>
            <p className="text-slate-700 mt-1"><strong>Day of Cell:</strong> {cell?.meetingDay || '—'}</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium text-slate-700">Report Date:</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>

          {loading ? (
            <div className="py-8 text-slate-500">Loading report…</div>
          ) : report && (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h2 className="font-semibold text-slate-800 mb-3">Attendance Counters</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-slate-600">Members Attended</label>
                    <p className="text-2xl font-bold text-slate-800">{attendees.length}</p>
                    <p className="text-xs text-slate-400">Updates as you add names</p>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600">Visitors</label>
                    <input
                      type="number"
                      min="0"
                      value={report.visitors ?? ''}
                      onChange={(e) => setReport((r) => (r ? { ...r, visitors: e.target.value } : null))}
                      onBlur={handleSaveCounters}
                      className="mt-1 w-full px-3 py-2 rounded border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600">Children Attended</label>
                    <input
                      type="number"
                      min="0"
                      value={report.children ?? ''}
                      onChange={(e) => setReport((r) => (r ? { ...r, children: e.target.value } : null))}
                      onBlur={handleSaveCounters}
                      className="mt-1 w-full px-3 py-2 rounded border border-slate-300"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h2 className="font-semibold text-slate-800 mb-3">Member List</h2>
                <form onSubmit={handleAddMember} className="mb-4 p-3 bg-slate-50 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-slate-700">Add Member</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    <input type="text" placeholder="Name *" value={memberForm.name} onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300" required />
                    <input type="date" placeholder="Birthday" value={memberForm.birthday} onChange={(e) => setMemberForm((f) => ({ ...f, birthday: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300" />
                    <input type="date" placeholder="Anniversary" value={memberForm.anniversary} onChange={(e) => setMemberForm((f) => ({ ...f, anniversary: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300" />
                    <input type="text" placeholder="Phone" value={memberForm.phone} onChange={(e) => setMemberForm((f) => ({ ...f, phone: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300" />
                    <input type="text" placeholder="Locality" value={memberForm.locality} onChange={(e) => setMemberForm((f) => ({ ...f, locality: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300" />
                  </div>
                  <button type="submit" disabled={saving} className="mt-2 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm disabled:opacity-50">Add Member</button>
                </form>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2">Name</th>
                        <th className="text-left px-3 py-2">Birthday</th>
                        <th className="text-left px-3 py-2">Anniversary</th>
                        <th className="text-left px-3 py-2">Phone</th>
                        <th className="text-left px-3 py-2">Locality</th>
                        <th className="w-20 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attendees.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50">
                          {editForm?.id === a.id ? (
                            <>
                              <td><input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : null))} className="w-full px-2 py-1 rounded border" /></td>
                              <td><input type="date" value={editForm.birthday?.slice(0, 10) || ''} onChange={(e) => setEditForm((f) => (f ? { ...f, birthday: e.target.value } : null))} className="w-full px-2 py-1 rounded border" /></td>
                              <td><input type="date" value={editForm.anniversary?.slice(0, 10) || ''} onChange={(e) => setEditForm((f) => (f ? { ...f, anniversary: e.target.value } : null))} className="w-full px-2 py-1 rounded border" /></td>
                              <td><input type="text" value={editForm.phone || ''} onChange={(e) => setEditForm((f) => (f ? { ...f, phone: e.target.value } : null))} className="w-full px-2 py-1 rounded border" /></td>
                              <td><input type="text" value={editForm.locality || ''} onChange={(e) => setEditForm((f) => (f ? { ...f, locality: e.target.value } : null))} className="w-full px-2 py-1 rounded border" /></td>
                              <td>
                                <button type="button" onClick={handleUpdateAttendee} className="text-blue-600 text-xs mr-1">Save</button>
                                <button type="button" onClick={() => setEditForm(null)} className="text-slate-600 text-xs">Cancel</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 font-medium">{a.name || '—'}</td>
                              <td className="px-3 py-2">{a.birthday ? a.birthday.slice(0, 10) : '—'}</td>
                              <td className="px-3 py-2">{a.anniversary ? a.anniversary.slice(0, 10) : '—'}</td>
                              <td className="px-3 py-2">{a.phone || '—'}</td>
                              <td className="px-3 py-2">{a.locality || '—'}</td>
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => setEditForm({ id: a.id, name: a.name || '', birthday: a.birthday || '', anniversary: a.anniversary || '', phone: a.phone || '', locality: a.locality || '' })} className="text-blue-600 text-xs mr-1">Edit</button>
                                <button type="button" onClick={() => handleRemoveAttendee(a.id)} className="text-red-600 text-xs">Remove</button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {attendees.length === 0 && <p className="py-4 text-slate-500 text-center">No attendees yet. Add members above.</p>}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h2 className="font-semibold text-slate-800 mb-3">Import Members</h2>
                <p className="text-sm text-slate-500 mb-2">Upload CSV or Excel (.xlsx). First row = headers (e.g. Name, Birthday, Anniversary, Phone, Locality). Duplicate names are skipped.</p>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) parseFileForImport(f)
                    e.target.value = ''
                  }}
                  className="block w-full text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-300 file:bg-white"
                />
              </div>
            </>
          )}
        </>
      )}

      {importModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-slate-800">Import preview ({importPreview.length} rows)</h3>
              <p className="text-sm text-slate-500">Duplicate names will be skipped when saving.</p>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Name</th>
                    <th className="text-left px-2 py-1">Birthday</th>
                    <th className="text-left px-2 py-1">Anniversary</th>
                    <th className="text-left px-2 py-1">Phone</th>
                    <th className="text-left px-2 py-1">Locality</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1">{row.name}</td>
                      <td className="px-2 py-1">{row.birthday || '—'}</td>
                      <td className="px-2 py-1">{row.anniversary || '—'}</td>
                      <td className="px-2 py-1">{row.phone || '—'}</td>
                      <td className="px-2 py-1">{row.locality || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.length > 50 && <p className="text-slate-500 text-sm mt-2">… and {importPreview.length - 50} more</p>}
            </div>
            <div className="p-4 border-t flex gap-2">
              <button type="button" onClick={handleConfirmImport} disabled={saving} className="px-4 py-2 rounded bg-indigo-600 text-white font-medium disabled:opacity-50">Save {importPreview.length} to report</button>
              <button type="button" onClick={() => { setImportModalOpen(false); setImportPreview([]) }} className="px-4 py-2 rounded border border-slate-300 text-slate-700">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

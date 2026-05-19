import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import DepartmentTabBar from '../components/DepartmentTabBar'
import { useAuth } from '../context/AuthContext'
import {
  getDlightMembers,
  addDlightMember,
  updateDlightMember,
  deleteDlightMember,
  bulkAddDlightMembers,
} from '../services/firestore'

const SLUG = 'd-light'

const EMPTY_FORM = {
  name: '',
  dob: '',
  phone: '',
  email: '',
  nativity: '',
  currentPlace: '',
  serviceAttended: '',
  attendedDate: '',
  howKnown: '',
}

const FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'dob', label: 'DOB', type: 'date' },
  { key: 'phone', label: 'Ph. Number', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'nativity', label: 'Nativity', type: 'text' },
  { key: 'currentPlace', label: 'Current Place', type: 'text' },
  { key: 'serviceAttended', label: 'Service Attended', type: 'text' },
  { key: 'attendedDate', label: 'Date of Attending', type: 'date' },
  { key: 'howKnown', label: 'How They Know Church', type: 'text' },
]

// Excel column header → field key mapping
const EXCEL_HEADER_MAP = {
  'name': 'name',
  'full name': 'name',
  'dob': 'dob',
  'date of birth': 'dob',
  'ph. number': 'phone',
  'ph number': 'phone',
  'phone': 'phone',
  'phone number': 'phone',
  'mobile': 'phone',
  'email': 'email',
  'nativity': 'nativity',
  'current place': 'currentPlace',
  'current location': 'currentPlace',
  'service attended': 'serviceAttended',
  'service': 'serviceAttended',
  'date of attending': 'attendedDate',
  'attending date': 'attendedDate',
  'how they know church': 'howKnown',
  'how known': 'howKnown',
  'how do they know': 'howKnown',
}

function formatDateDisplay(iso) {
  if (!iso) return '—'
  try {
    const [y, m, d] = iso.split('-')
    if (!y || !m || !d) return iso
    return `${d}/${m}/${y}`
  } catch { return iso }
}

function normalizeExcelDate(val) {
  if (!val) return ''
  if (typeof val === 'number') {
    // Excel serial date → JS date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    if (isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  const s = String(val).trim()
  // Try DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

export default function DLightMembers() {
  const { userProfile, isAdmin, isFounder } = useAuth()
  const navigate = useNavigate()

  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [importRows, setImportRows] = useState(null)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  const canAccess = isAdmin || isFounder

  useEffect(() => {
    if (!canAccess) return
    setLoading(true)
    getDlightMembers()
      .then(setMembers)
      .catch(() => setError('Failed to load members.'))
      .finally(() => setLoading(false))
  }, [canAccess])

  if (!canAccess) {
    return (
      <div>
        <DepartmentTabBar slug={SLUG} activeTab="dataBackup" />
        <div className="flex items-center justify-center min-h-[40vh]">
          <p className="text-slate-500 text-sm">Access restricted to admins only.</p>
        </div>
      </div>
    )
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(member) {
    setEditingId(member.id)
    setForm({
      name: member.name,
      dob: member.dob,
      phone: member.phone,
      email: member.email,
      nativity: member.nativity,
      currentPlace: member.currentPlace,
      serviceAttended: member.serviceAttended,
      attendedDate: member.attendedDate,
      howKnown: member.howKnown,
    })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    setSaving(true)
    setFormError('')
    try {
      if (editingId) {
        await updateDlightMember(editingId, form)
        setMembers((prev) => prev.map((m) => m.id === editingId ? { ...m, ...form } : m))
      } else {
        const id = await addDlightMember(form, userProfile?.email || 'unknown')
        setMembers((prev) => [...prev, { id, ...form, createdAt: new Date() }])
      }
      setModalOpen(false)
    } catch {
      setFormError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await deleteDlightMember(deleteId)
      setMembers((prev) => prev.filter((m) => m.id !== deleteId))
      setDeleteId(null)
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  async function handleXlsxFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportError('')
    setImportRows(null)
    setImportResult(null)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!raw.length) { setImportError('No rows found in the file.'); return }
      const parsed = raw.map((row) => {
        const mapped = {}
        for (const [col, val] of Object.entries(row)) {
          const fieldKey = EXCEL_HEADER_MAP[String(col).trim().toLowerCase()]
          if (fieldKey) mapped[fieldKey] = val
        }
        const isDateField = (k) => k === 'dob' || k === 'attendedDate'
        const normalized = Object.fromEntries(
          Object.entries(mapped).map(([k, v]) => [k, isDateField(k) ? normalizeExcelDate(v) : String(v ?? '').trim()])
        )
        return { ...EMPTY_FORM, ...normalized, _valid: Boolean(normalized.name) }
      })
      setImportRows(parsed)
    } catch {
      setImportError('Failed to read file. Make sure it is a valid .xlsx or .xls file.')
    }
  }

  async function handleImport() {
    const valid = (importRows || []).filter((r) => r._valid)
    if (!valid.length) return
    setImporting(true)
    try {
      const result = await bulkAddDlightMembers(
        valid.map(({ _valid, ...rest }) => rest),
        userProfile?.email || 'unknown'
      )
      setImportResult(result)
      const fresh = await getDlightMembers()
      setMembers(fresh)
      setImportRows(null)
    } catch {
      setImportError('Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  async function handleExport() {
    const XLSX = await import('xlsx')
    const rows = members.map((m, i) => ({
      'SL.No': i + 1,
      'Name': m.name,
      'DOB': m.dob,
      'Ph. Number': m.phone,
      'Email': m.email,
      'Nativity': m.nativity,
      'Current Place': m.currentPlace,
      'Service Attended': m.serviceAttended,
      'Date of Attending': m.attendedDate,
      'How They Know Church': m.howKnown,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'D Light Members')
    XLSX.writeFile(wb, 'DLight_Members.xlsx')
  }

  return (
    <div>
      <DepartmentTabBar slug={SLUG} activeTab="dataBackup" />

      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">D Light Members</h1>
            <p className="text-sm text-slate-500 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {members.length > 0 && (
              <button
                onClick={handleExport}
                className="px-3 py-1.5 text-sm font-medium rounded border border-slate-300 hover:bg-slate-50 transition text-slate-700"
              >
                Export Excel
              </button>
            )}
            <label className="px-3 py-1.5 text-sm font-medium rounded border border-slate-300 hover:bg-slate-50 transition text-slate-700 cursor-pointer">
              Import Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileRef} onChange={handleXlsxFile} />
            </label>
            <button
              onClick={openAdd}
              className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 hover:bg-indigo-700 transition text-white"
            >
              + Add Member
            </button>
          </div>
        </div>

        {/* Import feedback */}
        {importError && (
          <div className="mb-3 px-3 py-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">{importError}</div>
        )}
        {importResult && (
          <div className="mb-3 px-3 py-2 rounded bg-green-50 border border-green-200 text-sm text-green-700">
            Imported {importResult.imported} member{importResult.imported !== 1 ? 's' : ''}
            {importResult.failed > 0 && ` · ${importResult.failed} failed`}
          </div>
        )}

        {/* Import preview */}
        {importRows && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">
                Preview: {importRows.filter((r) => r._valid).length} valid · {importRows.filter((r) => !r._valid).length} skipped (no name)
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setImportRows(null)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                <button
                  onClick={handleImport}
                  disabled={importing || !importRows.some((r) => r._valid)}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition text-white"
                >
                  {importing ? 'Importing…' : 'Confirm Import'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {['Name', 'DOB', 'Phone', 'Email', 'Nativity', 'Current Place'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} className={`border-t border-slate-100 ${!r._valid ? 'opacity-40' : ''}`}>
                      <td className="px-3 py-1.5">{r.name || '—'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{formatDateDisplay(r.dob)}</td>
                      <td className="px-3 py-1.5">{r.phone || '—'}</td>
                      <td className="px-3 py-1.5">{r.email || '—'}</td>
                      <td className="px-3 py-1.5">{r.nativity || '—'}</td>
                      <td className="px-3 py-1.5">{r.currentPlace || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Error / loading */}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        {loading && <p className="text-sm text-slate-500">Loading…</p>}

        {/* Members table – desktop */}
        {!loading && members.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600 w-12">SL.No</th>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600">Name</th>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600">DOB</th>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600">Ph. Number</th>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600">Email</th>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600">Nativity</th>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600">Current Place</th>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600">Service</th>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600">Date Attended</th>
                      <th className="px-3 py-2.5 text-left font-medium text-slate-600">How Known</th>
                      <th className="px-3 py-2.5 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m, i) => (
                      <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50 transition">
                        <td className="px-3 py-2 text-slate-500 text-center">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{m.name || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDateDisplay(m.dob)}</td>
                        <td className="px-3 py-2 text-slate-600">{m.phone || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{m.email || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{m.nativity || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{m.currentPlace || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{m.serviceAttended || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDateDisplay(m.attendedDate)}</td>
                        <td className="px-3 py-2 text-slate-600">{m.howKnown || '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => openEdit(m)} className="text-xs text-indigo-600 hover:underline">Edit</button>
                            <button onClick={() => setDeleteId(m.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {members.map((m, i) => (
                <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="text-xs text-slate-400 font-medium">#{i + 1}</span>
                      <p className="font-semibold text-slate-800">{m.name || '—'}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button onClick={() => openEdit(m)} className="text-xs text-indigo-600 font-medium">Edit</button>
                      <button onClick={() => setDeleteId(m.id)} className="text-xs text-red-500 font-medium">Delete</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {[
                      ['DOB', formatDateDisplay(m.dob)],
                      ['Phone', m.phone],
                      ['Email', m.email],
                      ['Nativity', m.nativity],
                      ['Current Place', m.currentPlace],
                      ['Service', m.serviceAttended],
                      ['Date Attended', formatDateDisplay(m.attendedDate)],
                      ['How Known', m.howKnown],
                    ].map(([label, val]) => val ? (
                      <div key={label}>
                        <span className="text-xs text-slate-400">{label}</span>
                        <p className="text-slate-700 text-sm leading-snug">{val}</p>
                      </div>
                    ) : null)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && members.length === 0 && !error && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm">No members yet. Add one or import from Excel.</p>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{editingId ? 'Edit Member' : 'Add Member'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {FIELDS.map(({ key, label, type, required }) => (
                  <div key={key} className={key === 'howKnown' ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <input
                      type={type}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                ))}
              </div>
              {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium transition"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h2 className="font-semibold text-slate-800 mb-2">Delete member?</h2>
            <p className="text-sm text-slate-500 mb-5">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium transition"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

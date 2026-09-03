import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import RowActionsMenu from '../components/RowActionsMenu'
import CreateFileModal from '../components/CreateFileModal'
import ProjectFileTemplate from '../components/ProjectFileTemplate'
import ProjectFileDetail from '../components/ProjectFileDetail'
import { subscribeProjectFiles, createProjectFile, updateProjectFile, deleteProjectFile, bulkCreateProjectFiles } from '../services/firestore'

// Founder-only office file registry — replaces the church office's physical
// project-file tracking log. See
// docs/superpowers/specs/2026-08-26-file-manager-design.md.

const REMARKS_OPTIONS = ['Active', 'Project Completed', 'Project Withheld', 'Archived']

const REMARKS_STYLES = {
  'Active': 'bg-indigo-50 text-indigo-700',
  'Project Completed': 'bg-emerald-50 text-emerald-700',
  'Project Withheld': 'bg-amber-50 text-amber-700',
  'Archived': 'bg-slate-100 text-slate-600',
}

function formatDisplayDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// SL No format: <D><MM><YYYY><NNN> — un-padded day, 2-digit month, 4-digit year,
// then the office's lifetime running file number zero-padded to 3 digits
// (e.g. "6032026138" = the 138th file, created 6 Mar 2026). Pre-filled but the
// Founder can still overwrite it before saving.
function nextSlNo(files) {
  const datePart = format(new Date(), 'dMMyyyy')
  const running = String(files.length + 1).padStart(3, '0')
  return `${datePart}${running}`
}

// Maps the office's existing Excel ledger headers onto our field names — same
// "lowercase the header, look it up" approach as DLightMembers' import. "No."
// (the sheet's own row-number column) is deliberately absent: Firestore doc
// order supplies the table's No. column, so an imported row number would just
// go stale the moment another file is added or deleted.
const EXCEL_HEADER_MAP = {
  'sl no': 'slNo', 'sl. no': 'slNo', 'sl no.': 'slNo', 'slno': 'slNo', 'sl number': 'slNo',
  'file name': 'fileName', 'filename': 'fileName', 'file': 'fileName', 'name': 'fileName',
  'remarks': 'remarks', 'status': 'remarks',
  'closing date': 'closingDate', 'closing': 'closingDate', 'closed date': 'closingDate',
}

function normalizeExcelDate(val) {
  if (!val) return ''
  if (typeof val === 'number') {
    const ms = Math.round((val - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  }
  if (val instanceof Date) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val).trim()
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ''
}

function normalizeRemarks(val) {
  const s = String(val || '').trim().toLowerCase()
  const match = REMARKS_OPTIONS.find((r) => r.toLowerCase() === s)
  return match || 'Active'
}

export default function FileManager() {
  const { isFounder, user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [remarksFilter, setRemarksFilter] = useState('all')
  const [fileModal, setFileModal] = useState(null) // null closed, {...} without id = create, with id = edit
  const [detailFileId, setDetailFileId] = useState(null)       // File Detail modal
  const [faceSheetFileId, setFaceSheetFileId] = useState(null) // face sheet overlay
  const [autoPrintId, setAutoPrintId] = useState(null)         // fire print dialog once, on creation
  const [deletingId, setDeletingId] = useState(null)
  const [openActionMenu, setOpenActionMenu] = useState(null)
  const [pageError, setPageError] = useState('')
  const [importRows, setImportRows] = useState(null)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!isFounder) return
    const unsub = subscribeProjectFiles(
      (list) => { setFiles(list); setLoading(false) },
      (err) => {
        setLoading(false)
        setPageError(
          err?.code === 'permission-denied'
            ? 'Failed to load files: permission denied. The project_files Firestore rule may not be deployed yet.'
            : 'Failed to load files. Please try again.'
        )
      }
    )
    return unsub
  }, [isFounder])

  // Derived (not synced via effect) so the open sheets always reflect the live
  // subscription — e.g. an activity or status just changed from within them —
  // with no separate copy of the record to keep in sync.
  const detailFile = useMemo(
    () => files.find((f) => f.id === detailFileId) || null,
    [files, detailFileId]
  )
  const faceSheetFile = useMemo(
    () => files.find((f) => f.id === faceSheetFileId) || null,
    [files, faceSheetFileId]
  )

  const visibleFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return files.filter((f) => {
      if (remarksFilter !== 'all' && f.remarks !== remarksFilter) return false
      if (q && !`${f.fileName} ${f.slNo}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [files, search, remarksFilter])

  function openCreate() {
    setFileModal({ slNo: nextSlNo(files), fileName: '', remarks: 'Active', closingDate: '' })
  }

  function openEdit(f) {
    setFileModal({ id: f.id, slNo: f.slNo || '', fileName: f.fileName || '', remarks: f.remarks || 'Active', closingDate: f.closingDate || '' })
  }

  async function handleSaveFile(form) {
    if (form.id) {
      await updateProjectFile(form.id, form)
    } else {
      const newId = await createProjectFile(form, user?.uid || null)
      setFaceSheetFileId(newId)
      setAutoPrintId(newId)
    }
    setFileModal(null)
  }

  async function handleDelete(id) {
    try {
      await deleteProjectFile(id)
      setDeletingId(null)
      if (detailFileId === id) setDetailFileId(null)
      if (faceSheetFileId === id) { setFaceSheetFileId(null); setAutoPrintId(null) }
    } catch {
      setPageError('Failed to delete file. Please try again.')
    }
  }

  async function handleXlsxFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportError('')
    setImportResult(null)
    setImportRows(null)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!raw.length) { setImportError('No rows found in the file.'); return }
      const parsed = raw.map((row) => {
        const mapped = {}
        for (const [col, val] of Object.entries(row)) {
          const fieldKey = EXCEL_HEADER_MAP[String(col).trim().toLowerCase()]
          if (fieldKey) mapped[fieldKey] = val
        }
        return {
          slNo: String(mapped.slNo ?? '').trim(),
          fileName: String(mapped.fileName ?? '').trim(),
          remarks: normalizeRemarks(mapped.remarks),
          closingDate: normalizeExcelDate(mapped.closingDate),
          _valid: Boolean(String(mapped.fileName ?? '').trim()),
        }
      })
      setImportRows(parsed)
    } catch {
      setImportError('Failed to read file. Make sure it is a valid .xlsx or .xls file.')
    }
  }

  async function handleConfirmImport() {
    const valid = (importRows || []).filter((r) => r._valid)
    if (!valid.length) return
    setImporting(true)
    try {
      const result = await bulkCreateProjectFiles(
        valid.map((r) => ({ slNo: r.slNo, fileName: r.fileName, remarks: r.remarks, closingDate: r.closingDate })),
        user?.uid || null
      )
      setImportResult(result)
      setImportRows(null)
    } catch {
      setImportError('Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  if (!isFounder) {
    return (
      <div className="p-6 text-slate-600">
        <p className="font-semibold text-slate-800 mb-2">File Manager</p>
        <p>Only Founder can access this page.</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5 pb-12">
      <div>
        <h1 className="text-xl font-black text-slate-800">File Manager</h1>
        <p className="text-sm text-slate-500">Office project-file registry — SL numbers, status, and printable activity logs.</p>
      </div>

      {pageError && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <span>{pageError}</span>
          <button type="button" onClick={() => setPageError('')} className="text-red-400 hover:text-red-600 font-semibold">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by file name or SL No…"
              className="w-64 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
            <select
              value={remarksFilter}
              onChange={(e) => setRemarksFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="all">All statuses</option>
              {REMARKS_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
              Import Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleXlsxFile} />
            </label>
            <button
              type="button"
              onClick={openCreate}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
            >
              + New Entry
            </button>
          </div>
        </div>

        {importError && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{importError}</div>
        )}

        {importResult && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
            Imported {importResult.imported} file{importResult.imported !== 1 ? 's' : ''}
            {importResult.failed > 0 && ` · ${importResult.failed} failed`}
          </div>
        )}

        {importRows && (
          <div className="mx-4 mt-3 rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-medium text-slate-700">
                Preview — {importRows.filter((r) => r._valid).length} valid · {importRows.filter((r) => !r._valid).length} skipped (no file name)
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setImportRows(null)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || !importRows.some((r) => r._valid)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors text-white"
                >
                  {importing ? 'Importing…' : 'Confirm Import'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {['SL No', 'File Name', 'Remarks', 'Closing Date'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} className={`border-t border-slate-100 ${!r._valid ? 'opacity-40' : ''}`}>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.slNo || '—'}</td>
                      <td className="px-3 py-1.5">{r.fileName || '—'}</td>
                      <td className="px-3 py-1.5">{r.remarks}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{formatDisplayDate(r.closingDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
        ) : visibleFiles.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            {files.length === 0 ? 'No files logged yet — click "New Entry" to add one.' : 'No files match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-indigo-700 bg-gradient-to-r from-indigo-50 via-violet-50 to-rose-50">
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100 w-14">No.</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">SL No</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">File Name</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Remarks</th>
                  <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Closing date</th>
                  <th className="px-3 py-2 border-b-2 border-indigo-100 w-12" />
                </tr>
              </thead>
              <tbody>
                {visibleFiles.map((f, idx) => (
                  <tr
                    key={f.id}
                    onClick={() => setDetailFileId(f.id)}
                    className={`border-b border-slate-100 cursor-pointer hover:bg-indigo-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}
                  >
                    <td className="px-3 py-2.5 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{f.slNo || '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{f.fileName || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${REMARKS_STYLES[f.remarks] || 'bg-slate-100 text-slate-600'}`}>
                        {f.remarks || 'Active'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatDisplayDate(f.closingDate)}</td>
                    <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      {deletingId === f.id ? (
                        <div className="flex items-center justify-center gap-1.5 text-[10px]">
                          <button type="button" onClick={() => handleDelete(f.id)} className="text-red-600 font-semibold hover:underline">Yes</button>
                          <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                        </div>
                      ) : (
                        <RowActionsMenu
                          menuKey={`project-file-${f.id}`}
                          openKey={openActionMenu}
                          onOpen={setOpenActionMenu}
                          onClose={() => setOpenActionMenu(null)}
                          extraItems={[{ label: 'Face Sheet', icon: '🖨', onClick: () => setFaceSheetFileId(f.id) }]}
                          onEdit={() => openEdit(f)}
                          onDelete={() => setDeletingId(f.id)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fileModal && (
        <CreateFileModal
          initial={fileModal}
          onCancel={() => setFileModal(null)}
          onSave={handleSaveFile}
        />
      )}

      {detailFile && (
        <ProjectFileDetail
          file={detailFile}
          onClose={() => setDetailFileId(null)}
          onOpenFaceSheet={(f) => { setDetailFileId(null); setFaceSheetFileId(f.id) }}
        />
      )}

      {faceSheetFile && (
        <ProjectFileTemplate
          file={faceSheetFile}
          autoPrint={autoPrintId === faceSheetFile.id}
          onClose={() => { setFaceSheetFileId(null); setAutoPrintId(null) }}
        />
      )}
    </div>
  )
}

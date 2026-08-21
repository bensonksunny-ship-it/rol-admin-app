import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { INCOME_TYPES } from '../../constants/roles'
import {
  getFinanceIncome,
  createFinanceIncome,
  updateFinanceIncome,
  deleteFinanceIncome,
} from '../../services/firestore'
import { categorizeEntries } from './income/incomeCategorize'
import IncomeSummaryTable from './income/IncomeSummaryTable'
import OfferingMatrixTable from './income/OfferingMatrixTable'
import CategoryListTable from './income/CategoryListTable'

// Pure integer Excel serial → yyyy-MM-dd. Zero JS Date usage — no timezone involved.
// Excel serial 1 = Jan 1 1900. Serial 60 is Excel's fake Feb 29 1900 (off-by-1 bug).
// After correcting for that bug, we map to a Unix day count and apply Hinnant's
// civil_from_days algorithm (pure Gregorian arithmetic).
function excelSerialToISO(serial) {
  if (!serial || serial <= 0) return ''
  let n = Math.floor(serial)
  if (n >= 60) n-- // skip Excel's phantom Feb 29 1900
  // Unix day 0 = Jan 1 1970. Excel serial 25569 (corrected: 25568) = Jan 1 1970.
  const z = n - 25568 + 719468 // shift to days-since-Mar-1-year-0 epoch
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const year = m <= 2 ? y + 1 : y
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  category: INCOME_TYPES[0],
  amount: '',
  giverName: '',
}

export default function IncomePage({ controlledMonth } = {}) {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [internalMonth, setInternalMonth] = useState(startOfMonth(new Date()))
  const activeMonth = controlledMonth || internalMonth
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [xlsxRows, setXlsxRows] = useState(null)
  const [xlsxError, setXlsxError] = useState('')
  const [xlsxResult, setXlsxResult] = useState(null)
  const [pendingImports, setPendingImports] = useState([])
  const [savingImports, setSavingImports] = useState(false)
  const [loadError, setLoadError] = useState('')
  const formRef = useRef(null)

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    load()
  }, [activeMonth, canAccess])

  useEffect(() => {
    if (!openMenuId) return
    function handleClickOutside(e) {
      if (!e.target.closest('[data-row-menu]')) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

  if (!canAccess) return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getFinanceIncome({
        year: activeMonth.getFullYear(),
        month: activeMonth.getMonth(),
      })
      setEntries(data)
    } catch (err) {
      console.error('Failed to load income:', err)
      setLoadError('Failed to load entries. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  const totalIncome = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const categorized = categorizeEntries(entries)
  const offeringEntries = [...categorized.englishOffering, ...categorized.tamilOffering, ...categorized.onlineOffering]
  const rowActionProps = { editMode, openMenuId, setOpenMenuId, deletingId, setDeletingId, onEdit: handleEdit, onDelete: handleDelete }

  function prevMonth() { setInternalMonth(m => subMonths(m, 1)) }
  function nextMonth() { setInternalMonth(m => addMonths(m, 1)) }

  function validate() {
    if (!form.date) return 'Date is required.'
    if (!form.amount || Number(form.amount) <= 0) return 'Amount must be greater than 0.'
    return ''
  }

  async function handleSave(e) {
    e.preventDefault()
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError('')
    setSaving(true)
    try {
      const payload = {
        date: form.date,
        category: form.category,
        amount: Number(form.amount),
        giverName: form.giverName.trim(),
      }
      if (editingId) {
        await updateFinanceIncome(editingId, payload)
      } else {
        await createFinanceIncome(payload)
      }
      setForm(EMPTY_FORM)
      setEditingId(null)
      await load()
    } catch {
      setSaveError('Failed to save. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(entry) {
    setEditingId(entry.id)
    setForm({
      date: entry.date instanceof Date
        ? format(entry.date, 'yyyy-MM-dd')
        : format(new Date(entry.date), 'yyyy-MM-dd'),
      category: entry.category || INCOME_TYPES[0],
      amount: String(entry.amount ?? ''),
      giverName: entry.giverName || '',
    })
    formRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function handleDelete(id) {
    try {
      await deleteFinanceIncome(id)
      setDeletingId(null)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      setSaveError('Failed to delete. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    }
  }

  async function handleXlsxFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setXlsxError('')
    setXlsxRows(null)
    setXlsxResult(null)
    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
      if (!raw.length) { setXlsxError('No data found in the file.'); return }

      const norm = (key) => String(key).toLowerCase().replace(/[\s_\-]/g, '')
      const rows = raw.map((row, i) => {
        const r = {}
        for (const [k, v] of Object.entries(row)) r[norm(k)] = v
        const rawDate = r['date'] ?? r['entrydate'] ?? ''
        const category = String(r['category'] ?? r['type'] ?? r['incometype'] ?? r['income'] ?? INCOME_TYPES[0]).trim()
        const giverName = String(r['givenby'] ?? r['giver'] ?? r['donorname'] ?? r['name'] ?? '').trim()
        const amount = Number(r['amount'] ?? r['amountrs'] ?? r['rs'] ?? 0) || 0

        let date = ''
        if (typeof rawDate === 'number' && rawDate > 0) {
          date = excelSerialToISO(rawDate)
        } else if (rawDate) {
          const s = String(rawDate).trim()
          // DD/MM/YYYY (Indian format)
          const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
          if (ddmm) {
            const [, dd, mm, yyyy] = ddmm
            date = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            date = s
          } else {
            // DD-MM-YYYY
            const ddmmDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
            if (ddmmDash) {
              const [, dd, mm, yyyy] = ddmmDash
              date = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
            }
          }
        }

        const error = !date ? 'Missing date' : amount <= 0 ? 'Invalid amount' : ''
        return { _row: i + 2, date, category, giverName, amount, _valid: !error, _error: error }
      })

      if (rows.every(r => !r._valid)) {
        setXlsxError('Could not parse rows. Make sure columns are: Date, Income Type, Given By, Amount')
        return
      }
      setXlsxRows(rows)
    } catch (err) {
      console.error(err)
      setXlsxError('Failed to read file. Make sure it is a valid .xlsx or .xls file.')
    }
  }

  function handleLoadPending() {
    const valid = (xlsxRows || []).filter(r => r._valid)
    if (!valid.length) return
    setPendingImports(valid)
    setXlsxRows(null)
  }

  async function handleSavePending() {
    if (!pendingImports.length) return
    setSavingImports(true)
    let imported = 0, failed = 0
    for (const row of pendingImports) {
      try {
        await createFinanceIncome({ date: row.date, category: row.category, giverName: row.giverName, amount: row.amount })
        imported++
      } catch { failed++ }
    }
    setSavingImports(false)
    setPendingImports([])
    setXlsxResult({ imported, failed, skipped: 0 })
    await load()
  }

  return (
    <div className="space-y-5 pb-12">

      {/* Month picker — hidden when month is controlled by parent */}
      {!controlledMonth && (
        <div className="flex items-center justify-center gap-4 py-2">
          <button
            type="button"
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="text-base font-semibold text-slate-800 w-36 text-center">
            {format(activeMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      )}

      {/* Excel upload result toast */}
      {xlsxResult && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-sm text-emerald-800 font-medium">
            Imported {xlsxResult.imported} {xlsxResult.imported === 1 ? 'entry' : 'entries'}
            {xlsxResult.skipped > 0 && ` · ${xlsxResult.skipped} skipped`}
            {xlsxResult.failed > 0 && ` · ${xlsxResult.failed} failed`}
          </p>
          <button type="button" onClick={() => setXlsxResult(null)} className="text-emerald-600 hover:text-emerald-800 text-lg leading-none">×</button>
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 font-medium">{loadError}</p>
          <button type="button" onClick={load} className="text-xs text-red-600 font-semibold hover:underline">Retry</button>
        </div>
      )}

      {/* Edit toggle */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-600">Income Breakdown</h2>
        <button
          type="button"
          onClick={() => { setEditMode(m => !m); setOpenMenuId(null); setDeletingId(null) }}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            editMode
              ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
              : 'border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-700'
          }`}
        >
          {editMode ? 'Done' : 'Edit'}
        </button>
      </div>

      {loading && (
        <div className="text-center text-sm text-slate-500 py-2">Loading…</div>
      )}

      <IncomeSummaryTable entries={entries} />

      <OfferingMatrixTable entries={offeringEntries} {...rowActionProps} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CategoryListTable title="Tithe - English" entries={categorized.titheEnglish} {...rowActionProps} />
        <CategoryListTable title="Tithe - Tamil" entries={categorized.titheTamil} {...rowActionProps} />
        <CategoryListTable title="Contribution" entries={categorized.contribution} {...rowActionProps} />
        <CategoryListTable title="Support from ROLCC" entries={categorized.supportFromROLCC} {...rowActionProps} />
        <CategoryListTable title="Other Income" entries={categorized.otherIncome} {...rowActionProps} />
      </div>

      {/* Bento grid: stats card + entry form */}
      <div ref={formRef} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">

        {/* Stats card — compact, square-ish */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg p-5 text-white flex flex-col justify-between min-h-[148px]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Total Income</p>
          <div>
            <p className="text-2xl font-bold leading-tight mt-1">
              ₹{totalIncome.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-emerald-200 mt-1.5">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · {format(activeMonth, 'MMM yyyy')}
            </p>
          </div>
        </div>

        {/* Entry form — glassmorphism card */}
        <form
          onSubmit={handleSave}
          className="sm:col-span-2 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_rgba(99,102,241,0.08)] ring-1 ring-inset ring-slate-100 p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Edit Income Entry' : 'Add Income Entry'}
            </h3>
            <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700 transition-colors shadow-sm">
              <span>📊</span> Upload Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleXlsxFile} />
            </label>
          </div>
          {xlsxError && <p className="text-xs font-medium text-red-600">{xlsxError}</p>}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Income Type</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              >
                {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Given By <span className="text-slate-400 font-normal">(opt.)</span></label>
              <input
                type="text"
                value={form.giverName}
                onChange={e => setForm(f => ({ ...f, giverName: e.target.value }))}
                placeholder="Name of giver"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>
          </div>

          {formError && (
            <p className="text-red-600 text-xs font-medium">{formError}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-sm text-slate-400 hover:text-slate-600 hover:underline"
              >
                Cancel
              </button>
            )}
          </div>

          {saveError && (
            <p className="text-xs font-medium text-red-600">{saveError}</p>
          )}
        </form>
      </div>

      {/* Pending imports */}
      {pendingImports.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border-b border-amber-100">
            <div>
              <span className="text-sm font-semibold text-amber-900">Pending Import</span>
              <span className="text-xs text-amber-700 ml-2">{pendingImports.length} {pendingImports.length === 1 ? 'entry' : 'entries'} — not saved yet</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingImports([])}
                className="text-xs text-amber-700 hover:underline"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSavePending}
                disabled={savingImports}
                className="px-3 min-h-[44px] py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {savingImports ? 'Saving…' : `Save ${pendingImports.length} ${pendingImports.length === 1 ? 'entry' : 'entries'}`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-amber-50/40 text-left text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  <th className="px-4 py-2 text-center w-10">No.</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Income Type</th>
                  <th className="px-4 py-2">Given By</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {pendingImports.map((row, idx) => (
                  <tr key={idx} className="bg-amber-50/20">
                    <td className="px-4 py-2.5 text-center text-xs text-amber-400 font-medium">{idx + 1}</td>
                    <td className="px-4 py-2.5 text-slate-700">{row.date.split('-').reverse().join('/')}</td>
                    <td className="px-4 py-2.5 text-slate-700">{row.category}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.giverName || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">₹{Number(row.amount).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Excel preview modal */}
      {xlsxRows && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col sm:max-w-2xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="font-semibold text-slate-800">Excel Preview</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {xlsxRows.filter(r => r._valid).length} valid · {xlsxRows.filter(r => !r._valid).length} skipped
                </p>
              </div>
              <button type="button" onClick={() => setXlsxRows(null)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b border-slate-100">
                  <tr className="text-left text-slate-500">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Income Type</th>
                    <th className="px-4 py-2 font-medium">Given By</th>
                    <th className="px-4 py-2 font-medium text-right">Amount</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {xlsxRows.map((row) => (
                    <tr key={row._row} className={row._valid ? '' : 'bg-red-50/60'}>
                      <td className="px-4 py-2 text-slate-700">
                        {row.date ? row.date.split('-').reverse().join('/') : '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-700">{row.category || '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{row.giverName || '—'}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-800">
                        {row._valid ? `₹${row.amount.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {row._valid
                          ? <span className="text-emerald-600">✓</span>
                          : <span className="text-red-500 text-[10px]">{row._error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-slate-500">
                Hint: columns — <span className="font-mono">Date, Income Type, Given By, Amount</span>
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setXlsxRows(null)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLoadPending}
                  disabled={!xlsxRows.some(r => r._valid)}
                  className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  Load to table →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

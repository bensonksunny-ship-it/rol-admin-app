import { useState, useEffect } from 'react'
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
  deleteAllFinanceIncomeForMonth,
} from '../../services/firestore'

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  category: INCOME_TYPES[0],
  amount: '',
  giverName: '',
}

export default function IncomePage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [activeMonth, setActiveMonth] = useState(startOfMonth(new Date()))
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false)
  const [removingAll, setRemovingAll] = useState(false)
  const [xlsxRows, setXlsxRows] = useState(null)
  const [xlsxError, setXlsxError] = useState('')
  const [importingXlsx, setImportingXlsx] = useState(false)
  const [xlsxResult, setXlsxResult] = useState(null)

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    load()
  }, [activeMonth, canAccess])

  if (!canAccess) return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    try {
      const data = await getFinanceIncome({
        year: activeMonth.getFullYear(),
        month: activeMonth.getMonth(),
      })
      setEntries(data)
    } catch {
      // list stays empty on error
    } finally {
      setLoading(false)
    }
  }

  const totalIncome = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  function prevMonth() { setActiveMonth(m => subMonths(m, 1)) }
  function nextMonth() { setActiveMonth(m => addMonths(m, 1)) }

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
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  async function handleRemoveAll() {
    setRemovingAll(true)
    try {
      await deleteAllFinanceIncomeForMonth(activeMonth.getFullYear(), activeMonth.getMonth())
      setEntries([])
    } catch {
      setSaveError('Failed to remove all. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setRemovingAll(false)
      setConfirmRemoveAll(false)
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
      // No cellDates — keep numeric serials so we can convert without any JS Date / timezone
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      // raw:true preserves numeric Excel serials for date cells
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
          // Excel serial — pure date math, no JS Date, no timezone shift
          const info = XLSX.SSF.parse_date_code(rawDate)
          if (info && info.y) {
            date = `${info.y}-${String(info.m).padStart(2, '0')}-${String(info.d).padStart(2, '0')}`
          }
        } else if (rawDate) {
          const s = String(rawDate).trim()
          // DD/MM/YYYY or D/M/YYYY — Indian format
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

  async function handleImportAll() {
    const valid = (xlsxRows || []).filter(r => r._valid)
    if (!valid.length) return
    setImportingXlsx(true)
    let imported = 0, failed = 0
    for (const row of valid) {
      try {
        await createFinanceIncome({ date: row.date, category: row.category, giverName: row.giverName, amount: row.amount })
        imported++
      } catch { failed++ }
    }
    setImportingXlsx(false)
    setXlsxRows(null)
    setXlsxResult({ imported, failed, skipped: (xlsxRows || []).filter(r => !r._valid).length })
    await load()
  }

  return (
    <div className="space-y-5 pb-12">

      {/* Month picker */}
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

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">Total Income</p>
        <p className="text-2xl font-bold text-indigo-700">
          ₹{totalIncome.toLocaleString('en-IN')}
        </p>
      </div>

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

      {/* Entry form */}
      <form
        onSubmit={handleSave}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-700">
            {editingId ? 'Edit Income Entry' : 'Add Income Entry'}
          </h3>
          <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700 transition-colors">
            <span>📊</span> Upload Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleXlsxFile} />
          </label>
        </div>
        {xlsxError && <p className="text-xs font-medium text-red-600">{xlsxError}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Income Type</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Given By <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={form.giverName}
              onChange={e => setForm(f => ({ ...f, giverName: e.target.value }))}
              placeholder="Name of giver"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
            >
              Cancel
            </button>
          )}
        </div>

        {saveError && (
          <p className="text-xs font-medium text-red-600">{saveError}</p>
        )}
      </form>

      {/* Income list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            No income recorded for this month.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Remove All bar */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
              <span className="text-xs text-slate-500">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
              {confirmRemoveAll ? (
                <span className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Remove all {entries.length} entries?</span>
                  <button
                    type="button"
                    onClick={handleRemoveAll}
                    disabled={removingAll}
                    className="text-red-600 font-semibold hover:underline disabled:opacity-50"
                  >
                    {removingAll ? 'Removing…' : 'Yes, Remove All'}
                  </button>
                  <button type="button" onClick={() => setConfirmRemoveAll(false)} className="text-slate-500 hover:underline">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemoveAll(true)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium hover:underline"
                >
                  Remove All
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-center w-10">No.</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Income Type</th>
                  <th className="px-4 py-3">Given By</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {entry.date instanceof Date
                        ? format(entry.date, 'dd/MM/yyyy')
                        : format(new Date(entry.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entry.category}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.giverName || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      ₹{Number(entry.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {deletingId === entry.id ? (
                        <span className="flex items-center justify-end gap-2 text-xs text-slate-600">
                          <span>Confirm delete?</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="text-red-600 font-medium hover:underline"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="text-slate-500 hover:underline"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(entry)}
                            className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 transition"
                            aria-label="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(entry.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition"
                            aria-label="Delete"
                          >
                            🗑️
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                <button type="button" onClick={() => setXlsxRows(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportAll}
                  disabled={importingXlsx || !xlsxRows.some(r => r._valid)}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 transition"
                >
                  {importingXlsx ? 'Importing…' : `Import ${xlsxRows.filter(r => r._valid).length} rows`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

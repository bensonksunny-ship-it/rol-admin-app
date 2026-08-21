import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { EXPENSE_CATEGORIES, normalizeDepartmentName } from '../../constants/roles'
import {
  listenFinanceExpense,
  createFinanceExpense,
  updateFinanceExpense,
  deleteFinanceExpense,
  getExpenseDepartments,
} from '../../services/firestore'
import WeeklyEntryPage from './WeeklyEntryPage'

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  item: '',
  billNo: '',
  amount: '',
}

const ROW_FIELDS = ['date', 'item', 'billNo', 'amount']
const BLANK_ROW = { date: '', item: '', billNo: '', amount: '' }
const BLANK_ROWS_COUNT = 10

function blankRows(count = BLANK_ROWS_COUNT) {
  return Array.from({ length: count }, () => ({ ...BLANK_ROW }))
}

// Per-department in-progress edit state, so multiple department cards can be
// expanded and edited independently at once. Never mutated directly — always
// spread into a fresh object via updateDeptState.
const DEFAULT_DEPT_STATE = {
  newRows: blankRows(),
  savingRows: false,
  rowsError: '',
  isEditingSaved: false,
  editRows: [],
  editSaving: false,
  editError: '',
}

function parseFlexibleDate(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const d = new Date(trimmed)
  return isNaN(d) ? '' : format(d, 'yyyy-MM-dd')
}

export default function ExpensePage({ controlledMonth } = {}) {
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
  const [filterDept, setFilterDept] = useState('all')
  const [xlsxRows, setXlsxRows] = useState(null)
  const [xlsxError, setXlsxError] = useState('')
  const [importingXlsx, setImportingXlsx] = useState(false)
  const [xlsxResult, setXlsxResult] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [expandedDepts, setExpandedDepts] = useState([])
  const [deptEditState, setDeptEditState] = useState({})

  function getDeptState(dept) {
    return deptEditState[dept] || DEFAULT_DEPT_STATE
  }

  function updateDeptState(dept, updater) {
    setDeptEditState(prev => {
      const current = prev[dept] || DEFAULT_DEPT_STATE
      return { ...prev, [dept]: { ...current, ...updater(current) } }
    })
  }

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)
  const isMonthLocked = activeMonth >= new Date(2026, 6, 1)
  const [deptOptions, setDeptOptions] = useState(EXPENSE_CATEGORIES)

  useEffect(() => {
    getExpenseDepartments().then(dynamic => {
      if (!dynamic.length) return
      const extra = dynamic.map(d => d.name).filter(n => !EXPENSE_CATEGORIES.includes(n))
      if (extra.length) setDeptOptions([...EXPENSE_CATEGORIES, ...extra])
    }).catch(() => {})
  }, [])

  const unsubRef = useRef(null)
  const formRef = useRef(null)
  const autoSaveTimersRef = useRef({})   // { [dept]: timeoutId }
  const prevNewRowsRef = useRef({})      // { [dept]: newRows array reference last seen }
  const autoSavingRef = useRef({})       // { [dept]: bool }

  useEffect(() => {
    if (!canAccess) return
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
    setLoading(true)
    setLoadError('')
    unsubRef.current = listenFinanceExpense(
      { year: activeMonth.getFullYear(), month: activeMonth.getMonth() },
      (data) => { setEntries(data); setLoading(false) },
      (err) => { console.error(err); setLoadError('Failed to load entries. Please refresh.'); setLoading(false) },
    )
    return () => { if (unsubRef.current) { unsubRef.current(); unsubRef.current = null } }
  }, [activeMonth, canAccess])

  // Auto-save any blank row that already has a valid date + amount, a moment after
  // the user stops typing/pasting, so entries survive even if "Save rows" is never clicked.
  // Each expanded department gets its own independent debounce timer, keyed off whether
  // that department's newRows array reference actually changed — so typing in one
  // department never resets or delays another's pending auto-save.
  useEffect(() => {
    expandedDepts.forEach(dept => {
      const rows = getDeptState(dept).newRows
      if (prevNewRowsRef.current[dept] === rows) return
      prevNewRowsRef.current[dept] = rows
      if (autoSaveTimersRef.current[dept]) clearTimeout(autoSaveTimersRef.current[dept])
      const hasFillable = rows.some(r => parseFlexibleDate(r.date) && Number(r.amount) > 0)
      if (!hasFillable) return
      autoSaveTimersRef.current[dept] = setTimeout(() => {
        autoSaveFillableRows(dept, rows)
      }, 900)
    })
    Object.keys(autoSaveTimersRef.current).forEach(dept => {
      if (!expandedDepts.includes(dept)) {
        clearTimeout(autoSaveTimersRef.current[dept])
        delete autoSaveTimersRef.current[dept]
        delete prevNewRowsRef.current[dept]
      }
    })
  }, [deptEditState, expandedDepts])

  useEffect(() => () => {
    Object.values(autoSaveTimersRef.current).forEach(clearTimeout)
  }, [])

  if (!canAccess) return <Navigate to="/" replace />

  const visibleEntries = filterDept === 'all'
    ? entries
    : entries.filter(e => normalizeDepartmentName(e.department || e.category) === filterDept)

  const totalExpense = visibleEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  const grandTotal = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const deptStats = deptOptions.map(dept => {
    const rows = entries.filter(e => normalizeDepartmentName(e.department || e.category) === dept)
    return {
      dept,
      rows,
      total: rows.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      count: rows.length,
    }
  })

  function prevMonth() { setInternalMonth(m => subMonths(m, 1)); setFilterDept('all') }
  function nextMonth() { setInternalMonth(m => addMonths(m, 1)); setFilterDept('all') }

  function selectDept(dept) {
    setFilterDept(dept)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Accordion: opening a department closes whichever one was open before it, so
  // other cards stay at their normal tile size until you actually select them.
  function toggleExpand(dept) {
    setExpandedDepts(prev => (prev.includes(dept) ? [] : [dept]))
    setDeptEditState(prev => ({ ...prev, [dept]: { ...DEFAULT_DEPT_STATE, newRows: blankRows() } }))
  }

  function editRowsFromEntries(rows) {
    return rows.map(r => ({
      id: r.id,
      date: r.date instanceof Date ? format(r.date, 'yyyy-MM-dd') : format(new Date(r.date), 'yyyy-MM-dd'),
      item: r.item || '',
      billNo: r.billNo || '',
      amount: String(r.amount ?? ''),
    }))
  }

  function handleStartEditSaved(dept, rows) {
    updateDeptState(dept, () => ({
      editRows: editRowsFromEntries(rows),
      editError: '',
      isEditingSaved: true,
    }))
  }

  function handleQuickEdit(dept, rows) {
    setExpandedDepts([dept])
    if (rows.length) {
      updateDeptState(dept, () => ({
        newRows: blankRows(),
        rowsError: '',
        editRows: editRowsFromEntries(rows),
        editError: '',
        isEditingSaved: true,
      }))
    } else {
      updateDeptState(dept, () => ({
        newRows: blankRows(),
        rowsError: '',
        isEditingSaved: false,
        editRows: [],
        editError: '',
      }))
    }
  }

  function handleCancelEditSaved(dept) {
    updateDeptState(dept, () => ({ isEditingSaved: false, editRows: [], editError: '' }))
  }

  function updateEditRowField(dept, idx, field, value) {
    updateDeptState(dept, (current) => ({
      editRows: current.editRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
  }

  async function handleSaveEditedRows(dept) {
    updateDeptState(dept, () => ({ editSaving: true, editError: '' }))
    const editRows = getDeptState(dept).editRows
    let failed = 0
    for (const row of editRows) {
      const date = parseFlexibleDate(row.date)
      const amount = Number(row.amount)
      if (!date || !amount || amount <= 0) { failed++; continue }
      try {
        await updateFinanceExpense(row.id, { date, department: dept, item: row.item, billNo: row.billNo, amount })
      } catch {
        failed++
      }
    }
    if (failed > 0) {
      updateDeptState(dept, () => ({
        editSaving: false,
        editError: `${failed} row${failed === 1 ? '' : 's'} could not be saved (need a valid date and amount).`,
      }))
      return
    }
    updateDeptState(dept, () => ({ editSaving: false, isEditingSaved: false, editRows: [] }))
  }

  function updateRowField(dept, idx, field, value) {
    updateDeptState(dept, (current) => ({
      newRows: current.newRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
  }

  function addMoreRows(dept, count = 5) {
    updateDeptState(dept, (current) => ({ newRows: [...current.newRows, ...blankRows(count)] }))
  }

  function handlePasteRow(e, dept, idx, field) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n') && !text.includes('\r')) return
    e.preventDefault()
    const pastedRows = text.replace(/\r/g, '').split('\n').filter((line, i, arr) => !(i === arr.length - 1 && line === ''))
    const startFieldIdx = ROW_FIELDS.indexOf(field)
    updateDeptState(dept, (current) => {
      const next = [...current.newRows]
      pastedRows.forEach((rowText, r) => {
        const targetRowIdx = idx + r
        while (next.length <= targetRowIdx) next.push({ ...BLANK_ROW })
        const cells = rowText.split('\t')
        cells.forEach((cellText, c) => {
          const fieldIdx = startFieldIdx + c
          if (fieldIdx >= ROW_FIELDS.length) return
          const fieldName = ROW_FIELDS[fieldIdx]
          const value = fieldName === 'date' ? (parseFlexibleDate(cellText) || cellText.trim()) : cellText.trim()
          next[targetRowIdx] = { ...next[targetRowIdx], [fieldName]: value }
        })
      })
      return { newRows: next }
    })
  }

  async function handleSaveRows(dept) {
    const fillable = getDeptState(dept).newRows.filter(r => r.date || r.item || r.billNo || r.amount)
    if (!fillable.length) return
    updateDeptState(dept, () => ({ savingRows: true, rowsError: '' }))
    let imported = 0, failed = 0
    for (const row of fillable) {
      const date = parseFlexibleDate(row.date)
      const amount = Number(row.amount)
      if (!date || !amount || amount <= 0) { failed++; continue }
      try {
        await createFinanceExpense({ date, department: dept, item: row.item, billNo: row.billNo, amount })
        imported++
      } catch { failed++ }
    }
    updateDeptState(dept, () => ({
      savingRows: false,
      rowsError: failed > 0 ? `${imported} saved, ${failed} skipped (need a valid date and amount).` : '',
      newRows: blankRows(),
    }))
  }

  async function handleUploadDeptExcel(e, dept) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    updateDeptState(dept, () => ({ rowsError: '' }))
    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!raw.length) { updateDeptState(dept, () => ({ rowsError: 'No data found in the file.' })); return }

      const norm = (key) => String(key).toLowerCase().replace(/[\s_-]/g, '')
      const parsed = raw.map((row) => {
        const r = {}
        for (const [k, v] of Object.entries(row)) r[norm(k)] = v
        const rawDate = r['date'] ?? r['entrydate'] ?? ''
        const item = String(r['item'] ?? r['description'] ?? r['particulars'] ?? r['narration'] ?? '').trim()
        const billNo = String(r['billno'] ?? r['bill'] ?? r['billnumber'] ?? r['invoiceno'] ?? '').trim()
        const amount = r['amount'] ?? r['amountrs'] ?? r['rs'] ?? r['total'] ?? ''
        const date = rawDate instanceof Date ? format(rawDate, 'yyyy-MM-dd') : parseFlexibleDate(rawDate)
        return { date, item, billNo, amount: String(amount) }
      }).filter(r => r.date || r.item || r.billNo || r.amount)

      if (!parsed.length) { updateDeptState(dept, () => ({ rowsError: 'Could not find any usable rows. Columns expected: Date, Item, Bill No, Amount.' })); return }
      setExpandedDepts([dept])
      updateDeptState(dept, () => ({ newRows: [...parsed, ...blankRows(5)] }))
    } catch (err) {
      console.error(err)
      updateDeptState(dept, () => ({ rowsError: 'Failed to read the file. Make sure it is a valid .xlsx or .xls file.' }))
    }
  }

  async function autoSaveFillableRows(dept, rows) {
    if (autoSavingRef.current[dept]) return
    const ready = rows
      .map((r, idx) => ({ ...r, idx }))
      .filter(r => parseFlexibleDate(r.date) && Number(r.amount) > 0)
    if (!ready.length) return
    autoSavingRef.current[dept] = true
    updateDeptState(dept, () => ({ savingRows: true }))
    const savedIdx = []
    for (const row of ready) {
      try {
        await createFinanceExpense({
          date: parseFlexibleDate(row.date),
          department: dept,
          item: row.item,
          billNo: row.billNo,
          amount: Number(row.amount),
        })
        savedIdx.push(row.idx)
      } catch {
        // leave it in place — either auto-save retries after the next change, or the user hits "Save rows"
      }
    }
    if (savedIdx.length) {
      updateDeptState(dept, (current) => ({
        newRows: current.newRows.map((r, i) => (savedIdx.includes(i) ? { ...BLANK_ROW } : r)),
      }))
    }
    updateDeptState(dept, () => ({ savingRows: false }))
    autoSavingRef.current[dept] = false
  }

  function validate() {
    if (filterDept === 'all') return 'Select a department before adding an entry.'
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
        department: filterDept,
        item: form.item,
        billNo: form.billNo,
        amount: Number(form.amount),
      }
      if (editingId) {
        await updateFinanceExpense(editingId, payload)
      } else {
        await createFinanceExpense(payload)
      }
      setForm(EMPTY_FORM)
      setEditingId(null)
    } catch {
      setSaveError('Failed to save. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(entry) {
    setEditingId(entry.id)
    setFilterDept(normalizeDepartmentName(entry.department || entry.category) || 'all')
    setForm({
      date: entry.date instanceof Date
        ? format(entry.date, 'yyyy-MM-dd')
        : format(new Date(entry.date), 'yyyy-MM-dd'),
      item: entry.item || '',
      billNo: entry.billNo || '',
      amount: String(entry.amount ?? ''),
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
      await deleteFinanceExpense(id)
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
      const wb = XLSX.read(data, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!raw.length) { setXlsxError('No data found in the file.'); return }

      const norm = (key) => String(key).toLowerCase().replace(/[\s_\-]/g, '')
      const rows = raw.map((row, i) => {
        const r = {}
        for (const [k, v] of Object.entries(row)) r[norm(k)] = v
        const rawDate = r['date'] ?? r['entrydate'] ?? ''
        const dept = String(r['department'] ?? r['dept'] ?? r['category'] ?? '').trim()
        const item = String(r['item'] ?? r['description'] ?? r['particulars'] ?? r['narration'] ?? '').trim()
        const billNo = String(r['billno'] ?? r['bill'] ?? r['billnumber'] ?? r['invoiceno'] ?? '').trim()
        const amount = Number(r['amount'] ?? r['amountrs'] ?? r['rs'] ?? r['total'] ?? 0) || 0

        let date = ''
        if (rawDate instanceof Date) date = format(rawDate, 'yyyy-MM-dd')
        else if (rawDate) { const d = new Date(rawDate); if (!isNaN(d)) date = format(d, 'yyyy-MM-dd') }

        const error = !date ? 'Missing date' : !dept ? 'Missing department' : amount <= 0 ? 'Invalid amount' : ''
        return { _row: i + 2, date, department: dept, item, billNo, amount, _valid: !error, _error: error }
      })

      if (rows.every(r => !r._valid)) {
        setXlsxError('Could not parse rows. Make sure columns are: Date, Department, Item, Bill No, Amount')
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
        await createFinanceExpense({ date: row.date, department: row.department, item: row.item, billNo: row.billNo, amount: row.amount, status: 'approved' })
        imported++
      } catch { failed++ }
    }
    setImportingXlsx(false)
    setXlsxRows(null)
    setXlsxResult({ imported, failed, skipped: (xlsxRows || []).filter(r => !r._valid).length })
  }

  const xlsxByDept = xlsxRows
    ? [...new Set(xlsxRows.map(r => r.department || '(No dept)'))].map(dept => ({
        dept,
        rows: xlsxRows.filter(r => (r.department || '(No dept)') === dept),
      }))
    : []

  return (
    <div className="space-y-5 pb-12">

      {/* Grid / Weekly view toggle */}
      <div className="flex justify-center">
        <div className="inline-flex gap-1 bg-slate-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode('weekly')}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              viewMode === 'weekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Weekly
          </button>
        </div>
      </div>

      {viewMode === 'weekly' && <WeeklyEntryPage />}

      {viewMode === 'weekly' ? null : (
      <>

      {/* Month picker — hidden when month is controlled by parent */}
      {!controlledMonth && (
        <div className="flex items-center justify-center gap-4 py-2">
          <button type="button" onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Previous month">‹</button>
          <span className="text-base font-semibold text-slate-800 w-36 text-center">{format(activeMonth, 'MMMM yyyy')}</span>
          <button type="button" onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Next month">›</button>
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

      {/* Department grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => selectDept('all')}
          className={`rounded-2xl border p-3.5 text-left transition-colors ${
            filterDept === 'all'
              ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
              : 'border-slate-200 bg-white hover:border-indigo-300'
          }`}
        >
          <p className="text-xs font-semibold text-slate-600">All</p>
          <p className="text-lg font-bold text-slate-900 mt-1">₹{grandTotal.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
        </button>
        {deptStats.map(({ dept, total, count, rows }) => {
          const isExpanded = expandedDepts.includes(dept)
          const { newRows, savingRows, rowsError, isEditingSaved, editRows, editSaving, editError } = getDeptState(dept)
          return (
          <div
            key={dept}
            className={`rounded-2xl border overflow-hidden transition-colors ${
              isExpanded
                ? 'border-indigo-400 ring-1 ring-indigo-300 col-span-2 sm:col-span-3 lg:col-span-2'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className={`flex items-start transition-colors ${isExpanded ? 'bg-indigo-50' : 'hover:bg-indigo-50/40'}`}>
              <button
                type="button"
                onClick={() => toggleExpand(dept)}
                className="flex-1 min-w-0 text-left p-3.5"
              >
                <p className="text-xs font-semibold text-slate-600 truncate">{dept}</p>
                <p className="text-lg font-bold text-slate-900 mt-1">₹{total.toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{count} {count === 1 ? 'entry' : 'entries'}</p>
              </button>
              <button
                type="button"
                onClick={() => handleQuickEdit(dept, rows)}
                title="Edit entries"
                className="m-2 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/60 transition-colors shrink-0"
              >
                ✏️
              </button>
              <label
                className="m-2 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/60 cursor-pointer transition-colors shrink-0"
                title="Upload Excel"
              >
                📊
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleUploadDeptExcel(e, dept)} />
              </label>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-100 bg-white">
                {rows.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
                      <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Entered
                      </p>
                      {!isEditingSaved ? (
                        <button
                          type="button"
                          onClick={() => handleStartEditSaved(dept, rows)}
                          title="Edit entries"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          ✏️
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          {editError && <p className="text-[10px] font-medium text-red-600">{editError}</p>}
                          <button
                            type="button"
                            onClick={() => handleSaveEditedRows(dept)}
                            disabled={editSaving}
                            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                          >
                            {editSaving ? 'Saving…' : 'Save Changes'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelEditSaved(dept)}
                            className="px-3 py-1 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:border-slate-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="text-left text-indigo-700 bg-gradient-to-r from-indigo-50 via-violet-50 to-rose-50">
                            <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide w-10 border-b-2 border-indigo-100">Sl</th>
                            <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Date</th>
                            <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Item</th>
                            <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide border-b-2 border-indigo-100">Bill No</th>
                            <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide text-right border-b-2 border-indigo-100">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!isEditingSaved ? rows.map((entry, idx) => (
                            <tr
                              key={entry.id}
                              className={`border-b border-slate-100 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}
                            >
                              <td className="px-3 py-2.5">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">{idx + 1}</span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap font-medium">
                                {entry.date instanceof Date ? format(entry.date, 'dd/MM') : format(new Date(entry.date), 'dd/MM')}
                              </td>
                              <td className="px-3 py-2.5 text-slate-700 truncate max-w-[220px]" title={entry.item || ''}>{entry.item || '—'}</td>
                              <td className="px-3 py-2.5">
                                {entry.billNo
                                  ? <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-medium">{entry.billNo}</span>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold text-rose-600">₹{Number(entry.amount).toLocaleString('en-IN')}</td>
                            </tr>
                          )) : editRows.map((row, idx) => (
                            <tr key={row.id} className={`border-b border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}>
                              <td className="px-3 py-2.5">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">{idx + 1}</span>
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.date}
                                  onChange={e => updateEditRowField(dept, idx, 'date', e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-white hover:border-indigo-300 focus:border-indigo-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.item}
                                  onChange={e => updateEditRowField(dept, idx, 'item', e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-white hover:border-indigo-300 focus:border-indigo-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.billNo}
                                  onChange={e => updateEditRowField(dept, idx, 'billNo', e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-white hover:border-amber-300 focus:border-amber-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 transition-colors"
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="text"
                                  value={row.amount}
                                  onChange={e => updateEditRowField(dept, idx, 'amount', e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-white hover:border-rose-300 focus:border-rose-400 px-2 py-1.5 text-sm text-right font-medium text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200 transition-colors"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Blank rows — paste a block copied from Excel into any cell to fill multiple rows at once */}
                <p className="px-3 pt-3 pb-1.5 text-[11px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Add new — type or paste from Excel
                </p>
                <div className="overflow-x-auto px-3 pb-1">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-emerald-700 bg-gradient-to-r from-emerald-50 via-teal-50 to-amber-50">
                        <th className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wide w-10 rounded-l-lg">Sl</th>
                        <th className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wide">Date</th>
                        <th className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wide">Item</th>
                        <th className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wide">Bill No</th>
                        <th className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wide text-right rounded-r-lg">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newRows.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                          <td className="px-2 py-1.5 text-center">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">{idx + 1}</span>
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={row.date}
                              onChange={e => updateRowField(dept, idx, 'date', e.target.value)}
                              onPaste={e => handlePasteRow(e, dept, idx, 'date')}
                              className="w-full rounded-lg border border-slate-200 bg-white hover:border-indigo-300 focus:border-indigo-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={row.item}
                              onChange={e => updateRowField(dept, idx, 'item', e.target.value)}
                              onPaste={e => handlePasteRow(e, dept, idx, 'item')}
                              className="w-full rounded-lg border border-slate-200 bg-white hover:border-indigo-300 focus:border-indigo-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-colors"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={row.billNo}
                              onChange={e => updateRowField(dept, idx, 'billNo', e.target.value)}
                              onPaste={e => handlePasteRow(e, dept, idx, 'billNo')}
                              className="w-full rounded-lg border border-slate-200 bg-white hover:border-amber-300 focus:border-amber-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 transition-colors"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={row.amount}
                              onChange={e => updateRowField(dept, idx, 'amount', e.target.value)}
                              onPaste={e => handlePasteRow(e, dept, idx, 'amount')}
                              className="w-full rounded-lg border border-slate-200 bg-white hover:border-rose-300 focus:border-rose-400 px-2 py-1.5 text-sm text-right font-medium text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200 transition-colors"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rowsError && <p className="px-3 py-1.5 text-xs font-medium text-red-600">{rowsError}</p>}
                <div className="p-3 bg-gradient-to-r from-slate-50 to-indigo-50/50 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveRows(dept)}
                    disabled={savingRows}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors"
                  >
                    {savingRows ? 'Saving…' : 'Save rows'}
                  </button>
                  <button
                    type="button"
                    onClick={() => addMoreRows(dept, 5)}
                    className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                  >
                    + Add more rows
                  </button>
                </div>
              </div>
            )}
          </div>
          )
        })}
      </div>

      {/* Bento: stat card + entry form */}
      <div ref={formRef} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start scroll-mt-4">

        {/* Stat card */}
        <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl shadow-lg p-5 text-white flex flex-col justify-between min-h-[148px]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-100">Total Expense</p>
          <div>
            <p className="text-2xl font-bold leading-tight mt-1">
              ₹{totalExpense.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-rose-200 mt-1.5">
              {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'} · {format(activeMonth, 'MMM yyyy')}
            </p>
            {filterDept !== 'all' && (
              <p className="text-[10px] text-rose-300 mt-0.5">{filterDept}</p>
            )}
          </div>
        </div>

        {/* Entry form */}
        {isMonthLocked ? (
          <div className="sm:col-span-2 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_rgba(99,102,241,0.08)] ring-1 ring-inset ring-slate-100 p-5 flex items-center justify-center min-h-[148px]">
            <p className="text-sm text-slate-400 text-center">Expense entry is closed from July 2026 onwards.</p>
          </div>
        ) : (
        <form
          onSubmit={handleSave}
          className="sm:col-span-2 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_rgba(99,102,241,0.08)] ring-1 ring-inset ring-slate-100 p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Edit Expense Entry' : 'Add Expense Entry'}
            </h3>
            <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700 transition-colors shadow-sm">
              <span>📊</span> Upload Excel
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleXlsxFile} />
            </label>
          </div>
          {xlsxError && <p className="text-xs font-medium text-red-600">{xlsxError}</p>}

          {filterDept === 'all' ? (
            <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Select a department above to add an entry.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Adding expense for <span className="font-semibold text-slate-700">{filterDept}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Bill No <span className="text-slate-400 font-normal">(opt.)</span></label>
              <input
                type="text"
                value={form.billNo}
                onChange={e => setForm(f => ({ ...f, billNo: e.target.value }))}
                placeholder="Bill number"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>
            <div className="flex flex-col gap-1 col-span-2 lg:col-span-3">
              <label className="text-xs font-medium text-slate-500">Item</label>
              <input
                type="text"
                value={form.item}
                onChange={e => setForm(f => ({ ...f, item: e.target.value }))}
                placeholder="Item description"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              />
            </div>
          </div>

          {formError && <p className="text-red-600 text-xs font-medium">{formError}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || filterDept === 'all'}
              className="px-5 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancelEdit} className="text-sm text-slate-400 hover:text-slate-600 hover:underline">Cancel</button>
            )}
          </div>

          {saveError && <p className="text-xs font-medium text-red-600">{saveError}</p>}
        </form>
        )}
      </div>

      {/* Load error */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 font-medium">{loadError}</p>
          <button type="button" onClick={load} className="text-xs text-red-600 font-semibold hover:underline">Retry</button>
        </div>
      )}

      {/* Expense list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
        ) : visibleEntries.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            {filterDept === 'all'
              ? 'No expenses recorded for this month.'
              : `No expenses recorded for ${filterDept} this month.`}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {visibleEntries.map((entry, idx) => (
                <div key={entry.id} className={`p-4 space-y-2 ${entry.status === 'pending' ? 'bg-amber-50/40' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">
                        <span className="text-xs font-normal text-slate-400 mr-1">#{idx + 1}</span>
                        ₹{Number(entry.amount).toLocaleString('en-IN')}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {entry.date instanceof Date
                          ? format(entry.date, 'dd/MM/yyyy')
                          : format(new Date(entry.date), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {entry.status === 'pending' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {normalizeDepartmentName(entry.department || entry.category)}
                      </span>
                    </div>
                  </div>
                  {(entry.item || entry.billNo) && (
                    <div className="text-xs text-slate-600 space-y-0.5">
                      {entry.item && <p>{entry.item}</p>}
                      {entry.billNo && <p className="text-slate-400">Bill: {entry.billNo}</p>}
                    </div>
                  )}
                  {deletingId === entry.id ? (
                    <div className="flex items-center gap-3 text-xs pt-1">
                      <span className="text-slate-600">Confirm delete?</span>
                      <button type="button" onClick={() => handleDelete(entry.id)} className="text-red-600 font-medium">Yes</button>
                      <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500">No</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={() => handleEdit(entry)} className="text-xs text-indigo-600 font-medium hover:underline">Edit</button>
                      <button type="button" onClick={() => setDeletingId(entry.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-center w-10">No.</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Bill No</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleEntries.map((entry, idx) => (
                    <tr key={entry.id} className={`transition ${entry.status === 'pending' ? 'bg-amber-50/40' : 'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {entry.date instanceof Date
                          ? format(entry.date, 'dd/MM/yyyy')
                          : format(new Date(entry.date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex items-center gap-1.5">
                          {normalizeDepartmentName(entry.department || entry.category)}
                          {entry.status === 'pending' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{entry.item || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{entry.billNo || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        ₹{Number(entry.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {deletingId === entry.id ? (
                          <span className="flex items-center justify-end gap-2 text-xs text-slate-600">
                            <span>Confirm delete?</span>
                            <button type="button" onClick={() => handleDelete(entry.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                            <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => handleEdit(entry)} className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 transition" aria-label="Edit">✏️</button>
                            <button type="button" onClick={() => setDeletingId(entry.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition" aria-label="Delete">🗑️</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {/* Excel preview modal */}
      {xlsxRows && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col sm:max-w-3xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="font-semibold text-slate-800">Excel Preview</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {xlsxRows.filter(r => r._valid).length} valid · {xlsxRows.filter(r => !r._valid).length} skipped · {xlsxByDept.length} department{xlsxByDept.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button type="button" onClick={() => setXlsxRows(null)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {xlsxByDept.map(({ dept, rows }) => (
                <div key={dept}>
                  <div className="px-5 py-2 bg-slate-50 flex items-center gap-2 sticky top-0">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{dept}</span>
                    <span className="text-xs text-slate-400">{rows.filter(r => r._valid).length} valid</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-100">
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Item</th>
                        <th className="px-4 py-2 font-medium">Bill No</th>
                        <th className="px-4 py-2 font-medium text-right">Amount</th>
                        <th className="px-4 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rows.map((row) => (
                        <tr key={row._row} className={row._valid ? '' : 'bg-red-50/60'}>
                          <td className="px-4 py-2 text-slate-700">{row.date || '—'}</td>
                          <td className="px-4 py-2 text-slate-700">{row.item || '—'}</td>
                          <td className="px-4 py-2 text-slate-500">{row.billNo || '—'}</td>
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
              ))}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-slate-500">
                Hint: columns — <span className="font-mono">Date, Department, Item, Bill No, Amount</span>
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setXlsxRows(null)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportAll}
                  disabled={importingXlsx || !xlsxRows.some(r => r._valid)}
                  className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {importingXlsx ? 'Importing…' : `Import ${xlsxRows.filter(r => r._valid).length} rows`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek, subMonths, addMonths, startOfMonth, endOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry, canAccessWeeklyEntryOnly } from '../../utils/accountsEntryAccess'
import { EXPENSE_CATEGORIES, normalizeDepartmentName } from '../../constants/roles'
import {
  getFinanceExpense,
  createFinanceExpense,
  updateFinanceExpense,
  deleteFinanceExpense,
  approveFinanceWeeklyEntry,
  approveAllFinanceWeeklyEntries,
  getExpenseDepartments,
  getAdvancePayoutRequests,
  setFinanceExpenseReceipt,
  getFinanceDeptConfirmations,
  confirmFinanceDeptPeriod,
  getDeptHeadsFromDirectory,
  getFinanceExpenseRemindersForMonth,
  sendFinanceExpenseReminders,
  getFinanceEntryUnlocksForMonth,
  setFinanceEntryUnlock,
  clearExpenseFollowUp,
} from '../../services/firestore'
import { getDepartmentRole } from '../../utils/access'
import { isMonthClosedForEntry, monthKeyOf, monthKeyLabel } from '../../utils/financeEntryLock'
import useFinanceMonthLocks from '../../hooks/useFinanceMonthLocks'
import { isExpenseDisputed } from '../../utils/expenseDispute'
import FinanceMonthLockBanner from '../../components/finance/FinanceMonthLockBanner'

const WEEK_START = { weekStartsOn: 1 }

// Bills entered here (rather than by the department itself) wait for the
// department's Director/Coordinator to confirm before they can be added.
// Accounts is the Finance Assistant's own department (and has no department
// Finance tab to confirm from), so its bills skip confirmation.
function needsDeptConfirmation(department) {
  return normalizeDepartmentName(department) !== 'Accounts'
}

function faEntryFlags(department) {
  return needsDeptConfirmation(department) ? { enteredByFinanceAssistant: true, deptConfirmation: 'pending' } : {}
}

// Waiting on the department's confirmation, or disputed by it (rejected /
// disapproved — see utils/expenseDispute.js).
function blockedByDept(entry) {
  return entry.deptConfirmation === 'pending' || isExpenseDisputed(entry)
}

// A bill can be added to accounts only once the department has confirmed it (when
// the Finance Assistant entered it) and its receipt has been handed in.
function canAddEntry(entry) {
  return !blockedByDept(entry) && !!entry.receiptConfirmed
}

// One-click "bill received" toggle (physical bill handed in and checked) shown at the right of every transaction.
function ReceiptButton({ entry, busy, locked, onToggle }) {
  const done = !!entry.receiptConfirmed
  return (
    <button
      type="button"
      onClick={() => onToggle(entry)}
      disabled={busy || locked}
      title={done ? `Bill received${entry.receiptConfirmedBy ? ` · ${entry.receiptConfirmedBy}` : ''} — click to undo` : 'Physical bill checked and received'}
      className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
        done
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400 hover:text-emerald-700'
      }`}
    >
      {busy ? '…' : done ? '✓ Bill received' : 'Bill received'}
    </button>
  )
}

function DeptConfirmBadge({ entry }) {
  if (entry.deptConfirmation === 'pending') {
    return <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Awaiting dept confirmation</span>
  }
  if (entry.status === 'disapproved') {
    return <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Disapproved by dept</span>
  }
  if (entry.deptConfirmation === 'rejected') {
    return (
      <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full" title={entry.deptRejectReason || ''}>
        Rejected by dept{entry.deptRejectReason ? `: ${entry.deptRejectReason}` : ''}
      </span>
    )
  }
  return null
}

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  item: '',
  billNo: '',
  amount: '',
}

export default function WeeklyEntryPage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [activeWeekStart, setActiveWeekStart] = useState(startOfWeek(new Date(), WEEK_START))
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [filterDept, setFilterDept] = useState('all')
  const [approvingId, setApprovingId] = useState(null)
  const [approvingAll, setApprovingAll] = useState(false)
  const [xlsxRows, setXlsxRows] = useState(null)
  const [xlsxError, setXlsxError] = useState('')
  const [importingXlsx, setImportingXlsx] = useState(false)
  const [xlsxResult, setXlsxResult] = useState(null)
  const [payoutRequests, setPayoutRequests] = useState([])
  const [payoutFilter, setPayoutFilter] = useState('approved')
  // Period shown: a single week, or a whole calendar month.
  const [period, setPeriod] = useState('week')
  const [activeMonthStart, setActiveMonthStart] = useState(startOfMonth(new Date()))
  // 'entries' = transaction list; 'departments' = per-department sign-off.
  const [view, setView] = useState('entries')
  const [receiptBusyId, setReceiptBusyId] = useState(null)
  const [confirmations, setConfirmations] = useState([])
  const [confirmingDept, setConfirmingDept] = useState(null)
  // Department Directors/Coordinators (from user_directory.deptHeadOf) and the
  // filing reminders already sent for the selected month.
  const [deptHeads, setDeptHeads] = useState([])
  const [reminders, setReminders] = useState([])
  const [sendingReminder, setSendingReminder] = useState(null)
  // Accounts Director's per-person unlocks of a closed month (finance_entry_unlocks).
  const [unlocks, setUnlocks] = useState([])
  const [unlockDept, setUnlockDept] = useState('')
  const [unlockBusy, setUnlockBusy] = useState(null)

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)
  const weeklyOnly = canAccessWeeklyEntryOnly(userProfile)
  const minWeekStart = startOfWeek(subMonths(new Date(), 3), WEEK_START)
  const minMonthStart = startOfMonth(subMonths(new Date(), 3))
  const actorName = userProfile?.displayName || userProfile?.email || 'Unknown'
  const [deptOptions, setDeptOptions] = useState(EXPENSE_CATEGORIES)

  useEffect(() => {
    getExpenseDepartments().then(dynamic => {
      if (!dynamic.length) return
      const extra = dynamic.map(d => d.name).filter(n => !EXPENSE_CATEGORIES.includes(n))
      if (extra.length) setDeptOptions([...EXPENSE_CATEGORIES, ...extra])
    }).catch(() => {})
  }, [])

  const loadPayouts = useCallback(async () => {
    try {
      const data = await getAdvancePayoutRequests(payoutFilter ? { status: payoutFilter } : {})
      setPayoutRequests(data)
    } catch (e) { console.error(e) }
  }, [payoutFilter])

  useEffect(() => { loadPayouts() }, [loadPayouts])

  useEffect(() => {
    getDeptHeadsFromDirectory().then(setDeptHeads).catch(() => {})
  }, [])

  useEffect(() => {
    if (!canAccess) return
    load()
  }, [activeWeekStart, activeMonthStart, period, canAccess])

  // Months past the 10th of the following month are locked for the finance team
  // unless the Founder reopened them (firestore.rules enforces the same).
  const { unlocks: monthUnlocks, isLocked: isMonthLocked, now: lockNow } = useFinanceMonthLocks(isFounder)

  if (!canAccess) return <Navigate to="/" replace />

  const entryLocked = (entry) => !!entry.date && isMonthLocked(monthKeyOf(entry.date))

  const rangeStart = period === 'month' ? activeMonthStart : activeWeekStart
  const rangeEnd = period === 'month' ? endOfMonth(activeMonthStart) : endOfWeek(activeWeekStart, WEEK_START)
  const periodKey = period === 'month'
    ? `month:${format(activeMonthStart, 'yyyy-MM')}`
    : `week:${format(activeWeekStart, 'yyyy-MM-dd')}`
  const periodLabel = period === 'month'
    ? format(activeMonthStart, 'MMMM yyyy')
    : `${format(activeWeekStart, 'd MMM')} – ${format(rangeEnd, 'd MMM yyyy')}`
  const monthKey = format(activeMonthStart, 'yyyy-MM')
  const monthLabel = format(activeMonthStart, 'MMMM yyyy')
  // Filing deadline: the 5th of the following month.
  const dueLabel = format(new Date(activeMonthStart.getFullYear(), activeMonthStart.getMonth() + 1, 5), 'do MMMM yyyy')
  const atMinPeriod = weeklyOnly && (period === 'month' ? activeMonthStart <= minMonthStart : activeWeekStart <= minWeekStart)

  async function load() {
    setLoading(true)
    try {
      const end = new Date(new Date(rangeEnd).setHours(23, 59, 59, 999))
      const [data, confs, rems, unl] = await Promise.all([
        getFinanceExpense({ startDate: rangeStart, endDate: end }),
        getFinanceDeptConfirmations(periodKey).catch(() => []),
        period === 'month' ? getFinanceExpenseRemindersForMonth(monthKey).catch(() => []) : Promise.resolve([]),
        period === 'month' ? getFinanceEntryUnlocksForMonth(monthKey).catch(() => []) : Promise.resolve([]),
      ])
      setEntries(data)
      setConfirmations(confs)
      setReminders(rems)
      setUnlocks(unl)
    } catch {
      // list stays empty on error
    } finally {
      setLoading(false)
    }
  }

  const visibleEntries = filterDept === 'all'
    ? entries
    : entries.filter(e => normalizeDepartmentName(e.department || e.category) === filterDept)

  const pendingEntries = visibleEntries.filter(e => e.status !== 'approved' && canAddEntry(e) && !entryLocked(e))
  const awaitingDeptCount = visibleEntries.filter(e => e.status !== 'approved' && blockedByDept(e)).length
  const missingReceiptCount = visibleEntries.filter(e => !e.receiptConfirmed).length
  const totalExpense = visibleEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  // Per-department roll-up for the selected period (Confirm by Department view).
  const confirmationByDept = Object.fromEntries(confirmations.map(c => [c.department, c]))
  const deptGroups = [...new Set(entries.map(e => normalizeDepartmentName(e.department || e.category) || '(No dept)'))]
    .sort((a, b) => a.localeCompare(b))
    .map(dept => {
      const rows = entries.filter(e => (normalizeDepartmentName(e.department || e.category) || '(No dept)') === dept)
      const confirmation = confirmationByDept[dept] || null
      const confirmedIds = new Set(confirmation?.expenseIds || [])
      return {
        dept,
        rows,
        total: rows.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        receipts: rows.filter(e => e.receiptConfirmed).length,
        awaitingDept: rows.filter(blockedByDept).length,
        confirmation,
        // Bills that arrived after the department was signed off for this period.
        newSinceConfirm: confirmation ? rows.filter(e => !confirmedIds.has(e.id)).length : 0,
      }
    })

  // Month view only: Directors/Coordinators whose department hasn't filed a single
  // expense of its own this month (bills the Finance Assistant entered don't count).
  // Accounts is the Finance Assistant's own department, so it's left out.
  const filedDepts = new Set(entries.filter(e => !e.enteredByFinanceAssistant).map(e => normalizeDepartmentName(e.department || e.category)))
  const expenseDepts = new Set(deptOptions.map(normalizeDepartmentName).filter(d => d !== 'Accounts'))
  const reminderByKey = Object.fromEntries(reminders.map(r => [`${r.toUid}_${r.department}`, r]))
  const notFiled = []
  const seenHead = new Set()
  deptHeads.forEach(u => {
    (u.deptHeadOf || []).forEach(raw => {
      const dept = normalizeDepartmentName(raw)
      const key = `${u.uid || u.id}_${dept}`
      if (!expenseDepts.has(dept) || filedDepts.has(dept) || seenHead.has(key)) return
      seenHead.add(key)
      notFiled.push({ key, uid: u.uid || u.id, name: u.name || u.email || 'Unknown', email: u.email || '', dept, reminder: reminderByKey[key] || null })
    })
  })
  const notFiledByDept = [...new Set(notFiled.map(h => h.dept))].sort((a, b) => a.localeCompare(b))
    .map(dept => ({ dept, heads: notFiled.filter(h => h.dept === dept) }))

  // Late-entry unlock (Accounts Director / Founder only): once the 5th of the next
  // month has passed, a department can't enter this month's expenses unless a
  // named Director/Coordinator is unlocked here.
  const canUnlock = isFounder || getDepartmentRole(userProfile, 'Accounts') === 'DIRECTOR'
  const monthClosed = isMonthClosedForEntry(monthKey)
  const unlockByKey = Object.fromEntries(unlocks.filter(u => u.active).map(u => [`${u.toUid}_${u.department}`, u]))
  const headsByDept = {}
  deptHeads.forEach(u => {
    (u.deptHeadOf || []).forEach(raw => {
      const dept = normalizeDepartmentName(raw)
      if (!expenseDepts.has(dept)) return
      const uid = u.uid || u.id
      headsByDept[dept] = headsByDept[dept] || []
      if (!headsByDept[dept].some(h => h.uid === uid)) headsByDept[dept].push({ uid, name: u.name || u.email || 'Unknown' })
    })
  })
  const unlockDeptOptions = Object.keys(headsByDept).sort((a, b) => a.localeCompare(b))
  const activeUnlocks = unlocks.filter(u => u.active)

  async function toggleUnlock(head, dept, active) {
    const key = `${head.uid}_${dept}`
    setUnlockBusy(key)
    try {
      await setFinanceEntryUnlock({ month: monthKey, monthLabel, department: dept, toUid: head.uid, toName: head.name }, active, actorName)
      setUnlocks(await getFinanceEntryUnlocksForMonth(monthKey))
    } catch {
      setSaveError('Failed to update unlock. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setUnlockBusy(null)
    }
  }

  async function sendReminders(heads, busyKey) {
    if (!heads.length) return
    setSendingReminder(busyKey)
    try {
      await sendFinanceExpenseReminders(heads.map(h => ({
        toUid: h.uid,
        toName: h.name,
        toEmail: h.email,
        department: h.dept,
        month: monthKey,
        monthLabel,
        dueLabel,
        message: `Please file your ${h.dept} expenses for ${monthLabel} before ${dueLabel}.`,
      })), actorName)
      setReminders(await getFinanceExpenseRemindersForMonth(monthKey))
    } catch {
      setSaveError('Failed to send reminder. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setSendingReminder(null)
    }
  }

  function prevPeriod() {
    if (period === 'month') {
      setActiveMonthStart(m => {
        const prev = subMonths(m, 1)
        return (weeklyOnly && prev < minMonthStart) ? m : prev
      })
    } else {
      setActiveWeekStart(w => {
        const prev = subWeeks(w, 1)
        return (weeklyOnly && prev < minWeekStart) ? w : prev
      })
    }
  }
  function nextPeriod() {
    if (period === 'month') setActiveMonthStart(m => addMonths(m, 1))
    else setActiveWeekStart(w => addWeeks(w, 1))
  }

  async function handleToggleReceipt(entry) {
    const received = !entry.receiptConfirmed
    setReceiptBusyId(entry.id)
    try {
      await setFinanceExpenseReceipt(entry.id, received, actorName)
      setEntries(prev => prev.map(e => e.id === entry.id
        ? { ...e, receiptConfirmed: received, receiptConfirmedBy: received ? actorName : '' }
        : e))
    } catch {
      setSaveError('Failed to update bill status. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setReceiptBusyId(null)
    }
  }

  async function handleConfirmDept(group) {
    setConfirmingDept(group.dept)
    try {
      const pendingIds = group.rows.filter(e => e.status !== 'approved').map(e => e.id)
      await confirmFinanceDeptPeriod({
        periodKey,
        department: group.dept,
        expenseIds: group.rows.map(e => e.id),
        pendingIds,
        total: group.total,
        confirmedBy: actorName,
      })
      await load()
    } catch {
      setSaveError(`Failed to confirm ${group.dept}. Please try again.`)
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setConfirmingDept(null)
    }
  }

  function validate() {
    if (filterDept === 'all') return 'Select a department before adding an entry.'
    if (form.date && isMonthLocked(form.date.slice(0, 7))) return `${monthKeyLabel(form.date.slice(0, 7))} is locked. Only the Founder can unlock it.`
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
        status: 'pending',
      }
      if (editingId) {
        await updateFinanceExpense(editingId, { ...payload, deptConfirmation: needsDeptConfirmation(filterDept) ? 'pending' : '' })
      } else {
        await createFinanceExpense({ ...payload, ...faEntryFlags(filterDept), createdBy: userProfile?.email || 'unknown' })
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
      clearExpenseFollowUp(id).catch(() => {})
      setDeletingId(null)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      setSaveError('Failed to delete. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    }
  }

  async function handleApprove(id) {
    setApprovingId(id)
    try {
      await approveFinanceWeeklyEntry(id)
      setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'approved' } : e))
    } catch {
      setSaveError('Failed to approve. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setApprovingId(null)
    }
  }

  async function handleApproveAll() {
    const ids = pendingEntries.map(e => e.id)
    if (!ids.length) return
    setApprovingAll(true)
    try {
      await approveAllFinanceWeeklyEntries(ids)
      setEntries(prev => prev.map(e =>
        ids.includes(e.id) ? { ...e, status: 'approved' } : e
      ))
    } catch {
      setSaveError('Failed to approve all. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setApprovingAll(false)
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
        const rawDate = r['date'] ?? r['entrydate'] ?? r['transactiondate'] ?? ''
        const dept = String(r['department'] ?? r['dept'] ?? r['category'] ?? '').trim()
        const item = String(r['item'] ?? r['description'] ?? r['particulars'] ?? r['narration'] ?? '').trim()
        const billNo = String(r['billno'] ?? r['bill'] ?? r['billnumber'] ?? r['invoiceno'] ?? r['voucherno'] ?? '').trim()
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
        await createFinanceExpense({ date: row.date, department: row.department, item: row.item, billNo: row.billNo, amount: row.amount, status: 'pending', ...faEntryFlags(row.department), createdBy: userProfile?.email || 'unknown' })
        imported++
      } catch { failed++ }
    }
    setImportingXlsx(false)
    setXlsxRows(null)
    setXlsxResult({ imported, failed, skipped: (xlsxRows || []).filter(r => !r._valid).length })
    await load()
  }

  // Group preview rows by department
  const xlsxByDept = xlsxRows
    ? [...new Set(xlsxRows.map(r => r.department || '(No dept)'))].map(dept => ({
        dept,
        rows: xlsxRows.filter(r => (r.department || '(No dept)') === dept),
      }))
    : []

  return (
    <div className="space-y-5 pb-12">

      {/* Period: Week / Month toggle + picker */}
      <div className="flex flex-col items-center gap-2 py-2">
        <div className="flex bg-slate-100 rounded-xl p-1">
          {[{ key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }].map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                period === p.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={prevPeriod}
            disabled={atMinPeriod}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={`Previous ${period}`}
          >
            ‹
          </button>
          <span className="text-base font-semibold text-slate-800 text-center">{periodLabel}</span>
          <button
            type="button"
            onClick={nextPeriod}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
            aria-label={`Next ${period}`}
          >
            ›
          </button>
        </div>
      </div>

      {/* View: transaction list / per-department sign-off */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'entries', label: 'Transactions' },
          { key: 'departments', label: 'Confirm Department Expenses' },
        ].map(v => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              view === v.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Lock state of the month(s) in view — page tint + lock icon */}
      {[...new Set([monthKeyOf(rangeStart), monthKeyOf(rangeEnd)])].map(mk => (
        <FinanceMonthLockBanner key={mk} monthKey={mk} unlock={monthUnlocks[mk]} now={lockNow} />
      ))}

      {view === 'departments' && (
        <div className="space-y-3">
          {/* Late-entry unlock — Accounts Director only, closed months only */}
          {period === 'month' && monthClosed && canUnlock && !isMonthLocked(monthKey) && !loading && (
            <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200">
                <p className="text-sm font-semibold text-indigo-900">Unlock department entry · {monthLabel}</p>
                <p className="text-xs text-indigo-800 mt-0.5">
                  Entry for {monthLabel} closed on {dueLabel}. Unlock it for a particular Director/Coordinator to let them file late.
                </p>
              </div>
              <div className="p-4 space-y-3">
                {activeUnlocks.length > 0 && (
                  <div className="space-y-1.5">
                    {activeUnlocks.map(u => (
                      <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-slate-700">
                          🔓 Unlocked for <span className="font-semibold">{u.toName || 'Unknown'}</span> ({u.department})
                          {u.unlockedBy ? <span className="text-xs text-slate-400"> · by {u.unlockedBy}</span> : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleUnlock({ uid: u.toUid, name: u.toName }, u.department, false)}
                          disabled={!!unlockBusy}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {unlockBusy === `${u.toUid}_${u.department}` ? '…' : 'Lock again'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-slate-600 shrink-0">Department</label>
                  <select
                    value={unlockDept}
                    onChange={e => setUnlockDept(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select department…</option>
                    {unlockDeptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                {unlockDept && (headsByDept[unlockDept] || []).map(h => {
                  const isUnlocked = !!unlockByKey[`${h.uid}_${unlockDept}`]
                  return (
                    <div key={h.uid} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-slate-800">{h.name}</span>
                      {isUnlocked ? (
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Unlocked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleUnlock(h, unlockDept, true)}
                          disabled={!!unlockBusy}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {unlockBusy === `${h.uid}_${unlockDept}` ? 'Unlocking…' : `Unlock department entry for ${h.name}`}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Directors/Coordinators who haven't filed this month — month view only */}
          {period === 'week' ? (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Switch to <button type="button" onClick={() => setPeriod('month')} className="font-semibold text-indigo-600 hover:underline">Month</button> to see which Directors/Coordinators haven't filed expenses and send them reminders.
            </p>
          ) : !loading && (
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-amber-900">Not filed yet · {monthLabel}</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Directors/Coordinators whose department hasn't entered any expense this month. Deadline: {dueLabel}.
                  </p>
                </div>
                {notFiled.some(h => !h.reminder) && (
                  <button
                    type="button"
                    onClick={() => sendReminders(notFiled.filter(h => !h.reminder), 'all')}
                    disabled={!!sendingReminder}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50 transition"
                  >
                    {sendingReminder === 'all' ? 'Sending…' : `Remind all (${notFiled.filter(h => !h.reminder).length})`}
                  </button>
                )}
              </div>
              {notFiledByDept.length === 0 ? (
                <p className="px-4 py-4 text-sm text-emerald-700">Every department has filed expenses for {monthLabel}.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notFiledByDept.map(({ dept, heads }) => (
                    <li key={dept} className="px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{dept}</p>
                      <div className="space-y-2">
                        {heads.map(h => (
                          <div key={h.key} className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm text-slate-800">{h.name}</p>
                              {h.reminder && (
                                <p className="text-[11px] text-slate-400">
                                  Reminded{h.reminder.sentAt ? ` on ${format(h.reminder.sentAt, 'd MMM')}` : ''}{h.reminder.sentBy ? ` by ${h.reminder.sentBy}` : ''}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => sendReminders([h], h.key)}
                              disabled={!!sendingReminder}
                              className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
                                h.reminder
                                  ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
                                  : 'border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100'
                              }`}
                            >
                              {sendingReminder === h.key ? 'Sending…' : h.reminder ? 'Remind again' : 'Send reminder'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500">
            Departments hand over their bills in person. Check each physical bill and tick <b>Bill received</b>. Once every bill of a department is in for {periodLabel}, confirm its expenses. This adds them all to accounts.
          </p>
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500 text-sm">Loading…</div>
          ) : deptGroups.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">No expenses for {periodLabel}.</div>
          ) : deptGroups.map(g => {
            const allReceipts = g.receipts === g.rows.length
            const ready = allReceipts && g.awaitingDept === 0 && !g.rows.some(entryLocked)
            const isConfirmed = !!g.confirmation && g.newSinceConfirm === 0
            return (
              <div key={g.dept} className={`bg-white rounded-xl border shadow-sm p-4 ${isConfirmed ? 'border-emerald-200' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{g.dept}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {g.rows.length} {g.rows.length === 1 ? 'bill' : 'bills'} · ₹{g.total.toLocaleString('en-IN')}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${allReceipts ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        Bills received {g.receipts}/{g.rows.length}
                      </span>
                      {g.awaitingDept > 0 && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                          {g.awaitingDept} awaiting/rejected by dept
                        </span>
                      )}
                      {g.newSinceConfirm > 0 && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                          {g.newSinceConfirm} new since confirmation
                        </span>
                      )}
                    </div>
                    {g.confirmation && (
                      <p className="text-[11px] text-emerald-700 mt-2">
                        Confirmed by {g.confirmation.confirmedBy || '—'}
                        {g.confirmation.confirmedAt ? ` on ${format(g.confirmation.confirmedAt, 'd MMM yyyy')}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isConfirmed ? (
                      <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-semibold">✓ Confirmed</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleConfirmDept(g)}
                        disabled={!ready || confirmingDept === g.dept}
                        title={ready ? '' : !allReceipts ? 'Tick Bill received for every bill first' : 'Waiting on the department to confirm bills'}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        {confirmingDept === g.dept ? 'Confirming…' : `Confirm ${g.dept} expenses`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Every expense of this department, each with a one-click "bill received"
                    once the Finance Assistant has the physical bill in hand and checked it. */}
                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                  {g.rows.map(e => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">
                          {e.item || '—'}
                          <span className="ml-2 font-semibold tabular-nums">₹{Number(e.amount || 0).toLocaleString('en-IN')}</span>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {e.date ? format(e.date instanceof Date ? e.date : new Date(e.date), 'dd/MM/yyyy') : '—'}
                          {e.billNo ? ` · Bill ${e.billNo}` : ''}
                          {e.receiptConfirmed && e.receiptConfirmedBy ? ` · received by ${e.receiptConfirmedBy}` : ''}
                        </p>
                        {blockedByDept(e) && <div className="mt-1"><DeptConfirmBadge entry={e} /></div>}
                      </div>
                      <ReceiptButton entry={e} busy={receiptBusyId === e.id} locked={entryLocked(e)} onToggle={handleToggleReceipt} />
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {saveError && <p className="text-xs font-medium text-red-600">{saveError}</p>}
        </div>
      )}

      {view === 'entries' && (<>
      {/* Department filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600 shrink-0">Department</label>
        <select
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Departments</option>
          {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">
          Total This {period === 'month' ? 'Month' : 'Week'}
          {missingReceiptCount > 0 && (
            <span className="block text-xs text-amber-600 mt-0.5">{missingReceiptCount} bill{missingReceiptCount === 1 ? '' : 's'} not yet handed over</span>
          )}
        </p>
        <p className="text-2xl font-bold text-rose-600">
          ₹{totalExpense.toLocaleString('en-IN')}
        </p>
      </div>

      {/* Entry form */}
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

      <form
        onSubmit={handleSave}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-700">
            {editingId ? 'Edit Entry' : 'Add Entry'}
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
            <label className="text-xs font-medium text-slate-600">Item</label>
            <input
              type="text"
              value={form.item}
              onChange={e => setForm(f => ({ ...f, item: e.target.value }))}
              placeholder="Item description"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Bill No</label>
            <input
              type="text"
              value={form.billNo}
              onChange={e => setForm(f => ({ ...f, billNo: e.target.value }))}
              placeholder="Bill number"
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
            className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium disabled:opacity-50 transition-colors"
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

      {/* Review list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* List header with Add All */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            {period === 'month' ? 'Monthly' : 'Weekly'} Entries
            {pendingEntries.length > 0 && (
              <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                {pendingEntries.length} ready to add
              </span>
            )}
            {awaitingDeptCount > 0 && (
              <span className="ml-2 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                {awaitingDeptCount} with department
              </span>
            )}
          </p>
          {pendingEntries.length > 0 && (
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={approvingAll}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50 transition"
            >
              {approvingAll ? 'Adding…' : 'Add All'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
        ) : visibleEntries.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            {filterDept === 'all'
              ? `No entries for ${periodLabel}.`
              : `No entries for ${filterDept} in ${periodLabel}.`}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {visibleEntries.map((entry, idx) => {
                const isApproved = entry.status === 'approved'
                return (
                  <div key={entry.id} className={`p-4 space-y-2 ${isApproved ? 'bg-emerald-50/40' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">
                          #{idx + 1} ₹{Number(entry.amount).toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {entry.date instanceof Date
                            ? format(entry.date, 'dd/MM/yyyy')
                            : format(new Date(entry.date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <ReceiptButton entry={entry} busy={receiptBusyId === entry.id} locked={entryLocked(entry)} onToggle={handleToggleReceipt} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        {isApproved && (
                          <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Added</span>
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
                    {!isApproved && <DeptConfirmBadge entry={entry} />}
                    {!isApproved && entryLocked(entry) && <p className="text-xs text-slate-400">🔒 Month locked</p>}
                    {!isApproved && !entryLocked(entry) && (
                      deletingId === entry.id ? (
                        <div className="flex items-center gap-3 text-xs pt-1">
                          <span className="text-slate-600">Confirm delete?</span>
                          <button type="button" onClick={() => handleDelete(entry.id)} className="text-red-600 font-medium">Yes</button>
                          <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500">No</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          {canAddEntry(entry) && (
                            <button type="button" onClick={() => handleApprove(entry.id)} disabled={approvingId === entry.id} className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50 transition">{approvingId === entry.id ? '…' : 'Add'}</button>
                          )}
                          <button type="button" onClick={() => handleEdit(entry)} className="text-xs text-indigo-600 font-medium hover:underline">Edit</button>
                          <button type="button" onClick={() => setDeletingId(entry.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                        </div>
                      )
                    )}
                  </div>
                )
              })}
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
                    <th className="px-4 py-3 text-right">Bill</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleEntries.map((entry, idx) => {
                    const isApproved = entry.status === 'approved'
                    return (
                      <tr key={entry.id} className={`transition ${isApproved ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {entry.date instanceof Date
                            ? format(entry.date, 'dd/MM/yyyy')
                            : format(new Date(entry.date), 'dd/MM/yyyy')}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{normalizeDepartmentName(entry.department || entry.category)}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {entry.item || '—'}
                          {!isApproved && blockedByDept(entry) && <div className="mt-1"><DeptConfirmBadge entry={entry} /></div>}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{entry.billNo || '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          ₹{Number(entry.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ReceiptButton entry={entry} busy={receiptBusyId === entry.id} locked={entryLocked(entry)} onToggle={handleToggleReceipt} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isApproved ? (
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Added</span>
                          ) : entryLocked(entry) ? (
                            <span className="text-xs text-slate-400">🔒 Locked</span>
                          ) : deletingId === entry.id ? (
                            <span className="flex items-center justify-end gap-2 text-xs text-slate-600">
                              <span>Confirm delete?</span>
                              <button type="button" onClick={() => handleDelete(entry.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                              <button type="button" onClick={() => setDeletingId(null)} className="text-slate-500 hover:underline">No</button>
                            </span>
                          ) : (
                            <span className="flex items-center justify-end gap-2">
                              {canAddEntry(entry) && (
                                <button type="button" onClick={() => handleApprove(entry.id)} disabled={approvingId === entry.id} className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50 transition">{approvingId === entry.id ? '…' : 'Add'}</button>
                              )}
                              <button type="button" onClick={() => handleEdit(entry)} className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 transition" aria-label="Edit">✏️</button>
                              <button type="button" onClick={() => setDeletingId(entry.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition" aria-label="Delete">🗑️</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      </>)}

      {/* Advance Payout Requests panel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Advance Payout Requests</h3>
          <div className="flex items-center gap-2">
          <button type="button" onClick={loadPayouts} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition text-base leading-none" aria-label="Refresh">↻</button>
          <div className="flex gap-1">
            {[
              { key: 'approved', label: 'Approved' },
              { key: 'disapproved', label: 'Disapproved' },
              { key: 'pending', label: 'Pending' },
              { key: '', label: 'All' },
            ].map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setPayoutFilter(f.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  payoutFilter === f.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          </div>
        </div>
        {payoutRequests.length === 0 ? (
          <p className="p-6 text-sm text-slate-400 text-center">No {payoutFilter || ''} payout requests.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payoutRequests.map(r => (
              <li key={r.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {r.departmentName}
                    <span className="font-normal text-slate-400 mx-1.5">·</span>
                    <span className={r.status === 'approved' ? 'text-emerald-700' : r.status === 'disapproved' ? 'text-red-600' : 'text-amber-700'}>
                      ₹{Number(r.amount).toLocaleString('en-IN')}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{r.reason}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Requested by {r.requestedBy}
                    {r.createdAt ? ` · ${format(r.createdAt, 'd MMM yyyy')}` : ''}
                    {r.status !== 'pending' && r.reviewedBy ? ` · ${r.status === 'approved' ? 'Approved' : 'Disapproved'} by ${r.reviewedBy}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border capitalize ${
                  r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : r.status === 'disapproved' ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Excel preview modal */}
      {xlsxRows && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col sm:max-w-3xl">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="font-semibold text-slate-800">Excel Preview</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {xlsxRows.filter(r => r._valid).length} valid · {xlsxRows.filter(r => !r._valid).length} skipped · {xlsxByDept.length} department{xlsxByDept.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button type="button" onClick={() => setXlsxRows(null)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>

            {/* Body — grouped by department */}
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

            {/* Footer */}
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
    </div>
  )
}

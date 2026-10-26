import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Receipt, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { createFinanceExpense, subscribeFinanceExpenseByDept, deleteFinanceExpense, updateFinanceExpenseStatus, confirmFinanceExpenseByDept, rejectFinanceExpenseByDept, resolveFinanceExpenseReminders, subscribeMyFinanceEntryUnlocks, subscribeExpenseFollowUps, clearExpenseFollowUp } from '../services/firestore'
import { isExpenseDisputed, disputeReason } from '../utils/expenseDispute'
import { FINANCE_ASSISTANT_LABEL, normalizeDepartmentName } from '../constants/roles'
import { isMonthClosedForEntry, entryDeadlineLabel, monthKeyLabel } from '../utils/financeEntryLock'
import useFinanceMonthLocks from '../hooks/useFinanceMonthLocks'
import FinanceModal from './finance/FinanceModal'
import StatusBadge from './finance/StatusBadge'
import DateInput from './DateInput'

function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(new Date(d), 'dd/MM/yyyy') } catch { return '—' }
}

function fmtAmt(n) {
  if (n == null || n === '') return '—'
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// Compact amount for the tight bar-chart labels: ₹500, ₹2.8k, ₹12.4k
function fmtCompactAmt(n) {
  const v = Number(n) || 0
  if (v < 1000) return `₹${v}`
  return `₹${(v / 1000).toFixed(1)}k`
}

// yyyy-MM bucket key for an entry's date, or null when missing/unparseable.
function monthKeyOf(d) {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? null : format(dt, 'yyyy-MM')
}

function monthLabel(key) {
  return format(new Date(`${key}-01T12:00:00`), 'MMMM yyyy')
}

const EMPTY_FORM = { date: today(), item: '', billNo: '', amount: '' }

export default function DeptExpenseTab({ department }) {
  const { user, userProfile, canManageDepartment, isFounder, isSeniorPastor } = useAuth()
  const canEdit = isFounder || isSeniorPastor || canManageDepartment(department)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  // Bill No is a secondary, optional field — hidden by default behind a trigger icon
  // so the form's default state is just date/amount/description.
  const [showBillNo, setShowBillNo] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [actioningId, setActioningId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  // Everything below (total, entry count, chart, month cards) is scoped to one
  // calendar year — the current one by default. The year switcher only steps
  // through years that actually have entries, so older records stay reachable.
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  useEffect(() => {
    setLoadingEntries(true)
    setLoadErr('')
    const unsub = subscribeFinanceExpenseByDept(department, (entries) => {
      setEntries(entries)
      setLoadingEntries(false)
    })
    return unsub
  }, [department, retryKey])

  // Entry for a month closes after the 5th of the next month, unless the
  // Accounts Director has unlocked that month for this user (Founder exempt).
  const [myUnlocks, setMyUnlocks] = useState([])
  useEffect(() => subscribeMyFinanceEntryUnlocks(user?.uid, setMyUnlocks), [user?.uid])
  const formMonth = (form.date || '').slice(0, 7)
  const formMonthUnlock = myUnlocks.find(u => u.month === formMonth && normalizeDepartmentName(u.department) === normalizeDepartmentName(department)) || null
  // Past the 10th the whole month is locked for everyone but the Founder (unless the
  // Founder reopened it); a department unlock can't override that.
  const { isLocked: isFinanceLocked } = useFinanceMonthLocks(isFounder)
  const formMonthFinanceLocked = isFinanceLocked(formMonth)
  const formMonthClosed = formMonthFinanceLocked || (!isFounder && isMonthClosedForEntry(formMonth) && !formMonthUnlock)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.item.trim() || !form.amount || !form.date) return
    if (formMonthClosed) return
    setSaving(true)
    try {
      const id = await createFinanceExpense({
        department,
        date: form.date,
        item: form.item.trim(),
        billNo: form.billNo.trim(),
        amount: Number(form.amount),
        createdBy: userProfile?.email || 'unknown',
      })
      setEntries(prev => [{
        id, department,
        date: new Date(form.date + 'T12:00:00'),
        item: form.item.trim(),
        billNo: form.billNo.trim(),
        amount: Number(form.amount),
        status: 'pending',
      }, ...prev])
      // Filing an expense for a month closes any Finance Assistant reminder for it.
      resolveFinanceExpenseReminders(department, form.date.slice(0, 7)).catch(() => {})
      // Jump to the new entry's year so it doesn't vanish from a year-scoped view.
      setYear(Number(form.date.slice(0, 4)) || currentYear)
      setForm(f => ({ ...EMPTY_FORM, date: f.date }))
      setShowBillNo(false)
      setModalOpen(false)
    } catch {
      alert('Failed to save expense. Please try again.')
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    try {
      await deleteFinanceExpense(id)
      clearExpenseFollowUp(id).catch(() => {})
      setEntries(prev => prev.filter(e => e.id !== id))
      setDeletingId(null)
    } catch {
      alert('Failed to delete.')
    }
  }

  const handleStatus = async (id, status, reason = '') => {
    setActioningId(id + status)
    try {
      await updateFinanceExpenseStatus(id, status, userProfile?.displayName || userProfile?.email || 'Unknown', reason)
      setEntries(prev => prev.map(e => e.id === id ? { ...e, status, disapproveReason: status === 'disapproved' ? reason : '' } : e))
      // Approving settles any dispute Accounts was following up on.
      if (status === 'approved') clearExpenseFollowUp(id).catch(() => {})
      setRejectingId(null)
      setRejectReason('')
    } catch {
      alert('Failed to update status.')
    } finally {
      setActioningId(null)
    }
  }

  const actorName = userProfile?.displayName || userProfile?.email || 'Unknown'

  const handleConfirm = async (id) => {
    setActioningId(id + 'confirm')
    try {
      await confirmFinanceExpenseByDept(id, actorName)
      setEntries(prev => prev.map(e => e.id === id ? { ...e, deptConfirmation: 'confirmed', deptConfirmedBy: actorName } : e))
      clearExpenseFollowUp(id).catch(() => {})
    } catch {
      alert('Failed to confirm.')
    } finally {
      setActioningId(null)
    }
  }

  const handleReject = async (id) => {
    const reason = rejectReason.trim()
    if (!reason) return
    setActioningId(id + 'reject')
    try {
      await rejectFinanceExpenseByDept(id, actorName, reason)
      setEntries(prev => prev.map(e => e.id === id ? { ...e, deptConfirmation: 'rejected', deptConfirmedBy: actorName, deptRejectReason: reason } : e))
      setRejectingId(null)
      setRejectReason('')
    } catch {
      alert('Failed to reject.')
    } finally {
      setActioningId(null)
    }
  }

  // Bills the Finance Assistant entered for this department that still need its confirmation.
  const awaitingConfirm = useMemo(() => entries.filter(e => e.deptConfirmation === 'pending'), [entries])
  // Bills this department disapproved/rejected — escalated to the Accounts Director,
  // who may follow up until the department approves them or Accounts removes them.
  const disputed = useMemo(() => entries.filter(isExpenseDisputed), [entries])
  const [followUps, setFollowUps] = useState({})
  useEffect(() => subscribeExpenseFollowUps(setFollowUps), [])

  // Years that have at least one dated entry, plus the current year, ascending.
  const availableYears = useMemo(() => {
    const ys = new Set([currentYear])
    for (const e of entries) {
      const key = monthKeyOf(e.date)
      if (key) ys.add(Number(key.slice(0, 4)))
    }
    return [...ys].sort((a, b) => a - b)
  }, [entries, currentYear])
  const yearIdx = availableYears.indexOf(year)
  const prevYear = yearIdx > 0 ? availableYears[yearIdx - 1] : null
  const nextYear = yearIdx >= 0 && yearIdx < availableYears.length - 1 ? availableYears[yearIdx + 1] : null

  // Dated entries in the selected year. Undated entries can't be placed in any
  // year, so they're kept out of the year's totals but still listed (as their own
  // "Undated" card) under the current year so they never become unreachable.
  const yearEntries = useMemo(
    () => entries.filter(e => monthKeyOf(e.date)?.startsWith(`${year}-`)),
    [entries, year]
  )
  const undatedEntries = useMemo(
    () => (year === currentYear ? entries.filter(e => !monthKeyOf(e.date)) : []),
    [entries, year, currentYear]
  )

  const totalAmt = yearEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  // The selected year's entries grouped under month headers, newest month first;
  // undated entries fall into a single group pinned to the bottom. Subtotals sum
  // every status.
  const monthGroups = useMemo(() => {
    const buckets = new Map()
    const undated = undatedEntries
    for (const e of yearEntries) {
      const key = monthKeyOf(e.date)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(e)
    }
    const groups = [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, es]) => ({
        key,
        label: monthLabel(key),
        total: es.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        entries: es,
      }))
    if (undated.length) {
      groups.push({
        key: '__undated',
        label: 'Undated',
        total: undated.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        entries: undated,
      })
    }
    return groups
  }, [yearEntries, undatedEntries])

  // The breakdown chart shows every month of the selected year, January onward —
  // up to the current month for this year, all twelve for a past year — with
  // zero-spend months as empty slots so the year reads as a continuous timeline.
  const chartMonths = useMemo(() => {
    const lastMonth = year === currentYear ? new Date().getMonth() + 1 : 12
    const byKey = new Map(monthGroups.map(g => [g.key, g]))
    return Array.from({ length: lastMonth }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`
      return byKey.get(key) || { key, label: monthLabel(key), total: 0, entries: [] }
    })
  }, [monthGroups, year, currentYear])
  const chartMax = chartMonths.reduce((m, g) => Math.max(m, g.total), 0)

  // Months render collapsed by default as a compact card grid; opening a card
  // pops a modal with that month's itemized entries. `openMonthKey` is the one
  // month currently expanded (or null). It's cleared automatically if that
  // month's last entry gets deleted while the modal is open.
  const [openMonthKey, setOpenMonthKey] = useState(null)
  const openGroup = useMemo(
    () => monthGroups.find(g => g.key === openMonthKey) || null,
    [monthGroups, openMonthKey]
  )
  useEffect(() => {
    if (openMonthKey && !monthGroups.some(g => g.key === openMonthKey)) setOpenMonthKey(null)
  }, [openMonthKey, monthGroups])

  // A month past the 10th of the next month is locked for everyone but the Founder.
  const entryLocked = (e) => !!e.date && isFinanceLocked(monthKeyOf(e.date))

  // "Entered by Finance Assistant · …" line for bills the Finance Assistant entered.
  const renderEntryNote = (e) => e.status === 'disapproved' && !e.deptConfirmation ? (
    <p className="text-[11px] mt-1.5 text-red-600">
      Disapproved{e.approvedBy ? ` by ${e.approvedBy}` : ''}{disputeReason(e) ? `: ${disputeReason(e)}` : ''}
    </p>
  ) : e.deptConfirmation && (
    <p className={`text-[11px] mt-1.5 ${e.deptConfirmation === 'pending' ? 'text-amber-700' : e.deptConfirmation === 'rejected' ? 'text-red-600' : 'text-emerald-700'}`}>
      Entered by {FINANCE_ASSISTANT_LABEL}
      {e.deptConfirmation === 'pending' && ' · awaiting your confirmation'}
      {e.deptConfirmation === 'confirmed' && ` · confirmed${e.deptConfirmedBy ? ` by ${e.deptConfirmedBy}` : ''}`}
      {e.deptConfirmation === 'rejected' && ` · rejected${e.deptConfirmedBy ? ` by ${e.deptConfirmedBy}` : ''}${e.deptRejectReason ? `: ${e.deptRejectReason}` : ''}`}
    </p>
  )

  // Whether the Finance Assistant has the physical bill in hand.
  const renderBillStatus = (e) => (
    <p className={`text-[11px] mt-1 ${e.receiptConfirmed ? 'text-emerald-700' : 'text-slate-400'}`}>
      {e.receiptConfirmed
        ? `🧾 Bill received${e.receiptConfirmedBy ? ` by ${e.receiptConfirmedBy}` : ''}`
        : '🧾 Bill not yet handed over'}
    </p>
  )

  // One itemized expense card — used by the "needs your confirmation" panel.
  const renderEntry = (e) => (
    <div key={e.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate max-w-[220px]">{e.item || '—'}</p>
          <p className="text-xs text-slate-400 mt-0.5">{fmtDate(e.date)}{e.billNo ? ` · ${e.billNo}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-sm font-bold text-slate-800 tabular-nums">{fmtAmt(e.amount)}</p>
          <StatusBadge status={e.status} />
        </div>
      </div>
      {renderEntryNote(e)}
      {renderBillStatus(e)}
      {renderEntryActions(e)}
    </div>
  )

  // Editor actions for one bill: Confirm/Reject for Finance Assistant bills,
  // Approve/Disapprove/Delete for the department's own. Nothing once locked.
  const renderEntryActions = (e) => (
    <>
      {canEdit && !entryLocked(e) && e.deptConfirmation === 'pending' && (
        rejectingId === e.id ? (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <input
              type="text"
              autoFocus
              value={rejectReason}
              onChange={ev => setRejectReason(ev.target.value)}
              placeholder="Reason for rejecting"
              className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <button
              type="button"
              disabled={!rejectReason.trim() || !!actioningId}
              onClick={() => handleReject(e.id)}
              className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {actioningId === e.id + 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
            <button type="button" onClick={() => { setRejectingId(null); setRejectReason('') }} className="text-xs text-slate-400">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            <button
              type="button"
              disabled={!!actioningId}
              onClick={() => handleConfirm(e.id)}
              className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {actioningId === e.id + 'confirm' ? 'Confirming…' : 'Confirm'}
            </button>
            <button
              type="button"
              disabled={!!actioningId}
              onClick={() => { setRejectingId(e.id); setRejectReason('') }}
              className="px-3 py-1 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
          </div>
        )
      )}
      {/* A rejected Finance Assistant bill can still be confirmed — that ends the dispute. */}
      {canEdit && !entryLocked(e) && e.deptConfirmation === 'rejected' && (
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          <button
            type="button"
            disabled={!!actioningId}
            onClick={() => handleConfirm(e.id)}
            className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {actioningId === e.id + 'confirm' ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      )}
      {/* Finance Assistant bills are added to accounts from the Finance Assistant page,
          so the department only confirms/rejects them — no Approve/Disapprove/Delete here. */}
      {canEdit && !entryLocked(e) && !e.deptConfirmation && (
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          {rejectingId === `${e.id}:dis` ? (
            <>
              <input
                type="text"
                autoFocus
                value={rejectReason}
                onChange={ev => setRejectReason(ev.target.value)}
                placeholder="Reason for disapproving"
                className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <button
                type="button"
                disabled={!rejectReason.trim() || !!actioningId}
                onClick={() => handleStatus(e.id, 'disapproved', rejectReason.trim())}
                className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actioningId === e.id + 'disapproved' ? 'Disapproving…' : 'Disapprove'}
              </button>
              <button type="button" onClick={() => { setRejectingId(null); setRejectReason('') }} className="text-xs text-slate-400">Cancel</button>
            </>
          ) : (e.status || 'pending') === 'pending' ? (
            <>
              <button
                type="button"
                disabled={!!actioningId}
                onClick={() => handleStatus(e.id, 'approved')}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {actioningId === e.id + 'approved' ? 'Approving…' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={!!actioningId}
                onClick={() => { setRejectingId(`${e.id}:dis`); setRejectReason('') }}
                className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Disapprove
              </button>
            </>
          ) : e.status === 'disapproved' && (
            // Disputed: approving it now ends the dispute with Accounts.
            <button
              type="button"
              disabled={!!actioningId}
              onClick={() => handleStatus(e.id, 'approved')}
              className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {actioningId === e.id + 'approved' ? 'Approving…' : 'Approve'}
            </button>
          )}
          {deletingId === e.id ? (
            <span className="flex items-center gap-1.5 text-xs ml-auto">
              <span className="text-slate-500">Delete?</span>
              <button type="button" onClick={() => handleDelete(e.id)} className="text-red-600 font-semibold">Yes</button>
              <button type="button" onClick={() => setDeletingId(null)} className="text-slate-400">No</button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setDeletingId(e.id)}
              aria-label="Delete expense"
              className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </>
  )

  // Month details popup data: read-only once the month is locked (or for viewers).
  const openReadOnly = !!openGroup && (!canEdit || openGroup.entries.some(entryLocked))
  const openApprovedTotal = openGroup
    ? openGroup.entries.filter(e => e.status === 'approved').reduce((s, e) => s + (Number(e.amount) || 0), 0)
    : 0
  const openAllApproved = !!openGroup?.entries.length && openGroup.entries.every(e => e.status === 'approved')

  return (
    <div className="space-y-4 pb-20">

      {/* Bills the Finance Assistant entered for this department — surfaced up top
          (rather than buried in a month card) until they're confirmed or rejected. */}
      {canEdit && awaitingConfirm.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {awaitingConfirm.length} {awaitingConfirm.length === 1 ? 'bill needs' : 'bills need'} your confirmation
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              The {FINANCE_ASSISTANT_LABEL} entered {awaitingConfirm.length === 1 ? 'this expense' : 'these expenses'} for your department. Confirm if correct, or reject with a reason.
            </p>
          </div>
          <div className="space-y-2">
            {awaitingConfirm.map(e => renderEntry(e))}
          </div>
        </div>
      )}

      {/* Disputed bills — escalated to the Accounts Director, who follows up until
          the department approves them or Accounts removes them. */}
      {canEdit && disputed.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-red-900">
              {disputed.length} disapproved {disputed.length === 1 ? 'bill' : 'bills'} with Accounts
            </p>
            <p className="text-xs text-red-800 mt-0.5">
              The Accounts Director has been notified. Approve the bill if it's correct after all — otherwise Accounts will remove it.
            </p>
          </div>
          <div className="space-y-2">
            {disputed.map(e => {
              const f = followUps[e.id]
              return (
                <div key={e.id}>
                  {renderEntry(e)}
                  {f && (
                    <p className="text-[11px] text-red-800 mt-1 px-1">
                      📣 Accounts followed up {f.count > 1 ? `${f.count} times` : 'once'}
                      {f.lastAt ? ` · last ${format(f.lastAt, 'dd/MM/yyyy')}` : ''}
                      {f.lastBy ? ` by ${f.lastBy}` : ''}
                      {f.lastNote ? `: “${f.lastNote}”` : ''}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Merged total-expense summary — a single sleek horizontal card instead of a
          separate stat box duplicating whatever "Expense" header the caller renders
          above this component. Always visible (not gated on canEdit) since everyone
          who can see this tab should see the running total. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Expense · {year}</p>
          <p className="text-2xl font-bold text-slate-800 tabular-nums mt-0.5">{fmtAmt(totalAmt)}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {availableYears.length > 1 && (
            <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                disabled={prevYear == null}
                onClick={() => setYear(prevYear)}
                aria-label="Previous year"
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-1.5 text-xs font-semibold text-slate-700 tabular-nums">{year}</span>
              <button
                type="button"
                disabled={nextYear == null}
                onClick={() => setYear(nextYear)}
                aria-label="Next year"
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full">
            {yearEntries.length} {yearEntries.length === 1 ? 'Entry' : 'Entries'}
          </span>
        </div>
      </div>

      {/* Monthly breakdown — one bar per recent month, at-a-glance only.
          Tapping a bar opens that month's entries modal. */}
      {!loadErr && !loadingEntries && chartMonths.length > 0 && chartMax > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Monthly breakdown · {year}</p>
          <div className="mt-3 flex items-end justify-between gap-1 sm:gap-2">
            {chartMonths.map(g => (
              <button
                key={g.key}
                type="button"
                disabled={g.total <= 0}
                onClick={() => setOpenMonthKey(g.key)}
                title={`${g.label} — ${fmtAmt(g.total)}`}
                className="group flex flex-1 min-w-0 flex-col items-center gap-1.5 disabled:cursor-default"
              >
                <span className="text-[10px] font-semibold text-slate-500 tabular-nums truncate max-w-full">
                  {g.total > 0 ? fmtCompactAmt(g.total) : ' '}
                </span>
                {g.total > 0 ? (
                  <span
                    className="w-full max-w-[36px] rounded-t bg-indigo-500 transition-colors group-hover:bg-indigo-600"
                    style={{ height: Math.max(6, Math.round((g.total / chartMax) * 72)) }}
                  />
                ) : (
                  <span className="w-full max-w-[36px] h-1 rounded bg-slate-100" />
                )}
                <span className="text-[10px] font-medium text-slate-400">
                  {format(new Date(`${g.key}-01T12:00:00`), 'MMM')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section header + add action */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">Expense Entries</h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Plus size={16} /> Add Expense
          </button>
        )}
      </div>

      {/* Monthly grid — every month collapsed by default into a compact card
          (name · entry count · subtotal). Tapping a card opens its entries. */}
      {loadErr ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 text-center">
          <p className="text-sm text-red-500">{loadErr}</p>
          <button type="button" onClick={() => setRetryKey(k => k + 1)} className="mt-2 text-sm text-indigo-600 hover:underline">Retry</button>
        </div>
      ) : loadingEntries ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-6 text-center text-slate-400 text-sm">Loading…</div>
      ) : monthGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-5 text-center text-slate-400 text-sm">
          {entries.length === 0 ? 'No expense entries yet.' : `No expense entries in ${year}.`}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {monthGroups.map(group => (
            <button
              key={group.key}
              type="button"
              onClick={() => setOpenMonthKey(group.key)}
              className="group flex flex-col text-left bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <p className="text-sm font-semibold text-slate-800 truncate">{group.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
              </p>
              <p className="text-lg font-bold text-slate-800 tabular-nums mt-2">{fmtAmt(group.total)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600">
                View Entries
                <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Month details — itemized entries for the tapped month card */}
      <FinanceModal
        open={!!openGroup}
        onClose={() => setOpenMonthKey(null)}
        title={openGroup ? `${department} · Expense Report · ${openGroup.label}` : ''}
        size="xl"
      >
        {openGroup && (
          <div className="space-y-5">
            {openReadOnly && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {openAllApproved ? 'Approved Record' : 'Expense Record'} — Read Only
              </span>
            )}

            {/* Summary header cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Total Approved</p>
                <p className="text-xl font-bold text-emerald-800 tabular-nums mt-1">{fmtAmt(openApprovedTotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Recorded</p>
                <p className="text-xl font-bold text-slate-800 tabular-nums mt-1">{fmtAmt(openGroup.total)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{openGroup.entries.length} {openGroup.entries.length === 1 ? 'entry' : 'entries'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Period</p>
                <p className="text-base font-semibold text-slate-800 mt-1">{openGroup.label}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Department</p>
                <p className="text-base font-semibold text-slate-800 mt-1 truncate">{department}</p>
              </div>
            </div>

            {/* Expense table */}
            {openGroup.entries.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">No entries.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Item / Description</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Bill No</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      {!openReadOnly && <th className="px-4 py-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {openGroup.entries.map(e => (
                      <tr key={e.id} className="align-top hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-4 py-3 text-slate-800">
                          {e.item || '—'}
                          {renderEntryNote(e)}
                          {renderBillStatus(e)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{normalizeDepartmentName(e.department) || department}</td>
                        <td className="px-4 py-3 text-slate-500">{e.billNo || '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">{fmtAmt(e.amount)}</td>
                        {!openReadOnly && <td className="px-4 py-3 text-right [&>div]:mt-0 [&>div]:justify-end">{renderEntryActions(e)}</td>}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200">
                      <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{fmtAmt(openGroup.total)}</td>
                      {!openReadOnly && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </FinanceModal>

      {/* Add Expense modal */}
      <FinanceModal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Expense">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <DateInput
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              required
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                required
                className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          <input
            type="text"
            value={form.item}
            onChange={e => setForm(f => ({ ...f, item: e.target.value }))}
            placeholder="What was this for?"
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />

          {showBillNo && (
            <input
              type="text"
              value={form.billNo}
              onChange={e => setForm(f => ({ ...f, billNo: e.target.value }))}
              placeholder="Bill number (optional)"
              autoFocus
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBillNo(v => !v)}
              title="Bill No (optional)"
              aria-label="Toggle bill number"
              className={`w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center transition-colors active:scale-95 ${
                showBillNo || form.billNo
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-600'
                  : 'border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
            >
              <Receipt size={18} />
            </button>
            <button
              type="submit"
              disabled={saving || formMonthClosed}
              className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 active:scale-95 text-white text-sm font-semibold disabled:opacity-50 transition-all shadow-sm"
            >
              {saving ? 'Saving…' : 'Add Expense'}
            </button>
          </div>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            🧾 Hand over the original bill to the {FINANCE_ASSISTANT_LABEL} in person. It's ticked as received once they've checked it.
          </p>
          {formMonthClosed && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formMonthFinanceLocked
                ? `${monthKeyLabel(formMonth)} accounts are locked. Expenses for this month can no longer be entered.`
                : `Expense entry for ${monthKeyLabel(formMonth)} closed on ${entryDeadlineLabel(formMonth)}. Ask the Accounts Director to unlock it for you.`}
            </p>
          )}
          {!formMonthClosed && formMonthUnlock && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {monthKeyLabel(formMonth)} was unlocked for you{formMonthUnlock.unlockedBy ? ` by ${formMonthUnlock.unlockedBy}` : ''}.
            </p>
          )}
        </form>
      </FinanceModal>
    </div>
  )
}

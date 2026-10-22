import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentRole } from '../../utils/access'
import { normalizeDepartmentName } from '../../constants/roles'
import { disputeReason } from '../../utils/expenseDispute'
import {
  subscribeDisputedExpenses, subscribeExpenseFollowUps, sendExpenseFollowUp,
  clearExpenseFollowUp, deleteFinanceExpense,
} from '../../services/firestore'
import { RIBBON_BAR } from '../../constants/ribbon'

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`

/** Follow-up note → department Directors/Coordinators (bell notification). */
function FollowUpModal({ expense, onSend, onClose }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dept = normalizeDepartmentName(expense.department)

  const send = async () => {
    setBusy(true); setError('')
    try {
      await onSend(note.trim())
      onClose()
    } catch {
      setError('Could not send. Please try again.')
    }
    setBusy(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Follow up on disapproved expense"
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-sky-600 text-white px-5 py-3 flex items-center gap-3 rounded-t-2xl">
          <p className="flex-1 min-w-0 font-bold truncate">Follow up · {dept}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-lg">×</button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-700">
            <b>{inr(expense.amount)}</b> · {expense.item || 'Expense'}{expense.date ? ` · ${format(expense.date, 'd MMM yyyy')}` : ''}
          </p>
          <p className="text-xs text-slate-500">
            {dept}'s Directors/Coordinators will get this in their notifications, asking them to approve the bill or explain.
          </p>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Message (optional)"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-200" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" disabled={busy} onClick={send}
            className="w-full min-h-[44px] rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 disabled:opacity-50">
            {busy ? 'Sending…' : 'Send follow-up'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * My Workspace → Accounts Director (and Founder): one sky-blue ribbon per expense a department
 * has disapproved (or a Finance Assistant bill it rejected). "Follow up" can be
 * sent any number of times; the ribbon stays until the department approves the
 * bill or Accounts removes it here. Live (onSnapshot).
 */
export default function ExpenseDisputeRibbon({ myName }) {
  const { userProfile, isFounder } = useAuth()
  // Accounts Director, plus the Founder (who oversees every escalation).
  const isAccountsDirector = isFounder || getDepartmentRole(userProfile, 'Accounts') === 'DIRECTOR'
  const [disputes, setDisputes] = useState([])
  const [followUps, setFollowUps] = useState({})
  const [followUpFor, setFollowUpFor] = useState(null)
  const [removingId, setRemovingId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => (isAccountsDirector ? subscribeDisputedExpenses(setDisputes) : undefined), [isAccountsDirector])
  useEffect(() => (isAccountsDirector ? subscribeExpenseFollowUps(setFollowUps) : undefined), [isAccountsDirector])

  if (!isAccountsDirector || !disputes.length) return null

  const remove = async (e) => {
    setBusyId(e.id); setError('')
    try {
      await deleteFinanceExpense(e.id)
      await clearExpenseFollowUp(e.id).catch(() => {})
      setRemovingId(null)
    } catch (err) {
      setError(err?.code === 'permission-denied'
        ? 'This month is locked — ask the Founder to unlock it before removing the expense.'
        : 'Could not remove the expense. Please try again.')
    }
    setBusyId(null)
  }

  return (
    <div>
      {disputes.map((e) => {
        const dept = normalizeDepartmentName(e.department)
        const reason = disputeReason(e)
        const f = followUps[e.id]
        return (
          <div key={e.id} className={`${RIBBON_BAR} rounded-xl bg-sky-600 text-white shadow-md justify-between my-3 flex-wrap`}>
            <span className="min-w-0 flex-1 text-sm font-medium tracking-wide">
              ⚠ <b>{dept}</b> disapproved {inr(e.amount)} — {e.item || 'an expense'}{e.date ? ` (${format(e.date, 'd MMM')})` : ''}
              {reason ? <>: <i>“{reason}”</i></> : ''}
              {f && (
                <span className="block text-xs text-sky-100 mt-0.5">
                  Followed up {f.count > 1 ? `${f.count} times` : 'once'}{f.lastAt ? ` · last ${format(f.lastAt, 'd MMM, h:mm a')}` : ''}
                </span>
              )}
            </span>
            <div className="flex-shrink-0 flex flex-col sm:flex-row gap-1.5">
              <button type="button" onClick={() => setFollowUpFor(e)}
                className="bg-white text-sky-700 hover:bg-sky-50 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm whitespace-nowrap">
                📣 Follow up
              </button>
              {removingId === e.id ? (
                <span className="flex items-center gap-1.5 text-xs bg-sky-700/80 px-2 py-1.5 rounded-lg whitespace-nowrap">
                  Remove expense?
                  <button type="button" disabled={busyId === e.id} onClick={() => remove(e)} className="font-bold underline">
                    {busyId === e.id ? '…' : 'Yes'}
                  </button>
                  <button type="button" onClick={() => setRemovingId(null)} className="opacity-80">No</button>
                </span>
              ) : (
                <button type="button" onClick={() => setRemovingId(e.id)}
                  className="bg-sky-700/80 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap">
                  Remove from Accounts
                </button>
              )}
            </div>
          </div>
        )
      })}
      {error && <p className="text-xs text-red-600 -mt-1 mb-2">{error}</p>}
      {followUpFor && (
        <FollowUpModal
          expense={followUpFor}
          onSend={(note) => sendExpenseFollowUp(followUpFor, note, myName)}
          onClose={() => setFollowUpFor(null)}
        />
      )}
    </div>
  )
}

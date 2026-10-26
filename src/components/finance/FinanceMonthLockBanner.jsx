import { useEffect, useState } from 'react'
import { Check, Loader2, Lock, LockOpen } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { subscribePendingFinanceUnlockRequests, setFinanceMonthUnlock } from '../../services/firestore'
import { isMonthClosedForFinance, isFinanceMonthLocked, monthKeyLabel, monthKeyOf, financeLockTypeLabel } from '../../utils/financeEntryLock'
import { MonthLockRow } from './FinanceMonthLocksModal'

// Shown on a finance screen (type 'expense' or 'income') for the month in view
// once it closed (10th of the following month). No text: the page takes on a
// tint — muted amber while locked, green while the Founder has it unlocked — with
// a lock / open-lock icon on top. Tapping the icon opens the lock controls:
// Founder unlock, Accounts unlock request, or "Mark Completed" to re-lock.
// Sits at the right edge (centred only while the lock controls are open).
// Before the close date (e.g. the current month) only the "Mark Completed"
// button shows; pressing it locks the month early.
// Time left before an unlocked month locks again: a draining bar from the unlock
// moment to unlockedUntil, plus a short countdown. `now` ticks every minute.
function UnlockTimerBar({ unlock, now }) {
  const until = unlock?.unlockedUntil
  if (!(until instanceof Date)) return null
  const start = unlock.unlockedAt instanceof Date
    ? unlock.unlockedAt
    : new Date(until.getTime() - (unlock.unlockDays || 1) * 86400000)
  const total = Math.max(until - start, 1)
  const left = Math.max(until - now, 0)
  const pct = Math.min(100, (left / total) * 100)
  const mins = Math.ceil(left / 60000)
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60
  const text = d ? `${d}d ${h}h left` : h ? `${h}h ${m}m left` : `${m}m left`
  const urgent = left < 3 * 3600000
  return (
    <div className="w-full max-w-xs" title={`Locks again ${until.toLocaleString()}`}>
      <div className="h-2 rounded-full bg-emerald-200/80 dark:bg-emerald-900/60 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${urgent ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1 text-center text-[11px] font-semibold tabular-nums ${urgent ? 'text-amber-700' : 'text-emerald-700'}`}>{text}</p>
    </div>
  )
}

export default function FinanceMonthLockBanner({ monthKey, type = 'expense', unlock, now = new Date() }) {
  const closed = !!monthKey && isMonthClosedForFinance(monthKey, now)
  const completed = unlock?.completed === true
  const lockable = closed || completed
  const [open, setOpen] = useState(false)
  const [requests, setRequests] = useState([])
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  const { userProfile, isFounder } = useAuth()
  useEffect(() => (lockable && open ? subscribePendingFinanceUnlockRequests(setRequests) : undefined), [lockable, open])
  // Future months have nothing to complete yet.
  if (!monthKey || (!lockable && monthKey > monthKeyOf(now))) return null
  const by = userProfile?.displayName || userProfile?.name || userProfile?.email || (isFounder ? 'Founder' : 'Accounts')
  async function markCompleted() {
    setCompleting(true); setCompleteError('')
    try { await setFinanceMonthUnlock(monthKey, 0, by, type) } catch { setCompleteError('Could not lock. Please try again.') }
    setCompleting(false)
  }
  const locked = isFinanceMonthLocked(monthKey, unlock?.unlockedUntil, now, completed)
  // A 36px ✓ circle at the right edge of the page, with a soft halo so it stands
  // out; on hover / keyboard focus it widens into an emerald
  // "Mark Completed" pill (the label slides out from behind the check).
  const completeButton = (
    <button type="button" disabled={completing} onClick={markCompleted} title="Mark Completed" aria-label="Mark Completed"
      className="group inline-flex items-center h-9 rounded-full bg-emerald-600 text-white shadow-md ring-4 ring-emerald-500/20 transition-colors duration-200 hover:bg-emerald-700 hover:ring-emerald-500/30 focus-visible:outline-none focus-visible:ring-emerald-400/60 disabled:opacity-60">
      <span className="flex items-center justify-center w-9 h-9 shrink-0">
        {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-[18px] h-[18px]" strokeWidth={2.75} />}
      </span>
      <span aria-hidden="true"
        className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 ease-out group-hover:max-w-[9rem] group-hover:pr-3.5 group-hover:opacity-100 group-focus-visible:max-w-[9rem] group-focus-visible:pr-3.5 group-focus-visible:opacity-100">
        Mark Completed
      </span>
    </button>
  )
  // Still open (before the 10th, not completed): just the button.
  if (!lockable) {
    return (
      <div className="flex flex-col items-end gap-1">
        {completeButton}
        {completeError && <p className="text-xs text-red-600">{completeError}</p>}
      </div>
    )
  }
  const label = `${monthKeyLabel(monthKey)} ${financeLockTypeLabel(type).toLowerCase()} ${locked ? 'locked' : 'unlocked'}`
  const Icon = locked ? Lock : LockOpen
  return (
    <>
      <div aria-hidden className={`fixed inset-0 -z-10 pointer-events-none ${locked ? 'bg-amber-100/70 dark:bg-amber-950/40' : 'bg-emerald-100/60 dark:bg-emerald-950/40'}`} />
      <div className={`flex flex-col gap-2 ${open ? 'items-center' : 'items-end'}`}>
        <button type="button" onClick={() => setOpen(o => !o)} title={label} aria-label={label} aria-expanded={open}
          className={`inline-flex items-center justify-center w-11 h-11 rounded-full shadow-sm transition ${locked ? 'bg-amber-200 text-amber-800 hover:bg-amber-300' : 'bg-emerald-200 text-emerald-800 hover:bg-emerald-300'} ${open ? 'ring-2 ring-offset-2 ' + (locked ? 'ring-amber-400' : 'ring-emerald-400') : ''}`}>
          <Icon className="w-5 h-5" strokeWidth={2.25} />
        </button>
        {!locked && <UnlockTimerBar unlock={unlock} now={now} />}
        {completed && locked && !open && (
          <span className="px-4 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">✓ Completed</span>
        )}
        {!open && (!locked || (isFounder && !completed)) && completeButton}
        {completeError && <p className="text-xs text-red-600">{completeError}</p>}
        {open && (
          <div className="w-full max-w-2xl">
            <MonthLockRow
              monthKey={monthKey}
              type={type}
              unlock={unlock}
              now={now}
              pendingRequest={requests.find(r => r.month === monthKey && (r.type || 'expense') === type) || null}
              onDone={() => setOpen(false)}
            />
          </div>
        )}
      </div>
    </>
  )
}

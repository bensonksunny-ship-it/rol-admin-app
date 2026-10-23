import { useEffect, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { subscribePendingFinanceUnlockRequests } from '../../services/firestore'
import { isMonthClosedForFinance, isFinanceMonthLocked, monthKeyLabel, financeLockTypeLabel } from '../../utils/financeEntryLock'
import { MonthLockRow } from './FinanceMonthLocksModal'

// Shown on a finance screen (type 'expense' or 'income') for the month in view
// once it closed (10th of the following month). No text: the page takes on a
// tint — muted amber while locked, green while the Founder has it unlocked — with
// a lock / open-lock icon on top. Tapping the icon opens the lock controls:
// Founder unlock, Accounts unlock request, or "Mark entry completed" to re-lock.
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
  const [open, setOpen] = useState(false)
  const [requests, setRequests] = useState([])
  useEffect(() => (closed && open ? subscribePendingFinanceUnlockRequests(setRequests) : undefined), [closed, open])
  if (!closed) return null
  const locked = isFinanceMonthLocked(monthKey, unlock?.unlockedUntil, now)
  const label = `${monthKeyLabel(monthKey)} ${financeLockTypeLabel(type).toLowerCase()} ${locked ? 'locked' : 'unlocked'}`
  const Icon = locked ? Lock : LockOpen
  return (
    <>
      <div aria-hidden className={`fixed inset-0 -z-10 pointer-events-none ${locked ? 'bg-amber-100/70 dark:bg-amber-950/40' : 'bg-emerald-100/60 dark:bg-emerald-950/40'}`} />
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => setOpen(o => !o)} title={label} aria-label={label} aria-expanded={open}
          className={`inline-flex items-center justify-center w-11 h-11 rounded-full shadow-sm transition ${locked ? 'bg-amber-200 text-amber-800 hover:bg-amber-300' : 'bg-emerald-200 text-emerald-800 hover:bg-emerald-300'} ${open ? 'ring-2 ring-offset-2 ' + (locked ? 'ring-amber-400' : 'ring-emerald-400') : ''}`}>
          <Icon className="w-5 h-5" strokeWidth={2.25} />
        </button>
        {!locked && <UnlockTimerBar unlock={unlock} now={now} />}
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

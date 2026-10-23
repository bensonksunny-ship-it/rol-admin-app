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

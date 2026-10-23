import { Lock, LockOpen } from 'lucide-react'
import { isMonthClosedForFinance, isFinanceMonthLocked, monthKeyLabel, financeLockTypeLabel } from '../../utils/financeEntryLock'

// Shown on a finance screen (type 'expense' or 'income') for the month in view
// once it closed (10th of the following month). No text: the page takes on a
// tint — muted amber while locked, green while the Founder has it unlocked — with
// a lock / open-lock icon on top. Unlocking and requests live in "Month locks".
export default function FinanceMonthLockBanner({ monthKey, type = 'expense', unlock, now = new Date() }) {
  if (!monthKey || !isMonthClosedForFinance(monthKey, now)) return null
  const locked = isFinanceMonthLocked(monthKey, unlock?.unlockedUntil, now)
  const label = `${monthKeyLabel(monthKey)} ${financeLockTypeLabel(type).toLowerCase()} ${locked ? 'locked' : 'unlocked'}`
  const Icon = locked ? Lock : LockOpen
  return (
    <>
      <div aria-hidden className={`fixed inset-0 -z-10 pointer-events-none ${locked ? 'bg-amber-100/70 dark:bg-amber-950/40' : 'bg-emerald-100/60 dark:bg-emerald-950/40'}`} />
      <div className="flex justify-center" title={label}>
        <span className={`inline-flex items-center justify-center w-11 h-11 rounded-full shadow-sm ${locked ? 'bg-amber-200 text-amber-800' : 'bg-emerald-200 text-emerald-800'}`}>
          <Icon className="w-5 h-5" strokeWidth={2.25} />
          <span className="sr-only">{label}</span>
        </span>
      </div>
    </>
  )
}

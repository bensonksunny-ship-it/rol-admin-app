import { useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { setFinanceMonthUnlock } from '../../services/firestore'
import { isMonthClosedForFinance, financeCloseLabel, monthKeyLabel } from '../../utils/financeEntryLock'

const UNLOCK_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 2, label: '2 days' },
  { days: 7, label: '1 week' },
]

// Shown on finance screens for a month that closed on the 10th of the following
// month. Finance team: read-only notice (or the open unlock window). Founder:
// unlock for 1 day / 2 days / 1 week — repeatable — or lock again early.
export default function FinanceMonthLockBanner({ monthKey, unlock, now = new Date() }) {
  const { isFounder, userProfile } = useAuth()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  if (!monthKey || !isMonthClosedForFinance(monthKey, now)) return null

  const until = unlock?.unlockedUntil instanceof Date && unlock.unlockedUntil > now ? unlock.unlockedUntil : null
  const by = userProfile?.displayName || userProfile?.name || userProfile?.email || 'Founder'

  async function apply(days) {
    setBusy(days)
    setError('')
    try {
      await setFinanceMonthUnlock(monthKey, days, by)
    } catch {
      setError('Could not update. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`rounded-xl border px-4 py-3 ${until ? 'border-emerald-200 bg-emerald-50' : 'border-slate-300 bg-slate-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${until ? 'text-emerald-900' : 'text-slate-800'}`}>
            {until
              ? `🔓 ${monthKeyLabel(monthKey)} unlocked until ${format(until, 'd MMM, h:mm a')}`
              : `🔒 ${monthKeyLabel(monthKey)} expenses are locked`}
          </p>
          <p className={`text-xs mt-0.5 ${until ? 'text-emerald-800' : 'text-slate-500'}`}>
            {until
              ? `The finance team can edit this month's expenses again${unlock?.unlockedBy ? ` · unlocked by ${unlock.unlockedBy}` : ''}.`
              : `Closed on ${financeCloseLabel(monthKey)}. ${isFounder ? 'Unlock it to let the finance team edit it again.' : 'Only the Founder can unlock it.'}`}
          </p>
        </div>
        {isFounder && (
          <div className="flex flex-wrap items-center gap-1.5">
            {UNLOCK_OPTIONS.map(o => (
              <button
                key={o.days}
                type="button"
                onClick={() => apply(o.days)}
                disabled={busy != null}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50 transition"
              >
                {busy === o.days ? '…' : `Unlock ${o.label}`}
              </button>
            ))}
            {until && (
              <button
                type="button"
                onClick={() => apply(0)}
                disabled={busy != null}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {busy === 0 ? '…' : 'Lock now'}
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}

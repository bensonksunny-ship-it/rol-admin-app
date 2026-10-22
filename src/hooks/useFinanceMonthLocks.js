import { useEffect, useState } from 'react'
import { subscribeFinanceMonthUnlocks } from '../services/firestore'
import { isFinanceMonthLocked, unlockDocId } from '../utils/financeEntryLock'

// Live Founder unlock windows (finance_month_unlocks, keyed by doc id — see
// unlockDocId) plus an isLocked(monthKey, 'expense'|'income') check for the
// finance team. The Founder is never locked.
export default function useFinanceMonthLocks(isFounder) {
  const [unlocks, setUnlocks] = useState({})
  // Re-evaluate every minute so an unlock window expiring re-locks the page.
  const [now, setNow] = useState(() => new Date())

  useEffect(() => subscribeFinanceMonthUnlocks(setUnlocks), [])
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const isLocked = (monthKey, type = 'expense') =>
    !isFounder && isFinanceMonthLocked(monthKey, unlocks[unlockDocId(type, monthKey)]?.unlockedUntil, now)
  return { unlocks, isLocked, now }
}

import { useEffect, useState } from 'react'
import { subscribePendingFinanceUnlockRequests } from '../../services/firestore'
import { isMonthClosedForFinance } from '../../utils/financeEntryLock'
import { MonthLockRow } from './FinanceMonthLocksModal'

// Shown on finance screens for the month in view once it closed (10th of the
// following month): lock state plus Founder unlock buttons, or the Accounts
// Director's "Request unlock from Founder".
export default function FinanceMonthLockBanner({ monthKey, unlock, now = new Date() }) {
  const closed = !!monthKey && isMonthClosedForFinance(monthKey, now)
  const [requests, setRequests] = useState([])
  useEffect(() => (closed ? subscribePendingFinanceUnlockRequests(setRequests) : undefined), [closed])
  if (!closed) return null
  return (
    <MonthLockRow
      monthKey={monthKey}
      unlock={unlock}
      now={now}
      pendingRequest={requests.find(r => r.month === monthKey) || null}
    />
  )
}

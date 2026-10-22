import { useEffect, useState } from 'react'
import { subscribePendingFinanceUnlockRequests } from '../../services/firestore'
import { isMonthClosedForFinance } from '../../utils/financeEntryLock'
import { MonthLockRow } from './FinanceMonthLocksModal'

// Shown on a finance screen (type 'expense' or 'income') for the month in view
// once it closed (10th of the following month): lock state plus Founder unlock
// buttons, or the Accounts Director's unlock request for that type.
export default function FinanceMonthLockBanner({ monthKey, type = 'expense', unlock, now = new Date() }) {
  const closed = !!monthKey && isMonthClosedForFinance(monthKey, now)
  const [requests, setRequests] = useState([])
  useEffect(() => (closed ? subscribePendingFinanceUnlockRequests(setRequests) : undefined), [closed])
  if (!closed) return null
  return (
    <MonthLockRow
      monthKey={monthKey}
      type={type}
      unlock={unlock}
      now={now}
      pendingRequest={requests.find(r => r.month === monthKey && (r.type || 'expense') === type) || null}
    />
  )
}

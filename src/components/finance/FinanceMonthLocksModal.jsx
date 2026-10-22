import { useEffect, useState } from 'react'
import { format, startOfMonth, subMonths } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import useFinanceMonthLocks from '../../hooks/useFinanceMonthLocks'
import {
  setFinanceMonthUnlock, createFinanceUnlockRequest, subscribePendingFinanceUnlockRequests,
  approveFinanceUnlockRequest,
} from '../../services/firestore'
import {
  isMonthClosedForFinance, isFinanceMonthLocked, financeCloseLabel, monthKeyLabel,
  FINANCE_LOCK_TYPES, financeLockTypeLabel, unlockDocId,
} from '../../utils/financeEntryLock'
import FinanceModal from './FinanceModal'

const UNLOCK_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 2, label: '2 days' },
  { days: 7, label: '1 week' },
]

// One locked month for one type — expense or income, which are unlocked
// separately. Founder unlocks for 1 day / 2 days / 1 week (repeatable) or locks
// early; the Accounts Director requests an unlock from the Founder.
// `compact` drops the month name (the Month locks panel groups rows by month).
export function MonthLockRow({ monthKey, type = 'expense', unlock, pendingRequest, now, compact = false }) {
  const { isFounder, userProfile, user } = useAuth()
  const [busy, setBusy] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const by = userProfile?.displayName || userProfile?.name || userProfile?.email || (isFounder ? 'Founder' : 'Accounts Director')
  const typeLabel = financeLockTypeLabel(type)
  const locked = isFinanceMonthLocked(monthKey, unlock?.unlockedUntil, now)
  const until = !locked && unlock?.unlockedUntil instanceof Date ? unlock.unlockedUntil : null

  async function run(key, fn) {
    setBusy(key); setError('')
    try { await fn() } catch { setError('Could not update. Please try again.') }
    setBusy(null)
  }

  const unlockFor = (days) => run(days, () => (pendingRequest
    ? approveFinanceUnlockRequest(pendingRequest, days, by)
    : setFinanceMonthUnlock(monthKey, days, by, type)))

  const sendRequest = () => run('request', async () => {
    await createFinanceUnlockRequest({ month: monthKey, monthLabel: monthKeyLabel(monthKey), type, reason: reason.trim(), by, uid: user?.uid })
    setRequesting(false); setReason('')
  })

  return (
    <div className={`rounded-xl border px-4 py-3 ${until ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {until ? '🔓' : '🔒'} {compact ? typeLabel : `${monthKeyLabel(monthKey)} · ${typeLabel}`}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {until
              ? `Unlocked until ${format(until, 'd MMM, h:mm a')}${unlock?.unlockedBy ? ` · by ${unlock.unlockedBy}` : ''}`
              : `Locked since ${financeCloseLabel(monthKey)}`}
          </p>
          {pendingRequest && (
            <p className="text-xs text-indigo-700 mt-0.5">
              {typeLabel} unlock requested by {pendingRequest.requestedBy || 'Accounts'}
              {pendingRequest.reason ? `: “${pendingRequest.reason}”` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isFounder ? (
            <>
              {UNLOCK_OPTIONS.map(o => (
                <button key={o.days} type="button" onClick={() => unlockFor(o.days)} disabled={busy != null}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50">
                  {busy === o.days ? '…' : `Unlock ${o.label}`}
                </button>
              ))}
              {until && (
                <button type="button" onClick={() => run(0, () => setFinanceMonthUnlock(monthKey, 0, by, type))} disabled={busy != null}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">
                  {busy === 0 ? '…' : 'Lock now'}
                </button>
              )}
            </>
          ) : locked && (
            pendingRequest ? (
              <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold">Request sent to Founder</span>
            ) : !requesting && (
              <button type="button" onClick={() => setRequesting(true)}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">
                Request {typeLabel.toLowerCase()} unlock
              </button>
            )
          )}
        </div>
      </div>
      {requesting && (
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <input type="text" autoFocus value={reason} onChange={e => setReason(e.target.value)}
            placeholder={`Why do you need ${monthKeyLabel(monthKey)} ${typeLabel.toLowerCase()} reopened?`}
            className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <button type="button" onClick={sendRequest} disabled={!reason.trim() || busy != null}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {busy === 'request' ? 'Sending…' : 'Send request'}
          </button>
          <button type="button" onClick={() => { setRequesting(false); setReason('') }} className="text-xs text-slate-400">Cancel</button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}

/**
 * Accounts → Expense / Income → "Month locks": every month locked after the 10th
 * of the following month (last 12 by default, any older month via the picker),
 * with separate Expense and Income rows — Founder unlock controls / Accounts
 * Director unlock requests.
 */
export default function FinanceMonthLocksModal({ open, onClose }) {
  const { isFounder } = useAuth()
  const { unlocks, now } = useFinanceMonthLocks(isFounder)
  const [requests, setRequests] = useState([])
  const [extraMonth, setExtraMonth] = useState('')
  useEffect(() => (open ? subscribePendingFinanceUnlockRequests(setRequests) : undefined), [open])

  const recent = Array.from({ length: 12 }, (_, i) => format(subMonths(startOfMonth(now), i + 1), 'yyyy-MM'))
  const months = [...new Set([
    ...requests.map(r => r.month),
    ...(extraMonth ? [extraMonth] : []),
    ...recent,
  ])].filter(mk => isMonthClosedForFinance(mk, now)).sort().reverse()

  return (
    <FinanceModal open={open} onClose={onClose} title="Month locks" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          A month's income and expenses lock after the 10th of the following month. Each is unlocked separately.
          {isFounder
            ? ' Unlock one to let the finance team edit it again, as often as needed.'
            : ' Only the Founder can unlock. Send a request with the reason.'}
        </p>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Older month</label>
          <input type="month" value={extraMonth} onChange={e => setExtraMonth(e.target.value)}
            max={recent[recent.length - 1]}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div className="space-y-4">
          {months.map(mk => (
            <div key={mk} className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{monthKeyLabel(mk)}</p>
              <div className="grid gap-2 lg:grid-cols-2">
                {FINANCE_LOCK_TYPES.map(t => (
                  <MonthLockRow key={t.key} monthKey={mk} type={t.key} compact now={now}
                    unlock={unlocks[unlockDocId(t.key, mk)]}
                    pendingRequest={requests.find(r => r.month === mk && (r.type || 'expense') === t.key) || null} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </FinanceModal>
  )
}

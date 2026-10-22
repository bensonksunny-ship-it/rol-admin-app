import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  subscribePendingFinanceUnlockRequests, approveFinanceUnlockRequest, declineFinanceUnlockRequest,
} from '../../services/firestore'
import { monthKeyLabel, financeLockTypeLabel } from '../../utils/financeEntryLock'
import { RIBBON_BAR } from '../../constants/ribbon'

const UNLOCK_OPTIONS = [
  { days: 1, label: '1 day' },
  { days: 2, label: '2 days' },
  { days: 7, label: '1 week' },
]

/**
 * My Workspace → Founder: one sky-blue ribbon per pending Accounts request to
 * reopen a locked finance month. Unlock for 1 day / 2 days / 1 week or decline;
 * the ribbon drops out once decided. Live (onSnapshot).
 */
export default function FinanceUnlockRequestRibbon({ myName }) {
  const { isFounder } = useAuth()
  const [requests, setRequests] = useState([])
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => (isFounder ? subscribePendingFinanceUnlockRequests(setRequests) : undefined), [isFounder])
  if (!isFounder || !requests.length) return null

  const run = async (key, fn) => {
    setBusy(key); setError('')
    try { await fn() } catch { setError('Could not update the request. Please try again.') }
    setBusy(null)
  }
  const by = myName || 'Founder'

  return (
    <div>
      {requests.map((r) => (
        <div key={r.id} className={`${RIBBON_BAR} rounded-xl bg-sky-600 text-white shadow-md justify-between my-3 flex-wrap`}>
          <span className="min-w-0 flex-1 text-sm font-medium tracking-wide">
            🔒 <b>{r.requestedBy || 'Accounts'}</b> asks to unlock <b>{r.monthLabel || monthKeyLabel(r.month)} {financeLockTypeLabel(r.type).toLowerCase()}</b>
            {r.reason ? <>: <i>“{r.reason}”</i></> : ''}
          </span>
          <div className="flex-shrink-0 flex flex-wrap gap-1.5">
            {UNLOCK_OPTIONS.map((o) => (
              <button key={o.days} type="button" disabled={busy != null}
                onClick={() => run(`${r.id}:${o.days}`, () => approveFinanceUnlockRequest(r, o.days, by))}
                className="bg-white text-sky-700 hover:bg-sky-50 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm whitespace-nowrap disabled:opacity-50">
                {busy === `${r.id}:${o.days}` ? '…' : `Unlock ${o.label}`}
              </button>
            ))}
            <button type="button" disabled={busy != null}
              onClick={() => run(`${r.id}:decline`, () => declineFinanceUnlockRequest(r.id, by))}
              className="bg-sky-700/80 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap disabled:opacity-50">
              {busy === `${r.id}:decline` ? '…' : 'Decline'}
            </button>
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-red-600 -mt-1 mb-2">{error}</p>}
    </div>
  )
}

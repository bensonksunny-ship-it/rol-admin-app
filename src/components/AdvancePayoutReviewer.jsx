import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { listenAdvancePayoutRequests, updateAdvancePayoutRequest } from '../services/firestore'

const STATUS = {
  pending:     'bg-amber-50 text-amber-700 border-amber-200',
  approved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  disapproved: 'bg-red-50 text-red-600 border-red-200',
}

export default function AdvancePayoutReviewer() {
  const { userProfile } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [expandedId, setExpandedId] = useState(null)
  const [actioning, setActioning] = useState(null)
  const unsubRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
    unsubRef.current = listenAdvancePayoutRequests(
      filter ? { status: filter } : {},
      data => { setRequests(data); setLoading(false) },
      err => { console.error(err); setLoading(false) },
    )
    return () => { unsubRef.current?.() }
  }, [filter])

  async function handleAction(id, status) {
    setActioning(id + status)
    try {
      await updateAdvancePayoutRequest(id, {
        status,
        reviewedBy: userProfile?.displayName || userProfile?.email || 'Unknown',
      })
      setExpandedId(null)
    } catch (e) {
      console.error(e)
    } finally {
      setActioning(null)
    }
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-800 text-sm">Advance Payout Requests</h3>
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {[
            { key: 'pending', label: 'Pending' },
            { key: 'approved', label: 'Approved' },
            { key: 'disapproved', label: 'Disapproved' },
            { key: '', label: 'All' },
          ].map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFilter(f.key); setExpandedId(null) }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                filter === f.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="p-8 text-center text-slate-400 text-sm">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="p-8 text-center text-slate-400 text-sm">
          No {filter || ''} requests.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {requests.map(r => (
            <li key={r.id} className="transition-colors">
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                className="w-full px-5 py-3.5 text-left flex items-start justify-between gap-3 hover:bg-slate-50 transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {r.departmentName}
                    <span className="font-normal text-slate-500 ml-1.5">·</span>
                    <span className="ml-1.5 text-indigo-700">₹{Number(r.amount).toLocaleString('en-IN')}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{r.reason}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {r.requestedBy}
                    {r.createdAt ? ` · ${format(r.createdAt, 'd MMM yyyy, h:mm a')}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border capitalize ${STATUS[r.status] || ''}`}>
                  {r.status}
                </span>
              </button>

              {expandedId === r.id && (
                <div className="px-5 pb-4 pt-1 bg-slate-50 border-t border-slate-100 space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">{r.reason}</p>
                  {r.status === 'pending' ? (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!!actioning}
                        onClick={() => handleAction(r.id, 'approved')}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {actioning === r.id + 'approved' ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={!!actioning}
                        onClick={() => handleAction(r.id, 'disapproved')}
                        className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {actioning === r.id + 'disapproved' ? 'Disapproving…' : 'Disapprove'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      <span className={r.status === 'approved' ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {r.status === 'approved' ? 'Approved' : 'Disapproved'}
                      </span>
                      {r.reviewedBy ? ` by ${r.reviewedBy}` : ''}
                      {r.reviewedAt ? ` · ${format(r.reviewedAt, 'd MMM yyyy')}` : ''}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

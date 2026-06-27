import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { createAdvancePayoutRequest, listenAdvancePayoutRequests } from '../services/firestore'

const STATUS = {
  pending:     'bg-amber-50 text-amber-700 border-amber-200',
  approved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  disapproved: 'bg-red-50 text-red-600 border-red-200',
}

export default function AdvancePayoutTab({ departmentSlug, departmentName }) {
  const { userProfile } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ amount: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const unsubRef = useRef(null)

  useEffect(() => {
    setLoading(true)
    unsubRef.current = listenAdvancePayoutRequests(
      { departmentSlug },
      data => { setRequests(data); setLoading(false) },
      err => { console.error(err); setLoading(false) },
    )
    return () => { unsubRef.current?.() }
  }, [departmentSlug])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a valid amount.'); return }
    if (!form.reason.trim()) { setError('Reason is required.'); return }
    setError('')
    setSaving(true)
    try {
      await createAdvancePayoutRequest({
        departmentSlug,
        departmentName,
        requestedBy: userProfile?.displayName || userProfile?.email || 'Unknown',
        requestedByEmail: userProfile?.email || '',
        amount: Number(form.amount),
        reason: form.reason.trim(),
      })
      setForm({ amount: '', reason: '' })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } catch {
      setError('Failed to submit. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Request form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/70 shadow-[0_4px_24px_rgba(99,102,241,0.08)] ring-1 ring-inset ring-slate-100 p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-slate-700">Request Advance Payout</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Amount (₹)</label>
            <input
              type="number"
              min="1"
              step="any"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-slate-500">Reason</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Briefly describe the reason for this advance payout request…"
              rows={3}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm resize-none"
            />
          </div>
        </div>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        {success && <p className="text-xs font-medium text-emerald-600">Request submitted — pending review by Founder & Administration.</p>}
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 min-h-[40px] rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {saving ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>

      {/* History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Request History</h3>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-slate-400 text-center">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="p-6 text-sm text-slate-400 text-center">No payout requests yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {requests.map(r => (
              <li key={r.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">₹{Number(r.amount).toLocaleString('en-IN')}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.reason}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {r.createdAt ? format(r.createdAt, 'd MMM yyyy') : '—'} · {r.requestedBy}
                    {r.status !== 'pending' && r.reviewedBy ? ` · Reviewed by ${r.reviewedBy}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border capitalize ${STATUS[r.status] || ''}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { createAdvancePayoutRequest, getAdvancePayoutRequests } from '../services/firestore'
import FinanceModal from './finance/FinanceModal'
import StatusBadge from './finance/StatusBadge'

export default function AdvancePayoutTab({ departmentSlug, departmentName }) {
  const { userProfile } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ amount: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAdvancePayoutRequests({ departmentSlug })
      setRequests(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [departmentSlug])

  useEffect(() => { load() }, [load])

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
      setModalOpen(false)
      await load()
    } catch {
      setError('Failed to submit. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* Section header + add action */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Payout Requests</h3>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-40 text-base leading-none"
            aria-label="Refresh"
          >
            ↻
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setError(''); setModalOpen(true) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors shrink-0"
        >
          <Plus size={16} /> Request Payout
        </button>
      </div>

      {success && (
        <p className="text-xs font-medium text-emerald-600">Request submitted — pending review by Founder &amp; Administration.</p>
      )}

      {/* Card-table request history */}
      <div className="space-y-2">
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-400 text-sm">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-400 text-sm">No payout requests yet.</div>
        ) : (
          requests.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">₹{Number(r.amount).toLocaleString('en-IN')}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.reason}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {r.createdAt ? format(r.createdAt, 'd MMM yyyy') : '—'} · {r.requestedBy}
                    {r.status !== 'pending' && r.reviewedBy ? ` · Reviewed by ${r.reviewedBy}` : ''}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Request Payout modal */}
      <FinanceModal open={modalOpen} onClose={() => setModalOpen(false)} title="Request Advance Payout">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Amount (₹)</label>
            <input
              type="number"
              min="1"
              step="any"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Reason</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Briefly describe the reason for this advance payout request…"
              rows={3}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 min-h-[40px] rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>
      </FinanceModal>
    </div>
  )
}

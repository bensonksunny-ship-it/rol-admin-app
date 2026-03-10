import { useEffect, useState } from 'react'
import { getSundayPlan, setSundayPlanSection } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { format, addWeeks, subWeeks } from 'date-fns'
import { formatDMY } from '../utils/date'
import { SUNDAY_PLAN_SECTIONS } from '../constants/roles'

const PASTOR_REMARKS_KEY = 'sundayMinistryPastorRemarks'

export default function SundayMinistryPastor() {
  const { hasPermission, isFounder } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)

  const canView = hasPermission('viewDepartmentInsights') || isFounder
  const canEdit = isFounder || hasPermission('viewDepartmentInsights')

  useEffect(() => {
    setLoading(true)
    getSundayPlan(selectedDate)
      .then((p) => {
        setPlan(p || {})
        setRemarks(p?.[PASTOR_REMARKS_KEY]?.notes ?? '')
      })
      .finally(() => setLoading(false))
  }, [selectedDate])

  if (!canView) {
    return (
      <div className="p-8 text-slate-600">
        You don't have access to the Sunday Ministry (Pastor) page. Senior pastor / Founder only.
      </div>
    )
  }

  const sundayMinistryData = plan?.[SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Sunday Ministry (Senior Pastor)</h1>
        <p className="text-slate-500 mt-1">View planning and report; add your remarks. Only senior pastor / Founder can edit this page.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-slate-700">Date:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300"
        />
        <button type="button" onClick={() => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))} className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">← Previous Sunday</button>
        <button type="button" onClick={() => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))} className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50">Next Sunday →</button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading...</div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-3">Sunday Ministry planning (read-only)</h2>
            <p className="text-xs text-slate-500 mb-2">For {formatDMY(selectedDate)}. Edited by Sunday Ministry director on their page.</p>
            <div className="text-slate-700 whitespace-pre-wrap min-h-[80px] rounded-lg bg-slate-50 p-4">
              {sundayMinistryData?.notes || '— No planning notes yet —'}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-3">Pastor remarks</h2>
            <p className="text-xs text-slate-500 mb-2">Your comments for this Sunday. Only visible to users who can access this page.</p>
            {canEdit ? (
              <form onSubmit={async (e) => {
                e.preventDefault()
                setSaving(true)
                try {
                  await setSundayPlanSection(selectedDate, PASTOR_REMARKS_KEY, { notes: remarks })
                  setPlan((p) => ({ ...p, [PASTOR_REMARKS_KEY]: { notes: remarks } }))
                } finally {
                  setSaving(false)
                }
              }} className="space-y-3">
                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add your remarks..." className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[120px]" rows={4} />
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save remarks'}</button>
              </form>
            ) : (
              <div className="text-slate-600 whitespace-pre-wrap min-h-[80px] rounded-lg bg-slate-50 p-4">{remarks || '— No remarks —'}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

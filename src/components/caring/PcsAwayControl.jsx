import { useState } from 'react'
import { setPCSAwayStatus } from '../../services/firestore'
import { buildAwayPatch, buildReturnPatch, awaySummary, todayISO, AWAY_BADGE_CLS } from '../../utils/awayStatus'
import { formatDisplayDate } from '../../utils/date'

/**
 * PCS availability: Active | Away (travel / vacation). Saves straight to the
 * caring_pcs entry, independent of the profile form's own Save. Away is manual
 * only — "Until" is informational; switching back to Active is what ends it
 * (and archives the period so those weeks stay skipped by absence counters).
 */
// `startEditing` opens straight into the Away form (e.g. a "Mark as Away" button).
// `suggestedFrom` — { date, attendedOn, source } from the person's last Sunday / cell
// attendance (see suggestAwayStart); pre-fills a new Away's start date, else today.
export default function PcsAwayControl({ entry, updatedBy, onSaved, canEdit = true, startEditing: openOnMount = false, suggestedFrom = null }) {
  const defaultFrom = () => entry.awayFrom || suggestedFrom?.date || todayISO()
  const [editing, setEditing] = useState(openOnMount && canEdit)
  const [from, setFrom] = useState(defaultFrom)
  const [until, setUntil] = useState(entry.awayUntil || '')
  const [note, setNote] = useState(entry.awayNote || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (patch) => {
    setSaving(true)
    setError('')
    try {
      await setPCSAwayStatus(entry.id, patch, updatedBy)
      onSaved?.(patch)
      setEditing(false)
    } catch (err) {
      console.error('setPCSAwayStatus failed:', err)
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const startEditing = () => {
    setFrom(defaultFrom())
    setUntil(entry.awayUntil || '')
    setNote(entry.awayNote || '')
    setEditing(true)
  }

  const inp = 'w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</p>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
          <button
            type="button"
            disabled={!canEdit || saving}
            onClick={() => { if (entry.away) save(buildReturnPatch(entry)); else setEditing(false) }}
            className={`px-3 py-1.5 transition-colors ${!entry.away && !editing ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-60`}
          >
            Active
          </button>
          <button
            type="button"
            disabled={!canEdit || saving}
            onClick={startEditing}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors ${entry.away || editing ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-60`}
          >
            ✈ Away
          </button>
        </div>
      </div>

      {entry.away && !editing && (
        <div className="flex items-start justify-between gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${AWAY_BADGE_CLS}`}>
            {awaySummary(entry, formatDisplayDate)}
          </span>
          {canEdit && (
            <button type="button" onClick={startEditing} className="text-xs font-medium text-sky-700 hover:underline flex-shrink-0">
              Edit
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
            </label>
            <label className="block">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Until (optional)</span>
              <input type="date" value={until} min={from || undefined} onChange={(e) => setUntil(e.target.value)} className={inp} />
            </label>
          </div>
          {suggestedFrom ? (
            <button
              type="button"
              onClick={() => setFrom(suggestedFrom.date)}
              title="Use this start date"
              className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${from === suggestedFrom.date ? 'bg-sky-50 border-sky-200 text-sky-800' : 'bg-white border-sky-300 text-sky-700 hover:bg-sky-50'}`}
            >
              <span className="font-semibold">Suggested Start Date: {formatDisplayDate(suggestedFrom.date)}</span>
              <span className="text-sky-600/80"> (based on last attendance at {suggestedFrom.source} on {formatDisplayDate(suggestedFrom.attendedOn)})</span>
            </button>
          ) : (
            <p className="text-[11px] text-slate-400">No recent Sunday or cell attendance on record, so the start date defaults to today.</p>
          )}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note, e.g. Vacation / travelling abroad"
            className={inp}
          />
          <p className="text-[11px] text-slate-400">Absence warnings are paused while Away. Switch back to Active when they return.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(buildAwayPatch({ from, until, note }))}
              className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : entry.away ? 'Update Away' : 'Mark Away'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

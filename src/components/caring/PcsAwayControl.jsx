import { useState } from 'react'
import { setPCSAwayStatus, completeMinistryRolesForRelocation } from '../../services/firestore'
import { buildAwayPatch, buildReturnPatch, awaySummary, todayISO, AWAY_BADGE_CLS } from '../../utils/awayStatus'
import { formatDisplayDate } from '../../utils/date'
import { buildRelocatedPatch, buildUnrelocatePatch, churchTillDate, DEFAULT_STANDING, RELOCATED_BADGE_CLS } from '../../utils/relocation'

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
  // Relocated / Moved Out form (third status)
  const [relocEditing, setRelocEditing] = useState(false)
  const [lastDate, setLastDate] = useState('')
  const [destination, setDestination] = useState('')
  const [standing, setStanding] = useState(DEFAULT_STANDING)
  // "Part of Church Till Date" — follows Last Attendance Date until edited by hand.
  const [tillDate, setTillDate] = useState('')
  const [tillTouched, setTillTouched] = useState(false)

  const save = async (patch) => {
    setSaving(true)
    setError('')
    try {
      await setPCSAwayStatus(entry.id, patch, updatedBy)
      // Relocated → close out their River Kids / department / Worship roles as
      // Completed on the last attendance date (team rosters are separate records).
      if (patch.relocated && patch.relocatedLastDate) {
        const { failed } = await completeMinistryRolesForRelocation({
          visitorId: entry.visitorId, phone: entry.phone, lastDate: patch.relocatedLastDate, by: updatedBy,
        }).catch((err) => { console.error(err); return { failed: 1 } })
        if (failed) setError('Marked Relocated, but some ministry roles could not be closed — ask that department to mark them Former.')
      }
      onSaved?.(patch)
      setEditing(false)
      setRelocEditing(false)
    } catch (err) {
      console.error('setPCSAwayStatus failed:', err)
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const startRelocating = () => {
    setEditing(false)
    // Pre-fill with their last recorded Sunday / cell attendance when known.
    const initialLast = entry.relocatedLastDate || suggestedFrom?.attendedOn || todayISO()
    setLastDate(initialLast)
    const savedTill = entry.churchJourney?.partOfChurchTillDate || ''
    setTillDate(savedTill || initialLast)
    setTillTouched(!!savedTill && savedTill !== initialLast)
    setDestination(entry.relocatedDestination || '')
    setStanding(entry.relocatedStanding || DEFAULT_STANDING)
    setRelocEditing(true)
  }

  const goActive = () => {
    if (entry.relocated) save(buildUnrelocatePatch(entry))
    else if (entry.away) save(buildReturnPatch(entry))
    else { setEditing(false); setRelocEditing(false) }
  }

  const startEditing = () => {
    setRelocEditing(false)
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
            onClick={goActive}
            className={`px-3 py-1.5 transition-colors ${!entry.away && !entry.relocated && !editing && !relocEditing ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-60`}
          >
            Active
          </button>
          <button
            type="button"
            disabled={!canEdit || saving}
            onClick={startEditing}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors ${(entry.away && !relocEditing) || editing ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-60`}
          >
            ✈ Away
          </button>
          <button
            type="button"
            disabled={!canEdit || saving}
            onClick={startRelocating}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors ${(entry.relocated && !editing) || relocEditing ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-60`}
          >
            🏠 Relocated
          </button>
        </div>
      </div>

      {entry.relocated && !relocEditing && !editing && (
        <div className="flex items-start justify-between gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${RELOCATED_BADGE_CLS}`}>
            Moved out{entry.relocatedDestination ? ` to ${entry.relocatedDestination}` : ''} · last attended {formatDisplayDate(entry.relocatedLastDate)} · part of church till {formatDisplayDate(churchTillDate(entry))} · {entry.relocatedStanding || DEFAULT_STANDING}
          </span>
          {canEdit && (
            <button type="button" onClick={startRelocating} className="text-xs font-medium text-violet-700 hover:underline flex-shrink-0">
              Edit
            </button>
          )}
        </div>
      )}

      {relocEditing && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Last Attendance Date</span>
              <input
                type="date"
                value={lastDate}
                onChange={(e) => { setLastDate(e.target.value); if (!tillTouched) setTillDate(e.target.value) }}
                className={inp}
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Destination (optional)</span>
              <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. London, UK" className={inp} />
            </label>
          </div>
          <label className="block">
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
              Part of Church Till Date <span className="text-red-500">*</span>
            </span>
            <input
              type="date"
              required
              value={tillDate}
              onChange={(e) => { setTillDate(e.target.value); setTillTouched(true) }}
              className={`${inp} ${!tillDate ? 'border-red-300' : ''}`}
            />
            <span className="block text-[11px] text-slate-400 mt-0.5">The official last day this person was considered part of the church body.</span>
          </label>
          {suggestedFrom?.attendedOn && (
            <p className="text-[11px] text-slate-400">Last recorded attendance: {suggestedFrom.source} on {formatDisplayDate(suggestedFrom.attendedOn)}</p>
          )}
          <label className="block">
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Standing Note</span>
            <input type="text" value={standing} onChange={(e) => setStanding(e.target.value)} className={inp} />
          </label>
          <p className="text-[11px] text-slate-400">No absence warnings after the last attendance date. Switch back to Active if they move back.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRelocEditing(false)} disabled={saving} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !tillDate}
              title={!tillDate ? 'Part of Church Till Date is required' : undefined}
              onClick={() => save(buildRelocatedPatch(entry, { lastDate, destination, standing, tillDate }))}
              className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : entry.relocated ? 'Update' : 'Mark Relocated'}
            </button>
          </div>
        </div>
      )}

      {entry.away && !editing && !relocEditing && (
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

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { mergePCSEntries } from '../../services/firestore'
import { profileCompleteness } from '../../utils/pcsDedupe'

const fmtD = (v) => {
  const d = v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

/**
 * PCS → "Duplicate profiles" review: each group of records that are the same
 * person, with the profile to keep pre-selected (most complete / most recent).
 * Merge folds the others into it and archives them (mergePCSEntries).
 */
export default function PcsDuplicatesModal({ groups, mergedBy, onClose, onMerged }) {
  const [keep, setKeep] = useState(() => Object.fromEntries(groups.map((g) => [g.master.id, g.master.id])))
  const [busyId, setBusyId] = useState('')
  const [done, setDone] = useState({}) // group master id → result text
  const [error, setError] = useState('')

  const merge = async (g) => {
    const all = [g.master, ...g.dupes]
    const keepId = keep[g.master.id]
    const others = all.filter((e) => e.id !== keepId).map((e) => e.id)
    const keeper = all.find((e) => e.id === keepId)
    if (!window.confirm(`Merge ${others.length} duplicate record${others.length === 1 ? '' : 's'} into "${keeper?.name}"? The duplicates are archived (not deleted).`)) return
    setBusyId(g.master.id); setError('')
    try {
      const r = await mergePCSEntries(keepId, others, mergedBy)
      setDone((d) => ({ ...d, [g.master.id]: `Merged · ${r.archived} archived${r.moved ? ` · ${r.moved} linked record${r.moved === 1 ? '' : 's'} moved` : ''}` }))
      onMerged?.()
    } catch (e) {
      console.error('mergePCSEntries', e)
      setError('Could not merge. Please try again.')
    }
    setBusyId('')
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-[640px] max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
          <p className="flex-1 font-bold text-slate-800">Duplicate PCS profiles ({groups.length})</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-lg text-slate-500">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            These records look like the same person (same visitor record, or same name with the same phone or email).
            Choose which to keep. Merging fills its blanks from the others, moves their applications, event entries and
            follow-ups onto it, and archives the rest.
          </p>
          {groups.map((g) => {
            const all = [g.master, ...g.dupes]
            const result = done[g.master.id]
            return (
              <div key={g.master.id} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {all.map((e) => (
                    <label key={e.id} className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer ${keep[g.master.id] === e.id ? 'bg-emerald-50/60' : ''}`}>
                      <input type="radio" name={`keep-${g.master.id}`} checked={keep[g.master.id] === e.id} disabled={!!result}
                        onChange={() => setKeep((k) => ({ ...k, [g.master.id]: e.id }))} className="mt-1" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold text-slate-800">{e.name}{e.displayName ? <span className="font-normal text-slate-400"> · {e.displayName}</span> : null}</p>
                        <p className="text-xs text-slate-500">{[e.phone, e.email, e.year && `PCS ${e.year}`, e.membershipNumber && `#${e.membershipNumber}`].filter(Boolean).join(' · ') || 'No contact details'}</p>
                        <p className="text-[11px] text-slate-400">Added {fmtD(e.addedAt)}{e.addedBy ? ` by ${e.addedBy}` : ''} · {Math.round(profileCompleteness(e) * 100)}% complete</p>
                      </div>
                      {keep[g.master.id] === e.id && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">Keep</span>}
                    </label>
                  ))}
                </div>
                <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                  {result
                    ? <span className="text-xs font-semibold text-emerald-700">✓ {result}</span>
                    : <button type="button" disabled={!!busyId} onClick={() => merge(g)} className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">{busyId === g.master.id ? 'Merging…' : 'Merge'}</button>}
                </div>
              </div>
            )
          })}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>,
    document.body
  )
}

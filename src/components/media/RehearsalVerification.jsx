import { useState } from 'react'
import { AlertTriangle, BadgeCheck, Check, ShieldCheck } from 'lucide-react'
import { fmtClock } from '../../utils/mediaLive'

// The Director's rehearsal summary + sign-off (shown on the desk and in the app's
// Control Center pop-up). Each run-sheet item up to the Invocation is checked with
// one "Mark all good" tap on the desk, so the summary counts items, not systems.

const DOT_TONE = { good: 'bg-emerald-400', attention: 'bg-amber-400', pending: 'bg-slate-600' }

/**
 * The status indicator used across the Control Center: green = good / done,
 * amber = needs attention / partly done, grey = not checked. Text stays in the
 * tooltip and for screen readers.
 */
export function StatusDot({ status = 'pending', title, className = '' }) {
  return (
    <span role="img" aria-label={title || status} title={title}
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${DOT_TONE[status] || DOT_TONE.pending} ${className}`} />
  )
}

/** 'good' when every checkpoint of the item is marked, 'partial' when some are, '' when none. */
function itemStatus(it) {
  const marked = it.systems.filter((s) => s.entry).length
  return marked === 0 ? '' : marked === it.systems.length ? 'good' : 'partial'
}

/** Latest mark on the item, for who/when. */
function lastMark(it) {
  return it.systems.map((s) => s.entry).filter(Boolean).sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null
}

/**
 * Summary of the rehearsal and the Director's sign-off. With `canSignOff` the
 * Director can sign or withdraw a sign-off; otherwise the status is read-only.
 */
export function RehearsalSummary({ summary, signoff, canSignOff = false, onSignOff, onClearSignoff, busy = false, compact = false }) {
  const [note, setNote] = useState('')
  const [showList, setShowList] = useState(!compact)
  const items = summary.items
  const total = items.length
  const good = items.filter((it) => itemStatus(it) === 'good').length
  const pending = total - good
  const current = signoff && signoff.signature === summary.signature
  const canSign = canSignOff && total > 0

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex-1 text-sm font-semibold uppercase tracking-wider text-slate-300" title="Run-sheet items up to the Invocation prayer">Rehearsal</p>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold tabular-nums" title={`${good} of ${total} items marked good`}>
          <StatusDot status={total && !pending ? 'good' : good ? 'attention' : 'pending'} />{good}/{total}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        {total > 0 && <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(good / total) * 100}%` }} />}
      </div>

      {total === 0 && <p className="text-sm text-slate-400">No run-sheet items to check yet.</p>}

      {total > 0 && (
        <div>
          <button type="button" onClick={() => setShowList((v) => !v)} className="text-xs font-semibold text-slate-400 hover:text-slate-200">
            {showList ? 'Hide items' : 'Items'}
          </button>
          {showList && (
            <ul className="mt-2 space-y-1">
              {items.map((it) => {
                const st = itemStatus(it)
                const last = lastMark(it)
                return (
                  <li key={it.program.key} className="flex items-center gap-2 text-sm"
                    title={last ? `${st === 'partial' ? 'Partly checked · ' : ''}${fmtClock(last.at)}${last.by ? ` · ${last.by}` : ''}` : 'Not checked'}>
                    <StatusDot status={st === 'good' ? 'good' : st === 'partial' ? 'attention' : 'pending'} />
                    <span className={`flex-1 min-w-0 truncate ${st === 'good' ? 'text-slate-200' : 'text-slate-400'}`}>{it.program.name}</span>
                    {last?.by && <span className="text-[11px] text-slate-500 shrink-0">{last.by}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Director sign-off */}
      <div className={`rounded-lg border px-3 py-2.5 ${current ? 'border-emerald-500/40 bg-emerald-500/10' : signoff ? 'border-amber-500/40 bg-amber-500/10' : 'border-slate-700 bg-slate-800/60'}`}>
        {signoff ? (
          <div className="flex flex-wrap items-start gap-2">
            {current ? <BadgeCheck className="w-5 h-5 text-emerald-300 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />}
            <div className="flex-1 min-w-0 text-sm">
              <p className={`font-semibold ${current ? 'text-emerald-200' : 'text-amber-200'}`}>
                {current ? 'Signed off — ready for Sunday' : 'Signed off, but items changed since'}
              </p>
              <p className="text-xs text-slate-400">
                {signoff.name || signoff.by || 'Media Director'} · {new Date(signoff.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              </p>
              {signoff.note && <p className="text-xs text-slate-300 mt-1">{signoff.note}</p>}
            </div>
            {canSignOff && (
              <button type="button" disabled={busy} onClick={onClearSignoff} className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-60">Withdraw</button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-5 h-5 text-slate-500 shrink-0" />
            <p className="text-slate-300">
              <span title={canSignOff ? undefined : 'The Media Director signs off in the app: Media → Upcoming Sunday → Control Center'}>Not signed off</span>
            </p>
          </div>
        )}
        {canSignOff && !current && (
          <div className="mt-2.5 space-y-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note for the team (optional)"
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-slate-500" />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={!canSign || busy} onClick={() => onSignOff(note.trim())}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                <ShieldCheck className="w-4 h-4" />{signoff ? 'Sign off again' : 'Sign off rehearsal'}
              </button>
              {pending > 0 && <span className="inline-flex items-center gap-1 text-xs text-slate-400" title={`${pending} not marked good`}><StatusDot />{pending}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

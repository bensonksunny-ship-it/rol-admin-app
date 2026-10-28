import { useState } from 'react'
import { AlertTriangle, BadgeCheck, Check, ShieldCheck, Wrench } from 'lucide-react'
import { VERIFY_STATUSES, fmtClock } from '../../utils/mediaLive'

// Saturday rehearsal checkpoints (Media Control Center) and the Director's
// summary + sign-off (shown on the desk and in the app's Control Center pop-up).

const TONE = {
  good: { on: 'bg-emerald-500 text-slate-950 border-emerald-500', text: 'text-emerald-300', icon: Check },
  attention: { on: 'bg-amber-400 text-slate-950 border-amber-400', text: 'text-amber-300', icon: AlertTriangle },
  fixed: { on: 'bg-sky-500 text-slate-950 border-sky-500', text: 'text-sky-300', icon: Wrench },
}

const statusLabel = (id) => VERIFY_STATUSES.find((s) => s.id === id)?.label || 'Not checked'

/** One system's checkpoint: All Good / Needs Attention / Fixed, with a note for problems. */
export function VerifyRow({ label, entry, busy, onSet }) {
  const status = entry?.status || ''
  const [note, setNote] = useState(entry?.note || '')
  const [prevNote, setPrevNote] = useState(entry?.note || '')
  if ((entry?.note || '') !== prevNote) { setPrevNote(entry?.note || ''); setNote(entry?.note || '') }
  const showNote = status === 'attention' || status === 'fixed'
  return (
    <div className={`rounded-lg border px-3 py-2 ${status === 'attention' ? 'border-amber-500/40 bg-amber-500/5' : status === 'good' ? 'border-emerald-500/30 bg-emerald-500/5' : status === 'fixed' ? 'border-sky-500/30 bg-sky-500/5' : 'border-slate-700/60 bg-slate-800/60'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold flex-1 min-w-[8rem]">{label}</span>
        <div className="flex flex-wrap gap-1">
          {VERIFY_STATUSES.map((s) => {
            const on = status === s.id
            return (
              <button key={s.id} type="button" disabled={busy} aria-pressed={on}
                onClick={() => onSet(on ? '' : s.id, on ? '' : note)}
                className={`rounded-md border px-2 py-1 text-xs font-semibold transition disabled:opacity-60 ${on ? TONE[s.id].on : 'border-slate-600 text-slate-300 hover:border-slate-400'}`}>
                {s.label}
              </button>
            )
          })}
        </div>
      </div>
      {showNote && (
        <input value={note} maxLength={300} disabled={busy}
          placeholder={status === 'attention' ? 'What needs attention? (e.g. lapel mic 2 crackling)' : 'What was fixed?'}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note.trim() !== (entry?.note || '')) onSet(status, note.trim()) }}
          className="mt-2 w-full rounded-md bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-slate-500" />
      )}
      {entry && <p className="mt-1 text-[11px] text-slate-500">{fmtClock(entry.at)}{entry.by ? ` · ${entry.by}` : ''}</p>}
    </div>
  )
}

function IssueLine({ s }) {
  const T = TONE[s.entry.status]
  const Icon = T.icon
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${T.text}`} />
      <span className="min-w-0">
        <b>{s.program.name}</b> · {s.label}{s.entry.note ? <span className="text-slate-300"> — {s.entry.note}</span> : null}
        <span className="block text-[11px] text-slate-500">{statusLabel(s.entry.status)} · {fmtClock(s.entry.at)}{s.entry.by ? ` · ${s.entry.by}` : ''}</span>
      </span>
    </li>
  )
}

/**
 * Summary log of the rehearsal checkpoints and the Director's sign-off. With
 * `canSignOff` the Director can sign (blocked while anything Needs Attention) or
 * withdraw a sign-off; otherwise the sign-off status is read-only.
 */
export function RehearsalSummary({ summary, signoff, canSignOff = false, onSignOff, onClearSignoff, busy = false, compact = false }) {
  const [note, setNote] = useState('')
  const [showGrid, setShowGrid] = useState(!compact)
  const { counts, total, attention, fixed } = summary
  const checked = total - counts.pending
  const current = signoff && signoff.signature === summary.signature
  const canSign = canSignOff && total > 0 && counts.attention === 0

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-300">Rehearsal summary</p>
          <p className="text-xs text-slate-400">Up to the Invocation prayer · Audio, Video, Lights, Presentation slides, Live Stream</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold tabular-nums">
          <span className="rounded-md bg-emerald-500/15 text-emerald-300 px-2 py-1">{counts.good} All Good</span>
          <span className="rounded-md bg-sky-500/15 text-sky-300 px-2 py-1">{counts.fixed} Fixed</span>
          <span className={`rounded-md px-2 py-1 ${counts.attention ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{counts.attention} Needs Attention</span>
          <span className="rounded-md bg-slate-800 text-slate-400 px-2 py-1">{counts.pending} Not checked</span>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
        {total > 0 && (
          <>
            <div className="h-full bg-emerald-500" style={{ width: `${(counts.good / total) * 100}%` }} />
            <div className="h-full bg-sky-500" style={{ width: `${(counts.fixed / total) * 100}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${(counts.attention / total) * 100}%` }} />
          </>
        )}
      </div>

      {total === 0 && <p className="text-sm text-slate-400">No run-sheet items to verify yet.</p>}

      {attention.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300 mb-1.5">Needs attention ({attention.length})</p>
          <ul className="space-y-1.5">{attention.map((s) => <IssueLine key={s.key} s={s} />)}</ul>
        </div>
      )}
      {fixed.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-300 mb-1.5">Fixed during rehearsal ({fixed.length})</p>
          <ul className="space-y-1.5">{fixed.map((s) => <IssueLine key={s.key} s={s} />)}</ul>
        </div>
      )}

      {total > 0 && (
        <div>
          <button type="button" onClick={() => setShowGrid((v) => !v)} className="text-xs font-semibold text-slate-400 hover:text-slate-200">
            {showGrid ? 'Hide' : 'Show'} full log ({checked}/{total} checked)
          </button>
          {showGrid && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left font-semibold py-1 pr-2">Item</th>
                    {summary.items[0]?.systems.map((s) => <th key={s.id} className="font-semibold py-1 px-1 text-center">{s.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {summary.items.map((it) => (
                    <tr key={it.program.key} className="border-t border-slate-800">
                      <td className="py-1.5 pr-2 font-semibold text-slate-200">{it.program.name}</td>
                      {it.systems.map((s) => {
                        const st = s.entry?.status
                        return (
                          <td key={s.id} className="py-1.5 px-1 text-center" title={s.entry ? `${statusLabel(st)}${s.entry.note ? ` — ${s.entry.note}` : ''}${s.entry.by ? ` · ${s.entry.by}` : ''}` : 'Not checked'}>
                            <span className={st ? TONE[st].text : 'text-slate-600'}>{st ? statusLabel(st) : '—'}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                {current ? 'Signed off — ready for Sunday' : 'Signed off, but checkpoints changed since'}
              </p>
              <p className="text-xs text-slate-400">
                {signoff.name || signoff.by || 'Media Director'} · {new Date(signoff.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              </p>
              {signoff.note && <p className="text-xs text-slate-300 mt-1">{signoff.note}</p>}
              {!current && <p className="text-xs text-amber-200/80 mt-1">The Media Director should review and sign off again.</p>}
            </div>
            {canSignOff && (
              <button type="button" disabled={busy} onClick={onClearSignoff} className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-60">Withdraw</button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-5 h-5 text-slate-500 shrink-0" />
            <p className="text-slate-300">
              Not signed off yet.{!canSignOff && <span className="text-slate-500"> The Media Director signs off in the app: Media → Upcoming Sunday → Control Center.</span>}
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
              {counts.attention > 0 && <span className="text-xs text-amber-300">Resolve or mark Fixed every “Needs Attention” item first.</span>}
              {counts.attention === 0 && counts.pending > 0 && <span className="text-xs text-slate-400">{counts.pending} checkpoint{counts.pending === 1 ? '' : 's'} not checked.</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

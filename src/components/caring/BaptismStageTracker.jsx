import { resolveBaptismStages, baptismStageSummary } from '../../utils/baptismProgress'

const DOT = {
  done: 'bg-emerald-500 border-emerald-500 text-white',
  current: 'bg-white border-amber-400 text-amber-700',
  blocked: 'bg-red-50 border-red-400 text-red-700',
  waiting: 'bg-white border-slate-200 text-slate-300',
}
const LABEL = { done: 'text-emerald-700', current: 'text-amber-800', blocked: 'text-red-700', waiting: 'text-slate-400' }

/**
 * Baptism Application → Cell Leader Sign-off → MCQ Exam progress.
 * compact: one line of three pills (Applications queue rows). Otherwise a stepper
 * with each stage's note (staff modal, PCS profile).
 */
export default function BaptismStageTracker({ app, compact = false }) {
  const stages = resolveBaptismStages(app)
  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1" title={baptismStageSummary(app)}>
        {stages.map((s) => (
          <span key={s.key} title={s.note || s.label}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${s.state === 'done' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : s.state === 'blocked' ? 'bg-red-50 border-red-200 text-red-700' : s.state === 'current' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
            {s.state === 'done' ? '✓' : s.state === 'blocked' ? '!' : s.n} {s.label.replace(' Sign-off', '')}
          </span>
        ))}
      </span>
    )
  }
  const done = stages.filter((s) => s.state === 'done').length
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Baptism progress</p>
        <p className="text-[11px] font-semibold text-slate-500">{baptismStageSummary(app)}</p>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${(done / stages.length) * 100}%` }} />
      </div>
      <ol className="grid grid-cols-3 gap-2">
        {stages.map((s) => (
          <li key={s.key} className="min-w-0 flex flex-col items-center text-center">
            <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-black ${DOT[s.state]}`}>
              {s.state === 'done' ? '✓' : s.state === 'blocked' ? '!' : s.n}
            </span>
            <span className={`mt-1 text-[11px] font-bold leading-tight ${LABEL[s.state]}`}>{s.label}</span>
            {s.note && <span className="text-[10px] text-slate-500 leading-tight mt-0.5 break-words">{s.note}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

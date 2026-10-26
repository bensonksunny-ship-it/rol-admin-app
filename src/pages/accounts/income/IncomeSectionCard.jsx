import { useEffect } from 'react'
import { format } from 'date-fns'
import { Maximize2, X } from 'lucide-react'
import { ACCENT_STYLES, toDate } from './incomeCategorize'
import { SaveStatus } from './gridKit'
import { fmtAmount } from './gridUtils'

// View-only summary card for one Income section on the main grid: total, entry
// count, latest date and an optional breakdown. Clicking anywhere on it opens the
// section's editing table in IncomeSectionModal.
export function IncomeSectionCard({ title, accent = 'indigo', entries, breakdown, saveState, onOpen }) {
  const styles = ACCENT_STYLES[accent]
  const total = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const latest = entries.reduce((m, e) => { const d = toDate(e.date); return !m || d > m ? d : m }, null)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${title}`}
      className={`group text-left bg-white rounded-2xl border border-slate-200 border-t-4 ${styles.accentBorder} shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all px-4 py-3 flex flex-col gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full ${styles.dot} shrink-0`} />
          <h3 className="text-sm font-semibold text-slate-700 truncate">{title}</h3>
        </div>
        <Maximize2 size={13} className="text-slate-300 group-hover:text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
      </div>
      <p className={`text-xl font-bold tabular-nums ${styles.text}`}>₹{fmtAmount(total)}</p>
      {breakdown?.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          {breakdown.map(b => <span key={b.label}>{b.label} <span className="font-semibold text-slate-700 tabular-nums">₹{fmtAmount(b.amount)}</span></span>)}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          {latest ? ` · last ${format(latest, 'd MMM')}` : ''}
        </span>
        <SaveStatus state={saveState} />
      </div>
    </button>
  )
}

// Large popup holding one section's editing table. Esc closes it unless a cell is
// being edited (there Esc reverts the cell) or a paste review is open on top.
export function IncomeSectionModal({ title, monthLabel, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return
      if (document.querySelector('[data-row-menu-overlay], [data-paste-review]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[900] flex items-start sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-2 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={`${title} — ${monthLabel}`}
        className="w-full max-w-5xl max-h-[94vh] flex flex-col rounded-2xl bg-slate-50 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-slate-800 truncate">{title}</p>
            <p className="text-xs text-slate-500">{monthLabel} · edits save as you leave each cell · paste rows from Excel with Ctrl+V</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

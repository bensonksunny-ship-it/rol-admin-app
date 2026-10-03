import { Check, Loader2, X } from 'lucide-react'

// Footer of an Income card in edit mode: saves only that card's changed rows
// (IncomePage.handleSaveSection), independent of every other card.
export default function SectionSaveBar({ title, dirtyCount, saving, onSave, onCancel }) {
  return (
    <div
      onClick={e => e.stopPropagation()}
      className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-200 bg-slate-50 cursor-default"
    >
      <p className="text-[11px] text-slate-500">
        {dirtyCount
          ? `${dirtyCount} unsaved ${dirtyCount === 1 ? 'change' : 'changes'}`
          : 'No changes yet'}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 text-xs font-medium shadow-sm disabled:opacity-50 transition-colors"
        >
          <X size={13} /> Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirtyCount}
          aria-label={`Save ${title}`}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

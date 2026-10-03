import { Check, CheckCircle2, Loader2, Save, X } from 'lucide-react'

// Card-header half of the per-section save: an "N unsaved" badge + Save (disk)
// icon while editing, and a brief "Saved" badge after this card's save succeeds.
// Same handler as the footer bar's Save — both write only this card's changes.
export function SectionHeaderSave({ title, editMode, dirtyCount, saving, justSaved, onSave }) {
  // Always shown (not only in edit mode) so every card visibly has its own Save;
  // it's disabled until this card has unsaved edits.
  return (
    <>
      {justSaved && !editMode && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 text-[11px] font-semibold">
          <CheckCircle2 size={12} /> Saved
        </span>
      )}
      {editMode && dirtyCount > 0 && !saving && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 text-[11px] font-semibold whitespace-nowrap">
          {dirtyCount} unsaved
        </span>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !editMode || !dirtyCount}
        aria-label={`Save ${title}`}
        title={!editMode ? `Click the pencil to edit ${title}, then Save` : (dirtyCount ? `Save ${title}` : 'No changes to save')}
        className="p-1.5 rounded-lg border border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-white disabled:border-slate-200 disabled:text-slate-300 transition-colors"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
      </button>
    </>
  )
}

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

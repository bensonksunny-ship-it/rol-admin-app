export default function RowActionsMenu({ isOpen, onToggle, onEdit, onDelete }) {
  return (
    <div className="relative inline-block text-left" data-row-menu>
      <button
        type="button"
        onClick={onToggle}
        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition leading-none"
        aria-label="Row actions"
      >
        ⋯
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-1 w-32 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-left">
          <button type="button" onClick={onEdit} className="block w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 text-left">Edit</button>
          <button type="button" onClick={onDelete} className="block w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 text-left">Delete</button>
        </div>
      )}
    </div>
  )
}

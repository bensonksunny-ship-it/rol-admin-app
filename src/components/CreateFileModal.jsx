import { useState } from 'react'
import { createPortal } from 'react-dom'

const REMARKS_OPTIONS = ['Active', 'Project Completed', 'Project Withheld', 'Archived']

// Doubles as the New Entry and Edit File forms — `initial.id` present means edit,
// absent means create (mirrors RFFPage's StudentFormModal convention).
export default function CreateFileModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.fileName.trim()) { setError('File name is required.'); return }
    if (!form.slNo.trim()) { setError('SL No is required.'); return }
    setError('')
    setSaving(true)
    try {
      await onSave(form)
    } catch {
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  return createPortal(
    <div data-row-menu-overlay="true" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-800">{form.id ? 'Edit File' : 'New Entry'}</p>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-500">
            SL No
            <input
              type="text"
              value={form.slNo}
              onChange={(e) => set('slNo', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              autoFocus
            />
          </label>

          <label className="block text-xs font-medium text-slate-500">
            File Name
            <input
              type="text"
              value={form.fileName}
              onChange={(e) => set('fileName', e.target.value)}
              placeholder="e.g. ROL's School Of Music V2"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </label>

          <label className="block text-xs font-medium text-slate-500">
            Remarks
            <select
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            >
              {REMARKS_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-500">
            Closing Date
            <input
              type="date"
              value={form.closingDate || ''}
              onChange={(e) => set('closingDate', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </label>
        </div>

        {error && <p className="text-xs font-medium text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
}

import { useState } from 'react'
import { createPortal } from 'react-dom'

// Add/Edit Student modal, shared by RFFHub.jsx and RFFProgramPage.jsx.
// See docs/superpowers/specs/2026-08-26-rff-department-design.md.
export default function StudentFormModal({ initial, programs, onCancel, onSave }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
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
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <p className="text-sm font-semibold text-slate-800">{initial.id ? 'Edit Student' : 'Add Student'}</p>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs font-medium text-slate-500">
            Name
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              autoFocus
            />
          </label>

          <label className="text-xs font-medium text-slate-500">
            Program
            <select
              value={form.programId}
              onChange={(e) => set('programId', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            >
              <option value="">— none —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-500">
            Age / Class
            <input
              type="text"
              value={form.ageOrClass}
              onChange={(e) => set('ageOrClass', e.target.value)}
              placeholder="e.g. Grade 4"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </label>

          <label className="text-xs font-medium text-slate-500">
            Guardian Name
            <input
              type="text"
              value={form.guardianName}
              onChange={(e) => set('guardianName', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </label>

          <label className="text-xs font-medium text-slate-500">
            Guardian Phone
            <input
              type="tel"
              value={form.guardianPhone}
              onChange={(e) => set('guardianPhone', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </label>

          <label className="text-xs font-medium text-slate-500">
            Admission Date
            <input
              type="date"
              value={form.admissionDate}
              onChange={(e) => set('admissionDate', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </label>

          <label className="text-xs font-medium text-slate-500">
            Fee Amount (₹)
            <input
              type="number"
              min="0"
              value={form.feeAmount}
              onChange={(e) => set('feeAmount', e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-500 mt-5">
            <input
              type="checkbox"
              checked={form.feePaid}
              onChange={(e) => set('feePaid', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
            />
            Fee Paid
          </label>

          {form.feePaid && (
            <label className="col-span-2 text-xs font-medium text-slate-500">
              Fee Paid Date
              <input
                type="date"
                value={form.feePaidDate}
                onChange={(e) => set('feePaidDate', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              />
            </label>
          )}
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

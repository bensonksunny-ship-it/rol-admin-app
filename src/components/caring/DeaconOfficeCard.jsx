import { useState } from 'react'
import { setPCSDeaconOffice } from '../../services/firestore'
import { DEACON_STATUSES, deaconStatusOf, deaconSummary, deaconBadgeText } from '../../utils/deaconOffice'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * PCS profile → Deacon Office. Everyone sees the status line; only the Founder /
 * Senior Pastor (`canManage`) get Appoint / Edit / End controls. Saves straight to
 * caring_pcs.deaconOffice, separate from the profile form's own Save.
 */
export default function DeaconOfficeCard({ entry, canManage, managerName, onSaved }) {
  const office = entry.deaconOffice
  const status = deaconStatusOf(office)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!canManage && status === 'None') return null

  const startEdit = () => {
    setForm({
      status: status === 'None' ? 'Active' : status,
      appointedDate: office?.appointedDate || todayISO(),
      endDate: office?.endDate || (status === 'Active' ? todayISO() : ''),
    })
    setError('')
    setEditing(true)
  }

  const save = async () => {
    setError('')
    if (form.status !== 'None' && !form.appointedDate) { setError('Choose the appointment date.'); return }
    if (form.status === 'Former' && !form.endDate) { setError('Choose the date their tenure ended.'); return }
    if (form.status === 'Former' && form.endDate < form.appointedDate) { setError('The end date is before the appointment date.'); return }
    const next = form.status === 'None'
      ? { isDeacon: false, status: 'None', appointedDate: '', endDate: '', appointedBy: office?.appointedBy || '', updatedBy: managerName, updatedAt: new Date().toISOString() }
      : {
          isDeacon: true,
          status: form.status,
          appointedDate: form.appointedDate,
          endDate: form.status === 'Former' ? form.endDate : '',
          // Who appointed them is kept from the original appointment.
          appointedBy: office?.status && office.status !== 'None' && office.appointedBy ? office.appointedBy : managerName,
          updatedBy: managerName,
          updatedAt: new Date().toISOString(),
        }
    setSaving(true)
    try {
      await setPCSDeaconOffice(entry.id, next)
      onSaved?.(next)
      setEditing(false)
    } catch (err) {
      console.error('setPCSDeaconOffice failed:', err)
      setError(err?.code === 'permission-denied'
        ? 'Not allowed. Only the Founder or the Senior Pastor can change the Deacon Office (or the database rules are not deployed yet).'
        : 'Could not save. Please try again.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200'
  // Live tenure line while editing, in the same wording as the saved summary.
  const preview = form && form.status !== 'None' && form.appointedDate
    ? deaconSummary({ status: form.status, appointedDate: form.appointedDate, endDate: form.status === 'Former' ? form.endDate : '' })
    : ''

  // Everyone else: read-only badge only (nothing at all when not a deacon — see above).
  if (!canManage) {
    return (
      <div className="col-span-2 pt-2 mt-1 border-t border-emerald-100">
        <span title={deaconSummary(office)}
          className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full border ${status === 'Active' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          {deaconBadgeText(office)}
        </span>
      </div>
    )
  }

  return (
    <div className="col-span-2 pt-2.5 mt-1.5 border-t border-emerald-100">
      <p className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-[0.14em]">Deacon Office Management</p>
      {!editing && (
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <p className={`text-[13px] ${status === 'Active' ? 'font-semibold text-indigo-800' : status === 'Former' ? 'text-slate-600' : 'text-slate-400'}`}>
            {deaconSummary(office) || 'Not a Deacon'}
          </p>
          {canManage && (
            <button type="button" onClick={startEdit} className="text-xs font-semibold text-indigo-700 hover:underline">
              {status === 'None' ? 'Appoint as Deacon' : 'Edit'}
            </button>
          )}
        </div>
      )}
      {!editing && office?.appointedBy && status !== 'None' && (
        <p className="text-[10px] text-slate-400 mt-0.5">Appointed by {office.appointedBy}</p>
      )}

      {editing && (
        <div className="mt-1.5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
          <label className="block">
            <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Status</span>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inp}>
              {DEACON_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          {form.status !== 'None' && (
            <div className={`grid gap-2 ${form.status === 'Former' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <label className="block">
                <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Appointed Date</span>
                <input type="date" value={form.appointedDate} max={todayISO()} onChange={(e) => setForm((f) => ({ ...f, appointedDate: e.target.value }))} className={inp} />
              </label>
              {/* End Date only applies to a Former Deacon */}
              {form.status === 'Former' && (
                <label className="block">
                  <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">End Date</span>
                  <input type="date" value={form.endDate} min={form.appointedDate || undefined} max={todayISO()}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={inp} />
                </label>
              )}
            </div>
          )}
          {preview && <p className="text-xs text-slate-600">{preview}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 bg-white">Cancel</button>
            <button type="button" disabled={saving} onClick={save} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-xs font-bold disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Deacon Office'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

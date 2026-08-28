import { calcAttendanceDuration } from '../../utils/cellMemberForm'

// Shared cell-member profile form — the field set used by Shepherd Care's
// add/edit member sheet and by Mid-week Ministry's per-member attendance sheet.
// Extracted from ShepherdView.jsx so both callers render an identical form.
export default function MemberFormFields({ form, onChange }) {
  const set     = (key) => (e) => onChange((f) => ({ ...f, [key]: e.target.value }))
  const duration = calcAttendanceDuration(form.since)

  return (
    <div className="space-y-3">
      {/* Section: Identity */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Personal Details</p>

      <input type="text" value={form.name} onChange={set('name')} placeholder="Full name *" required
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      <div className="grid grid-cols-2 gap-2.5">
        <input type="tel" value={form.phone} onChange={set('phone')} placeholder="Phone number"
          className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <input type="email" value={form.email} onChange={set('email')} placeholder="Email (optional)"
          className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      </div>

      <input type="text" value={form.locality} onChange={set('locality')} placeholder="Locality / Area"
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      <textarea value={form.address} onChange={set('address')} placeholder="Full address (optional)" rows={2}
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      <input type="text" value={form.occupation} onChange={set('occupation')} placeholder="Occupation (optional)"
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      {/* Section: Dates */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Important Dates</p>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="text-xs text-slate-500 font-semibold mb-1 block">🎂 Birthday</label>
          <input type="date" value={form.birthday} onChange={set('birthday')}
            className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-semibold mb-1 block">💍 Anniversary</label>
          <input type="date" value={form.anniversary} onChange={set('anniversary')}
            className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 font-semibold mb-1 block">⏳ Member Since (first attended)</label>
        <input type="date" value={form.since} onChange={set('since')}
          className="w-full px-3 py-2.5 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        {duration && (
          <p className="text-xs text-emerald-600 font-semibold mt-1.5 px-1">
            ✓ Attending for {duration}
          </p>
        )}
      </div>

      {/* Section: Cell Role */}
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-1">Cell Involvement</p>

      <input type="text" value={form.role} onChange={set('role')}
        placeholder="Role in cell (e.g. Host, Worship Lead, Regular Member…)"
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />

      <textarea value={form.notes} onChange={set('notes')}
        placeholder="Shepherd notes (prayer needs, follow-up, concerns…)" rows={3}
        className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300" />
    </div>
  )
}

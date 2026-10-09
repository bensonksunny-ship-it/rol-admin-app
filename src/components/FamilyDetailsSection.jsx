import { emptyFormChild } from '../utils/familyDetails'
import { legalFullName } from '../utils/legalName'

// "Family Details" on the public application forms: spouse and children, each in
// the same First / Middle / Last legal-name boxes as the applicant, pre-filled
// from PCS (see utils/familyDetails.js). The applicant can correct, add or remove
// rows; the office's approval later syncs the result back to the member profile.
export default function FamilyDetailsSection({ value, onChange, showSpouse = true, idPrefix = 'family', title = 'Family Details' }) {
  const set = (patch) => onChange({ ...value, ...patch })
  const setSpouse = (key) => (e) => set({ spouse: { ...value.spouse, [key]: e.target.value } })
  const setChild = (id, key) => (e) => set({ children: value.children.map((c) => (c.id === id ? { ...c, [key]: e.target.value } : c)) })
  const removeChild = (id) => set({ children: value.children.filter((c) => c.id !== id) })
  const addChild = () => set({ children: [...value.children, emptyFormChild()] })

  const box = 'w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300'
  const lbl = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1'
  const nameBoxes = (v, onKey, prefix, requiredMark) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <label className="block" htmlFor={`${prefix}-first`}>
        <span className={lbl}>First Name{requiredMark && <span className="text-amber-600"> *</span>}</span>
        <input id={`${prefix}-first`} autoComplete="off" value={v.firstName || ''} onChange={onKey('firstName')} className={box} />
      </label>
      <label className="block" htmlFor={`${prefix}-middle`}>
        <span className={lbl}>Middle Name</span>
        <input id={`${prefix}-middle`} autoComplete="off" value={v.middleName || ''} onChange={onKey('middleName')} className={box} />
      </label>
      <label className="block" htmlFor={`${prefix}-last`}>
        <span className={lbl}>Last Name / Surname{requiredMark && <span className="text-amber-600"> *</span>}</span>
        <input id={`${prefix}-last`} autoComplete="off" value={v.lastName || ''} onChange={onKey('lastName')} className={box} />
      </label>
    </div>
  )

  return (
    <section>
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-teal-800 border-b-2 border-teal-800 pb-1">{title}</h2>
      <p className="text-xs text-slate-500 mt-2">From the church's records. Please check the names match official documents, and add anyone missing.</p>

      {showSpouse && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-bold text-slate-800">Spouse</p>
          {nameBoxes(value.spouse || {}, setSpouse, `${idPrefix}-spouse`, false)}
          {legalFullName(value.spouse) && <p className="text-xs text-slate-500">Spouse: <b className="text-slate-800">{legalFullName(value.spouse)}</b></p>}
        </div>
      )}

      <div className="mt-5 space-y-3">
        <p className="text-sm font-bold text-slate-800">Children</p>
        {value.children.length === 0 && <p className="text-xs text-slate-400">No children recorded.</p>}
        {value.children.map((c, i) => (
          <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-600">Child {i + 1}{legalFullName(c) ? ` · ${legalFullName(c)}` : ''}</p>
              <button type="button" onClick={() => removeChild(c.id)} className="text-xs font-semibold text-slate-400 hover:text-red-600">Remove</button>
            </div>
            {nameBoxes(c, (key) => setChild(c.id, key), `${idPrefix}-child-${i}`, true)}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={lbl}>Date of Birth</span>
                <input type="date" value={c.dob || ''} onChange={setChild(c.id, 'dob')} className={box} />
              </label>
              <label className="block">
                <span className={lbl}>Gender</span>
                <select value={c.gender || ''} onChange={setChild(c.id, 'gender')} className={box}>
                  <option value="">Select…</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </label>
            </div>
          </div>
        ))}
        <button type="button" onClick={addChild} className="text-sm font-semibold text-blue-700 hover:underline">+ Add Child</button>
      </div>
    </section>
  )
}

import { legalFullName } from '../utils/legalName'
import { childAgeYears } from '../utils/familyDetails'

// "Family Details" on the public application forms — READ-ONLY. Spouse and
// children come straight from the PCS record (application prefill.family, see
// utils/familyDetails.js) and can't be edited by the applicant; changes go through
// the Pastoral Care team. The same snapshot is submitted with the application.
export default function FamilyDetailsSection({ value, showSpouse = true, title = 'Family Details' }) {
  const spouse = legalFullName(value?.spouse || {})
  const children = value?.children || []
  const card = 'bg-slate-50 border border-slate-200 p-3 rounded-lg text-slate-700 font-medium select-none'

  return (
    <section>
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-teal-800 border-b-2 border-teal-800 pb-1">{title}</h2>
      <p className="text-xs text-slate-500 mt-2">From church records. Contact Pastoral Care to update.</p>
      <div className="mt-3 space-y-2" aria-readonly="true">
        {showSpouse && (
          <div className={card}>
            <span className="text-slate-500">Spouse:</span> {spouse || 'None / Not recorded'}
          </div>
        )}
        <div className={card}>
          <span className="text-slate-500">Children:</span>{' '}
          {children.length === 0 ? 'None recorded' : (
            <ul className="mt-1 space-y-0.5">
              {children.map((c) => {
                const age = childAgeYears(c.dob)
                return <li key={c.id}>• {legalFullName(c) || c.name}{age !== null ? ` (${age} yr${age === 1 ? '' : 's'})` : ''}</li>
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

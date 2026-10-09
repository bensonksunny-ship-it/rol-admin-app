import { legalFullName } from '../utils/legalName'

// First / Middle / Last name boxes + "matches my government ID" confirmation, shared
// by the public application forms. `subject="child"` words it for a baby's name.
export default function LegalNameInputGroup({ value, onChange, confirmed, onConfirm, subject = 'self', idPrefix = 'legal' }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value })
  const missing = (key) => !String(value?.[key] || '').trim()
  const cls = (key, required) => `w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${required && missing(key) ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'}`
  const full = legalFullName(value)
  const isChild = subject === 'child'

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-bold text-slate-800">{isChild ? "Child's Legal Name (As Per Birth Certificate)" : 'Legal Name (As Per Government ID Card)'}</p>
        <p className="text-xs text-slate-500 mt-0.5">This name will be printed on official certificates, legal registries and membership documents.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block" htmlFor={`${idPrefix}-first`}>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">First Name <span className="text-amber-600">*</span></span>
          <input id={`${idPrefix}-first`} autoComplete={isChild ? 'off' : 'given-name'} value={value?.firstName || ''} onChange={set('firstName')} className={cls('firstName', true)} />
        </label>
        <label className="block" htmlFor={`${idPrefix}-middle`}>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Middle Name</span>
          <input id={`${idPrefix}-middle`} autoComplete={isChild ? 'off' : 'additional-name'} value={value?.middleName || ''} onChange={set('middleName')} placeholder="e.g., K. / Kanjipuzha" className={cls('middleName', false)} />
        </label>
        <label className="block" htmlFor={`${idPrefix}-last`}>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Last Name / Surname <span className="text-amber-600">*</span></span>
          <input id={`${idPrefix}-last`} autoComplete={isChild ? 'off' : 'family-name'} value={value?.lastName || ''} onChange={set('lastName')} className={cls('lastName', true)} />
        </label>
      </div>
      {full && <p className="text-xs text-slate-500">Will be printed as: <b className="text-slate-800">{full}</b></p>}
      <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 cursor-pointer ${confirmed ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-300 bg-amber-50'}`}>
        <input type="checkbox" checked={!!confirmed} onChange={(e) => onConfirm(e.target.checked)} className="mt-0.5 w-5 h-5 accent-emerald-600 flex-shrink-0" />
        <span className="text-sm text-slate-700 leading-snug">
          {isChild
            ? "I confirm that the child's name above matches the birth certificate and is spelled correctly for official certificates."
            : "I confirm that the name above matches my official government ID (Aadhaar / Passport / Driver's License) and is spelled correctly for official certificates."}
        </span>
      </label>
    </div>
  )
}

// Structured address block — Line 1 / Line 2 / City / State / Pincode — replacing a
// free-text address box on the public application forms.
export default function AddressLineGroup({ value, onChange, label = 'Current Address', idPrefix = 'address' }) {
  const set = (key) => (e) => onChange({ ...value, [key]: key === 'pincode' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value })
  const missing = (key) => key === 'pincode' ? !/^\d{6}$/.test(String(value?.pincode || '')) : !String(value?.[key] || '').trim()
  const cls = (key, required) => `w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${required && missing(key) ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'}`
  const field = (key, text, { required = false, placeholder = '', autoComplete, inputMode, span = '' } = {}) => (
    <label className={`block ${span}`} htmlFor={`${idPrefix}-${key}`}>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{text}{required && <span className="text-amber-600"> *</span>}</span>
      <input id={`${idPrefix}-${key}`} value={value?.[key] || ''} onChange={set(key)} placeholder={placeholder}
        autoComplete={autoComplete} inputMode={inputMode} className={cls(key, required)} />
    </label>
  )
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-slate-800">{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field('line1', 'Address Line 1', { required: true, placeholder: 'Flat / House No., Building Name, Street', autoComplete: 'address-line1', span: 'sm:col-span-2' })}
        {field('line2', 'Address Line 2', { placeholder: 'Landmark, Area / Sector', autoComplete: 'address-line2', span: 'sm:col-span-2' })}
        {field('city', 'City / Town', { required: true, autoComplete: 'address-level2' })}
        {field('state', 'State', { required: true, autoComplete: 'address-level1' })}
        {field('pincode', 'Pincode / Postal Code', { required: true, placeholder: 'e.g. 560102', autoComplete: 'postal-code', inputMode: 'numeric' })}
      </div>
    </div>
  )
}

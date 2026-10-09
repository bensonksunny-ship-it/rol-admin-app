import { useEffect, useRef, useState } from 'react'
import { getDlightMembers, getDepartmentTeamMembers, getDelightVisitors } from '../../services/firestore'
import { getMemberDisplayName } from '../../utils/displayName'

// Standard "How Known / Referred By" answers shown before any D Light names.
const REFERRAL_SYSTEM_OPTIONS = ['Self / Walk-in', 'Social Media / Website', 'Outreach Event', 'Family / Friend']

// D Light people, loaded once per page session and shared by every combobox:
// the D Light members list (dlight_members — needs the Caring read rule), the
// D Light team roster, and D-Light visitor entries. Each source fails soft, so
// a permission gap on one just narrows the list instead of breaking the field.
let cache = null
function loadDlightPeople() {
  if (!cache) {
    cache = Promise.all([
      getDlightMembers().catch(() => []),
      getDepartmentTeamMembers('D Light').catch(() => []),
      getDelightVisitors().catch(() => []),
    ]).then(([members, team, visitors]) => {
      const out = []
      const seen = new Set()
      const push = (p, source, sourceLabel) => {
        const name = String(p.name || '').trim()
        if (!name) return
        const phone = String(p.phone || '').replace(/\D/g, '')
        const key = `${name.toLowerCase()}|${phone.slice(-10)}`
        if (seen.has(key)) return
        seen.add(key)
        out.push({ refId: `${source}:${p.id}`, name, label: getMemberDisplayName(p) || name, phone, sourceLabel })
      }
      team.filter(t => !t.isFormer).forEach(t => push(t, 'dlight_team', 'D Light team'))
      members.forEach(m => push(m, 'dlight_member', 'D Light'))
      visitors.forEach(v => push(v, 'delight_visitor', 'D Light visitor'))
      return out.sort((a, b) => a.label.localeCompare(b.label))
    }).catch(() => [])
  }
  return cache
}

/**
 * Searchable "How Known / Referred By" picker. `value` is the saved text
 * (howKnown); `refId` the linked D Light record ("<source>:<docId>") or ''.
 * Older free-text answers that match nothing still show as the current value.
 * onChange({ name, refId }).
 */
export default function ReferrerCombobox({ value, refId, onChange, className = '' }) {
  const [people, setPeople] = useState([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef(null)

  useEffect(() => { loadDlightPeople().then(setPeople) }, [])
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const systemMatches = REFERRAL_SYSTEM_OPTIONS.filter(o => !q || o.toLowerCase().includes(q))
  const peopleMatches = people.filter(p =>
    !q || p.label.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (qDigits.length >= 3 && p.phone.includes(qDigits))
  ).slice(0, 40)

  const linked = refId ? people.find(p => p.refId === refId) : null
  const isSystem = REFERRAL_SYSTEM_OPTIONS.includes(value)
  const pick = (name, id = '') => { onChange({ name, refId: id }); setOpen(false); setQuery('') }

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`${className} text-left flex items-center gap-2`}>
        <span className={`flex-1 min-w-0 truncate ${value ? 'text-slate-800' : 'text-slate-400'}`}>
          {value || 'Select or search…'}
        </span>
        {value && (linked
          ? <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 flex-shrink-0">{linked.sourceLabel}</span>
          : !isSystem && <span className="text-[9px] font-semibold text-slate-400 flex-shrink-0">earlier entry</span>)}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-slate-400 flex-shrink-0"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 min-w-[240px] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Type a name or phone…"
            className="w-full px-3 py-2 text-sm border-b border-slate-100 focus:outline-none" />
          <div className="max-h-64 overflow-y-auto">
            {systemMatches.map(o => (
              <button key={o} type="button" onMouseDown={() => pick(o)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 ${value === o ? 'font-bold text-indigo-700' : 'text-slate-700'}`}>{o}</button>
            ))}
            {peopleMatches.length > 0 && <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100">Referred by (D Light)</p>}
            {peopleMatches.map(p => (
              <button key={p.refId} type="button" onMouseDown={() => pick(p.label, p.refId)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 flex items-center gap-2 ${refId === p.refId ? 'bg-indigo-50' : ''}`}>
                <span className="font-semibold text-slate-800 flex-1 min-w-0 truncate">{p.label}</span>
                <span className="text-[10px] text-slate-400 flex-shrink-0">({p.sourceLabel}{p.phone ? ` - ${p.phone.slice(-10, -5)}…` : ''})</span>
              </button>
            ))}
            {q && (
              <button type="button" onMouseDown={() => pick(query.trim())}
                className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 border-t border-slate-100">
                Use “{query.trim()}” as typed
              </button>
            )}
            {value && (
              <button type="button" onMouseDown={() => pick('')} className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-t border-slate-100">Clear</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

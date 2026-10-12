import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { RIBBON_BAR } from '../constants/ribbon'

const CARD_TONES = {
  sky: 'bg-sky-50 border-sky-200 text-sky-900',
  amber: 'bg-amber-50 border-amber-200 text-amber-900',
  rose: 'bg-rose-50 border-rose-200 text-rose-900',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
}

const readOpen = (key) => { try { return localStorage.getItem(key) === '1' } catch { return false } }
const writeOpen = (key, v) => { try { localStorage.setItem(key, v ? '1' : '0') } catch { /* storage blocked */ } }

/**
 * Blue ribbon at the top of a department workspace (same shape as the Membership
 * Onboarding Pipeline ribbon): department icon, one-line summary, an "N pending"
 * pill and a chevron. A click expands it in place to the alert cards and their
 * quick actions. Renders nothing when there are no alerts.
 *
 * alerts: [{ id, tone: 'sky'|'amber'|'rose'|'emerald', title, detail?, items?: string[],
 *            count?: number, actions?: [{ label, onClick, primary? }] }]
 */
export default function DepartmentNotificationRibbon({ icon: Icon, departmentName, alerts, storageKey }) {
  const key = `rol.deptRibbon.open.${storageKey || departmentName || 'dept'}`
  const [open, setOpenState] = useState(() => readOpen(key))
  const setOpen = (v) => { setOpenState(v); writeOpen(key, v) }
  if (!alerts?.length) return null

  const pending = alerts.reduce((sum, a) => sum + (a.count ?? 1), 0)
  const summary = alerts.length === 1 ? alerts[0].title : `${alerts[0].title} · +${alerts.length - 1} more`
  const toggle = () => setOpen(!open)

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${open ? 'bg-white border-slate-200' : 'border-transparent'}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${departmentName || 'Department'} notifications: ${summary}`}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        className={`${RIBBON_BAR} cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80`}
      >
        {Icon && (
          <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <span className="flex-1 min-w-0 text-sm font-bold truncate">{summary}</span>
        <span className="flex-shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white whitespace-nowrap">{pending} pending</span>
        <ChevronDown size={18} aria-hidden="true" className={`flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>

      {/* grid-rows 0fr → 1fr gives a smooth height animation without measuring. */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="p-3 grid gap-3 sm:grid-cols-2">
            {alerts.map((a) => (
              <div key={a.id} className={`rounded-xl border p-3 flex flex-col min-w-0 ${CARD_TONES[a.tone] || CARD_TONES.sky}`}>
                <p className="text-sm font-semibold break-words">{a.title}</p>
                {a.detail && <p className="text-xs opacity-80 mt-0.5 break-words">{a.detail}</p>}
                {a.items?.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {a.items.slice(0, 8).map((it) => (
                      <li key={it} className="text-xs px-2 py-0.5 rounded-full bg-white/80 border border-black/5">{it}</li>
                    ))}
                    {a.items.length > 8 && <li className="text-xs px-2 py-0.5 opacity-70">+{a.items.length - 8} more</li>}
                  </ul>
                )}
                {a.actions?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.actions.map((act) => (
                      <button
                        key={act.label}
                        type="button"
                        onClick={act.onClick}
                        className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                          act.primary ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {act.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

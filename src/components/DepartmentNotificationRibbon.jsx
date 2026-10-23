import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import { RIBBON_BAR, ribbonTone } from '../constants/ribbon'

const CARD_TONES = {
  sky: 'bg-sky-50 border-sky-200 text-sky-900',
  amber: 'bg-amber-50 border-amber-200 text-amber-900',
  rose: 'bg-rose-50 border-rose-200 text-rose-900',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
}

const readOpen = (key) => { try { return localStorage.getItem(key) === '1' } catch { return false } }
const writeOpen = (key, v) => { try { localStorage.setItem(key, v ? '1' : '0') } catch { /* storage blocked */ } }

// The alert cards + quick actions — shown inline under the bar on a department page,
// or inside the popup when the ribbon is used with `asModal` (My Workspace).
// onAction runs after an action's own handler (the popup uses it to close itself).
function AlertCards({ alerts, onAction }) {
  return (
    <div className={`p-3 grid gap-3 ${alerts.length > 1 ? 'sm:grid-cols-2' : ''}`}>
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
                  onClick={() => { act.onClick(); onAction?.() }}
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
  )
}

/**
 * Ribbons at the top of a department workspace (same shape as the Membership
 * Onboarding Pipeline ribbon) — one ribbon per alert, stacked, rather than every
 * alert folded into a single bar. Renders nothing when there are no alerts.
 * Each ribbon's colour follows its alert's `category` (see RIBBON_CATEGORY_TONE):
 * blue for action & roster items, amber with dark text for alerts & submissions.
 *
 * alerts: [{ id, category?: 'roster'|'meeting'|'task'|'member_added'|'expense_approval'|'general_alert',
 *            tone: 'sky'|'amber'|'rose'|'emerald', title, detail?, items?: string[],
 *            count?: number, actions?: [{ label, onClick, primary? }] }]
 * category: fallback for alerts that don't set their own.
 */
export default function DepartmentNotificationRibbon({ alerts, storageKey, departmentName, category, ...rest }) {
  if (!alerts?.length) return null
  const base = storageKey || departmentName || 'dept'
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <AlertRibbon key={a.id} {...rest} departmentName={departmentName} alerts={[a]} storageKey={`${base}.${a.id}`}
          category={a.category || category} />
      ))}
    </div>
  )
}

/**
 * One ribbon: department icon, one-line summary, an "N pending" pill and a
 * chevron. A click expands it in place to its alert card and quick actions — or,
 * with `asModal`, opens it in a popup instead (My Workspace, where several
 * departments' ribbons stack and inline expansion would push the rest of the
 * page around).
 */
function AlertRibbon({ icon: Icon, departmentName, alerts, storageKey, category, asModal = false }) {
  const tone = ribbonTone(category)
  const key = `rol.deptRibbon.open.${storageKey || departmentName || 'dept'}`
  const [open, setOpenState] = useState(() => (asModal ? false : readOpen(key)))
  const setOpen = (v) => { setOpenState(v); if (!asModal) writeOpen(key, v) }

  useEffect(() => {
    if (!asModal || !open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpenState(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [asModal, open])

  if (!alerts?.length) return null

  const pending = alerts.reduce((sum, a) => sum + (a.count ?? 1), 0)
  const summary = alerts.length === 1 ? alerts[0].title : `${alerts[0].title} · +${alerts.length - 1} more`
  const toggle = () => setOpen(!open)
  const close = () => setOpenState(false)
  const inlineOpen = open && !asModal

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${inlineOpen ? 'bg-white border-slate-200' : 'border-transparent'}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-haspopup={asModal ? 'dialog' : undefined}
        aria-label={`${departmentName || 'Department'} notifications: ${summary}`}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        className={`${RIBBON_BAR} cursor-pointer ${tone.bar} transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset ${tone.ring}`}
      >
        {Icon && (
          <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <span className="flex-1 min-w-0 text-sm font-bold truncate">{summary}</span>
        <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${tone.badge}`}>{pending} pending</span>
        {asModal ? (
          <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap ${tone.primary}`}>View</span>
        ) : (
          <ChevronDown size={18} aria-hidden="true" className={`flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </div>

      {!asModal && (
        // grid-rows 0fr → 1fr gives a smooth height animation without measuring.
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <AlertCards alerts={alerts} />
          </div>
        </div>
      )}

      {/* Popup variant: backdrop click, Esc, the X, or any quick action closes it. */}
      {asModal && open && createPortal(
        <div
          className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${departmentName || 'Department'} notifications`}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className={`flex items-center gap-3 px-4 py-3 shrink-0 ${tone.head}`}>
              {Icon && (
                <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                  <Icon size={16} strokeWidth={2} aria-hidden="true" />
                </span>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold truncate">{departmentName || 'Department'} notifications</h2>
                <p className={`text-xs ${tone.sub}`}>{pending} pending</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto">
              <AlertCards alerts={alerts} onAction={close} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

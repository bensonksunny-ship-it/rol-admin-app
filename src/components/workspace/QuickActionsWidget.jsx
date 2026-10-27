import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, SlidersHorizontal, Plus, Check, X, PenLine, CalendarCheck, Music2, FileText, ClipboardList, BarChart3,
  HeartHandshake, CalendarDays, Users, History, CalendarClock, Banknote, Receipt, Contact, CalendarHeart,
  UserPlus, CheckSquare, BookUser,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentByName, displayDeptName } from '../../constants/departments'
import { getDepartmentSubpages, myDepartmentNames, getDepartmentNavPath } from '../../utils/departmentSubpages'
import { getDepartmentRole } from '../../utils/access'
import { canAccessWeeklyEntryOnly, ACCOUNTS_ENTRY_BASE_PATH, isSundayCashCounter, SUNDAY_CASH_COUNT_PATH } from '../../utils/accountsEntryAccess'
import { updateUser } from '../../services/firestore'

// Action buttons cycle through these tints by position, so neighbouring buttons
// read as distinct actions. Every class is a literal so Tailwind keeps it. tile: rest + hover tint, glow and ring · tileIcon: solid chip.
const TILE_TINTS = [
  {
    tile: 'bg-indigo-50 border-indigo-200 text-indigo-900 hover:bg-indigo-100 hover:border-indigo-400 hover:shadow-[0_8px_24px_-8px_rgba(99,102,241,0.5)] focus-visible:ring-indigo-400 dark:bg-indigo-500/15 dark:border-indigo-500/40 dark:text-indigo-100 dark:hover:bg-indigo-500/25',
    tileIcon: 'bg-indigo-500 text-white dark:bg-indigo-500/80',
  },
  {
    tile: 'bg-violet-50 border-violet-200 text-violet-900 hover:bg-violet-100 hover:border-violet-400 hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.5)] focus-visible:ring-violet-400 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-violet-100 dark:hover:bg-violet-500/25',
    tileIcon: 'bg-violet-500 text-white dark:bg-violet-500/80',
  },
  {
    tile: 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-400 hover:shadow-[0_8px_24px_-8px_rgba(16,185,129,0.5)] focus-visible:ring-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-100 dark:hover:bg-emerald-500/25',
    tileIcon: 'bg-emerald-500 text-white dark:bg-emerald-500/80',
  },
]

// Each person's default quick menu: the handful of things each department does every week, as tab keys of that
// department's hub (see constants/departmentTabs.js) with a mini icon. Every action
// is resolved through getDepartmentSubpages, so it links to the real route and only
// shows when this user can open that tab (e.g. a Cell Leader gets Reports but not Hub).
const WEEKLY_ACTIONS = {
  Worship: { actions: [
    ['assign', 'Assign Roster', CalendarCheck],
    ['practiceRehearsal', 'Practice & Rehearsal', Music2],
    // Applications live in a panel on The Team; the extra query opens it.
    ['theTeam', 'Review Applications', FileText, 'panel=applications'],
  ] },
  Cell: { actions: [
    ['reports', 'Submit Cell Report', ClipboardList],
    ['summary', 'Weekly Attendance', BarChart3],
    ['shepherdCare', 'Shepherd Care', HeartHandshake],
  ] },
  'Sunday Ministry': { actions: [
    ['sunday', 'Sunday Service Plan', CalendarDays],
    ['sundayCrew', 'Assign Sunday Crew', Users],
    ['sundayReportsHistory', 'Sunday Reports', History],
  ] },
  Media: { actions: [
    ['assign', 'Media & Sound Roster', CalendarCheck],
    ['upcomingSunday', 'Upcoming Sunday', CalendarClock],
  ] },
  Accounts: { actions: [
    ['income', 'Record Tithes / Income', Banknote],
    ['expense', 'Record Expense', Receipt],
  ] },
  Caring: { actions: [
    ['pcs', 'PCS Records', Contact],
    ['events', 'Caring Events', CalendarHeart],
  ] },
  'D Light': { actions: [
    ['visitorEntry', 'Record Visitors', UserPlus],
    ['assign', 'Assign Team', CalendarCheck],
  ] },
  'River Kids': { actions: [
    ['attendance', 'Kids Attendance', CheckSquare],
    ['register', 'Kids Register', BookUser],
  ] },
}

/**
 * Every page this user can open, grouped by department (Director departments first):
 * the weekly presets above with their own labels, then each remaining hub tab (and a
 * Finance/Operations tab's sub-pages). Ids are `Department|tab` (`|tab/sub` for a
 * sub-page) and are what users/{uid}.workspaceQuickActions stores.
 */
function buildQuickMenuCatalog(userProfile, isFounder) {
  const groups = myDepartmentNames(userProfile, isFounder)
    .sort((a, b) => Number(getDepartmentRole(userProfile, b) === 'DIRECTOR') - Number(getDepartmentRole(userProfile, a) === 'DIRECTOR'))
    .map((name) => {
      const dept = getDepartmentByName(name)
      const subpages = dept ? getDepartmentSubpages(dept.slug, userProfile) : []
      const byKey = new Map(subpages.map((s) => [s.key, s]))
      const items = []
      const defaults = []
      for (const [tab, label, Icon, extraQuery] of WEEKLY_ACTIONS[name]?.actions || []) {
        if (!byKey.has(tab)) continue
        const to = byKey.get(tab).to
        const id = `${name}|${tab}${extraQuery ? `?${extraQuery}` : ''}`
        items.push({ id, label, Icon, to: extraQuery ? `${to}${to.includes('?') ? '&' : '?'}${extraQuery}` : to })
        defaults.push(id)
      }
      for (const s of subpages) {
        if (s.children?.length) {
          for (const c of s.children) items.push({ id: `${name}|${s.key}/${c.key}`, label: `${s.label} · ${c.label}`, Icon: c.Icon || s.Icon, to: c.to })
        } else if (!items.some((it) => it.id === `${name}|${s.key}`)) {
          items.push({ id: `${name}|${s.key}`, label: s.label, Icon: s.Icon, to: s.to })
        }
      }
      // No hub tabs for this user (e.g. a Pre-Service-only Sunday Ministry leader):
      // one action straight to wherever their department tile goes.
      if (!items.length) {
        items.push({ id: `${name}|open`, label: `Open ${displayDeptName(name)}`, Icon: ArrowUpRight, to: getDepartmentNavPath(name, userProfile) })
        defaults.push(`${name}|open`)
      }
      return { name, items, defaults }
    })
  // Standalone pages some positions open without a department hub.
  const extra = []
  if (canAccessWeeklyEntryOnly(userProfile)) extra.push({ id: 'More|weekly-entry', label: 'Finance Assistant', Icon: PenLine, to: `${ACCOUNTS_ENTRY_BASE_PATH}/weekly` })
  if (isSundayCashCounter(userProfile)) extra.push({ id: 'More|cash-count', label: 'Sunday Cash Count', Icon: Banknote, to: SUNDAY_CASH_COUNT_PATH })
  if (extra.length) groups.push({ name: 'More', items: extra, defaults: [] })
  return groups
}

/**
 * My Workspace quick actions: one row of tinted buttons (icon, label, →) per
 * department, linking straight to that department's pages. Each person picks their
 * own with "Customise" (saved on their profile); until they do, the weekly presets
 * show. Rows wrap rather than scroll so no button ends up off-screen.
 */
export default function QuickActionsWidget() {
  const { user, userProfile, isFounder } = useAuth()
  const [editing, setEditing] = useState(false)

  const catalog = useMemo(() => buildQuickMenuCatalog(userProfile, isFounder), [userProfile, isFounder])
  const defaults = useMemo(() => catalog.flatMap((g) => g.defaults), [catalog])
  const saved = Array.isArray(userProfile?.workspaceQuickActions) ? userProfile.workspaceQuickActions : null
  const chosen = new Set(saved ?? defaults)

  if (!catalog.length) return null

  const rows = catalog
    .map((g) => ({ name: g.name, actions: g.items.filter((it) => chosen.has(it.id)) }))
    .filter((r) => r.actions.length)

  const customise = (
    <button type="button" onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm font-medium hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800">
      {rows.length ? <SlidersHorizontal size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
      {rows.length ? 'Customise' : 'Add quick menus'}
    </button>
  )

  return (
    <div className="space-y-2">
      {rows.map(({ name, actions }, rowIdx) => (
        <nav key={name} aria-label={`${name} quick actions`} className="flex flex-wrap gap-2">
          {actions.map(({ id, label, Icon, to }, i) => {
            const tint = TILE_TINTS[i % TILE_TINTS.length]
            return (
              <Link key={id} to={to}
                className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${tint.tile}`}>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${tint.tileIcon}`}>
                  {Icon ? <Icon size={15} strokeWidth={2} /> : null}
                </span>
                <span className="text-sm font-semibold whitespace-nowrap">{label}</span>
                <ArrowRight size={15} aria-hidden="true"
                  className="shrink-0 opacity-40 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
              </Link>
            )
          })}
          {rowIdx === rows.length - 1 && customise}
        </nav>
      ))}
      {!rows.length && <div className="flex">{customise}</div>}
      {editing && (
        <QuickMenuEditor catalog={catalog} initial={[...chosen]} defaults={defaults}
          onClose={() => setEditing(false)}
          onSave={(ids) => updateUser(user?.uid || userProfile?.id, { workspaceQuickActions: ids })} />
      )}
    </div>
  )
}

/** Popup listing every page of the user's departments as toggle chips. */
function QuickMenuEditor({ catalog, initial, defaults, onClose, onSave }) {
  const [picked, setPicked] = useState(() => new Set(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      // Kept in catalog order, so the buttons line up the way the popup lists them.
      await onSave(catalog.flatMap((g) => g.items.map((it) => it.id)).filter((id) => picked.has(id)))
      onClose()
    } catch (e) {
      console.error('Save quick menu', e)
      setError('Could not save. Please try again.')
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Customise quick menu" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Your quick menu</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Pick the pages you want as buttons on My Workspace.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {catalog.map((g) => (
            <section key={g.name}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">{g.name === 'More' ? 'More' : displayDeptName(g.name)}</h3>
              <div className="flex flex-wrap gap-2">
                {g.items.map(({ id, label, Icon }) => {
                  const on = picked.has(id)
                  return (
                    <button key={id} type="button" onClick={() => toggle(id)} aria-pressed={on}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors ${on
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-800 dark:bg-indigo-500/20 dark:border-indigo-500/50 dark:text-indigo-100'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                      {on ? <Check size={14} className="text-indigo-600 dark:text-indigo-300" /> : (Icon ? <Icon size={14} className="text-slate-400" /> : null)}
                      {label}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onClick={() => setPicked(new Set(defaults))} className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:underline">
            Reset to default
          </button>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
            <button type="button" onClick={save} disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60">
              {saving ? 'Saving…' : `Save (${picked.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

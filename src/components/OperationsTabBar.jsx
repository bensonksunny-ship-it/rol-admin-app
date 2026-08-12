/** On-page horizontal sub-nav for the Operations tab, mirroring FinanceTabBar's
 * shape/styling — replacing the dock's floating popover as the primary way to
 * switch between Team/Planning/Sub-Department while already on the page.
 *
 * Unlike FinanceTabBar, `tabs` here are the objects getOperationsChildren(slug)
 * already returns ({ key, label, Icon }), rendered directly rather than looked up
 * from a second hardcoded label/icon map — that map already has a per-department
 * override (D-Light's "Sub Dept"), so a second copy here would just be a second
 * place for that override to drift out of sync. */
export default function OperationsTabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-hide">
      {tabs.map((tab) => {
        const { key, label, Icon } = tab
        const isActive = active === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              isActive
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

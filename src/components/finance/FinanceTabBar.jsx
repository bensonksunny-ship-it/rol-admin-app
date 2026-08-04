import { CreditCard, Wallet, Banknote, Building2 } from 'lucide-react'

const TAB_META = {
  expense:        { label: 'Expense',         Icon: CreditCard },
  budget:         { label: 'Budget',          Icon: Wallet },
  payout:         { label: 'Payout Request',  Icon: Banknote },
  addDepartments: { label: 'Add Departments', Icon: Building2 },
}

/** On-page horizontal sub-nav for the Finance tab, replacing the dock's floating
 * popover as the primary way to switch between Expense/Budget/Payout while already
 * on the page — the dock's Finance drill-down still works as an outside entry point. */
export default function FinanceTabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-hide">
      {tabs.map((key) => {
        const meta = TAB_META[key]
        if (!meta) return null
        const isActive = active === key
        const { Icon } = meta
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
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}

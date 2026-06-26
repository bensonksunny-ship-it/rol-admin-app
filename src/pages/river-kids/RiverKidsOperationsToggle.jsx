export default function RiverKidsOperationsToggle({ value, onChange }) {
  const options = [
    { key: 'expense',       label: 'Expense'        },
    { key: 'subDepartment', label: 'Sub Department' },
    { key: 'team',          label: 'Team'           },
    { key: 'planning',      label: 'Planning'       },
    { key: 'financial',     label: 'Budget'         },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-2">
        Operations
      </span>
      {options.map((o) => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded border transition ${
              active
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-indigo-700'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

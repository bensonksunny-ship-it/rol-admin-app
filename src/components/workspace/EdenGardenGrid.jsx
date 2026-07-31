import { useNavigate } from 'react-router-dom'
import { DEPARTMENT_LIST, getDepartmentPath, getDepartmentIcon } from '../../constants/departments'

function displayDeptName(deptName) {
  if (deptName === 'Event M') return 'Event Management'
  return deptName
}

// iOS-Home-Screen-style grid of every department — the Founder's "Eden Garden"
// dashboard. Unlike DepartmentDock (which only lists the signed-in user's own
// departments), Founder has access to everything, so this always lists the full
// DEPARTMENT_LIST.
export default function EdenGardenGrid() {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-x-3 gap-y-5">
      {DEPARTMENT_LIST.map((dept) => {
        const Icon = getDepartmentIcon(dept.name)
        return (
          <button
            key={dept.slug}
            type="button"
            onClick={() => navigate(getDepartmentPath(dept.name))}
            className="group flex flex-col items-center gap-1.5"
          >
            <span
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-transform duration-150 group-hover:-translate-y-0.5 group-active:scale-90"
              style={{
                background: 'linear-gradient(135deg, #6357c9 0%, #8b7ff0 100%)',
                boxShadow: '0 4px 14px rgba(99,87,201,0.35)',
              }}
            >
              <Icon size={26} className="text-white" strokeWidth={1.75} />
            </span>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 text-center leading-tight">
              {displayDeptName(dept.name)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

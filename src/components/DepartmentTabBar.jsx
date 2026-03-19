import { Link } from 'react-router-dom'
import { getDepartmentHubTabs } from '../constants/departmentTabs'

/**
 * Returns the tab list for a department slug (same logic as DepartmentHub).
 */
export function getTabsForSlug(slug) {
  return getDepartmentHubTabs(slug)
}

function getTabLabel(tab) {
  switch (tab) {
    case 'summary':
      return 'Summary'
    case 'team':
      return 'Team'
    case 'planning':
      return 'Planning'
    case 'financial':
      return 'Budget'
    case 'cellGroups':
      return 'Cell Groups'
    case 'cellReport':
      return 'Cell Report'
    case 'members':
      return 'Members'
    case 'sundayReport':
      return 'Sunday Report'
    case 'sundayProgram':
      return 'Sunday Program'
    case 'subDepartment':
      return 'Sub Department'
    case 'assign':
      return 'Assign team'
    case 'budget':
      return 'Budget & Spending'
    case 'history':
      return 'History'
    case 'entry':
      return 'Entry'
    case 'insights':
      return 'Insights'
    case 'visitorEntry':
      return 'Visitor Entry'
    case 'attendance':
      return 'Attendance'
    case 'events':
      return 'New Event'
    default:
      return tab
  }
}

/**
 * @param {string} slug
 * @param {string} activeTab
 * @param {function} [setActiveTab] - Hub: in-page tabs. Subpages: omit → tabs link to hub with ?tab=
 */
export default function DepartmentTabBar({ slug, activeTab, setActiveTab }) {
  const tabs = getDepartmentHubTabs(slug)
  const hubPath = `/department/${slug}`

  const tabHref = (tab) => `${hubPath}?tab=${encodeURIComponent(tab)}`

  return (
    <div className="sticky top-0 z-40 min-h-[48px] flex flex-wrap items-center gap-2 px-4 py-2 bg-slate-800 text-white border-b border-slate-600 shadow">
      {tabs.map((tab) => {
        const label = getTabLabel(tab)
        const baseClass = 'px-3 py-1.5 text-sm font-medium rounded transition whitespace-nowrap'
        const activeClass = activeTab === tab ? 'bg-indigo-500' : 'hover:bg-slate-600'

        if (tab === 'sundayReport') {
          return (
            <Link
              key={tab}
              to="/department/sunday-ministry/sunday-report"
              className={`${baseClass} ${activeTab === 'sundayReport' ? 'bg-indigo-500' : 'hover:bg-slate-600'}`}
            >
              {label}
            </Link>
          )
        }
        if (tab === 'sundayProgram') {
          return (
            <Link
              key={tab}
              to="/department/sunday-ministry/sunday-program"
              className={`${baseClass} ${activeTab === 'sundayProgram' ? 'bg-indigo-500' : 'hover:bg-slate-600'}`}
            >
              {label}
            </Link>
          )
        }
        if (tab === 'cellReport') {
          return (
            <Link
              key={tab}
              to="/department/cell/cell-report"
              className={`${baseClass} ${activeTab === 'cellReport' ? 'bg-indigo-500' : 'hover:bg-slate-600'}`}
            >
              {label}
            </Link>
          )
        }
        if (setActiveTab) {
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`${baseClass} ${activeClass}`}
            >
              {label}
            </button>
          )
        }
        return (
          <Link key={tab} to={tabHref(tab)} className={`${baseClass} ${activeClass}`}>
            {label}
          </Link>
        )
      })}
      <Link
        to="/departments"
        className="px-3 py-1.5 text-sm font-medium rounded hover:bg-slate-600 transition whitespace-nowrap ml-auto"
      >
        Back to Department
      </Link>
    </div>
  )
}

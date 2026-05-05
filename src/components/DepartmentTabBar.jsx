import { Link } from 'react-router-dom'
import { getDepartmentHubTabs } from '../constants/departmentTabs'
import { ACCOUNTS_ENTRY_BASE_PATH } from '../utils/accountsEntryAccess'
import { visibleCellTabs } from '../utils/cellTabVisibility'

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
    case 'reports':
      return 'Reports'
    case 'leaderEntry':
      return 'Leader Entry'
    case 'operations':
      return 'Operations'
    case 'members':
      return 'Members'
    case 'sundayReport':
      return 'Live Control'
    case 'sundayReportsHistory':
      return 'Reports'
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
      return 'Accounts Entry'
    case 'insights':
      return 'Insights'
    case 'visitorEntry':
      return 'Visitor Entry'
    case 'attendance':
      return 'Attendance'
    case 'events':
      return 'New Event'
    case 'liveControl':
      return 'Live Control'
    default:
      return tab
  }
}

/**
 * @param {string} slug
 * @param {string} activeTab
 * @param {function} [setActiveTab] - Hub: in-page tabs. Subpages: omit → tabs link to hub with ?tab=
 * @param {object} [userProfile] - Required for Cell to filter tabs by role
 */
export default function DepartmentTabBar({ slug, activeTab, setActiveTab, userProfile }) {
  const allTabs = getDepartmentHubTabs(slug)
  const tabs = slug === 'cell' ? visibleCellTabs(userProfile).filter(t => allTabs.includes(t)) : allTabs
  const hubPath = `/department/${slug}`

  const tabHref = (tab) => `${hubPath}?tab=${encodeURIComponent(tab)}`

  return (
    <div className="sticky top-0 z-40 min-h-[48px] flex flex-wrap items-center gap-2 px-4 py-2 bg-white text-slate-900 border-b border-slate-200 shadow-sm">
      {tabs.map((tab) => {
        const label = getTabLabel(tab)
        const baseClass = 'px-3 py-1.5 text-sm font-medium rounded transition whitespace-nowrap border border-transparent'
        const activeClass =
          activeTab === tab
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : 'hover:bg-slate-100 hover:text-indigo-700 border-transparent'

        // Accounts → Entry is a real sub-page (route), not a ?tab= in-page panel.
        if (tab === 'entry' && slug === 'accounts') {
          const to = ACCOUNTS_ENTRY_BASE_PATH
          return (
            <Link
              key={tab}
              to={to}
              className={`${baseClass} ${activeTab === 'entry' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'hover:bg-slate-100 hover:text-indigo-700'}`}
            >
              {label}
            </Link>
          )
        }

        if (tab === 'sundayReport') {
          return (
            <Link
              key={tab}
              to="/department/sunday-ministry/sunday-report"
              className={`${baseClass} ${activeTab === 'sundayReport' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'hover:bg-slate-100 hover:text-indigo-700'}`}
            >
              {label}
            </Link>
          )
        }
        if (tab === 'sundayReportsHistory') {
          return (
            <Link
              key={tab}
              to="/department/sunday-ministry/reports"
              className={`${baseClass} ${activeTab === 'sundayReportsHistory' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'hover:bg-slate-100 hover:text-indigo-700'}`}
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
              className={`${baseClass} ${activeTab === 'sundayProgram' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'hover:bg-slate-100 hover:text-indigo-700'}`}
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
        className="px-3 py-1.5 text-sm font-medium rounded hover:bg-slate-100 transition whitespace-nowrap ml-auto border border-slate-200 hover:border-slate-300"
      >
        Back to Department
      </Link>
    </div>
  )
}

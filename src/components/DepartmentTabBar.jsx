import { Link } from 'react-router-dom'
import { getDepartmentHubTabs } from '../constants/departmentTabs'
import { ACCOUNTS_ENTRY_BASE_PATH } from '../utils/accountsEntryAccess'

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
    case 'cellHistory':
      return 'History'
    case 'shepherd':
      return 'Shepherd'
    case 'midweek':
      return 'Mid-week'
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
 */
export default function DepartmentTabBar({ slug, activeTab, setActiveTab }) {
  const tabs = getDepartmentHubTabs(slug)
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
          const to = `${ACCOUNTS_ENTRY_BASE_PATH}/tally`
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
        if (tab === 'cellReport') {
          return (
            <Link
              key={tab}
              to="/department/cell/cell-report"
              className={`${baseClass} ${activeTab === 'cellReport' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'hover:bg-slate-100 hover:text-indigo-700'}`}
            >
              {label}
            </Link>
          )
        }
        if (tab === 'cellHistory') {
          return (
            <Link
              key={tab}
              to="/department/cell/cell-history"
              className={`${baseClass} ${activeTab === 'cellHistory' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'hover:bg-slate-100 hover:text-indigo-700'}`}
            >
              {label}
            </Link>
          )
        }
        if (tab === 'shepherd') {
          return (
            <Link
              key={tab}
              to="/department/cell/shepherd"
              className={`${baseClass} ${activeTab === 'shepherd' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'hover:bg-slate-100 hover:text-indigo-700'}`}
            >
              {label}
            </Link>
          )
        }
        if (tab === 'midweek') {
          return (
            <Link
              key={tab}
              to="/department/cell/midweek"
              className={`${baseClass} ${activeTab === 'midweek' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'hover:bg-slate-100 hover:text-indigo-700'}`}
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

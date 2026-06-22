import { Link } from 'react-router-dom'
import { getDepartmentHubTabs } from '../constants/departmentTabs'
import { ACCOUNTS_ENTRY_BASE_PATH } from '../utils/accountsEntryAccess'
import { visibleCellTabs } from '../utils/cellTabVisibility'

export function getTabsForSlug(slug) {
  return getDepartmentHubTabs(slug)
}

function getTabLabel(tab) {
  switch (tab) {
    case 'summary':           return 'Hub'
    case 'team':              return 'Team'
    case 'planning':          return 'Planning'
    case 'financial':         return 'Budget'
    case 'cellGroups':        return 'Cell Groups'
    case 'reports':           return 'Reports'
    case 'leaderEntry':       return 'Leader Entry'
    case 'operations':        return 'Operations'
    case 'design':            return 'Design'
    case 'members':           return 'Members'
    case 'dataBackup':        return 'Data Backup'
    case 'sunday':            return 'Sunday'
    case 'sundayReport':      return 'Live Control'
    case 'sundayReportsHistory': return 'Reports'
    case 'sundayProgram':     return 'Program'
    case 'subDepartment':     return 'Sub Dept'
    case 'assign':            return 'Assign'
    case 'theTeam':           return 'The Team'
    case 'practiceRehearsal': return 'Practice'
    case 'archives':          return 'Archives'
    case 'budget':            return 'Budget'
    case 'history':           return 'History'
    case 'entry':             return 'Entry'
    case 'insights':          return 'Insights'
    case 'visitorEntry':      return 'Visitors'
    case 'attendance':        return 'Attendance'
    case 'pcs':               return 'PCS'
    case 'events':            return 'Events'
    case 'liveControl':       return 'Live Control'
    case 'upcomingSunday':    return 'Upcoming Sunday'
    case 'sundayCrew':        return 'Crew'
    default:                  return tab
  }
}

function BoardMeetingIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      {/* Conference table — oval */}
      <ellipse cx="16" cy="22" rx="11" ry="5" stroke="currentColor" strokeWidth="1.6" fill="currentColor" fillOpacity="0.08" />
      {/* 5 people around the table */}
      {/* Top centre */}
      <circle cx="16" cy="10" r="3" fill="currentColor" fillOpacity="0.9" />
      <path d="M12 14.5c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {/* Top left */}
      <circle cx="6" cy="13" r="2.2" fill="currentColor" fillOpacity="0.7" />
      <path d="M3.3 17c0-1.5 1.2-2.7 2.7-2.7s2.7 1.2 2.7 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      {/* Top right */}
      <circle cx="26" cy="13" r="2.2" fill="currentColor" fillOpacity="0.7" />
      <path d="M23.3 17c0-1.5 1.2-2.7 2.7-2.7s2.7 1.2 2.7 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      {/* Bottom left */}
      <circle cx="8" cy="24" r="2" fill="currentColor" fillOpacity="0.6" />
      {/* Bottom right */}
      <circle cx="24" cy="24" r="2" fill="currentColor" fillOpacity="0.6" />
      {/* Presentation screen at top */}
      <rect x="10" y="1" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.12" />
      <line x1="12" y1="3.5" x2="16" y2="3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="12" y1="5.5" x2="19" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="12" y1="7.5" x2="17" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export default function DepartmentTabBar({
  slug,
  activeTab,
  departmentName,
  setActiveTab,
  userProfile,
  boardPointCount = 0,
  onBoardPointsClick,
}) {
  const allTabs = getDepartmentHubTabs(slug)
  const tabs    = slug === 'cell'
    ? visibleCellTabs(userProfile).filter(t => allTabs.includes(t))
    : allTabs
  const hubPath = `/department/${slug}`
  const tabHref = (tab) => `${hubPath}?tab=${encodeURIComponent(tab)}`

  // Active tab: white text + white pill. Inactive: white/60 → white on hover
  const tabCls = (isActive) =>
    `relative flex-shrink-0 flex items-center px-3.5 h-full text-sm whitespace-nowrap transition-colors rounded-md mx-0.5 ` +
    (isActive
      ? 'bg-white/20 text-white font-semibold'
      : 'text-indigo-100 font-medium hover:bg-white/10 hover:text-white')

  const renderTab = (tab) => {
    const label    = getTabLabel(tab)
    const isActive = activeTab === tab
    const cls      = tabCls(isActive)

    if (tab === 'entry' && slug === 'accounts')
      return <Link key={tab} to={ACCOUNTS_ENTRY_BASE_PATH} className={cls}>{label}</Link>
    if (tab === 'sunday')
      return <Link key={tab} to="/department/sunday-ministry/sunday" className={cls}>{label}</Link>
    if (tab === 'sundayReport')
      return <Link key={tab} to="/department/sunday-ministry/sunday-report" className={cls}>{label}</Link>
    if (tab === 'sundayReportsHistory')
      return <Link key={tab} to="/department/sunday-ministry/reports" className={cls}>{label}</Link>
    if (tab === 'sundayProgram')
      return <Link key={tab} to="/department/sunday-ministry/sunday-program" className={cls}>{label}</Link>
    if (tab === 'sundayCrew')
      return <Link key={tab} to="/department/sunday-ministry/crew" className={cls}>{label}</Link>
    if (setActiveTab)
      return (
        <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={cls}>
          {label}
        </button>
      )
    return <Link key={tab} to={tabHref(tab)} className={cls}>{label}</Link>
  }

  const displayName = departmentName || slug.replace(/-/g, ' ')

  return (
    <div
      className="sticky top-0 z-40 shadow-lg"
      style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 60%, #7c3aed 100%)' }}
    >
      {/* ── Department name banner ── */}
      <div className="flex items-center px-4 pt-2.5 pb-1 gap-2">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-indigo-200 flex-shrink-0" aria-hidden>
          <rect x="1" y="5" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5 15V10h6v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1 6L8 1l7 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-[0.15em] truncate">
          Department of {displayName}
        </span>
      </div>

      {/* ── Tab row ── */}
      <div className="flex items-center h-11">

        {/* Scrollable tabs — left/centre */}
        <div className="flex items-center flex-1 overflow-x-auto scrollbar-hide px-2 gap-0 h-full min-w-0">
          {tabs.map(renderTab)}
        </div>

        {/* Board meeting shortcut */}
        {slug !== 'sec-core' && (
          <>
            <div className="w-px h-6 bg-white/20 flex-shrink-0" />
            <button
              type="button"
              onClick={onBoardPointsClick}
              title="Board Meeting Points"
              className="relative flex-shrink-0 flex flex-col items-center justify-center gap-0.5 w-16 h-11 text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all duration-150 group"
            >
              {boardPointCount > 0 && (
                <span className="absolute inset-2 rounded-xl bg-amber-300/15 animate-ping group-hover:hidden" />
              )}
              <span className="relative transition-transform duration-150 group-hover:scale-110 group-hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]">
                <BoardMeetingIcon />
              </span>
              {boardPointCount > 0 && (
                <span className="absolute top-1 right-2 min-w-[17px] h-[17px] bg-amber-400 text-indigo-900 text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none shadow-sm animate-bounce">
                  {boardPointCount > 9 ? '9+' : boardPointCount}
                </span>
              )}
              <span className="text-[9px] font-semibold tracking-wide text-white/50 group-hover:text-white/80 transition-colors leading-none">Board</span>
            </button>
          </>
        )}

        {/* ← Departments — extreme right */}
        <div className="w-px h-6 bg-white/20 flex-shrink-0" />
        <Link
          to="/departments"
          className="flex-shrink-0 flex flex-col items-center justify-center gap-1 w-16 h-11 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 5L9 12l6 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] font-bold tracking-wide leading-none">Depts</span>
        </Link>

      </div>

      {/* Bottom shimmer line */}
      <div className="h-px bg-white/10" />
    </div>
  )
}

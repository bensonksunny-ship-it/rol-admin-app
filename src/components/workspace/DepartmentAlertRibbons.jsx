import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentByName, getDepartmentIcon } from '../../constants/departments'
import { RIBBON_CATEGORY_TONE } from '../../constants/ribbon'
import { myDepartmentNames } from '../../utils/departmentSubpages'
import useDepartmentAlerts from '../../hooks/useDepartmentAlerts'
import DepartmentNotificationRibbon from '../DepartmentNotificationRibbon'

// My Workspace is the main dashboard: only a department's high-level blue action
// ribbons (rosters, meetings, overdue tasks) surface here. Amber operational alerts
// — expenses to approve, overdue cell reports, new team members, finance reminders —
// stay on that department's own page (DepartmentHub / DepartmentWorship).
const isBlueAlert = (a) => RIBBON_CATEGORY_TONE[a.category] === 'blue'

// One department's blue ribbon on My Workspace. The quick action deep-links into
// that department's page (the hub reads ?tab=) instead of switching a tab in place,
// since there are no tabs here. Only the inputs the blue alerts need are passed, so
// the hook skips the roster, cell-report and expense reads that feed amber ones.
function DepartmentAlertRibbon({ name }) {
  const navigate = useNavigate()
  const slug = getDepartmentByName(name)?.slug

  const alerts = useDepartmentAlerts({
    department: name,
    open: { tasks: () => navigate(`/department/${slug}?tab=summary`) },
  }).filter(isBlueAlert)

  return (
    <DepartmentNotificationRibbon
      asModal
      flat
      icon={getDepartmentIcon(name)}
      departmentName={name}
      storageKey={slug}
      alerts={alerts}
    />
  )
}

/**
 * The department pages' blue notification ribbons, surfaced on My Workspace too —
 * one per department this person runs (the same list the department dock shows),
 * each rendering nothing when that department has no blue alerts. Clicking one
 * opens its alerts in a popup. All departments share one grid (`flat`).
 */
export default function DepartmentAlertRibbons() {
  const { userProfile, isFounder } = useAuth()
  const names = myDepartmentNames(userProfile, isFounder).filter((n) => getDepartmentByName(n)?.slug)
  if (!names.length) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-flow-row-dense items-start gap-2 empty:hidden">
      {names.map((n) => <DepartmentAlertRibbon key={n} name={n} />)}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentByName, getDepartmentIcon } from '../../constants/departments'
import { getDepartmentHubTabs } from '../../constants/departmentTabs'
import { myDepartmentNames } from '../../utils/departmentSubpages'
import { subscribeDepartmentTeamMembers, getWorshipTeamMembers } from '../../services/firestore'
import useDepartmentAlerts from '../../hooks/useDepartmentAlerts'
import DepartmentNotificationRibbon from '../DepartmentNotificationRibbon'

// Same roster each department page feeds its ribbon: Worship keeps its musicians in
// worship_team_members (a one-off read there too), everyone else is a live
// department_team_members subscription.
function useDepartmentTeam(name) {
  const [team, setTeam] = useState([])
  useEffect(() => {
    if (name === 'Worship') {
      let cancelled = false
      getWorshipTeamMembers(name).then((list) => { if (!cancelled) setTeam(list) }).catch(() => setTeam([]))
      return () => { cancelled = true }
    }
    return subscribeDepartmentTeamMembers(name, setTeam)
  }, [name])
  return team
}

// One department's blue ribbon on My Workspace. The quick actions deep-link into
// that department's page (the hub reads ?tab= / ?opsSub=) instead of switching a tab
// in place, since there are no tabs here. "Got it" shares the department page's
// localStorage seen-marker, so dismissing it in either place clears both.
function DepartmentAlertRibbon({ name, cell, notif }) {
  const navigate = useNavigate()
  const { isFounder, isSeniorPastor, canManageDepartment } = useAuth()
  const dept = getDepartmentByName(name)
  const slug = dept?.slug
  const team = useDepartmentTeam(name)
  const isWorship = name === 'Worship'
  const tabs = slug ? getDepartmentHubTabs(slug) : []
  const go = (query) => () => navigate(`/department/${slug}?${query}`)

  const alerts = useDepartmentAlerts({
    department: name,
    team,
    cell: name === 'Cell' ? cell : null,
    notif,
    // Same rule as DeptExpenseTab's Confirm/Reject buttons.
    canConfirmExpenses: isFounder || isSeniorPastor || canManageDepartment(name),
    memberNoun: isWorship ? 'worship team member' : 'team member',
    open: {
      team: isWorship ? go('tab=theTeam')
        : tabs.includes('team') ? go('tab=team')
        : tabs.includes('operations') ? go('tab=operations&opsSub=team')
        : null,
      tasks: go('tab=summary'),
      reports: tabs.includes('reports') ? go('tab=reports') : null,
    },
  })

  return (
    <DepartmentNotificationRibbon
      asModal
      icon={getDepartmentIcon(name)}
      departmentName={name}
      storageKey={slug}
      alerts={alerts}
    />
  )
}

/**
 * The department pages' blue notification ribbon (new team members, overdue tasks,
 * overdue cell reports), surfaced on My Workspace too — one per department this
 * person runs (the same list the department dock shows), each rendering nothing
 * when that department has no alerts. Clicking one opens its alerts in a popup.
 */
export default function DepartmentAlertRibbons() {
  const { userProfile, isFounder, isCellDirector } = useAuth()
  const notif = useOutletContext() // MainLayout's bell feed — supplies the finance alerts
  const names = myDepartmentNames(userProfile, isFounder).filter((n) => getDepartmentByName(n)?.slug)
  const cell = { viewAll: isFounder || isCellDirector, myCellIds: [userProfile?.cellGroupId, userProfile?.cellId] }
  if (!names.length) return null
  return (
    <div className="space-y-3 empty:hidden">
      {names.map((n) => <DepartmentAlertRibbon key={n} name={n} cell={cell} notif={notif} />)}
    </div>
  )
}

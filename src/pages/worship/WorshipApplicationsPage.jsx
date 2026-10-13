import { useAuth } from '../../context/AuthContext'
import { getDepartmentRole } from '../../utils/access'
import { hasFullWorshipAccess } from '../../utils/worshipAccess'
import WorshipApplications from './WorshipApplications'
import BackButton from '../../components/BackButton'

const DEPARTMENT = 'Worship'

// Standalone page for the dock's own "Applications" icon — previously a sub-tab
// buried inside Worship's "The Team" tab. Same access tier that used to gate
// reaching that sub-tab at all (Director/Founder/Admin; getAllowedWorshipTabs never
// includes 'theTeam' for Worship Leader/Member), enforced here directly since this
// route no longer goes through DepartmentWorship.jsx's own tab guard.
export default function WorshipApplicationsPage() {
  const { userProfile, isFounder } = useAuth()

  if (!hasFullWorshipAccess(userProfile)) {
    return (
      <div className="p-6 text-slate-600">
        <BackButton fallback="/department/worship" className="-ml-2.5" />
        <p className="mt-2">You do not have access to Worship Applications.</p>
      </div>
    )
  }

  // Matches DepartmentWorship.jsx's own isDirector/canManageWorship exactly, so
  // "+ New Application" and review actions behave identically to before the move.
  const isDirector = getDepartmentRole(userProfile, DEPARTMENT) === 'DIRECTOR'
  const canManageWorship = isDirector || isFounder

  return (
    <div className="space-y-4 pb-10">
      <WorshipApplications
        canManageWorship={canManageWorship}
        userProfile={userProfile}
        backButton={<BackButton fallback="/department/worship" className="-ml-2.5" />}
      />
    </div>
  )
}

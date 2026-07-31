import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentRole } from '../../utils/access'
import { hasFullWorshipAccess } from '../../utils/worshipAccess'
import WorshipApplications from './WorshipApplications'

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
        <Link to="/department/worship" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all">← Worship</Link>
        <p className="mt-4">You do not have access to Worship Applications.</p>
      </div>
    )
  }

  // Matches DepartmentWorship.jsx's own isDirector/canManageWorship exactly, so
  // "+ New Application" and review actions behave identically to before the move.
  const isDirector = getDepartmentRole(userProfile, DEPARTMENT) === 'DIRECTOR'
  const canManageWorship = isDirector || isFounder

  return (
    <div className="space-y-4 pb-10">
      <Link to="/department/worship" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        ← Worship
      </Link>
      <WorshipApplications canManageWorship={canManageWorship} userProfile={userProfile} />
    </div>
  )
}

import { useAuth } from '../context/AuthContext'
import useActionNotifications from '../hooks/useActionNotifications'
import SundayPlanningOverviewCard from '../components/workspace/SundayPlanningOverviewCard'
import MyTasksCard from '../components/workspace/MyTasksCard'
import PendingActionsCard from '../components/workspace/PendingActionsCard'
import DepartmentDock from '../components/workspace/DepartmentDock'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Universal landing page ('/') for every signed-in user — the single home base for
// someone who manages one or several departments/ministries. Notifications and direct
// messages stay reachable from the collapsed icon rail (see Sidebar's IconRail); the
// bottom DepartmentDock covers department navigation on desktop.
export default function MyWorkspace() {
  const { userProfile, isFounder } = useAuth()
  const { notifications, handleNotifAction } = useActionNotifications(userProfile, isFounder)

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      <div>
        <p className="text-slate-400 text-sm font-medium">{greeting()}, {userProfile?.displayName?.split(' ')[0] || 'there'} 👋</p>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">My Workspace</h1>
      </div>

      <SundayPlanningOverviewCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MyTasksCard />
        <PendingActionsCard notifications={notifications} onAction={handleNotifAction} />
      </div>

      {/* Clears the floating department dock so it never overlaps card content. */}
      <div className="hidden lg:block h-16" aria-hidden />

      <DepartmentDock />
    </div>
  )
}

import { useAuth } from '../context/AuthContext'
import useActionNotifications from '../hooks/useActionNotifications'
import WorkspaceHeader from '../components/workspace/WorkspaceHeader'
import ToDoListCard from '../components/workspace/ToDoListCard'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Universal landing page ('/') for every signed-in user — the single home base for
// someone who manages one or several departments/ministries. Department navigation
// lives in the global bottom dock (rendered once from MainLayout, not this page).
// WorkspaceHeader keeps notifications/messages (top bar) — only the sidebar rail was
// simplified down to just the My Workspace shortcut + profile avatar.
export default function MyWorkspace() {
  const { user, userProfile, isFounder } = useAuth()
  const {
    notifications, handleNotifAction, dismissNotification, addNotificationToTodo,
  } = useActionNotifications(userProfile, isFounder, user?.uid)

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-slate-400 text-sm font-medium">{greeting()}, {userProfile?.displayName?.split(' ')[0] || 'there'} 👋</p>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">My Workspace</h1>
        </div>
        <WorkspaceHeader
          notifications={notifications}
          onNotifAction={handleNotifAction}
          onDismissNotification={dismissNotification}
          onAddNotificationToTodo={addNotificationToTodo}
        />
      </div>

      <ToDoListCard />
    </div>
  )
}

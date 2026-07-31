import { useAuth } from '../context/AuthContext'
import useActionNotifications from '../hooks/useActionNotifications'
import WorkspaceHeader from '../components/workspace/WorkspaceHeader'
import ToDoListCard from '../components/workspace/ToDoListCard'
import EdenGardenGrid from '../components/workspace/EdenGardenGrid'
import WorshipWorkspaceWidget from '../components/workspace/WorshipWorkspaceWidget'

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
//
// Visual language ("Modern Soft Warmth"): a warm serif greeting over the app's plain
// background, no boxed container around it — see the design review at
// /workspace-design-concepts for the other two directions this was chosen over.
// Previously this page (and ToDoListCard inside it) each had their own rounded/
// bordered wrapper, which nested a card inside a card; both were flattened to a
// single unified surface (ToDoListCard's own soft glass panel) with no outer box,
// so content rests directly on the page background instead.
export default function MyWorkspace() {
  const { user, userProfile, isFounder } = useAuth()
  const {
    notifications, handleNotifAction, dismissNotification, addNotificationToTodo,
  } = useActionNotifications(userProfile, isFounder, user?.uid)

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#8a8377] dark:text-slate-400">{greeting()}</p>
          <h1
            className="text-[26px] sm:text-[30px] mt-1 leading-tight text-[#2b2620] dark:text-slate-50"
            style={{
              fontFamily: 'Constantia, "Iowan Old Style", "Palatino Linotype", Georgia, serif',
              letterSpacing: '-0.005em',
            }}
          >
            {isFounder ? 'Eden Garden' : (
              <>
                Welcome back, {userProfile?.displayName?.split(' ')[0] || 'there'}{' '}
                <span className="inline-block animate-greeting-wave" style={{ transformOrigin: '70% 70%' }}>👋</span>
              </>
            )}
          </h1>
        </div>
        <WorkspaceHeader
          notifications={notifications}
          onNotifAction={handleNotifAction}
          onDismissNotification={dismissNotification}
          onAddNotificationToTodo={addNotificationToTodo}
        />
      </div>

      {isFounder && <EdenGardenGrid />}
      <ToDoListCard />
      <WorshipWorkspaceWidget />
    </div>
  )
}
